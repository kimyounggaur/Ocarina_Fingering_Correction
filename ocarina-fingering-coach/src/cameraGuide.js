import {
  estimateFingerVisibility,
  extractHandGeometry,
} from "./landmarkFeatureExtractor.js";

export const CAMERA_GUIDE_DEFAULTS = {
  minHandScale: 0.16,
  goodHandScale: 0.28,
  minPalmFacing: 0.35,
  goodPalmFacing: 0.65,
  minFingerVisibility: 0.45,
  goodFingerVisibility: 0.72,
  minScore: 0.78,
};

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function average(values, fallback = 0) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : fallback;
}

function boundingBox(landmarksList) {
  const points = landmarksList.flat();
  if (points.length === 0) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    cx: (Math.min(...xs) + Math.max(...xs)) / 2,
    cy: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}

function handScaleScore(value) {
  return clamp((value - CAMERA_GUIDE_DEFAULTS.minHandScale) / (CAMERA_GUIDE_DEFAULTS.goodHandScale - CAMERA_GUIDE_DEFAULTS.minHandScale));
}

function palmFacingScore(value) {
  return clamp((value - CAMERA_GUIDE_DEFAULTS.minPalmFacing) / (CAMERA_GUIDE_DEFAULTS.goodPalmFacing - CAMERA_GUIDE_DEFAULTS.minPalmFacing));
}

function fingerVisibilityScore(value) {
  return clamp((value - CAMERA_GUIDE_DEFAULTS.minFingerVisibility) / (CAMERA_GUIDE_DEFAULTS.goodFingerVisibility - CAMERA_GUIDE_DEFAULTS.minFingerVisibility));
}

function centerednessScore(box) {
  if (!box) return 0;
  const distanceFromCenter = Math.hypot(box.cx - 0.5, box.cy - 0.5);
  return clamp(1 - distanceFromCenter / 0.45);
}

function buildMessages(metrics, level) {
  const messages = [];
  if (metrics.handsVisible < 2) messages.push("양손을 모두 보여주세요");
  if (metrics.handScale < CAMERA_GUIDE_DEFAULTS.minHandScale) messages.push("손을 화면 중앙에 더 크게 보여주세요");
  if (metrics.centeredness < 0.72) messages.push("손을 화면 중앙으로 옮겨주세요");
  if (metrics.fingerTipVisibility < CAMERA_GUIDE_DEFAULTS.minFingerVisibility) {
    messages.push("손가락 끝이 보이도록 손바닥을 카메라 쪽으로 조금 돌려주세요");
  }
  if (metrics.palmFacingCamera < CAMERA_GUIDE_DEFAULTS.minPalmFacing) {
    messages.push("손가락 면이 보이도록 손바닥을 카메라 쪽으로 조금 돌려주세요");
  }
  if (metrics.motionStability < 0.55) messages.push("손이 너무 흔들려요. 1초만 자세를 고정해 주세요");
  if (messages.length === 0 && level === "warn") messages.push("손가락 끝이 더 잘 보이도록 자세를 조금만 조정해 주세요");
  return messages;
}

export function evaluateCameraPlacement(results, videoSize = {}) {
  const landmarksList = results?.landmarks ?? [];
  const handsVisible = landmarksList.length;
  const box = boundingBox(landmarksList);
  const geometries = landmarksList.map(extractHandGeometry);
  const handScale = average(geometries.map((geometry) => geometry.handScale));
  const palmFacingCamera = average(geometries.map((geometry) => geometry.palmFacingCamera), 1);
  const fingerVisibilities = landmarksList.flatMap((landmarks) => [2, 3, 4, 5].map((finger) => estimateFingerVisibility(landmarks, finger)));
  const fingerTipVisibility = fingerVisibilities.length ? Math.min(...fingerVisibilities) : 0;
  const centeredness = centerednessScore(box);
  const motionStability = clamp(results?.motionStability ?? 1);
  const handsVisibleScore = clamp(handsVisible / 2);
  const leftRightSeparation = box ? clamp((box.maxX - box.minX) / 0.55) : 0;
  const score =
    0.2 * handsVisibleScore +
    0.18 * handScaleScore(handScale) +
    0.16 * centeredness +
    0.18 * fingerVisibilityScore(fingerTipVisibility) +
    0.16 * palmFacingScore(palmFacingCamera) +
    0.12 * motionStability;

  const tooCloseToEdge = box ? box.minX < 0.08 || box.maxX > 0.92 || box.minY < 0.04 || box.maxY > 0.96 : false;
  const isBlock =
    handsVisible < 2 ||
    handScale < CAMERA_GUIDE_DEFAULTS.minHandScale ||
    fingerTipVisibility < CAMERA_GUIDE_DEFAULTS.minFingerVisibility ||
    palmFacingCamera < CAMERA_GUIDE_DEFAULTS.minPalmFacing;
  const isWarn = !isBlock && (score < CAMERA_GUIDE_DEFAULTS.minScore || tooCloseToEdge || leftRightSeparation < 0.55);
  const level = isBlock ? "block" : isWarn ? "warn" : "ok";
  const metrics = {
    handsVisible,
    handScale,
    centeredness,
    fingerTipVisibility,
    palmFacingCamera,
    leftRightSeparation,
    motionStability,
    videoWidth: videoSize.width,
    videoHeight: videoSize.height,
  };

  return {
    ok: level === "ok",
    score,
    level,
    messages: buildMessages(metrics, level),
    metrics,
  };
}

export function buildCameraGuideMessages(evaluation) {
  return evaluation?.messages?.length ? evaluation.messages : ["카메라 배치가 안정적입니다"];
}

export function shouldBlockClassification(evaluation) {
  return evaluation?.level === "block";
}
