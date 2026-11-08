import { test } from 'node:test'
import assert from 'node:assert/strict'
import { logSocketUrl, logLevelMatches, logFields, requestMetadata, parseLog, pruneLogs, logsInWindow, LOG_RETENTION_MS, type LogEvent } from '../src/lib/logs.ts'

const record = { timestamp: '2026-11-07T12:00:00.123Z', level: 'TRACE', target: 'shadowquic::test', event: 'stream:accepted', fields: { message: 'accepted' }, spans: [{ name: 'request', fields: { req_id: 42 } }] }
function parse(value: unknown, receivedAt = 1000, sequence = 1) { return parseLog(JSON.stringify(value), receivedAt, sequence) as LogEvent }
test('log URL uses the API base, secure transport, and encoded token', () => {
  const backend = { url: 'https://example.test/proxy/api/v1/', secret: 'a&b? c', name: '', interval: 1000 }
  const url = new URL(logSocketUrl(backend, 'http://localhost'))
  assert.equal(logSocketUrl(backend, 'null'), url.href) // single-file dashboards have an opaque origin
  assert.equal(url.protocol, 'wss:')
  assert.equal(url.pathname, '/proxy/api/v1/logs')
  assert.equal(url.searchParams.get('token'), backend.secret)
  assert.equal(logSocketUrl({ ...backend, url: '', secret: '' }, 'http://localhost'), 'ws://localhost/api/v1/logs')
})
test('request correlation uses explicit req_id then innermost span, never generic id', () => {
  assert.equal(parse(record).requestId, '42')
  assert.equal(parse({ ...record, fields: { req_id: '0' } }).requestId, '0')
  assert.equal(parse({ ...record, spans: [...record.spans, { name: 'nested', fields: { req_id: '43' } }] }).requestId, '43')
  assert.equal(parse({ ...record, fields: { id: 7 }, spans: [] }).requestId, null)
  assert.equal(parse({ ...record, event: null }).event, null)
})
test('malformed records and lag notices are distinguished', () => {
  assert.equal(parseLog('{', 0, 0), null)
  assert.equal(parse({ ...record, timestamp: 'invalid' }), null)
  assert.equal(parse({ ...record, fields: null }), null)
  assert.deepEqual(parseLog('{"event":"api:logs_lagged","dropped":15}', 0, 0), { dropped: 15 })
  assert.equal(parseLog('{"event":"api:logs_lagged","dropped":-1}', 0, 0), null)
})
test('retention is bounded by arrival time and capacity, independent of server clock', () => {
  const events = [parse(record, 0, 1), parse(record, LOG_RETENTION_MS, 2), parse(record, LOG_RETENTION_MS + 1, 3)]
  assert.deepEqual(pruneLogs(events, LOG_RETENTION_MS + 1).map(e => e.sequence), [2, 3])
  assert.deepEqual(pruneLogs(events, LOG_RETENTION_MS + 1, 1).map(e => e.sequence), [3])
})
test('windows exclude later arrivals when frozen and match request IDs exactly', () => {
  const events = [parse(record, 100, 1), parse({ ...record, fields: { req_id: 420 } }, 200, 2), parse(record, 300, 3)]
  assert.deepEqual(logsInWindow(events, 250, 200, '42').map(e => e.sequence), [1])
  assert.deepEqual(logsInWindow(events, 300, 100).map(e => e.sequence), [2, 3])
})

test('TCP request headers use retained request and inbound spans without a live connection', () => {
  const accepted = parse({ ...record, spans: [
    { name: 'inbound', fields: { tag: 'mixed-in', req_id: 42 } },
    { name: 'tcp_req', fields: { dst: 'example.com:443', req_id: '42' } },
    { name: 'outbound', fields: { tag: 'must-not-be-inbound', dst: 'proxy.example:443' } },
  ] })
  const routed = parse({ ...record, event: 'routing:outbound_selected', fields: { req_id: 42, dst: 'rewritten.example:443', outbound: 'direct' } })
  assert.deepEqual(requestMetadata([accepted], '42'), { destination: 'example.com:443', protocol: 'TCP', inbound: 'mixed-in', outbound: null })
  assert.deepEqual(requestMetadata([accepted, routed], '42'), { destination: 'rewritten.example:443', protocol: 'TCP', inbound: 'mixed-in', outbound: 'direct' })
  assert.equal(requestMetadata([accepted], '43').destination, null)
  assert.equal(requestMetadata([accepted], null).inbound, null)
})
test('UDP span context and explicit destination fields remain supported', () => {
  const udp = parse({ ...record, spans: [{ name: 'inbound', fields: { tag: 'tun' } }, { name: 'udp_req', fields: { req_id: 42, dst: '[2001:db8::1]:53' } }] })
  assert.deepEqual(requestMetadata([udp], '42'), { destination: '[2001:db8::1]:53', protocol: 'UDP', inbound: 'tun', outbound: null })
  const earlyTcp = parse({ ...record, event: 'socks:tcp_request_accepted', fields: { dst: 'example.com:443' } })
  assert.equal(requestMetadata([earlyTcp], '42').destination, 'example.com:443')
})

test('inline log fields omit the message and preserve tracing-rendered values and falsy values', () => {
  assert.deepEqual(logFields({ message: 'connected', dst: 'example.com:443', elapsed_ms: 0, reused: false, error: null, empty: '', debug: 'Some("value")', detail: { retries: 2 } }), [
    ['dst', 'example.com:443'], ['elapsed_ms', '0'], ['reused', 'false'], ['error', 'null'], ['empty', '""'], ['debug', 'Some("value")'], ['detail', '{"retries":2}'],
  ])
  assert.deepEqual(logFields({ message: 'nothing extra' }), [])
})

test('log level thresholds include all higher severities and normalize case', () => {
  const levels = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR']
  for (let minimum = 0; minimum < levels.length; minimum++) {
    assert.deepEqual(levels.filter(level => logLevelMatches(level, levels[minimum])), levels.slice(minimum))
  }
  assert.equal(logLevelMatches('warn', 'info'), true)
  assert.equal(logLevelMatches('debug', 'INFO'), false)
  assert.equal(logLevelMatches('CUSTOM', ''), true)
  assert.equal(logLevelMatches('CUSTOM', 'INFO'), false)
})
