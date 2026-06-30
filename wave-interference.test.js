// wave-interference.test.js — wave-wave interaction physics tests
// Run: node wave-interference.test.js

let passed = 0, failed = 0;
function assert(label, cond, extra = '') {
  if (cond) { console.log(`  PASS  ${label}`); passed++; }
  else       { console.error(`  FAIL  ${label}${extra ? ' — ' + extra : ''}`); failed++; }
}

const CFG = {
  waveWidth:          8,
  waveSpeed:          12,
  waveStrength:       28,
  waveTroughStrength: 0.7,
};

// Mirrors the updated Reed.update() wave force formula (scalar, 1D radial distance).
// Returns signed scalar force (+ = outward, − = inward).
function waveForce(reedDist, waveRadius, cfg) {
  if (reedDist < 0.1) return 0;
  const half       = cfg.waveWidth * 0.5;
  const troughLen  = cfg.waveWidth * 2;
  const prevRadius = waveRadius - cfg.waveSpeed;

  if (reedDist > waveRadius + half || reedDist < prevRadius - half - troughLen) return 0;

  const ringNearest = Math.max(prevRadius, Math.min(waveRadius, reedDist));
  const diff        = reedDist - ringNearest;

  if (diff >= -half && diff <= half) {
    return (1 - Math.abs(diff) / half) * cfg.waveStrength;
  } else if (diff < -half && diff >= -(half + troughLen)) {
    const t = (-diff - half) / troughLen;
    return -Math.sin(t * Math.PI) * cfg.waveStrength * cfg.waveTroughStrength;
  }
  return 0;
}

// ── Crest behavior (backwards-compatible) ───────────────────────────────────
console.log('\n=== Crest (backwards-compat) ===');
{
  const r = 100;
  const fAt = waveForce(r, r, CFG);
  assert('At wavefront: positive (outward)', fAt > 0, `got ${fAt}`);
  assert('At wavefront: full strength', Math.abs(fAt - CFG.waveStrength) < 0.01, `got ${fAt}`);

  const half = CFG.waveWidth * 0.5;
  const fEdge = waveForce(r + half, r, CFG);
  assert('At crest edge: zero', Math.abs(fEdge) < 0.01, `got ${fEdge}`);

  const fOutside = waveForce(r + half + 1, r, CFG);
  assert('Outside crest: zero', fOutside === 0, `got ${fOutside}`);

  // Reed in sweep band (between prevRadius and radius) → full crest
  const fSwept = waveForce(r - CFG.waveSpeed * 0.5, r, CFG);
  assert('In sweep band: full crest', Math.abs(fSwept - CFG.waveStrength) < 0.01, `got ${fSwept}`);
}

// ── Trough behavior ─────────────────────────────────────────────────────────
console.log('\n=== Trough ===');
{
  const r    = 100;
  const half = CFG.waveWidth * 0.5;
  const troughLen = CFG.waveWidth * 2;

  // Centre of trough zone: diff = -(half + troughLen/2), t = 0.5 → sin(π/2) = 1 → peak
  // diff = reedDist - prevRadius → reedDist = prevRadius + diff = (r - waveSpeed) - (half + troughLen/2)
  const peakDist = (r - CFG.waveSpeed) - (half + troughLen / 2);
  const fPeak = waveForce(peakDist, r, CFG);
  const expectedPeak = -CFG.waveTroughStrength * CFG.waveStrength;
  assert('Trough peak: negative (inward)', fPeak < 0, `got ${fPeak}`);
  assert('Trough peak: near −waveTroughStrength×strength', Math.abs(fPeak - expectedPeak) < 0.5,
    `got ${fPeak.toFixed(3)}, expected ${expectedPeak.toFixed(3)}`);

  // Trough edges: should be near zero
  const troughStart = (r - CFG.waveSpeed) - half - 0.01;
  const troughEnd   = (r - CFG.waveSpeed) - half - troughLen + 0.01;
  assert('Trough start edge: near zero', Math.abs(waveForce(troughStart, r, CFG)) < 0.1,
    `got ${waveForce(troughStart, r, CFG)}`);
  assert('Trough end edge: near zero', Math.abs(waveForce(troughEnd, r, CFG)) < 0.1,
    `got ${waveForce(troughEnd, r, CFG)}`);

  // Beyond trough: zero
  const beyond = (r - CFG.waveSpeed) - half - troughLen - 5;
  assert('Beyond trough: zero', waveForce(beyond, r, CFG) === 0, `got ${waveForce(beyond, r, CFG)}`);
}

// ── Constructive interference ────────────────────────────────────────────────
console.log('\n=== Constructive interference ===');
{
  // Two identical waves, both crests at the same reed.
  const r = 100, d = 100;
  const f1 = waveForce(d, r, CFG);
  const f2 = waveForce(d, r, CFG);
  const combined = f1 + f2;
  assert('Two crests: combined > single', combined > f1, `f1=${f1}, combined=${combined}`);
  assert('Two crests: combined = 2×single', Math.abs(combined - 2 * f1) < 0.01);

  // Two waves slightly offset — both in crest zone → still constructive
  const r2 = 100 + CFG.waveWidth * 0.3;
  const fA = waveForce(d, r, CFG);
  const fB = waveForce(d, r2, CFG);
  assert('Offset crests: both positive', fA > 0 && fB > 0);
  assert('Offset crests: sum > either alone', fA + fB > Math.max(fA, fB));
}

