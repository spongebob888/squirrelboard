import { computed, onBeforeUnmount, ref } from 'vue'
import { ApiError, ShadowquicApi, normalizeBase } from '../lib/api.ts'
import { demoHistory, demoProbe, demoSelect, demoSnapshot } from '../lib/demo.ts'
import { rates, totals } from '../lib/metrics.ts'
import type { Backend, Outbound, Sample, Snapshot } from '../lib/types.ts'

const empty = (): Snapshot => ({ outbounds: [], connections: [], inbounds: [], memory: null, memoryNote: '' })
function savedBackend(): Backend {
  try {
    const saved = JSON.parse(localStorage.getItem('squirrelboard.backend') || '{}')
    return { name: typeof saved.name === 'string' ? saved.name : 'Local Shadowquic', url: typeof saved.url === 'string' ? normalizeBase(saved.url) : '', secret: sessionStorage.getItem('squirrelboard.secret') || '', interval: [1000, 2000, 5000, 10000].includes(saved.interval) ? saved.interval : 2000 }
  } catch { return { name: 'Local Shadowquic', url: '', secret: '', interval: 2000 } }
}

export function useDashboard() {
  const backend = ref(savedBackend())
  const demo = ref(new URLSearchParams(location.search).get('demo') === '1')
  const data = ref<Snapshot>(empty())
  const history = ref<Sample[]>([])
  const status = ref<'connecting' | 'connected' | 'offline'>('connecting')
  const error = ref('')
  const lastUpdated = ref<number | null>(null)
  const paused = ref(false)
  const loading = ref(false)
  const probing = ref(new Set<string>())
  const selecting = ref(new Set<string>())
  const notice = ref('')
  let timer: ReturnType<typeof setTimeout> | undefined
  let noticeTimer: ReturnType<typeof setTimeout> | undefined
  let controller = new AbortController()
  let generation = 0
  let prior: { inbounds: Snapshot['inbounds']; at: number } | null = null
  let refreshing: Promise<void> | null = null
  const aggregate = computed(() => totals(data.value.inbounds))
  const speed = computed(() => status.value === 'connected' && !paused.value ? history.value.at(-1) || { download: 0, upload: 0 } : { download: 0, upload: 0 })

  function toast(message: string) {
    notice.value = message
    clearTimeout(noticeTimer)
    noticeTimer = setTimeout(() => notice.value = '', 5000)
  }

  function schedule() {
    clearTimeout(timer)
    if (!paused.value && !document.hidden) timer = setTimeout(() => void refresh(), backend.value.interval)
  }

  function refresh(): Promise<void> {
    if (refreshing) return refreshing
    const current = generation
    const signal = controller.signal
    loading.value = true
    refreshing = (async () => {
      try {
        const snapshot = await (demo.value ? Promise.resolve(demoSnapshot()) : new ShadowquicApi(backend.value).snapshot(signal))
        if (current !== generation) return
        const at = Date.now()
        const monotonic = performance.now()
        if (prior) {
          history.value = [...history.value, { at, ...rates(prior.inbounds, snapshot.inbounds, monotonic - prior.at) }].filter(s => at - s.at <= 120000).slice(-120)
        }
        prior = { inbounds: snapshot.inbounds, at: monotonic }
        data.value = snapshot
        lastUpdated.value = at
        status.value = 'connected'
        error.value = ''
      } catch (cause) {
        if (current !== generation || signal.aborted) return
        status.value = 'offline'
        prior = null
        error.value = cause instanceof ApiError && cause.status === 401
          ? 'Authentication failed. Check your API secret in Settings.'
          : cause instanceof Error ? cause.message : 'Could not refresh the dashboard.'
      } finally {
        if (current === generation) { loading.value = false; refreshing = null; schedule() }
      }
    })()
    return refreshing
  }

  async function reset(isDemo: boolean) {
    generation++
    controller.abort()
    controller = new AbortController()
    clearTimeout(timer)
    refreshing = null
    loading.value = false
    prior = null
    data.value = empty()
    history.value = isDemo ? demoHistory() : []
    lastUpdated.value = null
    error.value = ''
    status.value = 'connecting'
    demo.value = isDemo
    probing.value = new Set()
    selecting.value = new Set()
    const url = new URL(location.href)
    if (isDemo) url.searchParams.set('demo', '1')
    else url.searchParams.delete('demo')
    window.history.replaceState({}, '', url)
    await refresh()
  }

  async function connect(config: Backend) {
    backend.value = { ...config, name: config.name.trim() || 'Shadowquic', url: normalizeBase(config.url) }
    try {
      const { secret, ...preferences } = backend.value
      localStorage.setItem('squirrelboard.backend', JSON.stringify(preferences))
      if (secret) sessionStorage.setItem('squirrelboard.secret', secret)
      else sessionStorage.removeItem('squirrelboard.secret')
    } catch { toast('Browser storage is unavailable. Settings will last for this page only.') }
    await reset(false)
    return status.value === 'connected'
  }

  async function probe(outbound: Outbound, url: string) {
    const tag = outbound.tag
    if (probing.value.has(tag)) return
    const current = generation
    probing.value.add(tag)
    try {
      const result = demo.value ? { ...demoProbe(tag), url } : await new ShadowquicApi(backend.value).probe(tag, url, controller.signal)
      if (current !== generation) return
      const entry = data.value.outbounds.find(o => o.tag === tag)
      if (entry) entry.quality.probe = result
      toast(`${tag}: ${result.latency_ms ?? '—'} ms`)
    } catch (cause) {
      if (current !== generation) return
      toast(`${tag}: ${cause instanceof Error ? cause.message : 'Probe failed'}`)
      await refresh()
    } finally { if (current === generation) probing.value.delete(tag) }
  }

  async function select(outbound: Outbound, member: string) {
    if (selecting.value.has(outbound.tag) || outbound.selector?.selected === member) return
    const current = generation
    selecting.value.add(outbound.tag)
    try {
      if (demo.value) demoSelect(member)
      else await new ShadowquicApi(backend.value).select(outbound.tag, member, controller.signal)
      if (current !== generation) return
      if (outbound.selector) outbound.selector.selected = member
      toast(`${outbound.tag} now uses ${member}. New sessions will use this outbound.`)
      // Wait for any older snapshot, then request state after the mutation.
      await refresh()
      if (current === generation) await refresh()
    } catch (cause) {
      if (current === generation) toast(cause instanceof Error ? cause.message : 'Could not change the selection.')
    } finally { if (current === generation) selecting.value.delete(outbound.tag) }
  }

  function togglePause() {
    paused.value = !paused.value
    clearTimeout(timer)
    if (!paused.value) { prior = null; void refresh() }
  }
  function visibility() {
    clearTimeout(timer)
    if (!document.hidden && !paused.value) { prior = null; void refresh() }
  }
  document.addEventListener('visibilitychange', visibility)
  if (demo.value) history.value = demoHistory()
  void refresh()
  onBeforeUnmount(() => {
    generation++
    controller.abort()
    clearTimeout(timer)
    clearTimeout(noticeTimer)
    document.removeEventListener('visibilitychange', visibility)
  })
  return { backend, demo, data, history, status, error, lastUpdated, paused, loading, probing, selecting, notice, aggregate, speed, refresh, connect, reset, probe, select, toast, togglePause }
}
