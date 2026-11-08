import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { LOG_CAPACITY, logLevelMatches, logSocketUrl, parseLog, pruneLogs, type LogEvent } from '../lib/logs'
import { normalizeBase } from '../lib/api'
import { LogStorageClient } from '../lib/log-client'
import { DEFAULT_LOG_LIMIT, validLogLimit, logOverview, summarizeLogs, type LogQuery, type LogView } from '../lib/log-storage'
import type { Backend, Snapshot } from '../lib/types'

export function useLogs(backend: Ref<Backend>, demo: Ref<boolean>, paused: Ref<boolean>, data: Ref<Snapshot>) {
  const revision = ref(0)
  const storageEpoch = ref(0)
  const storedCount = ref(0)
  const storageError = ref('')
  const maxEvents = ref(DEFAULT_LOG_LIMIT)
  try {
    const saved = Number(localStorage.getItem('squirrelboard.logLimit'))
    if (validLogLimit(saved)) maxEvents.value = saved
  } catch { /* use default */ }
  let client: LogStorageClient | null = null
  let memory: LogEvent[] = []
  let scope = ''
  let flushing: Promise<void> | null = null
  let disposed = false
  const state = ref('Connecting')
  const dropped = ref(0)
  const invalid = ref(0)
  const evicted = ref(0)
  const gaps = ref(0)
  const now = ref(Date.now())
  const hidden = ref(document.hidden)
  let socket: WebSocket | null = null
  let retry: ReturnType<typeof setTimeout> | undefined
  let handshake: ReturnType<typeof setTimeout> | undefined
  let sequence = 0
  let pending: LogEvent[] = []
  let attempts = 0
  let generation = 0
  let demoSeeded = false

  function stop() {
    generation++
    clearTimeout(retry)
    clearTimeout(handshake)
    if (socket) { socket.onclose = null; socket.onmessage = null; socket.onerror = null; socket.onopen = null; socket.close(); socket = null }
  }
  function receive(text: string) {
    const parsed = parseLog(text, Date.now(), ++sequence)
    if (!parsed) { invalid.value++; return }
    if ('dropped' in parsed) { dropped.value += parsed.dropped; return }
    pending.push(parsed)
    const pendingLimit = Math.min(maxEvents.value, 50_000)
    if (pending.length > pendingLimit) { pending.splice(0, pending.length - pendingLimit); evicted.value++ }
    if (pending.length >= 1000 && !flushing) void flush()
  }
  function start() {
    stop()
    if (demo.value) { state.value = 'Demo'; return }
    if (paused.value || hidden.value) { state.value = 'Paused'; return }
    state.value = 'Connecting'
    const current = generation
    const failed = () => {
      if (generation !== current) return
      clearTimeout(handshake)
      socket = null
      state.value = 'Unavailable · retrying'
      gaps.value++
      retry = setTimeout(start, Math.min(30_000, 2000 * 2 ** Math.min(attempts++, 4)))
    }
    try {
      socket = new WebSocket(logSocketUrl(backend.value, location.origin))
      handshake = setTimeout(() => socket?.close(), 10_000)
      socket.onopen = () => { clearTimeout(handshake); if (generation === current) { state.value = 'Live'; attempts = 0 } }
      socket.onmessage = event => { if (generation === current && typeof event.data === 'string') receive(event.data) }
      socket.onerror = () => { /* close supplies the retry; browsers hide handshake details */ }
      socket.onclose = failed
    } catch { failed() }
  }
  function storageFailure() {
    storageError.value = 'IndexedDB is unavailable or full. New logs are kept in memory only, up to 10,000 events; reload to retry persistent storage.'
    client?.close(); client = null
  }
  function changeBackend() {
    storageEpoch.value++
    storedCount.value = 0
    memory = []; pending = []
    storageError.value = ''
    client?.close(); client = null
    scope = normalizeBase(backend.value.url) || location.origin
    if (!demo.value) {
      try { client = new LogStorageClient() } catch { storageFailure() }
    }
    revision.value++
  }
  watch([backend, demo], () => {
    changeBackend(); pending = []; dropped.value = 0; invalid.value = 0; evicted.value = 0; gaps.value = 0; demoSeeded = false; attempts = 0
    start()
    void flush()
  }, { immediate: true, flush: 'sync' })
  watch([paused, hidden], () => { if (!demo.value && (paused.value || hidden.value)) gaps.value++; start(); void flush() })
  async function flush() {
    if (disposed) return
    if (flushing) { await flushing; if (!disposed) return flush(); return }
    const epoch = storageEpoch.value
    const currentClient = client
    const batch = pending
    pending = []
    flushing = (async () => {
      await Promise.resolve()
      if (epoch !== storageEpoch.value || disposed) return
      if (currentClient) {
        try {
          const summary = await currentClient.append(scope, batch, maxEvents.value, Date.now())
          if (epoch !== storageEpoch.value || disposed) return
          storedCount.value = summary.count
          evicted.value += summary.evicted
        } catch {
          if (epoch !== storageEpoch.value || disposed) return
          storageFailure()
          const combined = [...memory, ...batch]
          memory = pruneLogs(combined, Date.now(), Math.min(maxEvents.value, LOG_CAPACITY))
          evicted.value += Math.max(0, combined.length - memory.length)
          storedCount.value = memory.length
        }
      } else {
        const combined = [...memory, ...batch]
        memory = pruneLogs(combined, Date.now(), demo.value ? maxEvents.value : Math.min(maxEvents.value, LOG_CAPACITY))
        evicted.value += Math.max(0, combined.filter(event => event.receivedAt >= Date.now() - 30 * 60_000).length - memory.length)
        storedCount.value = memory.length
      }
      if (epoch === storageEpoch.value) revision.value++
    })()
    try { await flushing } finally { flushing = null }
  }
  async function query(options: LogQuery): Promise<LogView> {
    const currentClient = client
    if (currentClient) return currentClient.query(scope, options)
    const rows = memory.filter(event => event.receivedAt <= options.end && event.receivedAt >= options.end - 30 * 60_000)
    const view = summarizeLogs(rows.map(event => logOverview(event, scope)), options)
    if (view.selected) view.events = rows.filter(event => event.requestId === view.selected!.id && event.receivedAt >= options.end - options.windowMs && logLevelMatches(event.level, options.level))
      .sort((a, b) => a.at - b.at || a.sequence - b.sequence).slice(options.offset ?? 0, (options.offset ?? 0) + options.limit)
    return view
  }
  async function setMaxEvents(value: number) {
    if (!validLogLimit(value)) throw new Error('Enter a whole number from 1,000 to 1,000,000.')
    maxEvents.value = value
    try { localStorage.setItem('squirrelboard.logLimit', String(value)) } catch { throw new Error('The event limit is applied for this page, but browser preferences could not be saved.') }
    await flush()
  }
  const tick = setInterval(() => {
    now.value = Date.now()
    if (demo.value && !demoSeeded && data.value.connections.length) {
      demoSeeded = true
      data.value.connections.slice(0, 12).forEach((connection, index) => {
        const base = Date.now() - 15_000 - index * 3000
        ;['mixed:accepted', 'router:matched', 'outbound:connected', 'stream:first_response'].forEach((event, step) => {
          receive(JSON.stringify({ timestamp: new Date(base + [0, 3, 28, 74][step]!).toISOString(), level: 'TRACE', target: 'shadowquic::demo', event, fields: { message: 'Simulated request event', destination: connection.dst_domain || connection.dst_ip, outbound: connection.outbound }, spans: [{ name: 'request', fields: { req_id: connection.id } }] }))
        })
      })
    }
    // One batch in flight at a time. The incoming queue remains bounded under disk pressure.
    if (!flushing) void flush()
  }, 1000)
  const storagePreference = (event: StorageEvent) => {
    if (event.key !== 'squirrelboard.logLimit' && event.key !== null) return
    const value = Number(event.newValue)
    maxEvents.value = validLogLimit(value) ? value : DEFAULT_LOG_LIMIT
    void flush()
  }
  window.addEventListener('storage', storagePreference)
  const visibility = () => { hidden.value = document.hidden }
  document.addEventListener('visibilitychange', visibility)
  onBeforeUnmount(() => { disposed = true; client?.close(); stop(); clearInterval(tick); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('storage', storagePreference) })
  return { revision, storageEpoch, storedCount, storageError, maxEvents, setMaxEvents, query, state, dropped, invalid, evicted, gaps, now, retry: start }
}
