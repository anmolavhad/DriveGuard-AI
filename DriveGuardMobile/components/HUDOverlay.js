import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';
import { Colors, FontSize, Radius, Spacing, Shadow } from '../constants/theme';
import { MetricCard } from './MetricCard';

/**
 * Floating HUD overlay panel rendered over the camera feed.
 *
 * Props:
 *   isConnected    {boolean}
 *   serverIp       {string|null}
 *   reconnectCount {number}
 *   metrics        { ear, mar, smoothed_ear, status, alert, alarm, alert_level,
 *                    severity, perclos, continuous_ms, blink_count, yawning }
 *   lastSentAt     {number|null}  - timestamp of last successful send
 *   onConfigPress  {() => void}
 */
export function HUDOverlay({
  isConnected,
  serverIp,
  reconnectCount,
  metrics = {},
  lastSentAt,
  onConfigPress,
  onCalibratePress,
}) {
  const {
    state = 'AWAKE',
    ear = 0.30,
    baseline_ear,
    sleep_threshold,
    closure_duration = 0.0,
    calibration_progress = 1.0,
    is_calibrated = false,
    alert = false,
    alarm = false,
    blink_count = 0,
    latency_ms,
    face_detected = true,
  } = metrics;

  const pulseAnim    = useRef(new Animated.Value(1)).current;
  const pulseLoop    = useRef(null);
  const bannerAnim   = useRef(new Animated.Value(0)).current;
  const bannerLoop   = useRef(null);

  // ── Connection badge pulse ──────────────────────────────────────────────
  useEffect(() => {
    if (pulseLoop.current) { pulseLoop.current.stop(); pulseLoop.current = null; }
    if (isConnected) {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.7, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,   duration: 800, useNativeDriver: true }),
        ])
      );
      pulseLoop.current.start();
    } else {
      pulseAnim.setValue(1);
    }
    return () => { if (pulseLoop.current) pulseLoop.current.stop(); };
  }, [isConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Alert banner flash (WARNING only — CRITICAL handled by SleepAlarmModal) ──
  useEffect(() => {
    if (bannerLoop.current) { bannerLoop.current.stop(); bannerLoop.current = null; }
    if (state === 'WARNING' && !alarm) {
      bannerLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(bannerAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(bannerAnim, { toValue: 0.35, duration: 300, useNativeDriver: true }),
        ])
      );
      bannerLoop.current.start();
    } else {
      bannerAnim.setValue(1);
      if (bannerLoop.current) { bannerLoop.current.stop(); bannerLoop.current = null; }
    }
    return () => { if (bannerLoop.current) bannerLoop.current.stop(); };
  }, [state, alarm]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Status styling helpers ─────────────────────────────────────────────────
  const statusColor = state === 'CRITICAL'    ? Colors.sleeping
                    : state === 'WARNING'     ? Colors.drowsy
                    : state === 'CALIBRATING' ? '#38BDF8'
                    :                           Colors.attentive;

  const alertGlow   = state === 'CRITICAL'    ? Colors.sleepingGlow
                    : state === 'WARNING'     ? Colors.drowsyGlow
                    : state === 'CALIBRATING' ? 'rgba(56, 189, 248, 0.4)'
                    :                           Colors.attentiveGlow;

  const dotColor    = isConnected ? Colors.connected : Colors.disconnected;

  // Format last sent time
  const lastSentStr = lastSentAt
    ? new Date(lastSentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';

  // Format continuous closure duration
  const closureSec = `${(closure_duration ?? 0).toFixed(1)}s`;
  const calPercent = Math.round((calibration_progress ?? 0) * 100);

  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* ── Top status strip ──────────────────────────────────────────────── */}
      <View style={styles.topBar}>
        {/* DriveGuard wordmark */}
        <View style={styles.wordmark}>
          <Text style={styles.wordmarkIcon}>🛡️</Text>
          <Text style={styles.wordmarkText}>
            Drive<Text style={styles.wordmarkAccent}>Guard</Text> AI
          </Text>
        </View>

        {/* Right action badges */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {/* Calibrate button */}
          <TouchableOpacity
            style={[styles.calBtn, { borderColor: statusColor }]}
            onPress={onCalibratePress}
            activeOpacity={0.7}
          >
            <Text style={[styles.calBtnText, { color: statusColor }]}>🎯 Calibrate</Text>
          </TouchableOpacity>

          {/* Connection badge */}
          <TouchableOpacity
            style={[styles.connBadge, { borderColor: dotColor }]}
            onPress={onConfigPress}
            activeOpacity={0.75}
          >
            <View style={styles.dotWrapper}>
              {isConnected && (
                <Animated.View
                  style={[styles.dotRing, { borderColor: dotColor, transform: [{ scale: pulseAnim }] }]}
                />
              )}
              <View style={[styles.dot, { backgroundColor: dotColor }]} />
            </View>
            <Text style={[styles.connText, { color: dotColor }]}>
              {isConnected ? 'Connected' : serverIp ? `Reconnecting… (${reconnectCount})` : 'Set IP'}
            </Text>
            <Text style={styles.configIcon}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Dynamic Calibration Banner ─────────────────────────────────────── */}
      {state === 'CALIBRATING' && (
        <View style={styles.calibrationBanner}>
          <Text style={styles.calibrationIcon}>🎯</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.calibrationTitle}>
              CALIBRATING BASELINE ({calPercent}%)
            </Text>
            <Text style={styles.calibrationSub}>
              Please look forward at the road with eyes open...
            </Text>
            {/* Progress bar */}
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${calPercent}%` }]} />
            </View>
          </View>
        </View>
      )}

      {/* ── WARNING banner (Eyes closed 0.5s - 1.4s) ────────────────────────── */}
      {state === 'WARNING' && !alarm && (
        <Animated.View style={[styles.warningBar, { opacity: bannerAnim }]}>
          <Text style={styles.warningBarIcon}>⚠️</Text>
          <View style={styles.warningBarContent}>
            <Text style={styles.warningBarTitle}>WARNING: DROWSINESS DETECTED</Text>
            <Text style={styles.warningBarSub}>
              Eyes closed for {closureSec} • Stay alert!
            </Text>
          </View>
        </Animated.View>
      )}

      {/* ── Face missing indicator ────────────────────────────────────────── */}
      {isConnected && !face_detected && (
        <View style={styles.faceMissingBar}>
          <Text style={styles.faceMissingText}>👤 Position face within camera frame</Text>
        </View>
      )}

      {/* ── Bottom metric panel ──────────────────────────────────────────── */}
      <View style={styles.panel} pointerEvents="box-none">
        {/* Status chip row */}
        <View style={styles.statusRow}>
          <View style={[styles.statusChip, {
            backgroundColor: statusColor + '20',
            borderColor:     statusColor,
            ...Shadow.glow(statusColor),
          }]}>
            <Text style={[styles.statusChipText, { color: statusColor }]}>
              {state === 'CRITICAL'    ? '🚨 CRITICAL (MICROSLEEP)'
              : state === 'WARNING'     ? '⚠️ WARNING (DROWSY)'
              : state === 'CALIBRATING' ? '⏳ CALIBRATING'
              :                           '✅ AWAKE (ATTENTIVE)'}
            </Text>
          </View>
          <Text style={styles.lastSent}>
            {latency_ms ? `⚡ ${latency_ms}ms` : `tx: ${lastSentStr}`}
          </Text>
        </View>

        {/* Metric cards — EAR, Baseline, Closure time */}
        <View style={styles.metricsRow}>
          <MetricCard
            label="EAR"
            value={(ear ?? 0).toFixed(3)}
            accentColor={Colors.primary}
            glowColor={Colors.primaryGlow}
          />
          <MetricCard
            label="THRESHOLD"
            value={sleep_threshold ? sleep_threshold.toFixed(3) : 'CALIB...'}
            accentColor={Colors.drowsy}
            glowColor={Colors.drowsyGlow}
          />
          <MetricCard
            label="CLOSURE"
            value={closureSec}
            accentColor={statusColor}
            glowColor={alertGlow}
          />
        </View>

        {/* Extra info row */}
        <View style={styles.extraRow}>
          <Text style={styles.extraChip}>
            🎯 Baseline: {baseline_ear ? baseline_ear.toFixed(3) : 'Pending'}
          </Text>
          <Text style={styles.extraChip}>
            👁 Blinks: {blink_count ?? 0}
          </Text>
        </View>

        {/* Server address footer */}
        <TouchableOpacity onPress={onConfigPress} activeOpacity={0.7}>
          <Text style={styles.serverAddr}>
            {serverIp ? `▶ ws://${serverIp}:8000/ws/telemetry` : 'Tap ⚙️ to configure server IP'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },

  // ── Top bar ───────────────────────────────────────────────────────────────
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingBottom: Spacing.md,
    backgroundColor: 'rgba(10, 14, 26, 0.60)',
  },
  wordmark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  wordmarkIcon: { fontSize: 18 },
  wordmarkText: {
    fontSize: FontSize.lg,
    fontWeight: '900',
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  wordmarkAccent: { color: Colors.primary },
  connBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 20, 38, 0.80)',
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 6,
  },
  dotWrapper: {
    width: 10,
    height: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    position: 'absolute',
  },
  dotRing: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    position: 'absolute',
  },
  connText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  configIcon: { fontSize: 13 },

  // ── Warning banner (middle of screen, WARNING only) ───────────────────────
  warningBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.55)',
    paddingVertical: 10,
    paddingHorizontal: Spacing.lg,
  },
  warningBarIcon: { fontSize: 22 },
  warningBarContent: { flex: 1 },
  warningBarTitle: {
    fontSize: FontSize.sm,
    fontWeight: '900',
    color: Colors.drowsy,
    letterSpacing: 1.2,
  },
  warningBarSub: {
    fontSize: FontSize.xs,
    color: Colors.drowsy,
    opacity: 0.75,
    marginTop: 2,
  },

  // ── Bottom panel ──────────────────────────────────────────────────────────
  panel: {
    backgroundColor: Colors.bgHUD,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    gap: Spacing.sm,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusChip: {
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingVertical: 4,
    paddingHorizontal: 14,
  },
  statusChipText: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    letterSpacing: 1.0,
  },
  lastSent: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  extraRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  extraChip: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    backgroundColor: 'rgba(148, 163, 184, 0.08)',
    borderRadius: Radius.sm,
    paddingVertical: 3,
    paddingHorizontal: 8,
    fontWeight: '600',
  },
  yawnChip: {
    color: Colors.drowsy,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
  },
  serverAddr: {
    fontSize: FontSize.xs - 1,
    color: Colors.textMuted,
    textAlign: 'center',
    letterSpacing: 0.2,
    paddingTop: 2,
  },
  calBtn: {
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
  },
  calBtnText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  calibrationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: 'rgba(14, 116, 144, 0.92)',
    marginHorizontal: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#38BDF8',
    marginTop: Spacing.sm,
  },
  calibrationIcon: {
    fontSize: 28,
  },
  calibrationTitle: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: Colors.white,
    letterSpacing: 0.6,
  },
  calibrationSub: {
    fontSize: FontSize.xs,
    color: '#E0F2FE',
    marginTop: 2,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 3,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#38BDF8',
    borderRadius: 3,
  },
  faceMissingBar: {
    backgroundColor: 'rgba(239, 68, 68, 0.85)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginHorizontal: Spacing.md,
    borderRadius: Radius.sm,
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  faceMissingText: {
    color: Colors.white,
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
});
