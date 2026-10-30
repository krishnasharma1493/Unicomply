# Demo video: how to rebuild it

The 3:36 SIH demo video (no voiceover, captions only) is built from scripts in this folder.
The finished `unicomply-demo.mp4` is **not** committed (30 MB, and fully reproducible); build it with the steps below.

```
captions.md        the caption text and chapter cards (source of truth for wording)
record/            Playwright scripts that drive the real app and record chapters A-J
recordings/        the raw chapter recordings (webm, 1920x1080)
shots/             one still per chapter, for posters and fallbacks
brag/              the cold open: brag.mp4 plus its Hyperframes composition and music bed
cards/             build.py generates the 5 motion-graphic cards; out/ holds the rendered mp4s
final/             plan.js (trims, speeds, zooms, caption timings), overlays.js, clips.js, build_final.js
```

## Prerequisites (macOS)
- Node 22.22+ or 24.15+, Python 3.11+, `brew install ffmpeg`
- `npm ci` in `record/`, then `npx playwright install chromium`
- Hyperframes runs through `npx hyperframes` (needs Chrome; `npx hyperframes doctor` lists what is missing)

## Edit and rebuild only the assembly (no app needed)
Change captions, trims, speeds or zooms in `final/plan.js` (and the wording in `captions.md`), then:
```
cd final
node overlays.js          # caption pills and chapter cards -> png/
node clips.js             # one clip per chapter (or: node clips.js C)
node build_final.js       # concatenates everything + music -> ../unicomply-demo.mp4, writes chapters.txt
```

## Change a card (problem, solution, architecture, accuracy, outro)
Edit `cards/build.py` (the outro's team names and repo link are in the last block), then:
```
cd cards && python3 build.py
cd outro && npx hyperframes render -o ../out/outro.mp4 -q delivery     # likewise for problem, solution, architecture, accuracy
```
Keep the accuracy numbers equal to `docs/pitch/eval_results.md`.

## Change the cold open
Edit `brag/composition/index.html`, then in that folder `npx hyperframes render -o ../brag.mp4 -q delivery`. The music bed is `brag/composition/assets/music/bed.mp3` (a track bundled with the brag plugin); `build_final.js` reuses it under the whole video.

## Re-record the app chapters
1. Start the demo exactly as in `docs/pitch/demo_script.md`: full seed, `DEMO_TODAY=2026-11-20`, `EMBEDDINGS_MODE=model` (the red banner needs the real model; run the hero intake once with network first), `SEED_ON_STARTUP=true`, backend on port **8010**, frontend on **5180** with `VITE_DEMO_MODE=true` and `VITE_API_URL=http://localhost:8010`. Backend `CORS_ORIGINS` must include `http://localhost:5180`.
2. In `record/` (after `npm ci`), in this order, because later chapters depend on the state the intake creates:
```
node A_login.js
node C_intake.js          # resets the demo, then registers PGRC/2026/00698
node chapters.js B_overview E_institutions F_cases G_overlap H_alert I_review J_reports
```
Do not reset between `C_intake.js` and `J_reports`. Recordings are written to `recordings/`; then rebuild the assembly. If the UI changes, update the locators in `chapters.js` (see `lib.js` for the helpers).
