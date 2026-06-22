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

export function renderFingerState(container, state = {}) {
  container.innerHTML = DETECTABLE_HOLES.map((holeId) => {
    const value = state[holeId];
    const label = FINGER_LABELS_KO[holeId];
    const display = value === 1 ? "●" : value === 0 ? "○" : "-";
    const statusClass = value === 1 ? "is-closed" : value === 0 ? "is-open" : "is-pending";
    return `<span class="finger-chip ${statusClass}"><b>${label}</b><em>${display}</em></span>`;
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
