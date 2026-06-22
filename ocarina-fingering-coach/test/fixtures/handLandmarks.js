const FINGER_POINTS = {
  2: [5, 6, 7, 8],
  3: [9, 10, 11, 12],
  4: [13, 14, 15, 16],
  5: [17, 18, 19, 20],
};

function point(x, y, z = 0) {
  return { x, y, z };
}

export function makeOpenHandLandmarks({ x = 0.5, y = 0.52, scale = 0.22 } = {}) {
  const landmarks = Array.from({ length: 21 }, () => point(x, y, 0));
  landmarks[0] = point(x, y + scale * 0.95, 0.02);
  landmarks[1] = point(x - scale * 0.46, y + scale * 0.45, 0);
  landmarks[2] = point(x - scale * 0.64, y + scale * 0.24, 0);
  landmarks[3] = point(x - scale * 0.72, y + scale * 0.02, 0);
  landmarks[4] = point(x - scale * 0.78, y - scale * 0.2, 0);

  const fingers = [
    { finger: 2, baseX: x - scale * 0.48, length: 1.1 },
    { finger: 3, baseX: x - scale * 0.16, length: 1.28 },
    { finger: 4, baseX: x + scale * 0.16, length: 1.18 },
    { finger: 5, baseX: x + scale * 0.46, length: 0.96 },
  ];

  for (const { finger, baseX, length } of fingers) {
    const [mcp, pip, dip, tip] = FINGER_POINTS[finger];
    landmarks[mcp] = point(baseX, y, 0);
    landmarks[pip] = point(baseX, y - scale * 0.34 * length, -0.01);
    landmarks[dip] = point(baseX, y - scale * 0.62 * length, -0.015);
    landmarks[tip] = point(baseX, y - scale * 0.9 * length, -0.02);
  }

  return landmarks;
}

export function makePressedFingerLandmarks(base, fingerNumber) {
  const landmarks = base.map((landmark) => ({ ...landmark }));
  const [mcp, pip, dip, tip] = FINGER_POINTS[fingerNumber];
  const scale = Math.max(Math.hypot(base[5].x - base[17].x, base[5].y - base[17].y), 0.001);
  const side = fingerNumber < 4 ? -1 : 1;
  landmarks[pip] = point(base[mcp].x + side * scale * 0.03, base[mcp].y - scale * 0.21, 0.01);
  landmarks[dip] = point(base[mcp].x + side * scale * 0.11, base[mcp].y - scale * 0.05, 0.015);
  landmarks[tip] = point(base[mcp].x + side * scale * 0.16, base[mcp].y + scale * 0.1, 0.02);
  return landmarks;
}

export function makeLiftedFingerLandmarks(base, fingerNumber) {
  return base.map((landmark) => ({ ...landmark }));
}

export function hideFingerTip(base, fingerNumber) {
  const landmarks = base.map((landmark) => ({ ...landmark }));
  const tip = FINGER_POINTS[fingerNumber][3];
  landmarks[tip] = {
    x: (base[0].x + base[9].x) / 2,
    y: (base[0].y + base[9].y) / 2,
    z: 0.18,
  };
  return landmarks;
}

export function moveHandOutOfFrame(base) {
  return base.map((landmark) => ({
    x: landmark.x - 0.28,
    y: landmark.y,
    z: landmark.z,
  }));
}

export function makeResults(hands = []) {
  return {
    landmarks: hands.map((hand) => hand.landmarks ?? hand),
    handednesses: hands.map((hand, index) => [
      { categoryName: hand.handedness ?? (index === 0 ? "Left" : "Right"), score: 0.98 },
    ]),
  };
}

export function jitterSequence(frames, holeId, pattern) {
  return Array.from({ length: frames }, (_, index) => ({
    holeId,
    state: pattern[index % pattern.length],
  }));
}
