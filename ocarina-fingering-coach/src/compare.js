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

export const FINGER_LABELS_KO = {
  L2: "왼손 검지",
  L3: "왼손 중지",
  L4: "왼손 약지",
  L5: "왼손 새끼",
  R2: "오른손 검지",
  R3: "오른손 중지",
  R4: "오른손 약지",
  R5: "오른손 새끼",
};

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

const FINGER_PRIORITY = new Map(DETECTABLE_HOLES.map((holeId, index) => [holeId, index]));

export function diffHoles(target, current) {
  return Object.fromEntries(
    DETECTABLE_HOLES.map((holeId) => {
      const targetValue = target?.[holeId];
      const currentValue = current?.[holeId];
      if (targetValue !== 0 && targetValue !== 1) return [holeId, "pending"];
      if (currentValue !== 0 && currentValue !== 1) return [holeId, "pending"];
      if (targetValue === currentValue) return [holeId, "ok"];
      return [holeId, targetValue === 1 ? "close" : "open"];
    }),
  );
}

export function summarizeDiff(diff) {
  return Object.entries(diff).map(([holeId, state]) => ({ holeId, state }));
}

export function isAllOk(diff) {
  return Object.values(diff).every((state) => state === "ok");
}

function instructionFor(holeId, state, flags = []) {
  const label = FINGER_LABELS_KO[holeId] ?? holeId;
  const crossNote = flags.includes("교차운지") ? " (교차운지: 가운데 구멍을 띄워요)" : "";
  if (state === "close") return `${label}로 구멍을 막으세요${crossNote}`;
  if (state === "open") return `${label}를 떼세요${crossNote}`;
  return "";
}

function sortFixes(a, b) {
  const stateRank = (state) => (state === "close" ? 0 : state === "open" ? 1 : 2);
  return stateRank(a.state) - stateRank(b.state) || FINGER_PRIORITY.get(a.holeId) - FINGER_PRIORITY.get(b.holeId);
}

function ambiguityMessage(ids = []) {
  const labels = ids.map((id) => NOTE_LABELS_KO[id] ?? id).join(", ");
  return labels ? `※ 이 손모양은 ${labels}과 같게 보여요. 입김이나 엄지구멍으로 구분합니다.` : "";
}

function isLowConfidence(holeId, diagnostics = {}) {
  const diagnostic = diagnostics?.[holeId];
  return (
    diagnostic?.confidence < 0.55 ||
    diagnostic?.stableState === "pending" ||
    diagnostic?.reasons?.some((reason) => reason.includes("visibility") || reason.includes("pending"))
  );
}

function pendingMessageFor(holeId) {
  const label = FINGER_LABELS_KO[holeId] ?? holeId;
  return `판정이 불안정해요: ${label} 손끝이 보이게 조금 더 들어 주세요`;
}

export function breathHint(note) {
  const breath = note?.breath ?? 0;
  const hints = {
    1: "아주 여리게",
    2: "편안하게",
    3: "조금 더 받쳐서",
    4: "강하게",
    5: "가장 빠르고 강하게",
  };
  return `입김 ${breath}/5 - ${hints[breath] ?? "선택한 음에 맞게"}`;
}

export function buildFeedback(note, current, diagnostics = {}) {
  const diff = diffHoles(note.detectable, current);
  if (isAllOk(diff)) {
    return {
      status: "hold",
      diff,
      messages: [
        "정확해요! 자세를 유지하세요",
        breathHint(note),
        ambiguityMessage(note.ambiguousWith),
      ].filter(Boolean),
    };
  }

  const unstableFixes = summarizeDiff(diff)
    .filter(({ holeId, state }) => (state === "close" || state === "open") && isLowConfidence(holeId, diagnostics))
    .sort(sortFixes)
    .slice(0, 2);
  if (unstableFixes.length > 0) {
    return {
      status: "pending",
      diff,
      messages: unstableFixes.map(({ holeId }) => pendingMessageFor(holeId)),
    };
  }

  const fixes = summarizeDiff(diff)
    .filter(({ state }) => state === "close" || state === "open")
    .sort(sortFixes)
    .slice(0, 2);

  const pendingCount = summarizeDiff(diff).filter(({ state }) => state === "pending").length;
  const messages = fixes.map(({ holeId, state }) => instructionFor(holeId, state, note.flags));
  if (messages.length === 0 && pendingCount > 0) {
    messages.push("양손을 화면 안에 크게 보여주세요");
  }

  return {
    status: "fix",
    diff,
    messages,
  };
}

export function createHoldProgress(requiredMs = 1500) {
  let startedAt = null;

  return {
    update(isCorrect, nowMs = performance.now()) {
      if (!isCorrect) {
        startedAt = null;
        return { elapsedMs: 0, ratio: 0, passed: false };
      }
      if (startedAt === null) startedAt = nowMs;
      const elapsedMs = nowMs - startedAt;
      return {
        elapsedMs,
        ratio: Math.min(1, elapsedMs / requiredMs),
        passed: elapsedMs >= requiredMs,
      };
    },
    reset() {
      startedAt = null;
    },
  };
}
