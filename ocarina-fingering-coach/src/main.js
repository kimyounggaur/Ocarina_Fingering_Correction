import {
  buildFeedback,
  createHoldProgress,
  diffHoles,
  isAllOk,
} from "./compare.js";
import {
  buildCameraGuideMessages,
  evaluateCameraPlacement,
  shouldBlockClassification,
} from "./cameraGuide.js";
import {
  clearCalibration,
  createCalibrationWorkflow,
  isCalibrationReady,
  loadCalibration,
  saveCalibration,
} from "./calibration.js";
import {
  handsVisibleCount,
  stateConfidence,
} from "./fingerState.js";
import { applyFingeringPrior } from "./fingeringPrior.js";
import { detectHands, createHandLandmarker, drawHandOverlay, startCamera, syncCanvasToVideo } from "./handTracking.js";
import { renderDiagram } from "./diagram.js";
import { extractAllFingerFeatures } from "./landmarkFeatureExtractor.js";
import { DETECTABLE_HOLES, MVP_NOTES, getNote } from "./ocarinaData.js";
import { classifyPressLiftFrame } from "./pressLiftClassifier.js";
import { createTemporalSmoother } from "./temporalSmoothing.js";
import {
  populateNoteButtons,
  populateTypeSelect,
  qs,
  renderCameraGuide,
  renderDiagnosticsPanel,
  renderFeedback,
  renderFingerState,
  setProgress,
  setText,
  setupThumbToggles,
  speak,
} from "./ui.js";

const els = {
  video: qs("#camera"),
  canvas: qs("#overlay"),
  cameraButton: qs("#cameraButton"),
  calibrationButton: qs("#calibrationButton"),
  clearCalibrationButton: qs("#clearCalibrationButton"),
  typeSelect: qs("#typeSelect"),
  noteButtons: qs("#noteButtons"),
  diagram: qs("#diagram"),
  feedback: qs("#feedback"),
  fingerState: qs("#fingerState"),
  cameraStatus: qs("#cameraStatus"),
  trackingStatus: qs("#trackingStatus"),
  calibrationStatus: qs("#calibrationStatus"),
  progress: qs("#holdProgress"),
  cameraGuide: qs("#cameraGuidePanel"),
  diagnosticsToggle: qs("#diagnosticsToggle"),
  diagnosticsPanel: qs("#diagnosticsPanel"),
  nextButton: qs("#nextButton"),
  autoNext: qs("#autoNext"),
  voiceToggle: qs("#voiceToggle"),
  thumbRoot: qs("#thumbControls"),
};

const app = {
  stream: null,
  landmarker: null,
  calibration: loadCalibration(),
  calibrationFlow: createCalibrationWorkflow({ durationMs: 2000 }),
  smoother: createTemporalSmoother(),
  hold: createHoldProgress(1500),
  typeId: "hole12",
  noteId: "do",
  currentState: {},
  previousState: {},
  stateDiagnostics: {},
  cameraGuide: null,
  diagnosticsVisible: false,
  thumbState: { L1: 1, R1: 1, thumbSource: "manual" },
  lastSpoken: "",
  lastPassNoteId: null,
};

function currentNote() {
  return getNote(app.typeId, app.noteId) ?? getNote("hole12", "do");
}

function selectNote(noteId) {
  app.noteId = noteId;
  app.lastPassNoteId = null;
  app.hold.reset();
  populateNoteButtons(els.noteButtons, app.noteId, selectNote);
  renderAppFrame();
}

function selectNextNote() {
  const index = MVP_NOTES.indexOf(app.noteId);
  const nextId = MVP_NOTES[(Math.max(index, 0) + 1) % MVP_NOTES.length];
  selectNote(nextId);
}

function calibrationText() {
  if (isCalibrationReady(app.calibration, DETECTABLE_HOLES)) return "캘리브레이션 완료";
  const phase = app.calibrationFlow.getPhase();
  if (phase === "down") return "① 여덟 손가락을 모두 막은 자세를 유지하세요";
  if (phase === "up") return "② 여덟 손가락을 모두 편 자세를 유지하세요";
  return "캘리브레이션 필요";
}

async function start() {
  try {
    setText(els.cameraStatus, "카메라 요청 중");
    app.stream = await startCamera(els.video);
    syncCanvasToVideo(els.video, els.canvas);
    els.video.closest(".video-stage")?.classList.add("is-live");
    setText(els.cameraStatus, "카메라 연결됨");

    setText(els.trackingStatus, "MediaPipe 로딩 중");
    app.landmarker = await createHandLandmarker();
    setText(els.trackingStatus, "손 추적 준비됨");
    requestAnimationFrame(loop);
  } catch (error) {
    setText(els.cameraStatus, error.message);
    renderFeedback(els.feedback, ["카메라 권한을 허용하고 다시 시도하세요"], "error");
  }
}

function handleCalibration(features) {
  const phase = app.calibrationFlow.getPhase();
  if (phase === "idle") return;
  if (shouldBlockClassification(app.cameraGuide)) {
    renderFeedback(els.feedback, buildCameraGuideMessages(app.cameraGuide), "error");
    return;
  }

  const progress = app.calibrationFlow.addSample(features);
  setProgress(els.progress, progress.ratio);
  if (progress.done) {
    app.calibration = progress.calibration;
    saveCalibration(app.calibration);
    app.smoother.reset();
    setProgress(els.progress, 0);
    renderFeedback(els.feedback, ["캘리브레이션이 저장되었습니다", "이제 선택한 음과 손 상태를 비교합니다"], "hold");
  }
}

