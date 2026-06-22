import { DETECTABLE_HOLES, FINGER_LABELS_KO, MVP_NOTES, NOTES_12, OCARINA_TYPES } from "./ocarinaData.js";

export function qs(selector, root = document) {
  return root.querySelector(selector);
}

export function qsa(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}

export function populateTypeSelect(select) {
  select.innerHTML = Object.values(OCARINA_TYPES)
    .map(
      (type) =>
        `<option value="${type.id}" ${type.status !== "ready" ? "disabled" : ""}>${type.name}${type.status === "ready" ? "" : " · 준비 중"}</option>`,
    )
    .join("");
  select.value = "hole12";
}

export function populateNoteButtons(container, activeId, onSelect) {
  container.innerHTML = NOTES_12.map((note) => {
    const isMvp = MVP_NOTES.includes(note.id);
    const isActive = note.id === activeId;
    const flags = [
      !isMvp ? "입김/엄지 안내" : "",
      note.flags.includes("교차운지") ? "교차운지" : "",
      note.flags.includes("고급") ? "고급" : "",
    ].filter(Boolean);
    return `<button class="note-button ${isActive ? "is-active" : ""} ${isMvp ? "" : "is-limited"}" type="button" data-note-id="${note.id}" title="${flags.join(" · ")}">
      <span>${note.label}</span>
      <small>${note.pitch}</small>
    </button>`;
  }).join("");

  qsa("[data-note-id]", container).forEach((button) => {
    button.addEventListener("click", () => onSelect(button.dataset.noteId));
  });
}

function confidenceLabel(diagnostic) {
  if (!diagnostic || !Number.isFinite(diagnostic.confidence)) return "";
  return `${Math.round(diagnostic.confidence * 100)}%`;
}

function pendingReason(diagnostic) {
  const reasons = diagnostic?.reasons ?? [];
  if (reasons.some((reason) => reason.includes("visibility"))) return "손끝 가림";
  if (reasons.some((reason) => reason.includes("camera"))) return "카메라 배치";
  if (reasons.some((reason) => reason.includes("prior"))) return "문법 보정";
  if (diagnostic?.stableState === "pending") return "판정 보류";
  return "";
}

export function renderFingerState(container, state = {}, diagnostics = {}) {
  container.innerHTML = DETECTABLE_HOLES.map((holeId) => {
    const value = state[holeId];
    const diagnostic = diagnostics[holeId];
    const label = FINGER_LABELS_KO[holeId];
    const display = value === 1 ? "●" : value === 0 ? "○" : "-";
    const statusClass = value === 1 ? "is-closed" : value === 0 ? "is-open" : "is-pending";
    const confidence = confidenceLabel(diagnostic);
    const reason = pendingReason(diagnostic);
    return `<span class="finger-chip ${statusClass}" title="${reason}">
      <b>${label}</b>
      <span>
        <em>${display}</em>
        ${confidence ? `<small>${confidence}</small>` : ""}
      </span>
      ${reason ? `<i>${reason}</i>` : ""}
    </span>`;
  }).join("");
}

export function renderCameraGuide(container, evaluation) {
  if (!container) return;
  if (!evaluation) {
    container.dataset.level = "idle";
    container.innerHTML = "";
    return;
  }

  const messages = evaluation.messages?.length ? evaluation.messages : ["카메라 배치가 안정적입니다"];
  container.dataset.level = evaluation.level;
  container.innerHTML = `
    <strong>카메라 배치 ${Math.round(evaluation.score * 100)}%</strong>
    ${messages.map((message) => `<span>${message}</span>`).join("")}
  `;
}

export function renderDiagnosticsPanel(container, diagnostics = {}, visible = false) {
  if (!container) return;
  container.hidden = !visible;
  if (!visible) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = DETECTABLE_HOLES.map((holeId) => {
    const diagnostic = diagnostics[holeId] ?? {};
    const confidence = Number.isFinite(diagnostic.confidence) ? Math.round(diagnostic.confidence * 100) : 0;
    const pressProb = Number.isFinite(diagnostic.pressProb) ? Math.round(diagnostic.pressProb * 100) : null;
    const reasons = diagnostic.reasons?.length ? diagnostic.reasons.join(", ") : "-";
    return `<section class="diagnostic-item">
      <strong>${holeId} · ${FINGER_LABELS_KO[holeId]}</strong>
      <span>raw: ${diagnostic.rawState ?? "pending"}${pressProb === null ? "" : ` ${pressProb}%`}</span>
      <span>stable: ${diagnostic.stableState ?? "pending"}</span>
      <span>confidence: ${confidence}%</span>
      <span>held: ${Math.round(diagnostic.heldMs ?? 0)}ms</span>
      <span>reasons: ${reasons}</span>
    </section>`;
  }).join("");
}

export function renderFeedback(container, messages = [], status = "idle") {
  const main = messages[0] ?? "카메라를 시작하고 캘리브레이션을 진행하세요";
  const rest = messages.slice(1);
  container.dataset.status = status;
  container.innerHTML = `
    <strong>${main}</strong>
    ${rest.map((message) => `<span>${message}</span>`).join("")}
  `;
}

export function setText(element, text) {
  if (element) element.textContent = text;
}

export function setProgress(element, ratio) {
  if (!element) return;
  element.style.setProperty("--progress", `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`);
}

export function setupThumbToggles(root, onChange) {
  const state = { L1: 1, R1: 1, thumbSource: "manual" };
  const buttons = qsa("[data-thumb]", root);

  function render() {
    for (const button of buttons) {
      const id = button.dataset.thumb;
      button.classList.toggle("is-on", state[id] === 1);
      button.setAttribute("aria-pressed", String(state[id] === 1));
      button.textContent = `${id === "L1" ? "왼엄지" : "오른엄지"} ${state[id] === 1 ? "●" : "○"}`;
    }
    onChange({ ...state });
  }

  for (const button of buttons) {
    button.addEventListener("click", () => {
      const id = button.dataset.thumb;
      state[id] = state[id] === 1 ? 0 : 1;
      render();
    });
  }

  render();
  return state;
}

export function speak(message, enabled) {
  if (!enabled || !message || !("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(message);
  utterance.lang = "ko-KR";
  utterance.rate = 1.05;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}
