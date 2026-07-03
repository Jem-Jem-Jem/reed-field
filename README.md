# Reed Field

A tiny interactive [p5.js](https://p5js.org/) sketch: a field of stylised reeds
that bend away from your cursor (or finger) like grass parting in a current.

Built as a hero background for embedding in a [Figma Sites](https://www.figma.com/sites/)
page, but it's a plain static site (one HTML + one JS, p5.js from a CDN) so
it'll run anywhere you can host static files.

## Try it

This repo is already deployed via GitHub Pages — visit
**https://jem-jem-jem.github.io/reed-field/** to see it running.

## Host your own

There's no build step — every file in the repo is a deploy artifact. To
run a copy that isn't dependent on this repo's deployment:

**GitHub Pages (free, easy).** Fork or copy this repo, then in your fork
go to **Settings → Pages**, set **Source** to *Deploy from a branch*,
pick `main` and `/ (root)`, and save. Your sketch will be live at
`https://<your-handle>.github.io/<your-repo>/` within a minute or two.

**Any static host.** Upload `index.html` and `reed-field.js` side-by-side
(p5.js itself loads from a CDN). Anything that serves static files works:

- **Netlify / Vercel / Cloudflare Pages** — connect the repo, no build
  command, publish directory is the repo root.
- **Surge** — `npx surge .` from the repo folder.
- **S3 / Cloudflare R2 / any object store** with static-site hosting.
- **Your own server** — `nginx`, `caddy`, `python3 -m http.server`, etc.

**Embed it.** If you just want the sketch inside another page (a
portfolio, a Figma Sites page, etc.), embed via an `<iframe>` pointing
at any of the URLs above:

```html
<iframe src="https://jem-jem-jem.github.io/reed-field/"
        style="width:100%;height:100vh;border:0"></iframe>
```

## What's in here

```
index.html       # markup + boot call (configures and starts the sketch)
reed-field.js    # the sketch itself, exposed as a global `ReedField.init(...)`
README.md
```

This follows the standard p5.js project layout: a minimal HTML shell that
loads p5.js from a CDN, then loads the sketch as a separate script. Editing
`reed-field.js` is the usual reason to open this repo; `index.html` only
changes when you want to retheme the hosting page or tweak the boot config.

## Tuning the look

Visual knobs live in the `ReedField.init` call inside `index.html`:

```js
ReedField.init('reed-hero', {
  reedCount: 2000,
  reedLengthMin: 8,
  reedLengthMax: 10,
  swayStrength: 0,
});
```

Everything else falls back to the defaults defined in `reed-field.js`. The full set:

| Option            | Default     | What it does                                              |
| ----------------- | ----------- | --------------------------------------------------------- |
| `seed`            | `42`        | RNG seed — change for a different reed layout             |
| `reedCount`       | `1300`      | How many reeds to place across the canvas                 |
| `swayStrength`    | `2.5`       | Amount of idle, ambient motion                            |
| `stiffness`       | `0.02`      | Spring pull back to rest pose (lower = looser)            |
| `damping`         | `0.88`      | Velocity preserved per frame (lower = motion dies sooner) |
| `moveGridCell`    | `14`        | Heightfield cell size (px) for the movement-ripple sim    |
| `moveGridDamping` | `0.96`      | Grid wave-equation decay per frame                        |
| `moveEdgeSpongeWidth` | `6`     | Cells near each wall with extra damping (absorbs before reflecting) |
| `moveEdgeDamping` | `0.87`      | Damping multiplier at the very edge (ramps to 1.0 over spongeWidth) |
| `moveInjectStrength` | `0.5`    | Ripple dip strength per px of mouse/pen movement          |
| `moveInjectStrengthTouch` | `0.75` | Ripple dip strength per px of touch movement          |
| `moveForceScale`  | `0.35`      | Grid gradient → reed push force conversion                |
| `moveStiffness`   | `0.9`       | Spring stiffness of the movement-ripple reed channel       |
| `moveDamping`     | `0.35`      | Damping of the movement-ripple reed channel                |
| `reedLengthMin`   | `22`        | Minimum per-reed render length                            |
| `reedLengthMax`   | `48`        | Maximum per-reed render length                            |
| `bgColor`         | `#1c2252`   | Canvas background                                         |
| `baseColor`       | `#faa61a`   | Color at the reed's root                                  |
| `tipColor`        | `#faa61a`   | Color at the reed's tip                                   |
| `aspectRatio`     | `null`      | If set, canvas height = width × ratio; otherwise fills    |
| `autoMobileScale` | `true`      | Auto-drop reedCount on narrow viewports (only if unset)   |

## How the interaction works

The cursor isn't sampled as a single point per frame — it's tracked as a short
polyline built from `PointerEvent.getCoalescedEvents()` (so the sub-frame
samples the browser buffered are preserved), with the previous frame's last
sample carried forward so segments span frame boundaries. Each reed checks
its point-to-segment distance to the nearest segment, which means fast cursor
motion doesn't skip over reeds even when the host page is dropping frames.

Movement doesn't push nearby reeds directly. Instead each moved-through point
injects a dip into a shared heightfield grid, which propagates as a real 2D
wave equation (Coding Train "2D Water Ripples" pattern) — reeds are pushed
along the local surface gradient. Dragging continuously reads as a trailing
wake because earlier ripples are still expanding and decaying while new ones
spawn; the shape is never hand-authored, it falls out of wave interference.
Click/tap waves are a separate, unrelated system (`waveSpeed`/`waveStrength`/etc.)
that still expand as discrete rings.

## License

Do whatever — it's a sketch.
