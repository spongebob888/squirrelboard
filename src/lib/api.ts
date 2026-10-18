import type { Backend, Connection, InboundTraffic, Memory, Outbound, Probe, Snapshot, TokioMetric } from './types.ts'

export class ApiError extends Error {
  status: number
  code: string
  constructor(message: string, status: number, code: string) { super(message); this.status = status; this.code = code }
}

export function normalizeBase(input: string): string {
  const base = input.trim().replace(/\/+$/, '').replace(/\/api\/v1$/, '')
  if (!base) return ''
  const url = new URL(base)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Use an HTTP or HTTPS URL without credentials, a query, or a fragment.')
  }
  return url.href.replace(/\/+$/, '')
}

export function validateProbeUrl(input: string): string {
  const url = new URL(input)
  if (url.protocol !== 'http:' || url.username || url.password) {
    throw new Error('Shadowquic probes require an http:// URL without credentials.')
  }
  return url.href
}

export function connectionFailureMessage(base: string, dashboardOrigin?: string): string {
  if (base && dashboardOrigin && new URL(base).origin !== dashboardOrigin) {
    return 'The browser could not access this API address. Shadowquic does not provide CORS headers for direct cross-origin requests. With Vite dev or preview, leave API address empty and set SHADOWQUIC_API_URL on the dashboard server. Otherwise configure a same-origin reverse proxy or enable CORS on your API proxy.'
  }
  return 'Cannot reach Shadowquic through the dashboard proxy. Check that the API is listening and that SHADOWQUIC_API_URL points to the correct server. Enter the API secret in Settings if authentication is enabled.'
}

export class ShadowquicApi {
  private backend: Backend
  constructor(backend: Backend) { this.backend = backend }

  async request<T>(path: string, options: RequestInit = {}, timeout = 12000): Promise<T> {
    const headers = new Headers(options.headers)
    headers.set('Accept', 'application/json')
    if (options.body) headers.set('Content-Type', 'application/json')
    if (this.backend.secret) headers.set('Authorization', `Bearer ${this.backend.secret}`)
    const signals = [AbortSignal.timeout(timeout)]
    if (options.signal) signals.push(options.signal)
    let response: Response
    const base = normalizeBase(this.backend.url)
    try {
      response = await fetch(`${base}/api/v1${path}`, {
        ...options, headers, signal: AbortSignal.any(signals), cache: 'no-store', credentials: 'omit',
      })
    } catch (error) {
      if (options.signal?.aborted) throw error
      throw new ApiError(error instanceof Error && error.name === 'TimeoutError'
        ? 'The API took too long to respond.'
        : connectionFailureMessage(base, globalThis.location?.origin), 0, 'network_error')
    }
    let body: any
    try { body = await response.json() } catch {
      throw new ApiError('Expected JSON from Shadowquic. Check your API proxy configuration.', response.status, 'invalid_response')
    }
    if (!response.ok) throw new ApiError(body.error?.message || `Request failed (${response.status})`, response.status, body.error?.code || 'http_error')
    return body as T
  }

  async snapshot(signal?: AbortSignal): Promise<Snapshot> {
    const [outbounds, connections, traffic, memory, tokioMetric] = await Promise.all([
      this.request<{ outbounds: Outbound[] }>('/outbounds', { signal }),
      this.request<{ connections: Connection[] }>('/connections', { signal }),
      this.request<{ inbounds: InboundTraffic[] }>('/traffic', { signal }),
      this.request<Memory>('/memory', { signal }, 3000)
        .then(value => ({ value, note: '' }))
        .catch(error => ({ value: null, note: error instanceof ApiError && [404, 501].includes(error.status)
          ? 'Memory statistics are unavailable on this backend.' : 'Memory statistics could not be refreshed.' })),
      this.request<TokioMetric>('/tokio_metric', { signal }, 3000)
        .then(value => {
          if (!value || ![value.num_workers, value.num_alive_tasks, value.global_queue_depth].every(count => Number.isInteger(count) && count >= 0)) {
            throw new ApiError('Unexpected Tokio runtime metrics response.', 200, 'invalid_response')
          }
          return { value, note: '' }
        })
        .catch(error => ({ value: null, note: error instanceof ApiError && [404, 501].includes(error.status)
          ? 'Tokio runtime metrics are unavailable on this backend.' : 'Tokio runtime metrics could not be refreshed.' })),
    ])
    if (!Array.isArray(outbounds.outbounds) || !Array.isArray(connections.connections) || !Array.isArray(traffic.inbounds)) {
      throw new ApiError('The server returned an unexpected Shadowquic response.', 200, 'invalid_response')
    }
    return { outbounds: outbounds.outbounds, connections: connections.connections, inbounds: traffic.inbounds, memory: memory.value, memoryNote: memory.note, tokioMetric: tokioMetric.value, tokioMetricNote: tokioMetric.note }
  }

  probe(tag: string, url: string, signal?: AbortSignal) {
    return this.request<Probe>(`/outbounds/${encodeURIComponent(tag)}/probe`, {
      method: 'POST', body: JSON.stringify({ url: validateProbeUrl(url), timeout_ms: 10000 }), signal,
    })
  }

  select(tag: string, selected: string, signal?: AbortSignal) {
    return this.request<{ selected: string; outbounds: string[] }>(`/outbounds/${encodeURIComponent(tag)}/selection`, {
      method: 'PUT', body: JSON.stringify({ selected }), signal,
    })
  }
}
