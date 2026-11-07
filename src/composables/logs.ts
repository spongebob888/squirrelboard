import { onBeforeUnmount, ref, shallowRef, watch, type Ref } from 'vue'
import { LOG_CAPACITY, logSocketUrl, parseLog, pruneLogs, type LogEvent } from '../lib/logs'
import type { Backend, Snapshot } from '../lib/types'

export function useLogs(backend: Ref<Backend>, demo: Ref<boolean>, paused: Ref<boolean>, data: Ref<Snapshot>) {
  const events = shallowRef<LogEvent[]>([])
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
    if (pending.length > LOG_CAPACITY) { pending.splice(0, pending.length - LOG_CAPACITY); evicted.value++ }
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
  watch([backend, demo], () => {
    events.value = []; pending = []; dropped.value = 0; invalid.value = 0; evicted.value = 0; gaps.value = 0; demoSeeded = false; attempts = 0
    start()
  }, { immediate: true, flush: 'sync' })
  watch([paused, hidden], () => { if (!demo.value && (paused.value || hidden.value)) gaps.value++; start() })
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
    const combined = [...events.value, ...pending]
    const retained = pruneLogs(combined, now.value)
    evicted.value += Math.max(0, combined.filter(event => event.receivedAt >= now.value - 30 * 60_000).length - retained.length)
    events.value = retained
    pending = []
  }, 500)
  const visibility = () => { hidden.value = document.hidden }
  document.addEventListener('visibilitychange', visibility)
  onBeforeUnmount(() => { stop(); clearInterval(tick); document.removeEventListener('visibilitychange', visibility) })
  return { events, state, dropped, invalid, evicted, gaps, now, retry: start }
}
