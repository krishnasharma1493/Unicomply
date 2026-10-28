# Unicomply visual and interaction direction (v2)

Unicomply is the tool an AICTE officer keeps open all day. v1 (PR #131) made it clean and accessible, but it looked like any well-made admin. v2 builds the identity out of the product itself: the Cross-Bureau Overlap Engine, the SLA clock and the institution record. It also reorganises the app around the work instead of the data types.

## What the audits found (v1)

Four independent reviews: UX flows, visual design (Impeccable critique and detector), WCAG 2.2 accessibility (axe, keyboard, 200% zoom, Devanagari), and frontend architecture.

- **No identity.** The palette was apple.com's own (`#f5f5f7`, `#1d1d1f`, `#0071e3`) on the system font. With the wordmark covered, it was a generic admin.
- **Organised by data, not by work.**
  - Every role landed on the same KPI dashboard. The PGRC head saw "288 beyond SLA" but no queue.
  - Things needing a decision were spread over Alerts, Overlap Center, Match Review and the dashboard.
  - The case list could not be sorted by SLA, and returning from a case lost the filters.
- **The signature moment was a chip pile.**
  - Overlap evidence was an unordered cloud of reasons. Pairs were mixed, so one case showed another pair's "similarity 1.00".
  - The misspelt-to-registry resolution was never shown.
  - The SLA was a grey chip on every row.
- **Feedback gaps.**
  - Confirming an overlap closed silently. Errors offered "Try again" for 403/404.
  - There was no way to jump to a case by reference without the filter form.
- **Accessibility gaps.**
  - No skip link, a static page title, and focus left on `body` after navigation or dialogs.
  - Faint focus rings, some tag colours below 4.5:1, focusable chart internals hidden from assistive tech, and silent toasts.

## Decisions

### Organised by job
- **Navigation.** Grouped as Work (Today, Cases, New case, Match Review), Decide (Overlaps, Alerts), Look up (Institutions) and Report (Overview, Reports, Admin). Every old route still works; the KPI dashboard moved to `/overview`.
- **Today (`/`).** Each role's queue:
  - overlaps needing a decision;
  - pending match reviews (intake, senior);
  - cases past SLA and due soon, soonest first (the one backend change: an optional `sort=sla_due_asc` on `GET /cases`);
  - unread alerts.
- **Command bar (⌘K / Ctrl K, or the toolbar field).** Jumps to a case by reference, an institution by name or Permanent ID, or any page the role may open. It uses the same scoped endpoints.
- **Cases split view.** At 1280 px and wider, the list stays beside the open case, so working through a queue never loses its place. A filter sentence says what the list holds.

### The Evidence Line (the signature)
One drawn element, a hairline with ticks and dots, is used for every claim the system makes. Three words: *precise, causal, quiet.*

- **SLA track.** One tick per day of the SLA, with the elapsed days filled: neutral, amber from four days before the due date, red past it. The words ("Day 19 of 21", "Beyond SLA +3") always sit beside it.
- **Resolution line.** The complainant's words, then a drawn arrow, then the registry name with the words they account for set in ink.
- **Overlap lanes.** One lane per bureau on a shared date axis, with each case a dot where it was received and the current case marked. The picture says what the reasons say in words: the same matter is open in several units at once.
- **Evidence ledger and pair grid.** Reasons are read into fixed rows (institution, issue, bureaus, received, complaint text) in the same order everywhere. Pairs are never mixed, and similarity is always given in words as well as a number.

### Voice, colour, shape
- **Palette.** Unicomply's own:
  - Cool paper canvas `#f2f3f1`, white surfaces, ink `#1b1f1d`, secondary `#5b625e` (6.3:1).
  - One accent, a deep registry ink `#0b5e6b` (7.4:1), for actions, selection, focus and resolution only.
  - Red `#b42318` only for Probable overlaps, breaches and destructive actions. Amber text `#8a4b00`. Green `#1d7a34`.
  - No new hues, gradients, glow or tinted containers.
- **Type.**
  - The system stack (SF Pro on Macs, with Noto Sans Devanagari in the fallback list for Hindi), with size-specific tracking and tabular figures.
  - Case references and IDs are set like a register: monospace, tabular, outlined, never filled.
- **Shape.** 6–8 px corners and square-ended rules. No pills. Sections are one level deep; rows inside them are separated by hairlines.
- **Overlap banner.** Untinted, sitting on a 2 px tier rule. The red lives only in the icon, the title and the rule. The exact PRD strings are kept.

### Motion
- **Springs.** Critically damped (`lib/motion.ts`: bounce 0, about 0.35 s). Interruptible, transform and opacity only.
- **Each motion explains a change:**
  - Candidates re-rank in place.
  - Lanes draw their cases in date order, the current one first.
  - A new timeline entry pushes the history down.
  - Resolved queue items leave.
  - Popovers and the command bar grow from where they were opened.
- **No entrance cascades** on data pages.
- **Reduced motion.** Under `prefers-reduced-motion` everything becomes a 150 ms cross-fade, and Ant Design's motion is off.

### Materials
Glass only on the floating chrome (sidebar, toolbar, command bar, popovers, dialogs). Content is always solid. `prefers-reduced-transparency` and `prefers-contrast: more` make the chrome solid, with defined borders.

### Accessibility
- Skip link, and page titles that follow the h1.
- Focus moves to the new heading after in-app navigation and returns to the trigger when dialogs and popovers close.
- 2 px solid ink focus rings (7.4:1).
- Toasts are mirrored into a live region.
- Errors a retry cannot fix (401/403/404) explain why instead.
- Charts are inert, with keyboard links carrying the drill-down.
- 24 px targets, AA contrast for every text pair, and layouts tested at 200% zoom and with long Devanagari text.

## Process note

This was a code-led build: the brief pinned the quality bar (Apple-grade craft, a serious government tool) and the identity source (the product's own mechanism), so no concept roll or comp round ran. This document is the contract the build and its finish review were held to.

## Rejected
- **A display or brand typeface.** The audience reads data all day. The system face is the most legible, ships offline, and covers Devanagari.
- **Dark mode.** Daylit offices on shared monitors; a half-finished dark theme is worse than none.
- **A KPI hero on the home page.** Numbers that ask nothing of the officer are on Overview. Today shows only what needs doing.
- **Decorative motion, illustration and empty-state art.** Empty states say what is clear and what to do next.
