import { defineConfig } from 'playwright/test'

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { executablePath: process.env.CHROME_EXECUTABLE_PATH || undefined },
  },
  webServer: [
    { command: 'node tests/fixture-server.mjs', url: 'http://127.0.0.1:19090/__health', reuseExistingServer: false },
    { command: 'npm run dev -- --port 4173 --strictPort', url: 'http://127.0.0.1:4173', env: { SHADOWQUIC_API_URL: 'http://127.0.0.1:19090' }, reuseExistingServer: false },
  ],
})
