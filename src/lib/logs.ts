import { normalizeBase } from './api.ts'
import type { Backend, Connection } from './types.ts'

export const LOG_RETENTION_MS = 30 * 60_000
export const LOG_CAPACITY = 10_000
export interface LogEvent {
  sequence: number
  receivedAt: number
  at: number
  timestamp: string
  level: string
  target: string
  event: string | null
  fields: Record<string, unknown>
  spans: { name: string; fields: Record<string, unknown> }[]
  requestId: string | null
}
const LOG_LEVEL_RANK: Record<string, number> = { TRACE: 0, DEBUG: 1, INFO: 2, WARN: 3, ERROR: 4 }
export function logLevelMatches(level: string, minimum?: string): boolean {
  if (!minimum) return true
  const rank = LOG_LEVEL_RANK[level.toUpperCase()]
  const threshold = LOG_LEVEL_RANK[minimum.toUpperCase()]
  return rank !== undefined && threshold !== undefined && rank >= threshold
}

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const requestId = (value: unknown): string | null => typeof value === 'string' && value.length > 0 ? value : typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? String(value) : null

export function logSocketUrl(backend: Backend, origin: string): string {
  const base = normalizeBase(backend.url)
  const url = new URL(`${base}/api/v1/logs`, base ? undefined : origin)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  if (backend.secret) url.searchParams.set('token', backend.secret)
  return url.href
}

export function parseLog(text: string, receivedAt: number, sequence: number): LogEvent | { dropped: number } | null {
  if (text.length > 262144) return null
  let value: unknown
  try { value = JSON.parse(text) } catch { return null }
  if (!object(value)) return null
  if (value.event === 'api:logs_lagged') return typeof value.dropped === 'number' && Number.isSafeInteger(value.dropped) && value.dropped >= 0 ? { dropped: value.dropped } : null
  if (typeof value.timestamp !== 'string' || !Number.isFinite(Date.parse(value.timestamp)) || typeof value.level !== 'string' || typeof value.target !== 'string' || !object(value.fields) || !Array.isArray(value.spans)) return null
  const spans = value.spans.filter((span): span is LogEvent['spans'][number] => object(span) && typeof span.name === 'string' && object(span.fields))
  // Explicit fields win, then the innermost request scope. Generic span IDs are unrelated.
  const id = requestId(value.fields.req_id) ?? [...spans].reverse().map(span => requestId(span.fields.req_id)).find(id => id !== null) ?? null
  return { sequence, receivedAt, at: Date.parse(value.timestamp), timestamp: value.timestamp, level: value.level, target: value.target, event: typeof value.event === 'string' ? value.event : null, fields: value.fields, spans, requestId: id }
}

export function pruneLogs(events: LogEvent[], now: number, capacity = LOG_CAPACITY): LogEvent[] {
  return events.filter(event => event.receivedAt >= now - LOG_RETENTION_MS).slice(-capacity)
}

export function logsInWindow(events: LogEvent[], end: number, windowMs: number, id = ''): LogEvent[] {
  return events.filter(event => event.receivedAt >= end - windowMs && event.receivedAt <= end && (!id || event.requestId === id)).sort((a, b) => a.at - b.at || a.sequence - b.sequence)
}

export interface RequestMetadata {
  destination: string | null
  protocol: string | null
  inbound: string | null
  outbound: string | null
}

/** Request context survives short-lived connections through their captured spans. */
export function requestMetadata(events: LogEvent[], id: string | null, connection?: Connection): RequestMetadata {
  const metadata: RequestMetadata = { destination: null, protocol: null, inbound: null, outbound: null }
  if (id === null) return metadata
  const text = (value: unknown) => typeof value === 'string' && value.trim() ? value : null
  let fieldDestination: string | null = null
  let routedDestination: string | null = null
  for (const event of events) {
    if (event.requestId !== id) continue
    fieldDestination = text(event.fields.dst) ?? fieldDestination
    if (event.event === 'routing:outbound_selected') routedDestination = text(event.fields.dst) ?? routedDestination
    metadata.inbound = text(event.fields.inbound) ?? text(event.fields.inbound_tag) ?? metadata.inbound
    metadata.outbound = text(event.fields.outbound) ?? metadata.outbound
    for (const span of event.spans) {
      if (span.name === 'inbound') metadata.inbound = text(span.fields.tag) ?? metadata.inbound
      if ((span.name === 'tcp_req' || span.name === 'udp_req') && requestId(span.fields.req_id) === id) {
        metadata.destination = text(span.fields.dst) ?? metadata.destination
        metadata.protocol = span.name === 'tcp_req' ? 'TCP' : 'UDP'
      }
    }
  }
  metadata.destination = routedDestination ?? metadata.destination ?? fieldDestination
  if (connection && String(connection.id) === id) {
    const host = connection.dst_domain || connection.dst_ip
    if (host) {
      const address = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host
      metadata.destination = connection.dst_port == null ? address : `${address}:${connection.dst_port}`
    }
    metadata.protocol = connection.protocol.toUpperCase()
    metadata.inbound = connection.inbound || metadata.inbound
    metadata.outbound = connection.outbound || metadata.outbound
  }
  return metadata
}

export const LOG_CATEGORIES = {
  connection: 'Connection', routing: 'Routing', dns: 'DNS', sniffing: 'Sniffing',
  security: 'Security', transport: 'Transport', other: 'Other',
} as const
export type LogCategory = keyof typeof LOG_CATEGORIES
const CATEGORY_PREFIXES: Record<string, LogCategory> = {
  mixed: 'connection', socks: 'connection', http: 'connection', tproxy: 'connection',
  tun: 'connection', direct: 'connection', proxy: 'connection', connectivity: 'connection', outbound: 'connection',
  routing: 'routing', router: 'routing', dns: 'dns', sniffer: 'sniffing', security: 'security', jls: 'security',
  quic: 'transport', squic: 'transport', shadowquic: 'transport', sunnyquic: 'transport', recovery: 'transport', stream: 'transport',
}
export function logCategory(event: string | null): LogCategory {
  const prefix = event?.split(':', 1)[0] ?? ''
  return Object.hasOwn(CATEGORY_PREFIXES, prefix) ? CATEGORY_PREFIXES[prefix]! : 'other'
}

/** The wire format already renders tracing Display/Debug values as strings. */
export function logFields(fields: Record<string, unknown>): [string, string][] {
  return Object.entries(fields).filter(([key]) => key !== 'message').map(([key, value]) => [
    key, typeof value === 'string' ? (value === '' ? '\"\"' : value) : JSON.stringify(value) ?? String(value),
  ])
}

/** Search the retained event, including tracing-style field pairs and span context. */
export function logSearchText(event: LogEvent): string {
  const fields = (values: Record<string, unknown>) => Object.entries(values).map(([key, value]) => `${key}=${typeof value === 'string' ? (value === '' ? '\"\"' : value) : JSON.stringify(value) ?? String(value)}`).join('\n')
  return [event.timestamp, event.level, event.target, event.event ?? '', `req_id=${event.requestId ?? 'unscoped'}`, LOG_CATEGORIES[logCategory(event.event)], fields(event.fields), ...event.spans.map(span => `${span.name}\n${fields(span.fields)}`)].join('\n').toLowerCase()
}
