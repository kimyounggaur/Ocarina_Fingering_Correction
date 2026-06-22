import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const DETECTABLE_HOLES = [
  "L2",
  "L3",
  "L4",
  "L5",
  "R2",
  "R3",
  "R4",
  "R5",
];

export const NOTE_ORDER = [
  "lowLa",
  "lowLaS",
  "lowSi",
  "do",
  "doS",
  "re",
  "reS",
  "mi",
  "fa",
  "faS",
  "sol",
  "solS",
  "la",
  "laS",
  "si",
  "highDo",
  "highDoS",
  "highRe",
  "highReS",
  "highMi",
];

export const NOTE_LABELS_KO = {
  lowLa: "낮은 라",
  lowLaS: "낮은 라#",
  lowSi: "낮은 시",
  do: "도",
  doS: "도#",
  re: "레",
  reS: "레#",
  mi: "미",
  fa: "파",
  faS: "파#",
  sol: "솔",
  solS: "솔#",
  la: "라",
  laS: "라#",
  si: "시",
  highDo: "높은 도",
  highDoS: "높은 도#",
  highRe: "높은 레",
  highReS: "높은 레#",
  highMi: "높은 미",
};

export const FINGER_LABELS_KO = {
  L1: "왼손 엄지",
  L2: "왼손 검지",
  L3: "왼손 중지",
  L4: "왼손 약지",
  L5: "왼손 새끼",
  LS: "왼손 보조구멍",
  R1: "오른손 엄지",
  R2: "오른손 검지",
  R3: "오른손 중지",
  R4: "오른손 약지",
  R5: "오른손 새끼",
  RS: "오른손 보조구멍",
};

export const HOLES_12 = [
  { id: "L5", finger: FINGER_LABELS_KO.L5, side: "front", cx: 228, cy: 150, r: 13, detectable: true },
  { id: "L4", finger: FINGER_LABELS_KO.L4, side: "front", cx: 315, cy: 126, r: 17, detectable: true },
  { id: "L3", finger: FINGER_LABELS_KO.L3, side: "front", cx: 402, cy: 114, r: 19, detectable: true },
  { id: "L2", finger: FINGER_LABELS_KO.L2, side: "front", cx: 487, cy: 118, r: 18, detectable: true },
  { id: "LS", finger: FINGER_LABELS_KO.LS, side: "front", cx: 516, cy: 166, r: 8, detectable: false },
  { id: "R2", finger: FINGER_LABELS_KO.R2, side: "front", cx: 582, cy: 178, r: 19, detectable: true },
  { id: "R3", finger: FINGER_LABELS_KO.R3, side: "front", cx: 660, cy: 190, r: 18, detectable: true },
  { id: "R4", finger: FINGER_LABELS_KO.R4, side: "front", cx: 732, cy: 200, r: 15, detectable: true },
  { id: "R5", finger: FINGER_LABELS_KO.R5, side: "front", cx: 796, cy: 206, r: 13, detectable: true },
  { id: "RS", finger: FINGER_LABELS_KO.RS, side: "front", cx: 765, cy: 242, r: 8, detectable: false },
  { id: "R1", finger: FINGER_LABELS_KO.R1, side: "back", cx: 360, cy: 224, r: 19, detectable: false },
  { id: "L1", finger: FINGER_LABELS_KO.L1, side: "back", cx: 606, cy: 172, r: 21, detectable: false },
];

const CARD_BREATH_RE = /<g\s+transform="translate\(300,58\)">([\s\S]*?)<\/g>/;
const CIRCLE_RE = /<circle\b([^>]*)>/g;
const TEXT_RE = /<text\b[^>]*>([\s\S]*?)<\/text>/g;

