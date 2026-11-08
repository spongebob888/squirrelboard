<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { LOG_CATEGORIES, logCategory, logFields, type LogEvent } from '../lib/logs'
import type { WaterfallPoint, WaterfallView } from '../lib/log-storage'

const props = defineProps<{ data: WaterfallView; selectedSequence?: number; event?: LogEvent }>()
const emit = defineEmits<{ select: [sequence: number]; request: [id: string]; offset: [offset: number] }>()
const chart = ref<HTMLElement | null>(null)
const categories = Object.entries(LOG_CATEGORIES)
const lanes = computed(() => categories.map(([category, label]) => ({ category, label, points: props.data.points.filter(point => logCategory(point.event) === category), count: props.data.counts[category as keyof typeof LOG_CATEGORIES] })))
const range = computed(() => props.data.end - props.data.start)
const ticks = computed(() => range.value === 0 ? [{ fraction: 0, at: props.data.start }, { fraction: 1, at: props.data.end }] : Array.from({ length: 5 }, (_, index) => ({ fraction: index / 4, at: props.data.start + range.value * index / 4 })))
const position = (point: WaterfallPoint) => range.value === 0 ? 50 : (point.at - props.data.start) / range.value * 100
const time = (at: number) => new Date(at).toLocaleTimeString([], { hour12: false }) + `.${String(new Date(at).getMilliseconds()).padStart(3, '0')}`
const description = (point: WaterfallPoint) => `${time(point.at)} · ${point.level} · ${point.event || 'Unlabelled event'} · ${point.requestId === null ? 'Unscoped' : `Request ${point.requestId}`}`
const tabSequence = computed(() => props.data.points.some(point => point.sequence === props.selectedSequence) ? props.selectedSequence : props.data.points[0]?.sequence)
const detail = computed(() => props.event?.sequence === props.selectedSequence ? props.event : undefined)
const fields = computed(() => detail.value ? logFields(detail.value.fields) : [])
async function key(event: KeyboardEvent, point: WaterfallPoint) {
  const index = props.data.points.findIndex(item => item.sequence === point.sequence)
  const next = event.key === 'ArrowRight' ? Math.min(index + 1, props.data.points.length - 1) : event.key === 'ArrowLeft' ? Math.max(0, index - 1) : event.key === 'Home' ? 0 : event.key === 'End' ? props.data.points.length - 1 : -1
  if (next < 0) return
  event.preventDefault()
  const sequence = props.data.points[next]!.sequence
  emit('select', sequence)
  await nextTick()
  chart.value?.querySelector<HTMLButtonElement>(`[data-event-sequence="${sequence}"]`)?.focus()
}
</script>

