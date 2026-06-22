import { DETECTABLE_HOLES, HOLES_12 } from "./ocarinaData.js";

const COLORS = {
  left: "#E0407B",
  right: "#37474F",
  open: "#FFFFFF",
  stroke: "#B0A89B",
  ok: "#168A53",
  wrong: "#C83B3B",
  pending: "#8A8378",
  woodA: "#E7A877",
  woodB: "#C97B4A",
};

function isLeftHole(holeId) {
  return holeId.startsWith("L");
}

function baseFill(holeId, value) {
  if (value === 0) return COLORS.open;
  return isLeftHole(holeId) ? COLORS.left : COLORS.right;
}

function statusStroke(status) {
  if (status === "ok") return COLORS.ok;
  if (status === "close" || status === "open") return COLORS.wrong;
  if (status === "pending") return COLORS.pending;
  return "rgba(0,0,0,0.18)";
}

function holeSvg(hole, note, current, diff) {
  const target = note?.holes?.[hole.id] ?? 0;
  const status = diff?.[hole.id] ?? (DETECTABLE_HOLES.includes(hole.id) ? "pending" : "");
  const currentValue = current?.[hole.id];
  const inactive = !hole.detectable ? 0.45 : 1;
  const stroke = statusStroke(status);
  const strokeWidth = hole.detectable ? 7 : 2;
  const base = `<circle cx="${hole.cx}" cy="${hole.cy}" r="${hole.r}" fill="${baseFill(hole.id, target)}" stroke="${target === 0 ? COLORS.stroke : "#00000022"}" stroke-width="${target === 0 ? 2 : 1}" opacity="${inactive}"/>`;
  const overlay =
    hole.detectable && (currentValue === 0 || currentValue === 1)
      ? `<circle cx="${hole.cx}" cy="${hole.cy}" r="${hole.r + 7}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="0.9"/>`
      : "";
  const half = target === 0.5 ? `<text x="${hole.cx}" y="${hole.cy + 6}" text-anchor="middle" font-size="${hole.r}" font-weight="800" fill="#2B2B2B">½</text>` : "";
  const stateLabel =
    hole.detectable && (currentValue === 0 || currentValue === 1)
      ? `<text x="${hole.cx}" y="${hole.cy + hole.r + 28}" text-anchor="middle" font-size="26" font-weight="800" fill="${stroke}">${currentValue ? "●" : "○"}</text>`
      : "";
  return `${base}${overlay}${half}${stateLabel}`;
}

function shellSvg(side, inner) {
  const frontPath =
    "M 150 120 C 150 70 250 56 350 60 C 470 64 600 92 720 130 C 800 156 858 196 862 232 C 862 256 828 270 770 274 C 660 282 520 288 410 296 C 320 302 250 300 206 296 L 196 330 C 194 360 150 364 132 352 C 116 340 116 300 138 286 C 150 278 156 250 150 224 C 132 200 120 160 150 120 Z";
  const backPath =
    "M 750 120 C 750 70 650 56 550 60 C 430 64 300 92 180 130 C 100 156 42 196 38 232 C 38 256 72 270 130 274 C 240 282 380 288 490 296 C 580 302 650 300 694 296 L 704 330 C 706 360 750 364 768 352 C 784 340 784 300 762 286 C 750 278 744 250 750 224 C 768 200 780 160 750 120 Z";
  const path = side === "front" ? frontPath : backPath;
  const shineX = side === "front" ? 330 : 560;
  const windway = side === "back" ? `<ellipse cx="660" cy="268" rx="26" ry="12" fill="#E9E7E0" stroke="#6B7A66" stroke-width="2.5"/>` : "";

  return `<svg viewBox="0 0 900 470" role="img" aria-label="${side === "front" ? "앞면 운지" : "뒷면 운지"}">
    <defs>
      <linearGradient id="wood-${side}" x1="0" y1="0" x2="0.15" y2="1">
        <stop offset="0" stop-color="${COLORS.woodA}"/>
        <stop offset="1" stop-color="${COLORS.woodB}"/>
      </linearGradient>
    </defs>
    <path d="${path}" fill="url(#wood-${side})" stroke="#A2592E" stroke-width="3.5" stroke-linejoin="round"/>
    <ellipse cx="${shineX}" cy="120" rx="180" ry="34" fill="#FFFFFF" opacity="0.14"/>
    ${windway}
    ${inner}
  </svg>`;
}

export function breathGauge(note) {
  const breath = note?.breath ?? 0;
  return Array.from({ length: 5 }, (_, index) => {
    const filled = index < breath;
    return `<span class="breath-cell ${filled ? "is-filled" : ""}" aria-hidden="true"></span>`;
  }).join("");
}

export function renderDiagram(container, note, current = {}, diff = {}) {
  if (!container || !note) return;
  const front = HOLES_12.filter((hole) => hole.side === "front")
    .map((hole) => holeSvg(hole, note, current, diff))
    .join("");
  const back = HOLES_12.filter((hole) => hole.side === "back")
    .map((hole) => holeSvg(hole, note, current, diff))
    .join("");

  container.innerHTML = `
    <div class="diagram-heading">
      <div>
        <strong>${note.label}</strong>
        <span>${note.pitch} · MIDI ${note.midi}</span>
      </div>
      <div class="breath-gauge" aria-label="입김 세기 ${note.breath} / 5">${breathGauge(note)}</div>
    </div>
    <div class="diagram-grid">
      <section>
        <h3>앞면</h3>
        ${shellSvg("front", front)}
      </section>
      <section>
        <h3>뒷면</h3>
        ${shellSvg("back", back)}
      </section>
    </div>
    <p class="note-tip">${note.tip}</p>
  `;
}
