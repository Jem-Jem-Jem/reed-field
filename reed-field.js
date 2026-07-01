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
      static DOT_DIAM = 3;
      static BASE_W   = 1.5;
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
        // Separate channel for click-wave displacement (stiffer spring, higher damping).
        this.wdx = 0;
        this.wdy = 0;
        this.wvx = 0;
        this.wvy = 0;
        this.maxLen    = rndRange(cfg.reedLengthMin, cfg.reedLengthMax);
        // Cubic Bezier bend personality (curvature near the base, near-straight
        // mid-to-tip section that points along the displacement direction):
        //   bendBaseLen = length of the straight-up tangent at the base
        //                 (smaller -> sharper, lower bend)
        //   bendTipLen  = length of the displacement-direction tangent at the
        //                 tip (larger -> longer straight section near the top)
        //   bendBias    = small lateral offset of the base control point so
        //                 reeds don't all bend in identical symmetric arcs
        this.bendBaseLen = rndRange(0.25, 0.45);
        this.bendTipLen  = rndRange(0.55, 0.80);
        this.bendBias    = rndRange(-0.05, 0.05);
        // Tip resists outward bending: tip endpoint and tangent are blended
        // between the displacement direction and straight up, so the tip
        // stays closer to vertical even when the reed is pushed hard.
        this.tipResist = rndRange(0.10, 0.25);
        this.phase     = rnd() * Math.PI * 2;
        this.phaseY    = rnd() * Math.PI * 2;
        this.colorVar  = rnd();
        this.alpha     = rndRange(140, 230);
      }
      update(path, t, cfg, waves) {
        const sw    = cfg.swayStrength;
        const swayX = Math.sin(t * 0.52 + this.phase)  * sw;
        const swayY = Math.cos(t * 0.41 + this.phaseY) * sw * 0.62;

        // Wave channel — sinusoidal profile: outward crest + inward trough.
        // When two waves overlap, forces sum → constructive/destructive interference.
        let wfx = 0, wfy = 0;
        if (waves && waves.length > 0) {
          const half      = cfg.waveWidth * 0.5;
          const troughLen = cfg.waveWidth * 2;
          for (const wave of waves) {
            const wcx = this.bx - wave.cx;
            const wcy = this.by - wave.cy;
            const d   = Math.sqrt(wcx * wcx + wcy * wcy);
            if (d < 0.1) continue;

            const prevRadius = wave.radius - cfg.waveSpeed;
            // Quick cull: outside both crest leading edge and trough trailing edge.
            if (d > wave.radius + half || d < prevRadius - half - troughLen) continue;

            // Swept-band: nearest ring position during this frame's expansion.
            // Signed diff: + = outside ring (not yet reached); − = inside (already passed).
            const ringNearest = Math.max(prevRadius, Math.min(wave.radius, d));
            const diff        = d - ringNearest;

            let force = 0;
            if (diff >= -half && diff <= half) {
              // Crest — triangular outward push centred on wavefront.
              force = (1 - Math.abs(diff) / half) * wave.strength;
            } else if (diff < -half && diff >= -(half + troughLen)) {
              // Trough — sinusoidal inward pull trailing the crest.
              // Enables destructive interference where a trough meets another wave's crest.
              const t = (-diff - half) / troughLen;
              force   = -Math.sin(t * Math.PI) * wave.strength * cfg.waveTroughStrength;
            }

            if (force !== 0) {
              wfx += (wcx / d) * force;
              wfy += (wcy / d) * force;
            }
          }
        }
        const wspX = -this.wdx * cfg.waveStiffness;
        const wspY = -this.wdy * cfg.waveStiffness;
        this.wvx = (this.wvx + wfx + wspX) * cfg.waveDamping;
        this.wvy = (this.wvy + wfy + wspY) * cfg.waveDamping;
        this.wdx += this.wvx;
        this.wdy += this.wvy;
        // Dead-zone: snap to rest once velocity is negligible, preventing residual
        // oscillation from bleeding into the cursor channel's visual.
        if (Math.abs(this.wvx) + Math.abs(this.wvy) < 0.15) {
          this.wdx = this.wdy = this.wvx = this.wvy = 0;
        }

        // Cursor / sway channel — original settings unchanged.
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
      draw(r, g, b) {
        // Base dot — always visible at rest.
        p.fill(r, g, b, this.alpha);
        p.noStroke();
        p.ellipse(this.bx, this.by, Reed.DOT_DIAM, Reed.DOT_DIAM);

        const sdx  = this.dx + this.wdx;
        const sdy  = this.dy + this.wdy;
        const mag  = Math.sqrt(sdx * sdx + sdy * sdy);
        if (mag < 0.25) return;
        const vLen = Math.min(mag * 2.4 + 3.0, this.maxLen);
        const nx   = sdx / mag;
        const ny   = sdy / mag;
        // Tip resists the outward bend: blend the tip direction between the
        // raw displacement direction (nx, ny) and straight up (0, -1). The
        // result is the unit direction the tip points in.
        const tr   = this.tipResist;
        let tdx    = nx * (1 - tr);
        let tdy    = ny * (1 - tr) - tr;
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
        p.stroke(r, g, b, this.alpha);
        p.noFill();
        p.bezier(bxx, byy, p1x, p1y, p2x, p2y, p3x, p3y);
      }
    }
    return Reed;
  }

  function buildBackground(p, cfg) {
    const g = p.createGraphics(p.width, p.height);
    g.noStroke();
    g.background(cfg.bgColor);
    return g;
  }

  function init(containerId, userConfig = {}) {
    const cfg = Object.assign({
      seed:            42,
      reedCount:       1300,
      swayStrength:    2.5,
      influenceRadius: 115,
      forceStrength:   14,
      stiffness:       0.05,
      damping:         0.82,
      reedLengthMin:   18,
      reedLengthMax:   42,
      bgColor:         '#1c2252',
      baseColor:       '#faa61a',
      tipColor:        '#faa61a',
      aspectRatio:     null,   // null = fill container height
      autoMobileScale: true,
      waveSpeed:          6,    // px/frame wavefront expansion
      waveWidth:          8,    // crest half-wavelength in px
      waveStrength:       28,   // peak outward force at wavefront
      waveMaxRadius:      800,  // fallback cap; overridden per-canvas by diagonal reach unless set explicitly
      waveStiffness:      0.9,  // spring stiffness for wave channel (stiffer = faster snap-back)
      waveDamping:        0.35, // damping for wave channel (lower = faster decay)
      waveTroughStrength: 0.7,  // inward trough amplitude as fraction of crest (enables interference)
    }, userConfig);

    // Auto-tune for small/touch screens (only if user didn't override)
    if (cfg.autoMobileScale && userConfig.reedCount === undefined && window.innerWidth < 768) {
      cfg.reedCount = 600;
    }

    new p5(p => {
      let reeds         = [];
      let bgBuffer      = null;
      let baseCol, tipCol;
      let baseR = 0, baseG = 0, baseB = 0;
      let canvasRect    = null;
      let pointerInside = false;
      let lastMX        = -99999;
      let lastMY        = -99999;
      let pathBuf       = [];       // cursor samples accumulated since last frame
      let prevTail      = null;     // last point from previous frame (joins polyline across frames)
      const PATH_CAP    = 32;
      let Reed;
      let cnv;
      let waves         = [];       // active click waves
      let waveMaxRadiusEff = cfg.waveMaxRadius; // recomputed to canvas diagonal in initSystem()
      const container   = document.getElementById(containerId);

      function canvasHeight() {
        return cfg.aspectRatio
          ? Math.round(p.width * cfg.aspectRatio)
          : container.offsetHeight || Math.round(p.width * 0.5625);
      }

      function parseColors() {
        baseCol = p.color(cfg.baseColor);
        tipCol  = p.color(cfg.tipColor);
        baseR   = p.red(baseCol);
        baseG   = p.green(baseCol);
        baseB   = p.blue(baseCol);
      }

      function initSystem() {
        waves.length = 0;
        seedRNG(cfg.seed);
        Reed     = makeReedClass(p, cfg);
        bgBuffer = buildBackground(p, cfg);
        parseColors();
        canvasRect = cnv.elt.getBoundingClientRect();
        // Any spawn point is at most one canvas-diagonal from the farthest corner —
        // sizing the cap to that guarantees a wave reaches every edge of the field
        // regardless of container size, unless the user explicitly pinned a radius.
        waveMaxRadiusEff = userConfig.waveMaxRadius === undefined
          ? Math.hypot(p.width, p.height) + cfg.waveWidth
          : cfg.waveMaxRadius;
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
        lastMX = clientX - canvasRect.left;
        lastMY = clientY - canvasRect.top;
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

      function spawnWave(clientX, clientY) {
        waves.push({ cx: clientX - canvasRect.left, cy: clientY - canvasRect.top, radius: 0, strength: cfg.waveStrength });
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
          // Cursor tracking is primary-pointer only and path samples only on move,
          // so secondary touches don't inject line segments between touch points.
          cnv.elt.addEventListener('pointerenter',  e => { if (e.isPrimary) handlePointerEvent(e); });
          cnv.elt.addEventListener('pointermove',   e => { if (e.isPrimary) handlePointerEvent(e); });
          cnv.elt.addEventListener('pointerdown',   e => {
            if (e.isPrimary) {
              // Set cursor position on initial contact without adding a path sample.
              lastMX = e.clientX - canvasRect.left;
              lastMY = e.clientY - canvasRect.top;
              pointerInside = true;
            }
            spawnWave(e.clientX, e.clientY);
          });
          cnv.elt.addEventListener('pointerup',     e => { if (e.isPrimary) resetPointer(); });
          cnv.elt.addEventListener('pointerleave',  e => { if (e.isPrimary) resetPointer(); });
          cnv.elt.addEventListener('pointercancel', e => { if (e.isPrimary) resetPointer(); });
        } else {
          // Fallback for older browsers.
          cnv.elt.addEventListener('mouseenter', e => updateFromClient(e.clientX, e.clientY));
          cnv.elt.addEventListener('mousemove',  e => updateFromClient(e.clientX, e.clientY));
          cnv.elt.addEventListener('mouseleave', resetPointer);
          cnv.elt.addEventListener('mousedown',  e => spawnWave(e.clientX, e.clientY));
          cnv.elt.addEventListener('touchstart', e => {
            const t = e.touches[0]; if (t) updateFromClient(t.clientX, t.clientY);
            for (const touch of e.changedTouches) spawnWave(touch.clientX, touch.clientY);
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

        // Assemble the cursor polyline for this frame only when the pointer
        // actually moved (pathBuf has samples). A stationary cursor exerts no
        // force — reed displacement is driven by movement, not presence.
        let framePath = null;
        if (pointerInside && pathBuf.length > 0) {
          framePath = prevTail ? [prevTail].concat(pathBuf) : pathBuf.slice();
        }

        // Expand waves, prune dead ones.
        for (let i = waves.length - 1; i >= 0; i--) {
          waves[i].radius += cfg.waveSpeed;
          if (waves[i].radius > waveMaxRadiusEff) waves.splice(i, 1);
        }

        p.image(bgBuffer, 0, 0);

        p.strokeWeight(Reed.BASE_W);
        for (const reed of reeds) {
          reed.update(framePath, t, cfg, waves);
          reed.draw(baseR, baseG, baseB);
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
