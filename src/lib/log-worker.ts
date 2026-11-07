import { LogDatabase, validLogLimit, type LogQuery } from './log-storage'
import type { LogEvent } from './logs'

const db = new LogDatabase()
let opened = false
let queue = Promise.resolve()
self.onmessage = event => {
  const { id, operation, scope, events, max, now, query } = event.data as {
    id: number; operation: 'append' | 'query'; scope: string; events: LogEvent[]; max: number; now: number; query: LogQuery
  }
  queue = queue.then(async () => {
    try {
      if (!opened) { await db.open(); opened = true }
      if (operation === 'append' && !validLogLimit(max)) throw new Error('Invalid log event limit')
      const value = operation === 'append' ? await db.append(scope, events, max, now) : await db.query(scope, query)
      self.postMessage({ id, value })
    } catch (error) {
      self.postMessage({ id, error: error instanceof Error ? error.message : 'Log storage failed' })
    }
  })
}
