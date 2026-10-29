import { useState, useEffect, useRef, useCallback } from 'react';
import { AdvancedFatigueDetector } from './useFatigueDetector';

// ── Tick rate ─────────────────────────────────────────────────────────────────
// 100 ms = 10 fps, matching the real CV pipeline frame rate.
const TICK_MS = 100;

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * useFatigueSimulator
 * ───────────────────
 * Simulates realistic raw EAR / MAR readings at 10 fps, then pipes them
 * through AdvancedFatigueDetector (same logic used by the Python backend).
 *
 * Returned shape:
 * {
 *   ear:           number   raw Eye Aspect Ratio
 *   mar:           number   raw Mouth Aspect Ratio
 *   smoothed_ear:  number   smoothed EAR
 *   status:        string   ATTENTIVE | DROWSY | SLEEPING
 *   alert:         boolean  true when drowsiness threshold exceeded
 *   alarm:         boolean  true when buzzer should fire (CRITICAL)
 *   alert_level:   string   NORMAL | WARNING | CRITICAL
 *   severity:      string   same as alert_level
 *   perclos:       number   0–1 PERCLOS score
 *   continuous_ms: number   ms of current continuous closure
 *   blink_count:   number   total blink count
 *   yawning:       boolean  true if yawning detected
 * }
 */
