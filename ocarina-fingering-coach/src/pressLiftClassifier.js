import { DETECTABLE_HOLES } from "./ocarinaData.js";

export const PRESS_LIFT_DEFAULTS = {
  minConfidence: 0.55,
  pressThreshold: 0.62,
  liftThreshold: 0.38,
  featureWeights: {
    totalCurl: 0.3,
    tipPalmDistance: 0.3,
    tipLiftAxis: 0.2,
    tipMcpDistance: 0.1,
    fingerVisibility: 0.1,
  },
};

const FEATURE_KEYS = Object.keys(PRESS_LIFT_DEFAULTS.featureWeights);

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function isFeatureVector(value) {
  return value && typeof value === "object" && FEATURE_KEYS.some((key) => Number.isFinite(value[key]));
}

function collectSamples(samples = []) {
  const byHole = {};

  for (const sample of samples) {
    if (isFeatureVector(sample)) {
      byHole.default = [...(byHole.default ?? []), sample];
      continue;
    }

    for (const [holeId, features] of Object.entries(sample ?? {})) {
      if (!isFeatureVector(features)) continue;
      byHole[holeId] = [...(byHole[holeId] ?? []), features];
    }
  }

  return byHole;
}

function averageFeatureVectors(samples = []) {
  const sums = {};
  const counts = {};

  for (const features of samples) {
    for (const [key, value] of Object.entries(features ?? {})) {
      if (!Number.isFinite(value)) continue;
      sums[key] = (sums[key] ?? 0) + value;
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }

  return Object.fromEntries(Object.entries(sums).map(([key, value]) => [key, value / counts[key]]));
}

function normalizedEvidence(value, downRef, upRef) {
  const span = downRef - upRef;
  if (!Number.isFinite(value) || Math.abs(span) < 0.0001) return 0.5;
  return clamp((value - upRef) / span);
}

export function buildPressLiftCalibration(downSamples, upSamples) {
  const downByHole = collectSamples(downSamples);
  const upByHole = collectSamples(upSamples);
  const holeIds = new Set([
    ...Object.keys(downByHole).filter((holeId) => holeId !== "default"),
    ...Object.keys(upByHole).filter((holeId) => holeId !== "default"),
  ]);

  if (holeIds.size === 0 && downByHole.default && upByHole.default) {
    holeIds.add("default");
  }

  const holes = {};
  for (const holeId of holeIds) {
    const down = averageFeatureVectors(downByHole[holeId] ?? downByHole.default);
    const up = averageFeatureVectors(upByHole[holeId] ?? upByHole.default);
    if (!down || !up) continue;
    holes[holeId] = {
      downRef: down,
      upRef: up,
      weights: { ...PRESS_LIFT_DEFAULTS.featureWeights },
      thresholds: {
        press: PRESS_LIFT_DEFAULTS.pressThreshold,
        lift: PRESS_LIFT_DEFAULTS.liftThreshold,
      },
      minConfidence: PRESS_LIFT_DEFAULTS.minConfidence,
    };
  }

  return {
    classifier: "press-lift-v1",
    holes,
  };
}

export function classifyFingerPressLift(holeId, features, calibration) {
  const cal = calibration?.holes?.[holeId] ?? calibration?.holes?.default;
  if (!isFeatureVector(features) || !cal) {
    return {
      holeId,
      state: "pending",
      pressProb: 0.5,
      liftProb: 0.5,
      confidence: 0,
      features,
      reasons: ["missing-calibration"],
    };
  }

  let weightedEvidence = 0;
  let totalWeight = 0;
  const weights = cal.weights ?? PRESS_LIFT_DEFAULTS.featureWeights;
  const reasons = [];

  for (const [key, weight] of Object.entries(weights)) {
    const down = cal.downRef?.[key];
    const up = cal.upRef?.[key];
    const value = features[key];
    if (!Number.isFinite(down) || !Number.isFinite(up) || !Number.isFinite(value)) continue;
    weightedEvidence += normalizedEvidence(value, down, up) * weight;
    totalWeight += weight;
  }

  const pressProb = totalWeight > 0 ? clamp(weightedEvidence / totalWeight) : 0.5;
  const liftProb = clamp(1 - pressProb);
  const visibility = clamp(features.fingerVisibility ?? 1);
  const palmFacing = clamp(features.palmFacingCamera ?? 1);
  const boundaryConfidence = Math.abs(pressProb - 0.5) * 2;
  const confidence = clamp(boundaryConfidence * visibility * (0.65 + 0.35 * palmFacing));
  const minConfidence = cal.minConfidence ?? PRESS_LIFT_DEFAULTS.minConfidence;
  const pressThreshold = cal.thresholds?.press ?? PRESS_LIFT_DEFAULTS.pressThreshold;
  const liftThreshold = cal.thresholds?.lift ?? PRESS_LIFT_DEFAULTS.liftThreshold;
  let state = "pending";

  if (visibility < minConfidence) reasons.push("low-visibility");
  if (pressProb >= pressThreshold && confidence >= minConfidence) {
    state = "press";
    reasons.push("press-evidence");
  } else if (pressProb <= liftThreshold && confidence >= minConfidence) {
    state = "lift";
    reasons.push("lift-evidence");
  } else {
    reasons.push("ambiguous-probability");
  }

  return {
    holeId,
    state,
    pressProb,
    liftProb,
    confidence,
    features,
    reasons,
  };
}

export function classifyPressLiftFrame(frameFeatures = {}, calibration) {
  return Object.fromEntries(
    DETECTABLE_HOLES.map((holeId) => [holeId, classifyFingerPressLift(holeId, frameFeatures[holeId], calibration)]),
  );
}
