# Reed Field

A tiny interactive [p5.js](https://p5js.org/) sketch: a field of stylised reeds
that bend away from your cursor (or finger) like grass parting in a current.

Built as a hero background for embedding in a [Figma Sites](https://www.figma.com/sites/)
page, but it's just one self-contained HTML file — drop it anywhere you can
serve static content.

## Try it

This repo is already deployed via GitHub Pages — visit
**https://jem-jem-jem.github.io/reed-field/** to see it running.

## Host your own

The sketch is a single HTML file with no build step. To run a copy that
isn't dependent on this repo's deployment:

**GitHub Pages (free, easy).** Fork or copy this repo, then in your fork
go to **Settings → Pages**, set **Source** to *Deploy from a branch*,
pick `main` and `/ (root)`, and save. Your sketch will be live at
`https://<your-handle>.github.io/<your-repo>/` within a minute or two.

**Any static host.** `index.html` is self-contained (p5.js loads from a
CDN), so you can drop it onto anything that serves static files:

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

Just the one file: `index.html`. All the markup, styles, and the sketch
itself live inside it.

## Tuning the look

Visual knobs live at the bottom of the file, in the `ReedField.init` call:

```js
ReedField.init('reed-hero', {
  reedCount: window.innerWidth < 768 ? 1000 : 2000,
  influenceRadius: window.innerWidth < 768 ? 50 : 100,
  reedLengthMin: 36,
  reedLengthMax: 80,
});
```

Everything else falls back to the defaults defined in the module. The full set:

| Option            | Default     | What it does                                              |
| ----------------- | ----------- | --------------------------------------------------------- |
| `seed`            | `42`        | RNG seed — change for a different reed layout             |
| `reedCount`       | `1300`      | How many reeds to place across the canvas                 |
| `swayStrength`    | `2.5`       | Amount of idle, ambient motion                            |
| `influenceRadius` | `115`       | Radius (px) around the cursor that bends reeds            |
| `forceStrength`   | `8`         | How hard the cursor pushes reeds inside that radius       |
| `stiffness`       | `0.044`     | Spring pull back to rest pose (lower = looser)            |
| `damping`         | `0.87`      | Velocity decay (lower = quicker to settle)                |
| `reedLengthMin`   | `18`        | Minimum per-reed render length                            |
| `reedLengthMax`   | `42`        | Maximum per-reed render length                            |
| `bgColor`         | `#0b0f0c`   | Canvas background                                         |
| `baseColor`       | `#1e3320`   | Color at the reed's root                                  |
| `tipColor`        | `#c49030`   | Color at the reed's tip                                   |
| `aspectRatio`     | `null`      | If set, canvas height = width × ratio; otherwise fills    |
| `autoMobileScale` | `true`      | Auto-drop reedCount on narrow viewports (only if unset)   |

## How the interaction works

The cursor isn't sampled as a single point per frame — it's tracked as a short
polyline built from `PointerEvent.getCoalescedEvents()` (so the sub-frame
samples the browser buffered are preserved), with the previous frame's last
sample carried forward so segments span frame boundaries. Each reed checks
its point-to-segment distance to the nearest segment, which means fast cursor
motion doesn't skip over reeds even when the host page is dropping frames.

## License

Do whatever — it's a sketch.
