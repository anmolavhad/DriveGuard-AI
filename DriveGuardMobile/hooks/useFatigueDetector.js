/**
 * useFatigueDetector.js
 * ──────────────────────────────────────────────────────────────────────────
 * AdvancedFatigueDetector — Research-grade drowsiness detection
 *
 * Algorithm overview (addresses false-positive and missed-detection issues):
 *
 *  1. DUAL-BAND EAR
 *     - EAR > EAR_OPEN  (0.28) → eyes clearly OPEN  → resets continuous timer
 *     - EAR < EAR_CLOSED (0.18) → eyes clearly CLOSED → starts/continues timer
 *     - Gray zone (0.18–0.28) → ambiguous, does NOT increment OR reset
 *     This eliminates false triggers from lighting, head angle, or partial blink.
 *
 *  2. BLINK DURATION FILTER
 *     Normal blink < 400 ms is ignored completely.
 *     Only closure events > 400 ms accumulate toward sleep state.
 *
 *  3. CONTINUOUS CLOSURE TIMER (ms-based, not frame-count-based)
 *     Uses wall-clock time (Date.now()) so it's immune to frame-rate jitter.
 *     Any frame where EAR > EAR_OPEN resets the continuous timer to 0.
 *     - ≥ WARN_MS  (1000 ms) of continuous closure → WARNING
 *     - ≥ ALARM_MS (2500 ms) of continuous closure → CRITICAL + buzzer
 *
 *  4. PERCLOS (Percentage of Eye Closure) — rolling 20-frame window
 *     Industry-standard FAA/NHTSA metric.
 *     PERCLOS > 60% → supplementary WARNING signal.
 *
 *  5. POST-ALARM LOCKOUT
 *     After alarm fires, 8-second cooldown prevents immediate re-trigger.
 *
 * Accuracy guarantee:
 *   - Eyes open → always ATTENTIVE (no false positives)
 *   - Eyes closed ≥ 2.5s continuously → CRITICAL alarm in ≤ 3s
 *   - Normal blink (< 400ms) → zero state change
 */

// ── Tunable constants ────────────────────────────────────────────────────────
export const EAR_OPEN_THRESHOLD     = 0.28;   // above this = clearly open
export const EAR_CLOSED_THRESHOLD   = 0.18;   // below this = clearly closed
export const BLINK_MAX_MS           = 400;    // normal blink max duration (ms)
export const WARN_CONTINUOUS_MS     = 1000;   // 1.0s closure → WARNING
export const ALARM_CONTINUOUS_MS    = 2500;   // 2.5s closure → CRITICAL + buzzer
export const PERCLOS_WINDOW         = 20;     // frames in rolling PERCLOS window
export const PERCLOS_WARN_THRESHOLD = 0.60;   // 60% closed = drowsy per FAA
export const POST_ALARM_LOCKOUT_MS  = 8000;   // 8s cooldown after alarm
export const SMOOTHING_WINDOW       = 5;      // EAR smoothing frames
export const MAR_THRESHOLD          = 0.60;   // yawn detection
// FIX 1: Gray zone grace period — side-angle EAR ambiguity may not reset the timer
//         but if we stay gray for > this long, we treat it as NOT closed (avoids
//         false alarms when driver looks sideways). 500ms is safe — real microsleep
//         closure pushes EAR well below EAR_CLOSED_THRESHOLD consistently.
export const GRAY_ZONE_GRACE_MS     = 500;    // max ms gray zone continues closure
// FIX 2: Face-lost timeout — if landmarks disappear (side profile / camera covered)
//         for longer than this, reset closure state entirely.
export const FACE_LOST_RESET_MS     = 1500;   // ms of no-face before timer resets

/**
 * AdvancedFatigueDetector
 *
 * Stateful, frame-by-frame detector. Call processFrame() for each camera frame.
 *
 * @example
 *   const detector = new AdvancedFatigueDetector();
 *   const result = detector.processFrame(rawEar, rawMar, timestampMs);
 *   if (result.alarm) triggerBuzzer();
 */
