import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildFeedback,
  createHoldProgress,
  diffHoles,
} from "../src/compare.js";

const targetDo = {
  id: "do",
  solfege: "도",
  breath: 2,
  flags: [],
  detectable: {
    L2: 1,
    L3: 1,
    L4: 1,
    L5: 1,
    R2: 1,
    R3: 1,
    R4: 0,
    R5: 0,
  },
};

test("diffHoles marks close, open, ok, and pending states per hole", () => {
  const current = {
    L2: 1,
    L3: 1,
    L4: 0,
    L5: undefined,
    R2: 1,
    R3: 1,
    R4: 1,
    R5: 0,
  };

  assert.deepEqual(diffHoles(targetDo.detectable, current), {
    L2: "ok",
    L3: "ok",
    L4: "close",
    L5: "pending",
    R2: "ok",
    R3: "ok",
    R4: "open",
    R5: "ok",
  });
});

test("buildFeedback prioritizes holes to close before holes to open", () => {
  const current = {
    L2: 1,
    L3: 1,
    L4: 0,
    L5: 1,
    R2: 1,
    R3: 1,
    R4: 1,
    R5: 0,
  };

  const feedback = buildFeedback(targetDo, current);

  assert.equal(feedback.status, "fix");
  assert.equal(feedback.messages[0], "왼손 약지로 구멍을 막으세요");
  assert.equal(feedback.messages[1], "오른손 약지를 떼세요");
});

test("buildFeedback emits a hold message and ambiguity hint when all holes match", () => {
  const note = {
    ...targetDo,
    ambiguousWith: ["highDo"],
  };

  const feedback = buildFeedback(note, targetDo.detectable);

  assert.equal(feedback.status, "hold");
  assert.match(feedback.messages[0], /정확해요/);
  assert.match(feedback.messages[1], /입김 2\/5/);
  assert.match(feedback.messages[2], /높은 도/);
});

test("createHoldProgress requires 1500 ms of continuous correct frames", () => {
  const hold = createHoldProgress(1500);

  assert.equal(hold.update(false, 0).passed, false);
  assert.equal(hold.update(true, 1000).passed, false);
  assert.equal(hold.update(true, 2400).passed, false);
  assert.equal(hold.update(true, 2500).passed, true);
  assert.equal(hold.update(false, 2600).elapsedMs, 0);
});
