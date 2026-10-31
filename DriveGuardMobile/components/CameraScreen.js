/**
 * CameraScreen.js — REFACTORED (SDK 58 + Re-render Bug Fix)
 * ─────────────────────────────────────────────────────────────────────────────
 * BUG FIX: The blinking/glitching was caused by `setTelemetry` on every
 * WebSocket frame (~8 FPS) triggering full-tree re-renders including the
 * CameraView. Fix:
 *   1. Split state: slow-changing UI state (fatigueState, isConnected) is
 *      stored in useState; fast telemetry refs (EAR values, landmarks) are
 *      kept in useRef and NEVER trigger re-renders.
 *   2. SVG overlay is a separate React.memo component driven by a separate
 *      slow-update cycle (requestAnimationFrame / 200ms throttle), not the
 *      WS frame rate.
 *   3. CameraView is wrapped in React.memo with no changing props — it
 *      never re-renders after mount.
 *
 * UI CLEANUP:
 *   - Removed debug ribbon (blinks, latency, face searching, session stats).
 *   - Camera feed is completely clean — only the SVG face mesh overlays.
 *   - 4 minimal floating controls: End | Sleep Alerts | Duration | Pause/Resume
 *   - Status banner (AWAKE / WARNING / CRITICAL) remains as a slim pill.
 */

