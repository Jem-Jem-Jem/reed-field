# Interaction magnitude scaling (issue #48)

## Problem

`waveStrength`, `moveInjectStrength`/`moveInjectStrengthTouch`, `moveForceScale`,
and `moveGridCell` are fixed absolute px/force values, tuned against a desktop
canvas (~1280px+ wide). Reed density (`reedGap`) and reed size (`reedLength`)
already scale correctly with canvas size (PR #46–47) — this issue is about
interaction *force*, not density/geometry.

On a small canvas (mobile viewport, or a narrow Figma Sites iframe embed) the
same absolute force is applied to a much smaller field, so a single tap or
drag reads as visually overwhelming — "the interaction engulfs the screen."
The grid resolution (`moveGridCell`, fixed 14px) is also coarse relative to a
small canvas, making the movement-ripple wake feel chunky.

## Root cause

No dependency between interaction magnitude and canvas size. Every force
value is a flat constant in `cfg`, read directly at point of use.

## Solution

Compute a single scale factor once per `initSystem()` call (which already
reruns on every resize via `refreshSize()`), derived from `p.width` — the
canvas's own measured width, correct even inside an iframe where
`window.innerWidth` would report the iframe's own size, not the parent
page's.

```js
const scale = Math.max(0.5, Math.min(1, p.width / 1280));
```

- `p.width` ≥ 1280 → `scale = 1` (today's exact behavior, zero regression on
  desktop / full-size Figma Sites embeds)
- `p.width` down to ~640 → `scale` shrinks linearly
- `p.width` ≤ 640 → floor at `scale = 0.5` (never below half-strength — a
  tap/drag stays clearly present, doesn't go dead on small phones)

Build a derived `effCfg` (shallow copy of `cfg`, five fields overwritten)
once inside `initSystem()`:

```js
const effCfg = {
  ...cfg,
  waveStrength:            cfg.waveStrength * scale,
  moveInjectStrength:      cfg.moveInjectStrength * scale,
  moveInjectStrengthTouch: cfg.moveInjectStrengthTouch * scale,
  moveForceScale:          cfg.moveForceScale * scale,
  moveGridCell:            cfg.moveGridCell * scale,
};
```

All downstream reads of these five fields switch from `cfg.*` to `effCfg.*`:

- `spawnWave()` — `wave.strength: effCfg.waveStrength`
- `p.draw()` — the `strength` var picking `moveInjectStrength`/`Touch`
- `Reed.update()` — `cfg.moveForceScale` (passed in as the `cfg` param —
  swap the call site to pass `effCfg`, no signature change)
- Every `moveGridCell` read used for grid sizing (`gridCols`/`gridRows` in
  `initSystem()`) and injection (`injectRipple()`'s `ix`/`iy` calc)

`effCfg` is rebuilt from scratch every `initSystem()` call (including on
resize), so scale is always derived fresh from the current `cfg` baseline —
no compounding/double-shrink risk from repeated resizes.

## Explicitly out of scope

- `reedLength`, `reedGap`/`reedGapRatio` — deliberately fixed per PR #47,
  this issue is about force, not density.
- `waveSpeed`, `waveWidth`, `waveMaxRadiusEff` (wave reach/radius) — not
  selected in scope; only force magnitude and grid resolution are scaled.
- No new public config option. `1280` (reference width) and `0.5` (floor)
  are internal constants, not exposed on `cfg` — no caller has ever needed
  to override a scale curve, and adding a knob nobody's asked to tune would
  be speculative.

## Rejected alternatives

- **Mutate `cfg` in place at init.** `initSystem()` reruns on every resize
  — mutating `cfg.waveStrength *= scale` directly would compound the scale
  on repeated resizes (shrink again each time), a real bug, not just an
  unlikely edge case on a responsive-embed project.
- **Scatter `* scale` inline at each read site instead of a derived
  `effCfg`.** Works but spreads the scaling logic across ~5 call sites with
  no single source of truth — easy to miss a site during a future tuning
  pass.

## Testing

Existing test files (`wave-coverage.test.js`, `wave-interference.test.js`)
cover wave geometry at `scale = 1` implicitly (no canvas-width dependency in
their setup). No new automated test — `scale` is a three-line pure function
of `p.width`; verify by hand via `preview_start` at a few widths (resize the
window to move canvas edge: 1280px+ desktop, ~700px tablet, ~360px phone)
checking force visibly weakens without going dead, then confirm touch
behavior specifically on the live deployment per this project's standing
testing workflow (touch can't be verified locally).
