import { test, expect } from 'playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('squirrelboard.backend', JSON.stringify({ name: 'Fixture', url: '', interval: 1000 }))
    sessionStorage.setItem('squirrelboard.secret', 'fixture-secret')
  })
  await page.routeWebSocket('**/api/v1/logs*', () => {})
})

test('IndexedDB retains more than 10,000 events, pages bodies, reloads, and applies a saved limit', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/#log')
  const seed = await page.evaluate(async () => {
    const path = '/src/lib/log-storage.ts'
    const { LogDatabase } = await import(path)
    const db = new LogDatabase()
    await db.open()
    const at = Date.now() - 30_000
    const events = Array.from({ length: 25_000 }, (_, index) => ({ sequence: index, receivedAt: at + index, at: at + index,
      timestamp: new Date(at + index).toISOString(), level: 'TRACE', target: 'shadowquic::test', event: 'routing:outbound_selected',
      fields: { message: 'stored event', batch_index: index, dst: 'example.com:443' }, spans: [], requestId: index < 5000 ? '42' : String(100 + index % 40),
    }))
    const result = await db.append(location.origin, events, 100_000, Date.now())
    db.close()
    return result
  })
  expect(seed.count).toBe(25_000)
  await expect(page.locator('.log-heading')).toContainText('25,000 events', { timeout: 20_000 })
  await expect(page.locator('.log-request')).toHaveCount(30)
  await page.getByLabel('Request ID', { exact: true }).fill('42')
  await expect(page.locator('.log-heading')).toContainText('5,000 events')
  await expect(page.locator('.log-events li')).toHaveCount(100)
  await expect(page.locator('.log-events li').first()).toContainText('batch_index=0')
  await page.getByRole('button', { name: 'Next events', exact: true }).click()
  await expect(page.locator('.log-events li').first()).toContainText('batch_index=100')
  await expect(page.locator('.log-events li')).toHaveCount(100)
  await page.reload()
  await expect(page.locator('.log-heading')).toContainText('5,000 events')
  await page.getByRole('navigation').getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByLabel('Maximum stored events').fill('1000')
  await page.getByRole('button', { name: 'Save limit', exact: true }).click()
  await expect(page.getByText('Log event limit saved.', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('squirrelboard.logLimit'))).toBe('1000')
  await page.screenshot({ path: '.impeccable/review/log-storage-settings.png', fullPage: true, animations: 'disabled' })
  await page.getByRole('navigation').getByRole('button', { name: 'Log', exact: true }).click()
  await page.getByRole('button', { name: 'Clear filter', exact: true }).click()
  await expect(page.locator('.log-heading')).toContainText('1,000 events')
  await page.reload()
  await expect(page.locator('.log-heading')).toContainText('1,000 events')
  expect(await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('squirrelboard.logs'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })
    const tx = db.transaction('events')
    const rows = await new Promise<any[]>(resolve => { const r = tx.objectStore('events').getAll(); r.onsuccess = () => resolve(r.result) })
    db.close()
    return { count: rows.length, first: rows[0].fields.batch_index }
  })).toEqual({ count: 1000, first: 24_000 })
})

test('storage isolates backend scopes, expires old records, and returns consistent filtered windows', async ({ page }) => {
  await page.goto('/#log')
  const result = await page.evaluate(async () => {
    const path = '/src/lib/log-storage.ts'
    const { LogDatabase } = await import(path)
    const db = new LogDatabase(); await db.open()
    const now = Date.now()
    const record = (id: string, age: number) => ({ sequence: 0, receivedAt: now - age, at: now - age, timestamp: new Date(now - age).toISOString(), level: 'INFO', target: 'test', event: 'proxy:request_accepted', fields: { dst: 'example.com:443' }, spans: [], requestId: id })
    await db.append('backend-a', [record('old', 1_900_000), record('42', 120_000), record('42', 100)], 1000, now)
    await db.append('backend-b', [record('42', 200)], 1000, now)
    const options = { end: now, windowMs: 60_000, requestId: '42', page: 1, limit: 100 }
    const a = await db.query('backend-a', options)
    const b = await db.query('backend-b', options)
    const frozen = await db.query('backend-a', { ...options, end: now - 50_000, windowMs: 300_000 })
    const count = await db.count('backend-a')
    const context = { ...record('42', 300), spans: [{ name: 'tcp_req', fields: { req_id: '42', dst: 'original.example:443' } }] }
    await db.append('backend-c', [context, { ...context, receivedAt: now - 200, event: 'routing:outbound_selected', fields: { dst: 'routed.example:443' } }, { ...context, receivedAt: now - 100 }], 1000, now)
    const routed = await db.query('backend-c', options)
    db.close()
    return { a: a.totalEvents, b: b.totalEvents, frozen: frozen.totalEvents, count, destination: routed.selected.metadata.destination }
  })
  expect(result).toEqual({ a: 1, b: 1, frozen: 1, count: 2, destination: 'routed.example:443' })
})

test('worker storage failure uses a bounded memory fallback with an actionable status', async ({ page }) => {
  await page.addInitScript(() => { window.Worker = class { constructor() { throw new Error('Storage blocked') } } as any })
  await page.routeWebSocket('**/api/v1/logs*', ws => ws.send(JSON.stringify({ timestamp: new Date().toISOString(), level: 'INFO', target: 'test', event: 'proxy:request_accepted', fields: { req_id: 42, message: 'fallback event' }, spans: [] })))
  await page.goto('/#log')
  await expect(page.getByText(/IndexedDB is unavailable or full/)).toBeVisible()
  await expect(page.locator('.log-events li')).toContainText('fallback event')
  await page.getByRole('navigation').getByRole('button', { name: 'Settings', exact: true }).click()
  await page.setViewportSize({ width: 320, height: 844 })
  await page.getByLabel('Maximum stored events').scrollIntoViewIfNeeded()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: '.impeccable/review/log-storage-settings-mobile.png', fullPage: true, animations: 'disabled' })
  await page.getByLabel('Maximum stored events').fill('0')
  await page.getByRole('button', { name: 'Save limit', exact: true }).click()
  expect(await page.getByLabel('Maximum stored events').evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false)
})
