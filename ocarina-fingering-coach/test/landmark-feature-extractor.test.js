import assert from "node:assert/strict";
import { test } from "node:test";

import {
  extractAllFingerFeatures,
  extractFingerFeatures,
} from "../src/landmarkFeatureExtractor.js";
import {
  hideFingerTip,
  makeLiftedFingerLandmarks,
  makeOpenHandLandmarks,
  makePressedFingerLandmarks,
  makeResults,
} from "./fixtures/handLandmarks.js";

test("open hand tipPalmDistance is greater than pressed finger", () => {
  const open = makeOpenHandLandmarks();
  const pressed = makePressedFingerLandmarks(open, 2);

  const liftedFeatures = extractFingerFeatures(makeLiftedFingerLandmarks(open, 2), 2);
  const pressedFeatures = extractFingerFeatures(pressed, 2);

  assert.ok(liftedFeatures.tipPalmDistance > pressedFeatures.tipPalmDistance);
});

test("pressed finger has more curl than lifted finger", () => {
  const open = makeOpenHandLandmarks();
  const liftedFeatures = extractFingerFeatures(open, 3);
  const pressedFeatures = extractFingerFeatures(makePressedFingerLandmarks(open, 3), 3);

  assert.ok(pressedFeatures.pipCurl > liftedFeatures.pipCurl);
  assert.ok(pressedFeatures.totalCurl > liftedFeatures.totalCurl);
});

test("features stay normalized when hand scale changes", () => {
  const small = makePressedFingerLandmarks(makeOpenHandLandmarks({ scale: 0.18 }), 4);
  const large = makePressedFingerLandmarks(makeOpenHandLandmarks({ scale: 0.32 }), 4);

  const smallFeatures = extractFingerFeatures(small, 4);
  const largeFeatures = extractFingerFeatures(large, 4);

  assert.ok(Math.abs(smallFeatures.tipPalmDistance - largeFeatures.tipPalmDistance) < 0.06);
  assert.ok(Math.abs(smallFeatures.tipMcpDistance - largeFeatures.tipMcpDistance) < 0.06);
});

test("hidden fingertip lowers fingerVisibility", () => {
  const open = makeOpenHandLandmarks();
  const visible = extractFingerFeatures(open, 5);
  const hidden = extractFingerFeatures(hideFingerTip(open, 5), 5);

  assert.ok(hidden.fingerVisibility < visible.fingerVisibility);
});

test("extractAllFingerFeatures maps handedness to detectable hole ids", () => {
  const left = makeOpenHandLandmarks({ x: 0.38 });
  const right = makeOpenHandLandmarks({ x: 0.62 });
  const features = extractAllFingerFeatures(
    makeResults([
      { landmarks: left, handedness: "Left" },
      { landmarks: right, handedness: "Right" },
    ]),
  );

  assert.ok(features.L2);
  assert.ok(features.L5);
  assert.ok(features.R2);
  assert.ok(features.R5);
});