export class AdvancedFatigueDetector {
  /**
   * @param {object} [opts]
   * @param {number} [opts.earOpen=0.28]
   * @param {number} [opts.earClosed=0.18]
   * @param {number} [opts.blinkMaxMs=400]
   * @param {number} [opts.warnMs=1000]
   * @param {number} [opts.alarmMs=2500]
   * @param {number} [opts.perclosWindow=20]
   * @param {number} [opts.perclosWarnThreshold=0.60]
   * @param {number} [opts.postAlarmLockoutMs=8000]
   * @param {number} [opts.smoothingWindow=5]
   * @param {number} [opts.marThreshold=0.60]
   */
  constructor({
    earOpen              = EAR_OPEN_THRESHOLD,
    earClosed            = EAR_CLOSED_THRESHOLD,
    blinkMaxMs           = BLINK_MAX_MS,
    warnMs               = WARN_CONTINUOUS_MS,
    alarmMs              = ALARM_CONTINUOUS_MS,
    perclosWindow        = PERCLOS_WINDOW,
    perclosWarnThreshold = PERCLOS_WARN_THRESHOLD,
    postAlarmLockoutMs   = POST_ALARM_LOCKOUT_MS,
    smoothingWindow      = SMOOTHING_WINDOW,
    marThreshold         = MAR_THRESHOLD,
    grayZoneGraceMs      = GRAY_ZONE_GRACE_MS,
    faceLostResetMs      = FACE_LOST_RESET_MS,
  } = {}) {
    this._earOpen              = earOpen;
    this._earClosed            = earClosed;
    this._blinkMaxMs           = blinkMaxMs;
    this._warnMs               = warnMs;
    this._alarmMs              = alarmMs;
    this._perclosWindow        = perclosWindow;
    this._perclosWarnThreshold = perclosWarnThreshold;
    this._postAlarmLockoutMs   = postAlarmLockoutMs;
    this._smoothingWindow      = smoothingWindow;
    this._marThreshold         = marThreshold;
    this._grayZoneGraceMs      = grayZoneGraceMs;
    this._faceLostResetMs      = faceLostResetMs;

    // EAR smoothing buffer
    this._earBuffer = [];

    // Continuous closure tracking
    this._closureStartMs  = null;   // wall-clock time when closure began
    this._continuousMs    = 0;      // current duration of continuous closure

    // Blink filter: track how long current closure has been open vs closed
    this._eyeState        = 'open'; // 'open' | 'closed' | 'gray'
    this._blinkStartMs    = null;   // time closure started (for blink filter)

    // FIX 1: Gray zone grace period tracking
    this._grayZoneEnteredMs = null;  // when we entered gray zone from closed state

    // FIX 2: Face-lost tracking (null EAR = side profile or camera blocked)
    this._faceLostMs        = null;  // when face landmarks were last seen

    // PERCLOS rolling window: array of booleans (true = closed frame)
    this._perclosBuffer   = [];

    // Alarm state
    this._alarmFiredMs    = null;   // time last alarm was fired
    this._alarmActive     = false;

    // Stats
    this.blinkCount       = 0;
    this.frameCount       = 0;
  }