<template>
  <div class="log-waterfall">
    <div class="waterfall-heading"><h3>Events by category</h3><span>{{ data.total.toLocaleString() }} events · Server time</span></div>
    <p class="waterfall-guide">Select a dot to inspect an event. Use left and right arrow keys to move through events in time order.</p>
    <div ref="chart" class="waterfall-scroll" role="region" aria-label="Event waterfall by category" tabindex="0">
      <div class="waterfall-chart">
        <div class="waterfall-axis"><span>Category</span><div class="waterfall-scale"><time v-for="tick in ticks" :key="tick.fraction" :style="{ left: `${tick.fraction * 100}%`, transform: `translateX(-${tick.fraction * 100}%)` }" :datetime="new Date(tick.at).toISOString()">{{ time(tick.at) }}</time></div></div>
        <div v-for="lane in lanes" :key="lane.category" class="waterfall-row" :class="`category-${lane.category}`" role="group" :aria-label="`${lane.label}: ${lane.count} events`">
          <div class="waterfall-label"><div class="waterfall-label-content"><span><i aria-hidden="true"/>{{ lane.label }}</span><small>{{ lane.count.toLocaleString() }} {{ lane.count === 1 ? 'event' : 'events' }}</small></div></div>
          <div class="waterfall-track"><div class="waterfall-plot">
            <i v-for="tick in ticks" :key="tick.fraction" class="waterfall-gridline" :style="{ left: `${tick.fraction * 100}%` }" aria-hidden="true"/>
            <button v-for="point in lane.points" :key="point.sequence" class="waterfall-dot" :class="{ selected: selectedSequence === point.sequence }" :style="{ left: `${position(point)}%` }" :data-event-sequence="point.sequence" :tabindex="tabSequence === point.sequence ? 0 : -1" :aria-label="description(point)" :title="description(point)" :aria-pressed="selectedSequence === point.sequence" aria-keyshortcuts="ArrowLeft ArrowRight Home End" @click="emit('select', point.sequence)" @keydown="key($event, point)"><span aria-hidden="true"/></button>
          </div></div>
        </div>
      </div>
    </div>
    <div v-if="data.total > data.limit" class="waterfall-pagination"><button class="button small" :disabled="data.offset === 0" @click="emit('offset', Math.max(0, data.offset - data.limit))">Previous events</button><span>{{ data.offset + 1 }}–{{ Math.min(data.offset + data.limit, data.total) }} of {{ data.total.toLocaleString() }}</span><button class="button small" :disabled="data.offset + data.limit >= data.total" @click="emit('offset', data.offset + data.limit)">Next events</button></div>
    <p v-if="data.total > data.limit" class="waterfall-guide">Category totals cover the filtered window. Dots show this event page.</p>
    <section class="waterfall-detail" aria-label="Selected waterfall event" aria-live="polite">
      <template v-if="detail">
        <div class="waterfall-detail-heading" :class="`category-${logCategory(detail.event)}`"><h3>{{ detail.event || 'Unlabelled event' }}</h3><span><span class="waterfall-level" :class="detail.level.toLowerCase()">{{ detail.level }}</span> · {{ time(detail.at) }}</span></div>
        <p class="waterfall-event-context">{{ LOG_CATEGORIES[logCategory(detail.event)] }} · {{ detail.requestId === null ? 'Unscoped event' : `Request ${detail.requestId}` }} · {{ detail.target }}</p>
        <p v-if="detail.fields.message != null || fields.length" class="waterfall-message"><span v-if="detail.fields.message != null">{{ detail.fields.message }}</span><template v-for="[name, value] in fields" :key="name">{{ ' ' }}<span class="waterfall-field"><span>{{ name }}=</span>{{ value }}</span></template></p>
        <details><summary>Fields &amp; spans</summary><pre>{{ JSON.stringify({ fields: detail.fields, spans: detail.spans }, null, 2) }}</pre></details>
        <button v-if="detail.requestId !== null" class="text-button" @click="emit('request', detail.requestId)">View request {{ detail.requestId }} timeline</button>
      </template>
      <p v-else>{{ selectedSequence === undefined ? 'Select an event dot to see its message, request, fields, and spans.' : data.points.some(point => point.sequence === selectedSequence) ? 'Loading event details…' : 'This event is no longer in the current view. Select another dot or adjust the filters.' }}</p>
    </section>
  </div>
</template>

