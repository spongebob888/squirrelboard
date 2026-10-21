# Squirrelboard

A Vue + TypeScript dashboard for [Shadowquic](https://github.com/spongebob888/shadowquic), with a design inspired by [Zashboard](https://github.com/Zephyruso/zashboard). Uses Shadowquic's native `/api/v1` REST API.

## Run locally

Requires Node.js 22.12+ or 24+ and pnpm 11 (the exact pnpm version is in `package.json`).

```sh
corepack pnpm install
corepack pnpm dev
```

Open the URL printed by Vite, normally `http://127.0.0.1:5173`. The dashboard initially connects to the local API. Use **Explore demo**, or open `http://127.0.0.1:5173/?demo=1`, for a clearly labeled simulated workspace.

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
- Outbound selectors, individual and bulk HTTP probes, and cached QUIC RTT, packet loss, MTU, and sample age.
- Searchable, filterable, paginated connections, session details, and JSON export.
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

## Build and serve

```sh
corepack pnpm build
```

Deploy the generated `dist/` directory behind a same-origin reverse proxy. [deploy/nginx.conf](deploy/nginx.conf) is a complete HTTP example: it serves the app and forwards `/api/v1/` to Shadowquic, preserving authorization and encoded outbound tags. Adapt its root, upstream, and TLS settings for your installation.

`pnpm preview` inherits Vite's configured API proxy, so the same empty-address setup works for a local build preview. For example, use `SHADOWQUIC_API_URL=http://192.168.7.1:9090 corepack pnpm preview` to preview against the router. A `dist/` directory served by a separate static server does not include Vite's proxy; use the Nginx configuration for that deployment.

## Releases

Push a tag starting with `v` (for example, `v0.1.0`) to run [.github/workflows/release.yml](.github/workflows/release.yml). The workflow installs the pinned dependencies, runs tests, builds the dashboard, and publishes a GitHub release with `dist.zip` attached. The archive contains the contents of `dist/` at its root and uses the default `/` base path. Extract it into your web server's document root and configure the API proxy as described above. Rerunning the workflow updates the archive on the existing release.

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
