/**
 * HistoryScreen.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Scrollable list of past driving sessions.
 * Tap a session card → Detail modal slides up with full stats.
 * Design: Pure Black Minimalist.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
  Modal,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../context/AuthContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const stateColor = (s) => {
  if (s === 'CRITICAL') return '#EF4444';
  if (s === 'WARNING')  return '#F59E0B';
  return '#22C55E';
};
const stateLabel = (s) => {
  if (s === 'CRITICAL') return 'HEAVY SLEEP';
  if (s === 'WARNING')  return 'MILD DROWSY';
  return 'ATTENTIVE';
};
const fmtDuration = (sec, startedAt, endedAt) => {
  let s = Number(sec);
  if ((!s || s <= 0) && startedAt && endedAt) {
    const diff = Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000);
    if (diff > 0) s = diff;
  }
  if (!s || s <= 0) return '0s';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const remainderSec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${remainderSec}s`;
  return `${remainderSec}s`;
};
const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};
const fmtTime = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};

// ─── Session Detail Modal ─────────────────────────────────────────────────────
function SessionDetailModal({ session, onClose }) {
  if (!session) return null;
  const color = stateColor(session.peakState);
  const label = stateLabel(session.peakState);

  return (
    <Modal
      visible={!!session}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={detailStyles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
        <View style={detailStyles.sheet}>
          <View style={detailStyles.handle} />

          {/* Peak state badge */}
          <View style={[detailStyles.badge, { borderColor: color + '55' }]}>
            <View style={[detailStyles.badgeDot, { backgroundColor: color }]} />
            <Text style={[detailStyles.badgeText, { color }]}>{label}</Text>
          </View>

          {/* Date */}
          <Text style={detailStyles.date}>{fmtDate(session.startedAt)}</Text>

          {/* Stats grid */}
          <View style={detailStyles.grid}>
            <StatCell label="START"     value={fmtTime(session.startedAt)} />
            <StatCell label="END"       value={fmtTime(session.endedAt)} />
            <StatCell label="DURATION"  value={fmtDuration(session.durationSec, session.startedAt, session.endedAt)} />
            <StatCell label="SLEEP ALERTS" value={session.totalAlerts ?? 0} accent={session.totalAlerts > 0 ? '#EF4444' : '#22C55E'} />
            <StatCell label="PEAK RISK"    value={label} accent={color} />
            <StatCell label="SESSION ID"   value={session.id?.slice(0, 8) ?? '—'} />
          </View>

          <TouchableOpacity style={detailStyles.closeBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={detailStyles.closeBtnText}>CLOSE</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function StatCell({ label, value, accent }) {
  return (
    <View style={detailStyles.cell}>
      <Text style={detailStyles.cellLabel}>{label}</Text>
      <Text style={[detailStyles.cellValue, accent && { color: accent }]}>{value}</Text>
    </View>
  );
}

const detailStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0A0A0A',
    borderTopWidth: 1,
    borderColor: '#1A1A1A',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 48,
    gap: 16,
  },
  handle: {
    width: 36,
    height: 3,
    backgroundColor: '#222222',
    borderRadius: 999,
    alignSelf: 'center',
    marginBottom: 4,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  badgeDot:  { width: 6, height: 6, borderRadius: 999 },
  badgeText: { fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  date:      { fontSize: 14, color: '#555555', fontWeight: '500' },
  grid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 1 },
  cell: {
    width: '33.33%',
    borderWidth: 1,
    borderColor: '#1A1A1A',
    padding: 14,
    gap: 4,
  },
  cellLabel: { fontSize: 8,  color: '#333333', fontWeight: '800', letterSpacing: 2 },
  cellValue: { fontSize: 16, color: '#FFFFFF', fontWeight: '900', letterSpacing: -0.5 },
  closeBtn:  {
    borderWidth: 1,
    borderColor: '#1A1A1A',
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  closeBtnText: { fontSize: 10, color: '#333333', fontWeight: '800', letterSpacing: 3 },
});

