import { test, expect } from 'playwright/test'

test.beforeEach(async ({ page, request }) => {
  await request.post('http://127.0.0.1:19090/__control', { data: { reset: true } })
  await page.addInitScript(() => {
    localStorage.setItem('squirrelboard.backend', JSON.stringify({ name: 'Fixture Shadowquic', url: '', interval: 1000 }))
    localStorage.setItem('squirrelboard.theme', 'light')
    sessionStorage.setItem('squirrelboard.secret', 'fixture-secret')
  })
})

test('authenticated polling works through the Vite proxy without memory support', async ({ page, request }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('/')
  await expect(page.getByText('Backend connected', { exact: true })).toBeVisible()
  await expect(page.getByText('github.com', { exact: false }).first()).toBeVisible()
  await expect(page.getByText('Memory statistics are unavailable on this backend.')).toBeVisible()
  await expect.poll(async () => (await (await request.get('http://127.0.0.1:19090/__requests')).json()).requests.filter((r: any) => r.url === '/api/v1/traffic').length).toBeGreaterThan(1)
  const { requests } = await (await request.get('http://127.0.0.1:19090/__requests')).json()
  expect(requests.every((r: any) => r.authorized)).toBe(true)
  expect(errors).toEqual([])
})

test('selectors and probes preserve encoded outbound tags', async ({ page, request }) => {
  await page.goto('/#outbounds')
  await expect(page.getByText('Backend connected', { exact: true })).toBeVisible()
  const selector = page.locator('.selector-panel')
  await selector.getByRole('button', { name: 'direct Outbound', exact: false }).click()
  await expect.poll(async () => (await (await request.get('http://127.0.0.1:19090/__requests')).json()).selected).toBe('direct')
  await expect(selector.locator('.outbound-card.selected')).toContainText('direct')
  const card = page.locator('.all-outbounds .outbound-card').filter({ hasText: 'Tokyo / 東京' })
  await card.getByRole('button', { name: 'Test latency for Tokyo / 東京' }).click()
  await expect(card.locator('.latency')).toContainText('42')
  const { requests } = await (await request.get('http://127.0.0.1:19090/__requests')).json()
  expect(requests.some((r: any) => r.method === 'PUT' && r.url.includes('Proxy%20%2F%20main/selection'))).toBe(true)
  expect(requests.some((r: any) => r.method === 'POST' && r.url.includes('Tokyo%20%2F%20%E6%9D%B1%E4%BA%AC/probe'))).toBe(true)
})

test('connection filters and half-closed details handle null fields', async ({ page }) => {
  await page.goto('/#connections')
  await expect(page.locator('tbody tr')).toHaveCount(2)
  await page.getByLabel('Search connections').fill('github')
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await page.getByLabel('Search connections').clear()
  await page.getByLabel('Filter protocol').selectOption('udp')
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await page.locator('tbody tr').click()
  await expect(page.getByRole('dialog')).toContainText('Half-closed')
  await expect(page.getByRole('dialog')).toContainText('Waiting / unavailable')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
})

test('failed probes and offline polling retain clear failure states', async ({ page, request }) => {
  await page.goto('/#outbounds')
  await expect(page.getByText('Backend connected', { exact: true })).toBeVisible()
  await request.post('http://127.0.0.1:19090/__control', { data: { failedProbe: true } })
  const card = page.locator('.all-outbounds .outbound-card').filter({ hasText: 'Tokyo / 東京' })
  await card.getByRole('button', { name: 'Test latency for Tokyo / 東京' }).click()
  await expect(card.locator('.latency')).toContainText('Failed')
  await request.post('http://127.0.0.1:19090/__control', { data: { offline: true } })
  await expect(page.getByRole('alert')).toContainText('Displaying the last successful snapshot.')
  await expect(card).toBeVisible()
  await request.post('http://127.0.0.1:19090/__control', { data: {} })
  await expect(page.getByText('Backend connected', { exact: true })).toBeVisible()
  await expect(page.getByRole('alert')).not.toBeVisible()
})

test('invalid tokens show an actionable authentication error', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('squirrelboard.secret', 'incorrect'))
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('Authentication failed')
  await page.getByRole('button', { name: 'Configure backend' }).click()
  await page.getByLabel('API secret', { exact: false }).fill('fixture-secret')
  await page.getByRole('button', { name: 'Save & connect' }).click()
  await expect(page.getByText('Connected. Your backend settings are saved.')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('squirrelboard.backend'))).not.toContain('fixture-secret')
})

