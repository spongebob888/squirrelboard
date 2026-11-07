import { test, expect } from 'playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('squirrelboard.backend', JSON.stringify({ name: 'Fixture', url: '', interval: 1000 }))
    sessionStorage.setItem('squirrelboard.secret', 'fixture-secret')
    localStorage.setItem('squirrelboard.theme', 'light')
  })
})
test('real authenticated WebSocket proxy captures before opening connection timeline', async ({ page }) => {
  await page.goto('/#connections')
  await expect(page.locator('tbody tr')).toHaveCount(2)
  await page.getByRole('button', { name: 'Inspect connection to github.com', exact: true }).click()
  await page.getByRole('button', { name: 'View request log' }).click()
  await expect(page).toHaveURL(/#log\?req_id=1$/)
  await expect(page.getByLabel('Request ID', { exact: true })).toHaveValue('1')
  await expect(page.locator('.log-events li')).toHaveCount(3)
  await expect(page.locator('.log-timeline')).toContainText('50 ms observed')
  await page.locator('summary').first().click()
  await expect(page.locator('pre').first()).toContainText('"req_id": 1')
  await page.getByRole('button', { name: 'Freeze view', exact: true }).click()
  await expect(page.getByText(/View frozen at/)).toBeVisible()
  await page.getByLabel('Request ID', { exact: true }).fill('999')
  await expect(page.getByText('No captured events for request 999')).toBeVisible()
  await page.getByRole('button', { name: 'Clear filter' }).click()
  await expect(page.locator('.log-events li')).toHaveCount(3)
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await expect(page.getByText(/Capture is paused/)).toBeVisible()
  await page.getByRole('button', { name: 'Resume', exact: true }).click()
  await expect(page.locator('.log-heading')).toContainText('Live')
})

test('lag, unscoped logs, frozen arrivals and mobile layouts', async ({ page }) => {
  let send: (text: string) => void = () => {}
  await page.routeWebSocket('**/api/v1/logs*', ws => { send = text => ws.send(text) })
  await page.goto('/#log')
  await expect(page.locator('.log-heading')).toContainText('Live')
  const record = (id: number | null, event: string) => JSON.stringify({ timestamp: new Date().toISOString(), level: 'WARN', target: 'shadowquic::test', event, fields: id === null ? {} : { req_id: id }, spans: [] })
  send(record(7, 'router:matched'))
  send('{"event":"api:logs_lagged","dropped":4}')
  await expect(page.locator('.log-events li')).toHaveCount(1)
  await expect(page.getByText(/4 server-dropped/)).toBeVisible()
  await page.getByRole('button', { name: 'Freeze view', exact: true }).click()
  send(record(7, 'stream:closed'))
  send(record(null, 'quinn:warning'))
  await expect(page.locator('.log-events li')).toHaveCount(1)
  await page.getByRole('button', { name: 'Follow live', exact: true }).click()
  await expect(page.locator('.log-request')).toHaveCount(2)
  await page.getByRole('button', { name: /Unscoped events/ }).click()
  await expect(page.locator('.log-timeline')).toContainText('cannot be assigned to a request')
  await page.getByRole('button', { name: /Request 7/ }).click()
  await expect(page.locator('.log-events li')).toHaveCount(2)
  await page.screenshot({ path: '.impeccable/review/desktop.png', fullPage: true, animations: 'disabled' })
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.screenshot({ path: '.impeccable/review/mobile.png', fullPage: true, animations: 'disabled' })
  await page.getByRole('button', { name: 'Use dark theme' }).last().click()
  await page.screenshot({ path: '.impeccable/review/mobile-dark.png', fullPage: true, animations: 'disabled' })
})

test('demo logs do not open a socket', async ({ page }) => {
  let sockets = 0
  page.on('websocket', socket => { if (socket.url().includes('/api/v1/logs')) sockets++ })
  await page.goto('/#log?demo=1')
  await expect(page.locator('.log-heading')).toContainText('Demo')
  await expect(page.locator('.log-events li')).toHaveCount(4)
  expect(sockets).toBe(0)
})

test('stream failures keep captured events visible and retry without blocking the dashboard', async ({ page }) => {
  let count = 0
  await page.routeWebSocket('**/api/v1/logs*', ws => {
    count++
    ws.send(JSON.stringify({ timestamp: new Date().toISOString(), level: 'INFO', target: 'shadowquic::test', event: 'request:accepted', fields: { req_id: 5 }, spans: [] }))
    if (count === 1) setTimeout(() => ws.close({ code: 1011, reason: 'fixture interruption' }), 100)
  })
  await page.goto('/#log')
  await expect(page.getByText(/Cannot open the log stream/)).toBeVisible()
  await expect(page.locator('.log-events li')).toHaveCount(1)
  await expect(page.getByText('Backend connected', { exact: true })).toBeVisible()
  await expect(page.locator('.log-heading')).toContainText('Live')
  await expect(page.locator('.log-events li')).toHaveCount(2)
  await expect(page.getByText(/1 stream interruptions/)).toBeVisible()
})

test('TCP and UDP request headers survive after connections disappear', async ({ page }) => {
  await page.route('**/api/v1/connections', route => route.fulfill({ json: { connections: [] } }))
  await page.routeWebSocket('**/api/v1/logs*', ws => {
    for (const [id, protocol, destination, inbound] of [[42, 'tcp', 'example.com:443', 'mixed-in'], [43, 'udp', '[2001:db8::1]:53', 'tun-in']] as const) {
      ws.send(JSON.stringify({ timestamp: new Date().toISOString(), level: 'INFO', target: 'shadowquic', event: 'routing:outbound_selected', fields: { outbound: 'direct' }, spans: [
        { name: 'inbound', fields: { tag: inbound } },
        { name: `${protocol}_req`, fields: { req_id: String(id), dst: destination } },
      ] }))
    }
  })
  await page.goto('/#log?req_id=42')
  await expect(page.locator('.log-destination')).toHaveText('example.com:443 · TCP · Inbound: mixed-in · Outbound: direct')
  await page.getByLabel('Time window').selectOption('60000')
  await expect(page.locator('.log-destination')).toContainText('example.com:443')
  await page.screenshot({ path: '.impeccable/review/tcp-header.png', fullPage: true, animations: 'disabled' })
  await page.setViewportSize({ width: 320, height: 844 })
  await page.screenshot({ path: '.impeccable/review/tcp-header-mobile.png', fullPage: true, animations: 'disabled' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByLabel('Request ID', { exact: true }).fill('43')
  await expect(page.locator('.log-destination')).toHaveText('[2001:db8::1]:53 · UDP · Inbound: tun-in · Outbound: direct')
})

test('event category colors remain distinct from severity in both themes', async ({ page }) => {
  const names = ['mixed:connection_started', 'routing:outbound_selected', 'dns:query_sent', 'sniffer:completed', 'security:authentication_succeeded', 'quic:connection_started', 'custom:message']
  await page.routeWebSocket('**/api/v1/logs*', ws => {
    names.forEach((event, index) => ws.send(JSON.stringify({ timestamp: new Date(Date.now() + index * 20).toISOString(), level: index === 2 ? 'ERROR' : 'TRACE', target: 'shadowquic::test', event, fields: { req_id: 42 }, spans: [] })))
  })
  await page.goto('/#log?req_id=42')
  await expect(page.locator('.log-events li')).toHaveCount(7)
  await expect(page.getByLabel('Event categories')).toContainText('DNS')
  await expect(page.locator('.log-events .category-dns .log-level')).toHaveText('ERROR')
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') await page.getByRole('button', { name: 'Use dark theme' }).last().click()
    const colors = await page.locator('.log-event-label strong').evaluateAll(labels => labels.map(label => getComputedStyle(label).color))
    expect(new Set(colors).size).toBe(7)
    const dns = page.locator('.log-events .category-dns')
    expect(await dns.locator('strong').evaluate(el => getComputedStyle(el).color)).not.toBe(await dns.locator('.log-level').evaluate(el => getComputedStyle(el).color))
    await page.screenshot({ path: `.impeccable/review/categories-${theme}.png`, fullPage: true, animations: 'disabled' })
  }
  await page.setViewportSize({ width: 320, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: '.impeccable/review/categories-mobile.png', fullPage: true, animations: 'disabled' })
})

test('event fields follow the message inline, including unlabelled and message-free events', async ({ page }) => {
  await page.routeWebSocket('**/api/v1/logs*', ws => {
    const records = [
      { event: 'routing:outbound_selected', fields: { message: 'routing request', dst: 'long-hostname.'.repeat(5) + 'example.com:443', outbound: 'direct', elapsed_ms: 0, cached: false } },
      { event: null, fields: { message: 'unlabelled message', retries: 0, error: '<b>not markup</b>' } },
      { event: 'stream:completed', fields: { bytes: 0, error: null } },
      { event: 'proxy:request_accepted', fields: { message: 'message only' } },
    ]
    records.forEach((record, index) => ws.send(JSON.stringify({ timestamp: new Date(Date.now() + index * 20).toISOString(), level: 'INFO', target: 'shadowquic::test', ...record, spans: [{ name: 'tcp_req', fields: { req_id: 42, span_only: 'context' } }] })))
  })
  await page.goto('/#log?req_id=42')
  const rows = page.locator('.log-events li')
  await expect(rows).toHaveCount(4)
  await expect(rows.nth(0).locator('.log-message')).toContainText('routing request dst=long-hostname.')
  await expect(rows.nth(0).locator('.log-message')).toContainText('outbound=direct elapsed_ms=0 cached=false')
  await expect(rows.nth(1).locator('.log-message')).toHaveText('unlabelled message retries=0 error=<b>not markup</b>')
  await expect(rows.nth(1).locator('.log-message b')).toHaveCount(0)
  await expect(rows.nth(2).locator('.log-message')).toHaveText('bytes=0 error=null')
  await expect(rows.nth(3).locator('.log-inline-field')).toHaveCount(0)
  await expect(rows.nth(0).locator('.log-message')).not.toContainText('span_only')
  await page.screenshot({ path: '.impeccable/review/inline-fields.png', fullPage: true, animations: 'disabled' })
  await page.setViewportSize({ width: 320, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: '.impeccable/review/inline-fields-mobile.png', fullPage: true, animations: 'disabled' })
  await rows.nth(0).locator('summary').click()
  await expect(rows.nth(0).locator('pre')).toContainText('span_only')
})
