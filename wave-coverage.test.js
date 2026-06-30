/**
 * wave-coverage.test.js
 *
 * Pure-logic unit tests for reed wave detection — no p5.js or browser needed.
 * Run with: node wave-coverage.test.js
 *
 * Tests the swept-band algorithm that fixes the dead-zone gap bug where
 * waveSpeed > waveWidth caused ~1/3 of reeds to never receive wave force.
 */

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

// ── wave detection logic (extracted from reed-field.js Reed.update) ──────────

/**
 * Compute the force magnitude a reed at distance `d` receives from `wave`
 * using the FIXED swept-band algorithm.
 */
function waveForceFixed(d, wave, cfg) {
  const half = cfg.waveWidth * 0.5;
  const prevRadius  = wave.radius - cfg.waveSpeed;
  const ringNearest = Math.max(prevRadius, Math.min(wave.radius, d));
  const diff = Math.abs(d - ringNearest);
  if (diff < half && d > 0.1) {
    return (1 - diff / half) * wave.strength;
  }
  return 0;
}

/**
 * Compute the force magnitude using the ORIGINAL (buggy) single-frame check.
 */
function waveForceOriginal(d, wave, cfg) {
  const half = cfg.waveWidth * 0.5;
  const diff = Math.abs(d - wave.radius);
  if (diff < half && d > 0.1) {
    return (1 - diff / half) * wave.strength;
  }
  return 0;
}

/**
 * Simulate N frames of wave expansion. Returns the maximum force each reed
 * at distance `d` ever received across all frames.
 */
function simulateMaxForce(d, cfg, forceFn, frames = 200) {
  const wave = { radius: 0, strength: cfg.waveStrength };
  let maxForce = 0;
  for (let i = 0; i < frames; i++) {
    wave.radius += cfg.waveSpeed;
    const f = forceFn(d, wave, cfg);
    if (f > maxForce) maxForce = f;
    if (wave.radius > cfg.waveMaxRadius) break;
  }
  return maxForce;
}

// ── default config ────────────────────────────────────────────────────────────

const CFG = {
  waveSpeed:      12,
  waveWidth:      8,
  waveStrength:   28,
  waveMaxRadius:  800,
};

// ── test suite ────────────────────────────────────────────────────────────────

console.log('\n── Root cause: dead-zone exists in original algorithm ──');
{
  // With waveSpeed=12, waveWidth=8 (half=4), dead zones are at distances
  // [4,8], [16,20], [28,32], ... (N*12+4 to (N+1)*12-4).
  const deadZoneDistances = [6, 18, 30, 42, 54];
  for (const d of deadZoneDistances) {
    const f = simulateMaxForce(d, CFG, waveForceOriginal);
    assert(f === 0, `Original: reed at d=${d} receives zero force (dead zone confirmed)`);
  }
}

console.log('\n── Fixed algorithm: no dead zones ──');
{
  // Every integer distance from 1 to 200 should receive nonzero force.
  let anyMissed = false;
  const missed = [];
  for (let d = 1; d <= 200; d++) {
    const f = simulateMaxForce(d, CFG, waveForceFixed);
    if (f <= 0) { anyMissed = true; missed.push(d); }
  }
  assert(!anyMissed, `Fixed: all reeds at d=1–200 receive force (missed: ${missed.length > 0 ? missed.join(',') : 'none'})`);
}

console.log('\n── Fixed: force falloff within waveWidth/2 of ring center ──');
{
  // A reed exactly at wave.radius should see full strength.
  const wave = { radius: 100, strength: CFG.waveStrength };
  const fCenter = waveForceFixed(100, wave, CFG);
  assert(Math.abs(fCenter - CFG.waveStrength) < 0.01, `Reed at ring center: force = waveStrength (${fCenter.toFixed(2)})`);

  // A reed at half-width boundary should see zero force.
  const fEdge = waveForceFixed(100 + CFG.waveWidth * 0.5, wave, CFG);
  assert(fEdge === 0, `Reed at ring edge (d=ring+half): force = 0 (${fEdge.toFixed(2)})`);

  // Reed just inside edge: small positive force.
  const fNearEdge = waveForceFixed(100 + CFG.waveWidth * 0.5 - 0.1, wave, CFG);
  assert(fNearEdge > 0 && fNearEdge < CFG.waveStrength, `Reed just inside edge: 0 < force < waveStrength (${fNearEdge.toFixed(2)})`);
}

