import http from 'node:http'

let selected = 'Tokyo / 東京'
let offline = false
let failedProbe = false
let requests = []
let probe = null
let download = 1048576
const member = 'Tokyo / 東京'
const selector = 'Proxy / main'
const server = http.createServer(async (req, res) => {
  const json = (body, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)) }
  if (req.url === '/__health') return json({ ok: true })
  if (req.url === '/__control' && req.method === 'POST') {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const controls = JSON.parse(Buffer.concat(chunks).toString() || '{}')
    offline = controls.offline ?? false
    failedProbe = controls.failedProbe ?? false
    if (controls.reset) { requests = []; selected = member; probe = null; download = 1048576 }
    return json({ ok: true })
  }
  if (req.url === '/__requests') return json({ requests, selected })
  requests.push({ method: req.method, url: req.url, authorized: req.headers.authorization === 'Bearer fixture-secret' })
  if (req.headers.authorization !== 'Bearer fixture-secret') return json({ error: { code: 'unauthorized', message: 'missing or invalid bearer token' } }, 401)
  if (offline) return json({ error: { code: 'unavailable', message: 'Fixture backend unavailable' } }, 503)
  if (req.url === '/api/v1/outbounds') return json({ outbounds: [
    { tag: selector, selector: { selected, outbounds: [member, 'direct'] }, quality: { sq_conn_stats: null, probe: null } },
    { tag: member, quality: { sq_conn_stats: null, probe } },
    { tag: 'direct', quality: { sq_conn_stats: null, probe: null } },
  ] })
  if (req.url === '/api/v1/connections') return json({ connections: [
    { id: '1', protocol: 'tcp', inbound: 'mixed', outbound: selector, src: '[::1]:54321', dst_ip: null, dst_domain: 'github.com', dst_port: 443, upload_bytes: 1024, download_bytes: download, duration_ms: 15000, first_response_ms: 45, half_closed: false },
    { id: '2', protocol: 'udp', inbound: 'tun', outbound: null, src: null, dst_ip: null, dst_domain: null, dst_port: null, upload_bytes: null, download_bytes: 512, duration_ms: null, first_response_ms: null, half_closed: true },
  ] })
  if (req.url === '/api/v1/traffic') {
    download += 10240
    return json({ inbounds: [{ inbound: 'mixed', tcp_upload_bytes: 2048, tcp_download_bytes: download, udp_upload_bytes: 1024, udp_download_bytes: 4096, tcp_conns: 1, udp_conns: 0 }] })
  }
  if (req.url === '/api/v1/memory') return json({ error: { code: 'not_found', message: 'Not built with jemalloc' } }, 404)
  if (req.url === '/api/v1/tokio_metric') return json({ num_workers: 8, num_alive_tasks: 42, global_queue_depth: 0 })
  if (req.url === `/api/v1/outbounds/${encodeURIComponent(selector)}/selection` && req.method === 'PUT') {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString())
    if (![member, 'direct'].includes(body.selected)) return json({ error: { code: 'invalid_request', message: 'Unknown member' } }, 400)
    selected = body.selected
    return json({ selected, outbounds: [member, 'direct'] })
  }
  if (req.url === `/api/v1/outbounds/${encodeURIComponent(member)}/probe` && req.method === 'POST') {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const { url, timeout_ms } = JSON.parse(Buffer.concat(chunks).toString())
    if (!url.startsWith('http://') || timeout_ms !== 10000) return json({ error: { code: 'invalid_request', message: 'Invalid probe parameters' } }, 400)
    probe = { url, status: failedProbe ? 'failed' : 'ok', latency_ms: failedProbe ? null : 42, measured_at: new Date().toISOString(), error: failedProbe ? { code: 'probe_failed', message: 'HTTP 500' } : null }
    return failedProbe ? json({ error: probe.error }, 502) : json(probe)
  }
  json({ error: { code: 'not_found', message: 'Unknown route' } }, 404)
})
server.listen(19090, '127.0.0.1')
process.on('SIGTERM', () => server.close())