test('fragment settings stay out of requests, populate Settings, and are consumed once', async ({ page }) => {
  const documentUrls: string[] = []
  const referrers: string[] = []
  page.on('request', request => {
    if (request.isNavigationRequest()) documentUrls.push(request.url())
    referrers.push(request.headers()['referer'] ?? '')
  })
  await page.goto('/#settings?protocol=http&hostname=127.0.0.1&port=4173&secret=fixture-secret')
  await expect(page.getByText('Backend connected', { exact: true })).toBeVisible()
  await expect(page.getByLabel('API address', { exact: false })).toHaveValue('http://127.0.0.1:4173')
  await expect(page.getByLabel('API secret', { exact: false })).toHaveValue('fixture-secret')
  await expect(page).toHaveURL('http://127.0.0.1:4173/#settings')
  expect(await page.evaluate(() => localStorage.getItem('squirrelboard.backend'))).not.toContain('fixture-secret')

  await page.getByLabel('API address', { exact: false }).fill('')
  await page.getByRole('button', { name: 'Save & connect' }).click()
  await expect(page.getByText('Connected. Your backend settings are saved.')).toBeVisible()
  await page.reload()
  await expect(page.getByText('Backend connected', { exact: true })).toBeVisible()
  await expect(page.getByLabel('API address', { exact: false })).toHaveValue('')
  expect(documentUrls.length).toBeGreaterThan(0)
  expect(documentUrls.every(url => url === 'http://127.0.0.1:4173/')).toBe(true)
  expect(referrers.every(value => !value.includes('fixture-secret') && !value.includes('hostname='))).toBe(true)
})

test('demo is isolated from the backend and supports mobile navigation and themes', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?demo=1')
  await expect(page.locator('.demo-banner')).toBeVisible()
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await page.getByRole('navigation').getByRole('button', { name: 'Connections' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Connections' })).toBeVisible()
  await page.getByLabel('Search connections').fill('github')
  await expect(page.locator('.connection-card')).toHaveCount(2)
  await expect(page.locator('.table-scroll')).not.toBeVisible()
  await page.getByRole('button', { name: 'Use dark theme' }).last().click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  const { requests } = await (await request.get('http://127.0.0.1:19090/__requests')).json()
  expect(requests).toHaveLength(0)
})

test.describe('Chrome mobile connection layouts', () => {
  test.use({ isMobile: true, hasTouch: true })

  for (const width of [320, 390]) {
    for (const view of ['overview', 'connections']) {
      test(`${view} stays in the viewport during horizontal swipes at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 })
        const domain = 'long-subdomain-'.repeat(4) + 'example.com'
        await page.route('**/api/v1/connections', route => route.fulfill({ json: { connections: [{
          id: 'wide', protocol: 'tcp', inbound: 'mixed', outbound: 'long-outbound-name-'.repeat(8),
          src: '[2001:db8:ffff:ffff:ffff:ffff:ffff:ffff]:65535', dst_domain: domain, dst_ip: null, dst_port: 443,
          upload_bytes: 1024, download_bytes: 4096, duration_ms: 10000, first_response_ms: 45, half_closed: false,
        }] } }))
        await page.goto(`/#${view}`)
        const card = page.locator('.connection-card')
        await expect(card).toBeVisible()
        await expect(page.locator('.table-scroll')).not.toBeVisible()
        if (view === 'connections') await expect(card).toContainText('45 ms')
        await card.scrollIntoViewIfNeeded()
        const box = (await card.boundingBox())!
        expect(box.x).toBeGreaterThanOrEqual(0)
        expect(box.x + box.width).toBeLessThanOrEqual(width)

        const session = await page.context().newCDPSession(page)
        try {
          for (const distance of [-150, 150]) {
            await session.send('Input.synthesizeScrollGesture', {
              x: Math.round(box.x + box.width / 2), y: Math.round(box.y + 20),
              xDistance: distance, yDistance: 0, gestureSourceType: 'touch',
            })
            const viewport = await page.evaluate(() => ({
              scrollX: window.scrollX,
              pageWidth: document.documentElement.scrollWidth,
              viewportWidth: window.innerWidth,
              headerX: document.querySelector('.topbar')!.getBoundingClientRect().x,
              visualOffset: window.visualViewport?.offsetLeft ?? 0,
            }))
            expect(viewport.scrollX).toBe(0)
            expect(viewport.headerX).toBe(0)
            expect(viewport.visualOffset).toBe(0)
            expect(viewport.pageWidth).toBeLessThanOrEqual(viewport.viewportWidth)
          }
        } finally { await session.detach() }
        await card.getByRole('button', { name: `Inspect connection to ${domain}` }).click()
        await expect(page.getByRole('dialog')).toContainText(domain)
      })
    }
  }
})
