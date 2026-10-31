/**
 * SleepAlarmModal.js — DriveGuard AI
 * ─────────────────────────────────────────────────────────────────────────────
 * High-Priority Emergency Microsleep Alarm Overlay.
 *
 * Theme:
 *   Matches DriveGuard Minimalist Dark Automotive Cockpit:
 *   • Pure black backdrop with pulsing subtle emergency perimeter
 *   • Near-black surface (#0A0A0A) with precision 1.5px crimson borders (#EF4444)
 *   • Monospace tabular telemetry counter for alarm duration
 *   • High-precision vector SVG iconography (zero cartoon emojis)
 *   • Industrial emergency "DISMISS ALARM" action button
 *
 * Audio & Haptic Architecture:
 *   • Multi-engine native audio:
 *       1. expo-av (Audio.Sound.createAsync) — primary rock-solid mobile player
 *       2. expo-audio — modern fallback engine
 *       3. Web Audio API synthesizer — high-pitch sawtooth siren for web browsers
 *   • Audio mode initialized with playsInSilentModeIOS: true, shouldDuckAndroid: false
 *   • Android heavy haptic vibration pattern ([0, 500, 200, 500, 200, 500], loop)
 *   • iOS repeating 1-second pulse interval
 */

import React, { useEffect, useRef, useCallback, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  Platform,
  Vibration,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

// ── Audio Engine Safe Imports ─────────────────────────────────────────────────
let ExpoAudio = null;
try {
  ExpoAudio = require('expo-audio');
} catch (e) {
  console.warn('[SleepAlarmModal] expo-audio not available:', e);
}

// ── Audio Asset ───────────────────────────────────────────────────────────────
const ALARM_SOUND_ASSET = require('../assets/alarm.wav');

// ── Web Audio Synthesizer (Fallback for Web / Browsers) ───────────────────────
let webAudioCtx = null;

function playWebBeep() {
  try {
    if (typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!webAudioCtx || webAudioCtx.state === 'closed') {
      webAudioCtx = new AudioCtx();
    }
    if (webAudioCtx.state === 'suspended') {
      webAudioCtx.resume();
    }
    const osc = webAudioCtx.createOscillator();
    const gain = webAudioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1150, webAudioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(700, webAudioCtx.currentTime + 0.28);
    gain.gain.setValueAtTime(0.9, webAudioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, webAudioCtx.currentTime + 0.28);
    osc.connect(gain);
    gain.connect(webAudioCtx.destination);
    osc.start();
    osc.stop(webAudioCtx.currentTime + 0.30);
  } catch (_) {}
}

export function SleepAlarmModal({ visible, onDismiss }) {
  const flashAnim       = useRef(new Animated.Value(0)).current;
  const scaleAnim       = useRef(new Animated.Value(0.92)).current;
  const pulseAnim       = useRef(new Animated.Value(1)).current;
  const flashLoop       = useRef(null);
  const pulseLoop       = useRef(null);

  const soundAvRef      = useRef(null);
  const soundExpoRef    = useRef(null);
  const webIntervalRef  = useRef(null);
  const timerRef        = useRef(null);
  const iosVibrateTimer = useRef(null);

  const [secondsActive, setSecondsActive] = useState(0);

  // ── Start Audio Engine ──────────────────────────────────────────────────────
  const startAlarmSound = useCallback(async () => {
    // 1. Web browser fallback: Web Audio API Oscillator
    if (Platform.OS === 'web') {
      playWebBeep();
      if (!webIntervalRef.current) {
        webIntervalRef.current = setInterval(playWebBeep, 420);
      }
      return;
    }

    // 2. Primary Mobile Engine: expo-audio
    if (ExpoAudio) {
      try {
        if (typeof ExpoAudio.setAudioModeAsync === 'function') {
          await ExpoAudio.setAudioModeAsync({
            playsInSilentModeIOS: true,
            staysActiveInBackground: true,
            shouldDuckAndroid: false,
            playThroughEarpieceAndroid: false,
          }).catch(() => {});
        }
        if (ExpoAudio.createAudioPlayer) {
          const player = ExpoAudio.createAudioPlayer(ALARM_SOUND_ASSET);
          if (player) {
            player.loop = true;
            if (typeof player.volume !== 'undefined') player.volume = 1.0;
            player.play();
            soundExpoRef.current = player;
          }
        }
      } catch (err) {
        console.warn('[SleepAlarmModal] expo-audio warning:', err);
      }
    }
  }, []);

  // ── Stop Audio Engine ───────────────────────────────────────────────────────
  const stopAlarmSound = useCallback(async () => {
    // Web
    if (webIntervalRef.current) {
      clearInterval(webIntervalRef.current);
      webIntervalRef.current = null;
    }

    // expo-audio
    if (soundExpoRef.current) {
      try {
        if (typeof soundExpoRef.current.pause === 'function') {
          soundExpoRef.current.pause();
        }
        if (typeof soundExpoRef.current.release === 'function') {
          soundExpoRef.current.release();
        }
      } catch (_) {}
      soundExpoRef.current = null;
    }
  }, []);

  // ── Vibration / Haptics Engine ──────────────────────────────────────────────
  const startVibration = useCallback(() => {
    try {
      if (Platform.OS === 'android') {
        // Continuous repeating heavy pulse: [wait 0ms, vibrate 500ms, pause 200ms, vibrate 500ms...]
        Vibration.vibrate([0, 500, 200, 500, 200, 500], true);
      } else if (Platform.OS === 'ios') {
        Vibration.vibrate();
        if (iosVibrateTimer.current) clearInterval(iosVibrateTimer.current);
        iosVibrateTimer.current = setInterval(() => {
          Vibration.vibrate();
        }, 1100);
      } else {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate([400, 200, 400]);
        }
      }
    } catch (_) {}
  }, []);

  const stopVibration = useCallback(() => {
    try {
      Vibration.cancel();
    } catch (_) {}
    if (iosVibrateTimer.current) {
      clearInterval(iosVibrateTimer.current);
      iosVibrateTimer.current = null;
    }
  }, []);

  // ── Visual Animations ───────────────────────────────────────────────────────
  const startAnimations = useCallback(() => {
    // Background red pulse overlay
    flashLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(flashAnim, {
          toValue:         0.28,
          duration:        400,
          easing:          Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(flashAnim, {
          toValue:         0.04,
          duration:        450,
          easing:          Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    flashLoop.current.start();

    // Card entrance spring
    Animated.spring(scaleAnim, {
      toValue:         1,
      tension:         100,
      friction:        8,
      useNativeDriver: true,
    }).start();

    // Button attention pulse
    pulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue:         1.03,
          duration:        500,
          easing:          Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue:         1.0,
          duration:        500,
          easing:          Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoop.current.start();
  }, [flashAnim, scaleAnim, pulseAnim]);

  const stopAnimations = useCallback(() => {
    if (flashLoop.current) { flashLoop.current.stop(); flashLoop.current = null; }
    if (pulseLoop.current) { pulseLoop.current.stop(); pulseLoop.current = null; }
    flashAnim.setValue(0);
    scaleAnim.setValue(0.92);
    pulseAnim.setValue(1);
  }, [flashAnim, scaleAnim, pulseAnim]);

  // ── Lifecycle on visibility change ──────────────────────────────────────────
  useEffect(() => {
    if (visible) {
      setSecondsActive(0);
      startAnimations();
      startAlarmSound();
      startVibration();

      timerRef.current = setInterval(() => {
        setSecondsActive((s) => s + 1);
      }, 1000);
    } else {
      stopAnimations();
      stopAlarmSound();
      stopVibration();
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      stopAlarmSound();
      stopVibration();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDismiss = useCallback(() => {
    stopAnimations();
    stopAlarmSound();
    stopVibration();
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    onDismiss?.();
  }, [stopAnimations, stopAlarmSound, stopVibration, onDismiss]);

  const fmtSeconds = (s) => {
    const mins = Math.floor(s / 60).toString().padStart(2, '0');
    const secs = (s % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleDismiss}
    >
      {/* Red strobe ambient overlay */}
      <Animated.View
        style={[styles.flashOverlay, { opacity: flashAnim }]}
        pointerEvents="none"
      />

      <View style={styles.backdrop}>
        <Animated.View style={[styles.card, { transform: [{ scale: scaleAnim }] }]}>

          {/* Top Overline & Shield Icon */}
          <View style={styles.headerRow}>
            <View style={styles.iconCircle}>
              <Svg width={36} height={36} viewBox="0 0 24 24" fill="none">
                <Path
                  d="M12 2L3 6v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V6l-9-4z"
                  stroke="#EF4444"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="rgba(239, 68, 68, 0.14)"
                />
                <Path
                  d="M12 8v5M12 16h.01"
                  stroke="#EF4444"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </View>
            <View style={styles.categoryPill}>
              <View style={styles.dotPulse} />
              <Text style={styles.categoryText}>CRITICAL LEVEL 1</Text>
            </View>
          </View>

          {/* Main Emergency Title */}
          <Text style={styles.title}>MICROSLEEP DETECTED</Text>

          {/* Safety instructions */}
          <Text style={styles.subtitle}>
            Prolonged eye closure detected by vision telemetry. Maintain steering control and bring the vehicle to an immediate safe stop.
          </Text>

          {/* Telemetry Active Duration Badge */}
          <View style={styles.telemetryBadge}>
            <View style={styles.telemetryHeader}>
              <Text style={styles.telemetryLabel}>SIREN ACTIVE</Text>
              <Text style={styles.telemetryRate}>100% VOLUME</Text>
            </View>
            <Text style={styles.durationValue}>{fmtSeconds(secondsActive)}</Text>
          </View>

          {/* High-Contrast Automotive DISMISS ALARM Action */}
          <Animated.View style={{ transform: [{ scale: pulseAnim }], width: '100%' }}>
            <TouchableOpacity
              style={styles.dismissBtn}
              onPress={handleDismiss}
              activeOpacity={0.88}
            >
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2.4}>
                <Path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
              <Text style={styles.dismissBtnText}>DISMISS ALARM</Text>
            </TouchableOpacity>
          </Animated.View>

          {/* Safety Protocol Note */}
          <View style={styles.footerNoteWrap}>
            <Text style={styles.safetyNote}>
              SAFETY PROTOCOL: Find the nearest exit or rest area. Do not attempt to continue driving while drowsy.
            </Text>
          </View>

        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#EF4444',
    zIndex: 0,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    zIndex: 1,
  },
  card: {
    backgroundColor: '#0A0A0A',
    borderWidth: 1.5,
    borderColor: '#EF4444',
    borderRadius: 8,
    paddingVertical: 28,
    paddingHorizontal: 22,
    alignItems: 'center',
    width: '100%',
    maxWidth: 390,
  },
  headerRow: {
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#110606',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  dotPulse: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EF4444',
  },
  categoryText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#EF4444',
    letterSpacing: 2,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1.8,
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 13,
    color: '#A3A3A3',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
    paddingHorizontal: 6,
  },
  telemetryBadge: {
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#262626',
    borderRadius: 4,
    paddingVertical: 12,
    paddingHorizontal: 20,
    width: '100%',
    alignItems: 'center',
    marginBottom: 22,
  },
  telemetryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 4,
  },
  telemetryLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#EF4444',
    letterSpacing: 1.5,
  },
  telemetryRate: {
    fontSize: 9,
    fontWeight: '700',
    color: '#666666',
    letterSpacing: 1,
  },
  durationValue: {
    fontSize: 34,
    fontWeight: '900',
    color: '#FFFFFF',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: 1,
  },
  dismissBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
    borderRadius: 4,
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 10,
    width: '100%',
    borderWidth: 1,
    borderColor: '#FF6B6B',
  },
  dismissBtnText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 2.5,
  },
  footerNoteWrap: {
    marginTop: 18,
    paddingHorizontal: 6,
  },
  safetyNote: {
    fontSize: 10,
    color: '#555555',
    textAlign: 'center',
    lineHeight: 15,
    letterSpacing: 0.3,
  },
});
