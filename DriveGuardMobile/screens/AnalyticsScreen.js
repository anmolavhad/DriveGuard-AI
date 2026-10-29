/**
 * AnalyticsScreen.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Dedicated analytics dashboard.
 * Design: Pure Black Minimalist — all stats from session history.
 * Metrics: Total monitored hours, avg alert frequency, time-of-day breakdown,
 * drowsiness heat-map by hour, per-state distribution.
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  Dimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../context/AuthContext';

const { width: SW } = Dimensions.get('window');

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtHours = (sec) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

// ─── Mini progress bar ────────────────────────────────────────────────────────
function BarRow({ label, value, max, color, count }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <View style={barStyles.row}>
      <View style={barStyles.labelRow}>
        <Text style={barStyles.label}>{label}</Text>
        <Text style={[barStyles.count, { color }]}>{count}</Text>
      </View>
      <View style={barStyles.track}>
        <View style={[barStyles.fill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const barStyles = StyleSheet.create({
  row:      { gap: 8, marginBottom: 20 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label:    { fontSize: 11, color: '#555555', fontWeight: '600', letterSpacing: 0.3 },
  count:    { fontSize: 15, fontWeight: '900', letterSpacing: -0.5 },
  track:    { height: 2, backgroundColor: '#111111', borderRadius: 999, overflow: 'hidden' },
  fill:     { height: '100%', borderRadius: 999, minWidth: 2 },
});

// ─── Big number stat ──────────────────────────────────────────────────────────
function BigStat({ value, label, sub }) {
  return (
    <View style={bigStyles.block}>
      <Text style={bigStyles.value}>{value}</Text>
      <Text style={bigStyles.label}>{label}</Text>
      {sub ? <Text style={bigStyles.sub}>{sub}</Text> : null}
    </View>
  );
}

const bigStyles = StyleSheet.create({
  block: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#1A1A1A',
    paddingVertical: 20,
    paddingHorizontal: 14,
    alignItems: 'center',
    gap: 4,
  },
  value: { fontSize: 28, fontWeight: '900', color: '#FFFFFF', letterSpacing: -1 },
  label: { fontSize: 9,  fontWeight: '800', color: '#333333', letterSpacing: 2, textAlign: 'center' },
  sub:   { fontSize: 10, color: '#444444', fontWeight: '500' },
});

// ─── Hour heatmap cell ────────────────────────────────────────────────────────
function HeatCell({ hour, intensity }) {
  const opacity = 0.08 + intensity * 0.92;
  const bg = intensity > 0.6 ? '#EF4444'
           : intensity > 0.3 ? '#F59E0B'
           : '#22C55E';
  return (
    <View style={[heatStyles.cell, { backgroundColor: bg, opacity }]}>
      <Text style={heatStyles.cellText}>{hour}</Text>
    </View>
  );
}

const heatStyles = StyleSheet.create({
  cell:     { width: (SW - 48 - 12 * 5) / 6, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  cellText: { fontSize: 8, color: '#000000', fontWeight: '900' },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export function AnalyticsScreen() {
  const { sessions } = useAuth();

  const analytics = useMemo(() => {
    const total    = sessions.length;
    const alerts   = sessions.reduce((a, s) => a + (s.totalAlerts ?? 0), 0);
    const critical = sessions.filter((s) => s.peakState === 'CRITICAL').length;
    const warning  = sessions.filter((s) => s.peakState === 'WARNING').length;
    const safe     = sessions.filter((s) => s.peakState === 'AWAKE').length;
    const totalSec = sessions.reduce((a, s) => a + (s.durationSec ?? 0), 0);
    const avgDurSec = total > 0 ? Math.round(totalSec / total) : 0;
    const alertRate = total > 0 ? (alerts / total).toFixed(1) : '0.0';
    const safeRate  = total > 0 ? Math.round((safe / total) * 100) : 100;

    // Build hour-of-day heatmap from startedAt
    const hourBuckets = new Array(24).fill(0);
    sessions.forEach((s) => {
      if (s.startedAt) {
        const h = new Date(s.startedAt).getHours();
        hourBuckets[h] += (s.totalAlerts ?? 0) + (s.peakState === 'CRITICAL' ? 2 : s.peakState === 'WARNING' ? 1 : 0);
      }
    });
    const maxBucket = Math.max(...hourBuckets, 1);
    const heatmap = hourBuckets.map((v, i) => ({ hour: i, intensity: v / maxBucket }));

    return { total, alerts, critical, warning, safe, totalSec, avgDurSec, alertRate, safeRate, heatmap };
  }, [sessions]);

  // Select 18 hours for the heatmap display (06:00 – 23:00)
  const displayHours = analytics.heatmap.filter((h) => h.hour >= 6);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <Text style={styles.overline}>INSIGHTS</Text>
          <Text style={styles.title}>Analytics</Text>
        </View>

        {/* ── Big numbers row ── */}
        <View style={styles.bigRow}>
          <BigStat value={analytics.total}        label="SESSIONS" />
          <BigStat value={fmtHours(analytics.totalSec)} label="MONITORED" sub="total hours" />
          <BigStat value={`${analytics.safeRate}%`}    label="SAFE RATE" />
        </View>

        {/* ── Section: State breakdown ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionOverline}>BREAKDOWN</Text>
          <Text style={styles.sectionTitle}>Session States</Text>
        </View>

        <View style={styles.card}>
          {analytics.total === 0 ? (
            <EmptyState message="No sessions recorded yet." />
          ) : (
            <>
              <BarRow
                label="Heavy Sleep Events"
                value={analytics.critical}
                max={analytics.total}
                color="#EF4444"
                count={analytics.critical}
              />
              <BarRow
                label="Mild Drowsiness Events"
                value={analytics.warning}
                max={analytics.total}
                color="#F59E0B"
                count={analytics.warning}
              />
              <BarRow
                label="Fully Alert Sessions"
                value={analytics.safe}
                max={analytics.total}
                color="#22C55E"
                count={analytics.safe}
              />
            </>
          )}
        </View>

        {/* ── Section: Alert metrics ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionOverline}>FREQUENCY</Text>
          <Text style={styles.sectionTitle}>Alert Metrics</Text>
        </View>

        <View style={[styles.bigRow, { marginBottom: 48 }]}>
          <BigStat value={analytics.alerts}    label="TOTAL ALERTS" />
          <BigStat value={analytics.alertRate} label="ALERTS / SESSION" sub="average" />
          <BigStat value={fmtHours(analytics.avgDurSec)} label="AVG DURATION" />
        </View>

        {/* ── Section: Time of day heatmap ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionOverline}>HEATMAP</Text>
          <Text style={styles.sectionTitle}>Time of Day Risk</Text>
        </View>

        <View style={styles.card}>
          {analytics.total === 0 ? (
            <EmptyState message="Drive at least one session to see the heatmap." />
          ) : (
            <>
              <Text style={styles.heatSubtitle}>
                Darker cells = higher fatigue risk by hour of day
              </Text>
              <View style={styles.heatGrid}>
                {displayHours.map(({ hour, intensity }) => (
                  <HeatCell key={hour} hour={`${hour}h`} intensity={intensity} />
                ))}
              </View>
              <View style={styles.heatLegend}>
                <View style={styles.heatLegendItem}>
                  <View style={[styles.heatLegendDot, { backgroundColor: '#22C55E' }]} />
                  <Text style={styles.heatLegendText}>Low risk</Text>
                </View>
                <View style={styles.heatLegendItem}>
                  <View style={[styles.heatLegendDot, { backgroundColor: '#F59E0B' }]} />
                  <Text style={styles.heatLegendText}>Moderate</Text>
                </View>
                <View style={styles.heatLegendItem}>
                  <View style={[styles.heatLegendDot, { backgroundColor: '#EF4444' }]} />
                  <Text style={styles.heatLegendText}>High risk</Text>
                </View>
              </View>
            </>
          )}
        </View>

        <View style={{ height: 48 }} />
      </ScrollView>
    </View>
  );
}

function EmptyState({ message }) {
  return (
    <View style={emptyStyles.wrap}>
      <Text style={emptyStyles.title}>No Data</Text>
      <Text style={emptyStyles.sub}>{message}</Text>
    </View>
  );
}

const emptyStyles = StyleSheet.create({
  wrap:  { alignItems: 'center', paddingVertical: 20, gap: 8 },
  title: { fontSize: 15, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.5 },
  sub:   { fontSize: 12, color: '#333333', textAlign: 'center', lineHeight: 18 },
});

const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: '#000000' },
  scroll:        { flex: 1 },
  scrollContent: {
    paddingTop:        Platform.OS === 'ios' ? 54 : 36,
    paddingHorizontal: 24,
    paddingBottom:     20,
  },
  header: { marginBottom: 32, gap: 2 },
  overline: { fontSize: 9, color: '#333333', fontWeight: '800', letterSpacing: 3 },
  title:    { fontSize: 32, fontWeight: '900', color: '#FFFFFF', letterSpacing: -1 },

  bigRow: { flexDirection: 'row', gap: 1, marginBottom: 48 },

  sectionHeader: { marginBottom: 16, gap: 2 },
  sectionOverline: { fontSize: 9, color: '#333333', fontWeight: '800', letterSpacing: 3 },
  sectionTitle:    { fontSize: 20, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.8 },

  card: {
    borderWidth: 1,
    borderColor: '#1A1A1A',
    padding: 20,
    marginBottom: 48,
  },

  heatSubtitle: { fontSize: 10, color: '#333333', marginBottom: 16, letterSpacing: 0.3 },
  heatGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  heatLegend: { flexDirection: 'row', gap: 20, marginTop: 16 },
  heatLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heatLegendDot:  { width: 6, height: 6, borderRadius: 999 },
  heatLegendText: { fontSize: 9, color: '#444444', fontWeight: '600', letterSpacing: 1 },
});
