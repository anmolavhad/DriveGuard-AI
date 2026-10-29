import React, { useEffect, useRef, useCallback, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
  Platform,
  Vibration,
} from 'react-native';
// Safe optional require for expo-audio to prevent native module crashes on older runtimes
let ExpoAudio = null;
try {
  ExpoAudio = require('expo-audio');
} catch (e) {
  console.warn('[SleepAlarmModal] expo-audio native module not available, falling back to vibration:', e);
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

/**
 * SleepAlarmModal
 * ────────────────────────────────────────────────────────────────────────────
 * Full-screen emergency alarm that fires when microsleep is detected.
 *
 * Features:
 *  • Plays a loud looping alarm sound (expo-audio with graceful fallback)
 *  • Vibration pattern on Android
 *  • Pulsing red screen flash animation
 *  • Large "STOP ALARM" button to dismiss
 *  • Auto-fades in for maximum visibility
 *
 * Props:
 *   visible   {boolean}    show/hide the modal
 *   onDismiss {() => void} called when user taps "Stop Alarm"
 */
export function SleepAlarmModal({ visible, onDismiss }) {
  const flashAnim   = useRef(new Animated.Value(0)).current;
  const scaleAnim   = useRef(new Animated.Value(0.8)).current;
  const pulseAnim   = useRef(new Animated.Value(1)).current;
  const flashLoop   = useRef(null);
  const pulseLoop   = useRef(null);
  const soundRef    = useRef(null);
  const [secondsActive, setSecondsActive] = useState(0);
  const timerRef    = useRef(null);

  // ── Start alarm sound using expo-audio ─────────────────────────────────────
  const startAlarmSound = useCallback(async () => {
    try {
      if (!ExpoAudio || !ExpoAudio.createAudioPlayer) {
        return;
      }

      if (typeof ExpoAudio.setAudioModeAsync === 'function') {
        await ExpoAudio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          shouldDuckAndroid: false,
          playThroughEarpieceAndroid: false,
        }).catch(() => {});
      }

      const player = ExpoAudio.createAudioPlayer(
        'https://www.soundjay.com/buttons/sounds/beep-07.mp3'
      );
      if (player) {
        player.loop = true;
        if (typeof player.volume !== 'undefined') {
          player.volume = 1.0;
        }
        player.play();
        soundRef.current = player;
      }
    } catch (err) {
      // Fallback: vibration-only if sound fails
      console.warn('[SleepAlarmModal] Sound load failed, using vibration only:', err);
    }
  }, []);

  const stopAlarmSound = useCallback(async () => {
    if (soundRef.current) {
      try {
        if (typeof soundRef.current.pause === 'function') {
          soundRef.current.pause();
        }
        if (typeof soundRef.current.release === 'function') {
          soundRef.current.release();
        }
      } catch (_) {}
      soundRef.current = null;
    }
  }, []);

  // ── Vibration pattern ─────────────────────────────────────────────────────
  const startVibration = useCallback(() => {
    if (Platform.OS === 'android') {
      // [wait, vibrate, wait, vibrate, ...] in ms
      Vibration.vibrate([0, 400, 200, 400, 200, 400], true);
    } else {
      // iOS: simple pattern
      const vibrateIOS = () => Vibration.vibrate();
      vibrateIOS();
    }
  }, []);

  // ── Animations ────────────────────────────────────────────────────────────
  const startAnimations = useCallback(() => {
    // Screen flash (red pulse)
    flashLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(flashAnim, {
          toValue:         0.35,
          duration:        400,
          easing:          Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(flashAnim, {
          toValue:         0.0,
          duration:        500,
          easing:          Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    flashLoop.current.start();

    // Modal entry animation
    Animated.spring(scaleAnim, {
      toValue:         1,
      tension:         80,
      friction:        7,
      useNativeDriver: true,
    }).start();

    // Button pulse
    pulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue:         1.08,
          duration:        600,
          easing:          Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue:         1,
          duration:        600,
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
    scaleAnim.setValue(0.8);
    pulseAnim.setValue(1);
  }, [flashAnim, scaleAnim, pulseAnim]);

  // ── Lifecycle: start/stop based on visibility ─────────────────────────────
  useEffect(() => {
    if (visible) {
      setSecondsActive(0);
      startAnimations();
      startAlarmSound();
      startVibration();

      // Counter for how long alarm has been active
      timerRef.current = setInterval(() => {
        setSecondsActive(s => s + 1);
      }, 1000);
    } else {
      stopAnimations();
      stopAlarmSound();
      Vibration.cancel();
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDismiss = useCallback(() => {
    stopAnimations();
    stopAlarmSound();
    Vibration.cancel();
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    onDismiss?.();
  }, [stopAnimations, stopAlarmSound, onDismiss]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleDismiss}
    >
      {/* Red flash overlay behind everything */}
      <Animated.View
        style={[styles.flashOverlay, { opacity: flashAnim }]}
        pointerEvents="none"
      />

      <View style={styles.backdrop}>
        {/* Main alarm card */}
        <Animated.View style={[styles.card, { transform: [{ scale: scaleAnim }] }]}>

          {/* Warning icon strip */}
          <View style={styles.iconStrip}>
            <Text style={styles.warnIcon}>🚨</Text>
            <Text style={styles.warnIcon}>⚠️</Text>
            <Text style={styles.warnIcon}>🚨</Text>
          </View>

          {/* Title */}
          <Text style={styles.title}>MICROSLEEP DETECTED</Text>

          {/* Subtitle */}
          <Text style={styles.subtitle}>
            You have fallen asleep!{'\n'}Pull over immediately and rest.
          </Text>

          {/* Duration indicator */}
          <View style={styles.durationBadge}>
            <Text style={styles.durationLabel}>ALARM ACTIVE FOR</Text>
            <Text style={styles.durationValue}>{secondsActive}s</Text>
          </View>

          {/* Separator */}
          <View style={styles.separator} />

          {/* STOP ALARM button */}
          <Animated.View style={{ transform: [{ scale: pulseAnim }], width: '100%' }}>
            <TouchableOpacity
              style={styles.stopBtn}
              onPress={handleDismiss}
              activeOpacity={0.85}
            >
              <Text style={styles.stopBtnIcon}>🛑</Text>
              <Text style={styles.stopBtnText}>STOP ALARM</Text>
            </TouchableOpacity>
          </Animated.View>

          {/* Safety note */}
          <Text style={styles.safetyNote}>
            Find a safe place to stop and rest before continuing to drive.
          </Text>

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
    backgroundColor: 'rgba(0, 0, 0, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    zIndex: 1,
  },
  card: {
    backgroundColor: '#0F0A0A',
    borderWidth: 2,
    borderColor: '#EF4444',
    borderRadius: 24,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    width: '100%',
    maxWidth: 380,
    // Red glow
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 30,
    elevation: 20,
  },
  iconStrip: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  warnIcon: {
    fontSize: 36,
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    color: '#EF4444',
    letterSpacing: 1.5,
    textAlign: 'center',
    marginBottom: 14,
    textShadowColor: 'rgba(239, 68, 68, 0.6)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  subtitle: {
    fontSize: 15,
    color: '#F1F5F9',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
    opacity: 0.9,
  },
  durationBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 28,
    alignItems: 'center',
    marginBottom: 20,
  },
  durationLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#EF4444',
    letterSpacing: 2,
    marginBottom: 4,
    opacity: 0.8,
  },
  durationValue: {
    fontSize: 32,
    fontWeight: '900',
    color: '#EF4444',
    letterSpacing: -0.5,
  },
  separator: {
    width: '100%',
    height: 1,
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
    marginBottom: 22,
  },
  stopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 32,
    gap: 10,
    // Inner glow
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.7,
    shadowRadius: 16,
    elevation: 12,
    width: '100%',
  },
  stopBtnIcon: {
    fontSize: 22,
  },
  stopBtnText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  safetyNote: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 18,
    lineHeight: 16,
    paddingHorizontal: 8,
    opacity: 0.7,
  },
});
