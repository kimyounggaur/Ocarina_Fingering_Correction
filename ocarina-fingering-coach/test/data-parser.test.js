import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import {
  DETECTABLE_HOLES,
  NOTE_ORDER,
  getDetectableVector,
  parseNoteSvg,
  readSourceNotes,
} from "../tools/build-fingering-data.mjs";

const sourceDir = join(
  import.meta.dirname,
  "..",
  "..",
  "01 Source",
  "ocarina_fingering_charts_by_type(Claude)[All]",
  "음별_20",
);

async function parseFixture(fileName) {
  const svg = await readFile(join(sourceDir, fileName), "utf8");
  return parseNoteSvg(svg, fileName);
}

test("parseNoteSvg extracts C5 도 holes, breath, and tip from the source SVG", async () => {
  const note = await parseFixture("do.svg");

  assert.equal(note.id, "do");
  assert.equal(note.solfege, "도");
  assert.equal(note.pitch, "C5");
  assert.equal(note.midi, 72);
  assert.equal(note.breath, 2);
  assert.deepEqual(note.flags, []);
  assert.equal(note.holes.L1, 1);
  assert.equal(note.holes.L2, 1);
  assert.equal(note.holes.L3, 1);
  assert.equal(note.holes.L4, 1);
  assert.equal(note.holes.L5, 1);
  assert.equal(note.holes.LS, 1);
  assert.equal(note.holes.R1, 1);
  assert.equal(note.holes.R2, 1);
  assert.equal(note.holes.R3, 1);
  assert.equal(note.holes.R4, 0);
  assert.equal(note.holes.R5, 0);
  assert.equal(note.holes.RS, 0);
  assert.deepEqual(getDetectableVector(note), {
    L2: 1,
    L3: 1,
    L4: 1,
    L5: 1,
    R2: 1,
    R3: 1,
    R4: 0,
    R5: 0,
  });
  assert.match(note.tip, /오른손 약지/);
});

test("parseNoteSvg recognizes low A as all holes closed and high E as all holes open", async () => {
  const lowLa = await parseFixture("lowLa.svg");
  const highMi = await parseFixture("highMi.svg");

  assert.equal(lowLa.breath, 1);
  assert.ok(Object.values(lowLa.holes).every((value) => value === 1));

  assert.equal(highMi.breath, 5);
  assert.deepEqual(highMi.flags, ["고급"]);
  assert.ok(Object.values(highMi.holes).every((value) => value === 0));
});

test("parseNoteSvg accepts enharmonic sharp and flat pitch text", async () => {
  const doS = await parseFixture("doS.svg");

  assert.equal(doS.solfege, "도♯·레♭");
  assert.equal(doS.pitch, "C#5/Db5");
  assert.equal(doS.midi, 73);
  assert.deepEqual(doS.flags, ["교차운지"]);
  assert.match(doS.tip, /교차운지/);
});

test("parseNoteSvg reads clipped half-hole overlays as 0.5", async () => {
  const highDoS = await parseFixture("highDoS.svg");

  assert.equal(highDoS.holes.L1, 0.5);
  assert.equal(highDoS.holes.R1, 0);
  assert.match(highDoS.tip, /반만/);
});

test("detectable vector keeps the MVP holes in the documented order", () => {
  assert.deepEqual(DETECTABLE_HOLES, [
    "L2",
    "L3",
    "L4",
    "L5",
    "R2",
    "R3",
    "R4",
    "R5",
  ]);
});

test("readSourceNotes preserves the documented low-to-high note order", async () => {
  const notes = await readSourceNotes(sourceDir);

  assert.deepEqual(
    notes.map((note) => note.id),
    NOTE_ORDER,
  );
});
