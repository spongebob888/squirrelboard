import { test } from 'node:test'
import type { TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { createRenderer } from 'vue'
import { useDashboard } from '../src/composables/dashboard.ts'
import type { Backend, Snapshot } from '../src/lib/types.ts'

function mountDashboard(t: TestContext, demo: boolean | string, saved?: Backend, storageUnavailable = false) {
  const location = new URL(typeof demo === 'string' ? demo : `http://localhost/${demo ? '?demo=1' : ''}`)
  const storage = (entries: [string, string][]) => {
    const values = new Map(entries)
    return {
      getItem(key: string) { if (storageUnavailable) throw new Error('Storage blocked'); return values.get(key) ?? null },
      setItem(key: string, value: string) { if (storageUnavailable) throw new Error('Storage blocked'); values.set(key, value) },
      removeItem(key: string) { if (storageUnavailable) throw new Error('Storage blocked'); values.delete(key) },
    }
  }
  const { secret, ...preferences } = saved ?? { name: 'Local Shadowquic', url: '', secret: '', interval: 2000 }
  const globals: Record<string, unknown> = {
    location,
    document: Object.assign(new EventTarget(), { hidden: false }),
    window: { history: { replaceState: (_state: unknown, _unused: string, url: URL) => location.href = String(url) } },
    localStorage: storage([['squirrelboard.backend', JSON.stringify(preferences)]]),
    sessionStorage: storage([['squirrelboard.secret', secret]]),
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
  finish({ outbounds: [], connections: [], inbounds: [], memory: null, memoryNote: '', tokioMetric: null, tokioMetricNote: '' })
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

const saved: Backend = { name: 'Saved server', url: 'http://saved.test:9090', secret: 'saved-secret', interval: 5000 }

function mockApiRequests(t: TestContext) {
  const requests: { url: string; authorization: string | null; pageUrl: string }[] = []
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    requests.push({ url, authorization: new Headers(options.headers).get('Authorization'), pageUrl: location.href })
    const path = new URL(url, location.origin).pathname
    const body = path.endsWith('/outbounds') ? { outbounds: [] }
      : path.endsWith('/connections') ? { connections: [] }
      : path.endsWith('/traffic') ? { inbounds: [] }
      : path.endsWith('/tokio_metric') ? { num_workers: 1, num_alive_tasks: 2, global_queue_depth: 0 }
      : { allocator: 'jemalloc', allocated_bytes: 0, active_bytes: 0, resident_bytes: 0 }
    return new Response(JSON.stringify(body))
  })
  return requests
}

test('URL settings override saved settings before the first request and survive reload', async t => {
  const requests = mockApiRequests(t)
  const secret = 'token&with+reserved?characters#=/%'
  const params = new URLSearchParams({ protocol: 'http', hostname: 'router.test', port: '9090', secret, unrelated: 'keep' })
  const dashboard = mountDashboard(t, `http://localhost/squirrelboard/?${params}#connections`, saved)
  await dashboard.refresh()
  assert.equal(dashboard.status.value, 'connected')
  assert.deepEqual(dashboard.backend.value, { ...saved, url: 'http://router.test:9090', secret })
  assert.equal(requests.length, 5)
  assert.ok(requests.every(request => request.url.startsWith('http://router.test:9090/api/v1/')))
  assert.ok(requests.every(request => request.authorization === `Bearer ${secret}`))
  assert.ok(requests.every(request => request.pageUrl === 'http://localhost/squirrelboard/?unrelated=keep#connections'))
  assert.equal(sessionStorage.getItem('squirrelboard.secret'), secret)
  assert.deepEqual(JSON.parse(localStorage.getItem('squirrelboard.backend')!), { name: saved.name, url: 'http://router.test:9090', interval: saved.interval })

  // Recreate the composable with the same browser storage after parameters are consumed.
  let reloaded!: ReturnType<typeof useDashboard>
  const app = createRenderer<object, object>({
    patchProp() {}, insert() {}, remove() {}, createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
    setText() {}, setElementText() {}, parentNode: () => null, nextSibling: () => null,
  }).createApp({ setup() { reloaded = useDashboard(); return () => null } })
  app.mount({})
  try {
    await reloaded.refresh()
    assert.deepEqual(reloaded.backend.value, dashboard.backend.value)
  } finally { app.unmount() }
})

test('a URL selecting a different server never reuses the saved secret', async t => {
  const requests = mockApiRequests(t)
  const dashboard = mountDashboard(t, 'http://localhost/?protocol=http&hostname=other.test&port=9090', saved)
  await dashboard.refresh()
  assert.equal(dashboard.backend.value.secret, '')
  assert.equal(sessionStorage.getItem('squirrelboard.secret'), null)
  assert.ok(requests.every(request => request.authorization === null))
})

test('an equivalent API address keeps its tab secret when no secret is supplied', async t => {
  const requests = mockApiRequests(t)
  const dashboard = mountDashboard(t, 'http://localhost/?protocol=http&hostname=SAVED.test&port=9090', saved)
  await dashboard.refresh()
  assert.equal(dashboard.backend.value.secret, saved.secret)
  assert.ok(requests.every(request => request.authorization === `Bearer ${saved.secret}`))
})

test('a secret-only URL configures the saved server', async t => {
  const requests = mockApiRequests(t)
  const dashboard = mountDashboard(t, 'http://localhost/?secret=replacement', saved)
  await dashboard.refresh()
  assert.equal(dashboard.backend.value.url, saved.url)
  assert.ok(requests.every(request => request.authorization === 'Bearer replacement'))
})

test('empty URL parameters select the same-origin proxy and clear authentication', async t => {
  const requests = mockApiRequests(t)
  const dashboard = mountDashboard(t, 'http://localhost/?hostname=&secret=', saved)
  await dashboard.refresh()
  assert.equal(dashboard.backend.value.url, '')
  assert.equal(dashboard.backend.value.secret, '')
  assert.ok(requests.every(request => request.url.startsWith('/api/v1/') && request.authorization === null))
})

test('invalid URL addresses stop polling and can be corrected through Settings', async t => {
  const requests = mockApiRequests(t)
  const dashboard = mountDashboard(t, 'http://localhost/?protocol=javascript&hostname=router.test&secret=new-secret#settings', saved)
  await dashboard.refresh()
  assert.equal(requests.length, 0)
  assert.equal(dashboard.status.value, 'offline')
  assert.match(dashboard.error.value, /Invalid server address in URL/)
  assert.equal(location.href, 'http://localhost/#settings')
  assert.equal(sessionStorage.getItem('squirrelboard.secret'), saved.secret)
  assert.equal(await dashboard.connect({ ...saved, url: 'http://corrected.test' }), true)
  assert.ok(requests.every(request => request.url.startsWith('http://corrected.test/api/v1/')))
})

test('demo URL settings remain isolated from the API until leaving demo', async t => {
  const requests = mockApiRequests(t)
  const dashboard = mountDashboard(t, 'http://localhost/?demo=1&hostname=demo.test&secret=demo-secret', saved)
  await dashboard.refresh()
  assert.equal(requests.length, 0)
  assert.equal(location.search, '?demo=1')
  await dashboard.reset(false)
  assert.ok(requests.length > 0)
  assert.ok(requests.every(request => request.url.startsWith('http://demo.test/api/v1/') && request.authorization === 'Bearer demo-secret'))
})

test('URL settings work when browser storage is unavailable', async t => {
  const requests = mockApiRequests(t)
  const dashboard = mountDashboard(t, 'http://localhost/?protocol=https&hostname=router.test&secret=url-secret', undefined, true)
  await dashboard.refresh()
  assert.equal(dashboard.status.value, 'connected')
  assert.match(dashboard.notice.value, /Browser storage is unavailable/)
  assert.equal(location.search, '')
  assert.ok(requests.every(request => request.url.startsWith('https://router.test/api/v1/') && request.authorization === 'Bearer url-secret'))
})

test('hostname parameters support protocol defaults, explicit ports, and IPv6', async t => {
  const cases = [
    ['hostname=router.test', 'http://router.test'],
    ['protocol=https&hostname=router.test', 'https://router.test'],
    ['protocol=https&hostname=router.test&port=443', 'https://router.test'],
    ['protocol=https&hostname=router.test&port=9443', 'https://router.test:9443'],
    ['protocol=http&hostname=::1&port=9090', 'http://[::1]:9090'],
    ['protocol=http&hostname=[2001:db8::1]&port=9090', 'http://[2001:db8::1]:9090'],
  ]
  for (const [query, expected] of cases) {
    await t.test(query!, async t => {
      const requests = mockApiRequests(t)
      const dashboard = mountDashboard(t, `http://localhost/?${query}`, saved)
      await dashboard.refresh()
      assert.equal(dashboard.status.value, 'connected')
      assert.equal(dashboard.backend.value.url, expected)
      assert.ok(requests.every(request => request.url.startsWith(`${expected}/api/v1/`)))
    })
  }
})

test('malformed address fields never send requests or overwrite saved credentials', async t => {
  const queries = [
    'protocol=ftp&hostname=router.test',
    'protocol=https',
    'port=9090',
    'hostname=&port=9090',
    'hostname=router.test&port=0',
    'hostname=router.test&port=65536',
    'hostname=router.test&port=-1',
    'hostname=router.test&port=9.5',
    'hostname=router.test&port=abc',
    'hostname=http://router.test',
    'hostname=router.test/api/v1',
    'hostname=user@router.test',
    'hostname=router.test:9090',
    'hostname=[::1]:9090',
    'hostname=router.test%5Cother.test',
    'hostname=router.test%3Fquery',
    'hostname=router.test%23fragment',
  ]
  for (const query of queries) {
    await t.test(query, async t => {
      const requests = mockApiRequests(t)
      const dashboard = mountDashboard(t, `http://localhost/?${query}&secret=new-secret`, saved)
      await dashboard.refresh()
      assert.equal(requests.length, 0)
      assert.equal(dashboard.status.value, 'offline')
      assert.match(dashboard.error.value, /Invalid server address in URL/)
      assert.equal(sessionStorage.getItem('squirrelboard.secret'), saved.secret)
      assert.equal(JSON.parse(localStorage.getItem('squirrelboard.backend')!).url, saved.url)
      assert.equal(location.search, '')
    })
  }
})
