import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bytes, duration, rates, totals } from '../src/lib/metrics.ts'
import type { InboundTraffic } from '../src/lib/types.ts'

const inbound = (overrides: Partial<InboundTraffic> = {}): InboundTraffic => ({ inbound: 'mixed', tcp_download_bytes: 1000, tcp_upload_bytes: 100, udp_download_bytes: 500, udp_upload_bytes: 50, tcp_conns: 2, udp_conns: 1, ...overrides })

test('rates use elapsed time and count both protocols', () => {
  assert.deepEqual(rates([inbound()], [inbound({ tcp_download_bytes: 2000, udp_download_bytes: 1500, tcp_upload_bytes: 200, udp_upload_bytes: 150 })], 2000), { download: 1000, upload: 100 })
})
test('counter resets and new inbounds never inflate speed', () => {
  assert.deepEqual(rates([inbound()], [inbound({ tcp_download_bytes: 0, tcp_upload_bytes: 0, udp_download_bytes: 700, udp_upload_bytes: 60 }), inbound({ inbound: 'new', tcp_download_bytes: 1e9 })], 1000), { download: 200, upload: 10 })
  assert.deepEqual(rates([inbound()], [inbound()], 0), { download: 0, upload: 0 })
})
test('traffic totals retain independent session counts', () => {
  assert.deepEqual(totals([inbound(), inbound({ inbound: 'tun' })]), { download: 3000, upload: 300, tcp: 4, udp: 2 })
})
test('null counters remain unknown and display units consistently', () => {
  assert.equal(bytes(null), '—')
  assert.equal(bytes(0), '0 B')
  assert.equal(bytes(1024), '1.0 KB')
  assert.equal(duration(null), '—')
  assert.equal(duration(61000), '1m 1s')
})
