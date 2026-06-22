import { buildPressLiftCalibration } from "./pressLiftClassifier.js";

export const CALIBRATION_STORAGE_KEY = "ocarinaCoach.calibration.v2";
const LEGACY_CALIBRATION_STORAGE_KEY = "ocarinaCoach.calibration.v1";

export function averageFeatures(samples) {
  const sums = {};
  const counts = {};

  for (const sample of samples) {
    for (const [holeId, value] of Object.entries(sample ?? {})) {
      if (!Number.isFinite(value)) continue;
      sums[holeId] = (sums[holeId] ?? 0) + value;
      counts[holeId] = (counts[holeId] ?? 0) + 1;
    }
  }

  return Object.fromEntries(
    Object.entries(sums).map(([holeId, sum]) => [holeId, sum / counts[holeId]]),
  );
}

export function averageFeatureVectors(samples) {
  const sums = {};
  const counts = {};

  for (const sample of samples) {
    for (const [holeId, features] of Object.entries(sample ?? {})) {
      if (!features || typeof features !== "object") continue;
      sums[holeId] ??= {};
      counts[holeId] ??= {};
      for (const [key, value] of Object.entries(features)) {
        if (!Number.isFinite(value)) continue;
        sums[holeId][key] = (sums[holeId][key] ?? 0) + value;
        counts[holeId][key] = (counts[holeId][key] ?? 0) + 1;
      }
    }
  }

  return Object.fromEntries(
    Object.entries(sums).map(([holeId, featureSums]) => [
      holeId,
      Object.fromEntries(
        Object.entries(featureSums).map(([key, value]) => [key, value / counts[holeId][key]]),
      ),
    ]),
  );
}

export function buildCalibration(downSamples, upSamples) {
  const classifierCalibration = buildPressLiftCalibration(downSamples, upSamples);

  return {
    version: 2,
    createdAt: new Date().toISOString(),
    classifier: classifierCalibration.classifier,
    holes: classifierCalibration.holes,
  };
}

export function isCalibrationReady(calibration, holeIds) {
  return (
    calibration?.version === 2 &&
    calibration?.classifier === "press-lift-v1" &&
    Boolean(calibration?.holes) &&
    holeIds.every((holeId) => calibration.holes[holeId])
  );
}

export function loadCalibration(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(CALIBRATION_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed?.version === 2 && parsed?.classifier === "press-lift-v1" ? parsed : null;
  } catch {
    return null;
  }
}

export function saveCalibration(calibration, storage = globalThis.localStorage) {
  storage?.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(calibration));
}

export function clearCalibration(storage = globalThis.localStorage) {
  storage?.removeItem(CALIBRATION_STORAGE_KEY);
  storage?.removeItem(LEGACY_CALIBRATION_STORAGE_KEY);
}

export function createCalibrationWorkflow({ durationMs = 2000 } = {}) {
  let phase = "idle";
  let startedAt = 0;
  let downSamples = [];
  let upSamples = [];

  return {
    start(nowMs = performance.now()) {
      phase = "down";
      startedAt = nowMs;
      downSamples = [];
      upSamples = [];
    },
    addSample(features, nowMs = performance.now()) {
      if (phase === "idle") return { phase, ratio: 0, done: false };
      if (phase === "down") downSamples.push(features);
      if (phase === "up") upSamples.push(features);

      const elapsed = nowMs - startedAt;
      if (elapsed < durationMs) {
        return { phase, ratio: elapsed / durationMs, done: false };
      }

      if (phase === "down") {
        phase = "up";
        startedAt = nowMs;
        return { phase, ratio: 0, done: false };
      }

      const calibration = buildCalibration(downSamples, upSamples);
      phase = "idle";
      return { phase, ratio: 1, done: true, calibration };
    },
    getPhase() {
      return phase;
    },
    cancel() {
      phase = "idle";
    },
  };
}
