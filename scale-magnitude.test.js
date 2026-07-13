const assert = require('assert');
const { ReedField } = require('./reed-field.js');

// Above reference width: full strength, no regression on desktop.
assert.strictEqual(ReedField.computeInteractionScale(1280), 1);
assert.strictEqual(ReedField.computeInteractionScale(1920), 1);

// Between floor and reference: linear.
const mid = ReedField.computeInteractionScale(960);
assert.ok(mid > 0.5 && mid < 1, `expected 960px scale between 0.5 and 1, got ${mid}`);
assert.ok(Math.abs(mid - 0.75) < 0.001, `expected 960px scale ~0.75, got ${mid}`);

// 640px is still above the floor width (0.35 * 1280 = 448px) — unclamped.
assert.strictEqual(ReedField.computeInteractionScale(640), 0.5);

// At/below the floor width (448px): clamped to 0.35, never below.
assert.strictEqual(ReedField.computeInteractionScale(448), 0.35);
assert.strictEqual(ReedField.computeInteractionScale(360), 0.35);
assert.strictEqual(ReedField.computeInteractionScale(1), 0.35);

console.log('scale-magnitude.test.js: all assertions passed');
