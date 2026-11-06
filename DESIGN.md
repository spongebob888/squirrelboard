---
name: Squirrelboard
description: "The Quiet Network Console: calm, compact, and approachable."
colors:
  bg: "#f7f8fa"
  surface: "#fff"
  sidebar: "#fcfcfd"
  text: "#292e3d"
  muted: "#8b90a0"
  secondary: "#6d7485"
  line: "#eef0f4"
  border: "#e9ebf1"
  primary: "#6275de"
  primary-soft: "#edf0fd"
  teal: "#47b8ac"
  teal-soft: "#eaf8f4"
  green: "#35a67f"
  red: "#d45c65"
  amber: "#c39145"
  dark-bg: "#14171e"
  dark-surface: "#1c2029"
  dark-sidebar: "#191c24"
  dark-text: "#e3e7f1"
  dark-muted: "#858d9f"
  dark-secondary: "#a2a9b9"
  dark-line: "#2a2f3c"
  dark-border: "#2c3240"
  dark-primary: "#98a8ff"
  dark-primary-soft: "#2c3350"
  dark-teal: "#65cbbd"
  dark-teal-soft: "#233d39"
  dark-green: "#66c9a5"
  dark-red: "#ed949a"
  dark-amber: "#dcba77"
typography:
  headline:
    fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "27px"
    fontWeight: 650
    lineHeight: 1.4
    letterSpacing: "-0.85px"
  title:
    fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "14px"
    fontWeight: 650
    letterSpacing: "-0.15px"
  metric:
    fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "27px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-1px"
  navigation:
    fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "12px"
  field:
    fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "11px"
  button:
    fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "10px"
    fontWeight: 550
rounded:
  chip: "5px"
  control: "7px"
  navigation: "8px"
  panel: "11px"
spacing:
  stat-gap: "16px"
  section-gap: "20px"
  panel-edge: "21px"
  page-inline: "34px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    typography: "{typography.button}"
    padding: "9px 12px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    typography: "{typography.button}"
    padding: "9px 12px"
  field:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    typography: "{typography.field}"
    padding: "11px 12px"
  navigation-active:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary}"
    rounded: "{rounded.navigation}"
    height: "44px"
    padding: "0 14px"
  status-chip:
    rounded: "{rounded.chip}"
    padding: "5px 7px"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.panel}"
  metric-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.panel}"
    padding: "18px 19px"
---
# Design System: Squirrelboard

## Overview

**Creative North Star: "The Quiet Network Console"**

The Quiet Network Console is calm, compact, and approachable. The interface pairs a persistent workspace rail with compact numeric summaries, charts, and bordered panels, keeping operational information easy to scan.

Controls are soft, friendly, and gently tactile. Layered surfaces, with shadows separating levels, give the console depth without heavy visual weight. The current panel shadows are intentionally very faint; borders and changes in background tone do most of the separation.

**Key Characteristics:**

- Compact operational hierarchy with tabular numeric metrics.
- Periwinkle Blue for primary actions and download activity; Soft Teal for upload activity.
- Softly rounded controls and panels with restrained depth.
- Paired light and dark themes, plus responsive desktop and mobile navigation.

## Colors

Periwinkle Blue and Soft Teal sit against cool neutral surfaces; each light-theme token has a corresponding `dark-` entry extracted from the existing dark theme.

### Primary

- **Periwinkle Blue** (`primary`): primary actions, selected navigation, download traces, and focus outlines. `primary-soft` provides its tinted backing.

### Secondary

- **Soft Teal** (`teal`): upload traces and complementary traffic indicators. `teal-soft` supplies the related tinted surface.

### Tertiary

- **Status colors** (`green`, `red`, `amber`): success, failure, and warning states respectively. These communicate status alongside text.

### Neutral

- **Canvas** (`bg`), **Panel** (`surface`), and **Workspace Rail** (`sidebar`) form the main surface layers.
- **Primary Text** (`text`), **Secondary Text** (`secondary`), and **Muted Text** (`muted`) establish hierarchy.
- **Divider** (`line`) and **Border** (`border`) separate rows, controls, and containers.
- In dark mode, the CSS uses the same variable names with the values documented under `dark-` keys. Component previews inherit those live variables; dark keys describe the alternate values rather than separate runtime variables.

**The Traffic Pair Rule.** Keep download on the primary accent and upload on the teal accent, with accompanying series labels.

## Typography

The declared family is DM Sans with the system fallbacks shown in the frontmatter. The repository does not load a DM Sans font asset, so the installed font environment determines the rendered face. Preserve that distinction when documenting or testing typography.

