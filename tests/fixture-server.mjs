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
    { tag: member, quality: { sq_conn_stats: {
      uplink: { rtt: 42, current_mtu: 1400, sent_packets: 1000, lost_packets: 2 },
      downlink: { rtt: 44, current_mtu: 1400, sent_packets: 2000, lost_packets: 3 },
      sample_age_ms: 2000, duration_ms: 3661000,
    }, probe } },
    { tag: 'direct', quality: { sq_conn_stats: null, probe: null } },
  ] })
  if (req.url === '/api/v1/connections') return json({ connections: [
    { id: '1', protocol: 'tcp', inbound: 'mixed', outbound: selector, src: '[::1]:54321', dst_ip: null, dst_domain: 'github.com', dst_port: 443, upload_bytes: 1024, download_bytes: download, duration_ms: 15000, first_response_ms: 45, half_closed: false, sniffer: { domain: 'sniffed.example', protocol: 'tls', version: '1.3' } },
    { id: '2', protocol: 'udp', inbound: 'tun', outbound: null, src: null, dst_ip: null, dst_domain: null, dst_port: null, upload_bytes: null, download_bytes: 512, duration_ms: null, first_response_ms: null, half_closed: true, sniffer: null },
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

// Minimal server-side frames exercise Vite's actual WebSocket upgrade proxy.
const { createHash } = await import('node:crypto')
server.on('upgrade', (req, socket) => {
  const url = new URL(req.url, 'http://localhost')
  const authorized = url.searchParams.get('token') === 'fixture-secret'
  requests.push({ method: 'GET', url: url.pathname, authorized })
  if (!authorized || url.pathname !== '/api/v1/logs') { socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); return }
  const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`)
  socket.on('error', () => {})
  socket.on('data', data => { if ((data[0] & 0x0f) === 8) socket.end(Buffer.from([0x88, 0])) })
  const base = Date.now()
  for (const [index, event] of ['mixed:accepted', 'router:matched', 'stream:first_response'].entries()) {
    const payload = Buffer.from(JSON.stringify({ timestamp: new Date(base + index * 25).toISOString(), level: 'TRACE', target: 'shadowquic::fixture', event, fields: { message: 'Fixture event' }, spans: [{ name: 'request', fields: { req_id: 1 } }] }))
    const header = Buffer.alloc(4); header[0] = 0x81; header[1] = 126; header.writeUInt16BE(payload.length, 2)
    socket.write(Buffer.concat([header, payload]))
  }
})
