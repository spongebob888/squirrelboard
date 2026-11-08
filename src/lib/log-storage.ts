import { LOG_CATEGORIES, LOG_RETENTION_MS, logCategory, logLevelMatches, requestMetadata, type LogCategory, type LogEvent, type RequestMetadata } from './logs'

export const DEFAULT_WATERFALL_LIMIT = 500
export const MAX_WATERFALL_LIMIT = 10_000
export function validWaterfallLimit(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_WATERFALL_LIMIT
}
export const DEFAULT_LOG_LIMIT = 100_000
export const MAX_LOG_LIMIT = 1_000_000
export function validLogLimit(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1000 && value <= MAX_LOG_LIMIT
}
export interface LogQuery {
  end: number; windowMs: number; requestId: string; selectedId?: string | null; level?: string; page: number; limit: number; offset?: number; mode?: 'waterfall'; eventSequence?: number
}
interface Overview {
  sequence: number; scope: string; receivedAt: number; at: number; requestId: string | null; level: string; event: string | null; metadata: RequestMetadata; destinationPriority?: number
}
export function logOverview(event: LogEvent, scope: string, sequence = event.sequence): Overview {
  const metadata = requestMetadata([event], event.requestId)
  const routed = event.event === 'routing:outbound_selected' && typeof event.fields.dst === 'string' && event.fields.dst.trim()
  const request = event.spans.some(span => ['tcp_req', 'udp_req'].includes(span.name) && String(span.fields.req_id) === event.requestId && typeof span.fields.dst === 'string' && span.fields.dst.trim())
  return { sequence, scope, receivedAt: event.receivedAt, at: event.at, requestId: event.requestId, level: event.level.toUpperCase(), event: event.event, metadata, destinationPriority: routed ? 3 : request ? 2 : 1 }
}
export interface RequestSummary {
  id: string | null; count: number; first: { at: number }; last: { at: number; receivedAt: number }
  markers: { sequence: number; at: number; event: string | null }[]
  metadata: RequestMetadata; categories: LogCategory[]
}
export interface WaterfallPoint {
  sequence: number; at: number; requestId: string | null; event: string | null; level: string
}
export interface WaterfallView {
  points: WaterfallPoint[]; counts: Record<LogCategory, number>; total: number; start: number; end: number; offset: number; limit: number
}
export interface LogView {
  requests: RequestSummary[]; totalRequests: number; totalEvents: number; pages: number; page: number
  selected: RequestSummary | null; events: LogEvent[]; waterfall?: WaterfallView
}
export const emptyLogView = (): LogView => ({ requests: [], totalRequests: 0, totalEvents: 0, pages: 1, page: 1, selected: null, events: [] })
const result = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})
const complete = (transaction: IDBTransaction) => new Promise<void>((resolve, reject) => {
  transaction.oncomplete = () => resolve()
  transaction.onabort = () => reject(transaction.error ?? new Error('Log transaction aborted'))
  transaction.onerror = () => { /* abort reports transaction failures */ }
})