// ─── Session Card ─────────────────────────────────────────────────────────────
function SessionCard({ session, onPress }) {
  const color = stateColor(session.peakState);
  const label = stateLabel(session.peakState);
  return (
    <TouchableOpacity style={cardStyles.card} onPress={onPress} activeOpacity={0.8}>
      <View style={[cardStyles.accentLine, { backgroundColor: color }]} />
      <View style={cardStyles.body}>
        <View style={cardStyles.topRow}>
          <View style={[cardStyles.badge, { borderColor: color + '55' }]}>
            <Text style={[cardStyles.badgeText, { color }]}>{label}</Text>
          </View>
          <Text style={cardStyles.date}>{fmtDate(session.startedAt)}</Text>
        </View>
        <View style={cardStyles.statsRow}>
          <MiniStat label="DURATION" value={fmtDuration(session.durationSec, session.startedAt, session.endedAt)} />
          <View style={cardStyles.divider} />
          <MiniStat label="ALERTS" value={session.totalAlerts ?? 0}
            valueColor={session.totalAlerts > 0 ? '#F59E0B' : '#22C55E'} />
          <View style={cardStyles.divider} />
          <MiniStat label="PEAK RISK" value={label} valueColor={color} />
        </View>
      </View>
      <Text style={cardStyles.chevron}>›</Text>
    </TouchableOpacity>
  );
}

function MiniStat({ label, value, valueColor }) {
  return (
    <View style={cardStyles.stat}>
      <Text style={[cardStyles.statVal, valueColor && { color: valueColor }]}>{value}</Text>
      <Text style={cardStyles.statLabel}>{label}</Text>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: '#000000',
    borderBottomWidth: 1,
    borderColor: '#1A1A1A',
    alignItems: 'center',
  },
  accentLine: { width: 3, alignSelf: 'stretch', flexShrink: 0 },
  body:       { flex: 1, padding: 16, gap: 12 },
  topRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge:      { borderWidth: 1, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 10 },
  badgeText:  { fontSize: 9, fontWeight: '900', letterSpacing: 2 },
  date:       { fontSize: 10, color: '#333333', fontWeight: '500' },
  statsRow:   { flexDirection: 'row', alignItems: 'center' },
  stat:       { flex: 1, alignItems: 'center', gap: 3 },
  statVal:    { fontSize: 16, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.5 },
  statLabel:  { fontSize: 8,  fontWeight: '800', color: '#333333', letterSpacing: 1.5 },
  divider:    { width: 1, height: 28, backgroundColor: '#1A1A1A' },
  chevron:    { fontSize: 22, color: '#222222', paddingHorizontal: 12 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export function HistoryScreen() {
  const { sessions } = useAuth();
  const [selected, setSelected] = useState(null);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.overline}>LOG</Text>
        <Text style={styles.title}>Session History</Text>
        <Text style={styles.subtitle}>{sessions.length} session{sessions.length !== 1 ? 's' : ''} recorded</Text>
      </View>

      {sessions.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>No Sessions Yet</Text>
          <Text style={styles.emptyText}>
            Start your first detection session from the Home tab.
          </Text>
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <SessionCard session={item} onPress={() => setSelected(item)} />
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          style={styles.list}
        />
      )}

      <SessionDetailModal session={selected} onClose={() => setSelected(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  header: {
    paddingTop:        Platform.OS === 'ios' ? 54 : 36,
    paddingHorizontal: 24,
    paddingBottom:     24,
    borderBottomWidth: 1,
    borderColor:       '#1A1A1A',
    gap: 2,
  },
  overline: { fontSize: 9,  color: '#333333', fontWeight: '800', letterSpacing: 3 },
  title:    { fontSize: 32, color: '#FFFFFF', fontWeight: '900', letterSpacing: -1 },
  subtitle: { fontSize: 12, color: '#333333', fontWeight: '500', marginTop: 2 },

  list:        { flex: 1 },
  listContent: { paddingBottom: 48 },

  emptyWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.5 },
  emptyText:  { fontSize: 13, color: '#333333', textAlign: 'center', lineHeight: 20 },
});
