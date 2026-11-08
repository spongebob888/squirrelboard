import { test, expect } from 'playwright/test'

for (const width of [1440, 390]) {
  test.describe(`log help at ${width}px`, () => {
    test.use({ viewport: { width, height: 1000 }, hasTouch: width < 740 })

    test('storage help floats without shifting content and supports focus and Escape', async ({ page }) => {
      // Keep the user's live design session separate from browser verification.
      await page.route(/^http:\/\/(?:localhost|127\.0\.0\.1):8400\//, route => route.abort())
      await page.goto('/#log?demo=1')
      const trigger = page.getByRole('button', { name: 'Log storage and timing details' })
      const tip = page.getByRole('tooltip')
      await expect(trigger).toBeVisible()
      await expect(tip).toBeHidden()
      const before = await page.locator('.log-workspace').boundingBox()
      if (width < 740) await trigger.tap()
      else await trigger.hover()
      await expect(tip).toBeVisible()
      await expect(tip).toContainText('Session ID in Connections matches req_id')
      const bounds = (await tip.boundingBox())!
      expect(bounds.x).toBeGreaterThanOrEqual(0)
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
      expect((await page.locator('.log-workspace').boundingBox())!.y).toBe(before!.y)
      if (width > 740) {
        await tip.hover()
        await expect(tip).toBeVisible()
      }
      await page.screenshot({ path: `.impeccable/review/log-help-${width}-light.png`, animations: 'disabled' })
      await page.evaluate(() => document.documentElement.dataset.theme = 'dark')
      await page.screenshot({ path: `.impeccable/review/log-help-${width}-dark.png`, animations: 'disabled' })
      // Escape also dismisses hover-triggered content without moving the pointer.
      await trigger.focus()
      await page.keyboard.press('Escape')
      await expect(tip).toBeHidden()
      await expect(trigger).toBeFocused()
      await page.keyboard.press('Tab')
      await trigger.focus()
      await expect(tip).toBeVisible()
      await page.mouse.move(0, 0)
      await page.keyboard.press('Tab')
      await expect(tip).toBeHidden()
    })

    test('capture counts share the storage summary and tooltip', async ({ page }) => {
      await page.addInitScript(() => sessionStorage.setItem('squirrelboard.secret', 'fixture-secret'))
      await page.routeWebSocket('**/api/v1/logs*', ws => {
        ws.send(JSON.stringify({ timestamp: new Date().toISOString(), level: 'INFO', target: 'test', event: 'proxy:accepted', fields: { req_id: 42 }, spans: [] }))
        ws.send('{"event":"api:logs_lagged","dropped":4}')
        ws.send('invalid record')
      })
      await page.goto('/#log')
      const summary = page.locator('.log-help-summary')
      await expect(summary).toHaveCount(1)
      await expect(summary).toContainText('stored')
      await expect(summary).toContainText('30 min retention')
      const trigger = summary.getByRole('button', { name: 'Log storage and capture details' })
      await expect(trigger).toHaveText('Capture incomplete')
      const tip = page.getByRole('tooltip')
      await expect(tip).toBeHidden()
      if (width < 740) await trigger.tap()
      else await trigger.hover()
      await expect(tip).toBeVisible()
      await expect(tip).toContainText('4 server-dropped events')
      await expect(tip).toContainText('0 stream interruptions')
      await expect(tip).toContainText('0 events removed at the buffer limit')
      await expect(tip).toContainText('1 unreadable records')
      await expect(tip).toContainText('Change the limit in Settings')
      // The whole tip must remain painted even beyond a short panel's bottom edge.
      expect(await tip.evaluate(el => {
        const box = el.getBoundingClientRect()
        const target = document.elementFromPoint(box.x + box.width / 2, box.bottom - 8)
        return !!target && el.contains(target)
      })).toBe(true)
      for (const theme of ['light', 'dark']) {
        await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme)
        await page.screenshot({ path: `.impeccable/review/log-capture-help-${width}-${theme}.png`, animations: 'disabled' })
      }
      if (width < 740) await page.setViewportSize({ width: 320, height: 844 })
      const bounds = (await tip.boundingBox())!
      expect(bounds.x).toBeGreaterThanOrEqual(0)
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width < 740 ? 320 : width)
      await trigger.focus()
      await page.keyboard.press('Escape')
      await expect(tip).toBeHidden()
    })
  })
}