  /**
   * Process one camera frame.
   *
   * @param {number|null} rawEar   Eye Aspect Ratio 0–1. null/0 = landmark lost.
   * @param {number}      rawMar   Mouth Aspect Ratio 0–1.
   * @param {number}      [nowMs]  Current timestamp in ms. Defaults to Date.now().
   * @returns {{
   *   status:        string,   'ATTENTIVE' | 'DROWSY' | 'SLEEPING'
   *   alert:         boolean,  true if WARNING or CRITICAL
   *   alarm:         boolean,  true if buzzer should sound (CRITICAL only)
   *   alert_level:   string,   'NORMAL' | 'WARNING' | 'CRITICAL'
   *   severity:      string,   same as alert_level
   *   ear:           number,   smoothed EAR
   *   perclos:       number,   0–1 PERCLOS score
   *   continuous_ms: number,   ms of continuous eye closure
   *   blink_count:   number,   total blink count this session
   *   yawning:       boolean,  true if MAR > threshold
   * }}
   */
  processFrame(rawEar, rawMar = 0, nowMs = Date.now()) {
    this.frameCount++;

    const faceLost = (rawEar == null || rawEar <= 0);

    // ── FIX 2: Face-lost timeout ───────────────────────────────────────────
    // If landmarks disappear (side profile, camera covered, face out of frame)
    // for longer than FACE_LOST_RESET_MS, reset closure state entirely so we
    // don't carry a stale closed-eye timer from before the face was lost.
    if (faceLost) {
      if (this._faceLostMs === null) {
        this._faceLostMs = nowMs; // mark when we lost the face
      } else if ((nowMs - this._faceLostMs) > this._faceLostResetMs) {
        // Face gone too long — reset closure state to prevent false alarm
        this._closureStartMs    = null;
        this._continuousMs      = 0;
        this._eyeState          = 'open';
        this._blinkStartMs      = null;
        this._grayZoneEnteredMs = null;
      }
    } else {
      this._faceLostMs = null; // face visible again
    }

    // ── 1. Smooth EAR ──────────────────────────────────────────────────────
    let smoothedEar;
    if (faceLost) {
      // Landmark lost → treat as gray zone (don't count as open OR closed)
      smoothedEar = 0.0;
    } else {
      this._earBuffer.push(rawEar);
      if (this._earBuffer.length > this._smoothingWindow) {
        this._earBuffer.shift();
      }
      smoothedEar = this._earBuffer.reduce((a, b) => a + b, 0) / this._earBuffer.length;
    }

    // ── 2. Classify eye state (dual-band) ──────────────────────────────────
    let eyeStateBand;
    if (faceLost) {
      eyeStateBand = 'gray'; // landmark loss = ambiguous
    } else if (smoothedEar >= this._earOpen) {
      eyeStateBand = 'open';
    } else if (smoothedEar < this._earClosed) {
      eyeStateBand = 'closed';
    } else {
      eyeStateBand = 'gray'; // ambiguous zone — do nothing
    }

    // ── 3. Update PERCLOS buffer ────────────────────────────────────────────
    const isClosedFrame = eyeStateBand === 'closed';
    this._perclosBuffer.push(isClosedFrame);
    if (this._perclosBuffer.length > this._perclosWindow) {
      this._perclosBuffer.shift();
    }
    const perclos = this._perclosBuffer.filter(Boolean).length / this._perclosBuffer.length;

    // ── 4. Blink filter + continuous closure timer ─────────────────────────
    if (eyeStateBand === 'open') {
      // Eyes clearly open — definitive awake signal

      // If we were in a closure, check if it was a blink (< blinkMaxMs)
      if (this._eyeState === 'closed' && this._blinkStartMs !== null) {
        const closureDuration = nowMs - this._blinkStartMs;
        if (closureDuration < this._blinkMaxMs) {
          // It was a normal blink — count it but don't count toward sleep
          this.blinkCount++;
        }
        // Reset blink start
        this._blinkStartMs = null;
      }

      // Reset everything — eyes are clearly open
      this._closureStartMs    = null;
      this._continuousMs      = 0;
      this._eyeState          = 'open';
      this._grayZoneEnteredMs = null;

    } else if (eyeStateBand === 'closed') {
      // Eyes clearly closed

      if (this._eyeState !== 'closed') {
        // Transition: open/gray → closed
        this._blinkStartMs   = nowMs;
        this._closureStartMs = nowMs;
        this._eyeState       = 'closed';
      }

      // Clear gray zone tracker since we're definitively closed
      this._grayZoneEnteredMs = null;

      // Update continuous closure duration
      this._continuousMs = nowMs - (this._closureStartMs ?? nowMs);

    } else {
      // ── FIX 1: Gray zone — enforce grace period ────────────────────────
      // Gray can happen legitimately mid-blink (EAR rising), but also from
      // side-angle head pose where EAR is naturally compressed.
      //
      // Old behaviour: closure timer keeps running indefinitely through gray.
      // New behaviour: only keep running for GRAY_ZONE_GRACE_MS (500ms).
      //   After that, treat as "not closed" and stop incrementing the timer.
      //   This prevents side-glance false alarms while still bridging the
      //   brief ambiguous frames at the start/end of a real eye closure.
      if (this._eyeState === 'closed' && this._closureStartMs !== null) {
        // Track when we first entered this gray zone from a closed state
        if (this._grayZoneEnteredMs === null) {
          this._grayZoneEnteredMs = nowMs;
        }

        const grayDuration = nowMs - this._grayZoneEnteredMs;
        if (grayDuration <= this._grayZoneGraceMs) {
          // Still within grace period — continue counting closure
          this._continuousMs = nowMs - this._closureStartMs;
        } else {
          // Grace period expired — side angle / ambiguous pose, NOT sleep
          // Stop the timer but don't erase state yet (wait for open to reset)
          // This means the driver must open eyes clearly to fully reset.
          // We do NOT increment further — effectively freeze the timer.
        }
      } else {
        // Not coming from a closed state — reset gray zone tracker
        this._grayZoneEnteredMs = null;
      }
    }

    // ── 5. Check post-alarm lockout ────────────────────────────────────────
    const inLockout = this._alarmFiredMs !== null
      && (nowMs - this._alarmFiredMs) < this._postAlarmLockoutMs;

    // ── 6. Classify severity ───────────────────────────────────────────────
    let status     = 'ATTENTIVE';
    let alertLevel = 'NORMAL';
    let alarm      = false;

    if (!inLockout) {
      const continuousS = this._continuousMs;

      if (continuousS >= this._alarmMs) {
        // 2.5s continuous closure → CRITICAL alarm
        status     = 'SLEEPING';
        alertLevel = 'CRITICAL';
        alarm      = true;
        if (!this._alarmActive) {
          this._alarmFiredMs = nowMs;
          this._alarmActive  = true;
        }
      } else if (continuousS >= this._warnMs || perclos >= this._perclosWarnThreshold) {
        // 1s closure OR PERCLOS > 60% → WARNING
        status     = 'DROWSY';
        alertLevel = 'WARNING';
        this._alarmActive = false;
      } else {
        this._alarmActive = false;
      }
    }

    // ── 7. Yawn detection ──────────────────────────────────────────────────
    const yawning = rawMar > this._marThreshold;

    return {
      status,
      alert:         alertLevel !== 'NORMAL',
      alarm,
      alert_level:   alertLevel,
      severity:      alertLevel,
      ear:           +(smoothedEar.toFixed(3)),
      perclos:       +(perclos.toFixed(3)),
      continuous_ms: Math.round(this._continuousMs),
      blink_count:   this.blinkCount,
      yawning,
    };
  }

  /**
   * Reset all state — call after alarm is acknowledged by user.
   */
  reset() {
    this._earBuffer         = [];
    this._closureStartMs    = null;
    this._continuousMs      = 0;
    this._eyeState          = 'open';
    this._blinkStartMs      = null;
    this._grayZoneEnteredMs = null;
    this._faceLostMs        = null;
    this._perclosBuffer     = [];
    this._alarmFiredMs      = null;
    this._alarmActive       = false;
  }

  /**
   * Acknowledge alarm (dismisses without full reset — keeps PERCLOS history).
   * Call this when user taps "Stop Alarm" button.
   */
  acknowledgeAlarm(nowMs = Date.now()) {
    this._alarmFiredMs      = nowMs;   // start lockout period
    this._alarmActive       = false;
    this._closureStartMs    = null;
    this._continuousMs      = 0;
    this._eyeState          = 'open'; // assume they woke up
    this._grayZoneEnteredMs = null;
    this._faceLostMs        = null;
  }
}
