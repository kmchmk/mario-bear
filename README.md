# Bear Kart

Small paws. Big energy. An original arcade kart racer starring Bear, built with vanilla JavaScript and Canvas. No runtime dependencies, external font requests, or build step.

## Run

```sh
python3 -m http.server 8080 --bind 127.0.0.1
```

Open http://localhost:8080. Any static web server works. Deploy the existing HTML, CSS, JS, and assets together; no server-side API is required.

## The game

- Pinewood Circuit: three laps through a golden-hour alpine setting.
- Bear's photo-referenced No. 01 kart, with a transparent rear-view gameplay asset.
- Three CPU rivals, ordered lap checkpoints, live rankings, and individual lap times.
- Cruise, Sport, and Expert change player and rival speeds. Personal bests are saved separately for each class.
- Hold a drift to charge blue/orange mini-turbo; release to boost.
- Bone boosts, triple boosts, banana traps, and track boost pads.
- A redesigned garage, track preview, Bear profile, controls guide, pause menu, and results.
- Speedometer, persistent inventory, circuit map, drift-charge meter, and recovery controls.
- Keyboard and multi-touch controls; optional auto-acceleration.
- Reduced-motion preference, keyboard focus handling, and pause on focus loss.

## Controls

| Action | Keyboard | Touch |
|---|---|---|
| Accelerate | W / ↑ | GAS, or auto-accelerate |
| Steer | A D / ← → | Left / right |
| Brake / reverse | S / ↓ | BRAKE |
| Drift | Hold Shift while steering at speed | Hold DRIFT while steering |
| Use item | Space | ITEM |
| Return to track | R | ↺ |
| Pause | Escape / P | Ⅱ |
| Mute | M | Sound toggle in garage or pause |

Enable or disable auto-acceleration in the pause menu. It defaults on for touch devices. Hold accelerate through the countdown for a rocket start.

## Implementation

The renderer remains a lightweight **2.5D / Mode-7 engine**, not a full 3D model-based engine. The ground is perspective-projected from a world texture. Cached pine trees, signs, karts, items, and particles share a depth-sorted billboard pass. Bear's sprite leans and hops around its tire contact point; it is not a freely rotating 3D model. The garage key art is an illustration, not a gameplay screenshot.

- `js/main.js`: loading, camera, rendering, menus, race lifecycle, records.
- `js/track.js`: spline, asphalt/shoulders/curbs, surface map, start grid.
- `js/scenery.js`: deterministic upright scenery and fallback/rival karts.
- `js/kart.js`, `js/kart_ai.js`, `js/race.js`: physics, AI, items, checkpoints.
- `js/hud.js`: device-pixel-ratio-independent racing information.
- `js/input.js`, `js/audio.js`: input and synthesized audio.

Original photos and video remain intact. New generated assets and exact prompts are documented in `ART_DIRECTION.md`.

## Verification

```sh
node tests/regression.cjs
for file in js/*.js; do node --check "$file" || exit 1; done
```

The dependency-free regression suite checks local references, pause/restart, three-lap completion, reverse-line protection, missed-gate recovery, inventory, drift release, reverse throttle recovery, difficulty, AI completion, storage denial, and renderer execution at desktop/phone dimensions. It uses DOM/Canvas stubs and road-only surface simulation; **it does not establish visual quality, real surface/AI behavior, audio quality, or browser performance**.

Manual acceptance still needed: play all difficulty levels, test touch multi-input, check off-road recovery and item interactions, inspect portrait/landscape layouts, and listen to the audio on target devices.
