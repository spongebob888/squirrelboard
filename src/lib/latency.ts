import type { Connection, LatencySample } from './types.ts'

export const LATENCY_RETENTION_MS = 30 * 60 * 1000
export const LATENCY_SAMPLE_LIMIT = 10000

interface ObservedSession {
  recorded: boolean
  duration: number | null
  source: string | null
  inbound: string
  protocol: Connection['protocol']
}

// Track active IDs separately from retained samples: an old, long-lived session
// must not get counted again when its sample expires or is evicted by the cap.
export class ConnectionLatencyHistory {
  private active = new Map<string, ObservedSession>()
  private samples: LatencySample[] = []
  private retentionMs: number
  private limit: number

  constructor(retentionMs = LATENCY_RETENTION_MS, limit = LATENCY_SAMPLE_LIMIT) {
    this.retentionMs = retentionMs
    this.limit = limit
  }

  observe(connections: Connection[], at: number): LatencySample[] {
    const active = new Map<string, ObservedSession>()
    for (const connection of connections) {
      const previous = active.get(connection.id) ?? this.active.get(connection.id)
      // IDs are only stable during a manager's lifetime. A reduced duration or
      // changed session identity also detects reuse after a backend restart.
      const reused = previous && (
        (connection.duration_ms != null && previous.duration != null && connection.duration_ms < previous.duration) ||
        (connection.src != null && previous.source != null && connection.src !== previous.source) ||
        connection.inbound !== previous.inbound || connection.protocol !== previous.protocol
      )
      const observation: ObservedSession = previous && !reused ? { ...previous } : {
        recorded: false, duration: null, source: null, inbound: connection.inbound, protocol: connection.protocol,
      }
      const latency = connection.first_response_ms
      if (!observation.recorded && connection.outbound != null && latency != null && Number.isFinite(latency) && latency >= 0) {
        this.samples.push({ outbound: connection.outbound, latency, observedAt: at })
        observation.recorded = true
      }
      observation.duration = connection.duration_ms ?? observation.duration
      observation.source = connection.src ?? observation.source
      active.set(connection.id, observation)
    }
    this.active = active
    return this.prune(at)
  }

  prune(at: number): LatencySample[] {
    this.samples = this.samples.filter(s => at - s.observedAt <= this.retentionMs).slice(-this.limit)
    return [...this.samples]
  }
}

export const LATENCY_BUCKETS = [
  { label: '<25', upper: 25 },
  { label: '25–50', upper: 50 },
  { label: '50–100', upper: 100 },
  { label: '100–200', upper: 200 },
  { label: '200–500', upper: 500 },
  { label: '500–1k', upper: 1000 },
  { label: '≥1k', upper: Infinity },
]

export function latencyDistributions(samples: LatencySample[], outboundTags: string[], since: number) {
  const groups = new Map<string, number[]>(outboundTags.map(tag => [tag, []]))
  for (const sample of samples) {
    if (sample.observedAt < since) continue
    const group = groups.get(sample.outbound) ?? []
    group.push(sample.latency)
    groups.set(sample.outbound, group)
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([outbound, values]) => {
    values.sort((a, b) => a - b)
    const count = values.length
    const buckets = LATENCY_BUCKETS.map(bucket => ({ ...bucket, count: 0, percent: 0 }))
    for (const value of values) buckets.find(bucket => value < bucket.upper)!.count++
    for (const bucket of buckets) bucket.percent = count ? bucket.count / count * 100 : 0
    const middle = Math.floor(count / 2)
    return {
      outbound, count, buckets,
      median: count ? (count % 2 ? values[middle]! : (values[middle - 1]! + values[middle]!) / 2) : null,
      p95: count ? values[Math.ceil(count * .95) - 1]! : null,
      mean: count ? values.reduce((sum, value) => sum + value, 0) / count : null,
    }
  })
}
