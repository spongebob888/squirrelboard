import type { InboundTraffic } from './types.ts'

export function bytes(value: number | null | undefined, precision = 1): string {
  if (value == null || !Number.isFinite(value)) return '—'
  if (value <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  return `${(value / 1024 ** index).toFixed(index ? precision : 0)} ${units[index]}`
}

export function duration(ms: number | null): string {
  if (ms == null) return '—'
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}

export function packetLossRate(lost: number, sent: number): string {
  return sent > 0 ? `${(lost / sent * 100).toFixed(2)}%` : '—'
}

export function totals(inbounds: InboundTraffic[]) {
  return inbounds.reduce((sum, i) => ({
    download: sum.download + i.tcp_download_bytes + i.udp_download_bytes,
    upload: sum.upload + i.tcp_upload_bytes + i.udp_upload_bytes,
    tcp: sum.tcp + i.tcp_conns,
    udp: sum.udp + i.udp_conns,
  }), { download: 0, upload: 0, tcp: 0, udp: 0 })
}

// Compare each counter separately: a restart, reset, or newly added inbound must
// not turn historical bytes into a download-rate spike.
export function rates(previous: InboundTraffic[], current: InboundTraffic[], elapsedMs: number) {
  let download = 0
  let upload = 0
  if (elapsedMs <= 0) return { download, upload }
  for (const inbound of current) {
    const old = previous.find(i => i.inbound === inbound.inbound)
    if (!old) continue
    for (const key of ['tcp_download_bytes', 'udp_download_bytes'] as const) {
      download += Math.max(0, inbound[key] - old[key])
    }
    for (const key of ['tcp_upload_bytes', 'udp_upload_bytes'] as const) {
      upload += Math.max(0, inbound[key] - old[key])
    }
  }
  return { download: download * 1000 / elapsedMs, upload: upload * 1000 / elapsedMs }
}