console.log('\n── Fixed: swept-band covers the gap between frames ──');
{
  // At radius=12 (second frame), prevRadius=0. A reed at d=6 was in the dead
  // zone for original (|6-12|=6 > half=4) but should be hit by swept fix.
  const wave = { radius: 12, strength: CFG.waveStrength };
  const fFixed    = waveForceFixed(6, wave, CFG);
  const fOriginal = waveForceOriginal(6, wave, CFG);
  assert(fOriginal === 0, `Original: reed at d=6, radius=12 → no force (dead zone)`);
  assert(fFixed    >  0, `Fixed:    reed at d=6, radius=12 → force=${fFixed.toFixed(2)} (gap closed)`);
}

console.log('\n── Fixed: reeds already passed by the wave are not re-struck ──');
{
  // Reed at d=5, wave far ahead at radius=100. prevRadius=88.
  // Reed at 5 is well behind prevRadius-half=84. Should receive zero force.
  const wave = { radius: 100, strength: CFG.waveStrength };
  const f = waveForceFixed(5, wave, CFG);
  assert(f === 0, `Reed at d=5, wave at radius=100: force = 0 (wave passed long ago)`);
}

console.log('\n── Fixed: origin safety (d > 0.1 guard) ──');
{
  const wave = { radius: 12, strength: CFG.waveStrength };
  const fOrigin = waveForceFixed(0.05, wave, CFG);
  assert(fOrigin === 0, `Reed at d=0.05 (origin): force = 0 (no division by near-zero)`);
}

console.log('\n── Coverage: rectangular grid simulation ──');
{
  // Simulate a 48×27 grid on an 800×450 canvas; click at center.
  // Every reed should receive nonzero force at some point during wave expansion.
  const W = 800, H = 450;
  const cols = Math.round(Math.sqrt(1300 * (W / H)));
  const rows = Math.round(1300 / cols);
  const spX = W / cols, spY = H / rows;
  const cx = W / 2, cy = H / 2;

  let missed = 0;
  let total  = 0;
  let missed_original = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = (c + 0.5) * spX;
      const y = (r + 0.5) * spY;
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      total++;
      const fFixed    = simulateMaxForce(d, CFG, waveForceFixed);
      const fOriginal = simulateMaxForce(d, CFG, waveForceOriginal);
      if (fFixed <= 0)    missed++;
      if (fOriginal <= 0) missed_original++;
    }
  }

  assert(missed === 0,
    `Fixed: 0/${total} reeds missed on ${cols}×${rows} grid, center click`);
  assert(missed_original > 0,
    `Original: ${missed_original}/${total} reeds missed (bug confirmed)`);
  console.log(`    Grid: ${cols}×${rows}, spacing ~${spX.toFixed(1)}×${spY.toFixed(1)}px`);
  console.log(`    Original missed: ${missed_original} (${(missed_original/total*100).toFixed(1)}%)`);
}

console.log('\n── Coverage: off-center click (worst-case angle) ──');
{
  // Click near corner — tests all radial distances and angles.
  const W = 800, H = 450;
  const cols = Math.round(Math.sqrt(1300 * (W / H)));
  const rows = Math.round(1300 / cols);
  const spX = W / cols, spY = H / rows;
  const cx = spX * 2, cy = spY * 2; // near top-left corner

  let missed = 0;
  let total  = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = (c + 0.5) * spX;
      const y = (r + 0.5) * spY;
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (d < 1) continue;                 // skip origin
      if (d > CFG.waveMaxRadius) continue; // wave dies before reaching these
      total++;
      const f = simulateMaxForce(d, CFG, waveForceFixed);
      if (f <= 0) missed++;
    }
  }

  assert(missed === 0, `Fixed: 0/${total} reachable reeds missed on off-center click`);
}

// ── summary ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Tests: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
if (failed > 0) {
  console.error('\nSOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('\nAll tests passed.');
}