import React, {
  useState, useEffect, useCallback, useRef, useMemo, memo,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
  Platform,
  Vibration,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Svg, { Path, Circle, G, Defs, LinearGradient, Stop, Ellipse, Line, Rect, Text as SvgText } from 'react-native-svg';
import { useAuth } from '../context/AuthContext';

const { width: SW, height: SH } = Dimensions.get('window');
const FRAME_SEND_INTERVAL_MS    = 120; // ~8 FPS to backend
const SVG_UPDATE_INTERVAL_MS    = 200; // SVG overlay refresh rate (decoupled from camera)

export function resolveWsUrl(serverInput, endpoint = '/ws/camera') {
  if (!serverInput) return '';
  const trimmed = serverInput.trim().replace(/\/+$/, '');
  if (trimmed.startsWith('wss://') || trimmed.startsWith('ws://')) {
    return `${trimmed}${endpoint}`;
  }
  if (trimmed.startsWith('https://')) {
    return trimmed.replace('https://', 'wss://') + endpoint;
  }
  if (trimmed.startsWith('http://')) {
    return trimmed.replace('http://', 'ws://') + endpoint;
  }
  if (trimmed.includes(':')) {
    return `ws://${trimmed}${endpoint}`;
  }
  if (trimmed.includes('.') && !trimmed.match(/^\d+\.\d+\.\d+\.\d+$/)) {
    return `wss://${trimmed}${endpoint}`;
  }
  return `ws://${trimmed}:8000${endpoint}`;
}

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS = {
  CALIBRATING: { text: 'Calibrating',          color: '#94A3B8', eyeColor: '#00D9FF' },
  AWAKE:       { text: 'Alert',                 color: '#22C55E', eyeColor: '#00D9FF' },
  WARNING:     { text: 'Drowsiness Detected',   color: '#F59E0B', eyeColor: '#F59E0B' },
  CRITICAL:    { text: 'Heavy Sleep Detected!', color: '#EF4444', eyeColor: '#EF4444' },
};


// ─── Stable CameraView — memo'd with no props → never re-renders ──────────────
const StableCameraView = memo(({ cameraRef }) => (
  <CameraView
    ref={cameraRef}
    style={StyleSheet.absoluteFill}
    facing="front"
  />
), () => true); // always return true = never re-render

// ─── SVG overlay — driven by slow-update ref snapshot ─────────────────────────
const FaceMeshOverlay = memo(({ landmarks, fatigueState }) => {
  const cfg = STATUS[fatigueState] ?? STATUS.AWAKE;
  const eyeClr  = cfg.eyeColor;
  const meshClr = fatigueState === 'CRITICAL' ? '#EF4444'
                : fatigueState === 'WARNING'  ? '#F59E0B'
                : '#00D9FF'; // bright cyan for AWAKE/CALIBRATING

  const mapPt = (pt) => {
    const cx = Math.max(0, Math.min(1, pt.x));
    const cy = Math.max(0, Math.min(1, pt.y));
    return { x: (1 - cx) * SW, y: cy * SH };
  };

  const buildPath = (pts) => {
    if (!pts?.length) return '';
    return pts.map((p, i) => {
      const { x, y } = mapPt(p);
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ') + ' Z';
  };

  const getBox = (pts) => {
    if (!pts?.length) return null;
    const mapped = pts.map(mapPt);
    const xs = mapped.map((p) => p.x);
    const ys = mapped.map((p) => p.y);
    const pad = 10;
    const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad;
    const minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad;
    return {
      x: minX, y: minY,
      w: Math.max(28, maxX - minX),
      h: Math.max(22, maxY - minY),
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
      rx: Math.max(14, (maxX - minX) / 2),
      ry: Math.max(10, (maxY - minY) / 2),
    };
  };

  const getCentroid = (pts) => {
    if (!pts?.length) return null;
    const mapped = pts.map(mapPt);
    return {
      x: mapped.reduce((s, p) => s + p.x, 0) / mapped.length,
      y: mapped.reduce((s, p) => s + p.y, 0) / mapped.length,
    };
  };

  const reticle = (b, len = 10) => {
    if (!b) return '';
    const { x, y, w, h } = b;
    return `M ${x},${y + len} L ${x},${y} L ${x + len},${y}
            M ${x + w - len},${y} L ${x + w},${y} L ${x + w},${y + len}
            M ${x + w},${y + h - len} L ${x + w},${y + h} L ${x + w - len},${y + h}
            M ${x + len},${y + h} L ${x},${y + h} L ${x},${y + h - len}`;
  };

  // No face detected — show positioning guide with corner brackets
  if (!landmarks) {
    return (
      <Svg width={SW} height={SH} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="scanGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%"   stopColor={meshClr} stopOpacity="0" />
            <Stop offset="50%"  stopColor={meshClr} stopOpacity="0.08" />
            <Stop offset="100%" stopColor={meshClr} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        {/* Face positioning guide ellipse */}
        <Ellipse
          cx={SW / 2} cy={SH * 0.40}
          rx={SW * 0.30} ry={SH * 0.21}
          stroke={meshClr} strokeWidth={1.5} strokeDasharray="8,6"
          fill="transparent" opacity={0.35}
        />
        {/* Corner bracket top-left */}
        <Path
          d={`M ${SW * 0.5 - 46},${SH * 0.21} L ${SW * 0.5 - 66},${SH * 0.21} L ${SW * 0.5 - 66},${SH * 0.245}`}
          stroke={meshClr} strokeWidth={2} fill="transparent" opacity={0.65}
        />
        {/* Corner bracket top-right */}
        <Path
          d={`M ${SW * 0.5 + 46},${SH * 0.21} L ${SW * 0.5 + 66},${SH * 0.21} L ${SW * 0.5 + 66},${SH * 0.245}`}
          stroke={meshClr} strokeWidth={2} fill="transparent" opacity={0.65}
        />
        {/* Corner bracket bottom-left */}
        <Path
          d={`M ${SW * 0.5 - 46},${SH * 0.59} L ${SW * 0.5 - 66},${SH * 0.59} L ${SW * 0.5 - 66},${SH * 0.565}`}
          stroke={meshClr} strokeWidth={2} fill="transparent" opacity={0.65}
        />
        {/* Corner bracket bottom-right */}
        <Path
          d={`M ${SW * 0.5 + 46},${SH * 0.59} L ${SW * 0.5 + 66},${SH * 0.59} L ${SW * 0.5 + 66},${SH * 0.565}`}
          stroke={meshClr} strokeWidth={2} fill="transparent" opacity={0.65}
        />
        {/* Center crosshair */}
        <Line x1={SW / 2 - 14} y1={SH * 0.40} x2={SW / 2 + 14} y2={SH * 0.40}
          stroke={meshClr} strokeWidth={1} opacity={0.4} />
        <Line x1={SW / 2} y1={SH * 0.40 - 14} x2={SW / 2} y2={SH * 0.40 + 14}
          stroke={meshClr} strokeWidth={1} opacity={0.4} />
        <Circle cx={SW / 2} cy={SH * 0.40} r={3} fill={meshClr} opacity={0.3} />
      </Svg>
    );
  }

  const leftPath  = buildPath(landmarks.left_eye);
  const rightPath = buildPath(landmarks.right_eye);
  const jawPath   = buildPath(landmarks.jawline);
  const leftBox   = getBox(landmarks.left_eye);
  const rightBox  = getBox(landmarks.right_eye);
  const leftCenter  = getCentroid(landmarks.left_eye);
  const rightCenter = getCentroid(landmarks.right_eye);
  const faceBox     = getBox(landmarks.jawline);
  const faceCx      = faceBox ? faceBox.cx : SW / 2;
  const faceCy      = faceBox ? faceBox.cy : SH * 0.4;

  return (
    <Svg width={SW} height={SH} style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="fg" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%"   stopColor={meshClr} stopOpacity="0.18" />
          <Stop offset="100%" stopColor={meshClr} stopOpacity="0.03" />
        </LinearGradient>
        <LinearGradient id="eyeGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%"   stopColor={eyeClr} stopOpacity="0.35" />
          <Stop offset="100%" stopColor={eyeClr} stopOpacity="0.05" />
        </LinearGradient>
      </Defs>

      {/* Jaw / face contour */}
      {!!jawPath && (
        <Path d={jawPath} stroke={meshClr} strokeWidth={1.2}
          strokeDasharray="6,5" fill="url(#fg)" opacity={0.5} />
      )}

      {/* Eye filled polygons with gradient */}
      {!!leftPath  && <Path d={leftPath}  stroke={eyeClr} strokeWidth={2.5} fill="url(#eyeGrad)" opacity={0.92} />}
      {!!rightPath && <Path d={rightPath} stroke={eyeClr} strokeWidth={2.5} fill="url(#eyeGrad)" opacity={0.92} />}

      {/* Eye outer glow rings */}
      {leftBox && (
        <G>
          {/* Outer halo */}
          <Ellipse cx={leftBox.cx} cy={leftBox.cy} rx={leftBox.rx + 10} ry={leftBox.ry + 8}
            stroke={eyeClr} strokeWidth={0.6} fill="transparent" opacity={0.18} />
          {/* Inner dashed ellipse */}
          <Ellipse cx={leftBox.cx} cy={leftBox.cy} rx={leftBox.rx + 4} ry={leftBox.ry + 4}
            stroke={eyeClr} strokeWidth={1.2} fill="transparent" opacity={0.5} strokeDasharray="4,3" />
          {/* Corner reticle */}
          <Path d={reticle(leftBox)} stroke={eyeClr} strokeWidth={2} fill="transparent" />
          {/* Iris center dot */}
          {leftCenter && <Circle cx={leftCenter.x} cy={leftCenter.y} r={3.5} fill={eyeClr} opacity={0.85} />}
          {leftCenter && <Circle cx={leftCenter.x} cy={leftCenter.y} r={7} stroke={eyeClr} strokeWidth={0.8} fill="transparent" opacity={0.3} />}
        </G>
      )}
      {rightBox && (
        <G>
          <Ellipse cx={rightBox.cx} cy={rightBox.cy} rx={rightBox.rx + 10} ry={rightBox.ry + 8}
            stroke={eyeClr} strokeWidth={0.6} fill="transparent" opacity={0.18} />
          <Ellipse cx={rightBox.cx} cy={rightBox.cy} rx={rightBox.rx + 4} ry={rightBox.ry + 4}
            stroke={eyeClr} strokeWidth={1.2} fill="transparent" opacity={0.5} strokeDasharray="4,3" />
          <Path d={reticle(rightBox)} stroke={eyeClr} strokeWidth={2} fill="transparent" />
          {rightCenter && <Circle cx={rightCenter.x} cy={rightCenter.y} r={3.5} fill={eyeClr} opacity={0.85} />}
          {rightCenter && <Circle cx={rightCenter.x} cy={rightCenter.y} r={7} stroke={eyeClr} strokeWidth={0.8} fill="transparent" opacity={0.3} />}
        </G>
      )}

      {/* Landmark dots */}
      {landmarks.left_eye?.map((pt, i) => {
        const { x, y } = mapPt(pt);
        return <Circle key={`l${i}`} cx={x} cy={y} r={3} fill={eyeClr} stroke="#000000" strokeWidth={0.5} opacity={0.85} />;
      })}
      {landmarks.right_eye?.map((pt, i) => {
        const { x, y } = mapPt(pt);
        return <Circle key={`r${i}`} cx={x} cy={y} r={3} fill={eyeClr} stroke="#000000" strokeWidth={0.5} opacity={0.85} />;
      })}

      {/* Face center tracking dot */}
      <Circle cx={faceCx} cy={faceCy} r={8} stroke={meshClr} strokeWidth={1.5} fill="transparent" opacity={0.35} />
      <Circle cx={faceCx} cy={faceCy} r={3} fill={meshClr} opacity={0.6} />

      {/* Face bounding box reticle from jawline */}
      {faceBox && (
        <Path d={reticle({ x: faceBox.x, y: faceBox.y, w: faceBox.w, h: faceBox.h }, 18)}
          stroke={meshClr} strokeWidth={1.5} fill="transparent" opacity={0.5} />
      )}
    </Svg>
  );
});


// ─── Main CameraScreen ────────────────────────────────────────────────────────
export function CameraScreen({ route, navigation, onCriticalAlarm }) {
  const serverIpFromRoute = route?.params?.serverIp || 'driveguard-backend-h430.onrender.com';
  const { user, saveSession } = useAuth();

  const [permission, requestPermission] = useCameraPermissions();

  // ── SLOW state — only UI-visible things, updated at human-visible rate ──
  const [fatigueState, setFatigueState]   = useState('CALIBRATING');
  const [isConnected, setIsConnected]     = useState(false);
  const [reconnectCount, setReconnectCount] = useState(0);
  const [isPaused, setIsPaused]           = useState(false);
  const [sleepAlerts, setSleepAlerts]     = useState(0);
  const [durationSec, setDurationSec]     = useState(0);

  // ── SVG landmark snapshot — updated on a slow timer, NOT on every frame ─
  const [svgLandmarks, setSvgLandmarks]   = useState(null);
  const [svgState, setSvgState]           = useState('CALIBRATING');

  // ── Fast refs — NEVER trigger re-renders ──────────────────────────────────
  const latestTelemetryRef  = useRef(null);  // raw WS data
  const isPausedRef         = useRef(false);
  const cameraRef           = useRef(null);
  const wsRef               = useRef(null);
  const isCapturingRef      = useRef(false);
  const streamTimerRef      = useRef(null);
  const svgTimerRef         = useRef(null);
  const mountedRef          = useRef(true);

  // ── Session tracking refs ─────────────────────────────────────────────────
  const sessionStartRef  = useRef(new Date().toISOString());
  const totalAlertsRef   = useRef(0);
  const peakStateRef     = useRef('AWAKE');
  const sessionSecRef    = useRef(0);
  const sessionTimerRef  = useRef(null);
  const sessionSavedRef  = useRef(false);
  const saveSessionRef   = useRef(saveSession);
  useEffect(() => { saveSessionRef.current = saveSession; }, [saveSession]);
  const serverIp         = useRef(serverIpFromRoute || 'driveguard-backend-h430.onrender.com').current;

  // ── State order for peak tracking ─────────────────────────────────────────
  const STATE_ORDER = { AWAKE: 0, CALIBRATING: 0, WARNING: 1, CRITICAL: 2 };

  // ── Mount: session clock ───────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    sessionSecRef.current = 0;

    // Duration display — update every second (acceptable re-render rate)
    sessionTimerRef.current = setInterval(() => {
      if (!isPausedRef.current) {
        sessionSecRef.current += 1;
        setDurationSec(sessionSecRef.current);
      }
    }, 1000);

    // SVG overlay slow-poll — decoupled from WS frame rate
    svgTimerRef.current = setInterval(() => {
      if (!mountedRef.current) return;
      const t = latestTelemetryRef.current;
      if (t) {
        setSvgLandmarks(t.landmarks ?? null);
        setSvgState(t.state ?? 'AWAKE');
      }
    }, SVG_UPDATE_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      clearInterval(sessionTimerRef.current);
      clearInterval(svgTimerRef.current);
      if (!sessionSavedRef.current && sessionSecRef.current >= 3) {
        sessionSavedRef.current = true;
        saveSessionRef.current?.({
          startedAt:   sessionStartRef.current,
          endedAt:     new Date().toISOString(),
          totalAlerts: totalAlertsRef.current,
          peakState:   peakStateRef.current,
          durationSec: Math.max(1, sessionSecRef.current),
        });
      }
    };
  }, []);

  // ── Pulse animation for warning/critical banner ────────────────────────────
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let anim = null;
    if (fatigueState === 'WARNING' || fatigueState === 'CRITICAL') {
      anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.4, duration: 300, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 300, useNativeDriver: true }),
        ])
      );
      anim.start();
    } else {
      pulseAnim.setValue(1);
    }
    return () => { if (anim) anim.stop(); };
  }, [fatigueState, pulseAnim]);

  // ── WebSocket connection ───────────────────────────────────────────────────
  useEffect(() => {
    if (!serverIp) return;
    let ws = null;
    let reconnectTimeout = null;

    const connect = () => {
      try {
        const wsUrl = resolveWsUrl(serverIp, '/ws/camera');
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!mountedRef.current) return;
          setIsConnected(true);
          setReconnectCount(0);
        };

        ws.onmessage = (event) => {
          if (!mountedRef.current) return;
          if (isPausedRef.current) return; // discard frames while paused
          try {
            const data = JSON.parse(event.data);

            // Store in ref — NO setState here (this is the blinking fix)
            latestTelemetryRef.current = data;

            // Update SLOW UI state only when value actually changes
            const newState = data.state ?? 'AWAKE';
            setFatigueState((prev) => {
              if (prev === newState) return prev; // no re-render if same
              return newState;
            });

            // Track session aggregates in refs — no setState
            if ((STATE_ORDER[data.state] ?? -1) > (STATE_ORDER[peakStateRef.current] ?? -1)) {
              peakStateRef.current = data.state;
            }
            if (data.alert) {
              totalAlertsRef.current += 1;
              // setSleepAlerts batched — only update displayed integer
              setSleepAlerts(totalAlertsRef.current);
            }

            if (data.state === 'WARNING') {
              try { Vibration.vibrate(200); } catch (_) {}
            } else if (data.state === 'CRITICAL' || data.alarm) {
              try { Vibration.vibrate([0, 450, 200, 450], true); } catch (_) {}
              if (onCriticalAlarm) onCriticalAlarm();
            }
            if (data.blink_count != null) blinkCountRef.current = data.blink_count;
          } catch (_) {}
        };

        ws.onclose = () => {
          if (!mountedRef.current) return;
          setIsConnected(false);
          setReconnectCount((c) => c + 1);
          reconnectTimeout = setTimeout(() => {
            if (mountedRef.current) connect();
          }, 2500);
        };

        ws.onerror = () => setIsConnected(false);
      } catch (_) {}
    };

    connect();
    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) {
        ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
        try { ws.close(); } catch (_) {}
      }
      wsRef.current = null;
    };
  }, [serverIp]);

  // ── Frame streaming ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isConnected || !permission?.granted) {
      if (streamTimerRef.current) clearInterval(streamTimerRef.current);
      return;
    }

    const captureAndSend = async () => {
      if (isCapturingRef.current) return;
      if (isPausedRef.current) return;
      if (!cameraRef.current) return;
      if (wsRef.current?.readyState !== WebSocket.OPEN) return;

      isCapturingRef.current = true;
      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.15, base64: true, shutterSound: false, skipProcessing: true,
        });
        if (photo?.base64 && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            image: photo.base64,
            timestamp: Date.now(),
            driver_code: user?.driverCode,
            driver_id: user?.displayName,
          }));
        }
      } catch (_) {
      } finally {
        isCapturingRef.current = false;
      }
    };

    const startDelay = setTimeout(() => {
      if (!mountedRef.current) return;
      captureAndSend();
      streamTimerRef.current = setInterval(captureAndSend, FRAME_SEND_INTERVAL_MS);
    }, 1500);

    return () => {
      clearTimeout(startDelay);
      if (streamTimerRef.current) clearInterval(streamTimerRef.current);
    };
  }, [isConnected, permission?.granted]);

  // ── Pause / Resume ─────────────────────────────────────────────────────────
  const handlePauseResume = useCallback(() => {
    setIsPaused((prev) => {
      isPausedRef.current = !prev;
      return !prev;
    });
  }, []);

  // ── End session ────────────────────────────────────────────────────────────
  const handleEndSession = useCallback(() => {
    if (!sessionSavedRef.current) {
      sessionSavedRef.current = true;
      saveSession({
        startedAt:   sessionStartRef.current,
        endedAt:     new Date().toISOString(),
        totalAlerts: totalAlertsRef.current,
        peakState:   peakStateRef.current,
        durationSec: Math.max(1, sessionSecRef.current),
      });
    }
    navigation?.goBack();
  }, [saveSession, navigation]);

  // ── Recalibrate ────────────────────────────────────────────────────────────
  const handleRecalibrate = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        action: 'calibrate',
        driver_code: user?.driverCode,
        driver_id: user?.displayName,
      }));
      setFatigueState('CALIBRATING');
    }
  }, [user]);

  // ── Format duration ────────────────────────────────────────────────────────
  const fmtDuration = (sec) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // ── Permission gate ────────────────────────────────────────────────────────
  if (!permission?.granted) {
    return (
      <View style={styles.permScreen}>
        <StatusBar style="light" />
        <Text style={styles.permTitle}>Camera Access Required</Text>
        <Text style={styles.permSub}>
          DriveGuard AI requires the front camera to detect driver fatigue in real time.
        </Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission} activeOpacity={0.8}>
          <Text style={styles.permBtnText}>GRANT PERMISSION</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backLink} onPress={() => navigation?.goBack()}>
          <Text style={styles.backLinkText}>← Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const cfg = STATUS[fatigueState] ?? STATUS.AWAKE;

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar style="light" translucent />

      {/* ── 1. Camera — stable, never re-renders ─────────────────────── */}
      <StableCameraView cameraRef={cameraRef} />

      {/* ── 2. SVG Face mesh — slow-updated, decoupled from WS ──────── */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <FaceMeshOverlay landmarks={svgLandmarks} fatigueState={svgState} />
      </View>

      {/* ── 3. Paused dim overlay ────────────────────────────────────── */}
      {isPaused && (
        <View style={styles.pausedOverlay} pointerEvents="none">
          <Text style={styles.pausedText}>PAUSED</Text>
        </View>
      )}

      {/* ── 4. HUD Controls ──────────────────────────────────────────── */}
      <View style={styles.hud} pointerEvents="box-none">

        {/* ── Top row: End + Connection status ── */}
        <View style={styles.topRow}>
          <TouchableOpacity style={styles.endBtn} onPress={handleEndSession} activeOpacity={0.8}>
            <Text style={styles.endBtnText}>END</Text>
          </TouchableOpacity>

          {/* Connection indicator */}
          <View style={[styles.connPill, { borderColor: isConnected ? '#22C55E44' : '#EF444444' }]}>
            <View style={[styles.connDot, { backgroundColor: isConnected ? '#22C55E' : '#EF4444' }]} />
            <Text style={[styles.connText, { color: isConnected ? '#22C55E' : '#EF4444' }]}>
              {isConnected ? 'LIVE' : reconnectCount > 0 ? `RETRY ${reconnectCount}` : 'NO SERVER'}
            </Text>
          </View>

          {/* Recalibrate */}
          <TouchableOpacity style={styles.calBtn} onPress={handleRecalibrate} activeOpacity={0.8}>
            <Text style={styles.calBtnText}>CAL</Text>
          </TouchableOpacity>
        </View>

        {/* ── Spacer pushes bottom controls down ── */}
        <View style={{ flex: 1 }} pointerEvents="none" />

        {/* ── Status pill ── */}
        <Animated.View style={[styles.statusPill, { borderColor: cfg.color + '55', opacity: pulseAnim }]}>
          <View style={[styles.statusDot, { backgroundColor: cfg.color }]} />
          <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.text.toUpperCase()}</Text>
        </Animated.View>

        {/* ── Bottom 3 metric pills + Pause ── */}
        <View style={styles.bottomRow}>
          {/* Sleep Alerts */}
          <View style={styles.metricPill}>
            <Text style={styles.metricLabel}>SLEEP ALERTS</Text>
            <Text style={[styles.metricValue, { color: sleepAlerts > 0 ? '#EF4444' : '#FFFFFF' }]}>
              {sleepAlerts}
            </Text>
          </View>

          {/* Duration */}
          <View style={styles.metricPill}>
            <Text style={styles.metricLabel}>DURATION</Text>
            <Text style={styles.metricValue}>{fmtDuration(durationSec)}</Text>
          </View>

          {/* Pause / Resume */}
          <TouchableOpacity
            style={[styles.metricPill, styles.pauseBtn, isPaused && styles.pauseBtnActive]}
            onPress={handlePauseResume}
            activeOpacity={0.8}
          >
            <Text style={styles.metricLabel}>{isPaused ? 'RESUME' : 'PAUSE'}</Text>
            <Text style={[styles.metricValue, isPaused && { color: '#F59E0B' }]}>
              {isPaused ? '▶' : '⏸'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },

  // ── HUD ───────────────────────────────────────────────────────────────────
  hud: {
    ...StyleSheet.absoluteFillObject,
    paddingTop:        Platform.OS === 'ios' ? 54 : 36,
    paddingBottom:     Platform.OS === 'ios' ? 36 : 24,
    paddingHorizontal: 16,
    justifyContent:    'space-between',
  },

  // ── Top row ───────────────────────────────────────────────────────────────
  topRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
  endBtn: {
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: 999,
    paddingVertical:   8,
    paddingHorizontal: 20,
  },
  endBtnText: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2.5,
  },
  connPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical:   7,
    paddingHorizontal: 14,
  },
  connDot:  { width: 5, height: 5, borderRadius: 999 },
  connText: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  calBtn: {
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 999,
    paddingVertical:   8,
    paddingHorizontal: 16,
  },
  calBtnText: { color: '#555555', fontSize: 10, fontWeight: '800', letterSpacing: 2 },

  // ── Status pill ───────────────────────────────────────────────────────────
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.80)',
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical:   10,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  statusDot:  { width: 6, height: 6, borderRadius: 999 },
  statusText: { fontSize: 11, fontWeight: '900', letterSpacing: 2 },

  // ── Bottom metric pills ───────────────────────────────────────────────────
  bottomRow: {
    flexDirection: 'row',
    gap: 8,
  },
  metricPill: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.80)',
    borderWidth: 1,
    borderColor: '#1A1A1A',
    borderRadius: 0,
    paddingVertical:   12,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 4,
  },
  metricLabel: {
    fontSize: 8,
    color: '#444444',
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  pauseBtn:       { borderColor: '#222222' },
  pauseBtnActive: { borderColor: '#F59E0B44', backgroundColor: 'rgba(245,158,11,0.08)' },

  // ── Paused overlay ────────────────────────────────────────────────────────
  pausedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pausedText: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 8,
    opacity: 0.6,
  },

  // ── Permission screen ─────────────────────────────────────────────────────
  permScreen: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  permTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.8,
  },
  permSub: {
    fontSize: 13,
    color: '#444444',
    textAlign: 'center',
    lineHeight: 20,
  },
  permBtn: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 999,
    marginTop: 8,
  },
  permBtnText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2.5,
  },
  backLink:     { marginTop: 8 },
  backLinkText: { color: '#333333', fontSize: 13, fontWeight: '600', letterSpacing: 0.5 },
});
