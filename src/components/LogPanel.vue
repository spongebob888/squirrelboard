<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { LOG_CATEGORIES, logCategory, logFields, requestMetadata, type LogEvent, type RequestMetadata } from '../lib/logs'
import { emptyLogView, type LogQuery, type LogView, type RequestSummary } from '../lib/log-storage'
import type { Connection } from '../lib/types'

const props = defineProps<{ revision: number; storageEpoch: number; storedCount: number; maxEvents: number; storageError: string; query: (options: LogQuery) => Promise<LogView>; now: number; state: string; dropped: number; invalid: number; evicted: number; gaps: number; requestId: string; connections: Connection[] }>()
const emit = defineEmits<{ request: [id: string]; retry: [] }>()
const windowMs = ref(300_000)
const frozen = ref<number | null>(null)
const selectedId = ref<string | null | undefined>(props.requestId || undefined)
const requestPage = ref(1)
const eventOffset = ref(0)
const view = shallowRef(emptyLogView())
const loading = ref(true)
const queryError = ref('')
let running = false
let dirty = false
let alive = true
onBeforeUnmount(() => { alive = false })
const end = computed(() => frozen.value ?? props.now)
const options = (): LogQuery => ({ end: end.value, windowMs: windowMs.value, requestId: props.requestId.trim(), selectedId: selectedId.value, page: requestPage.value, limit: 100, offset: eventOffset.value })
const controls = () => JSON.stringify([props.storageEpoch, windowMs.value, props.requestId, selectedId.value, requestPage.value, eventOffset.value, frozen.value])
async function load() {
  dirty = true
  if (running) return
  running = true
  try {
    while (dirty && alive) {
      dirty = false
      const key = controls()
      try {
        const result = await props.query(options())
        if (alive && key === controls()) {
          view.value = result
          requestPage.value = result.page
          if (eventOffset.value >= (result.selected?.count ?? 0) && eventOffset.value > 0) eventOffset.value = 0
          queryError.value = ''
        }
      } catch {
        if (alive && key === controls()) queryError.value = 'Could not read stored logs. Capture will retry using the available storage.'
      } finally { if (alive) loading.value = false }
    }
  } finally { running = false }
}
watch(() => props.requestId, id => { selectedId.value = id || undefined; requestPage.value = 1; eventOffset.value = 0 })
watch(windowMs, () => { requestPage.value = 1; eventOffset.value = 0 })
watch(() => props.storageEpoch, () => { frozen.value = null; view.value = emptyLogView(); loading.value = true })
watch(controls, () => { void load() }, { immediate: true })
watch(() => props.revision, () => { if (frozen.value === null) void load() })
const selected = computed(() => view.value.selected)
const pages = computed(() => view.value.pages)
const connectionsById = computed(() => new Map(props.connections.map(connection => [String(connection.id), connection])))
function metadataFor(request: RequestSummary): RequestMetadata {
  const live = requestMetadata([], request.id, request.id === null ? undefined : connectionsById.value.get(request.id))
  return Object.fromEntries(Object.entries(request.metadata).map(([key, value]) => [key, live[key as keyof RequestMetadata] ?? value])) as unknown as RequestMetadata
}
const visible = computed(() => view.value.requests.map(request => ({ ...request, destination: metadataFor(request).destination })))
const metadata = computed(() => selected.value ? metadataFor(selected.value) : { destination: null, protocol: null, inbound: null, outbound: null })
const categories = computed(() => selected.value?.categories ?? [])
const hasMetadata = computed(() => Object.values(metadata.value).some(Boolean))
const elapsed = (ms: number) => ms < 1000 ? `${Math.max(0, ms).toFixed(0)} ms` : `${(ms / 1000).toFixed(2)} s`
const time = (at: number) => new Date(at).toLocaleTimeString([], { hour12: false }) + `.${String(new Date(at).getMilliseconds()).padStart(3, '0')}`
const label = (event: LogEvent) => event.event || 'Unlabelled event'
const visibleEvents = computed(() => view.value.events.map(event => ({ ...event, inlineFields: logFields(event.fields) })))
function select(id: string | null) { selectedId.value = id; eventOffset.value = 0 }
function freeze() { frozen.value = frozen.value === null ? props.now : null }
</script>

