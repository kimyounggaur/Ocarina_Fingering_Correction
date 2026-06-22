import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CALIBRATION_STORAGE_KEY,
  buildCalibration,
  clearCalibration,
  createCalibrationWorkflow,
  isCalibrationReady,
  loadCalibration,
  saveCalibration,
} from "../src/calibration.js";
import { extractFingerFeatures } from "../src/landmarkFeatureExtractor.js";
import {
  makeOpenHandLandmarks,
  makePressedFingerLandmarks,
} from "./fixtures/handLandmarks.js";

function storageStub() {
  const data = new Map();
  return {
    getItem(key) {
      return data.get(key) ?? null;
    },
    setItem(key, value) {
      data.set(key, value);
    },
    removeItem(key) {
      data.delete(key);
    },
    has(key) {
      return data.has(key);
    },
  };
}

function frameSamples() {
  const open = makeOpenHandLandmarks();
  return {
    down: {
      R2: extractFingerFeatures(makePressedFingerLandmarks(open, 2), 2),
      R3: extractFingerFeatures(makePressedFingerLandmarks(open, 3), 3),
    },
    up: {
      R2: extractFingerFeatures(open, 2),
      R3: extractFingerFeatures(open, 3),
    },
  };
}

test("calibration storage key is versioned for press-lift classifier", () => {
  assert.equal(CALIBRATION_STORAGE_KEY, "ocarinaCoach.calibration.v2");
});

test("buildCalibration stores v2 classifier metadata and per-hole references", () => {
  const { down, up } = frameSamples();
  const calibration = buildCalibration([down], [up]);

  assert.equal(calibration.version, 2);
  assert.equal(calibration.classifier, "press-lift-v1");
  assert.ok(calibration.createdAt);
  assert.ok(calibration.holes.R2.downRef);
  assert.ok(calibration.holes.R3.upRef);
  assert.equal(isCalibrationReady(calibration, ["R2", "R3"]), true);
});

test("loadCalibration ignores legacy v1 storage and uses v2 only", () => {
  const storage = storageStub();
  storage.setItem("ocarinaCoach.calibration.v1", JSON.stringify({ holes: { R2: {} } }));

  assert.equal(loadCalibration(storage), null);

  const calibration = buildCalibration([frameSamples().down], [frameSamples().up]);
  saveCalibration(calibration, storage);
  assert.equal(loadCalibration(storage).version, 2);
});

test("clearCalibration removes both v1 and v2 keys", () => {
  const storage = storageStub();
  storage.setItem("ocarinaCoach.calibration.v1", "{}");
  storage.setItem(CALIBRATION_STORAGE_KEY, "{}");

  clearCalibration(storage);

  assert.equal(storage.has("ocarinaCoach.calibration.v1"), false);
  assert.equal(storage.has(CALIBRATION_STORAGE_KEY), false);
});

test("createCalibrationWorkflow collects feature-vector frames", () => {
  const workflow = createCalibrationWorkflow({ durationMs: 100 });
  const { down, up } = frameSamples();

  workflow.start(0);
  assert.deepEqual(workflow.addSample(down, 50), { phase: "down", ratio: 0.5, done: false });
  assert.deepEqual(workflow.addSample(down, 100), { phase: "up", ratio: 0, done: false });
  const done = workflow.addSample(up, 200);

  assert.equal(done.done, true);
  assert.equal(done.calibration.version, 2);
  assert.ok(done.calibration.holes.R2);
});
