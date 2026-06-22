import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createTemporalSmoother,
  smoothFingerState,
} from "../src/temporalSmoothing.js";

function observation(state, pressProb, confidence = 0.92, extras = {}) {
  return { state, pressProb, liftProb: 1 - pressProb, confidence, ...extras };
}

test("single-frame lift jitter does not flip a stable press", () => {
  let state = smoothFingerState(undefined, observation("press", 0.95), 0, { dwellMs: 120 });
  state = smoothFingerState(state, observation("lift", 0.05), 40, { dwellMs: 120 });

  assert.equal(state.stableState, "press");
  assert.equal(state.candidateState, "lift");
});

test("state changes after lift remains beyond dwell time", () => {
  let state = smoothFingerState(undefined, observation("press", 0.95), 0, { dwellMs: 120 });
  state = smoothFingerState(state, observation("lift", 0.02), 40, { dwellMs: 120, alpha: 1 });
  state = smoothFingerState(state, observation("lift", 0.02), 180, { dwellMs: 120, alpha: 1 });

  assert.equal(state.stableState, "lift");
});

test("pinky holes use a longer dwell time", () => {
  const smoother = createTemporalSmoother({ dwellMs: 100, pinkyDwellMs: 180, alpha: 1 });
  smoother.update({ R5: observation("press", 0.95) }, 0);
  const earlyFrame = smoother.update({ R5: observation("lift", 0.02) }, 120);
  const frame = smoother.update({ R5: observation("lift", 0.02) }, 301);

  assert.equal(earlyFrame.holes.R5, 1);
  assert.equal(frame.holes.R5, 0);
});

test("motion gate reduces EMA update weight", () => {
  const state = smoothFingerState(undefined, observation("lift", 0.05), 0, { alpha: 0.5 });
  const gated = smoothFingerState(
    state,
    observation("press", 0.95, 0.9, { motionStability: 0.2 }),
    80,
    { alpha: 0.5 },
  );

  assert.equal(gated.motionGated, true);
  assert.ok(gated.appliedAlpha < 0.5);
});
