# Squirrelboard

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People running their own Shadowquic instance locally or on a router. They need to monitor traffic, diagnose connections, and select outbounds from a browser on desktop or mobile.

## Product Purpose

Make a Shadowquic instance understandable and manageable through a browser dashboard. Users should be able to assess network activity, investigate a session or outbound, and choose an available route while understanding whether the displayed data is live, paused, stale, or simulated.

## Positioning

A dashboard built for Shadowquic's native `/api/v1` REST API. Its controls and explanations must reflect Shadowquic's actual capabilities and metric semantics.

## Operating Context

- The existing app uses Vue and TypeScript with Vite and pnpm. Run `corepack pnpm dev`; the usual local URL is `http://127.0.0.1:5173`.
- Users connect through Settings using an API address and optional secret. An empty API address uses the same-origin `/api/v1` proxy; `SHADOWQUIC_API_URL` selects the proxy's upstream.
- Explicit API addresses connect directly from the browser and require appropriate CORS support and browser permission for the connection. Shadowquic itself does not provide CORS headers or preflight handling.
- Hash routes expose Overview, Outbounds, Connections, Traffic, Log, and Settings. Connection settings can also be supplied through URL fragment parameters, which are removed after reading.
- The clearly labeled demo workspace uses simulated data and sends no API requests. It is available through Explore demo or `#overview?demo=1`.
- Supported distribution formats include the normal static build and a self-contained HTML build. A separately hosted static build needs an API proxy or a browser-accessible API address.

## Capabilities and Constraints

- Show download/upload rates, rolling two-minute traffic history, active sessions, inbound/protocol totals, outbound quality, optional allocator memory statistics, and Tokio runtime metrics.
- Support outbound selector changes, individual and bulk HTTP probes, connection search/filter/sort/pagination, session inspection, and JSON export.
- Selector changes affect new sessions and persist in Shadowquic memory until restart. Existing sessions keep their target; cached probe results may predate a selector change.
- Probes require an `http://` URL returning 2xx, do not follow redirects, and time out after ten seconds.
- Do not expose rule editing, session termination, or configuration reload controls: the API does not provide these operations.
- Preserve adjustable polling, pause/resume, reconnect feedback, responsive navigation, and light/dark support. Polling pauses in hidden tabs.
- A failed refresh retains the last successful snapshot and identifies it as stale. Missing optional memory or Tokio endpoints must not prevent the rest of the dashboard from working.
- Rates use elapsed monotonic time and counter deltas. First snapshots establish a baseline; counter resets and new inbounds must not produce historical-traffic spikes.
- First-response latency history is collected from observed sessions in the current tab, retained for up to 30 minutes and 10,000 samples, and reset on reload or backend reconnect. Sessions entirely between polls cannot be observed. Present these values as sampled first-response latency, not as probe latency or complete historical telemetry.
- Backend preferences, polling interval, probe URL, and theme are browser-local. Store the API secret only in the tab's `sessionStorage`, never `localStorage` or the built bundle. URL-supplied connection credentials belong in the fragment, not query parameters sent to the hosting server.
- Desktop and mobile use are both product requirements.

## Evidence on Hand

- `README.md` documents setup, supported features, metric semantics, API limitations, deployment, and browser connection constraints.
- `src/App.vue`, `src/composables/dashboard.ts`, and `src/lib/` implement the workflows, API integration, and metric calculations.
- `src/lib/demo.ts` contains simulated demonstration data; it is not evidence of real customer traffic or measured production performance.
- `tests/` contains unit tests, API fixtures, and browser workflow coverage.
- `public/favicon.svg` is the existing product icon. The README credits Zashboard as a layout and interaction reference and states that its source and assets are not reused.
- No additional binding brand requirements or product-specific accessibility standard were established during initialization.

## Product Principles

1. Represent backend capabilities and metric meaning accurately; never imply an unsupported operation or fabricate measurements.
2. Make live, paused, stale, unavailable, and simulated states clear so users can judge what the data means.
3. Keep secrets scoped to the current tab and preserve the documented distinction between same-origin proxy and direct browser connections.
4. Keep monitoring, diagnosis, and outbound selection usable on desktop and mobile; optional telemetry failures must not block core workflows.

## Open Decisions

No additional requirements were identified in this initialization. Specific accessibility conformance targets and any future brand commitments remain unestablished; do not present them as confirmed requirements.

## Log capture storage

- Capture structured WebSocket events in IndexedDB, scoped by normalized backend address, with a 30-minute retention window and a browser-local event limit of 1,000–1,000,000 (default 100,000) shared across stored backends. Reloading restores retained events; credentials are not persisted in log records.
- Batch writes and request grouping in a worker. Keep the rendered request list and event bodies paginated. Report storage failures and bound the memory-only fallback to 10,000 events or the configured limit, whichever is lower. Demo capture remains memory-only.
