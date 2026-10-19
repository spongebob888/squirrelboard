<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { Activity, ArrowDown, ArrowDownLeft, ArrowDownUp, ArrowRight, ArrowUp, ArrowUpRight, Check, ChevronDown, ChevronRight, CircleHelp, Clock3, Copy, Cpu, Download, ExternalLink, Globe2, Layers3, LayoutDashboard, LoaderCircle, Menu, Moon, Network, Pause, Play, Radio, RefreshCw, Search, Server, Settings2, ShieldCheck, Sun, Upload, Wifi, WifiOff, X, Zap } from './components/icons'
import TrafficChart from './components/TrafficChart.vue'
import OutboundCard from './components/OutboundCard.vue'
import LatencyDistribution from './components/LatencyDistribution.vue'
import TokioMetrics from './components/TokioMetrics.vue'
import ConnectionCards from './components/ConnectionCards.vue'
import { useDashboard } from './composables/dashboard'
import { bytes, duration, packetLossRate } from './lib/metrics'
import { validateProbeUrl } from './lib/api'
import type { Backend, Connection, Outbound } from './lib/types'

const logoUrl = `${import.meta.env.BASE_URL}favicon.svg`

type Page = 'Overview' | 'Outbounds' | 'Connections' | 'Traffic' | 'Settings'
const pages = [
  { name: 'Overview' as Page, icon: LayoutDashboard },
  { name: 'Outbounds' as Page, icon: Radio },
  { name: 'Connections' as Page, icon: ArrowDownUp },
  { name: 'Traffic' as Page, icon: Activity },
  { name: 'Settings' as Page, icon: Settings2 },
]
const hashPage = () => pages.find(p => p.name.toLowerCase() === location.hash.slice(1))?.name || 'Overview'
const page = ref<Page>(hashPage())
const sidebarOpen = ref(false)
function navigate(name: Page) { page.value = name; location.hash = name.toLowerCase(); sidebarOpen.value = false }
const onHash = () => page.value = hashPage()
window.addEventListener('hashchange', onHash)
onBeforeUnmount(() => window.removeEventListener('hashchange', onHash))
function shortcut(event: KeyboardEvent) {
  if (event.key === 'Escape') sidebarOpen.value = false
  if (event.key !== '/' || (event.target instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) || event.target.isContentEditable))) return
  const input = document.querySelector<HTMLInputElement>(page.value === 'Outbounds' ? '.page-toolbar input' : page.value === 'Connections' ? '.connection-toolbar input' : '.no-shortcut')
  if (input) { event.preventDefault(); input.focus() }
}
window.addEventListener('keydown', shortcut)
onBeforeUnmount(() => window.removeEventListener('keydown', shortcut))
const { backend, demo, data, history, latencySamples, latencyAsOf, status, error, lastUpdated, paused, loading, probing, selecting, notice, aggregate, speed, refresh, connect, reset, probe, select, toast, togglePause } = useDashboard()
const search = ref('')
const protocol = ref('all')
const outboundFilter = ref('all')
const sort = ref('download')
const nodeSearch = ref('')
const nodeSort = ref('name')
const detail = ref<Connection | null>(null)
const nodeDetail = ref<Outbound | null>(null)
const dialog = ref<HTMLDialogElement | null>(null)
watch([detail, nodeDetail], () => {
  if (detail.value || nodeDetail.value) dialog.value?.showModal()
  else dialog.value?.close()
}, { flush: 'post' })
const connectionPage = ref(1)
const filteredConnections = computed(() => {
  const q = search.value.toLowerCase()
  return data.value.connections.filter(c =>
    (protocol.value === 'all' || c.protocol === protocol.value) &&
    (outboundFilter.value === 'all' || c.outbound === outboundFilter.value) &&
    [c.dst_domain, c.dst_ip, c.src, c.inbound, c.outbound, c.id, c.dst_port].some(v => String(v ?? '').toLowerCase().includes(q)),
  ).sort((a, b) => sort.value === 'duration' ? (b.duration_ms ?? -1) - (a.duration_ms ?? -1) : sort.value === 'destination' ? destination(a).localeCompare(destination(b)) : (b.download_bytes ?? -1) - (a.download_bytes ?? -1))
})
watch([search, protocol, outboundFilter, sort], () => connectionPage.value = 1)
const pageCount = computed(() => Math.max(1, Math.ceil(filteredConnections.value.length / 20)))
watch(pageCount, count => connectionPage.value = Math.min(connectionPage.value, count))
const visibleConnections = computed(() => page.value === 'Overview' ? filteredConnections.value.slice(0, 5) : filteredConnections.value.slice((connectionPage.value - 1) * 20, connectionPage.value * 20))
const connectionOutbounds = computed(() => [...new Set(data.value.connections.map(c => c.outbound).filter((s): s is string => s != null))].sort())
const selectors = computed(() => data.value.outbounds.filter(o => o.selector))
const filteredOutbounds = computed(() => data.value.outbounds.filter(o => !o.selector && o.tag.toLowerCase().includes(nodeSearch.value.toLowerCase())).sort((a, b) => nodeSort.value === 'latency' ? (a.quality.probe?.latency_ms ?? Infinity) - (b.quality.probe?.latency_ms ?? Infinity) : a.tag.localeCompare(b.tag)))
function members(outbound: Outbound) { return (outbound.selector?.outbounds || []).map(tag => data.value.outbounds.find(o => o.tag === tag)).filter((o): o is Outbound => !!o) }
function destination(c: Connection) { return c.dst_domain || c.dst_ip || 'Unknown destination' }
const freshLabel = computed(() => lastUpdated.value ? new Date(lastUpdated.value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Waiting for backend')
const activeCount = computed(() => data.value.connections.length)
const memoryPercent = computed(() => data.value.memory ? Math.min(100, data.value.memory.allocated_bytes / Math.max(1, data.value.memory.resident_bytes) * 100) : 0)
const trafficTotal = computed(() => aggregate.value.download + aggregate.value.upload)
function sparkline(key: 'download' | 'upload') {
  const points = history.value.slice(-25)
  const max = Math.max(1, ...points.map(s => s[key]))
  return points.map((sample, index) => `${index ? 'L' : 'M'}${index / Math.max(1, points.length - 1) * 120},${32 - sample[key] / max * 28}`).join(' ')
}
const tcpBytes = computed(() => data.value.inbounds.reduce((sum, i) => sum + i.tcp_download_bytes + i.tcp_upload_bytes, 0))
const tcpPercent = computed(() => trafficTotal.value ? tcpBytes.value / trafficTotal.value * 100 : 0)

const settings = reactive<Backend>({ ...backend.value })
const settingsBusy = ref(false)
const formError = ref('')
const savedMessage = ref('')
const probeUrl = ref('http://example.com/')
try { probeUrl.value = localStorage.getItem('squirrelboard.probe') || probeUrl.value } catch { /* optional preference */ }
const probeError = ref('')
function saveProbe() {
  try {
    probeUrl.value = validateProbeUrl(probeUrl.value)
    localStorage.setItem('squirrelboard.probe', probeUrl.value)
    probeError.value = ''
    toast('Probe URL saved.')
  } catch (cause) { probeError.value = cause instanceof Error ? cause.message : 'Enter a valid HTTP URL.' }
}
async function runProbe(outbound: Outbound) {
  try { validateProbeUrl(probeUrl.value); await probe(outbound, probeUrl.value) }
  catch (cause) { toast(cause instanceof Error ? cause.message : 'Invalid probe URL') }
}
const testingAll = ref(false)
let bulkGeneration = 0
watch([backend, demo], () => { bulkGeneration++; testingAll.value = false }, { flush: 'sync' })
async function probeAll() {
  if (testingAll.value) return
  testingAll.value = true
  const current = bulkGeneration
  const list = [...data.value.outbounds]
  // Bound concurrency to avoid flooding the proxy with simultaneous tests.
  let index = 0
  const run = async () => { while (index < list.length && current === bulkGeneration) await runProbe(list[index++]!) }
  await Promise.all([run(), run(), run()])
  if (current === bulkGeneration) testingAll.value = false
}
async function saveBackend() {
  settingsBusy.value = true
  formError.value = ''
  savedMessage.value = ''
  try {
    const success = await connect(settings)
    if (success) savedMessage.value = 'Connected. Your backend settings are saved.'
    else formError.value = error.value
  } catch (cause) { formError.value = cause instanceof Error ? cause.message : 'Could not connect.' }
  finally { settingsBusy.value = false }
}
function openSettings() { Object.assign(settings, backend.value); navigate('Settings') }
let preferredTheme = 'light'
try { preferredTheme = localStorage.getItem('squirrelboard.theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') } catch { /* default */ }
const dark = ref(preferredTheme === 'dark')
watch(dark, value => {
  document.documentElement.dataset.theme = value ? 'dark' : 'light'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', value ? '#14171e' : '#f7f8fa')
  try { localStorage.setItem('squirrelboard.theme', value ? 'dark' : 'light') } catch { /* optional */ }
}, { immediate: true })
async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); toast('Copied to clipboard.') } catch { toast('Clipboard access is unavailable in this browser.') }
}
function exportConnections() {
  const blob = new Blob([JSON.stringify(filteredConnections.value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = 'squirrelboard-connections.json'; anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
</script>

<template>
  <div class="app-shell">
    <div v-if="sidebarOpen" class="sidebar-backdrop" @click="sidebarOpen = false"/>
    <aside class="sidebar" :class="{ open: sidebarOpen }">
      <a class="brand" href="#overview" @click.prevent="navigate('Overview')"><img :src="logoUrl" alt="" width="35" height="35"/><span>squirrelboard<small>SHADOWQUIC DASHBOARD</small></span></a>
      <div class="workspace-label">WORKSPACE</div>
      <nav aria-label="Main navigation"><button v-for="item in pages" :key="item.name" class="nav-item" :class="{ active: page === item.name }" :aria-current="page === item.name ? 'page' : undefined" @click="item.name === 'Settings' ? openSettings() : navigate(item.name)"><component :is="item.icon" :size="19"/><span>{{ item.name }}</span><span v-if="item.name === 'Connections' && activeCount" class="nav-count">{{ activeCount }}</span></button></nav>
      <div class="sidebar-bottom">
        <div class="sidebar-traffic"><div class="eyebrow">LIVE TRAFFIC <span class="status-dot" :class="{ online: status === 'connected' && !paused }"/></div><div class="sidebar-speeds"><span><ArrowDown :size="13"/>{{ bytes(speed.download) }}<small>/s</small></span><span><ArrowUp :size="13"/>{{ bytes(speed.upload) }}<small>/s</small></span></div><TrafficChart :samples="history" compact/></div>
        <button class="backend-switch" @click="openSettings()"><span class="server-avatar"><Server :size="17"/></span><span><strong>{{ demo ? 'Demo workspace' : backend.name }}</strong><small><i class="status-dot" :class="{ online: status === 'connected' }"/>{{ demo ? 'Sample data' : status === 'connected' ? 'Connected' : status === 'connecting' ? 'Connecting' : 'Disconnected' }}</small></span><ChevronDown :size="14"/></button>
        <div class="sidebar-footer"><span>v0.1.0</span><a href="https://github.com/Zephyruso/zashboard" target="_blank" rel="noreferrer" title="Design inspired by Zashboard"><CircleHelp :size="17"/><span class="sr-only">Zashboard design reference</span></a><button :aria-label="dark ? 'Use light theme' : 'Use dark theme'" @click="dark = !dark"><Sun v-if="dark" :size="17"/><Moon v-else :size="17"/></button></div>
      </div>
    </aside>

    <main>
      <header class="topbar"><div class="breadcrumb"><button class="icon-button mobile-menu" aria-label="Open navigation" @click="sidebarOpen = true"><Menu :size="20"/></button><span>Workspace</span><ChevronRight :size="13"/><strong>{{ page }}</strong></div><div class="topbar-actions"><span class="backend-status" :class="{ online: status === 'connected', offline: status === 'offline' }"><i class="status-dot" :class="{ online: status === 'connected' }"/>{{ demo ? 'Demo mode' : status === 'connected' ? 'Backend connected' : status === 'connecting' ? 'Connecting…' : 'Backend offline' }}</span><span class="topbar-divider"/><button class="icon-button" :aria-label="dark ? 'Use light theme' : 'Use dark theme'" @click="dark = !dark"><Sun v-if="dark" :size="18"/><Moon v-else :size="18"/></button><button class="icon-button" :disabled="loading" aria-label="Refresh dashboard" @click="refresh()"><RefreshCw :size="17" :class="{ spin: loading }"/></button></div></header>

      <div class="page-content">
        <div v-if="demo" class="demo-banner"><span><Globe2 :size="16"/>You’re exploring a demo workspace. All data shown is simulated.</span><button @click="openSettings()">Connect your backend <ArrowRight :size="14"/></button></div>
        <div v-else-if="error" class="error-banner" role="alert"><WifiOff :size="19"/><div><strong>{{ lastUpdated ? 'Connection interrupted' : 'Let’s connect your Shadowquic' }}</strong><span>{{ error }}{{ lastUpdated ? ' Displaying the last successful snapshot.' : '' }}</span></div><button class="button small" @click="openSettings()">Configure backend</button><button v-if="!lastUpdated" class="text-button" @click="reset(true)">Explore demo <ArrowRight :size="14"/></button></div>

        <div class="page-heading"><div><div class="eyebrow heading-eyebrow">YOUR NETWORK, AT A GLANCE</div><h1>{{ page === 'Overview' ? 'Overview' : page === 'Outbounds' ? 'Outbounds' : page === 'Connections' ? 'Connections' : page === 'Traffic' ? 'Traffic' : 'Settings' }}</h1><p>{{ page === 'Overview' ? 'A little clarity for everything flowing through your network.' : page === 'Outbounds' ? 'Choose your route. Keep an eye on every outbound.' : page === 'Connections' ? 'See where your traffic is going, one connection at a time.' : page === 'Traffic' ? 'Follow your bandwidth across every inbound.' : 'Make yourself at home. Connect and customize your dashboard.' }}</p></div><div v-if="page !== 'Settings'" class="heading-actions"><span class="polling-label"><i class="status-dot" :class="{ online: status === 'connected' && !paused }"/>{{ paused ? 'Updates paused' : `Updates every ${backend.interval / 1000}s` }}</span><button class="button" @click="togglePause()"><Play v-if="paused" :size="15"/><Pause v-else :size="15"/>{{ paused ? 'Resume' : 'Pause' }}</button></div></div>

        <template v-if="page === 'Overview' || page === 'Traffic'">
          <div class="stat-grid">
            <div class="stat-card"><div class="stat-top"><span>Download speed</span><span class="stat-icon purple"><ArrowDownLeft :size="19"/></span></div><div class="stat-number">{{ status === 'offline' || paused ? '—' : bytes(speed.download) }}<small>/s</small></div><div class="stat-caption"><Download :size="12"/><strong>{{ lastUpdated ? bytes(aggregate.download) : '—' }}</strong> total downloaded</div><svg class="stat-spark" viewBox="0 0 120 35" aria-hidden="true"><path :d="sparkline('download')"/></svg></div>
            <div class="stat-card"><div class="stat-top"><span>Upload speed</span><span class="stat-icon mint"><ArrowUpRight :size="19"/></span></div><div class="stat-number">{{ status === 'offline' || paused ? '—' : bytes(speed.upload) }}<small>/s</small></div><div class="stat-caption"><Upload :size="12"/><strong>{{ lastUpdated ? bytes(aggregate.upload) : '—' }}</strong> total uploaded</div><svg class="stat-spark teal" viewBox="0 0 120 35" aria-hidden="true"><path :d="sparkline('upload')"/></svg></div>
            <div class="stat-card"><div class="stat-top"><span>Active connections</span><span class="stat-icon blue"><Network :size="19"/></span></div><div class="stat-number">{{ lastUpdated ? activeCount : '—' }}<small class="text-unit">sessions</small></div><div class="stat-caption"><span class="tiny-dot purple-bg"/>{{ aggregate.tcp }} TCP <span class="caption-divider"/><span class="tiny-dot teal-bg"/>{{ aggregate.udp }} UDP</div></div>
            <div class="stat-card"><div class="stat-top"><span>Resident memory</span><span class="stat-icon peach"><Cpu :size="19"/></span></div><div class="stat-number">{{ bytes(data.memory?.resident_bytes) }}</div><div class="stat-caption"><span v-if="data.memory"><span class="tiny-dot amber-bg"/>{{ data.memory.allocator }} allocator</span><span v-else>{{ data.memoryNote || 'Waiting for memory statistics' }}</span></div></div>
          </div>
          <div class="overview-middle">
            <section class="panel traffic-panel"><div class="panel-heading"><div><h2>Traffic activity</h2><p>Bandwidth over the last two minutes</p></div><div class="chart-legend"><span><i class="tiny-dot purple-bg"/>Download</span><span><i class="tiny-dot teal-bg"/>Upload</span><span class="subtle-chip">Live</span></div></div><TrafficChart :samples="history"/><div class="chart-footer"><span><Clock3 :size="13"/>{{ paused ? 'Updates paused' : `Last updated ${freshLabel}` }}</span><span>Payload traffic · TCP + UDP</span></div></section>
            <section class="panel network-panel"><div class="panel-heading"><h2>Network status</h2><span class="status-pill" :class="status === 'connected' ? 'good' : 'muted'"><i class="status-dot" :class="{ online: status === 'connected' }"/>{{ demo ? 'Demo' : status === 'connected' ? 'Online' : status === 'connecting' ? 'Connecting' : 'Offline' }}</span></div><div class="network-illustration" aria-hidden="true"><div class="orbit orbit-one"/><div class="orbit orbit-two"/><div class="network-orb"><Globe2 :size="42" :stroke-width="1.2"/></div><span class="orbit-point p1"/><span class="orbit-point p2"/><span class="orbit-point p3"/></div><div class="network-row"><span><Radio :size="15"/>Outbounds</span><strong>{{ data.outbounds.length }}<small> configured</small></strong></div><div class="network-row"><span><Layers3 :size="15"/>Inbounds</span><strong>{{ data.inbounds.length }}<small> tracked</small></strong></div><div class="network-row"><span><ShieldCheck :size="15"/>API authentication</span><strong>{{ demo ? 'Demo' : backend.secret ? 'Bearer token' : 'No token' }}</strong></div><div class="network-row"><span><RefreshCw :size="14"/>Refresh interval</span><strong>{{ backend.interval / 1000 }} seconds</strong></div></section>
          </div>
        </template>

        <template v-if="page === 'Overview' || page === 'Outbounds'">
          <div v-if="page === 'Outbounds'" class="page-toolbar"><label class="search-input"><Search :size="16"/><input v-model="nodeSearch" placeholder="Search outbounds…" aria-label="Search outbounds"/><kbd>/</kbd></label><div class="toolbar-right"><select v-model="nodeSort" aria-label="Sort outbounds"><option value="name">Sort by name</option><option value="latency">Sort by latency</option></select><button class="button primary" :disabled="testingAll || !data.outbounds.length || status !== 'connected'" @click="probeAll()"><LoaderCircle v-if="testingAll" :size="15" class="spin"/><Zap v-else :size="15"/>{{ testingAll ? 'Testing…' : 'Test all' }}</button></div></div>
          <section v-for="selector in (page === 'Overview' ? selectors.slice(0, 1) : selectors)" :key="selector.tag" class="panel selector-panel"><div class="panel-heading"><div class="selector-title"><span class="section-icon"><Radio :size="18"/></span><div><h2>{{ selector.tag }} <span class="subtle-chip">Selector</span></h2><p><span class="tiny-dot green-bg"/>{{ selector.selector?.selected }}<span class="muted"> · {{ selector.selector?.outbounds.length }} outbounds</span></p></div></div><button v-if="page === 'Overview'" class="text-button" @click="navigate('Outbounds')">All outbounds <ArrowRight :size="14"/></button><span v-else class="subtle-chip">Applies to new sessions</span></div><div class="outbound-grid"><OutboundCard v-for="outbound in members(selector).filter(o => o.tag.toLowerCase().includes(nodeSearch.toLowerCase()))" :key="outbound.tag" :outbound="outbound" :selected="selector.selector?.selected === outbound.tag" selectable :disabled="selecting.has(selector.tag) || status !== 'connected'" :probing="probing.has(outbound.tag)" @select="select(selector, outbound.tag)" @probe="runProbe(outbound)"/></div></section>
          <section v-if="page === 'Outbounds' || !selectors.length" class="panel all-outbounds"><div class="panel-heading"><div><h2>All outbounds <span class="count-badge">{{ filteredOutbounds.length }}</span></h2><p>Cached latency and transport quality for your routes</p></div><button v-if="page === 'Overview'" class="text-button" @click="navigate('Outbounds')">View all <ArrowRight :size="14"/></button></div><div v-if="filteredOutbounds.length" class="outbound-grid"><OutboundCard v-for="outbound in (page === 'Overview' ? filteredOutbounds.slice(0, 4) : filteredOutbounds)" :key="outbound.tag" :outbound="outbound" :probing="probing.has(outbound.tag)" :disabled="status !== 'connected'" @probe="runProbe(outbound)" @inspect="nodeDetail = outbound"/></div><div v-else class="empty-state"><Radio :size="28"/><h3>{{ nodeSearch ? 'No matching outbounds' : 'Your routes will appear here' }}</h3><p>{{ nodeSearch ? 'Try a different outbound name.' : 'Connect to Shadowquic to see your configured outbounds.' }}</p></div><div v-if="page === 'Outbounds'" class="panel-note"><CircleHelp :size="14"/>Latency is from the last completed HTTP probe. Click an outbound for QUIC details.</div></section>
        </template>

        <section v-if="page === 'Overview' || page === 'Connections'" class="panel connections-panel"><div class="panel-heading"><div><h2>{{ page === 'Overview' ? 'Active connections' : 'Connection activity' }} <span class="count-badge">{{ activeCount }}</span></h2><p v-if="page === 'Connections'">Active TCP sessions and UDP associations</p></div><button v-if="page === 'Overview'" class="text-button" @click="navigate('Connections')">View all connections <ArrowRight :size="14"/></button><button v-else class="button small" :disabled="!filteredConnections.length" @click="exportConnections()"><Download :size="14"/>Export JSON</button></div>
          <div v-if="page === 'Connections'" class="connection-toolbar"><label class="search-input"><Search :size="16"/><input v-model="search" placeholder="Search destination, source, or outbound…" aria-label="Search connections"/></label><select v-model="protocol" aria-label="Filter protocol"><option value="all">All protocols</option><option value="tcp">TCP</option><option value="udp">UDP</option></select><select v-model="outboundFilter" aria-label="Filter outbound"><option value="all">All outbounds</option><option v-for="tag in connectionOutbounds" :key="tag" :value="tag">{{ tag }}</option></select><select v-model="sort" aria-label="Sort connections"><option value="download">Most downloaded</option><option value="duration">Longest active</option><option value="destination">Destination A–Z</option></select></div>
          <div class="table-scroll"><table><thead><tr><th>Destination</th><th>Protocol</th><th>Outbound</th><th class="numeric">Download <ArrowDown :size="11"/></th><th class="numeric">Upload</th><th v-if="page === 'Connections'" class="numeric" title="Time from session tracking to the first response">First response</th><th class="numeric">Duration</th><th><span class="sr-only">Details</span></th></tr></thead><tbody><tr v-for="c in visibleConnections" :key="c.id" tabindex="0" role="button" :aria-label="`Inspect connection to ${destination(c)}`" @click="detail = c" @keydown.enter="detail = c" @keydown.space.prevent="detail = c"><td><div class="destination"><span class="domain-icon"><Globe2 :size="15"/></span><span><strong>{{ destination(c) }}<small v-if="c.dst_port">:{{ c.dst_port }}</small></strong><small>{{ c.src || 'Source unavailable' }}</small></span></div></td><td><span class="protocol-chip" :class="c.protocol">{{ c.protocol.toUpperCase() }}</span></td><td><span class="route-label"><span class="tiny-dot" :class="c.outbound === 'direct' ? 'teal-bg' : 'purple-bg'"/>{{ c.outbound || '—' }}</span></td><td class="numeric">{{ bytes(c.download_bytes) }}</td><td class="numeric muted">{{ bytes(c.upload_bytes) }}</td><td v-if="page === 'Connections'" class="numeric" :title="c.first_response_ms == null ? 'Waiting / unavailable' : 'Time from session tracking to the first response'">{{ c.first_response_ms == null ? '—' : `${c.first_response_ms} ms` }}</td><td class="numeric muted">{{ duration(c.duration_ms) }}</td><td><ChevronRight :size="14" class="muted"/></td></tr></tbody></table></div>
          <ConnectionCards :connections="visibleConnections" :show-first-response="page === 'Connections'" @inspect="detail = $event"/>
          <div v-if="!visibleConnections.length" class="empty-state"><Network :size="28"/><h3>{{ search || protocol !== 'all' || outboundFilter !== 'all' ? 'No matching connections' : 'No active connections' }}</h3><p>{{ search || protocol !== 'all' || outboundFilter !== 'all' ? 'Adjust your search or filters to see more sessions.' : 'New sessions will appear as traffic flows through Shadowquic.' }}</p></div>
          <div class="table-footer"><span>Showing {{ visibleConnections.length }} of {{ filteredConnections.length }} connections<span v-if="status === 'offline'"> · Last known snapshot</span></span><div v-if="page === 'Connections'" class="pagination"><button class="button small" :disabled="connectionPage <= 1" @click="connectionPage--">Previous</button><span>{{ connectionPage }} / {{ pageCount }}</span><button class="button small" :disabled="connectionPage >= pageCount" @click="connectionPage++">Next</button></div><span v-else class="muted"><span class="status-dot" :class="{ online: !paused && status === 'connected' }"/>{{ paused ? 'Paused' : 'Auto-refreshing' }}</span></div>
        </section>

        <template v-if="page === 'Traffic'">
          <div class="traffic-detail-grid"><section class="panel"><div class="panel-heading"><div><h2>Traffic by inbound</h2><p>Cumulative payload counters, including completed sessions</p></div><Layers3 :size="18" class="muted"/></div><div v-if="!data.inbounds.length" class="empty-state"><Layers3 :size="28"/><h3>No inbound statistics yet</h3><p>Connect your backend to start tracking traffic.</p></div><div v-for="inbound in data.inbounds" :key="inbound.inbound" class="inbound-row"><div class="inbound-heading"><span class="section-icon"><Server :size="17"/></span><div><h3>{{ inbound.inbound }}</h3><small>{{ inbound.tcp_conns }} TCP · {{ inbound.udp_conns }} UDP sessions</small></div><strong>{{ bytes(inbound.tcp_download_bytes + inbound.udp_download_bytes + inbound.tcp_upload_bytes + inbound.udp_upload_bytes) }}</strong></div><div class="inbound-bar"><span :style="{ width: `${trafficTotal ? (inbound.tcp_download_bytes + inbound.udp_download_bytes + inbound.tcp_upload_bytes + inbound.udp_upload_bytes) / trafficTotal * 100 : 0}%` }"/></div><div class="inbound-values"><span><ArrowDown :size="13"/>{{ bytes(inbound.tcp_download_bytes + inbound.udp_download_bytes) }}</span><span><ArrowUp :size="13"/>{{ bytes(inbound.tcp_upload_bytes + inbound.udp_upload_bytes) }}</span></div></div></section><section class="panel protocol-panel"><div class="panel-heading"><h2>Protocol breakdown</h2><ArrowDownUp :size="17" class="muted"/></div><div class="donut" :style="{ background: `conic-gradient(var(--primary) 0% ${tcpPercent}%, var(--teal) ${tcpPercent}% 100%)` }"><div><strong>{{ bytes(trafficTotal) }}</strong><small>total traffic</small></div></div><div class="protocol-summary"><span><i class="tiny-dot purple-bg"/>TCP<strong>{{ tcpPercent.toFixed(1) }}%</strong></span><span><i class="tiny-dot teal-bg"/>UDP<strong>{{ (trafficTotal ? 100 - tcpPercent : 0).toFixed(1) }}%</strong></span></div></section></div>
          <LatencyDistribution :samples="latencySamples" :outbounds="data.outbounds.map(outbound => outbound.tag)" :as-of="latencyAsOf"/>
          <section class="panel"><div class="panel-heading"><div><h2>Allocator memory</h2><p>Jemalloc statistics · These values describe the allocator, not total process RSS</p></div><Cpu :size="18" class="muted"/></div><div v-if="data.memory" class="memory-detail"><div><span>Resident</span><strong>{{ bytes(data.memory.resident_bytes) }}</strong><small>Resident allocator pages</small></div><div><span>Active</span><strong>{{ bytes(data.memory.active_bytes) }}</strong><small>Pages backing active allocations</small></div><div><span>Allocated</span><strong>{{ bytes(data.memory.allocated_bytes) }}</strong><small>Memory in use by the application</small></div><div class="memory-utilization"><span>Allocated / resident</span><strong>{{ memoryPercent.toFixed(1) }}%</strong><div class="inbound-bar"><span :style="{ width: `${memoryPercent}%` }"/></div></div></div><div v-else class="empty-state"><Cpu :size="26"/><h3>Memory statistics unavailable</h3><p>{{ data.memoryNote || 'Connect to a backend with jemalloc support to view allocator statistics.' }}</p></div></section>
          <TokioMetrics :metrics="data.tokioMetric" :note="data.tokioMetricNote"/>
        </template>

        <template v-if="page === 'Settings'">
          <div class="settings-grid"><section class="panel"><div class="panel-heading"><div class="selector-title"><span class="section-icon"><Server :size="19"/></span><div><h2>Backend connection</h2><p>Connect to your Shadowquic REST API</p></div></div><span v-if="demo" class="subtle-chip">Demo active</span></div><form class="settings-form" @submit.prevent="saveBackend()"><label>Connection name<input v-model="settings.name" placeholder="Local Shadowquic" maxlength="80"/></label><label>API address<input v-model="settings.url" type="url" placeholder="Same origin (recommended)"/><small>With Vite dev or preview, leave this empty. Set SHADOWQUIC_API_URL on the dashboard server to choose a backend. Entering a URL here bypasses that proxy and requires CORS support on the API server.</small></label><label>API secret <span class="optional">optional</span><input v-model="settings.secret" type="password" placeholder="Your bearer token" autocomplete="off"/><small>Your secret is kept in this browser tab’s session storage.</small></label><label>Refresh interval<select v-model="settings.interval"><option :value="1000">1 second</option><option :value="2000">2 seconds</option><option :value="5000">5 seconds</option><option :value="10000">10 seconds</option></select></label><div v-if="formError" class="form-message error" role="alert">{{ formError }}</div><div v-if="savedMessage" class="form-message success" role="status"><Check :size="16"/>{{ savedMessage }}</div><div class="form-actions"><button class="button primary" type="submit" :disabled="settingsBusy"><LoaderCircle v-if="settingsBusy" :size="15" class="spin"/><Wifi v-else :size="15"/>{{ settingsBusy ? 'Connecting…' : 'Save & connect' }}</button><button type="button" class="button" @click="reset(true); toast('Demo workspace opened. Your backend settings are preserved.')">Explore demo</button></div></form></section>
          <div class="settings-side"><section class="panel setup-help"><span class="section-icon"><ShieldCheck :size="20"/></span><h2>A home for your network</h2><p>Enable the REST API in your Shadowquic configuration:</p><pre>restful-api:
  bind-addr: "127.0.0.1:9090"
  secret: "your-secret"</pre><p>Vite dev and preview proxy requests to <code>127.0.0.1:9090</code> by default. For the router, start Vite with <code>SHADOWQUIC_API_URL=http://192.168.7.1:9090</code>. Leave API address empty in both cases.</p><div class="help-note"><CircleHelp :size="16"/><span>For production, serve the dashboard and /api/v1 through the same reverse proxy. An Nginx example is included in this project.</span></div></section><section class="panel appearance-panel"><div><h2>Appearance</h2><p>A little lighter, or a little darker.</p></div><button class="theme-toggle" :aria-label="dark ? 'Use light theme' : 'Use dark theme'" :aria-pressed="dark" @click="dark = !dark"><Sun :size="16"/><Moon :size="16"/><span :class="{ dark }"/></button></section></div></div>
          <section class="panel probe-settings"><div class="panel-heading"><div><h2>Latency probes</h2><p>Test a route by requesting HTTP response headers through an outbound</p></div><Zap :size="19" class="muted"/></div><form class="settings-form" @submit.prevent="saveProbe()"><label>Probe URL<div class="inline-form"><input v-model="probeUrl" type="url" required placeholder="http://example.com/"/><button class="button" type="submit">Save URL</button></div><small>Use an http:// address that returns a 2xx response. Shadowquic does not follow redirects or support HTTPS probes. Timeout: 10 seconds.</small></label><p v-if="probeError" class="form-message error" role="alert">{{ probeError }}</p></form></section>
        </template>

        <footer class="page-footer"><span><img :src="logoUrl" alt="" width="16" height="16"/>squirrelboard <span class="footer-dot">·</span> A clear view of your network.</span><a href="https://github.com/Zephyruso/zashboard" target="_blank" rel="noreferrer">Inspired by zashboard <ExternalLink :size="11"/></a></footer>
      </div>
    </main>
    <Transition name="toast"><div v-if="notice" class="toast-message" role="status"><span>{{ notice }}</span><button class="icon-button" aria-label="Dismiss notification" @click="notice = ''"><X :size="15"/></button></div></Transition>
    <dialog ref="dialog" class="detail-dialog" @close="detail = null; nodeDetail = null" @click="($event.target === dialog) && (detail = null, nodeDetail = null)"><div class="dialog-heading"><div><span class="eyebrow">{{ detail ? 'CONNECTION DETAILS' : 'OUTBOUND QUALITY' }}</span><h2>{{ detail ? destination(detail) : nodeDetail?.tag }}</h2></div><button class="icon-button" aria-label="Close details" @click="detail = null; nodeDetail = null"><X :size="20"/></button></div><dl v-if="detail" class="detail-list"><template v-for="[label, value] in [['Session ID', detail.id], ['Protocol', detail.protocol.toUpperCase()], ['Source', detail.src], ['Destination IP', detail.dst_ip], ['Destination domain', detail.dst_domain], ['Port', detail.dst_port], ['Inbound', detail.inbound], ['Outbound', detail.outbound], ['Downloaded', bytes(detail.download_bytes)], ['Uploaded', bytes(detail.upload_bytes)], ['Duration', duration(detail.duration_ms)], ['First response', detail.first_response_ms == null ? 'Waiting / unavailable' : `${detail.first_response_ms} ms`], ['State', detail.half_closed ? 'Half-closed' : 'Active']]" :key="String(label)"><dt>{{ label }}</dt><dd>{{ value ?? '—' }}</dd></template></dl><div v-if="detail" class="dialog-actions"><button class="button" @click="copy(JSON.stringify(detail, null, 2))"><Copy :size="14"/>Copy JSON</button></div><template v-if="nodeDetail"><dl class="detail-list"><dt>Last probe</dt><dd>{{ nodeDetail.quality.probe?.status || 'Not tested' }}</dd><dt>Probe latency</dt><dd>{{ nodeDetail.quality.probe?.latency_ms != null ? `${nodeDetail.quality.probe.latency_ms} ms` : '—' }}</dd><dt>Measured at</dt><dd>{{ nodeDetail.quality.probe ? new Date(nodeDetail.quality.probe.measured_at).toLocaleString() : '—' }}</dd><dt>Probe URL</dt><dd>{{ nodeDetail.quality.probe?.url || '—' }}</dd><dt v-if="nodeDetail.quality.probe?.error">Probe error</dt><dd v-if="nodeDetail.quality.probe?.error">{{ nodeDetail.quality.probe.error.message }}</dd></dl><template v-if="nodeDetail.quality.sq_conn_stats"><h3 class="quality-heading">QUIC transport</h3><dl class="detail-list"><dt>Sample age</dt><dd>{{ duration(nodeDetail.quality.sq_conn_stats.sample_age_ms) }}</dd><template v-for="direction in ['uplink', 'downlink'] as const" :key="direction"><dt>{{ direction }} RTT</dt><dd>{{ nodeDetail.quality.sq_conn_stats[direction].rtt.toFixed(1) }} ms</dd><dt>{{ direction }} packet loss</dt><dd>{{ packetLossRate(nodeDetail.quality.sq_conn_stats[direction].lost_packets, nodeDetail.quality.sq_conn_stats[direction].sent_packets) }} <span class="muted">({{ nodeDetail.quality.sq_conn_stats[direction].lost_packets }} / {{ nodeDetail.quality.sq_conn_stats[direction].sent_packets }} sent)</span></dd><dt>{{ direction }} MTU</dt><dd>{{ nodeDetail.quality.sq_conn_stats[direction].current_mtu }} B</dd></template></dl></template><p v-else class="panel-note">No cached QUIC transport sample is available for this outbound.</p><div class="dialog-actions"><button class="button primary" :disabled="probing.has(nodeDetail.tag) || status !== 'connected'" @click="runProbe(nodeDetail)"><Zap :size="15"/>Test latency</button></div></template></dialog>
  </div>
</template>
