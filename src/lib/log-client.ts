import LogWorker from './log-worker?worker&inline'
import type { LogEvent } from './logs'
import type { LogQuery, LogView } from './log-storage'

export class LogStorageClient {
  private worker = new LogWorker()
  private next = 0
  private failure: Error | null = null
  private pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>()
  constructor() {
    this.worker.onmessage = ({ data }) => {
      const task = this.pending.get(data.id)
      if (!task) return
      this.pending.delete(data.id)
      if (data.error) task.reject(new Error(data.error)); else task.resolve(data.value)
    }
    this.worker.onerror = () => this.fail(new Error('Log storage worker could not start'))
  }
  private fail(error: Error) { this.failure = error; for (const task of this.pending.values()) task.reject(error); this.pending.clear() }
  private send<T>(message: object): Promise<T> {
    return new Promise((resolve, reject) => {
      if (this.failure) { reject(this.failure); return }
      const id = ++this.next
      this.pending.set(id, { resolve, reject })
      try { this.worker.postMessage({ ...message, id }) } catch (error) { this.pending.delete(id); reject(error) }
    })
  }
  append(scope: string, events: LogEvent[], max: number, now: number) { return this.send<{ count: number; evicted: number }>({ operation: 'append', scope, events, max, now }) }
  query(scope: string, query: LogQuery) { return this.send<LogView>({ operation: 'query', scope, query }) }
  close() { this.worker.terminate(); this.fail(new Error('Log storage closed')) }
}
