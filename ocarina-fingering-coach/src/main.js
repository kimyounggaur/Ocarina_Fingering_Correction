import {
  buildFeedback,
  createHoldProgress,
  diffHoles,
  isAllOk,
} from "./compare.js";
import {
  clearCalibration,
  createCalibrationWorkflow,
  isCalibrationReady,
  loadCalibration,
  saveCalibration,
} from "./calibration.js";
import {
  createFingerSmoother,
  classifyFeatures,
  extractFeaturesFromResults,
  handsVisibleCount,
  stateConfidence,
} from "./fingerState.js";
import { detectHands, createHandLandmarker, drawHandOverlay, startCamera, syncCanvasToVideo } from "./handTracking.js";
import { renderDiagram } from "./diagram.js";
import { DETECTABLE_HOLES, MVP_NOTES, getNote } from "./ocarinaData.js";
import {
  populateNoteButtons,
  populateTypeSelect,
  qs,
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
  smoother: createFingerSmoother(),
  hold: createHoldProgress(1500),
  typeId: "hole12",
  noteId: "do",
  currentState: {},
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
  if (phase === "down") return "① 모두 막은 모양을 유지하세요";
  if (phase === "up") return "② 모두 편 모양을 유지하세요";
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
  const feedback = isCalibrationReady(app.calibration, DETECTABLE_HOLES)
    ? buildFeedback(note, app.currentState)
    : { status: "idle", messages: ["캘리브레이션을 먼저 진행하세요", "① 막은 모양 2초, ② 편 모양 2초를 저장합니다"] };

  renderDiagram(els.diagram, note, app.currentState, diff);
  renderFingerState(els.fingerState, app.currentState);
  renderFeedback(els.feedback, feedback.messages, feedback.status);
  setText(els.calibrationStatus, calibrationText());
  setText(els.trackingStatus, results ? `감지된 손 ${handsVisibleCount(results)}개 · 신뢰도 ${Math.round(stateConfidence(app.currentState) * 100)}%` : "손 추적 대기");

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
    const features = extractFeaturesFromResults(results);
    handleCalibration(features);
    const rawState = classifyFeatures(features, app.calibration, app.currentState);
    app.currentState = mergeThumbState(app.smoother.update(rawState));
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
    renderAppFrame();
  });
  els.nextButton.addEventListener("click", selectNextNote);

  renderAppFrame();
}

boot();
