import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildCameraGuideMessages,
  evaluateCameraPlacement,
  shouldBlockClassification,
} from "../src/cameraGuide.js";
import {
  hideFingerTip,
  makeOpenHandLandmarks,
  makeResults,
  moveHandOutOfFrame,
} from "./fixtures/handLandmarks.js";

test("no hands blocks classification with a Korean guide message", () => {
  const evaluation = evaluateCameraPlacement(makeResults([]), { width: 1280, height: 720 });

  assert.equal(evaluation.level, "block");
  assert.equal(shouldBlockClassification(evaluation), true);
  assert.ok(buildCameraGuideMessages(evaluation).includes("양손을 모두 보여주세요"));
});

test("small hands ask the user to move closer", () => {
  const small = makeOpenHandLandmarks({ scale: 0.08 });
  const evaluation = evaluateCameraPlacement(
    makeResults([
      { landmarks: small, handedness: "Left" },
      { landmarks: small, handedness: "Right" },
    ]),
    { width: 1280, height: 720 },
  );

  assert.equal(evaluation.level, "block");
  assert.ok(evaluation.messages.some((message) => message.includes("크게 보여주세요")));
});

test("off-center hands produce a centering warning", () => {
  const hand = moveHandOutOfFrame(makeOpenHandLandmarks());
  const evaluation = evaluateCameraPlacement(
    makeResults([
      { landmarks: hand, handedness: "Left" },
      { landmarks: makeOpenHandLandmarks({ x: 0.55 }), handedness: "Right" },
    ]),
    { width: 1280, height: 720 },
  );

  assert.equal(evaluation.level, "warn");
  assert.ok(evaluation.messages.some((message) => message.includes("화면 중앙")));
});

test("low fingertip visibility asks the user to rotate the palm toward camera", () => {
  const hidden = hideFingerTip(makeOpenHandLandmarks(), 2);
  const evaluation = evaluateCameraPlacement(
    makeResults([
      { landmarks: hidden, handedness: "Left" },
      { landmarks: hidden, handedness: "Right" },
    ]),
    { width: 1280, height: 720 },
  );

  assert.equal(evaluation.level, "block");
  assert.ok(evaluation.messages.some((message) => message.includes("손가락 끝이 보이도록")));
});
