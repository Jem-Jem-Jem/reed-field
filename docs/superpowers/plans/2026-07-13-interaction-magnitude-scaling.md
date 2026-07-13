# Interaction Magnitude Scaling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scale click-wave/movement-ripple interaction force and movement-ripple grid resolution by canvas width, so small canvases (mobile viewports, narrow iframe embeds) don't receive desktop-tuned interaction magnitude. Closes issue #48.

**Architecture:** A pure function `computeInteractionScale(canvasWidth)` returns a 0.5–1.0 multiplier (1.0 at 1280px+, linear down to a 0.5 floor at 640px and below). `initSystem()` (already rerun on every resize) computes this scale from `p.width` and builds a derived `effCfg` — a shallow copy of `cfg` with five force/resolution fields multiplied by the scale. Every downstream read of those five fields switches from `cfg` to `effCfg`; everything else in `cfg` passes through `effCfg` unchanged since it's a shallow copy.

**Tech Stack:** Vanilla JS, p5.js (CDN), plain Node.js for the one unit test (no framework, `node <file>.test.js`, `assert`-based — matches this repo's existing no-build-step, no-package.json convention).

## Global Constraints

- No new public config option — `1280` (reference width) and `0.5` (floor) are internal constants inside `reed-field.js`, not added to the `cfg` object or documented in README's config table.
- `reedLength`, `reedGap`, `reedGapRatio`, `waveSpeed`, `waveWidth`, `waveMaxRadiusEff` are NOT touched — out of scope per the design spec.
- `effCfg` must be rebuilt from scratch on every `initSystem()` call (including resize-triggered calls) — never mutate `cfg` in place, to avoid compounding the scale across repeated resizes.
- Touch-specific behavior cannot be verified locally — confirm via `preview_start` for JS errors/layout/mouse-driven feel only; touch magnitude needs a live-deployment phone check per this project's standing testing workflow (see `CLAUDE.md`).
- Branch protection is on for `main` — this work happens on `feat/interaction-magnitude-scaling` (already checked out), push with `--force-with-lease`, PR + squash-merge, no direct push to `main`.

---

### Task 1: Scale factor function + effCfg wiring

**Files:**
- Create: `scale-magnitude.test.js` (repo root, matches existing flat-file test convention — plain Node, no framework)
- Modify: `reed-field.js`

**Interfaces:**
- Produces: `ReedField.computeInteractionScale(canvasWidth)` — pure function, `number -> number`, exported alongside `init` on the returned `ReedField` object. Takes a canvas width in px, returns a scale multiplier clamped to `[0.5, 1]`.
- Consumes: nothing from other tasks — this is the only task.

- [ ] **Step 1: Write the failing test**

Create `scale-magnitude.test.js`:

```js
const assert = require('assert');
const { ReedField } = require('./reed-field.js');

// Above reference width: full strength, no regression on desktop.
assert.strictEqual(ReedField.computeInteractionScale(1280), 1);
assert.strictEqual(ReedField.computeInteractionScale(1920), 1);

// Between floor and reference: linear.
const mid = ReedField.computeInteractionScale(960);
assert.ok(mid > 0.5 && mid < 1, `expected 960px scale between 0.5 and 1, got ${mid}`);
assert.ok(Math.abs(mid - 0.75) < 0.001, `expected 960px scale ~0.75, got ${mid}`);

// At/below floor width: clamped to 0.5, never below.
assert.strictEqual(ReedField.computeInteractionScale(640), 0.5);
assert.strictEqual(ReedField.computeInteractionScale(360), 0.5);
assert.strictEqual(ReedField.computeInteractionScale(1), 0.5);

console.log('scale-magnitude.test.js: all assertions passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scale-magnitude.test.js`
Expected: throws — `reed-field.js` doesn't yet export a `ReedField` module binding or `computeInteractionScale` (it's currently a browser-global IIFE with no `module.exports`).

- [ ] **Step 3: Add the exported scale function to `reed-field.js`**

At module scope, directly below the seeded-RNG block (after the `rndRange` definition, before `function makeReedClass(...)`), add:

```js
  // Interaction force scales down on small canvases so a tap/drag tuned
  // against a desktop-size field doesn't overwhelm a mobile-size one.
  // 1280px+ = full strength (today's exact behavior); floors at 0.5 so
  // interaction stays clearly present even on the smallest phones.
  const SCALE_REF_WIDTH = 1280;
  const SCALE_FLOOR      = 0.5;
  const computeInteractionScale = canvasWidth =>
    Math.max(SCALE_FLOOR, Math.min(1, canvasWidth / SCALE_REF_WIDTH));
```

At the bottom of the file, change the return statement and add a CommonJS
export guard so the same file works as both a browser global (`<script>`
tag, current usage — untouched) and a Node `require()` target (test-only):

```js
  return { init, computeInteractionScale };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ReedField };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node scale-magnitude.test.js`
Expected: `scale-magnitude.test.js: all assertions passed`

- [ ] **Step 5: Commit the scale function**

```bash
git add reed-field.js scale-magnitude.test.js
git commit -m "$(cat <<'EOF'
Add canvas-width-based interaction scale factor

Pure function, floors at 0.5 below 640px, full strength at 1280px+.
EOF
)"
```

- [ ] **Step 6: Wire `effCfg` into `initSystem()`**

In `reed-field.js`, inside the `init(containerId, userConfig = {})` function's
`new p5(p => { ... })` closure, find the block of `let` declarations near the
top (`let reeds = [];`, `let bgBuffer = null;`, etc. — currently starts
around the `let reeds` line) and add one more:

