import type { Connection, Outbound, Snapshot } from './types.ts'

const tags = ['Tokyo · 01', 'Singapore · 01', 'Hong Kong · 01', 'Los Angeles · 01', 'direct']
const latencies = [38, 64, 26, 142, 8]
const domains = ['github.com', 'api.anthropic.com', 'www.youtube.com', 'fonts.googleapis.com', 'registry.npmjs.org', 'cdn.jsdelivr.net', 'www.google.com', 'api.openai.com', 'discord.com', 'images.unsplash.com', 'developer.mozilla.org', 'cloudflare.com']
let selected = tags[0]!
let start = Date.now()
export function demoSelect(value: string) { selected = value }
export function demoProbe(tag: string) {
  return { url: 'http://example.com/', status: 'ok' as const, latency_ms: latencies[tags.indexOf(tag)] ?? 38, measured_at: new Date().toISOString(), error: null }
}
export function demoSnapshot(): Snapshot {
  const elapsed = (Date.now() - start) / 1000
  const outbounds: Outbound[] = tags.map((tag, i) => ({
    tag,
    quality: {
      probe: demoProbe(tag),
      sq_conn_stats: i < 4 ? {
        uplink: { rtt: latencies[i]!, current_mtu: 1400, sent_packets: 32481, lost_packets: 16 },
        downlink: { rtt: latencies[i]! + 2, current_mtu: 1400, sent_packets: 186320, lost_packets: 92 },
        sample_age_ms: 800,
      } : null,
    },
  }))
  outbounds.unshift({ tag: 'Proxy', selector: { selected, outbounds: tags.slice(0, 4) }, quality: { probe: demoProbe(selected), sq_conn_stats: null } })
  const connections: Connection[] = Array.from({ length: 24 }, (_, i) => ({
    id: String(1284 + i), protocol: i % 5 === 0 ? 'udp' : 'tcp', inbound: i % 3 === 0 ? 'tun-in' : 'mixed-in',
    outbound: i % 4 === 0 ? 'direct' : 'Proxy', src: `192.168.1.${i % 3 + 10}:${49152 + i * 7}`,
    dst_ip: i % 2 === 0 ? `104.18.${i + 1}.12` : null, dst_domain: domains[i % domains.length]!, dst_port: 443,
    upload_bytes: 24182 + i * 18793 + Math.floor(elapsed * 420), download_bytes: 394831 + i * 124981 + Math.floor(elapsed * 34980),
    duration_ms: 12000 + i * 18400 + elapsed * 1000, first_response_ms: 28 + i * 3, half_closed: i === 23,
  }))
  return {
    outbounds, connections,
    inbounds: [
      { inbound: 'mixed-in', tcp_download_bytes: 1548407812 + Math.floor(elapsed * 2840000), tcp_upload_bytes: 128421193 + Math.floor(elapsed * 142000), udp_download_bytes: 138492923 + Math.floor(elapsed * 182000), udp_upload_bytes: 28343982 + Math.floor(elapsed * 12000), tcp_conns: 13, udp_conns: 3 },
      { inbound: 'tun-in', tcp_download_bytes: 773432120 + Math.floor(elapsed * 1280000), tcp_upload_bytes: 78421943 + Math.floor(elapsed * 68000), udp_download_bytes: 283829139 + Math.floor(elapsed * 382000), udp_upload_bytes: 11349341 + Math.floor(elapsed * 8000), tcp_conns: 6, udp_conns: 2 },
    ],
    memory: { allocator: 'jemalloc', allocated_bytes: 28472115, active_bytes: 32505856, resident_bytes: 46912512 }, memoryNote: '',
    tokioMetric: { num_workers: 8, num_alive_tasks: 142, global_queue_depth: 0 }, tokioMetricNote: '',
  }
}
export function demoHistory() {
  start = Date.now()
  return Array.from({ length: 60 }, (_, i) => ({ at: Date.now() - (59 - i) * 2000, download: (2.6 + Math.sin(i * .24) * 1.4 + Math.sin(i * 1.7) * .55 + (i > 27 && i < 41 ? 2 : 0)) * 1024 ** 2, upload: (0.3 + Math.sin(i * .35) * .15 + Math.cos(i * 1.2) * .05) * 1024 ** 2 }))
}
