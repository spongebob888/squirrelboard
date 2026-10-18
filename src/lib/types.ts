export interface ApiErrorBody { code: string; message: string }
export interface Probe {
  url: string
  status: 'ok' | 'failed' | 'timeout'
  latency_ms: number | null
  measured_at: string
  error: ApiErrorBody | null
}
export interface DirectionQuality {
  lost_packets: number
  sent_packets: number
  rtt: number
  current_mtu: number
}
export interface Outbound {
  tag: string
  quality: {
    sq_conn_stats: { uplink: DirectionQuality; downlink: DirectionQuality; sample_age_ms: number } | null
    probe: Probe | null
  }
  selector?: { selected: string; outbounds: string[] }
}
export interface Connection {
  id: string
  protocol: 'tcp' | 'udp'
  inbound: string
  outbound: string | null
  src: string | null
  dst_ip: string | null
  dst_domain: string | null
  dst_port: number | null
  upload_bytes: number | null
  download_bytes: number | null
  duration_ms: number | null
  first_response_ms: number | null
  half_closed: boolean
}
export interface InboundTraffic {
  inbound: string
  tcp_upload_bytes: number
  tcp_download_bytes: number
  udp_upload_bytes: number
  udp_download_bytes: number
  tcp_conns: number
  udp_conns: number
}
export interface Memory {
  allocator: string
  allocated_bytes: number
  active_bytes: number
  resident_bytes: number
}
export interface Snapshot {
  outbounds: Outbound[]
  connections: Connection[]
  inbounds: InboundTraffic[]
  memory: Memory | null
  memoryNote: string
}
export interface Sample { at: number; download: number; upload: number }
export interface LatencySample { outbound: string; latency: number; observedAt: number }
export interface Backend { name: string; url: string; secret: string; interval: number }