function mergeThumbState(state) {
  return {
    ...state,
    L1: app.thumbState.L1,
    R1: app.thumbState.R1,
    thumbSource: "manual",
  };
}

function renderAppFrame(results = null) {
  const note = currentNote();
  const diff = diffHoles(note.detectable, app.currentState);
  let feedback;
  if (shouldBlockClassification(app.cameraGuide)) {
    feedback = { status: "error", messages: buildCameraGuideMessages(app.cameraGuide) };
  } else if (isCalibrationReady(app.calibration, DETECTABLE_HOLES)) {
    feedback = buildFeedback(note, app.currentState, app.stateDiagnostics);
  } else {
    feedback = { status: "idle", messages: ["캘리브레이션을 먼저 진행하세요", "① 막은 자세 2초, ② 편 자세 2초를 저장합니다"] };
  }

  renderDiagram(els.diagram, note, app.currentState, diff, app.stateDiagnostics);
  renderFingerState(els.fingerState, app.currentState, app.stateDiagnostics);
  renderCameraGuide(els.cameraGuide, app.cameraGuide);
  renderDiagnosticsPanel(els.diagnosticsPanel, app.stateDiagnostics, app.diagnosticsVisible);
  renderFeedback(els.feedback, feedback.messages, feedback.status);
  setText(els.calibrationStatus, calibrationText());
  const cameraScore = app.cameraGuide ? ` · 배치 ${Math.round(app.cameraGuide.score * 100)}%` : "";
  setText(els.trackingStatus, results ? `감지된 손 ${handsVisibleCount(results)}개 · 신뢰도 ${Math.round(stateConfidence(app.currentState) * 100)}%${cameraScore}` : "손 추적 대기");

  const firstMessage = feedback.messages[0];
  if (firstMessage && firstMessage !== app.lastSpoken) {
    speak(firstMessage, els.voiceToggle.checked);
    app.lastSpoken = firstMessage;
  }
}

function handleHold(note, diff) {
  const ready = isCalibrationReady(app.calibration, DETECTABLE_HOLES);
  const hold = app.hold.update(ready && isAllOk(diff));
  setProgress(els.progress, hold.ratio);

  if (hold.passed && app.lastPassNoteId !== note.id) {
    app.lastPassNoteId = note.id;
    renderFeedback(els.feedback, ["정답!", "다음 음으로 넘어갈 수 있습니다"], "pass");
    if (els.autoNext.checked) {
      setTimeout(selectNextNote, 700);
    }
  }
}

function loop() {
  syncCanvasToVideo(els.video, els.canvas);
  const results = detectHands(app.landmarker, els.video);
  if (results) {
    drawHandOverlay(els.canvas, results);
    app.cameraGuide = evaluateCameraPlacement(results, { width: els.canvas.width, height: els.canvas.height });
    const frameFeatures = extractAllFingerFeatures(results);
    handleCalibration(frameFeatures);

    if (isCalibrationReady(app.calibration, DETECTABLE_HOLES) && !shouldBlockClassification(app.cameraGuide)) {
      const observations = classifyPressLiftFrame(frameFeatures, app.calibration);
      const smoothed = app.smoother.update(observations, performance.now(), app.cameraGuide);
      const priorAdjusted = applyFingeringPrior({
        note: currentNote(),
        observations: smoothed,
        stableState: smoothed.holes,
        previousState: app.previousState,
      });
      app.previousState = app.currentState;
      app.currentState = mergeThumbState(priorAdjusted.holes);
      app.stateDiagnostics = priorAdjusted.diagnostics;
    }
  }

  const note = currentNote();
  const diff = diffHoles(note.detectable, app.currentState);
  handleHold(note, diff);
  renderAppFrame(results);
  requestAnimationFrame(loop);
}

function boot() {
  populateTypeSelect(els.typeSelect);
  populateNoteButtons(els.noteButtons, app.noteId, selectNote);
  setupThumbToggles(els.thumbRoot, (thumbState) => {
    app.thumbState = thumbState;
    app.currentState = mergeThumbState(app.currentState);
    renderAppFrame();
  });

  els.cameraButton.addEventListener("click", start);
  els.typeSelect.addEventListener("change", () => {
    app.typeId = els.typeSelect.value;
    renderAppFrame();
  });
  els.calibrationButton.addEventListener("click", () => {
    app.calibrationFlow.start();
    app.smoother.reset();
    renderFeedback(els.feedback, ["캘리브레이션 시작", "여덟 손가락을 모두 구부려 막은 모양을 보여주세요"], "idle");
  });
  els.clearCalibrationButton.addEventListener("click", () => {
    clearCalibration();
    app.calibration = null;
    app.smoother.reset();
    app.stateDiagnostics = {};
    renderAppFrame();
  });
  els.diagnosticsToggle.addEventListener("click", () => {
    app.diagnosticsVisible = !app.diagnosticsVisible;
    els.diagnosticsToggle.classList.toggle("is-on", app.diagnosticsVisible);
    els.diagnosticsToggle.setAttribute("aria-pressed", String(app.diagnosticsVisible));
    renderAppFrame();
  });
  els.nextButton.addEventListener("click", selectNextNote);

  renderAppFrame();
}

boot();
