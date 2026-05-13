/* Reed Field — Hydrodynamic Passage (touch-enabled build)
 *
 * Usage:
 *   <script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.7.0/p5.min.js"></script>
 *   <script src="reed-field.js"></script>
 *   <script>ReedField.init('your-container-id', { ...optional config });</script>
 *
 * See README.md for the full list of config options.
 */
const ReedField = (() => {

  // ── seeded RNG (xorshift32) ──────────────────────────────────
  let _rng = 1;
  const seedRNG  = s  => { _rng = (s | 0) || 1; };
  const rnd      = () => {
    _rng ^= _rng << 13;
    _rng ^= _rng >> 17;
    _rng ^= _rng << 5;
    return (_rng >>> 0) / 4294967295;
  };
  const rndRange = (lo, hi) => lo + rnd() * (hi - lo);

  function makeReedClass(p, cfg) {
    class Reed {
      static DOT_DIAM = 5;
      constructor(x, y) {
        this.bx = x;
        this.by = y;
        // Uniform rest pose: every reed sits at zero displacement
        // (a dot at the base) and grows straight up when disturbed.
        this.restDx = 0;
        this.restDy = 0;
        this.dx = 0;
        this.dy = 0;
        this.vx = 0;
        this.vy = 0;
        this.maxLen    = rndRange(cfg.reedLengthMin, cfg.reedLengthMax);
        this.baseW     = rndRange(0.8, 1.4);
        // Cubic Bezier bend personality (curvature near the base, near-straight
        // mid-to-tip section that points along the displacement direction):
        //   bendBaseLen = length of the straight-up tangent at the base
        //                 (smaller -> sharper, lower bend)
        //   bendTipLen  = length of the displacement-direction tangent at the
        //                 tip (larger -> longer straight section near the top)
        //   bendBias    = small lateral offset of the base control point so
        //                 reeds don't all bend in identical symmetric arcs
        this.bendBaseLen = rndRange(0.10, 0.22);
        this.bendTipLen  = rndRange(0.40, 0.60);
        this.bendBias    = rndRange(-0.05, 0.05);
        // Tip resists outward bending: tip endpoint and tangent are blended
        // between the displacement direction and straight up, so the tip
        // stays closer to vertical even when the reed is pushed hard.
        this.tipResist = rndRange(0.30, 0.50);
        this.phase     = rnd() * Math.PI * 2;
        this.phaseY    = rnd() * Math.PI * 2;
        this.colorVar  = rnd();
        this.alpha     = rndRange(140, 230);
      }
      update(path, t, cfg) {
        const sw    = cfg.swayStrength;
        const swayX = Math.sin(t * 0.52 + this.phase)  * sw;
        const swayY = Math.cos(t * 0.41 + this.phaseY) * sw * 0.62;
        let forceX = 0, forceY = 0;
        if (path && path.length > 0) {
          let minD2 = Infinity, minCx = 0, minCy = 0;
          if (path.length === 1) {
            minCx = this.bx - path[0][0];
            minCy = this.by - path[0][1];
            minD2 = minCx * minCx + minCy * minCy;
          } else {
            for (let i = 0; i < path.length - 1; i++) {
              const ax = path[i][0],   ay = path[i][1];
              const bx = path[i+1][0], by = path[i+1][1];
              const dxs = bx - ax, dys = by - ay;
              const lenSq = dxs * dxs + dys * dys;
              let qx, qy;
              if (lenSq < 0.0001) {
                qx = ax; qy = ay;
              } else {
                let u = ((this.bx - ax) * dxs + (this.by - ay) * dys) / lenSq;
                if (u < 0) u = 0; else if (u > 1) u = 1;
                qx = ax + u * dxs;
                qy = ay + u * dys;
              }
              const cx = this.bx - qx, cy = this.by - qy;
              const d2 = cx * cx + cy * cy;
              if (d2 < minD2) { minD2 = d2; minCx = cx; minCy = cy; }
            }
          }
          const r2 = cfg.influenceRadius * cfg.influenceRadius;
          if (minD2 < r2 && minD2 > 0.25) {
            const dist = Math.sqrt(minD2);
            const t1 = 1.0 - dist / cfg.influenceRadius;
            const fm = t1 * t1 * cfg.forceStrength;
            forceX = (minCx / dist) * fm;
            forceY = (minCy / dist) * fm;
          }
        }
        const tDx = this.restDx + swayX;
        const tDy = this.restDy + swayY;
        const spX = (tDx - this.dx) * cfg.stiffness;
        const spY = (tDy - this.dy) * cfg.stiffness;
        this.vx = (this.vx + forceX + spX) * cfg.damping;
        this.vy = (this.vy + forceY + spY) * cfg.damping;
        this.dx += this.vx;
        this.dy += this.vy;
      }
      draw(baseCol, tipCol) {
        // Base dot is always rendered so every reed is visible at rest.
        // Uniform size across reeds, full reed color (no darkening).
        p.fill(p.red(baseCol), p.green(baseCol), p.blue(baseCol), this.alpha);
        p.noStroke();
        p.ellipse(this.bx, this.by, Reed.DOT_DIAM, Reed.DOT_DIAM);
        p.noFill();

        const mag = Math.sqrt(this.dx * this.dx + this.dy * this.dy);
        if (mag < 0.25) return;
        const vLen = Math.min(mag * 2.4 + 3.0, this.maxLen);
        const nx   = this.dx / mag;
        const ny   = this.dy / mag;
        // Tip resists the outward bend: blend the tip direction between the
        // raw displacement direction (nx, ny) and straight up (0, -1). The
        // result is the unit direction the tip points in.
        const r    = this.tipResist;
        let tdx    = nx * (1 - r);
        let tdy    = ny * (1 - r) - r;
        const tmag = Math.sqrt(tdx * tdx + tdy * tdy) || 1;
        const tnx  = tdx / tmag;
        const tny  = tdy / tmag;
        // Cubic Bezier with curvature concentrated near the base:
        //   P0 = base (rooted)
        //   P1 = base + (bendBias, -bendBaseLen) * vLen  -> short up tangent
        //   P2 = tip - (tnx, tny) * bendTipLen * vLen    -> calm tip
        //   P3 = tip along the tip-resist-blended direction
        const bxx = this.bx;
        const byy = this.by;
        const p3x = bxx + tnx * vLen;
        const p3y = byy + tny * vLen;
        const baseLen = vLen * this.bendBaseLen;
        const tipLen  = vLen * this.bendTipLen;
        const p1x = bxx + this.bendBias * vLen;
        const p1y = byy - baseLen;
        const p2x = p3x - tnx * tipLen;
        const p2y = p3y - tny * tipLen;
        const segs = 5;
        let px = bxx, py = byy;
        for (let i = 1; i <= segs; i++) {
          const t1 = i / segs;
          const u  = 1 - t1;
          const u2 = u * u;
          const u3 = u2 * u;
          const t2 = t1 * t1;
          const t3 = t2 * t1;
          const x1 = u3 * bxx + 3 * u2 * t1 * p1x + 3 * u * t2 * p2x + t3 * p3x;
          const y1 = u3 * byy + 3 * u2 * t1 * p1y + 3 * u * t2 * p2y + t3 * p3y;
          // Uniform rod: same color and opacity end-to-end. baseCol == tipCol
          // currently, so lerpColor is a no-op; this stays correct if they
          // diverge in future.
          p.stroke(p.red(baseCol), p.green(baseCol), p.blue(baseCol), this.alpha);
          p.strokeWeight(this.baseW);
          p.line(px, py, x1, y1);
          px = x1; py = y1;
        }
      }
    }
    return Reed;
  }

  function buildBackground(p, cfg) {
    const g    = p.createGraphics(p.width, p.height);
    const bgR  = parseInt(cfg.bgColor.slice(1, 3), 16);
    const bgG  = parseInt(cfg.bgColor.slice(3, 5), 16);
    const bgBl = parseInt(cfg.bgColor.slice(5, 7), 16);
    g.noStroke();
    g.background(bgR, bgG, bgBl);
    return g;
  }

  function init(containerId, userConfig = {}) {
    const cfg = Object.assign({
      seed:            42,
      reedCount:       1300,
      swayStrength:    2.5,
      influenceRadius: 115,
      forceStrength:   8,
      stiffness:       0.03,
      damping:         0.88,
      reedLengthMin:   18,
      reedLengthMax:   42,
      bgColor:         '#1c2252',
      baseColor:       '#faa61a',
      tipColor:        '#faa61a',
      aspectRatio:     null,   // null = fill container height
      autoMobileScale: true,
    }, userConfig);

    // Auto-tune for small/touch screens (only if user didn't override)
    if (cfg.autoMobileScale && userConfig.reedCount === undefined && window.innerWidth < 768) {
      cfg.reedCount = 600;
    }

    new p5(p => {
      let reeds         = [];
      let bgBuffer      = null;
      let baseCol, tipCol;
      let pointerInside = false;
      let lastMX        = -99999;
      let lastMY        = -99999;
      let pathBuf       = [];       // cursor samples accumulated since last frame
      let prevTail      = null;     // last point from previous frame (joins polyline across frames)
      const PATH_CAP    = 32;
      let Reed;
      let cnv;
      const container   = document.getElementById(containerId);

      function canvasHeight() {
        return cfg.aspectRatio
          ? Math.round(p.width * cfg.aspectRatio)
          : container.offsetHeight || Math.round(p.width * 0.5625);
      }

      function parseColors() {
        baseCol = p.color(
          parseInt(cfg.baseColor.slice(1,3),16),
          parseInt(cfg.baseColor.slice(3,5),16),
          parseInt(cfg.baseColor.slice(5,7),16)
        );
        tipCol = p.color(
          parseInt(cfg.tipColor.slice(1,3),16),
          parseInt(cfg.tipColor.slice(3,5),16),
          parseInt(cfg.tipColor.slice(5,7),16)
        );
      }

      function initSystem() {
        seedRNG(cfg.seed);
        Reed     = makeReedClass(p, cfg);
        bgBuffer = buildBackground(p, cfg);
        parseColors();
        reeds = [];
        const aspect = p.width / p.height;
        const cols   = Math.max(Math.round(Math.sqrt(cfg.reedCount * aspect)), 1);
        const rows   = Math.max(Math.round(cfg.reedCount / cols), 1);
        const spX    = p.width  / cols;
        const spY    = p.height / rows;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const x = p.constrain((c + 0.5) * spX, 1, p.width  - 1);
            const y = p.constrain((r + 0.5) * spY, 1, p.height - 1);
            reeds.push(new Reed(x, y));
          }
        }
      }

      function updateFromClient(clientX, clientY) {
        if (clientX == null || clientY == null) return;
        const rect = cnv.elt.getBoundingClientRect();
        lastMX = clientX - rect.left;
        lastMY = clientY - rect.top;
        pointerInside = true;
        if (pathBuf.length >= PATH_CAP) pathBuf.shift();
        pathBuf.push([lastMX, lastMY]);
      }

      function handlePointerEvent(e) {
        // Use coalesced sub-frame samples when the browser provides them, so
        // fast cursor motion is captured as a polyline rather than a single point.
        const coalesced = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
        if (coalesced && coalesced.length > 0) {
          for (const ev of coalesced) updateFromClient(ev.clientX, ev.clientY);
        } else {
          updateFromClient(e.clientX, e.clientY);
        }
      }

      function resetPointer() {
        pointerInside = false;
        lastMX = -99999;
        lastMY = -99999;
        pathBuf.length = 0;
        prevTail = null;
      }

      p.setup = () => {
        const w = container.offsetWidth || 800;
        const h = canvasHeight();
        cnv = p.createCanvas(w, h);
        cnv.parent(containerId);
        p.colorMode(p.RGB, 255);
        p.noFill();

        cnv.elt.style.display    = 'block';
        cnv.elt.style.cursor     = 'crosshair';
        cnv.elt.style.touchAction = 'none';

        // Pointer events cover mouse, pen and touch in one place.
        if (window.PointerEvent) {
          cnv.elt.addEventListener('pointerenter',  handlePointerEvent);
          cnv.elt.addEventListener('pointermove',   handlePointerEvent);
          cnv.elt.addEventListener('pointerdown',   handlePointerEvent);
          cnv.elt.addEventListener('pointerleave',  resetPointer);
          cnv.elt.addEventListener('pointercancel', resetPointer);
        } else {
          // Fallback for older browsers.
          cnv.elt.addEventListener('mouseenter', e => updateFromClient(e.clientX, e.clientY));
          cnv.elt.addEventListener('mousemove',  e => updateFromClient(e.clientX, e.clientY));
          cnv.elt.addEventListener('mouseleave', resetPointer);
          cnv.elt.addEventListener('touchstart', e => {
            const t = e.touches[0]; if (t) updateFromClient(t.clientX, t.clientY);
            e.preventDefault();
          }, { passive: false });
          cnv.elt.addEventListener('touchmove', e => {
            const t = e.touches[0]; if (t) updateFromClient(t.clientX, t.clientY);
            e.preventDefault();
          }, { passive: false });
          cnv.elt.addEventListener('touchend', resetPointer);
        }

        initSystem();
      };

      // Watch the container for size changes (responsive parents, Figma Sites breakpoints, etc.).
      let resizeTimer;
      function refreshSize() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          const w = container.offsetWidth  || 800;
          const h = canvasHeight();
          if (Math.abs(p.width - w) > 1 || Math.abs(p.height - h) > 1) {
            p.resizeCanvas(w, h);
            initSystem();
          }
        }, 120);
      }
      p.windowResized = refreshSize;
      if (window.ResizeObserver) {
        new ResizeObserver(refreshSize).observe(container);
      }

      p.draw = () => {
        const t = p.frameCount * 0.016;

        // Assemble the cursor polyline for this frame: previous frame's
        // tail (so segments span frame boundaries) + this frame's samples.
        let framePath = null;
        if (pointerInside) {
          framePath = prevTail ? [prevTail].concat(pathBuf) : pathBuf.slice();
          if (framePath.length === 0 && lastMX > -99999) framePath = [[lastMX, lastMY]];
        }

        p.image(bgBuffer, 0, 0);

        for (const reed of reeds) {
          reed.update(framePath, t, cfg);
          reed.draw(baseCol, tipCol);
        }

        if (pointerInside && lastMX > 0 && lastMX < p.width && lastMY > 0 && lastMY < p.height) {
          p.noFill();
          p.stroke(255, 255, 255, 7);
          p.strokeWeight(0.75);
          p.ellipse(lastMX, lastMY, cfg.influenceRadius * 2, cfg.influenceRadius * 2);
          p.stroke(255, 255, 255, 35);
          p.strokeWeight(1.8);
          p.point(lastMX, lastMY);
        }

        // Carry the last sample into the next frame and drain this frame's buffer.
        prevTail = pointerInside && framePath && framePath.length > 0
          ? framePath[framePath.length - 1]
          : null;
        pathBuf.length = 0;
      };
    });
  }

  return { init };
})();