<template>
  <section class="panel log-panel" aria-label="Request logs">
    <div class="panel-heading log-heading">
      <div><h2>Request timelines</h2><p><span class="status-dot" :class="{ online: state === 'Live' }"/>{{ state }} · {{ view.totalEvents.toLocaleString() }} events in window</p></div>
      <div class="log-actions"><button class="button" :aria-pressed="!!frozen" @click="freeze">{{ frozen ? 'Follow live' : 'Freeze view' }}</button><button v-if="state.includes('Unavailable')" class="button" @click="emit('retry')">Retry stream</button></div>
    </div>
    <div class="log-filters">
      <label>Request ID<input :value="requestId" placeholder="All requests" @input="emit('request', ($event.target as HTMLInputElement).value)"/></label>
      <label>Time window<select v-model="windowMs"><option :value="60_000">Last minute</option><option :value="300_000">Last 5 minutes</option><option :value="900_000">Last 15 minutes</option><option :value="1_800_000">Last 30 minutes</option></select></label>
      <button v-if="requestId" class="text-button" @click="emit('request', '')">Clear filter</button>
      <span v-if="frozen" class="log-frozen">View frozen at {{ time(end) }}. Capture and retention continue.</span>
    </div>
    <p class="log-note">Browser log storage · retained for 30 minutes, up to {{ maxEvents.toLocaleString() }} events across backends. {{ storedCount.toLocaleString() }} stored for this backend. Change the limit in Settings. Windows use arrival time; timelines use server timestamps. Session ID in Connections matches req_id.</p>
    <p v-if="storageError || queryError" class="log-warning" role="status">{{ storageError || queryError }}</p>
    <p v-if="state.includes('Unavailable')" class="log-warning" role="status">Cannot open the log stream. Check the API secret, backend support for /api/v1/logs, and WebSocket proxy settings. Retained events remain available.</p>
    <p v-if="state === 'Paused'" class="log-warning">Capture is paused while dashboard updates are paused or this tab is hidden. Events during this time cannot be replayed.</p>
    <p v-if="dropped || gaps || evicted || invalid" class="log-warning">Capture may be incomplete: {{ dropped }} server-dropped events, {{ gaps }} stream interruptions, {{ evicted }} events removed at the buffer limit, {{ invalid }} unreadable records.</p>
    <div v-if="view.totalRequests" class="log-workspace">
      <aside class="log-requests" aria-label="Captured requests">
        <div class="log-list-heading">{{ view.totalRequests }} {{ view.totalRequests === 1 ? 'request' : 'requests' }} <span>Observed span</span></div>
        <button v-for="request in visible" :key="request.id ?? 'unscoped'" class="log-request" :class="{ selected: selected?.id === request.id }" :aria-pressed="selected?.id === request.id" @click="select(request.id)">
          <span><strong>{{ request.id === null ? 'Unscoped events' : `Request ${request.id}` }}</strong><small>{{ request.count }} events · {{ time(request.first.at) }}</small></span>
          <span>{{ elapsed(request.last.at - request.first.at) }}</span>
          <span v-if="request.destination" class="log-request-destination" :title="request.destination">{{ request.destination }}</span>
          <svg viewBox="0 0 240 14" preserveAspectRatio="none" aria-hidden="true"><line x1="4" y1="7" x2="236" y2="7"/><circle v-for="event in request.markers" :key="event.sequence" :cx="4 + (event.at - request.first.at) / Math.max(1, request.last.at - request.first.at) * 232" cy="7" r="3" :class="`category-${logCategory(event.event)}`"/></svg>
        </button>
        <div v-if="pages > 1" class="log-pagination"><button class="button small" :disabled="requestPage === 1" @click="requestPage--">Previous</button><span>{{ requestPage }} / {{ pages }}</span><button class="button small" :disabled="requestPage === pages" @click="requestPage++">Next</button></div>
      </aside>
      <div v-if="selected" class="log-timeline">
        <div class="log-timeline-heading"><h3>{{ selected.id === null ? 'Unscoped events' : `Request ${selected.id}` }}</h3><span>{{ elapsed(selected.last.at - selected.first.at) }} observed · {{ selected.count }} events</span></div>
        <p v-if="hasMetadata" class="log-destination">{{ metadata.destination || 'Unknown destination' }}<template v-if="metadata.protocol"> · {{ metadata.protocol }}</template><template v-if="metadata.inbound"> · Inbound: {{ metadata.inbound }}</template><template v-if="metadata.outbound"> · Outbound: {{ metadata.outbound }}</template></p>
        <p class="log-note timeline-note">{{ selected.id === null ? 'These events have no req_id and cannot be assigned to a request.' : 'Offsets start at the first captured event in this window; they may not cover the full request.' }}</p>
        <ul class="log-legend" aria-label="Event categories"><li v-for="category in categories" :key="category" :class="`category-${category}`"><i aria-hidden="true"/>{{ LOG_CATEGORIES[category] }}</li></ul>
        <ol class="log-events">
          <li v-for="event in visibleEvents" :key="event.sequence" :class="[event.level.toLowerCase(), `category-${logCategory(event.event)}`]">
            <div class="log-event-time"><time :datetime="event.timestamp">{{ time(event.at) }}</time><span>+{{ elapsed(event.at - selected.first.at) }}</span><div class="log-offset-track" aria-hidden="true"><span :style="{ width: `${(event.at - selected.first.at) / Math.max(1, selected.last.at - selected.first.at) * 100}%` }"/></div></div>
            <div class="log-event-body"><div class="log-event-label"><strong :title="`Category: ${LOG_CATEGORIES[logCategory(event.event)]}`">{{ label(event) }}</strong><span class="log-level">{{ event.level }}</span></div>
              <p v-if="event.fields.message != null || event.inlineFields.length" class="log-message"><span v-if="event.fields.message != null">{{ event.fields.message }}</span><template v-for="[key, value] in event.inlineFields" :key="key">{{ ' ' }}<span class="log-inline-field"><span class="log-field-key">{{ key }}=</span>{{ value }}</span></template></p>
              <details><summary>Fields &amp; spans <span>{{ event.target }}</span></summary><pre>{{ JSON.stringify({ fields: event.fields, spans: event.spans }, null, 2) }}</pre></details>
            </div>
          </li>
        </ol>
        <div v-if="selected.count > 100" class="log-pagination"><button class="button small" :disabled="eventOffset === 0" @click="eventOffset = Math.max(0, eventOffset - 100)">Previous events</button><span>{{ eventOffset + 1 }}–{{ Math.min(eventOffset + 100, selected.count) }} of {{ selected.count }}</span><button class="button small" :disabled="eventOffset + 100 >= selected.count" @click="eventOffset += 100">Next events</button></div>
      </div>
    </div>
    <div v-else class="empty-state"><h3>{{ loading ? 'Loading captured events' : requestId ? `No captured events for request ${requestId}` : 'Waiting for request events' }}</h3><p>{{ requestId ? 'Try a wider time window or clear the request filter. Events from before capture began are unavailable.' : 'New events appear here when the backend emits them. Capture continues as you browse other panels.' }}</p></div>
  </section>
