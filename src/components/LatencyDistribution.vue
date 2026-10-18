<script setup lang="ts">
import { computed, ref } from 'vue'
import { Activity, Clock3, Radio } from './icons'
import { latencyDistributions } from '../lib/latency'
import type { LatencySample } from '../lib/types'

const props = defineProps<{ samples: LatencySample[]; outbounds: string[]; asOf: number }>()
const windowMinutes = ref(30)
const distributions = computed(() => latencyDistributions(props.samples, props.outbounds, props.asOf - windowMinutes.value * 60000))
const sampleCount = computed(() => distributions.value.reduce((sum, group) => sum + group.count, 0))
const latency = (value: number | null) => value == null ? '—' : `${Number(value.toFixed(1))} ms`
const bucketStep = (count: number) => 504 / count
const bucketCenter = (index: number, count: number) => 56 + (index + .5) * bucketStep(count)
function showBucketLabel(index: number, count: number) {
  const intervals = Math.min(6, count - 1)
  return Array.from({ length: intervals + 1 }, (_, tick) => Math.round(tick * (count - 1) / Math.max(1, intervals))).includes(index)
}
</script>

<template>
  <section class="panel latency-panel">
    <div class="panel-heading">
      <div>
        <h2>First-response latency distribution</h2>
        <p>Current and previously observed sessions, grouped by outbound</p>
      </div>
      <select v-model.number="windowMinutes" aria-label="Latency history window">
        <option :value="5">Last 5 minutes</option>
        <option :value="15">Last 15 minutes</option>
        <option :value="30">Last 30 minutes</option>
      </select>
    </div>
    <div class="latency-overview">
      <span><Activity :size="14"/>{{ sampleCount.toLocaleString() }} measured {{ sampleCount === 1 ? 'session' : 'sessions' }}</span>
      <span><Clock3 :size="13"/>Share of responses per latency bucket</span>
    </div>
    <div v-if="distributions.length" class="latency-grid">
      <article v-for="group in distributions" :key="group.outbound" class="latency-outbound">
        <div class="latency-outbound-heading">
          <h3><Radio :size="16"/><span>{{ group.outbound }}</span></h3>
          <span class="count-badge">{{ group.count.toLocaleString() }} {{ group.count === 1 ? 'sample' : 'samples' }}</span>
        </div>
        <template v-if="group.count">
          <dl class="latency-summary">
            <div><dt>Median</dt><dd>{{ latency(group.median) }}</dd></div>
            <div><dt>P95</dt><dd>{{ latency(group.p95) }}</dd></div>
            <div><dt>Average</dt><dd>{{ latency(group.mean) }}</dd></div>
          </dl>
          <div class="latency-bin-label">{{ group.binWidth == null ? 'Coarse bins' : `Adaptive bins · ${group.binWidth} ms` }}</div>
          <div class="latency-plot-scroll">
            <svg class="latency-plot" viewBox="0 0 600 195" role="img" :aria-label="`${group.outbound}: first-response latency distribution for ${group.count} sessions`">
              <desc>{{ group.buckets.map(bucket => `${bucket.label} milliseconds: ${bucket.count} sessions (${bucket.percent.toFixed(1)}%)`).join('; ') }}</desc>
              <g v-for="tick in [0, 25, 50, 75, 100]" :key="tick">
                <path :d="`M56 ${150 - tick * 1.25}H572`" class="latency-gridline"/>
                <text x="46" :y="154 - tick * 1.25" text-anchor="end" class="latency-axis">{{ tick }}%</text>
              </g>
              <g v-for="(bucket, index) in group.buckets" :key="bucket.label" class="latency-bucket">
                <rect :x="bucketCenter(index, group.buckets.length) - bucketStep(group.buckets.length) / 3" :y="150 - bucket.percent * 1.25" :width="bucketStep(group.buckets.length) * 2 / 3" :height="bucket.percent * 1.25" :rx="Math.min(3, bucketStep(group.buckets.length) / 6)" class="latency-bar">
                  <title>{{ bucket.label }} ms: {{ bucket.count }} sessions ({{ bucket.percent.toFixed(1) }}%)</title>
                </rect>
                <text v-if="bucket.count && group.buckets.length <= 12" :x="bucketCenter(index, group.buckets.length)" :y="143 - bucket.percent * 1.25" text-anchor="middle" class="latency-count">{{ bucket.count }}</text>
                <text v-if="showBucketLabel(index, group.buckets.length)" :x="bucketCenter(index, group.buckets.length)" y="173" text-anchor="middle" class="latency-axis">{{ bucket.label }}</text>
              </g>
              <text x="572" y="190" text-anchor="end" class="latency-axis">First response (ms)</text>
            </svg>
          </div>
        </template>
        <div v-else class="latency-no-samples">
          <Clock3 :size="20"/>
          <span>No first-response samples in this window</span>
        </div>
      </article>
    </div>
    <div v-else class="empty-state">
      <Radio :size="28"/>
      <h3>No latency samples yet</h3>
      <p>Observed first responses will appear here as sessions flow through your outbounds.</p>
    </div>
    <div class="panel-note">Each session is counted once; waiting and unavailable responses are excluded. This tab keeps up to 10,000 samples for 30 minutes. History resets on reload or backend reconnect.</div>
  </section>
</template>

<style scoped>
.latency-overview {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 0 21px 18px;
  font-size: 10px;
  color: var(--muted);
  flex-wrap: wrap;
}
.latency-overview span {
  display: flex;
  align-items: center;
  gap: 6px;
}
.latency-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 400px), 1fr));
  gap: 16px;
  padding: 0 21px 21px;
}
.latency-outbound {
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px 14px 10px;
}
.latency-outbound-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.latency-outbound-heading h3 {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 11px;
}
.latency-outbound-heading h3 span {
  overflow-wrap: anywhere;
}
.latency-outbound-heading h3 svg {
  color: var(--primary);
  flex-shrink: 0;
}
.count-badge {
  white-space: nowrap;
}
.latency-summary {
  display: flex;
  gap: 28px;
  margin: 18px 0 8px;
  flex-wrap: wrap;
}
.latency-summary dt {
  color: var(--muted);
  font-size: 9px;
}
.latency-summary dd {
  margin: 5px 0 0;
  font-size: 15px;
  font-weight: 550;
  font-variant-numeric: tabular-nums;
}
.latency-plot-scroll {
  overflow-x: auto;
}
.latency-bin-label {
  color: var(--muted);
  font-size: 9px;
  margin-bottom: 6px;
}
.latency-plot {
  display: block;
  width: 100%;
  min-width: 400px;
}
.latency-gridline {
  stroke: var(--line);
  stroke-dasharray: 3 4;
}
.latency-axis {
  fill: var(--muted);
  font-size: 12px;
}
.latency-count {
  fill: var(--secondary);
  font-size: 12px;
}
.latency-bar {
  fill: var(--primary);
  opacity: .75;
}
.latency-bucket:hover .latency-bar {
  opacity: 1;
}
.latency-no-samples {
  min-height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--muted);
  font-size: 10px;
}
@media (max-width: 740px) {
  .latency-panel > .panel-heading {
    flex-wrap: wrap;
  }
  .latency-grid {
    padding: 0 15px 16px;
    gap: 12px;
  }
  .latency-overview {
    padding: 0 16px 16px;
    font-size: 9px;
  }
}
</style>