<style scoped>
.category-connection { --event-color: var(--log-connection); }
.category-routing { --event-color: var(--primary); }
.category-dns { --event-color: var(--teal); }
.category-sniffing { --event-color: var(--log-sniffing); }
.category-security { --event-color: var(--amber); }
.category-transport { --event-color: var(--green); }
.category-other { --event-color: var(--secondary); }
.log-waterfall { padding: 16px 21px 21px; border-top: 1px solid var(--border); min-width: 0; }
.waterfall-heading, .waterfall-detail-heading { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 8px 16px; }
.waterfall-heading h3, .waterfall-detail-heading h3 { margin: 0; font-size: 14px; overflow-wrap: anywhere; }
.waterfall-heading > span, .waterfall-detail-heading > span, .waterfall-guide, .waterfall-event-context { color: var(--secondary); font-size: 12px; }
.waterfall-guide { margin: 8px 0 16px; }
.waterfall-scroll { overflow: auto; max-height: 65vh; border: 1px solid var(--border); border-radius: 7px; overscroll-behavior: contain; }
.waterfall-chart { min-width: 740px; }
.waterfall-axis, .waterfall-row { display: grid; grid-template-columns: 145px minmax(0, 1fr); }
.waterfall-axis { position: sticky; top: 0; z-index: 3; height: 42px; align-items: center; background: var(--bg); border-bottom: 1px solid var(--border); color: var(--secondary); font-size: 11px; }
.waterfall-axis > span { position: sticky; left: 0; z-index: 2; padding-left: 14px; height: 100%; display: flex; align-items: center; background: var(--bg); }
.waterfall-scale { position: relative; margin: 0 14px; height: 18px; font-variant-numeric: tabular-nums; }
.waterfall-scale time { position: absolute; white-space: nowrap; }
.waterfall-row { min-height: 44px; border-bottom: 1px solid var(--line); }
.waterfall-row:last-child { border-bottom: 0; }
.waterfall-label { position: sticky; left: 0; z-index: 2; padding: 6px 14px; border-right: 1px solid var(--border); background: var(--surface); }
.waterfall-label-content { position: sticky; top: 48px; display: grid; gap: 1px; line-height: 1.3; }
.waterfall-label-content > span { display: flex; align-items: center; gap: 7px; color: color-mix(in srgb, var(--event-color) 60%, var(--text)); font-size: 12px; font-weight: 600; }
.waterfall-label i { width: 6px; height: 6px; border-radius: 50%; background: var(--event-color); }
.waterfall-label small { color: var(--secondary); font-size: 10px; font-variant-numeric: tabular-nums; }
.waterfall-track { min-width: 0; }
.waterfall-plot { position: relative; height: 100%; min-height: 44px; margin: 0 14px; }
.waterfall-gridline { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--line); }
.waterfall-dot { position: absolute; top: 50%; width: 28px; height: 32px; padding: 0; transform: translate(-50%, -50%); display: grid; place-items: center; border-radius: 7px; background: transparent; }
.waterfall-dot > span { width: 8px; height: 8px; border-radius: 50%; background: color-mix(in srgb, var(--event-color) 60%, var(--text)); }
.waterfall-dot:hover, .waterfall-dot.selected { background: var(--primary-soft); z-index: 1; }
.waterfall-dot.selected > span { outline: 1px solid var(--text); outline-offset: 2px; }
.waterfall-pagination { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 12px; padding-top: 14px; font-size: 12px; color: var(--secondary); }
.waterfall-detail { border-top: 1px solid var(--border); padding-top: 16px; margin-top: 16px; font-size: 12px; }
.waterfall-detail > p { color: var(--secondary); margin: 8px 0; }
.waterfall-detail-heading h3 { color: color-mix(in srgb, var(--event-color) 60%, var(--text)); }
.waterfall-level.warn { color: var(--amber); }
.waterfall-level.error { color: var(--red); }
.waterfall-message { white-space: pre-wrap; overflow-wrap: anywhere; }
.waterfall-field, .waterfall-detail pre { font-family: ui-monospace, monospace; font-size: 11px; }
.waterfall-field > span { color: var(--secondary); }
.waterfall-detail summary { cursor: pointer; padding: 8px 0; color: var(--secondary); }
.waterfall-detail pre { white-space: pre-wrap; overflow-wrap: anywhere; padding: 12px; background: var(--bg); border-radius: 7px; line-height: 1.6; }
.waterfall-detail .text-button { margin-top: 12px; }
@media (max-width: 740px) { .log-waterfall { padding-inline: 15px; } .waterfall-axis, .waterfall-row { grid-template-columns: 115px minmax(0, 1fr); } }
</style>