export class LogDatabase {
  private db: IDBDatabase | null = null
  async open() {
    const request = indexedDB.open('squirrelboard.logs', 3)
    request.onupgradeneeded = event => {
      const db = request.result
      if (!db.objectStoreNames.contains('events')) db.createObjectStore('events', { keyPath: 'sequence', autoIncrement: true })
      const overview = db.objectStoreNames.contains('overview') ? request.transaction!.objectStore('overview') : db.createObjectStore('overview', { keyPath: 'sequence' })
      if (!overview.indexNames.contains('scopeTime')) overview.createIndex('scopeTime', ['scope', 'receivedAt'])
      if (!overview.indexNames.contains('receivedAt')) overview.createIndex('receivedAt', 'receivedAt')
      if (!overview.indexNames.contains('requestTime')) overview.createIndex('requestTime', ['scope', 'requestId', 'receivedAt'])
      if (event.oldVersion > 0 && event.oldVersion < 3) {
        // Add levels to existing summaries without discarding retained events.
        const cursor = request.transaction!.objectStore('events').openCursor()
        cursor.onsuccess = () => {
          const row = cursor.result
          if (!row) return
          overview.put(logOverview(row.value, row.value.scope))
          row.continue()
        }
      }
    }
    this.db = await new Promise<IDBDatabase>((resolve, reject) => {
      let failed = false
      request.onblocked = () => { failed = true; reject(new Error('Log storage is blocked by another tab')) }
      request.onerror = () => reject(request.error)
      request.onsuccess = () => { if (failed) request.result.close(); else resolve(request.result) }
    })
    this.db.onversionchange = () => { this.db?.close(); this.db = null }
  }
  close() { this.db?.close(); this.db = null }
  async append(scope: string, events: LogEvent[], max: number, now: number) {
    if (!this.db) throw new Error('Log storage is closed')
    const tx = this.db.transaction(['events', 'overview'], 'readwrite')
    const done = complete(tx)
    void done.catch(() => {})
    const store = tx.objectStore('events')
    const overview = tx.objectStore('overview')
    for (const event of events) {
      const { sequence: _sequence, ...body } = event
      const request = store.add({ ...body, scope })
      request.onsuccess = () => overview.put(logOverview(event, scope, request.result as number))
    }
    // Evict by arrival time, then coalesce adjacent primary keys into bulk deletions.
    let evicted = 0
    const count = store.count()
    count.onsuccess = () => {
      const index = overview.index('receivedAt')
      const expired = index.count(IDBKeyRange.upperBound(now - LOG_RETENTION_MS, true))
      expired.onsuccess = () => {
        const remove = Math.max(expired.result, count.result - max)
        if (remove <= 0) return
        evicted = remove - expired.result
        const keys = index.getAllKeys(undefined, remove)
        keys.onsuccess = () => {
          const ids = (keys.result as number[]).sort((a, b) => a - b)
          let start = ids[0]!
          let end = start
          const erase = () => { const range = IDBKeyRange.bound(start, end); store.delete(range); overview.delete(range) }
          for (let i = 1; i < ids.length; i++) {
            if (ids[i] === end + 1) end = ids[i]!
            else { erase(); start = end = ids[i]! }
          }
          if (ids.length) erase()
        }
      }
    }
    await done
    return { count: await this.count(scope), evicted }
  }
  async count(scope: string) {
    if (!this.db) throw new Error('Log storage is closed')
    return result(this.db.transaction('overview').objectStore('overview').index('scopeTime').count(IDBKeyRange.bound([scope, 0], [scope, Number.MAX_SAFE_INTEGER])))
  }
  async query(scope: string, query: LogQuery): Promise<LogView> {
    if (!this.db) throw new Error('Log storage is closed')
    const tx = this.db.transaction(['overview', 'events'])
    const done = complete(tx)
    void done.catch(() => {})
    const key = query.requestId ? [scope, query.requestId] : [scope]
    const range = IDBKeyRange.bound([...key, Math.max(0, query.end - LOG_RETENTION_MS)], [...key, query.end])
    const rows = await result<Overview[]>(tx.objectStore('overview').index(query.requestId ? 'requestTime' : 'scopeTime').getAll(range))
    const view = summarizeLogs(rows, query)
    if (query.mode === 'waterfall') view.waterfall = summarizeWaterfall(rows, query)
    const ids = query.mode === 'waterfall'
      ? rows.filter(row => row.sequence === query.eventSequence && row.receivedAt >= query.end - query.windowMs && logLevelMatches(row.level, query.level)).map(row => row.sequence)
      : view.selected ? rows.filter(row => row.requestId === view.selected!.id && row.receivedAt >= query.end - query.windowMs && logLevelMatches(row.level, query.level))
      .sort((a, b) => a.at - b.at || a.sequence - b.sequence).slice(query.offset ?? 0, (query.offset ?? 0) + query.limit).map(row => row.sequence) : []
    // Queue all reads in the same transaction so eviction cannot tear the result.
    const events = await Promise.all(ids.map(id => result(tx.objectStore('events').get(id))))
    await done
    view.events = events.filter(Boolean).map(({ scope: _scope, ...event }) => event as LogEvent)
    return view
  }
}

