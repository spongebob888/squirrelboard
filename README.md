# Squirrelboard

A Vue + TypeScript dashboard for [Shadowquic](https://github.com/spongebob888/shadowquic), with a design inspired by [Zashboard](https://github.com/Zephyruso/zashboard). Uses Shadowquic's native `/api/v1` REST API.

## Run locally

Requires Node.js 22.12+ or 24+ and pnpm 11 (the exact pnpm version is in `package.json`).

```sh
corepack pnpm install
corepack pnpm dev
```

Open the URL printed by Vite, normally `http://127.0.0.1:5173`. The dashboard initially connects to the local API. Use **Explore demo**, or open `http://127.0.0.1:5173/?demo=1`, for a clearly labeled simulated workspace.

The development server listens on `0.0.0.0`, so another device can open `http://<server-ip>:5173`. During an Impeccable live session, the picker uses the same development origin through `/__impeccable`; its helper stays bound to loopback. Production builds omit the injected live-picker script.

Enable the API in your Shadowquic configuration:

```yaml
restful-api:
  bind-addr: "127.0.0.1:9090"
  secret: "your-secret"
```

The `restful-api` feature is enabled in Shadowquic's default build. In Squirrelboard's **Settings**, leave **API address** empty and enter the same secret. The Vite server proxies `/api/v1` to `http://127.0.0.1:9090`. To target another server, copy `.env.example` to `.env.local`, change `SHADOWQUIC_API_URL`, and restart Vite.

An explicit API URL in Settings connects directly from the browser and **bypasses the dashboard proxy**, even for `http://127.0.0.1:9090`. A different port is a different origin. Shadowquic itself does not return CORS headers or handle CORS preflight, so these direct requests fail in the browser unless an API reverse proxy adds CORS support. Browser errors can also hide an underlying authentication failure. Using the same-origin proxy avoids these issues.

For the local server, start the dashboard normally and **leave API address empty**:

```sh
corepack pnpm dev
```

For the router server, set its address on the dashboard server and **leave API address empty**:

```sh
SHADOWQUIC_API_URL=http://192.168.7.1:9090 corepack pnpm dev
```

Enter the server's API secret in Settings when required. Restart Vite after changing the environment variable or `.env.local`. `127.0.0.1` in the proxy target refers to the machine running Vite; in an explicit API address, it refers to the machine running the browser.

You can also configure the connection when opening the dashboard with the `protocol`, `hostname`, `port`, and `secret` parameters after `#`:

```text
https://spongebob888.github.io/squirrelboard/#connections?protocol=http&hostname=192.168.7.1&port=9090&secret=your-secret
```

Use `protocol=http` or `protocol=https` (default: `http`), a hostname or IP address without a scheme, path, or port, and an optional port from 1 to 65535. Omitting `port` uses the protocol's standard port (80 for HTTP, 443 for HTTPS). IPv6 addresses work with or without brackets. These fields construct a new API address and use the same browser connection rules as Settings. Use `hostname=` by itself for the same-origin proxy and `secret=` for no authentication. Supplying only `secret` updates the saved server's token. Selecting a different API address clears the old server's secret unless a new one is supplied. `demo=1` still keeps the dashboard in demo mode.

Everything after `#` is a URL fragment and is not sent to the dashboard hosting server in HTTP requests or referrer headers. The page name is optional: `/#protocol=http&hostname=192.168.7.1&port=9090&secret=your-secret` opens Overview. Connection parameters before `#` are ignored. Existing `?demo=1` links remain supported; new demo links can use `#overview?demo=1`.

Ordinary hostnames and IPv4 addresses need no escaping. Secrets containing `&`, `+`, `#`, or `%` still need URL encoding; you can build the fragment parameters with `new URLSearchParams({ protocol: 'http', hostname: '192.168.7.1', port: '9090', secret: 'your-secret' })` and append them after `#connections?`.

These settings apply before the first API request and populate Settings automatically. The address is saved as a browser preference; the secret stays in this tab's session storage. All four connection parameters are removed from the fragment after reading, preserving the page name and other parameters. Reloading uses the saved settings. An invalid address shows an error and sends no API requests until corrected in Settings.

To distinguish network/listener failures from browser CORS failures, run this on the machine running the dashboard server:

```sh
curl --noproxy '*' -i http://127.0.0.1:9090/api/v1/outbounds
curl --noproxy '*' -i http://192.168.7.1:9090/api/v1/outbounds
```

`200` means the API is reachable without a token; `401` means it is reachable and requires a valid API secret. Connection refused or a timeout indicates a listener, routing, or firewall problem. A working curl request does not establish browser CORS support.

## Features

- Download/upload rates and a rolling two-minute traffic chart.
- Outbound selectors, individual and bulk HTTP probes, and QUIC connection duration, cached RTT, packet loss, MTU, and sample age.
- Searchable, filterable, paginated connections, session details with sniffed domain, protocol, and version, and JSON export.
- Cumulative traffic by inbound and protocol, plus optional jemalloc memory statistics.
- Live Tokio runtime metrics: alive tasks, worker count, and global queue depth.
- Per-outbound first-response latency distributions with median, P95, average, and 5/15/30-minute views.
- Adjustable polling, pause/resume, reconnect feedback, responsive navigation, and light/dark themes.

Rates compare each TCP/UDP counter against its previous snapshot using elapsed monotonic time. Counter resets and newly added inbounds do not create historical-traffic spikes. The first successful snapshot establishes the baseline; speed appears after the next update. Polling pauses in hidden tabs. A failed refresh retains the last snapshot and marks it stale. A missing or unsupported memory endpoint does not prevent the other views from working.

The Traffic page polls `/api/v1/tokio_metric` for Tokio runtime statistics. Alive tasks are spawned tasks that have not yet exited, including API and background tasks. Global queue depth excludes worker-local queues. Missing, unsupported, or temporarily unavailable Tokio metrics do not prevent the other dashboard metrics from updating.

Selector switches apply to new sessions and remain in Shadowquic's memory until restart. Existing sessions retain their target. Probe results are cached by Shadowquic and may predate a selector change. Probes require an `http://` URL returning 2xx, do not follow redirects, and time out after ten seconds. No rule editing, session termination, or config reload controls are shown because this API does not provide those operations.

Backend name, URL, polling interval, probe URL, and theme are browser-local preferences. The API secret is stored in this tab's `sessionStorage`, not `localStorage`. No backend secrets are baked into the build. Demo mode never sends API requests.

The Traffic page collects one first-response measurement per observed session, including sessions that later close. Measurements remain in this tab for 30 minutes, up to 10,000 samples, and reset on reload or backend reconnect. Repeated polls do not duplicate a session; pending/unavailable measurements are excluded, while a measured zero is included. Sessions that start and finish between polls cannot be observed. Groups use the connection's recorded outbound tag, so selector traffic remains attributed to the selector. Median uses the middle value (or average of the middle pair), and P95 uses nearest rank. Charts show the percentage of samples in each labeled latency bucket.

Outbounds with fewer than 50 samples in the selected window use coarse latency buckets. With 50 or more, bin widths adapt to the sample count and observed range: more data supports narrower intervals, with readable 1/2/5-based widths and a minimum of 1 ms. The grid covers the minimum through P95 with up to 65 finite bins; an overflow bin retains higher latencies without letting outliers widen the main grid. Each chart displays its bin width, and hover tooltips show the interval, sample count, and percentage for every bar.

## Request log timelines

The **Log** panel subscribes to the `sq_log` branch's `/api/v1/logs` WebSocket as soon as the dashboard opens. Select a connection, then **View request log** to correlate its session ID with `req_id`. IDs are read from event fields or the innermost enclosing request span. Request headers use the active connection when available and fall back to captured destination, protocol, inbound, and outbound fields, so short-lived TCP requests remain identifiable after they close. Events without a request ID appear separately as unscoped events.

Choose a rolling 1, 5, 15, or 30 minute arrival-time window and optionally enter an exact request ID or choose a minimum log level (ERROR, WARN, INFO, DEBUG, or TRACE). Search events performs a case-insensitive text search across the whole event: message, field names and values, event name, category, target, level, timestamp, request ID, and span names and fields. It combines with the other filters before pagination in both log views. Each level includes more severe events: INFO includes INFO, WARN, and ERROR. The level filter applies to request summaries, counts, and timeline pagination; all levels remain captured in storage. Each request has an event overview and a detailed timeline with server timestamps, elapsed offsets, levels, and expandable fields/spans. Event fields appear immediately after the log message as `key=value`, preserving tracing-rendered values; the message itself is not repeated as a field. **Freeze view** fixes the time window for inspection while capture and retention continue. Request lists use pages of 30 and timelines use pages of 100 events; full event bodies are loaded only for the displayed page. Observed spans measure captured events, not total request duration. Links such as `#log?req_id=42` open a request filter; they do not retrieve history.

The **Waterfall** subpage (`#log?view=waterfall`) plots one dot per event on a shared server-time axis, with a fixed row and color for each event category. Each category stays in one compact row; nearby or coincident dots may overlap. Arrow keys can inspect events even when their dots overlap. It shares the request ID, arrival-time window, minimum-level filter, and freeze controls. A scrollable chronological list below the chart contains the same plotted events, with outer-to-inner span context before each message (`inbound{tag=mixed}:tcp_req{req_id=42}: message key=value`). Each span includes its fields; event fields follow the message. Compact rows use two lines, with request ID below the timestamp; hover a clipped preview or select its row for the complete message and fields. Select a dot or list row to inspect the event, use the left/right arrows to move in chronological order, or open its request timeline. Events per page sets the maximum displayed dots (default 500, configurable from 1 to 10,000 and remembered in this browser). Each page’s time axis runs from its earliest to latest plotted event; category totals cover the whole filtered window. Full event bodies are loaded only for the displayed event page; selecting a dot or list row uses those loaded records. On mobile, scroll the chart horizontally while category labels stay visible.

Capture is stored in IndexedDB on this device for up to 30 minutes and survives reloads. Settings → Log storage sets the maximum stored event count (default 10,000; allowed range 1,000–1,000,000) across all backend addresses. Lowering the limit evicts the oldest events immediately. Histories are isolated by normalized API address; same-origin proxy histories belong to the dashboard origin. If you change that proxy's upstream, its existing history still belongs to that address. The dashboard does not add API credentials to stored records. A worker batches writes and groups compact event summaries away from the UI thread. If IndexedDB or its worker is unavailable or full, a visible notice identifies a memory-only fallback capped at 10,000 events (or the configured limit if lower). Reload to retry persistent storage. An abrupt tab close can lose the latest unflushed batch; writes normally flush every second or after 1,000 pending events. Dashboard pause and hidden tabs close the stream. Reconnects use backoff; interruptions, backend lag notices, invalid records, and buffer evictions are reported. The API cannot replay missed events. Older backends without the endpoint leave Log unavailable without blocking the other panels. Demo events are simulated, stay in memory, and open no log socket or persistent database.

Browser WebSockets use the backend's supported `?token=` authentication because they cannot set a Bearer header. The token remains in session storage, but is sent in the WebSocket handshake URL; configure upstream access logging accordingly. Use HTTPS/WSS for remote deployments. Both the Vite proxy and the supplied Nginx configuration forward WebSocket upgrades; the Nginx API location disables access logging to avoid recording tokens.

## Build and serve

```sh
corepack pnpm build
```

Deploy the generated `dist/` directory behind a same-origin reverse proxy. [deploy/nginx.conf](deploy/nginx.conf) is a complete HTTP example: it serves the app and forwards `/api/v1/` to Shadowquic, preserving authorization and encoded outbound tags. Adapt its root, upstream, and TLS settings for your installation.

`pnpm preview` inherits Vite's configured API proxy, so the same empty-address setup works for a local build preview. For example, use `SHADOWQUIC_API_URL=http://192.168.7.1:9090 corepack pnpm preview` to preview against the router. A `dist/` directory served by a separate static server does not include Vite's proxy; use the Nginx configuration for that deployment.

To generate a single-file bundle:

```sh
corepack pnpm build:single
```

The output is `dist-single/index.html`, with JavaScript, CSS, and the dashboard icon embedded. It needs no companion asset files and can be served at any path or opened directly in a browser. Open `index.html#overview?demo=1` to explore without a backend. For live data, configure a browser-accessible API address and secret in Settings or the URL fragment; API requests still follow the browser's CORS and HTTPS rules. The normal `dist/` build is preserved.

## Releases

Push a tag starting with `v` (for example, `v0.1.4`) to run [.github/workflows/release.yml](.github/workflows/release.yml). The workflow installs the pinned dependencies, runs tests, builds both dashboard formats, and publishes a GitHub release with two assets:

- `dist.zip`: the contents of `dist/` at the archive root, using the default `/` base path. Extract it into your web server's document root and configure the API proxy as described above.
- `index.html`: the single-file dashboard, uploaded directly without compression. Download it and open it in a browser or serve it from your web server.

Rerunning the workflow updates both assets on the existing release.

## GitHub Pages

[.github/workflows/pages.yml](.github/workflows/pages.yml) installs the pinned pnpm version, runs tests, builds the dashboard, and deploys `dist/` on pushes to `main`. Pull requests to `main` run the same checks without deploying. You can also run the workflow manually on `main` from the Actions tab.

In the repository's **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions**. After a successful deployment, the dashboard will be available at `https://spongebob888.github.io/squirrelboard/`.

The workflow sets `VITE_BASE_PATH` to the repository's subdirectory, so JavaScript, CSS, and icons load correctly under `/squirrelboard/`. Normal local builds continue to use `/`. To reproduce the Pages build locally:

```sh
VITE_BASE_PATH=/squirrelboard/ corepack pnpm build
```

GitHub Pages serves static files and does not provide the `/api/v1` proxy. In Settings, enter a browser-accessible API address that permits the dashboard's origin through CORS. A hosted HTTPS dashboard also needs an API connection allowed by the browser's HTTPS and local-network policies. Demo mode works without a backend.

## Checks

```sh
corepack pnpm test
corepack pnpm build
corepack pnpm exec playwright install chromium
corepack pnpm test:e2e
```

Set `CHROME_EXECUTABLE_PATH` to use an existing Chromium/Chrome installation instead of downloading a browser. Browser tests use API fixtures to exercise authenticated polling, selection and probing, error handling, connection filters, themes, and mobile navigation. They also exercise the actual Vite proxy against a local HTTP fixture server. Screenshots and traces on failure are in `test-results/`.

The layout and interaction patterns reference Zashboard; this implementation is written for Shadowquic's API and does not reuse Zashboard source or assets.
