import { test, expect } from 'playwright/test'

test('live refreshes preserve open level menus and uncommitted event-limit edits', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('squirrelboard.secret', 'fixture-secret'))
  let send: (text: string) => void = () => {}
  await page.routeWebSocket('**/api/v1/logs*', ws => { send = text => ws.send(text) })
  await page.goto('/#log?view=waterfall')
  await expect(page.locator('.log-heading')).toContainText('Live')
  const record = (index: number) => JSON.stringify({ timestamp: new Date().toISOString(), level: 'INFO', target: 'test', event: 'proxy:accepted', fields: { req_id: 42, message: `Live event ${index}` }, spans: [] })
  send(record(1))
  await expect(page.locator('.log-heading')).toContainText('1 events')
  const level = page.getByRole('combobox', { name: 'Log level', exact: true })
  const limit = page.getByRole('spinbutton', { name: 'Events per page', exact: true })
  await level.selectOption('INFO')
  await expect(page.locator('.waterfall-dot')).toHaveCount(1)
  await level.evaluate(el => {
    const stats = { mutations: 0, node: el }
    ;(window as any).logControlStats = stats
    new MutationObserver(records => { stats.mutations += records.length }).observe(el, { attributes: true, childList: true, subtree: true })
  })
  for (let count = 2; count <= 4; count++) {
    send(record(count))
    await expect(page.locator('.log-heading')).toContainText(`${count} events`)
  }
  expect.soft(await page.evaluate(() => (window as any).logControlStats.mutations)).toBe(0)
  expect(await level.evaluate(el => el === (window as any).logControlStats.node)).toBe(true)
  await limit.fill('125')
  send(record(5))
  await expect(page.locator('.log-heading')).toContainText('5 events')
  await expect.soft(limit).toHaveValue('125')
  await expect(limit).toBeFocused()
  await limit.press('Enter')
  expect(await page.evaluate(() => localStorage.getItem('squirrelboard.waterfallLimit'))).toBe('125')
  await level.click()
  await expect.poll(() => level.evaluate(el => el.matches(':open'))).toBe(true)
  send(record(6))
  await expect(page.locator('.log-heading')).toContainText('6 events')
  await expect.poll(() => level.evaluate(el => el.matches(':open'))).toBe(true)
  await page.keyboard.press('Escape')
  await level.selectOption('ERROR')
  await expect(page.getByRole('heading', { name: 'No events at ERROR or above in this window' })).toBeVisible()
  await level.selectOption('INFO')
  await expect(page.locator('.waterfall-dot')).toHaveCount(6)
})
