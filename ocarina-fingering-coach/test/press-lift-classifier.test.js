import assert from "node:assert/strict";
import { test } from "node:test";

import { extractFingerFeatures } from "../src/landmarkFeatureExtractor.js";
import {
  buildPressLiftCalibration,
  classifyFingerPressLift,
} from "../src/pressLiftClassifier.js";
import {
  hideFingerTip,
  makeOpenHandLandmarks,
  makePressedFingerLandmarks,
} from "./fixtures/handLandmarks.js";

function samplesFor(fingerNumber) {
  const open = makeOpenHandLandmarks();
  return {
    down: [extractFingerFeatures(makePressedFingerLandmarks(open, fingerNumber), fingerNumber)],
    up: [extractFingerFeatures(open, fingerNumber)],
    mid: extractFingerFeatures(hideFingerTip(open, fingerNumber), fingerNumber),
  };
}

test("buildPressLiftCalibration creates per-hole references and thresholds", () => {
  const { down, up } = samplesFor(2);
  const calibration = buildPressLiftCalibration([{ R2: down[0] }], [{ R2: up[0] }]);

  assert.equal(calibration.classifier, "press-lift-v1");
  assert.equal(calibration.holes.R2.thresholds.press, 0.62);
  assert.equal(calibration.holes.R2.thresholds.lift, 0.38);
  assert.ok(Number.isFinite(calibration.holes.R2.downRef.totalCurl));
  assert.ok(Number.isFinite(calibration.holes.R2.upRef.tipPalmDistance));
});

test("classifyFingerPressLift returns press and lift with probabilities", () => {
  const { down, up } = samplesFor(3);
  const calibration = buildPressLiftCalibration([{ R3: down[0] }], [{ R3: up[0] }]);

  const pressed = classifyFingerPressLift("R3", down[0], calibration);
  const lifted = classifyFingerPressLift("R3", up[0], calibration);

  assert.equal(pressed.state, "press");
  assert.equal(lifted.state, "lift");
  assert.ok(pressed.pressProb > 0.8);
  assert.ok(lifted.liftProb > 0.8);
});

test("ambiguous low-visibility feature returns pending", () => {
  const { down, up, mid } = samplesFor(4);
  const calibration = buildPressLiftCalibration([{ R4: down[0] }], [{ R4: up[0] }]);
  const result = classifyFingerPressLift("R4", mid, calibration);

  assert.equal(result.state, "pending");
  assert.ok(result.confidence < calibration.holes.R4.minConfidence);
  assert.ok(result.reasons.includes("low-visibility"));
});

test("probabilities and confidence stay in the 0..1 range", () => {
  const { down, up } = samplesFor(5);
  const calibration = buildPressLiftCalibration([{ R5: down[0] }], [{ R5: up[0] }]);
  const result = classifyFingerPressLift("R5", down[0], calibration);

  for (const value of [result.pressProb, result.liftProb, result.confidence]) {
    assert.ok(value >= 0);
    assert.ok(value <= 1);
  }
});
