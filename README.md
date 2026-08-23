# Puppy Kart 🐶🏁

A Mario Kart–style racing game starring Bear the puppy. Built with vanilla
JavaScript + HTML5 Canvas — no frameworks, no build step.

## Play

| Action | Desktop | Mobile |
|---|---|---|
| Gas | `↑` / `W` (or Auto-Gas) | GAS pedal / Auto-Gas |
| Steer | `←` `→` / `A` `D` | ◀ ▶ buttons |
| Brake / reverse | `↓` / `S` | ⛔ button |
| Hop / Drift (hold, then release for mini-turbo) | `SHIFT` | DRIFT button |
| Use item | `SPACE` | 🎁 button |
| Respawn on track | `R` | — |
| Pause | `Esc` / `P` or ⏸ button | ⏸ button |
| Mute | `M` | Sound toggle in pause menu |

## Features

- Mode 7 pseudo-3D renderer (SNES Mario Kart style), adaptive internal
  resolution for smooth framerates
- 3-lap race vs 3 CPU rivals with rubber-banding AI
- Drift + mini-turbo (blue → orange sparks), rocket start on the countdown
- Item boxes: bone boost, triple bone, banana peels
- Boost pads, off-road slowdown, kart bumping, wrong-way warning
- Live minimap, lap/position HUD, results screen with best-time saving
- Synthesized engine/SFX + chiptune music via WebAudio (no audio assets)

## Run locally

```bash
npx http-server -p 8080        # then open http://localhost:8080
```

(Any static server works; opening index.html directly also works.)

## Deploy to Vercel

Zero config — it's a static site:

```bash
npx vercel          # preview
npx vercel --prod   # production
```

`.vercelignore` keeps the original photos/videos and dev files out of the
deployment; only `index.html`, `css/`, `js/` and `assets/` are published.