// ── Destructive interference ─────────────────────────────────────────────────
console.log('\n=== Destructive interference ===');
{
  // Place one wave's crest at the reed, and another wave's trough peak at the same reed.
  // Wave A: crest at d=100, radius=100
  const rA = 100, dA = 100;
  const fA = waveForce(dA, rA, CFG);

  // Wave B trough peak at same reed:
  // trough peak → diff_B = -(half + troughLen/2), prevRadius_B = rB - waveSpeed
  // reedDist - prevRadius_B = diff_B → prevRadius_B = reedDist - diff_B
  // reedDist = 100 (same reed from B's perspective, scalar)
  const half = CFG.waveWidth * 0.5;
  const troughLen = CFG.waveWidth * 2;
  const dB = 80; // reed is 80px from wave B's center
  // We want diff_B ≈ -(half + troughLen/2) for peak trough
  // diff_B = dB - prevRadius_B = dB - (rB - waveSpeed)
  // → rB = dB - diff_B + waveSpeed = 80 + (half + troughLen/2) + waveSpeed = 80 + 4 + 8 + 12 = 104
  const rB = dB + half + troughLen / 2 + CFG.waveSpeed;
  const fB = waveForce(dB, rB, CFG);

  assert('Destructive: wave A crest positive', fA > 0, `fA=${fA}`);
  assert('Destructive: wave B trough negative', fB < 0, `fB=${fB}`);
  const combined = fA + fB;
  assert('Destructive: |combined| < |crest alone|', Math.abs(combined) < Math.abs(fA),
    `fA=${fA.toFixed(2)}, fB=${fB.toFixed(2)}, sum=${combined.toFixed(2)}`);
}

// ── No dead zones — crest ────────────────────────────────────────────────────
console.log('\n=== No dead zones (crest) ===');
{
  const R_MAX = 500;
  const received = new Set();
  for (let r = 0; r <= R_MAX + 50; r += CFG.waveSpeed) {
    for (let d = 0; d <= R_MAX; d++) {
      if (waveForce(d, r, CFG) > 0) received.add(d);
    }
  }
  let missed = 0;
  const margin = Math.ceil(CFG.waveWidth * 0.5) + 1;
  for (let d = margin; d <= R_MAX - margin; d++) {
    if (!received.has(d)) missed++;
  }
  assert(`Crest: no dead zones (${R_MAX}px range)`, missed === 0, `missed ${missed} positions`);
}

// ── No dead zones — trough ───────────────────────────────────────────────────
console.log('\n=== No dead zones (trough) ===');
{
  const half = CFG.waveWidth * 0.5;
  const troughLen = CFG.waveWidth * 2;
  const R_MAX = 500;
  const received = new Set();
  for (let r = 0; r <= R_MAX + 100; r += CFG.waveSpeed) {
    for (let d = 0; d <= R_MAX; d++) {
      if (waveForce(d, r, CFG) < 0) received.add(d);
    }
  }
  let missed = 0;
  const start = Math.ceil(half + 1);
  const end   = R_MAX - Math.ceil(half + troughLen + CFG.waveSpeed);
  for (let d = start; d <= end; d++) {
    if (!received.has(d)) missed++;
  }
  assert(`Trough: no dead zones (${R_MAX}px range)`, missed === 0, `missed ${missed} positions`);
}

// ── Force continuity — no sudden jumps ──────────────────────────────────────
console.log('\n=== Force continuity ===');
{
  const r = 100;
  let maxJump = 0;
  let prev = 0;
  for (let d = 0; d <= 200; d++) {
    const f = waveForce(d, r, CFG);
    maxJump = Math.max(maxJump, Math.abs(f - prev));
    prev = f;
  }
  // Max jump should be bounded — no teleporting from +strength to −strength in 1px
  assert(`No discontinuous jumps (max jump: ${maxJump.toFixed(2)})`, maxJump < CFG.waveStrength,
    `max=${maxJump.toFixed(2)}`);
}

// ── Trough is weaker than crest ──────────────────────────────────────────────
console.log('\n=== Trough weaker than crest ===');
{
  const r = 200;
  let maxCrest = 0, maxTrough = 0;
  for (let d = 0; d <= 300; d++) {
    const f = waveForce(d, r, CFG);
    if (f > 0) maxCrest  = Math.max(maxCrest,  f);
    if (f < 0) maxTrough = Math.max(maxTrough, -f);
  }
  assert('Crest peak = waveStrength', Math.abs(maxCrest - CFG.waveStrength) < 0.01,
    `got ${maxCrest}`);
  assert('Trough peak = waveTroughStrength × waveStrength',
    Math.abs(maxTrough - CFG.waveTroughStrength * CFG.waveStrength) < 0.5,
    `got ${maxTrough.toFixed(3)}, expected ${(CFG.waveTroughStrength * CFG.waveStrength).toFixed(3)}`);
  assert('Trough weaker than crest', maxTrough < maxCrest,
    `trough=${maxTrough.toFixed(2)}, crest=${maxCrest.toFixed(2)}`);
}

// ── waveTroughStrength = 0 → no trough (original pulse only) ────────────────
console.log('\n=== waveTroughStrength = 0 ===');
{
  const cfgNT = { ...CFG, waveTroughStrength: 0 };
  const r = 100;
  let anyNegative = false;
  for (let d = 0; d <= 200; d++) {
    if (waveForce(d, r, cfgNT) < 0) { anyNegative = true; break; }
  }
  assert('No trough when waveTroughStrength=0', !anyNegative);
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
