import { test, expect } from 'playwright/test'

for (const storage of ['IndexedDB', 'memory']) {
  test(`log level filters summaries and event pages in ${storage}`, async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem('squirrelboard.secret', 'fixture-secret'))
    if (storage === 'memory') await page.addInitScript(() => { window.Worker = class { constructor() { throw new Error('Fixture fallback') } } as any })
    let send: (text: string) => void = () => {}
    await page.routeWebSocket('**/api/v1/logs*', ws => { send = text => ws.send(text) })
    await page.goto('/#log')
    await expect(page.locator('.log-heading')).toContainText('Live')
    const record = (level: string, id = 42) => JSON.stringify({ timestamp: new Date().toISOString(), level, target: 'test', event: 'proxy:accepted', fields: { req_id: id, message: `${level} event` }, spans: level === 'TRACE' ? [{ name: 'tcp_req', fields: { req_id: id, dst: 'level.example:443' } }] : [] })
    for (let i = 0; i < 105; i++) send(record('TRACE'))
    send(record('WARN'))
    send(record('ERROR', 43))
    await expect(page.locator('.log-heading')).toContainText('107 events')
    await page.getByRole('button', { name: 'Freeze view', exact: true }).click()
    await page.getByRole('button', { name: /Request 42 / }).click()
    await page.getByRole('button', { name: 'Next events', exact: true }).click()
    const level = page.getByRole('combobox', { name: 'Log level', exact: true })
    await level.selectOption('WARN')
    await expect(page.locator('.log-heading')).toContainText('2 events')
    await expect(page.locator('.log-request')).toHaveCount(2)
    await expect(page.locator('.log-events li')).toHaveCount(1)
    await expect(page.locator('.log-events')).toContainText('WARN event')
    await expect(page.locator('.log-destination')).toContainText('level.example:443')
    await expect(page.getByRole('button', { name: 'Next events', exact: true })).toHaveCount(0)
    if (storage === 'IndexedDB') await page.screenshot({ path: '.impeccable/review/log-level-desktop.png', animations: 'disabled' })
    await level.selectOption('ERROR')
    await expect(page.getByRole('heading', { name: 'Request 42 has no events at ERROR or above in this window' })).toBeVisible()
    await expect(page.locator('.log-events li')).toHaveCount(0)
    await page.getByRole('button', { name: 'Show newest request', exact: true }).click()
    await expect(page.locator('.log-events')).toContainText('ERROR event')
    await level.selectOption('INFO')
    await expect(page.locator('.log-heading')).toContainText('2 events')
    await expect(page.locator('.log-request')).toHaveCount(2)
    await page.getByRole('button', { name: /Request 43 / }).click()
    await expect(page.locator('.log-events')).toContainText('ERROR event')
    await page.getByRole('button', { name: /Request 42 / }).click()
    await expect(page.locator('.log-events')).toContainText('WARN event')
    send(record('INFO'))
    await expect(page.locator('.log-help-summary')).toContainText('108')
    await expect(page.locator('.log-heading')).toContainText('2 events')
    await expect(page.locator('.log-events')).not.toContainText('INFO event')
    await page.getByRole('button', { name: 'Follow live', exact: true }).click()
    await expect(page.locator('.log-heading')).toContainText('3 events')
    await expect(page.locator('.log-events li')).toHaveCount(2)
    await expect(page.locator('.log-events')).toContainText('INFO event')
    await level.selectOption('DEBUG')
    await expect(page.locator('.log-heading')).toContainText('3 events')
    await level.selectOption('TRACE')
    await expect(page.locator('.log-heading')).toContainText('108 events')
    await level.selectOption('')
    await expect(page.locator('.log-heading')).toContainText('108 events')
    if (storage === 'IndexedDB') {
      await page.setViewportSize({ width: 390, height: 844 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: '.impeccable/review/log-level-mobile.png', animations: 'disabled' })
    }
  })
}

test('upgrading retained v2 logs adds level summaries without losing events', async ({ page }) => {
  await page.addInitScript(() => { window.Worker = class { constructor() { throw new Error('Fixture fallback') } } as any })
  await page.goto('/#log')
  const migrated = await page.evaluate(async () => {
    const path = '/src/lib/log-storage.ts'
    const { LogDatabase, logOverview } = await import(path)
    const now = Date.now()
    const rows = ['INFO', 'warn'].map((level, index) => ({ sequence: index + 1, scope: 'legacy', receivedAt: now - 100 + index, at: now - 100 + index, timestamp: new Date(now - 100 + index).toISOString(), level, target: 'test', event: 'proxy:accepted', fields: index === 0 ? { dst: 'legacy.example:443' } : {}, spans: [], requestId: '42' }))
    const legacy = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('squirrelboard.logs', 2)
      request.onupgradeneeded = () => {
        const db = request.result
        db.createObjectStore('events', { keyPath: 'sequence', autoIncrement: true })
        const store = db.createObjectStore('overview', { keyPath: 'sequence' })
        store.createIndex('scopeTime', ['scope', 'receivedAt'])
        store.createIndex('requestTime', ['scope', 'requestId', 'receivedAt'])
        store.createIndex('receivedAt', 'receivedAt')
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise<void>((resolve, reject) => {
      const tx = legacy.transaction(['events', 'overview'], 'readwrite')
      for (const row of rows) {
        tx.objectStore('events').put(row)
        const { level: _level, ...overview } = logOverview(row, 'legacy')
        tx.objectStore('overview').put(overview)
      }
      tx.oncomplete = () => resolve()
      tx.onabort = () => reject(tx.error)
    })
    legacy.close()
    const db = new LogDatabase()
    await db.open()
    const view = await db.query('legacy', { end: now, windowMs: 60_000, requestId: '', level: 'WARN', page: 1, limit: 100 })
    const count = await db.count('legacy')
    db.close()
    return { count, matches: view.totalEvents, levels: view.events.map((event: any) => event.level), destination: view.selected.metadata.destination }
  })
  expect(migrated).toEqual({ count: 2, matches: 1, levels: ['warn'], destination: 'legacy.example:443' })
})
