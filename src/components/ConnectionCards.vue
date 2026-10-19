<script setup lang="ts">
import { ChevronRight } from './icons'
import { bytes, duration } from '../lib/metrics'
import type { Connection } from '../lib/types'

defineProps<{ connections: Connection[]; showFirstResponse: boolean }>()
defineEmits<{ inspect: [connection: Connection] }>()
const destination = (connection: Connection) => connection.dst_domain || connection.dst_ip || 'Unknown destination'
</script>

<template>
  <div class="mobile-connections">
    <article v-for="connection in connections" :key="connection.id" class="connection-card" @click="$emit('inspect', connection)">
      <button class="connection-card-heading" :aria-label="`Inspect connection to ${destination(connection)}`" @click.stop="$emit('inspect', connection)">
        <span class="connection-card-address">
          <strong :title="destination(connection)">{{ destination(connection) }}<small v-if="connection.dst_port">:{{ connection.dst_port }}</small></strong>
          <span>{{ connection.src || 'Source unavailable' }}</span>
        </span>
        <ChevronRight :size="15" class="muted"/>
      </button>
      <div class="connection-card-route">
        <span class="protocol-chip" :class="connection.protocol">{{ connection.protocol.toUpperCase() }}</span>
        <span class="tiny-dot" :class="connection.outbound === 'direct' ? 'teal-bg' : 'purple-bg'"/>
        <span class="connection-card-outbound">{{ connection.outbound || 'Outbound unavailable' }}</span>
      </div>
      <dl class="connection-card-metrics" :class="{ 'has-latency': showFirstResponse }">
        <div><dt>Download</dt><dd>{{ bytes(connection.download_bytes) }}</dd></div>
        <div><dt>Upload</dt><dd>{{ bytes(connection.upload_bytes) }}</dd></div>
        <div v-if="showFirstResponse"><dt>First response</dt><dd>{{ connection.first_response_ms == null ? '—' : `${connection.first_response_ms} ms` }}</dd></div>
        <div><dt>Duration</dt><dd>{{ duration(connection.duration_ms) }}</dd></div>
      </dl>
    </article>
  </div>
</template>

<style scoped>
.mobile-connections {
  display: none;
}
@media (max-width: 740px) {
  .mobile-connections {
    display: grid;
    min-width: 0;
    gap: 10px;
    padding: 0 15px 15px;
  }
  .connection-card {
    min-width: 0;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  .connection-card-heading {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-width: 0;
    padding: 0;
    text-align: left;
  }
  .connection-card-heading > svg {
    flex-shrink: 0;
  }
  .connection-card-address {
    flex: 1;
    min-width: 0;
  }
  .connection-card-address strong {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
    font-weight: 550;
  }
  .connection-card-address small {
    color: var(--muted);
    font-size: 10px;
    font-weight: 400;
  }
  .connection-card-address > span {
    display: block;
    margin-top: 5px;
    color: var(--muted);
    font-size: 9px;
    overflow-wrap: anywhere;
  }
  .connection-card-route {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 10px;
    font-size: 9px;
    color: var(--secondary);
  }
  .connection-card-outbound {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .connection-card-metrics {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    margin: 12px 0 0;
    padding-top: 10px;
    border-top: 1px solid var(--line);
  }
  .connection-card-metrics.has-latency {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .connection-card-metrics dt {
    color: var(--muted);
    font-size: 8px;
  }
  .connection-card-metrics dd {
    margin: 4px 0 0;
    font-size: 10px;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }
}
</style>
