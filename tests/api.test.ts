import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ApiError, ShadowquicApi, connectionFailureMessage, normalizeBase, validateProbeUrl } from '../src/lib/api.ts'
import type { Backend } from '../src/lib/types.ts'

const backend: Backend = { name: 'test', url: 'http://localhost:9090/api/v1/', secret: 'test-token', interval: 2000 }
test('API base normalization supports same-origin and API-prefixed URLs', () => {
  assert.equal(normalizeBase(''), '')
  assert.equal(normalizeBase('/api/v1/'), '')
  assert.equal(normalizeBase('http://localhost:9090/api/v1/'), 'http://localhost:9090')
  assert.throws(() => normalizeBase('javascript:alert(1)'))
  assert.throws(() => normalizeBase('http://user:secret@localhost'))
})
test('probes only accept credential-free HTTP URLs', () => {
  assert.equal(validateProbeUrl('http://example.com'), 'http://example.com/')
  assert.throws(() => validateProbeUrl('https://example.com'))
  assert.throws(() => validateProbeUrl('http://user:secret@example.com'))
})
test('mutations encode the entire outbound tag and send bearer authentication', async t => {
  const requests: { url: string; options: RequestInit }[] = []
  t.mock.method(globalThis, 'fetch', async (input: string, options: RequestInit) => {
    requests.push({ url: input, options })
    return new Response(JSON.stringify({ selected: 'jp', outbounds: ['jp'] }), { status: 200 })
  })
  const api = new ShadowquicApi(backend)
  await api.select('group /?#%', 'jp')
  assert.equal(requests[0]!.url, 'http://localhost:9090/api/v1/outbounds/group%20%2F%3F%23%25/selection')
  assert.equal(requests[0]!.options.method, 'PUT')
  assert.equal(new Headers(requests[0]!.options.headers).get('Authorization'), 'Bearer test-token')
  assert.deepEqual(JSON.parse(requests[0]!.options.body as string), { selected: 'jp' })
})
test('unsupported memory stats do not block the main snapshot', async t => {
  t.mock.method(globalThis, 'fetch', async (input: string) => {
    const path = new URL(input).pathname
    const body = path.endsWith('/memory') ? { error: { code: 'not_found', message: 'Not available' } } : path.endsWith('/outbounds') ? { outbounds: [] } : path.endsWith('/connections') ? { connections: [] } : { inbounds: [] }
    return new Response(JSON.stringify(body), { status: path.endsWith('/memory') ? 404 : 200 })
  })
  const snapshot = await new ShadowquicApi(backend).snapshot()
  assert.equal(snapshot.memory, null)
  assert.equal(snapshot.memoryNote, 'Memory statistics are unavailable on this backend.')
  assert.deepEqual(snapshot.connections, [])
})
test('authentication and non-JSON proxy failures have useful errors', async t => {
  const mock = t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ error: { code: 'unauthorized', message: 'Invalid token' } }), { status: 401 }))
  await assert.rejects(new ShadowquicApi(backend).snapshot(), (e: unknown) => e instanceof ApiError && e.status === 401)
  mock.mock.mockImplementation(async () => new Response('<html>Not the API</html>'))
  await assert.rejects(new ShadowquicApi(backend).snapshot(), /Expected JSON/)
})

test('connection failures distinguish direct browser requests from the same-origin proxy', async t => {
  for (const base of ['http://127.0.0.1:9090', 'http://192.168.7.1:9090']) {
    const message = connectionFailureMessage(base, 'http://127.0.0.1:5173')
    assert.match(message, /CORS/)
    assert.match(message, /leave API address empty/)
  }
  assert.match(connectionFailureMessage('', 'http://127.0.0.1:5173'), /dashboard proxy/)
  assert.doesNotMatch(connectionFailureMessage('http://127.0.0.1:9090', 'http://127.0.0.1:9090'), /CORS/)
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Failed to fetch') })
  await assert.rejects(new ShadowquicApi({ ...backend, url: '' }).snapshot(), (error: unknown) => error instanceof ApiError && error.code === 'network_error' && error.message.includes('dashboard proxy'))
})
