# Reed Field

A tiny interactive [p5.js](https://p5js.org/) sketch: a field of stylised reeds
that bend away from your cursor (or finger) like grass parting in a current.

Built as a hero background for embedding in a [Figma Sites](https://www.figma.com/sites/)
page, but it's just one self-contained HTML file — drop it anywhere you can
serve static content.

## Try it

Open `index.html` in a browser. That's it. There's no build step, no
dependencies to install — p5.js is loaded from a CDN.

If your browser blocks the canvas due to file:// restrictions, serve the
directory locally:

```sh
python3 -m http.server 5500
# then open http://localhost:5500/
```

Or right-click the file in VS Code and pick **Open with Live Server**.

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
