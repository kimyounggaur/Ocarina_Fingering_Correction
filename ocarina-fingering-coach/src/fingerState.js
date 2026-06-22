import { DETECTABLE_HOLES } from "./ocarinaData.js";
import { evaluateCameraPlacement } from "./cameraGuide.js";
import { applyFingeringPrior } from "./fingeringPrior.js";
import { extractAllFingerFeatures } from "./landmarkFeatureExtractor.js";
import { classifyPressLiftFrame } from "./pressLiftClassifier.js";
import { smoothFrame } from "./temporalSmoothing.js";

const FINGER_LANDMARKS = {
  2: { mcp: 5, pip: 6, dip: 7, tip: 8 },
  3: { mcp: 9, pip: 10, dip: 11, tip: 12 },
  4: { mcp: 13, pip: 14, dip: 15, tip: 16 },
  5: { mcp: 17, pip: 18, dip: 19, tip: 20 },
};

const HAND_TO_PREFIX = {
  Left: "L",
  Right: "R",
};

function sub(a, b) {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
    z: (a.z ?? 0) - (b.z ?? 0),
  };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function magnitude(v) {
  return Math.hypot(v.x, v.y, v.z);
}

function distance(a, b) {
  return magnitude(sub(a, b));
}

export function angleBetween(a, b) {
  const denom = magnitude(a) * magnitude(b);
  if (denom === 0) return 0;
  const cos = Math.min(1, Math.max(-1, dot(a, b) / denom));
  return Math.acos(cos);
}

function distanceToLine(point, a, b) {
  const ab = sub(b, a);
  const ap = sub(point, a);
  const len2 = dot(ab, ab);
  if (len2 === 0) return distance(point, a);
  const t = Math.max(0, Math.min(1, dot(ap, ab) / len2));
  const projection = {
    x: a.x + ab.x * t,
    y: a.y + ab.y * t,
    z: (a.z ?? 0) + ab.z * t,
  };
  return distance(point, projection);
}

export function fingerFeature(landmarks, finger) {
  const { mcp, pip, tip } = FINGER_LANDMARKS[finger];
  const scale = Math.max(distance(landmarks[5], landmarks[17]), 0.001);
  const curl = angleBetween(sub(landmarks[pip], landmarks[mcp]), sub(landmarks[tip], landmarks[pip]));
  const tipLift = distanceToLine(landmarks[tip], landmarks[5], landmarks[17]) / scale;
  return {
    curl,
    tipLift,
    score: curl - tipLift,
  };
}

function handednessName(results, index) {
  const handednesses = results?.handednesses ?? results?.handedness ?? [];
  return handednesses[index]?.[0]?.categoryName ?? handednesses[index]?.categories?.[0]?.categoryName;
}

export function extractFeaturesFromResults(results) {
  const features = {};
  const landmarksList = results?.landmarks ?? [];

  landmarksList.forEach((landmarks, index) => {
    const prefix = HAND_TO_PREFIX[handednessName(results, index)];
    if (!prefix) return;
    for (const finger of [2, 3, 4, 5]) {
      const holeId = `${prefix}${finger}`;
      if (!DETECTABLE_HOLES.includes(holeId)) continue;
      features[holeId] = fingerFeature(landmarks, finger).score;
    }
  });

  return features;
}

export function classifyFeatures(features, calibration, previous = {}) {
  const holes = {};
  for (const holeId of DETECTABLE_HOLES) {
    const value = features?.[holeId];
    const cal = calibration?.holes?.[holeId];
    if (!Number.isFinite(value) || !cal) {
      holes[holeId] = undefined;
      continue;
    }

    const margin = cal.margin ?? 0;
    let threshold = cal.threshold;
    if (previous[holeId] === 1) {
      threshold += cal.downIsHigher ? -margin : margin;
    } else if (previous[holeId] === 0) {
      threshold += cal.downIsHigher ? margin : -margin;
    }

    holes[holeId] = cal.downIsHigher ? Number(value > threshold) : Number(value < threshold);
  }
  return holes;
}

export function createFingerSmoother() {
  const history = Object.fromEntries(DETECTABLE_HOLES.map((holeId) => [holeId, []]));
  const windowFor = (holeId) => (holeId.endsWith("5") ? 7 : 5);

  return {
    update(rawState) {
      const smoothed = {};
      for (const holeId of DETECTABLE_HOLES) {
        const value = rawState?.[holeId];
        const items = history[holeId];
        if (value === 0 || value === 1) {
          items.push(value);
          while (items.length > windowFor(holeId)) items.shift();
        }
        if (items.length === 0) {
          smoothed[holeId] = undefined;
        } else {
          const closedCount = items.filter(Boolean).length;
          smoothed[holeId] = Number(closedCount >= Math.ceil(items.length / 2));
        }
      }
      return smoothed;
    },
    reset() {
      for (const items of Object.values(history)) items.length = 0;
    },
  };
}

export function handsVisibleCount(results) {
  return results?.landmarks?.length ?? 0;
}

export function stateConfidence(state) {
  const known = DETECTABLE_HOLES.filter((holeId) => state?.[holeId] === 0 || state?.[holeId] === 1).length;
  return known / DETECTABLE_HOLES.length;
}

export function classifyFrameWithDiagnostics(
  results,
  calibration,
  previousState = {},
  note = null,
  nowMs = performance.now(),
  options = {},
) {
  const cameraGuide = evaluateCameraPlacement(results, options.videoSize);
  const frameFeatures = extractAllFingerFeatures(results);
  const observations = classifyPressLiftFrame(frameFeatures, calibration);
  const smoothed = smoothFrame(
    previousState?.smoothing ? { fingerStates: previousState.smoothing } : previousState,
    observations,
    nowMs,
    { cameraGuide },
  );
  const priorAdjusted = applyFingeringPrior({
    note,
    observations: smoothed,
    stableState: smoothed.holes,
    previousState: previousState?.holes ?? previousState,
  });

  return {
    holes: priorAdjusted.holes,
    diagnostics: priorAdjusted.diagnostics,
    cameraGuide,
    frameFeatures,
    observations,
    smoothing: smoothed.fingerStates,
  };
}
