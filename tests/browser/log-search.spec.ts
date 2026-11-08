import { test, expect } from 'playwright/test'

for (const storage of ['IndexedDB', 'memory']) {
  test(`whole event search filters both log views before pagination in ${storage}`, async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem('squirrelboard.secret', 'fixture-secret'))
    if (storage === 'memory') await page.addInitScript(() => { window.Worker = class { constructor() { throw new Error('Fixture fallback') } } as any })
    let send: (text: string) => void = () => {}
    await page.routeWebSocket('**/api/v1/logs*', ws => { send = text => ws.send(text) })
    await page.goto('/#log')
    await expect(page.locator('.log-heading')).toContainText('Live')
    const record = (message: string, extra = {}, level = 'INFO', id = 42) => JSON.stringify({
      timestamp: new Date().toISOString(), level, target: 'shadowquic::search_test', event: 'stream:accepted',
      fields: { message, req_id: id, ...extra },
      spans: [{ name: 'tcp_req', fields: { req_id: id, dst: 'search.example:443' } }],
    })
    for (let i = 0; i < 105; i++) send(record('ordinary event'))
    send(record('Needle message', { attempts: 0, cached: false }, 'WARN'))
    send(record('Other request', { secret: 'other-value' }, 'ERROR', 43))
    await expect(page.locator('.log-heading')).toContainText('107 events')
    const search = page.getByRole('searchbox', { name: 'Search events', exact: true })
    await search.fill('NEEDLE MESSAGE')
    await expect(page.locator('.log-heading')).toContainText('1 events')
    await expect(page.locator('.log-events li')).toHaveCount(1)
    await expect(page.locator('.log-events')).toContainText('Needle message')
    await expect(page.locator('.log-destination')).toContainText('search.example:443')
    await expect(page.getByRole('button', { name: 'Next events', exact: true })).toHaveCount(0)
    for (const query of ['attempts=0', 'cached=false', 'dst=SEARCH.EXAMPLE:443', 'tcp_req', 'shadowquic::search_test', 'stream:accepted', 'req_id=42']) {
      await search.fill(query)
      await search.press('Enter')
      await expect(page.locator('.log-heading')).toContainText(query === 'attempts=0' || query === 'cached=false' ? '1 events' : query === 'req_id=42' ? '106 events' : '107 events')
    }
    await search.fill('needle')
    await page.getByRole('link', { name: 'Waterfall', exact: true }).click()
    await expect(page.locator('.waterfall-dot')).toHaveCount(1)
    await expect(page.locator('.waterfall-event-list button')).toHaveCount(1)
    await page.getByRole('combobox', { name: 'Log level', exact: true }).selectOption('ERROR')
    await expect(page.getByRole('heading', { name: 'No events match this search', exact: true })).toBeVisible()
    await page.getByRole('combobox', { name: 'Log level', exact: true }).selectOption('')
    await search.fill('')
    await expect(page.locator('.waterfall-dot')).toHaveCount(107)
    await page.getByRole('link', { name: 'Request timelines', exact: true }).click()
    await page.getByRole('button', { name: /Request 42 / }).click()
    await search.fill('other-value')
    await expect(page.getByRole('heading', { name: 'Request 42 has no events matching this search', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Show newest request', exact: true }).click()
    await expect(page.locator('.log-events')).toContainText('Other request')
    await page.getByLabel('Request ID', { exact: true }).fill('42')
    await expect(page.getByRole('heading', { name: 'No events match this search', exact: true })).toBeVisible()
    await search.fill('')
    await expect(page.locator('.log-heading')).toContainText('106 events')
    await search.fill('needle')
    await expect(page.locator('.log-heading')).toContainText('1 events')
    await page.getByRole('button', { name: 'Freeze view', exact: true }).click()
    send(record('needle future'))
    await expect(page.locator('.log-help-summary')).toContainText('108')
    await expect(page.locator('.log-heading')).toContainText('1 events')
    await page.getByRole('button', { name: 'Follow live', exact: true }).click()
    await expect(page.locator('.log-heading')).toContainText('2 events')
    await page.addStyleTag({ content: '[id^="impeccable-live"] { visibility: hidden !important; pointer-events: none !important; }' })
    if (storage === 'IndexedDB') {
      await page.screenshot({ path: '.impeccable/review/log-search-desktop.png', animations: 'disabled' })
      await page.setViewportSize({ width: 390, height: 844 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: '.impeccable/review/log-search-mobile.png', animations: 'disabled' })
      await page.getByRole('link', { name: 'Waterfall', exact: true }).click()
      await expect(page.locator('.waterfall-dot')).toHaveCount(2)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: '.impeccable/review/log-search-waterfall-mobile.png', animations: 'disabled' })
      await page.setViewportSize({ width: 1440, height: 1000 })
      await page.evaluate(() => document.documentElement.dataset.theme = 'dark')
      await page.screenshot({ path: '.impeccable/review/log-search-waterfall-dark.png', animations: 'disabled' })
    }
  })
}

