# Log panel

Mode: Operate. Target: src/components/LogPanel.vue, joined through src/App.vue.

## Direction contract

THESIS: Make the captured path of a request inspectable from its connection session ID. Show request groups beside event timelines, with incomplete capture made explicit.

OWN-WORLD: Extend the existing Quiet Network Console. Reuse its surface, border, primary, and severity tokens, restrained controls, and light/dark themes. Preserve DESIGN.md and its token sidecar.

STORY: The operator opens a connection, follows View request log, selects a time window, and inspects labelled events and their fields. Arrival-time windows and server-time offsets have distinct meanings.

FIRST VIEWPORT: A Log heading precedes stream status, request ID and time filters, and capture limits. A compact request list sits beside the selected timeline on desktop; mobile stacks the list above the timeline. Freeze view preserves inspection while capture continues.

FORM: An extension of the established dashboard, using grouped operational data and a vertical event timeline with proportional offset tracks. No concept roll is needed for this inherited surface.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Documentation

README.md documents request correlation, timing semantics, retention, authentication, proxying, and capture interruptions. The existing DESIGN.md and .impeccable/design.json remain authoritative; this addition uses their existing tokens and breakpoints. No shipping raster assets were added.

## Event density refinement

Use compact event rows with 8px vertical padding and subtle separators. Group timing bars with timestamps, and keep disclosure labels and targets inline when space permits. Preserve wrapping and full expanded details on mobile. Request entries use 10px vertical padding.

## Event category colors

Use stable colors for Connection (blue), Routing (primary), DNS (teal), Sniffing (purple), Security (amber), Transport (green), and Other (secondary). Apply category color to event names, timeline dots, offset bars, and request preview dots. Show a compact legend for categories in the selected request. WARN/ERROR text retains severity colors independently. Event prefixes and legend labels provide non-color identification. Category text mixes 60% category color with the theme text token for contrast; blue and purple have local light/dark values.

## IndexedDB storage

Retain captured events by backend address in IndexedDB for 30 minutes, with a browser-wide maximum set in Settings → Log storage (default 100,000). A worker handles batched writes, eviction, and summary queries; render 30 request summaries and 100 event bodies per page. Freeze fixes the time window while retention continues. Show storage failure status and use a bounded memory fallback. Demo remains memory-only. Preserve the existing visual tokens and compact timeline layout.

## Stable reading position

The request list scrolls independently within 70vh on desktop and 250px on mobile, with scroll anchoring disabled only for that list. Preserve normal timeline anchoring and keyboard focus. Live request reordering must not move the event being read. Explicit selections remain explicit when their events leave the time window; show an unavailable-selection message instead of opening the newest request automatically.
