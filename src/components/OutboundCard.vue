<script setup lang="ts">
import { computed } from 'vue'
import { ArrowUpRight, Check, Circle, LoaderCircle, Radio, Zap } from './icons'
import type { Outbound } from '../lib/types'
const props = defineProps<{ outbound: Outbound; selected?: boolean; selectable?: boolean; probing?: boolean; disabled?: boolean }>()
defineEmits<{ probe: []; select: []; inspect: [] }>()
const probe = computed(() => props.outbound.quality.probe)
const latencyClass = computed(() => probe.value?.status !== 'ok' ? 'muted' : (probe.value.latency_ms ?? 0) < 100 ? 'good' : (probe.value.latency_ms ?? 0) < 250 ? 'warn' : 'bad')
const flag = computed(() => {
  const tag = props.outbound.tag.toLowerCase()
  if (/tokyo|japan|\bjp\b/.test(tag)) return '🇯🇵'
  if (/singapore|\bsg\b/.test(tag)) return '🇸🇬'
  if (/hong.?kong|\bhk\b/.test(tag)) return '🇭🇰'
  if (/los angeles|united states|\bus\b/.test(tag)) return '🇺🇸'
  return ''
})
</script>

<template>
  <div class="outbound-card" :class="{ selected, selectable }">
    <button class="outbound-main" :disabled="disabled" :aria-pressed="selectable ? selected : undefined" @click="selectable ? $emit('select') : $emit('inspect')">
      <span class="node-icon" :class="{ 'has-flag': flag }"><span v-if="flag">{{ flag }}</span><ArrowUpRight v-else-if="outbound.tag.toLowerCase() === 'direct'" :size="20"/><Radio v-else :size="19"/></span>
      <span class="outbound-label"><strong>{{ outbound.tag }}</strong><small>{{ outbound.selector ? 'Selector' : outbound.quality.sq_conn_stats ? 'QUIC transport' : 'Outbound' }}</small></span>
      <span v-if="selectable" class="node-check"><Check v-if="selected" :size="13"/><Circle v-else :size="16"/></span>
    </button>
    <div class="outbound-bottom"><span class="latency" :class="latencyClass"><i/><template v-if="probe?.status === 'ok'">{{ probe.latency_ms }} <small>ms</small></template><template v-else>{{ probe ? probe.status === 'timeout' ? 'Timed out' : 'Failed' : 'Untested' }}</template></span><button class="probe-button" :disabled="probing || disabled" :aria-label="`Test latency for ${outbound.tag}`" @click="$emit('probe')"><LoaderCircle v-if="probing" :size="14" class="spin"/><Zap v-else :size="14"/>{{ probing ? 'Testing' : 'Test' }}</button></div>
  </div>
</template>
