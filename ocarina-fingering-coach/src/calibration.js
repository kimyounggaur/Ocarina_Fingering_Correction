export const CALIBRATION_STORAGE_KEY = "ocarinaCoach.calibration.v1";

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

export function buildCalibration(downSamples, upSamples) {
  const down = averageFeatures(downSamples);
  const up = averageFeatures(upSamples);
  const thresholds = {};

  for (const holeId of Object.keys({ ...down, ...up })) {
    if (!Number.isFinite(down[holeId]) || !Number.isFinite(up[holeId])) continue;
    const gap = Math.abs(down[holeId] - up[holeId]);
    thresholds[holeId] = {
      down: down[holeId],
      up: up[holeId],
      threshold: (down[holeId] + up[holeId]) / 2,
      downIsHigher: down[holeId] > up[holeId],
      margin: Math.max(gap * 0.12, 0.01),
    };
  }

  return {
    createdAt: new Date().toISOString(),
    holes: thresholds,
  };
}

export function isCalibrationReady(calibration, holeIds) {
  return Boolean(calibration?.holes) && holeIds.every((holeId) => calibration.holes[holeId]);
}

export function loadCalibration(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(CALIBRATION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveCalibration(calibration, storage = globalThis.localStorage) {
  storage?.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(calibration));
}

export function clearCalibration(storage = globalThis.localStorage) {
  storage?.removeItem(CALIBRATION_STORAGE_KEY);
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
