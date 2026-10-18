import { test } from 'node:test'
import type { TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { createRenderer } from 'vue'
import { useDashboard } from '../src/composables/dashboard.ts'
import type { Snapshot } from '../src/lib/types.ts'

function mountDashboard(t: TestContext, demo: boolean) {
  const location = new URL(`http://localhost/${demo ? '?demo=1' : ''}`)
  const globals: Record<string, unknown> = {
    location,
    document: Object.assign(new EventTarget(), { hidden: false }),
    window: { history: { replaceState: (_state: unknown, _unused: string, url: URL) => location.href = String(url) } },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  }
  const restore: (() => void)[] = []
  for (const [key, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key)
    Object.defineProperty(globalThis, key, { configurable: true, value })
    restore.push(() => { if (original) Object.defineProperty(globalThis, key, original); else Reflect.deleteProperty(globalThis, key) })
  }
  const renderer = createRenderer<object, object>({
    patchProp() {}, insert() {}, remove() {}, createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
    setText() {}, setElementText() {}, parentNode: () => null, nextSibling: () => null,
  })
  let dashboard!: ReturnType<typeof useDashboard>
  const app = renderer.createApp({ setup() { dashboard = useDashboard(); return () => null } })
  app.mount({})
  t.after(() => { app.unmount(); restore.forEach(fn => fn()) })
  return dashboard
}

test('demo refreshes repeatedly without making API calls', async t => {
  let requests = 0
  t.mock.method(globalThis, 'fetch', async () => { requests++; throw new Error('Demo must not call fetch') })
  const dashboard = mountDashboard(t, true)
  await dashboard.refresh()
  const samples = dashboard.history.value.length
  await dashboard.refresh()
  await dashboard.refresh()
  assert.equal(dashboard.history.value.length, samples + 2)
  assert.equal(dashboard.status.value, 'connected')
  assert.equal(requests, 0)
  assert.equal(dashboard.latencySamples.value.length, 24)
  dashboard.togglePause()
  assert.equal(dashboard.paused.value, true)
  assert.deepEqual(dashboard.speed.value, { download: 0, upload: 0 })
})

test('an in-flight live snapshot cannot replace a newly opened demo', async t => {
  let finish!: (snapshot: Snapshot) => void
  // The API snapshot is delayed to simulate a response arriving after a switch.
  const { ShadowquicApi } = await import('../src/lib/api.ts')
  t.mock.method(ShadowquicApi.prototype, 'snapshot', () => new Promise<Snapshot>(resolve => finish = resolve))
  const dashboard = mountDashboard(t, false)
  const oldRequest = dashboard.refresh()
  await dashboard.reset(true)
  assert.equal(dashboard.data.value.connections.length, 24)
  finish({ outbounds: [], connections: [], inbounds: [], memory: null, memoryNote: '' })
  await oldRequest
  assert.equal(dashboard.demo.value, true)
  assert.equal(dashboard.data.value.connections.length, 24)
  assert.equal(dashboard.status.value, 'connected')
  assert.equal(dashboard.latencySamples.value.length, 24)
})

test('latency history survives session closure and is isolated when reconnecting', async t => {
  const { ShadowquicApi } = await import('../src/lib/api.ts')
  const { demoSnapshot } = await import('../src/lib/demo.ts')
  let snapshot = demoSnapshot()
  t.mock.method(ShadowquicApi.prototype, 'snapshot', async () => snapshot)
  const dashboard = mountDashboard(t, false)
  await dashboard.refresh()
  assert.equal(dashboard.latencySamples.value.length, 24)
  snapshot = { ...snapshot, connections: [] }
  await dashboard.refresh()
  assert.equal(dashboard.data.value.connections.length, 0)
  assert.equal(dashboard.latencySamples.value.length, 24)
  await dashboard.connect({ name: 'Other backend', url: 'http://other.test', secret: '', interval: 2000 })
  assert.equal(dashboard.latencySamples.value.length, 0)
})