function stripTags(value) {
  return value.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function getTextValues(svg) {
  return [...svg.matchAll(TEXT_RE)].map((match) => stripTags(match[1])).filter(Boolean);
}

function parsePitchAndMidi(textValues) {
  const match = textValues
    .map((text) => text.match(/^([A-G](?:#|b)?\d(?:\/[A-G](?:#|b)?\d)?)\s*·\s*MIDI\s*(\d+)$/))
    .find(Boolean);
  if (!match) {
    throw new Error("Could not find pitch and MIDI text in note SVG.");
  }
  return { pitch: match[1], midi: Number(match[2]) };
}

function parseBreath(svg) {
  const match = svg.match(CARD_BREATH_RE);
  if (!match) {
    throw new Error("Could not find breath gauge group.");
  }
  return [...match[1].matchAll(/<rect\b[^>]*\bfill="([^"]+)"/g)].filter(
    (rectMatch) => rectMatch[1].toUpperCase() === "#2E5AAC",
  ).length;
}

function fillToState(fill) {
  return fill.toUpperCase() === "#FFFFFF" ? 0 : 1;
}

function parseAttrs(attrText) {
  return Object.fromEntries([...attrText.matchAll(/([\w:-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]));
}

function parseHoles(svg) {
  const circles = [...svg.matchAll(CIRCLE_RE)].map((match) => parseAttrs(match[1]));

  return Object.fromEntries(
    HOLES_12.map((hole) => {
      const layers = circles.filter(
        (circle) => Number(circle.cx) === hole.cx && Number(circle.cy) === hole.cy && Number(circle.r) === hole.r,
      );
      if (layers.length === 0) {
        throw new Error(`Could not find SVG circle for hole ${hole.id}.`);
      }
      if (layers.some((circle) => "clip-path" in circle)) {
        return [hole.id, 0.5];
      }
      return [hole.id, fillToState(layers.at(-1).fill)];
    }),
  );
}

function parseFlags(textValues) {
  return ["교차운지", "고급"].filter((flag) => textValues.includes(flag));
}

export function getDetectableVector(note) {
  return Object.fromEntries(DETECTABLE_HOLES.map((holeId) => [holeId, note.holes[holeId]]));
}

export function vectorKey(vector) {
  return DETECTABLE_HOLES.map((holeId) => vector[holeId]).join("");
}

export function parseNoteSvg(svg, fileName) {
  const id = basename(fileName, ".svg");
  const textValues = getTextValues(svg);
  const solfege = textValues[0];
  const { pitch, midi } = parsePitchAndMidi(textValues);
  const breath = parseBreath(svg);
  const holes = parseHoles(svg);
  const flags = parseFlags(textValues);
  const tip = textValues.at(-1) ?? "";

  return {
    id,
    solfege,
    label: NOTE_LABELS_KO[id] ?? solfege,
    pitch,
    midi,
    breath,
    holes,
    detectable: Object.fromEntries(DETECTABLE_HOLES.map((holeId) => [holeId, holes[holeId]])),
    tip,
    flags,
  };
}

export function applyAmbiguity(notes) {
  const groups = new Map();
  for (const note of notes) {
    const key = vectorKey(note.detectable);
    groups.set(key, [...(groups.get(key) ?? []), note.id]);
  }

  return notes.map((note) => {
    const siblings = groups.get(vectorKey(note.detectable)) ?? [];
    const ambiguousWith = siblings.filter((id) => id !== note.id);
    return ambiguousWith.length > 0 ? { ...note, ambiguousWith } : note;
  });
}

export function getMvpNotes(notes) {
  const counts = new Map();
  for (const note of notes) {
    const key = vectorKey(note.detectable);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return notes
    .filter((note) => counts.get(vectorKey(note.detectable)) === 1)
    .map((note) => note.id);
}

export async function readSourceNotes(sourceDir) {
  const files = (await readdir(sourceDir))
    .filter((fileName) => fileName.endsWith(".svg"))
    .sort((a, b) => NOTE_ORDER.indexOf(basename(a, ".svg")) - NOTE_ORDER.indexOf(basename(b, ".svg")));

  const parsed = [];
  for (const fileName of files) {
    const svg = await readFile(join(sourceDir, fileName), "utf8");
    parsed.push(parseNoteSvg(svg, fileName));
  }

  return applyAmbiguity(parsed);
}

function serializeJs(name, value) {
  return `export const ${name} = ${JSON.stringify(value, null, 2)};\n`;
}

export function buildOcarinaDataModule(notes) {
  const mvpNotes = getMvpNotes(notes);
  return `// Auto-generated by tools/build-fingering-data.mjs from 01 Source/음별_20/*.svg.
// Do not edit note data by hand.

${serializeJs("DETECTABLE_HOLES", DETECTABLE_HOLES)}
${serializeJs("NOTE_ORDER", NOTE_ORDER)}
${serializeJs("NOTE_LABELS_KO", NOTE_LABELS_KO)}
${serializeJs("FINGER_LABELS_KO", FINGER_LABELS_KO)}
${serializeJs("HOLES_12", HOLES_12)}
${serializeJs("NOTES_12", notes)}
${serializeJs("MVP_NOTES", mvpNotes)}

export const OCARINA_TYPES = {
  hole12: {
    id: "hole12",
    name: "12홀 횡형",
    status: "ready",
    holes: HOLES_12,
    notes: NOTES_12,
    detectable: DETECTABLE_HOLES,
  },
  hole10: { id: "hole10", name: "10홀 횡형", status: "coming-soon", holes: [], notes: [], detectable: [] },
  hole6: { id: "hole6", name: "6홀 펜던트", status: "coming-soon", holes: [], notes: [], detectable: [] },
  hole4: { id: "hole4", name: "4홀 펜던트", status: "coming-soon", holes: [], notes: [], detectable: [] },
  double: { id: "double", name: "더블/트리플", status: "coming-soon", holes: [], notes: [], detectable: [] },
};

export function getNote(typeId, noteId) {
  const type = OCARINA_TYPES[typeId];
  if (!type) return undefined;
  return type.notes.find((note) => note.id === noteId);
}

export function getDetectableVector(note) {
  return Object.fromEntries(DETECTABLE_HOLES.map((holeId) => [holeId, note.holes[holeId]]));
}

export function getNoteLabel(noteId) {
  return NOTE_LABELS_KO[noteId] ?? noteId;
}
`;
}

async function main() {
  const projectDir = dirname(fileURLToPath(import.meta.url));
  const appDir = join(projectDir, "..");
  const workspaceDir = join(appDir, "..");
  const sourceDir = join(
    workspaceDir,
    "01 Source",
    "ocarina_fingering_charts_by_type(Claude)[All]",
    "음별_20",
  );
  const outFile = join(appDir, "src", "ocarinaData.js");
  const notes = await readSourceNotes(sourceDir);
  await writeFile(outFile, buildOcarinaDataModule(notes), "utf8");
  console.log(`Generated ${outFile} from ${notes.length} source SVG files.`);
  console.log(`MVP unique notes: ${getMvpNotes(notes).join(", ")}`);
}

const isDirectRun = process.argv[1]
  ? pathToFileURL(process.argv[1]).href === import.meta.url
  : false;

if (isDirectRun) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