</template>

<style scoped>
.log-panel { min-width: 0; --log-connection: #3979ad; --log-sniffing: #9161ad; }
:global([data-theme=dark] .log-panel) { --log-connection: #8abded; --log-sniffing: #c5a0e3; }
.category-connection { --event-color: var(--log-connection); }
.category-routing { --event-color: var(--primary); }
.category-dns { --event-color: var(--teal); }
.category-sniffing { --event-color: var(--log-sniffing); }
.category-security { --event-color: var(--amber); }
.category-transport { --event-color: var(--green); }
.category-other { --event-color: var(--secondary); }
.log-legend { display: flex; flex-wrap: wrap; gap: 6px 12px; list-style: none; padding: 0; margin: 0 0 8px; }
.log-legend li { display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--secondary); }
.log-legend i { width: 6px; height: 6px; border-radius: 50%; background: color-mix(in srgb, var(--event-color) 60%, var(--text)); }
.log-heading, .log-actions, .log-filters, .log-pagination { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
.log-filters { padding: 0 21px 14px; }
.log-filters label { display: grid; gap: 6px; color: var(--secondary); font-size: 12px; }
.log-filters input { padding: 10px 12px; border: 1px solid var(--border); border-radius: 7px; background: var(--bg); color: var(--text); font-size: 12px; }
.log-filters input::placeholder { color: var(--secondary); }
.log-filters input, .log-filters select { min-height: 38px; width: 210px; max-width: 100%; }
.log-note { margin: 0; padding: 0 21px 16px; font-size: 12px; color: var(--secondary); line-height: 1.6; }
.log-warning { margin: 0 21px 16px; padding: 12px; background: var(--bg); color: var(--text); font-size: 12px; border: 1px solid var(--border); border-radius: 7px; }
.log-frozen { color: var(--secondary); font-size: 12px; }
.log-workspace { display: grid; grid-template-columns: 260px minmax(0, 1fr); border-top: 1px solid var(--border); }
.log-requests { min-width: 0; border-right: 1px solid var(--border); }
.log-list-heading { display: flex; justify-content: space-between; gap: 10px; padding: 16px; font-size: 12px; color: var(--secondary); }
.log-request { width: 100%; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px; text-align: left; padding: 10px 16px; border-bottom: 1px solid var(--line); font-size: 12px; }
.log-request:hover { background: var(--bg); }
.log-request.selected { background: var(--primary-soft); color: var(--primary); }
.log-request strong { display: block; overflow-wrap: anywhere; font-weight: 600; }
.log-request small { display: block; margin-top: 4px; color: var(--secondary); font-size: 11px; }
.log-request-destination { grid-column: 1 / -1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--secondary); font-size: 11px; }
.log-request svg { width: 100%; height: 14px; grid-column: 1 / -1; overflow: visible; }
.log-request line { stroke: var(--border); stroke-width: 2; }
.log-request circle { fill: color-mix(in srgb, var(--event-color) 60%, var(--text)); }
.log-pagination { justify-content: center; padding: 12px; font-size: 11px; }
.log-timeline { padding: 16px; min-width: 0; }
.log-timeline-heading { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 10px; }
.log-timeline-heading h3 { margin: 0; font-size: 16px; overflow-wrap: anywhere; }
.log-timeline-heading > span, .log-destination { font-size: 12px; color: var(--secondary); overflow-wrap: anywhere; }
.timeline-note { padding: 8px 0 12px; }
.log-events { list-style: none; margin: 0; padding: 0; }
.log-events li { color: var(--text); position: relative; display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 20px; padding: 8px 0; border-bottom: 1px solid var(--line); }
.log-events li::before { content: ''; position: absolute; left: 105px; top: 14px; bottom: -14px; width: 1px; background: var(--border); }
.log-events li:last-child { border-bottom: 0; }
.log-events li:last-child::before { display: none; }
.log-events li::after { content: ''; position: absolute; top: 13px; left: 102px; width: 7px; height: 7px; border-radius: 50%; background: color-mix(in srgb, var(--event-color) 60%, var(--text)); }
.log-event-time { font-size: 11px; font-variant-numeric: tabular-nums; color: var(--secondary); }
.log-event-time > span { display: block; margin-top: 4px; }
.log-event-body { min-width: 0; padding-left: 4px; font-size: 12px; }
.log-event-label { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.log-event-label strong { overflow-wrap: anywhere; font-weight: 600; color: color-mix(in srgb, var(--event-color) 60%, var(--text)); }
.log-level { font-size: 10px; color: var(--secondary); }
.error .log-level { color: var(--red); }
.warn .log-level { color: var(--amber); }
.log-offset-track { height: 3px; background: var(--line); margin: 6px 0 0; }
.log-offset-track span { display: block; min-width: 2px; height: 100%; background: color-mix(in srgb, var(--event-color) 60%, var(--text)); }
.log-event-body p { margin: 4px 0; overflow-wrap: anywhere; }
.log-message { white-space: pre-wrap; }
.log-inline-field { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 11px; }
.log-field-key { color: var(--secondary); }
.log-event-body summary { cursor: pointer; color: var(--secondary); padding: 4px 0; min-height: 28px; line-height: 20px; overflow-wrap: anywhere; }
.log-event-body summary span { font-size: 11px; margin-left: 8px; }
.log-event-body pre { white-space: pre-wrap; overflow-wrap: anywhere; background: var(--bg); padding: 12px; border-radius: 7px; font-size: 11px; line-height: 1.6; }
@media (max-width: 1000px) { .log-workspace { grid-template-columns: 210px minmax(0, 1fr); } }
@media (max-width: 740px) {
  .log-workspace { grid-template-columns: minmax(0, 1fr); }
  .log-requests { max-height: 250px; overflow: auto; border-right: 0; border-bottom: 1px solid var(--border); }
  .log-heading { align-items: flex-start; }
  .log-filters { padding-inline: 15px; }
  .log-filters label { flex: 1 1 120px; min-width: 0; }
  .log-filters input, .log-filters select { width: 100%; }
  .log-note { padding-inline: 15px; }
  .log-timeline { padding: 16px 12px; }
  .timeline-note { padding-inline: 0; }
  .log-events li { grid-template-columns: 75px minmax(0, 1fr); gap: 14px; }
  .log-events li::before { left: 81px; }
  .log-events li::after { left: 78px; }
  .log-event-time { font-size: 10px; }
}
</style>
