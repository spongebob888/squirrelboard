<script setup lang="ts">
import { Activity } from './icons'
import type { TokioMetric } from '../lib/types'

defineProps<{ metrics: TokioMetric | null; note: string }>()
</script>

<template>
  <section class="panel tokio-panel">
    <div class="panel-heading">
      <div>
        <h2>Tokio runtime</h2>
        <p>Live task and scheduler statistics</p>
      </div>
      <Activity :size="18" class="muted"/>
    </div>
    <div v-if="metrics" class="memory-detail tokio-detail">
      <div class="tokio-alive">
        <span>Alive tasks</span>
        <strong>{{ metrics.num_alive_tasks.toLocaleString() }}</strong>
        <small>Spawned tasks that have not yet exited</small>
      </div>
      <div>
        <span>Workers</span>
        <strong>{{ metrics.num_workers.toLocaleString() }}</strong>
        <small>Runtime worker threads</small>
      </div>
      <div>
        <span>Global queue depth</span>
        <strong>{{ metrics.global_queue_depth.toLocaleString() }}</strong>
        <small>Tasks waiting in the global scheduler queue</small>
      </div>
    </div>
    <div v-else class="empty-state">
      <Activity :size="26"/>
      <h3>Tokio metrics unavailable</h3>
      <p>{{ note || 'Connect to Shadowquic to view live task statistics.' }}</p>
    </div>
    <div v-if="metrics" class="panel-note">Alive tasks include API and background tasks. Global queue depth excludes worker-local queues.</div>
  </section>
</template>

<style scoped>
.tokio-detail {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.tokio-alive strong {
  color: var(--primary);
}
@media (max-width: 740px) {
  .tokio-detail {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .tokio-alive {
    grid-column: 1 / -1;
  }
}
</style>