function groupLogs(rows: Overview[], query: LogQuery) {
  const groups = new Map<string | null, RequestSummary>()
  const metadata = new Map<string | null, RequestMetadata>()
  const destinationPriority = new Map<string | null, number>()
  let totalEvents = 0
  for (const row of rows) {
    if (query.requestId && row.requestId !== query.requestId) continue
    const context = metadata.get(row.requestId) ?? { destination: null, inbound: null, outbound: null, protocol: null }
    for (const key of Object.keys(context) as (keyof RequestMetadata)[]) {
      if (!row.metadata[key]) continue
      if (key === 'destination') {
        const priority = row.destinationPriority ?? 1
        if (priority < (destinationPriority.get(row.requestId) ?? 0)) continue
        destinationPriority.set(row.requestId, priority)
      }
      context[key] = row.metadata[key]
    }
    metadata.set(row.requestId, context)
    if (row.receivedAt < query.end - query.windowMs || !logLevelMatches(row.level, query.level)) continue
    totalEvents++
    let group = groups.get(row.requestId)
    if (!group) {
      group = { id: row.requestId, count: 0, first: { at: row.at }, last: { at: row.at, receivedAt: row.receivedAt }, markers: [], metadata: context, categories: [] }
      groups.set(row.requestId, group)
    }
    group.count++
    group.first.at = Math.min(group.first.at, row.at)
    group.last.at = Math.max(group.last.at, row.at)
    group.last.receivedAt = Math.max(group.last.receivedAt, row.receivedAt)
    const category = logCategory(row.event)
    if (!group.categories.includes(category)) group.categories.push(category)
    group.markers.push({ sequence: row.sequence, at: row.at, event: row.event })
    if (group.markers.length > 100) group.markers.shift()
  }
  const all = [...groups.values()].sort((a, b) => b.last.receivedAt - a.last.receivedAt)
  return { all, totalEvents }
}

export function summarizeLogs(rows: Overview[], query: LogQuery): LogView {
  const { all, totalEvents } = groupLogs(rows, query)
  const pages = Math.max(1, Math.ceil(all.length / 30))
  const page = Math.min(pages, Math.max(1, query.page))
  const selected = (query.selectedId !== undefined
    ? all.find(group => group.id === query.selectedId)
    : query.requestId ? all.find(group => group.id === query.requestId) : all[0]) ?? null
  return { requests: all.slice((page - 1) * 30, page * 30), totalRequests: all.length, totalEvents, pages, page, selected, events: [] }
}

/** Page compact event points; full bodies are read only when a dot is selected. */
export function summarizeWaterfall(rows: Overview[], query: LogQuery): WaterfallView {
  const matching = rows.filter(row => row.receivedAt >= query.end - query.windowMs && row.receivedAt <= query.end && (!query.requestId || row.requestId === query.requestId) && logLevelMatches(row.level, query.level))
    .sort((a, b) => a.at - b.at || a.sequence - b.sequence)
  const limit = validWaterfallLimit(query.limit) ? query.limit : DEFAULT_WATERFALL_LIMIT
  const offset = Math.min(Math.max(0, query.offset ?? 0), Math.max(0, Math.ceil(matching.length / limit) - 1) * limit)
  const points = matching.slice(offset, offset + limit).map(({ sequence, at, requestId, event, level }) => ({ sequence, at, requestId, event, level }))
  const counts = Object.fromEntries(Object.keys(LOG_CATEGORIES).map(category => [category, 0])) as Record<LogCategory, number>
  for (const row of matching) counts[logCategory(row.event)]++
  return { points, counts, total: matching.length, start: points[0]?.at ?? query.end, end: points.at(-1)?.at ?? query.end, offset, limit }
}
