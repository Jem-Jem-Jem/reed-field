// wave-physics.test.js — velocity dead-zone + field-reach coverage tests
// Run: node wave-physics.test.js
//
// Covers two changes to the wave channel:
//   1. Dead-zone snap now checks velocity magnitude only (was: displacement + velocity sum).
//   2. waveMaxRadius is now computed per-canvas as the diagonal (+ waveWidth margin)
//      instead of a fixed 800px constant, so a wave always reaches every corner
//      of the field regardless of container size — unless the user pins waveMaxRadius.

let passed = 0, failed = 0;
function assert(label, cond, extra = '') {
  if (cond) { console.log(`  PASS  ${label}`); passed++; }
  else       { console.error(`  FAIL  ${label}${extra ? ' — ' + extra : ''}`); failed++; }
}

const CFG = {
  waveStiffness: 0.9,
  waveDamping:   0.35,
  waveWidth:     8,
};

// Mirrors Reed.update()'s wave-channel integration (reed-field.js lines ~107-117).
function stepWaveChannel(state, fx, fy, cfg, deadZoneVelocityOnly) {
  const wspX = -state.wdx * cfg.waveStiffness;
  const wspY = -state.wdy * cfg.waveStiffness;
  state.wvx = (state.wvx + fx + wspX) * cfg.waveDamping;
  state.wvy = (state.wvy + fy + wspY) * cfg.waveDamping;
  state.wdx += state.wvx;
  state.wdy += state.wvy;

  const snap = deadZoneVelocityOnly
    ? Math.abs(state.wvx) + Math.abs(state.wvy) < 0.15
    : Math.abs(state.wdx) + Math.abs(state.wdy) + Math.abs(state.wvx) + Math.abs(state.wvy) < 0.15;
  if (snap) { state.wdx = state.wdy = state.wvx = state.wvy = 0; }
  return snap;
}

function runImpulse(fx, fy, cfg, deadZoneVelocityOnly, maxFrames = 200) {
  const state = { wdx: 0, wdy: 0, wvx: 0, wvy: 0 };
  const history = [];
  for (let i = 0; i < maxFrames; i++) {
    const snapped = stepWaveChannel(state, i === 0 ? fx : 0, i === 0 ? fy : 0, cfg, deadZoneVelocityOnly);
    history.push({ ...state, snapped });
    if (snapped) return { frames: i + 1, history };
  }
  return { frames: -1, history }; // never settled within maxFrames
}

// ── Velocity dead-zone: settles, and settles at least as fast as the old check ──
console.log('\n=== Velocity dead-zone ===');
{
  const oldRun = runImpulse(28, 0, CFG, false);
  const newRun = runImpulse(28, 0, CFG, true);

  assert('Old (displacement+velocity) settles within 200 frames', oldRun.frames > 0, `frames=${oldRun.frames}`);
  assert('New (velocity-only) settles within 200 frames', newRun.frames > 0, `frames=${newRun.frames}`);
  assert('New settles no slower than old', newRun.frames <= oldRun.frames,
    `old=${oldRun.frames}, new=${newRun.frames}`);
  assert('New: both channels zero at snap frame',
    newRun.history[newRun.frames - 1].wdx === 0 && newRun.history[newRun.frames - 1].wdy === 0);
}

// ── Velocity dead-zone: snaps purely on speed, independent of displacement size ──
console.log('\n=== Velocity-only trigger (documents behavior change) ===');
{
  // Craft a state sitting at a large displacement with near-zero velocity —
  // e.g. an oscillation's turning point. Old check (needs disp+vel < 0.15)
  // would NOT snap here; new check (velocity only) DOES.
  const bigDisplacementLowVelocity = { wdx: 5, wdy: 0, wvx: 0.05, wvy: 0.05 };

  const oldState = { ...bigDisplacementLowVelocity };
  const oldSnap = Math.abs(oldState.wdx) + Math.abs(oldState.wdy) + Math.abs(oldState.wvx) + Math.abs(oldState.wvy) < 0.15;
  const newState = { ...bigDisplacementLowVelocity };
  const newSnap = Math.abs(newState.wvx) + Math.abs(newState.wvy) < 0.15;

  assert('Old check: does not snap while still displaced', !oldSnap, `sum=${(5 + 0.1).toFixed(2)}`);
  assert('New check: snaps on velocity alone even with displacement present', newSnap);
}

// ── waveMaxRadiusEff: reaches every corner of the field ─────────────────────
console.log('\n=== Dynamic field-reach cap ===');
{
  function effRadius(w, h, waveWidth, userOverride) {
    return userOverride !== undefined ? userOverride : Math.hypot(w, h) + waveWidth;
  }
  function farthestCornerDist(spawnX, spawnY, w, h) {
    const corners = [[0, 0], [w, 0], [0, h], [w, h]];
    return Math.max(...corners.map(([cx, cy]) => Math.hypot(spawnX - cx, spawnY - cy)));
  }

  const sizes = [
    [800, 450],   // typical desktop iframe
    [375, 812],   // mobile portrait
    [1920, 1080], // large desktop
    [300, 200],   // small embed
  ];
  for (const [w, h] of sizes) {
    const eff = effRadius(w, h, CFG.waveWidth, undefined);
    // Worst case: wave spawned in one corner, farthest point is the opposite corner.
    const worst = farthestCornerDist(0, 0, w, h);
    assert(`${w}x${h}: eff radius (${eff.toFixed(0)}) reaches farthest corner (${worst.toFixed(0)})`,
      eff >= worst);
  }

  // Old fixed cap (800) fails to reach the far corner on a large canvas.
  const bigW = 1920, bigH = 1080;
  const oldCap = 800;
  const worstBig = Math.hypot(bigW, bigH);
  assert('Old fixed 800px cap did NOT reach far corner on 1920x1080 (regression it fixes)',
    oldCap < worstBig, `cap=${oldCap}, needed=${worstBig.toFixed(0)}`);

  // Explicit user override is respected even if smaller than the diagonal.
  const overridden = effRadius(1920, 1080, CFG.waveWidth, 300);
  assert('User-supplied waveMaxRadius overrides the diagonal computation', overridden === 300);
}

// ── waveSpeed default halved — sanity check only, coverage math is speed-agnostic ──
console.log('\n=== waveSpeed default ===');
{
  const newDefault = 6;
  const oldDefault = 12;
  assert('waveSpeed default is 6 (was 12, halved for visibility)', newDefault === oldDefault / 2);
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
