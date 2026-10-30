# Brag Plan: Unicomply

## What is this app?
Unicomply is AICTE's complaint-monitoring dashboard: it resolves a misspelt institution name to the registry, then flags cases about the same institution sitting in different bureaus, so they coordinate instead of acting blind.

## The angle
The same college can face a fee-refund case in PGRC, a show-cause notice from the Regulation Bureau and a Regional Office complaint, and none of them knows about the others. The video is the moment that stops being true: a misspelt name, resolved; three bureaus, linked.

## Hook (first 3 seconds)
Four short lines land one after another on a calm canvas: "One college." "Four complaints." "Three bureaus." then, in the alert red, "Nobody knew."

## Key moments (the middle)
- A misspelt name typed into intake, "maharaja agrsen institute of technology delhi", resolves to Maharaja Agrasen Institute of Technology, 1-43655981521, score 0.72.
- The red banner "Potential Overlapping Cases – Coordination Required" appears with PGRC, RB and RO-NWRO chips, and the three linked case refs arrive one by one: PGRC/2026/00412, RB/2026/00087, RO-NWRO/2026/00133.
- The shared timeline: one lane per bureau, each case drawn where it was received.

## Outro / punchline
"Unicomply" then "SIH 2026 · PS 26264 · AICTE". It ends on a clean hold so the full demo video can cut straight on.

## User flow worth showing
Intake (misspelt name) → resolution (registry match) → overlap flagged (banner, linked cases, timeline).

## Tone
- Preset: polished
- Creative direction: quiet, government-grade product film
- Interpretation: few scenes, long holds, no jokes; confidence through restraint. Slow crossfades, short precise motion.

## Format: landscape — 1920x1080
## Duration: 18 s

## Visual identity (from the project: frontend/src/index.css)
- Background: #f2f3f1 (canvas); cards #ffffff
- Accent: #0b5e6b (teal); alert #b42318 on #fdf1ef
- Text: #1b1f1d, secondary #5b625e
- Display + body font: system stack (-apple-system, SF Pro, Helvetica Neue); mono ui-monospace for IDs and refs
- Strongest visual element: the red overlap banner and the shared-timeline lanes

## Share copy (draft)
Same college, four complaints, three bureaus, and nobody knew. Unicomply links them. SIH 2026, PS 26264.

## Audio direction
- Role: warm bed, no SFX (--no-sfx)
- Music: happy-beats-business-moves-vol-1 (120 BPM, 2:44, the longest bundled track so the full video can keep it under)
- Music treatment: starts at 0 at low volume (~0.35); no fade-out at 18 s because the full video continues over it; the fade is done by the assembly
- Music cue guidance: bundled preset read. Beat grid every 0.5 s (3.02, 3.52 …). Strong cue locked: 16.02 s for the end card. Hook lines every second sit on every second beat.
- Audio-reactive treatment: subtle; a faint glow on the banner and the end card breathing with the bass
- SFX posture: none
- Audio-coupled moments: hook lines on beats; the three case refs on consecutive beats; end card on the strong cue
- Restraint rule: nothing loud; the music must never cover reading

## Storyboard

### Scene 1 — Hook — 5.0s
Canvas #f2f3f1. "One college." (0.5s), "Four complaints." (1.5s), "Three bureaus." (2.5s) stack left-aligned in large type; "Nobody knew." lands at 3.5s in red and holds to 5.0s.
Sequential/interaction: yes — four lines one by one, one second apart
Audio intent: calm, a pulse starting
Audio-coupled idea: lines land on every second beat
Music: warm bed
Transition mood: soft crossfade → Scene 2

### Scene 2 — Reveal — 2.8s
Wordmark "Unicomply" with a teal underline draw; below, "Every complaint about one institution, in one place."
Sequential/interaction: none
Audio intent: relief after the hook
Transition mood: clean → Scene 3

### Scene 3 — The working app — 8.2s
One UI card, three beats. (a) 7.8–10.4: the intake field types "maharaja agrsen institute of technology delhi"; a result row resolves to "Maharaja Agrasen Institute of Technology", mono 1-43655981521, score 0.72. (b) 10.4–13.2: the red banner "Potential Overlapping Cases – Coordination Required", chips PGRC / RB / RO-NWRO, three case refs one by one. (c) 13.2–16.0: shared timeline, three lanes (PGRC, RB, RO-NWRO) with dots 00412, 00087, 00133 drawn left to right.
Captions: "A misspelt name finds the right institution." / "Three bureaus, one overlap." / "Cases on a shared timeline."
Sequential/interaction: yes — typing, then three refs on consecutive beats, then lane dots
Audio intent: steady
Transition mood: slide, no hard cuts → Scene 4

### Scene 4 — End card — 2.0s
"Unicomply" and "SIH 2026 · PS 26264 · AICTE", landing on the strong cue at 16.02 s, held to 18.0 s.
Transition mood: hold

**Music mood for this video:** warm, business, steady
**Audio summary:** a quiet bed from the first frame, hook lines on the beat, the end card on the strongest cue, no fade-out.
