# Hyperframes Composition Brief: Unicomply

## Objective
Create the 18 s cold open of the Unicomply SIH 2026 demo video.

## Output
- Composition directory: `video/brag/composition/`
- Rendered video: `video/brag/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 18 s

## Source Material
- Project root: /Users/krishnasharma/Desktop/Unicomply-video
- Primary files read: frontend/src/index.css and theme.ts (tokens), docs/pitch/demo_script.md, hero_intake.txt, the overlap detail and intake components
- Product name: Unicomply
- Tagline / strongest claim: Every complaint about one institution, in one place.
- Key UI moment to recreate in HTML: the intake resolution row, the red overlap banner, the shared-timeline lanes
- Copy that must appear verbatim:
  - One college. / Four complaints. / Three bureaus. / Nobody knew.
  - maharaja agrsen institute of technology delhi → Maharaja Agrasen Institute of Technology · 1-43655981521 · 0.72
  - Potential Overlapping Cases – Coordination Required (exact, with the en dash)
  - PGRC/2026/00412 · RB/2026/00087 · RO-NWRO/2026/00133
  - Unicomply · SIH 2026 · PS 26264 · AICTE

## Creative Direction
- Tone preset: polished; quiet, government-grade product film
- Hook: four stacked lines, one second apart, the last in red
- Outro: end card on the 16.02 s strong cue, held to 18.0 s
- Avoid: generic SaaS language, abstract filler, any narration, any text held under 0.8 s (sentences 0.3 s per word)

## Visual Identity
- Background #f2f3f1; surface #ffffff; text #1b1f1d; secondary #5b625e; accent #0b5e6b; alert #b42318 on #fdf1ef
- Fonts: system stack, mono for ids/refs

## Storyboard
See brag-plan.md (4 scenes: Hook 0–5, Reveal 5–7.8, Working app 7.8–16.0, End card 16.0–18.0).

## Audio
- Role: warm bed, no SFX
- Music: assets/music/bed.mp3 (happy-beats-business-moves-vol-1, 120 BPM)
- Treatment: start at 0, volume ~0.35, NO fade-out at the end (the full video continues over it)
- Cue guidance: bundled preset; beat grid every 0.5 s; lock the end card to 16.02 s (// beat-locked: 16.02s); case refs on consecutive beats (// beat-grid)
- Audio-reactive: subtle glow only, or document the skip if extraction fails
