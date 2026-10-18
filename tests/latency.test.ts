import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ConnectionLatencyHistory, latencyDistributions } from '../src/lib/latency.ts'
import type { Connection, LatencySample } from '../src/lib/types.ts'

const connection = (overrides: Partial<Connection> = {}): Connection => ({
  id: '1', protocol: 'tcp', inbound: 'mixed', outbound: 'proxy', src: '127.0.0.1:54321',
  dst_ip: null, dst_domain: 'example.com', dst_port: 443, upload_bytes: 10, download_bytes: 20,
  duration_ms: 1000, first_response_ms: 50, half_closed: false, ...overrides,
})

test('polling records one first response per session and retains closed sessions', () => {
  const history = new ConnectionLatencyHistory()
  assert.equal(history.observe([connection()], 1000).length, 1)
  assert.equal(history.observe([connection({ duration_ms: 2000 })], 2000).length, 1)
  const samples = history.observe([], 3000)
  assert.deepEqual(samples, [{ outbound: 'proxy', latency: 50, observedAt: 1000 }])
})

test('pending and unavailable responses are skipped, but a later zero-millisecond response is recorded', () => {
  const history = new ConnectionLatencyHistory()
  assert.equal(history.observe([connection({ first_response_ms: null })], 1000).length, 0)
  assert.equal(history.observe([connection({ first_response_ms: 0, outbound: null })], 2000).length, 0)
  assert.equal(history.observe([connection({ first_response_ms: 0 })], 3000)[0]!.latency, 0)
  assert.equal(history.observe([connection({ first_response_ms: null, outbound: null, half_closed: true })], 4000).length, 1)
})

test('nonfinite and negative latency values never enter the distribution', () => {
  const history = new ConnectionLatencyHistory()
  assert.deepEqual(history.observe([
    connection({ id: '1', first_response_ms: -1 }),
    connection({ id: '2', first_response_ms: NaN }),
    connection({ id: '3', first_response_ms: Infinity }),
  ], 0), [])
})

test('expired and evicted samples are not re-added by long-lived sessions', () => {
  const history = new ConnectionLatencyHistory(1000, 2)
  const connections = [connection({ id: '1' }), connection({ id: '2' }), connection({ id: '3' })]
  assert.equal(history.observe(connections, 0).length, 2)
  assert.equal(history.observe(connections, 500).length, 2)
  assert.equal(history.prune(1001).length, 0)
  assert.equal(history.observe(connections, 2000).length, 0)
})

test('session IDs can be reused after disappearance or a backend restart', () => {
  const history = new ConnectionLatencyHistory()
  history.observe([connection({ duration_ms: 10000 })], 1000)
  assert.equal(history.observe([connection({ duration_ms: 1000 })], 2000).length, 2)
  history.observe([], 3000)
  assert.equal(history.observe([connection()], 4000).length, 3)
})

test('distributions use exact bucket boundaries, rolling windows, and historical outbound tags', () => {
  const values = [0, 25, 49, 50, 99, 100, 199, 200, 499, 500, 999, 1000, 5000]
  const samples: LatencySample[] = values.map(latency => ({ outbound: 'proxy', latency, observedAt: 1000 }))
  samples.push({ outbound: 'proxy', latency: 99999, observedAt: 0 })
  samples.push({ outbound: 'removed-route', latency: 42, observedAt: 1000 })
  const groups = latencyDistributions(samples, ['proxy', 'direct'], 500)
  const proxy = groups.find(g => g.outbound === 'proxy')!
  assert.equal(proxy.count, 13)
  assert.deepEqual(proxy.buckets.map(b => b.count), [1, 2, 2, 2, 2, 2, 2])
  assert.ok(Math.abs(proxy.buckets.reduce((sum, b) => sum + b.percent, 0) - 100) < 1e-10)
  assert.equal(proxy.median, 199)
  assert.equal(proxy.p95, 5000)
  assert.equal(proxy.mean, values.reduce((sum, value) => sum + value, 0) / values.length)
  assert.equal(groups.find(g => g.outbound === 'removed-route')!.count, 1)
  assert.equal(groups.find(g => g.outbound === 'direct')!.median, null)
})

test('median averages the middle pair and P95 uses nearest rank', () => {
  const samples = Array.from({ length: 20 }, (_, i) => ({ outbound: 'proxy', latency: i + 1, observedAt: 0 }))
  const group = latencyDistributions(samples, [], 0)[0]!
  assert.equal(group.median, 10.5)
  assert.equal(group.p95, 19)
})