```js
      let effCfg          = cfg; // rebuilt in initSystem() with scaled force/grid fields
```

Inside `initSystem()`, immediately after the existing `waves.length = 0;`
line (top of the function), add:

```js
        const scale = computeInteractionScale(p.width);
        effCfg = {
          ...cfg,
          waveStrength:            cfg.waveStrength * scale,
          moveInjectStrength:      cfg.moveInjectStrength * scale,
          moveInjectStrengthTouch: cfg.moveInjectStrengthTouch * scale,
          moveForceScale:          cfg.moveForceScale * scale,
          moveGridCell:            cfg.moveGridCell * scale,
        };
```

Still inside `initSystem()`, change the grid sizing to read the scaled cell
size:

```js
        gridCols = Math.max(2, Math.ceil(p.width  / effCfg.moveGridCell));
        gridRows = Math.max(2, Math.ceil(p.height / effCfg.moveGridCell));
```

(These two lines already exist with `cfg.moveGridCell` — replace `cfg` with
`effCfg` on both.)

- [ ] **Step 7: Switch `injectRipple()` to the scaled grid cell**

In `injectRipple(x, y, strength)`, change:

```js
        const ix = Math.round(x / cfg.moveGridCell), iy = Math.round(y / cfg.moveGridCell);
```

to:

```js
        const ix = Math.round(x / effCfg.moveGridCell), iy = Math.round(y / effCfg.moveGridCell);
```

- [ ] **Step 8: Switch `spawnWave()` to the scaled wave strength**

In `spawnWave(clientX, clientY)`, change:

```js
        waves.push({ cx: clientX - canvasRect.left, cy: clientY - canvasRect.top, radius: 0, strength: cfg.waveStrength });
```

to:

```js
        waves.push({ cx: clientX - canvasRect.left, cy: clientY - canvasRect.top, radius: 0, strength: effCfg.waveStrength });
```

- [ ] **Step 9: Switch `p.draw()`'s injection strength and the `reed.update()` call**

In `p.draw()`, change:

```js
          const strength = lastPointerType === 'touch'
            ? cfg.moveInjectStrengthTouch
            : cfg.moveInjectStrength;
```

to:

```js
          const strength = lastPointerType === 'touch'
            ? effCfg.moveInjectStrengthTouch
            : effCfg.moveInjectStrength;
```

And change:

```js
          reed.update(t, cfg, waves, field);
```

to:

```js
          reed.update(t, effCfg, waves, field);
```

(`Reed.update()` reads `cfg.moveForceScale` — now scaled via `effCfg` — plus
several unscaled fields like `waveStiffness`/`moveStiffness`/`moveDamping`,
which pass through unchanged since `effCfg` is a shallow copy of `cfg`.)

- [ ] **Step 10: Verify no syntax errors**

Run: `node -e "require('./reed-field.js')"`
Expected: no output, exit code 0 (confirms the file still parses and
`module.exports` doesn't throw — the CommonJS guard is inert in a real
browser since `window` has no `module` global).

- [ ] **Step 11: Manual verification via `preview_start`**

Start the local dev server (`preview_start`, config already in
`.claude/launch.json` per this project's standing workflow) and check:

1. At a desktop-width browser viewport (≥1280px): click/drag feels
   identical to before this change (scale = 1, `effCfg` values equal `cfg`
   values).
2. Resize the browser window down to ~700px and ~360px wide: click/drag
   force visibly weakens but stays clearly present (never fully dead —
   floor is 0.5, not 0).
3. Check `read_console_messages` for errors after each resize.
4. Confirm reed density/size (dot spacing, reed length) look unchanged
   from before this change at every width — this task must not touch
   `reedGap`/`reedLength` behavior, only force magnitude and grid cell size.

Do not claim touch-specific magnitude is confirmed from this local check —
per this project's standing workflow, touch needs the live deployment.

- [ ] **Step 12: Commit the wiring**

```bash
git add reed-field.js
git commit -m "$(cat <<'EOF'
Scale interaction force and grid resolution by canvas width

Wave/ripple force and grid cell size now derive from a canvas-width scale
factor (effCfg), rebuilt fresh every initSystem() call so resizes never
compound the shrink. Closes #48.
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- Force magnitudes scaled (`waveStrength`, `moveInjectStrength`,
  `moveInjectStrengthTouch`, `moveForceScale`) — Steps 6, 8, 9. ✓
- Grid resolution scaled (`moveGridCell`) — Steps 6, 7. ✓
- Scale keyed off `p.width` (container-derived, iframe-safe), not
  `window.innerWidth` — Step 6. ✓
- Continuous formula, not discrete breakpoints, 1280px reference, 0.5 floor
  — Step 3. ✓
- `reedLength`/`reedGap`/wave-reach fields untouched — confirmed in Global
  Constraints and Step 11's manual-check item 4. ✓
- `effCfg` rebuilt fresh per `initSystem()` call, no `cfg` mutation, no
  resize-compounding — Step 6 (assignment, not `*=`), called out in Global
  Constraints. ✓
- No new public config surface — `SCALE_REF_WIDTH`/`SCALE_FLOOR` are
  module-scope `const`, not on `cfg`. ✓

**Placeholder scan:** no TBD/TODO, every step has literal code, no "similar
to Task N" references (single-task plan).

**Type consistency:** `computeInteractionScale(canvasWidth: number): number`
used identically in the test file and in `initSystem()`. `effCfg` declared
once (Step 6), read in exactly the four downstream sites the design spec
lists (Steps 7, 8, 9×2) — no sixth call site missed (checked every `cfg.`
read in `reed-field.js` for the five scaled field names during plan
authoring).
