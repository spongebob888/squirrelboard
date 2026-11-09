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

Retain captured events by backend address in IndexedDB for 30 minutes, with a browser-wide maximum set in Settings → Log storage (default 10,000). A worker handles batched writes, eviction, and summary queries; render 30 request summaries and 100 event bodies per page. Freeze fixes the time window while retention continues. Show storage failure status and use a bounded memory fallback. Demo remains memory-only. Preserve the existing visual tokens and compact timeline layout.

## Stable reading position

The request list scrolls independently within 70vh on desktop and 250px on mobile, with scroll anchoring disabled only for that list. Preserve normal timeline anchoring and keyboard focus. Live request reordering must not move the event being read. Explicit selections remain explicit when their events leave the time window; show an unavailable-selection message instead of opening the newest request automatically.

## Log storage help

Show a compact stored-event count and 30-minute retention summary. Keep storage limits, timing semantics, and request ID matching in the adjacent info tooltip. Reveal it on hover, keyboard focus, or touch focus; allow Escape dismissal and pointer travel into the tip. Keep the 320px tooltip inside the mobile viewport.

Capture completeness shares this summary: show an amber warning icon and “Capture incomplete” beside retention whenever drop, interruption, eviction, or unreadable-record counts are nonzero. Put all four counts in the same hover/focus tooltip above storage and timing help. Keep connection and storage failures as separate actionable messages.

## Log level filter

Place a native Log level select immediately after Time window. Default to All levels, with minimum ERROR, WARN, INFO, DEBUG, and TRACE choices. Include events at the selected level and above (INFO includes INFO, WARN, and ERROR); label thresholds explicitly. Filter summaries, counts, markers, and event pages consistently in IndexedDB and memory, while retaining request metadata from other levels. Reset pagination when filters change; preserve explicit request selection and explain no matches. Capture and storage keep all levels.

## Event waterfall

THESIS: Compare captured event timing across fixed category lanes; each plotted dot is one event.
OWN-WORLD: Inherit Quiet Network Console typography, bordered surfaces, theme tokens, and the established category colors.
STORY: Open Waterfall under Log, filter the shared arrival window and minimum level, then select a dot to inspect its timestamp, request ID, message, fields, and spans. Jump to its request timeline when needed.
FIRST VIEWPORT: Subpage links precede the existing filters. A horizontal server-time axis spans seven compact category lanes with colored event dots; selected-event details follow the chart. Mobile keeps readable lanes in a horizontally scrollable region.
FORM: An ordinary extension with category rows confirmed by the user. Fit each page’s axis endpoints to its earliest and latest plotted timestamps. Page a configurable number of compact points (default 500, 1–10,000), without sampling or silently dropping dots; load full bodies only for the displayed event page. Freeze keeps the inspected window fixed. No concept roll for this specified extension.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Each category stays in one compact row regardless of event density. The user explicitly wants overlapping dots left overlapping. Preserve exact horizontal timestamps and every point; use chronological keyboard navigation to inspect coincident events. Keep the chart naturally sized, with horizontal scrolling on mobile.

Events per page is a waterfall-only number field beside the shared filters. Save it in browser preferences; changing it resets the event page. Both axis endpoints follow the minimum and maximum timestamp among displayed dots. With one timestamp, center the overlapping dots and show that same timestamp at both endpoints. Keep WARN and ERROR level text independently amber/red in the selected-event details.

Finish evidence: final desktop light/dark, mobile, and coincident-event captures preserve the incumbent DESIGN.md and token sidecar unchanged. The reviewer scored independent severity styling resolved and passed the page-fitted axis and configurable limit additions at their reviewed scope. Browser checks cover custom event limits, persistence, pagination, exact axis endpoints, deliberate overlap, and keyboard inspection. README.md documents the final behavior. No shipping raster assets were introduced.

## Waterfall event list

Place a compact, independently scrolling chronological event list immediately below the waterfall. It contains exactly the plotted event page and shares category colors, timestamp, request ID, and independently colored severity. Selecting a list row highlights its dot and loads its details; selecting a dot reveals the matching list row by scrolling only the list. Keep selection stable during live refreshes, avoid document scroll jumps, and preserve keyboard navigation within the list. The existing event-page limit controls both views.

Waterfall list rows print the message followed by inline tracing-style key=value fields, preserving rendered strings, structured values, empty strings, and falsy values. Omit message from the field pairs. Load only the current plotted page’s bodies; dot/list selection reuses those records without another history query.

Compact list rows use the accepted two-line design: event name, then message with inline fields. Put request ID below timestamp; omit category and target text from list rows. Keep the full preview in its hover title and selected-event details when two-line previews are clipped. Preserve category color and independent WARN/ERROR severity.

The fresh finish review of the accepted two-line list and current waterfall returned ship. Desktop light/dark, mobile, and dense-list captures were validated; the existing DESIGN.md and token sidecar remain unchanged. The final component detector and both builds pass. No shipping raster assets were added.

Native log controls are memoized on their own values, so incoming events, storage counts, and clock refreshes cannot rewrite select options or reset an unfinished event-limit edit. Intentional filter changes still update and query normally.

Search events sits beside Request ID and searches the complete event, including messages, tracing field pairs, span context, category, target, severity, timestamp, and request ID. Matching is case-insensitive literal text, debounced by 250 ms; Enter applies immediately and clearing resets immediately. Both subpages share the search. Search filters before pagination and keeps request metadata from other retained events. A worker reads a separate IndexedDB search store in bounded batches; schema upgrades backfill retained events, and eviction removes search records together with their event. Search controls keep their drafts during live refreshes.

The event search extension received a ship finish review at desktop and mobile sizes. The accepted live filter refinement gives request ID 160 px, time window 138 px, minimum level 142 px, and event limit 100 px, while search grows into the remaining row space up to 380 px. Controls wrap on mobile with paired request/search fields. The final compact-control review returned ship across request and waterfall views, desktop light/dark and mobile. Existing design tokens and documentation remain authoritative.

Waterfall event rows, full hover previews, and selected-event messages print the root-to-leaf span chain before the message in tracing full-format syntax: `inbound{tag=mixed}:tcp_req{req_id=42}: message key=value`. Span fields preserve falsy and structured values, including fields named message. Empty spans print their name without braces; events with no spans keep their existing text. Preserve compact two-line rows, with full context on hover and selection.

The span-rendering finish review returned ship for desktop light/dark and mobile. The component detector reports no findings. Existing DESIGN.md and tokens remain unchanged; screenshots are review evidence only.
