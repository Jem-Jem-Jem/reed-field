# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A p5.js interactive sketch — a field of reeds that bend away from the cursor/finger. Deployed as a static site via GitHub Pages at `https://jem-jem-jem.github.io/reed-field/`. No build step, no dependencies beyond p5.js loaded from CDN.

## Git workflow

Branch protection blocks direct pushes to `main`. All changes must go through the feature branch:

1. Sync: `git fetch origin main && git reset --soft origin/main` (run from `claude/setup-sketch-environment-KltGb`)
2. Edit, commit, `git push --force-with-lease -u origin claude/setup-sketch-environment-KltGb`
3. Create PR → squash-merge immediately (no review wait for visual/config changes)

The user reviews changes in the live GitHub Pages deployment. **Commit and merge every change immediately** without waiting for review approval.

## Architecture

Two files do all the work:

**`reed-field.js`** — The sketch, exposed as `ReedField.init(containerId, config)`. Key internals:
- Seeded xorshift32 RNG (`seedRNG` / `rnd` / `rndRange`) for reproducible layouts
- `makeReedClass(p, cfg)` — factory returning a `Reed` class bound to the p5 instance and config
- `Reed.constructor` — sets per-reed personality: `maxLen`, `baseW` (rod thickness), `bendBaseLen`, `bendTipLen`, `bendBias`, `tipResist`, `alpha`
- `Reed.update(path, t, cfg)` — spring physics: sway + cursor force → velocity → displacement
- `Reed.draw(baseCol, tipCol)` — renders base dot (`Reed.DOT_DIAM`) then cubic Bézier rod if displaced
- `buildBackground(p, cfg)` — solid color offscreen buffer, drawn each frame via `p.image()`
- Cursor tracking: `PointerEvent.getCoalescedEvents()` builds a per-frame polyline (`pathBuf`); `Reed.update` uses point-to-segment distance so fast motion doesn't skip reeds
- Regular grid placement: `(c + 0.5) * spX`, `(r + 0.5) * spY`

**`index.html`** — Shell + boot call. The only place visual config lives:
```js
ReedField.init('reed-hero', {
  reedCount: 2000,
  influenceRadius: 75,
  reedLengthMin: 5,
  reedLengthMax: 5,
  swayStrength: 0,
});
```
Everything not listed here falls back to defaults in `reed-field.js` (`forceStrength: 14`, `stiffness: 0.02`, `damping: 0.88`, `bgColor: #1c2252`, `baseColor/tipColor: #faa61a`).

## Reed rendering

Reeds sit as dots at rest (`dx=dy=0`). When displaced:
- `vLen = min(mag * 2.4 + 3.0, maxLen)` — rendered length scales with displacement, capped at `maxLen`
- Cubic Bézier P0→P3: base tangent points straight up (`bendBaseLen`), tip tangent points along the displacement direction blended with `tipResist` toward vertical
- `baseW` sets uniform `strokeWeight` — currently matched to `DOT_DIAM` for visual continuity

## Config knobs and their effects

| What to change | Which param |
|---|---|
| More/less cursor push | `forceStrength` |
| Reeds drift further from rest | lower `stiffness` |
| Motion dies faster | lower `damping` |
| Reed visible length | `reedLengthMin/Max` |
| Reed thickness | `baseW` range in constructor, `DOT_DIAM` static |
| More pronounced bend | lower `tipResist`, increase `bendBaseLen`/`bendTipLen` |
| Ambient idle motion | `swayStrength` (currently 0) |
| Cursor influence area | `influenceRadius` |
