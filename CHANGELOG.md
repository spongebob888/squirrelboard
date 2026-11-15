# Changelog

Notable changes are listed by version, newest first. Dates follow the tagged
commits in the repository.

## [0.1.5] - 2026-11-15

### Changed

- Show outer-to-inner tracing span names and fields before each waterfall event
  message.
- Set the default log storage limit to 10,000 events.

## [0.1.4] - 2026-11-08

### Added

- Live request log timelines from the `/api/v1/logs` WebSocket, with request ID
  correlation, rolling time windows, pagination, and a freeze control.
- Persistent log capture in IndexedDB with configurable event limits and a
  memory fallback when persistent storage is unavailable.
- Minimum log level filtering and full-event text search across both log views.
- A category waterfall with event inspection, keyboard navigation, and a compact
  chronological event list.
- WebSocket upgrade forwarding in the development proxy and Nginx example.

### Changed

- Move log capture details into hover help.

### Fixed

- Preserve the log timeline's scroll position during live updates.

## [0.1.3] - 2026-11-06

### Added

- QUIC connection duration on outbounds and sniffed domain, protocol, and version
  in connection details.
- Impeccable project tooling, design documentation, and development live-picker
  integration.

### Changed

- Listen on `0.0.0.0` during development so other devices can open the dashboard.
- Shorten the outbound duration label.

## [0.1.2] - 2026-10-23

### Added

- A standalone HTML build with JavaScript, CSS, and the dashboard icon embedded.
- An `index.html` release asset alongside `dist.zip`.

## [0.1.0] - 2026-10-21

### Added

- Initial Shadowquic dashboard with live traffic charts, outbound selectors,
  HTTP probes, searchable connections, session details, and JSON export.
- Per-outbound first-response latency distributions and history, adaptive
  histogram buckets, Tokio runtime metrics, and optional memory statistics.
- Responsive mobile layouts, light and dark themes, demo mode, and configurable
  backend settings.
- Connection settings in URL fragments, with API secrets stored in tab session
  storage.
- GitHub Pages deployment and automated `dist.zip` releases for version tags.

[0.1.5]: https://github.com/spongebob888/squirrelboard/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/spongebob888/squirrelboard/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/spongebob888/squirrelboard/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/spongebob888/squirrelboard/compare/v0.1.0...v0.1.2
[0.1.0]: https://github.com/spongebob888/squirrelboard/tree/v0.1.0
