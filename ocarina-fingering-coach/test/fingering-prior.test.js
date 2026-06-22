import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyFingeringPrior,
  buildFingeringGrammar,
  getExpectedChangeHints,
} from "../src/fingeringPrior.js";

const notes = [
  {
    id: "do",
    label: "도",
    detectable: { L2: 1, L3: 1, L4: 1, L5: 1, R2: 1, R3: 1, R4: 0, R5: 0 },
    flags: [],
    ambiguousWith: ["highDo"],
  },
  {
    id: "doS",
    label: "도#",
    detectable: { L2: 1, L3: 1, L4: 1, L5: 1, R2: 0, R3: 1, R4: 0, R5: 0 },
    flags: ["교차운지"],
    ambiguousWith: [],
  },
];

function frame(value, confidence = 0.9) {
  const holes = Object.fromEntries(Object.keys(notes[0].detectable).map((holeId) => [holeId, value[holeId]]));
  const diagnostics = Object.fromEntries(
    Object.entries(holes).map(([holeId, holeValue]) => [
      holeId,
      {
        stableState: holeValue === 1 ? "press" : "lift",
        confidence,
        reasons: [],
      },
    ]),
  );
  return { holes, diagnostics };
}

test("high-confidence observations are not changed by prior", () => {
  const observed = frame({ ...notes[0].detectable, R4: 1 }, 0.91);
  const adjusted = applyFingeringPrior({
    note: notes[0],
    observations: observed,
    stableState: notes[0].detectable,
    previousState: notes[0].detectable,
  });

  assert.equal(adjusted.holes.R4, 1);
  assert.ok(adjusted.diagnostics.R4.reasons.includes("high-confidence-user-state"));
});

test("low-confidence mismatch preserves previous stable state", () => {
  const observed = frame({ ...notes[0].detectable, R4: 1 }, 0.42);
  const adjusted = applyFingeringPrior({
    note: notes[0],
    observations: observed,
    stableState: notes[0].detectable,
    previousState: notes[0].detectable,
  });

  assert.equal(adjusted.holes.R4, 0);
  assert.ok(adjusted.diagnostics.R4.reasons.includes("prior-preserve-previous"));
});

test("cross-fingering note is treated as valid grammar", () => {
  const grammar = buildFingeringGrammar(notes);
  const vector = Object.values(notes[1].detectable).join("");

  assert.equal(grammar.validVectors.has(vector), true);
  assert.equal(grammar.crossFingeringNotes.has("doS"), true);
});

test("ambiguous notes keep breath and thumb distinction hints", () => {
  const hints = getExpectedChangeHints(notes[0], notes[0].detectable);

  assert.ok(hints.some((message) => message.includes("입김/엄지")));
});
