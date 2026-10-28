# Unicomply visual direction

Unicomply is an operating tool. AICTE officers keep it open all day to register complaints, watch SLAs and decide overlaps. The design aims for the calm, exact feel of a good Mac app, where the interface stays out of the way of the case.

## What was wrong (critique of the previous UI, 1440×900, all personas)

- **Default Ant Design with navy paint.** It had a dark slate sidebar, a white header, white cards on grey, 8 px radii everywhere and blue/cyan/purple/volcano tags. Any admin template looks the same, so nothing in it was specific to Unicomply.
- **Card soup.** Each page stacked a white card per section, then put more bordered cards inside it (linked cases, candidates, alert groups). Case Detail and Institution 360 went three boxes deep. The borders, not the content, set the rhythm.
- **Rainbow tags.** Status, bureau, role and persona each had their own hue, so a table row could hold four colours. Red meant both "Probable overlap" and "low match score", so the one colour that should stop an officer had lost its meaning.
- **Broken chrome.** The brand subtitle overflowed the 60 px header. The "AICTE" pill was clipped. The dark sidebar ended at 900 px on long pages, leaving a white strip. Case Intake highlighted "Cases" in the nav instead of "Case Intake".
- **Cramped tables, airy forms.** The Cases table wrapped institution names onto 3–4 lines next to mostly empty columns, while Intake laid every field at full width with large gaps.
- **No hierarchy on the hero pages.** The overlap banner, a list of nine reasons with duplicates, and the linked cases had equal weight, so the coordination message did not stand out.
- **Dashboard KPIs** were eight separate boxes. The things that need attention (probable overlaps, institutions beyond SLA) sat below two charts.

## Layout model

- **A sidebar and a toolbar float over one canvas.** A 248 px sidebar holds the wordmark and navigation. A 52 px toolbar holds the persona, alerts and account controls. Content scrolls underneath both.
- Each page has one **page header**: an optional back link, the title, a one-line purpose capped at 72ch, and its actions aligned right. The pages read in a single column at most 1,200 px wide. Two-column layouts are used only where a page compares two things: Intake (form beside candidates) and Match Review (queue beside workbench).
- **Grouping comes from space first.** A section is a white rounded surface, one level deep only. Inside a section, rows are separated by hairlines and never boxed again.

## Colour (Restrained: neutrals and one accent)

| Role | Value | Contrast |
|---|---|---|
| Canvas | `#f5f5f7` | — |
| Surface | `#ffffff` | — |
| Text | `#1d1d1f` | 16.8 (white), 15.5 (canvas) |
| Secondary text | `#636366` | 5.9 (white), 5.4 (canvas) |
| Accent: actions, selection, focus | `#0071e3` fill, `#0066cc` text | white on fill 4.7; link 5.6 (white) |
| Probable / breach (red) | `#d70015`, tint `#fff2f2`, text on tint `#b3000c` | 5.4 / 6.6 |
| Possible / warning (amber) | `#9a5300` text, tint `#fff7e8`, text on tint `#8a4b00` | 5.8 / 6.4 |
| Success (green) | `#1d7a34` | 5.4 |

Red is reserved for Probable overlaps, SLA breaches and destructive actions. A match or pair score is drawn in neutral and accent, never red. Every semantic colour comes with a word or icon. Bureaus and statuses are neutral labels with no hue.

## Type

- **Font.** The system stack (`-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Noto Sans", "Noto Sans Devanagari", sans-serif`) gives SF Pro on Macs and a native face elsewhere, with no downloads.
- **Scale (rem, 14 px base).**

  | Step | Size (rem) | Weight | Line height | Tracking |
  |---|---|---|---|---|
  | Caption | 0.786 | 500 | 1.35 | +0.01em |
  | Footnote | 0.857 | 400 | 1.4 | — |
  | Body | 1 | 400 | 1.5 | −0.005em |
  | Headline | 1.071 | 600 | 1.35 | −0.01em |
  | Title 3 | 1.286 | 600 | 1.25 | −0.015em |
  | Title 2 | 1.571 | 700 | 1.18 | −0.02em |
  | Large title | 2 | 700 | 1.1 | −0.025em |

- **Emphasis** comes from weight, not size. Numbers in tables, KPIs and references use tabular figures.

## Spacing

A 4 px base, written in rem: 0.25 / 0.5 / 0.75 / 1 / 1.5 / 2 / 3 / 4. Sections sit 1.5rem apart, page headers have 2rem above them, and section bodies have 1.25rem padding. Table rows are 44 px tall, which keeps them comfortable without hiding data.

## Materials

- **Glass, only on the control layer.** That means the sidebar, toolbar, sticky table headers, popovers, menus, selects, the persona switcher, the alert popover, drawers and dialogs. The material is a translucent white fill with `backdrop-filter: blur(24–40px) saturate(180%)` and a bright 1 px inner top edge. Bigger surfaces get a heavier blur and a deeper, neutral shadow.
- Content (tables, forms, case text, charts, KPIs) sits on **solid white**. Glass is never stacked on glass, and body text never sits on thin glass. Dialogs use the thickest material (around 92% opacity).
- **Scroll edge.** The toolbar shows a soft hairline only once content has scrolled under it.
- **Modals.** A 22% black scrim, and the shell scales to 0.985 behind it. Popovers have no scrim.
- **Accessibility settings.** `prefers-reduced-transparency` switches every glass surface to solid fills with no blur. `prefers-contrast: more` uses solid fills, defined 1 px borders and darker secondary text.

## Motion

- **Library.** `motion` for springs. The default is critically damped (bounce 0) with about 0.35 s response. There is no bounce anywhere, because the app has no momentum gestures.
- **Press feedback.** Buttons, rows and nav items react on pointer-down (scale 0.97 / opacity) within 90 ms. Nothing on the input path waits for an animation.
- **Page change.** A cross-fade plus 6 px of rise on the content only. The chrome never moves, and there is no exit animation to wait for.
- **Popovers, menus and selects** materialize from their trigger: blur, scale 0.96 → 1 and opacity together. Ant Design's placement-aware transform origin is kept. Dialogs materialize the same way, and drawers slide in and out along the same edge.
- **Animated properties.** Only transform, opacity and filter. There are no entrance cascades on data pages and no looping motion.
- **Reduced motion.** Movement becomes a 150 ms cross-fade, and Ant Design's own motion is switched off.

## Rejected, and why

- **Dark mode.** Officers work in daylit offices on shared monitors. A dark theme at the same standard would need every chart and tint re-derived, so a polished light theme beats a half-finished pair.
- **Coloured role and persona avatars.** Identity was carried by five hues. It is now carried by initials and text on neutral grey.
- **Icon tiles, gradients, illustrations and empty-state art.** These are decoration. Empty states teach the next step in words instead.
- **Card grids for lists** (overlap groups, institutions). Scanning a list is faster than scanning a grid, so these are now rows with right-aligned meta.
- **A custom component library.** Everything is Ant Design 6, restyled through `theme.ts` tokens and CSS variables in `index.css`.
