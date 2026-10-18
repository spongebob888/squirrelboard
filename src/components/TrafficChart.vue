<script setup lang="ts">
import { computed, ref } from 'vue'
import { bytes } from '../lib/metrics'
import type { Sample } from '../lib/types'

const props = defineProps<{ samples: Sample[]; compact?: boolean }>()
const hover = ref<number | null>(null)
const ceiling = computed(() => Math.max(1024, ...props.samples.flatMap((s: Sample) => [s.download, s.upload])) * 1.2)
const left = computed(() => (props.samples.at(-1)?.at ?? Date.now()) - 120000)
const x = (sample: Sample) => Math.max(0, Math.min(800, (sample.at - left.value) / 120000 * 800))
const y = (value: number) => 160 - value / ceiling.value * 150
function line(key: 'download' | 'upload') {
  return props.samples.map((s: Sample, i: number) => `${i ? 'L' : 'M'}${x(s).toFixed(1)},${y(s[key]).toFixed(1)}`).join(' ')
}
const area = computed(() => props.samples.length > 1 ? `${line('download')} L${x(props.samples.at(-1)!)},160 L${x(props.samples[0]!)},160 Z` : '')
const hovered = computed(() => hover.value == null ? null : props.samples[hover.value])
function move(event: PointerEvent) {
  const rect = (event.currentTarget as SVGElement).getBoundingClientRect()
  const at = left.value + Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * 120000
  hover.value = props.samples.reduce((best: number, s: Sample, i: number) => Math.abs(s.at - at) < Math.abs(props.samples[best]!.at - at) ? i : best, 0)
}
</script>

<template>
  <div class="traffic-chart" :class="{ compact }">
    <div v-if="!compact" class="chart-scale"><span v-for="factor in [1, .75, .5, .25, 0]" :key="factor">{{ bytes(ceiling * factor, 0) }}/s</span></div>
    <div class="chart-canvas">
      <svg viewBox="0 0 800 170" preserveAspectRatio="none" role="img" aria-label="Download and upload speed over the last two minutes" @pointermove="move" @pointerleave="hover = null">
        <defs><linearGradient :id="compact ? 'fill-small' : 'fill-main'" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--primary)" stop-opacity=".19"/><stop offset="100%" stop-color="var(--primary)" stop-opacity=".01"/></linearGradient></defs>
        <path v-if="!compact" v-for="n in [10, 47.5, 85, 122.5, 160]" :key="n" :d="`M0 ${n}H800`" stroke="var(--line)" stroke-dasharray="3 5" />
        <path :d="area" :fill="`url(#${compact ? 'fill-small' : 'fill-main'})`" />
        <path :d="line('download')" fill="none" stroke="var(--primary)" :stroke-width="compact ? 2 : 2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round" />
        <path :d="line('upload')" fill="none" stroke="var(--teal)" :stroke-width="compact ? 1.5 : 2" vector-effect="non-scaling-stroke" stroke-linejoin="round" />
        <template v-if="hovered && !compact"><path :d="`M${x(hovered)} 0V160`" stroke="var(--muted)" stroke-dasharray="4 4"/><circle :cx="x(hovered)" :cy="y(hovered.download)" r="4" fill="var(--primary)" /></template>
      </svg>
      <div v-if="hovered && !compact" class="chart-tooltip" :style="{ left: `${Math.max(16, Math.min(78, x(hovered) / 8))}%` }"><b>{{ new Date(hovered.at).toLocaleTimeString() }}</b><span>↓ {{ bytes(hovered.download) }}/s</span><span>↑ {{ bytes(hovered.upload) }}/s</span></div>
      <div v-if="samples.length < 2 && !compact" class="chart-empty">{{ samples.length ? 'Collecting traffic samples…' : 'Traffic history will appear here' }}</div>
      <div v-if="!compact" class="chart-times"><span>2 min ago</span><span>90s</span><span>60s</span><span>30s</span><span>Now</span></div>
    </div>
  </div>
</template>
