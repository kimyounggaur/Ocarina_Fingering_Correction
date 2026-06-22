import { DETECTABLE_HOLES } from "./ocarinaData.js";

export const TEMPORAL_DEFAULTS = {
  alpha: 0.35,
  lowConfidenceAlpha: 0.12,
  pressEnter: 0.66,
  pressExit: 0.48,
  liftEnter: 0.34,
  liftExit: 0.52,
  dwellMs: 120,
  pinkyDwellMs: 180,
  pendingTimeoutMs: 350,
  minConfidence: 0.55,
};

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function optionsWithDefaults(options = {}) {
  return { ...TEMPORAL_DEFAULTS, ...options };
}

function numericFromStable(state) {
  if (state === "press") return 1;
  if (state === "lift") return 0;
  return undefined;
}

function stateFromObservation(observation, pressProb, options) {
  if (observation?.state === "press" || observation?.state === "lift") return observation.state;
  if (pressProb >= options.pressEnter) return "press";
  if (pressProb <= options.liftEnter) return "lift";
  return "pending";
}

function transitionReady(candidateState, emaPressProb, options) {
  if (candidateState === "press") return emaPressProb >= options.pressEnter;
  if (candidateState === "lift") return emaPressProb <= options.liftEnter;
  return true;
}

export function smoothFingerState(previous, observation = {}, nowMs = performance.now(), options = {}) {
  const opts = optionsWithDefaults(options);
  const pressProb = clamp(observation.pressProb ?? (observation.state === "press" ? 1 : observation.state === "lift" ? 0 : 0.5));
  const confidence = clamp(observation.confidence ?? 0);
  const motionStability = clamp(observation.motionStability ?? 1);
  const motionGated = motionStability < 0.5;
  let appliedAlpha = confidence < opts.minConfidence ? opts.lowConfidenceAlpha : opts.alpha;
  if (motionGated) appliedAlpha *= Math.max(0.25, motionStability);

  if (!previous) {
    const stableState = stateFromObservation(observation, pressProb, opts);
    return {
      emaPressProb: pressProb,
      stableState,
      candidateState: stableState,
      candidateSince: nowMs,
      stableSince: nowMs,
      lastUpdatedAt: nowMs,
      jitterScore: 0,
      confidence,
      heldMs: 0,
      motionGated,
      appliedAlpha,
      rawState: observation.state ?? "pending",
      reasons: [...(observation.reasons ?? []), "initial"],
    };
  }

  const emaPressProb = clamp(previous.emaPressProb + (pressProb - previous.emaPressProb) * appliedAlpha);
  const rawState = stateFromObservation(observation, pressProb, opts);
  const next = {
    ...previous,
    emaPressProb,
    lastUpdatedAt: nowMs,
    jitterScore: Math.abs(pressProb - previous.emaPressProb),
    confidence,
    heldMs: nowMs - (previous.stableSince ?? nowMs),
    motionGated,
    appliedAlpha,
    rawState,
    reasons: [...(observation.reasons ?? [])],
  };

  if (rawState === "pending") {
    if (nowMs - (previous.lastUpdatedAt ?? nowMs) >= opts.pendingTimeoutMs) {
      next.stableState = "pending";
      next.stableSince = nowMs;
    }
    next.candidateState = "pending";
    next.candidateSince = previous.candidateState === "pending" ? previous.candidateSince : nowMs;
    return next;
  }

  if (rawState === previous.stableState) {
    next.candidateState = rawState;
    next.candidateSince = nowMs;
    return next;
  }

  const candidateSince = previous.candidateState === rawState ? previous.candidateSince : nowMs;
  const dwellMs = options.holeId?.endsWith("5") ? opts.pinkyDwellMs : opts.dwellMs;
  next.candidateState = rawState;
  next.candidateSince = candidateSince;

  if (nowMs - candidateSince >= dwellMs && transitionReady(rawState, emaPressProb, opts)) {
    next.stableState = rawState;
    next.stableSince = nowMs;
    next.heldMs = 0;
    next.reasons.push("stable-transition");
  }

  return next;
}

export function smoothFrame(previousFrameState = {}, observations = {}, nowMs = performance.now(), options = {}) {
  const previousFingerStates = previousFrameState.fingerStates ?? previousFrameState;
  const fingerStates = {};
  const holes = {};
  const diagnostics = {};
  const cameraBlocked = options.cameraGuide?.level === "block";

  for (const holeId of DETECTABLE_HOLES) {
    const previous = previousFingerStates?.[holeId];
    if (cameraBlocked) {
      fingerStates[holeId] = previous ?? null;
      holes[holeId] = numericFromStable(previous?.stableState);
      diagnostics[holeId] = {
        rawState: observations?.[holeId]?.state ?? "pending",
        stableState: previous?.stableState ?? "pending",
        confidence: observations?.[holeId]?.confidence ?? 0,
        heldMs: previous?.heldMs ?? 0,
        changedAt: previous?.stableSince ?? nowMs,
        jitterScore: previous?.jitterScore ?? 0,
        reasons: ["camera-guide-block"],
      };
      continue;
    }

    const state = smoothFingerState(previous, observations?.[holeId], nowMs, { ...options, holeId });
    fingerStates[holeId] = state;
    holes[holeId] = numericFromStable(state.stableState);
    diagnostics[holeId] = {
      rawState: state.rawState,
      stableState: state.stableState,
      confidence: state.confidence,
      heldMs: state.heldMs,
      changedAt: state.stableSince,
      jitterScore: state.jitterScore,
      pressProbEma: state.emaPressProb,
      pressProb: observations?.[holeId]?.pressProb,
      liftProb: observations?.[holeId]?.liftProb,
      reasons: state.reasons,
    };
  }

  return { fingerStates, holes, diagnostics };
}

export function createTemporalSmoother(options = {}) {
  let frameState = { fingerStates: {} };

  return {
    update(observations, nowMs = performance.now(), cameraGuide = null) {
      frameState = smoothFrame(frameState, observations, nowMs, { ...options, cameraGuide });
      return frameState;
    },
    reset() {
      frameState = { fingerStates: {} };
    },
    getState() {
      return frameState;
    },
  };
}