The hierarchy is compact: a page headline, smaller panel titles, tabular numeric metrics, and tightly set labels. This is an extracted record of the existing sizes, not a claim that every size meets a particular accessibility standard.

- **Headline:** page title; the `headline` role captures its desktop base values.
- **Title:** panel headings; the `title` role records the shared heading style.
- **Metric:** prominent numeric values use tabular figures. At viewports at least 1600px wide, these increase to 31px.
- **Navigation:** workspace destinations use the `navigation` role, with weight 600 in the active state.
- **Field and Button:** compact form and action labels use their respective frontmatter roles.
- Explanatory copy is often 10–11px; supporting captions can be smaller. Paragraph line height defaults to 1.6. These incumbent values should be evaluated deliberately when a readability change is requested.

## Layout

A fixed 228px workspace rail sits beside the main content. The page container centers at a maximum width of 1640px, with desktop padding of 32px vertically at the top and the `page-inline` value horizontally. The summary grid has four columns and uses `stat-gap`; the middle region pairs a flexible chart with a 280px status panel using `section-gap`.

At 1190px and below, the rail narrows to 205px and the content gutters shrink. At 1000px and below, grid arrangements adapt to the narrower viewport. At 740px and below, the rail becomes an off-canvas drawer with a backdrop and menu button; content uses the available width and connection cards provide a mobile presentation. At 1600px and above, panel padding and metric sizes expand. Preserve these established breakpoints rather than introducing a competing responsive system.

## Elevation & Depth

Layered surfaces, with shadows separating levels, are the confirmed depth philosophy. The canvas, workspace rail, and panel fills establish the layers; borders and faint shadows clarify their separation. Stronger shadows belong to overlays such as tooltips, dialogs, and the mobile drawer.

The panel shadow is `0 2px 3px #202b4602` in light mode and `0 2px 3px #00000008` in dark mode. Tooltips use `0 4px 18px #00000015`. The mobile drawer uses `10px 0 40px #00000008` with a blurred backdrop. These extracted values are also available in the sidecar.

**The Quiet Depth Rule.** Preserve subtle panel separation; reserve stronger depth for overlapping surfaces.

## Shapes

Controls and panels are soft, friendly, and gently tactile. Use the established control, navigation, chip, and panel radii from the frontmatter. Fine one-pixel borders frame controls and panels. Small circular dots signal status or series identity, and line icons accompany concise labels. Preserve this form vocabulary during refinement.

## Components

### Buttons

Primary actions use the primary accent with a surface-colored label in light mode; the existing dark theme uses a deep ink label (`#171d32`). Secondary actions use a panel fill and a fine border. Both share the control radius, compact padding, and a 34px minimum height. Secondary hover states tint the border and label; primary hover increases brightness. Disabled controls use opacity 0.48 and the default cursor.

Keyboard focus uses a two-pixel primary outline with a three-pixel offset. Color and background transitions are 150ms; reduced-motion preferences disable transitions and animations.

### Chips

Status chips use compact text, the chip radius, and a short horizontal inset. Status dots accompany labels so color is not the only available signal. Tinted backgrounds distinguish state without competing with metric values.

### Cards / Containers

Panels and metric cards use the surface fill, a one-pixel border, the panel radius, and the shared faint shadow. Metric cards use the frontmatter padding; panel headers use 20px 21px at standard desktop widths and 24px on wide screens. Numeric values and supporting captions have distinct hierarchy.

### Inputs / Fields

Settings fields use the canvas fill, a fine border, the control radius, and compact label typography. Standard settings inputs have a 38px minimum height. Search fields use an integrated icon/input container and a primary outline on focus within. Preserve field labels and explicit error messages.

### Navigation

The workspace rail uses icon-and-label rows with a 44px height. Selected rows use the soft primary background, primary text, and weight 600. Hover uses the divider tone. Mobile navigation retains these destinations inside the off-canvas drawer.

### Traffic and Metric Displays

Download and upload use the paired primary and teal accents with visible legends. Numeric metrics use tabular figures. Keep unavailable, paused, stale, and demo state labels visible alongside the corresponding data.

## Do's and Don'ts

### Do:

- Do use the existing semantic CSS variables so both themes stay coherent.
- Do preserve the Periwinkle Blue download and Soft Teal upload distinction across charts and legends.
- Do carry rounded controls, bordered panels, and subtle depth into related screens.
- Do preserve visible keyboard focus and the existing reduced-motion behavior.

### Don't:

- Don't replace the incumbent type stack or accent roles during a refinement.
- Don't turn the faint panel shadow into a heavy floating-card treatment.
- Don't remove text labels that distinguish data series or connection states.
