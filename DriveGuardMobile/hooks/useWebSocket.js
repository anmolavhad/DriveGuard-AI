import { useState, useEffect, useRef, useCallback } from 'react';

const SEND_INTERVAL_MS  = 150;   // ~7 FPS — 5-frame trigger fires in ~0.75 s
const INITIAL_BACKOFF   = 1000;
const MAX_BACKOFF       = 30000;
const BACKOFF_FACTOR    = 2;
const WS_OPEN           = 1; // WebSocket.OPEN

/**
 * Persistent WebSocket telemetry engine.
 *
 * @param {string|null} serverIp  - Target server IP (e.g. "192.168.1.5")
 * @param {object}      metrics   - Live { ear, mar, status } from fatigue simulator
 * @returns {{ isConnected: boolean, reconnectCount: number, lastSentAt: number|null }}
 */
export function useWebSocket(serverIp, metrics) {
  const [isConnected,     setIsConnected]     = useState(false);
  const [reconnectCount,  setReconnectCount]  = useState(0);
  const [lastSentAt,      setLastSentAt]      = useState(null);

  const wsRef          = useRef(null);
  const backoffRef     = useRef(INITIAL_BACKOFF);
  const reconnTimerRef = useRef(null);
  const sendTimerRef   = useRef(null);
  const metricsRef     = useRef(metrics);
  const serverIpRef    = useRef(serverIp);
  const mountedRef     = useRef(true);

  // Keep refs in sync so closures see fresh values
  useEffect(() => { metricsRef.current = metrics; },  [metrics]);
  useEffect(() => { serverIpRef.current = serverIp; }, [serverIp]);

  const clearTimers = useCallback(() => {
    if (reconnTimerRef.current) { clearTimeout(reconnTimerRef.current);  reconnTimerRef.current = null; }
    if (sendTimerRef.current)   { clearInterval(sendTimerRef.current);   sendTimerRef.current   = null; }
  }, []);

  const sendTelemetry = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WS_OPEN) return;
    const {
      ear, mar, status,
      smoothed_ear, alert_level, alert, severity, closed_frames,
    } = metricsRef.current;
    const payload = {
      source:        'mobile_app',
      ear:           ear           ?? 0.30,
      mar:           mar           ?? 0.06,
      smoothed_ear:  smoothed_ear  ?? ear ?? 0.30,
      status:        status        ?? 'ATTENTIVE',
      alert:         alert         ?? false,
      alert_level:   alert_level   ?? 'NORMAL',
      severity:      severity      ?? 'NORMAL',
      closed_frames: closed_frames ?? 0,
      timestamp:     Math.floor(Date.now() / 1000),
    };
    try {
      ws.send(JSON.stringify(payload));
      if (mountedRef.current) setLastSentAt(Date.now());
    } catch (_) {
      // connection may have dropped; reconnect will be triggered by onclose
    }
  }, []);

  const connect = useCallback(() => {
    const ip = serverIpRef.current;
    if (!ip || !mountedRef.current) return;

    // Clean up any existing socket
    if (wsRef.current) {
      wsRef.current.onopen    = null;
      wsRef.current.onmessage = null;
      wsRef.current.onerror   = null;
      wsRef.current.onclose   = null;
      try { wsRef.current.close(); } catch (_) {}
      wsRef.current = null;
    }

    const url = `ws://${ip}:8000/ws/telemetry`;
    let ws;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      console.warn('[WS] Failed to construct WebSocket:', err.message);
      scheduleReconnect();
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      console.log('[WS] Connected to', url);
      backoffRef.current = INITIAL_BACKOFF;
      setIsConnected(true);
      // Start periodic telemetry
      clearTimers();
      sendTelemetry(); // send immediately on connect
      sendTimerRef.current = setInterval(sendTelemetry, SEND_INTERVAL_MS);
    };

    ws.onmessage = (evt) => {
      // Server can push config/commands — log for now
      try { console.log('[WS] ←', JSON.parse(evt.data)); } catch (_) {}
    };

    ws.onerror = (evt) => {
      console.warn('[WS] Error:', evt.message ?? 'unknown');
    };

    ws.onclose = (evt) => {
      if (!mountedRef.current) return;
      console.log(`[WS] Closed (code=${evt.code}). Reconnecting in ${backoffRef.current}ms…`);
      setIsConnected(false);
      clearTimers();
      scheduleReconnect();
    };
  }, [clearTimers, sendTelemetry]); // eslint-disable-line react-hooks/exhaustive-deps

  const scheduleReconnect = useCallback(() => {
    if (!mountedRef.current) return;
    const delay = backoffRef.current;
    backoffRef.current = Math.min(backoffRef.current * BACKOFF_FACTOR, MAX_BACKOFF);
    setReconnectCount((c) => c + 1);
    reconnTimerRef.current = setTimeout(() => {
      if (mountedRef.current) connect();
    }, delay);
  }, [connect]);

  // Re-connect whenever serverIp changes
  useEffect(() => {
    if (!serverIp) return;
    backoffRef.current = INITIAL_BACKOFF; // reset backoff on new IP
    connect();
  }, [serverIp, connect]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimers();
      if (wsRef.current) {
        wsRef.current.onopen  = null;
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        try { wsRef.current.close(); } catch (_) {}
      }
    };
  }, [clearTimers]);

  return { isConnected, reconnectCount, lastSentAt };
}