test('search migration, batched timestamps, retention and backend isolation', async ({ page }) => {
  await page.addInitScript(() => { window.Worker = class { constructor() { throw new Error('Fixture fallback') } } as any })
  await page.goto('/#log')
  const summary = await page.evaluate(async () => {
    const path = '/src/lib/log-storage.ts'
    const { LogDatabase, logOverview } = await import(path)
    const now = Date.now()
    const row = (i: number, scope = 'legacy') => ({
      sequence: i + 1, scope, receivedAt: now, at: now + i, timestamp: new Date(now + i).toISOString(),
      level: 'WARN', target: 'test', event: 'stream:accepted', requestId: '42',
      fields: { message: i === 1000 ? 'Late needle' : 'ordinary', ...(i === 0 ? { dst: 'retained.example:443' } : {}) }, spans: [],
    })
    const legacy = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('squirrelboard.logs', 3)
      request.onupgradeneeded = () => {
        request.result.createObjectStore('events', { keyPath: 'sequence', autoIncrement: true })
        const store = request.result.createObjectStore('overview', { keyPath: 'sequence' })
        store.createIndex('scopeTime', ['scope', 'receivedAt'])
        store.createIndex('requestTime', ['scope', 'requestId', 'receivedAt'])
        store.createIndex('receivedAt', 'receivedAt')
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise<void>((resolve, reject) => {
      const tx = legacy.transaction(['events', 'overview'], 'readwrite')
      for (let i = 0; i < 1002; i++) {
        const event = row(i, i === 1001 ? 'other-backend' : 'legacy')
        if (i === 1001) event.fields.message = 'Late needle'
        tx.objectStore('events').put(event)
        tx.objectStore('overview').put(logOverview(event, event.scope))
      }
      tx.oncomplete = () => resolve()
      tx.onabort = () => reject(tx.error)
    })
    legacy.close()
    const db = new LogDatabase()
    await db.open()
    const query = { end: now, windowMs: 60_000, search: 'LATE NEEDLE', requestId: '', page: 1, limit: 1 }
    const timeline = await db.query('legacy', query)
    const waterfall = await db.query('legacy', { ...query, mode: 'waterfall' })
    const exact = await db.query('legacy', { ...query, requestId: '42' })
    const frozen = await db.query('legacy', { ...query, end: now - 1 })
    const count = await db.count('legacy')
    // Capacity eviction must remove text and bodies together.
    await db.append('legacy', [], 1, now)
    const evicted = await db.query('legacy', query)
    // Expired events must also disappear from search.
    await db.append('legacy', [], 1000, now + 1_800_001)
    db.close()
    const stores = await new Promise<any>((resolve, reject) => {
      const open = indexedDB.open('squirrelboard.logs')
      open.onsuccess = async () => {
        const conn = open.result
        const tx = conn.transaction(['events', 'overview', 'search'])
        const counts = await Promise.all(['events', 'overview', 'search'].map(name => new Promise(resolve => { const r = tx.objectStore(name).count(); r.onsuccess = () => resolve(r.result) })))
        conn.close()
        resolve(counts)
      }
      open.onerror = () => reject(open.error)
    })
    return { count, total: timeline.totalEvents, message: timeline.events[0]?.fields.message, destination: timeline.selected?.metadata.destination, dots: waterfall.waterfall?.points.length, exact: exact.totalEvents, frozen: frozen.totalEvents, evicted: evicted.totalEvents, stores }
  })
  expect(summary).toEqual({ count: 1001, total: 1, message: 'Late needle', destination: 'retained.example:443', dots: 1, exact: 1, frozen: 0, evicted: 0, stores: [0, 0, 0] })
})
