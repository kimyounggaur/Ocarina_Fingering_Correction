import { DETECTABLE_HOLES } from "./ocarinaData.js";

export const FINGER_LANDMARKS = {
  2: { mcp: 5, pip: 6, dip: 7, tip: 8 },
  3: { mcp: 9, pip: 10, dip: 11, tip: 12 },
  4: { mcp: 13, pip: 14, dip: 15, tip: 16 },
  5: { mcp: 17, pip: 18, dip: 19, tip: 20 },
};

const HAND_TO_PREFIX = {
  Left: "L",
  Right: "R",
};

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function pointOrZero(point) {
  return {
    x: Number.isFinite(point?.x) ? point.x : 0,
    y: Number.isFinite(point?.y) ? point.y : 0,
    z: Number.isFinite(point?.z) ? point.z : 0,
  };
}

function sub(a, b) {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
    z: (a.z ?? 0) - (b.z ?? 0),
  };
}

function add(a, b) {
  return {
    x: a.x + b.x,
    y: a.y + b.y,
    z: (a.z ?? 0) + (b.z ?? 0),
  };
}

function scale(v, factor) {
  return {
    x: v.x * factor,
    y: v.y * factor,
    z: (v.z ?? 0) * factor,
  };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + (a.z ?? 0) * (b.z ?? 0);
}

function cross(a, b) {
  return {
    x: a.y * (b.z ?? 0) - (a.z ?? 0) * b.y,
    y: (a.z ?? 0) * b.x - a.x * (b.z ?? 0),
    z: a.x * b.y - a.y * b.x,
  };
}

function magnitude(v) {
  return Math.hypot(v.x, v.y, v.z ?? 0);
}

function normalize(v, fallback = { x: 0, y: -1, z: 0 }) {
  const length = magnitude(v);
  return length > 0.000001 ? scale(v, 1 / length) : fallback;
}

function distance(a, b) {
  return magnitude(sub(a, b));
}

function angleBetween(a, b) {
  const denom = magnitude(a) * magnitude(b);
  if (denom <= 0.000001) return 0;
  return Math.acos(clamp(dot(a, b) / denom, -1, 1));
}

function average(points) {
  return scale(points.map(pointOrZero).reduce((sum, point) => add(sum, point), { x: 0, y: 0, z: 0 }), 1 / points.length);
}

function handednessName(results, index) {
  const handednesses = results?.handednesses ?? results?.handedness ?? [];
  return handednesses[index]?.[0]?.categoryName ?? handednesses[index]?.categories?.[0]?.categoryName;
}

export function extractHandGeometry(landmarks = []) {
  const wrist = pointOrZero(landmarks[0]);
  const indexMcp = pointOrZero(landmarks[5]);
  const middleMcp = pointOrZero(landmarks[9]);
  const ringMcp = pointOrZero(landmarks[13]);
  const pinkyMcp = pointOrZero(landmarks[17]);
  const palmCenter = average([indexMcp, middleMcp, ringMcp, pinkyMcp]);
  const palmXAxis = normalize(sub(pinkyMcp, indexMcp), { x: 1, y: 0, z: 0 });
  const palmYAxis = normalize(sub(middleMcp, wrist), { x: 0, y: -1, z: 0 });
  const palmNormal = normalize(cross(palmXAxis, palmYAxis), { x: 0, y: 0, z: 1 });
  const handScale = Math.max(distance(indexMcp, pinkyMcp), distance(wrist, middleMcp), 0.001);
  const palmFacingCamera = clamp(Math.abs(palmNormal.z));

  return {
    wrist,
    indexMcp,
    middleMcp,
    ringMcp,
    pinkyMcp,
    palmCenter,
    handScale,
    palmNormal,
    palmXAxis,
    palmYAxis,
    palmFacingCamera,
  };
}

export function estimatePalmFacingCamera(landmarks) {
  return extractHandGeometry(landmarks).palmFacingCamera;
}

export function estimateFingerVisibility(landmarks = [], fingerNumber) {
  const indices = FINGER_LANDMARKS[fingerNumber];
  if (!indices) return 0;

  const geometry = extractHandGeometry(landmarks);
  const tip = pointOrZero(landmarks[indices.tip]);
  const inFrame = tip.x >= 0 && tip.x <= 1 && tip.y >= 0 && tip.y <= 1;
  if (!inFrame) return 0;

  const tipPalmDistance = distance(tip, geometry.palmCenter) / geometry.handScale;
  const separationScore = clamp((tipPalmDistance - 0.35) / 0.5);
  const zPenalty = clamp(1 - (Math.abs(tip.z ?? 0) - 0.05) / 0.18);
  const visibleWhenNotOccluded = zPenalty > 0.65 ? Math.max(separationScore, 0.68) : separationScore;
  return clamp(Math.min(visibleWhenNotOccluded, zPenalty));
}

export function extractFingerFeatures(landmarks = [], fingerNumber) {
  const indices = FINGER_LANDMARKS[fingerNumber];
  if (!indices) return null;

  const geometry = extractHandGeometry(landmarks);
  const mcp = pointOrZero(landmarks[indices.mcp]);
  const pip = pointOrZero(landmarks[indices.pip]);
  const dip = pointOrZero(landmarks[indices.dip]);
  const tip = pointOrZero(landmarks[indices.tip]);
  const mcpToPip = sub(pip, mcp);
  const pipToDip = sub(dip, pip);
  const dipToTip = sub(tip, dip);
  const mcpToTip = sub(tip, mcp);
  const tipFromPalm = sub(tip, geometry.palmCenter);
  const pipCurl = angleBetween(mcpToPip, pipToDip);
  const dipCurl = angleBetween(pipToDip, dipToTip);
  const tipPalmDistance = dot(tipFromPalm, geometry.palmYAxis) / geometry.handScale;
  const tipLiftAxis = dot(mcpToTip, geometry.palmYAxis) / geometry.handScale;
  const tipMcpDistance = distance(tip, mcp) / geometry.handScale;

  return {
    pipCurl,
    dipCurl,
    totalCurl: pipCurl + dipCurl,
    tipPalmDistance,
    tipMcpDistance,
    tipLiftAxis,
    mcpToTipLength: magnitude(mcpToTip) / geometry.handScale,
    fingerVisibility: estimateFingerVisibility(landmarks, fingerNumber),
    handScale: geometry.handScale,
    palmFacingCamera: geometry.palmFacingCamera,
  };
}

export function extractAllFingerFeatures(results) {
  const features = {};
  const landmarksList = results?.landmarks ?? [];

  landmarksList.forEach((landmarks, index) => {
    const prefix = HAND_TO_PREFIX[handednessName(results, index)];
    if (!prefix) return;

    for (const fingerNumber of [2, 3, 4, 5]) {
      const holeId = `${prefix}${fingerNumber}`;
      if (!DETECTABLE_HOLES.includes(holeId)) continue;
      features[holeId] = extractFingerFeatures(landmarks, fingerNumber);
    }
  });

  return features;
}
