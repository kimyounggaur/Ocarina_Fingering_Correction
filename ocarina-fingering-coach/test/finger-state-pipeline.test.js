import assert from "node:assert/strict";
import { test } from "node:test";

import { buildCalibration } from "../src/calibration.js";
import { extractAllFingerFeatures } from "../src/landmarkFeatureExtractor.js";
import { classifyFrameWithDiagnostics } from "../src/fingerState.js";
import {
  makeOpenHandLandmarks,
  makePressedFingerLandmarks,
  makeResults,
} from "./fixtures/handLandmarks.js";

function twoHandResults({ pressed = false } = {}) {
  const leftBase = makeOpenHandLandmarks({ x: 0.38 });
  const rightBase = makeOpenHandLandmarks({ x: 0.62 });
  const left = pressed ? makePressedFingerLandmarks(leftBase, 2) : leftBase;
  const right = pressed ? makePressedFingerLandmarks(rightBase, 2) : rightBase;
  return makeResults([
    { landmarks: left, handedness: "Left" },
    { landmarks: right, handedness: "Right" },
  ]);
}

function calibrationFromResults() {
  const down = extractAllFingerFeatures(twoHandResults({ pressed: true }));
  const up = extractAllFingerFeatures(twoHandResults({ pressed: false }));
  return buildCalibration([down], [up]);
}

test("classifyFrameWithDiagnostics returns holes, diagnostics, and camera guide", () => {
  const calibration = calibrationFromResults();
  const result = classifyFrameWithDiagnostics(
    twoHandResults({ pressed: false }),
    calibration,
    {},
    { detectable: { L2: 0, R2: 0 }, flags: [] },
    200,
  );

  assert.equal(result.holes.L2, 0);
  assert.equal(result.holes.R2, 0);
  assert.equal(result.diagnostics.L2.stableState, "lift");
  assert.equal(result.cameraGuide.level, "ok");
  assert.ok(result.smoothing.L2);
});