export function useFatigueSimulator() {
  const [metrics, setMetrics] = useState({
    ear:           0.32,
    mar:           0.06,
    smoothed_ear:  0.32,
    status:        'ATTENTIVE',
    alert:         false,
    alarm:         false,
    alert_level:   'NORMAL',
    severity:      'NORMAL',
    perclos:       0,
    continuous_ms: 0,
    blink_count:   0,
    yawning:       false,
  });

  // ── Simulation physics state ──────────────────────────────────────────────
  const simRef = useRef({
    phase:         'attentive',   // attentive | onset | drowsy | microsleep
    phaseTimer:    0,
    earBase:       0.32,
    marBase:       0.06,
    blinkTimer:    0,
    blinkDuration: 0,
    blinkActive:   false,
    yawnTimer:     0,
    yawnDuration:  0,
    yawnActive:    false,
    fatigueCycle:  0,             // 0–1 slow fatigue build-up
  });

  // ── Persistent detector instance ──────────────────────────────────────────
  const detectorRef = useRef(new AdvancedFatigueDetector());

  // ── Tick function ─────────────────────────────────────────────────────────
  const tick = useCallback(() => {
    const s  = simRef.current;
    const dt = TICK_MS / 1000;  // seconds per tick
    const nowMs = Date.now();

    // Fatigue cycle: builds over ~2 min using a sine wave, then resets
    s.fatigueCycle = (s.fatigueCycle + dt / 120) % 1;
    const fatigueLevel = Math.sin(s.fatigueCycle * Math.PI); // 0 → 1 → 0

    // ── Phase transitions ───────────────────────────────────────────────────
    s.phaseTimer += dt;
    if (s.phase === 'attentive' && fatigueLevel > 0.5 && s.phaseTimer > 25) {
      s.phase = 'onset';        s.phaseTimer = 0;
    } else if (s.phase === 'onset' && fatigueLevel > 0.75 && s.phaseTimer > 20) {
      s.phase = 'drowsy';       s.phaseTimer = 0;
    } else if (s.phase === 'drowsy' && s.phaseTimer > 25) {
      s.phase = fatigueLevel > 0.85 ? 'microsleep' : 'attentive';
      s.phaseTimer = 0;
    } else if (s.phase === 'microsleep' && s.phaseTimer > 6) {
      s.phase = 'attentive';    s.phaseTimer = 0;
      s.fatigueCycle = 0;       // reset fatigue cycle after event
    }

    // ── Raw EAR target by phase ─────────────────────────────────────────────
    // Note: EAR_OPEN=0.28, EAR_CLOSED=0.18 are the detection thresholds.
    // Attentive eyes should be well above 0.28 to avoid gray zone.
    let earTarget;
    switch (s.phase) {
      case 'attentive':  earTarget = lerp(0.30, 0.38, Math.random()); break; // clearly above open threshold
      case 'onset':      earTarget = lerp(0.22, 0.30, Math.random()); break; // enters gray zone
      case 'drowsy':     earTarget = lerp(0.16, 0.24, Math.random()); break; // hits closed threshold
      case 'microsleep': earTarget = lerp(0.04, 0.14, Math.random()); break; // deeply closed
      default:           earTarget = 0.32;
    }

    // ── Blink simulation ────────────────────────────────────────────────────
    s.blinkTimer -= dt;
    if (!s.blinkActive && s.blinkTimer <= 0) {
      const interval =
        s.phase === 'attentive' ? lerp(3, 6, Math.random())
        : s.phase === 'drowsy'  ? lerp(2, 4, Math.random())
        :                         lerp(1, 3, Math.random());
      s.blinkTimer    = interval;
      s.blinkActive   = true;
      // Blinks in attentive phase are always short (< 400ms = 0.4s = within BLINK_MAX_MS)
      s.blinkDuration = s.phase === 'attentive'
        ? lerp(0.08, 0.22, Math.random())    // normal blink: 80–220ms
        : lerp(0.15, 0.45, Math.random());   // drowsy: occasional longer closures
    }

    let rawEar = s.earBase;
    if (s.blinkActive) {
      s.blinkDuration -= dt;
      rawEar = clamp(0.09, 0.05, 0.14); // closed during blink
      if (s.blinkDuration <= 0) s.blinkActive = false;
    } else {
      s.earBase = lerp(s.earBase, earTarget, 0.25);
      rawEar    = clamp(s.earBase + (Math.random() - 0.5) * 0.012, 0.04, 0.45);
    }

    // ── MAR / Yawn simulation ───────────────────────────────────────────────
    s.yawnTimer -= dt;
    if (!s.yawnActive && s.yawnTimer <= 0) {
      const yawnProb =
        s.phase === 'attentive' ? 0.002
        : s.phase === 'onset'   ? 0.008
        : s.phase === 'drowsy'  ? 0.015 : 0.025;
      if (Math.random() < yawnProb) {
        s.yawnActive   = true;
        s.yawnDuration = lerp(2, 5, Math.random());
        s.marBase      = lerp(0.55, 0.72, Math.random());
      } else {
        s.yawnTimer = lerp(3, 8, Math.random());
        s.marBase   = lerp(0.04, 0.10, Math.random());
      }
    }

    let rawMar;
    if (s.yawnActive) {
      s.yawnDuration -= dt;
      rawMar = clamp(s.marBase + (Math.random() - 0.5) * 0.04, 0.0, 0.78);
      if (s.yawnDuration <= 0) {
        s.yawnActive = false;
        s.yawnTimer  = lerp(5, 15, Math.random());
        s.marBase    = 0.06;
      }
    } else {
      rawMar = clamp(s.marBase + (Math.random() - 0.5) * 0.02, 0.02, 0.12);
    }

    // ── Run through detector ─────────────────────────────────────────────────
    const detection = detectorRef.current.processFrame(rawEar, rawMar, nowMs);

    setMetrics({
      ear:           +rawEar.toFixed(3),
      mar:           +rawMar.toFixed(3),
      smoothed_ear:  detection.ear,
      status:        detection.status,
      alert:         detection.alert,
      alarm:         detection.alarm,
      alert_level:   detection.alert_level,
      severity:      detection.severity,
      perclos:       detection.perclos,
      continuous_ms: detection.continuous_ms,
      blink_count:   detection.blink_count,
      yawning:       detection.yawning,
    });
  }, []);

  useEffect(() => {
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [tick]);

  return metrics;
}
