import { DETECTABLE_HOLES, NOTE_LABELS_KO } from "./ocarinaData.js";

export const PRIOR_DEFAULTS = {
  highConfidence: 0.8,
  lowConfidence: 0.55,
  preservePreviousBelowConfidence: 0.55,
  targetHoleBias: 0.08,
  nonTargetLowConfidencePenalty: 0.12,
};

function vectorFor(state = {}) {
  return DETECTABLE_HOLES.map((holeId) => state[holeId] ?? "?").join("");
}

function stateName(value) {
  if (value === 1) return "press";
  if (value === 0) return "lift";
  return "pending";
}

function cloneDiagnostics(diagnostics = {}) {
  return Object.fromEntries(
    DETECTABLE_HOLES.map((holeId) => [
      holeId,
      {
        ...(diagnostics[holeId] ?? {}),
        reasons: [...(diagnostics[holeId]?.reasons ?? [])],
      },
    ]),
  );
}

export function buildFingeringGrammar(notes = []) {
  const validVectors = new Set();
  const vectorToNotes = new Map();
  const noteToVector = new Map();
  const ambiguousGroups = new Map();
  const crossFingeringNotes = new Set();
  const holeChangeCounts = Object.fromEntries(DETECTABLE_HOLES.map((holeId) => [holeId, 0]));

  for (const note of notes) {
    const vector = vectorFor(note.detectable);
    validVectors.add(vector);
    noteToVector.set(note.id, vector);
    vectorToNotes.set(vector, [...(vectorToNotes.get(vector) ?? []), note.id]);
    if (note.ambiguousWith?.length) ambiguousGroups.set(note.id, note.ambiguousWith);
    if (note.flags?.includes("교차운지")) crossFingeringNotes.add(note.id);
  }

  for (let index = 1; index < notes.length; index += 1) {
    const previous = notes[index - 1].detectable;
    const current = notes[index].detectable;
    for (const holeId of DETECTABLE_HOLES) {
      if (previous?.[holeId] !== current?.[holeId]) holeChangeCounts[holeId] += 1;
    }
  }

  const denominator = Math.max(1, notes.length - 1);
  const holeChangeFrequency = Object.fromEntries(
    Object.entries(holeChangeCounts).map(([holeId, count]) => [holeId, count / denominator]),
  );

  return {
    validVectors,
    vectorToNotes,
    noteToVector,
    ambiguousGroups,
    crossFingeringNotes,
    holeChangeFrequency,
  };
}

export function applyFingeringPrior({
  note,
  observations,
  stableState = {},
  previousState = {},
  options = {},
} = {}) {
  const opts = { ...PRIOR_DEFAULTS, ...options };
  const holes = { ...(observations?.holes ?? observations ?? {}) };
  const diagnostics = cloneDiagnostics(observations?.diagnostics ?? {});

  for (const holeId of DETECTABLE_HOLES) {
    const value = holes[holeId];
    const diagnostic = diagnostics[holeId];
    const confidence = diagnostic.confidence ?? 0;
    const previousValue = previousState?.[holeId] ?? stableState?.[holeId];
    const targetValue = note?.detectable?.[holeId];

    if (value !== 0 && value !== 1) {
      diagnostic.stableState = "pending";
      diagnostic.reasons.push("prior-pending-input");
      continue;
    }

    if (confidence >= opts.highConfidence) {
      diagnostic.reasons.push("high-confidence-user-state");
      continue;
    }

    if (confidence < opts.preservePreviousBelowConfidence && (previousValue === 0 || previousValue === 1) && value !== previousValue) {
      holes[holeId] = previousValue;
      diagnostic.stableState = stateName(previousValue);
      diagnostic.reasons.push("prior-preserve-previous");
      continue;
    }

    if (
      targetValue !== undefined &&
      value !== targetValue &&
      confidence < opts.highConfidence - opts.nonTargetLowConfidencePenalty &&
      previousValue === targetValue
    ) {
      holes[holeId] = previousValue;
      diagnostic.stableState = stateName(previousValue);
      diagnostic.reasons.push("prior-target-stability");
    }
  }

  if (note?.ambiguousWith?.length) {
    for (const diagnostic of Object.values(diagnostics)) {
      diagnostic.ambiguity = note.ambiguousWith;
    }
  }

  return { holes, diagnostics };
}

export function getExpectedChangeHints(note, currentState = {}) {
  const messages = [];
  if (note?.ambiguousWith?.length) {
    const labels = note.ambiguousWith.map((id) => NOTE_LABELS_KO[id] ?? id).join(", ");
    messages.push(`이 손모양은 ${labels}과 같게 보여요. 입김/엄지로 구분합니다.`);
  }

  const expectedChanges = DETECTABLE_HOLES.filter((holeId) => {
    const target = note?.detectable?.[holeId];
    return target === 0 || target === 1 ? currentState?.[holeId] !== target : false;
  });
  if (expectedChanges.length) messages.push(`변화가 필요한 손가락: ${expectedChanges.join(", ")}`);
  return messages;
}
