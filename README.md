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
- Adjustable polling, pause/resume, reconnect feedback, responsive navigation, and light/dark themes.

Rates compare each TCP/UDP counter against its previous snapshot using elapsed monotonic time. Counter resets and newly added inbounds do not create historical-traffic spikes. The first successful snapshot establishes the baseline; speed appears after the next update. Polling pauses in hidden tabs. A failed refresh retains the last snapshot and marks it stale. A missing or unsupported memory endpoint does not prevent the other views from working.

Selector switches apply to new sessions and remain in Shadowquic's memory until restart. Existing sessions retain their target. Probe results are cached by Shadowquic and may predate a selector change. Probes require an `http://` URL returning 2xx, do not follow redirects, and time out after ten seconds. No rule editing, session termination, or config reload controls are shown because this API does not provide those operations.

Backend name, URL, polling interval, probe URL, and theme are browser-local preferences. The API secret is stored in this tab's `sessionStorage`, not `localStorage`. No backend secrets are baked into the build. Demo mode never sends API requests.

## Build and serve

```sh
corepack pnpm build
```

Deploy the generated `dist/` directory behind a same-origin reverse proxy. [deploy/nginx.conf](deploy/nginx.conf) is a complete HTTP example: it serves the app and forwards `/api/v1/` to Shadowquic, preserving authorization and encoded outbound tags. Adapt its root, upstream, and TLS settings for your installation.

`pnpm preview` inherits Vite's configured API proxy, so the same empty-address setup works for a local build preview. For example, use `SHADOWQUIC_API_URL=http://192.168.7.1:9090 corepack pnpm preview` to preview against the router. A `dist/` directory served by a separate static server does not include Vite's proxy; use the Nginx configuration for that deployment.

## Checks

```sh
corepack pnpm test
corepack pnpm build
corepack pnpm exec playwright install chromium
corepack pnpm test:e2e
```

Set `CHROME_EXECUTABLE_PATH` to use an existing Chromium/Chrome installation instead of downloading a browser. Browser tests use API fixtures to exercise authenticated polling, selection and probing, error handling, connection filters, themes, and mobile navigation. They also exercise the actual Vite proxy against a local HTTP fixture server. Screenshots and traces on failure are in `test-results/`.

The layout and interaction patterns reference Zashboard; this implementation is written for Shadowquic's API and does not reuse Zashboard source or assets.
