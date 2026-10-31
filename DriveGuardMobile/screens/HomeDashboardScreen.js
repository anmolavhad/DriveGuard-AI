/**
 * HomeDashboardScreen.js
 * ─────────────────────────────────────────────────────────────────────────────
 * The main hub after authentication.
 * Design: High-Contrast Minimalist Dark — Pure Black, White Typography,
 * Sharp edges, 1px ultra-dark borders, zero drop shadows, macro padding.
 *
 * Shows:
 *  - Custom inline top-bar (no React Navigation header)
 *  - Personalised greeting & user info
 *  - "Start Detection" CTA → navigates to CameraScreen
 *  - Quick-stats (Total sessions, Total alerts, Safe rate)
 *  - Fatigue Analytics summary with progress bars
 *  - Recent Driving Sessions list
 */

import React, { useMemo, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../context/AuthContext';
import { IPConfigModal } from '../components/IPConfigModal';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SW } = Dimensions.get('window');
const IP_KEY = '@driveguard_server_ip';

// ─── Status helpers ───────────────────────────────────────────────────────────
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

const formatDuration = (sec) => {
  if (!sec || sec <= 0) return '0s';
  const s = Math.round(Number(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const remainderSec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${remainderSec}s`;
  return `${remainderSec}s`;
};

const formatDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// ─── StatBlock ────────────────────────────────────────────────────────────────
// Brutalist flat-bordered stat blocks — sharp edges, no shadows
function StatBlock({ value, label, accent }) {
  return (
    <View style={[statStyles.block, { borderColor: '#1A1A1A' }]}>
      <Text style={[statStyles.value, { color: accent ?? '#FFFFFF' }]}>{value}</Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  block: {
    flex: 1,
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: '#1A1A1A',
    borderRadius: 0,              // sharp — brutalist
    paddingVertical: 18,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 6,
  },
  value: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -1,
  },
  label: {
    fontSize: 9,
    color: '#444444',
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
});

// ─── SessionCard ──────────────────────────────────────────────────────────────
function SessionCard({ session }) {
  const color = stateColor(session.peakState);
  const label = stateLabel(session.peakState);
  return (
    <View style={sessStyles.card}>
      {/* Left accent line replaces colour shadow */}
      <View style={[sessStyles.accentLine, { backgroundColor: color }]} />

      <View style={sessStyles.body}>
        {/* Top row */}
        <View style={sessStyles.topRow}>
          <View style={[sessStyles.badge, { borderColor: color + '55' }]}>
            <Text style={[sessStyles.badgeText, { color }]}>{label}</Text>
          </View>
          <Text style={sessStyles.date}>{formatDate(session.startedAt)}</Text>
        </View>

        {/* Stats row */}
        <View style={sessStyles.statsRow}>
          <View style={sessStyles.stat}>
            <Text style={sessStyles.statVal}>{formatDuration(session.durationSec)}</Text>
            <Text style={sessStyles.statLabel}>DURATION</Text>
          </View>
          <View style={sessStyles.statDivider} />
          <View style={sessStyles.stat}>
            <Text style={[sessStyles.statVal, { color: session.totalAlerts > 0 ? '#F59E0B' : '#22C55E' }]}>
              {session.totalAlerts}
            </Text>
            <Text style={sessStyles.statLabel}>ALERTS</Text>
          </View>
          <View style={sessStyles.statDivider} />
          <View style={sessStyles.stat}>
            <Text style={[sessStyles.statVal, { color: stateColor(session.peakState) }]}>
              {stateLabel(session.peakState)}
            </Text>
            <Text style={sessStyles.statLabel}>PEAK RISK</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const sessStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: '#1A1A1A',
    borderRadius: 0,              // sharp
    overflow: 'hidden',
    marginBottom: 1,              // tight stacking, gap is visual border
  },
  accentLine: {
    width: 3,
    flexShrink: 0,
  },
  body: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badge: {
    borderWidth: 1,
    borderRadius: 999,            // pill — deliberate contrast to sharp card
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 2,
  },
  date: {
    fontSize: 11,
    color: '#333333',
    fontWeight: '500',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statVal: {
    fontSize: 17,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 9,
    color: '#333333',
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#1A1A1A',
  },
});

// ─── AnalyticsRow ─────────────────────────────────────────────────────────────
function AnalyticsRow({ label, count, total, color }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <View style={aStyles.row}>
      <View style={aStyles.labelRow}>
        <Text style={aStyles.label}>{label}</Text>
        <Text style={[aStyles.count, { color }]}>{count}</Text>
      </View>
      <View style={aStyles.barBg}>
        <View style={[aStyles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const aStyles = StyleSheet.create({
  row: {
    gap: 8,
    marginBottom: 16,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 11,
    color: '#555555',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  barBg: {
    height: 2,              // ultra-thin bar — editorial feel
    backgroundColor: '#111111',
    borderRadius: 999,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 999,
    minWidth: 4,
  },
  count: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export function HomeDashboardScreen({ navigation }) {
  const { user, sessions, signOut } = useAuth();
  const [serverIp, setServerIp]         = useState(null);
  const [ipModalVisible, setIpModalVisible] = useState(false);

  React.useEffect(() => {
    AsyncStorage.getItem(IP_KEY)
      .then((v) => { if (v) setServerIp(v); })
      .catch(() => {});
  }, []);

  const handleIpSave = useCallback(async (ip) => {
    setServerIp(ip);
    try { await AsyncStorage.setItem(IP_KEY, ip); } catch (_) {}
  }, []);

  const analytics = useMemo(() => {
    const total    = sessions.length;
    const alerts   = sessions.reduce((a, s) => a + (s.totalAlerts ?? 0), 0);
    const critical = sessions.filter((s) => s.peakState === 'CRITICAL').length;
    const warning  = sessions.filter((s) => s.peakState === 'WARNING').length;
    const safe     = sessions.filter((s) => s.peakState === 'AWAKE').length;
    const avgDur   = total > 0
      ? Math.round(sessions.reduce((a, s) => a + (s.durationSec ?? 0), 0) / total)
      : 0;
    const safeRate = total > 0 ? Math.round((safe / total) * 100) : 100;
    return { total, alerts, critical, warning, safe, avgDur, safeRate };
  }, [sessions]);

  const initials = user?.displayName
    ? user.displayName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  const recentSessions = sessions.slice(0, 10);

  const handleStartDetection = () => {
    navigation.navigate('Camera', { serverIp });
  };

  const timeOfDay = getTimeOfDay();

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Custom Top-Bar (replaces React Navigation header) ──────────── */}
        <View style={styles.topBar}>
          {/* App wordmark */}
          <Text style={styles.topBarBrand}>DG</Text>

          {/* Right actions */}
          <View style={styles.topBarActions}>
            {/* IP config pill-button */}
            <TouchableOpacity
              style={styles.ipPill}
              onPress={() => setIpModalVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.ipPillText}>
                {serverIp ? `${serverIp}` : 'SET IP'}
              </Text>
            </TouchableOpacity>

            {/* Avatar — press to sign out */}
            <TouchableOpacity
              style={styles.avatar}
              onPress={signOut}
              activeOpacity={0.8}
            >
              <Text style={styles.avatarText}>{initials}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Greeting block ─────────────────────────────────────────────── */}
        <View style={styles.greetingBlock}>
          <Text style={styles.greetingOverline}>{timeOfDay.toUpperCase()}</Text>
          <Text style={styles.greetingName}>
            {user?.displayName ?? 'Driver'}
          </Text>
          <Text style={styles.greetingEmail}>{user?.email}</Text>
        </View>

        {/* ── START DETECTION CTA ────────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.ctaBtn}
          onPress={handleStartDetection}
          activeOpacity={0.85}
        >
          <View style={styles.ctaInner}>
            <View style={{ flex: 1 }}>
              <Text style={styles.ctaOverline}>READY TO DRIVE?</Text>
              <Text style={styles.ctaTitle}>Start Detection</Text>
              {serverIp ? (
                <Text style={styles.ctaSub}>Server: {serverIp}</Text>
              ) : (
                <Text style={[styles.ctaSub, { color: '#555555' }]}>
                  Configure server IP first
                </Text>
              )}
            </View>
            {/* Sharp arrow box — intentional brutalist detail */}
            <View style={styles.ctaArrowBox}>
              <Text style={styles.ctaArrow}>›</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* ── Quick Stats ────────────────────────────────────────────────── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionOverline}>OVERVIEW</Text>
          <Text style={styles.sectionTitle}>Your Statistics</Text>
        </View>

        <View style={styles.statsRow}>
          <StatBlock value={analytics.total}           label="Sessions"   />
          <StatBlock value={analytics.alerts}          label="Alerts"     accent="#F59E0B" />
          <StatBlock value={`${analytics.safeRate}%`}  label="Safe Rate"  accent="#22C55E" />
        </View>

        {/* ── Fatigue Analytics ──────────────────────────────────────────── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionOverline}>INSIGHTS</Text>
          <Text style={styles.sectionTitle}>Fatigue Analytics</Text>
        </View>

        <View style={styles.analyticsCard}>
          {analytics.total === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No data yet</Text>
              <Text style={styles.emptyText}>
                Start your first session to see analytics here.
              </Text>
            </View>
          ) : (
            <>
              <AnalyticsRow
                label="Heavy Sleep Events"
                count={analytics.critical}
                total={analytics.total}
                color="#EF4444"
              />
              <AnalyticsRow
                label="Mild Drowsiness Events"
                count={analytics.warning}
                total={analytics.total}
                color="#F59E0B"
              />
              <AnalyticsRow
                label="Fully Attentive Sessions"
                count={analytics.safe}
                total={analytics.total}
                color="#22C55E"
              />

              {/* Footer stats */}
              <View style={styles.analyticsFooter}>
                <View style={styles.analyticsFooterItem}>
                  <Text style={styles.analyticsFooterVal}>
                    {formatDuration(analytics.avgDur)}
                  </Text>
                  <Text style={styles.analyticsFooterLabel}>AVG DURATION</Text>
                </View>
                <View style={styles.analyticsFooterDivider} />
                <View style={styles.analyticsFooterItem}>
                  <Text style={styles.analyticsFooterVal}>{analytics.alerts}</Text>
                  <Text style={styles.analyticsFooterLabel}>LIFETIME ALERTS</Text>
                </View>
                <View style={styles.analyticsFooterDivider} />
                <View style={styles.analyticsFooterItem}>
                  <Text style={styles.analyticsFooterVal}>{analytics.total}</Text>
                  <Text style={styles.analyticsFooterLabel}>TRIPS MONITORED</Text>
                </View>
              </View>
            </>
          )}
        </View>

        {/* ── Recent Sessions ────────────────────────────────────────────── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionOverline}>HISTORY</Text>
          <Text style={styles.sectionTitle}>Recent Sessions</Text>
        </View>

        {recentSessions.length === 0 ? (
          <View style={styles.analyticsCard}>
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No sessions yet</Text>
              <Text style={styles.emptyText}>
                Tap "Start Detection" to begin your first monitored trip.
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.sessionList}>
            {recentSessions.map((s) => <SessionCard key={s.id} session={s} />)}
          </View>
        )}

        {/* ── Sign Out ───────────────────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.signOutBtn}
          onPress={signOut}
          activeOpacity={0.7}
        >
          <Text style={styles.signOutText}>SIGN OUT</Text>
        </TouchableOpacity>

        <View style={{ height: 48 }} />
      </ScrollView>

      {/* IP Config Modal */}
      <IPConfigModal
        visible={ipModalVisible}
        currentIp={serverIp ?? ''}
        onSave={handleIpSave}
        onClose={() => setIpModalVisible(false)}
      />
    </View>
  );
}

// ─── Helper ───────────────────────────────────────────────────────────────────
function getTimeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  return 'Evening';
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingTop: Platform.OS === 'ios' ? 54 : 36,
    paddingHorizontal: 24,
    paddingBottom: 20,
  },

  // ── Custom Top-Bar ──────────────────────────────────────────────────────
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 40,
    paddingTop: 4,
  },
  topBarBrand: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 3,
  },
  topBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ipPill: {
    borderWidth: 1,
    borderColor: '#1A1A1A',
    borderRadius: 999,            // pill
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  ipPillText: {
    fontSize: 10,
    color: '#555555',
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 999,            // pill
    borderWidth: 1,
    borderColor: '#222222',
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },

  // ── Greeting ────────────────────────────────────────────────────────────
  greetingBlock: {
    marginBottom: 40,
    gap: 4,
  },
  greetingOverline: {
    fontSize: 10,
    color: '#333333',
    fontWeight: '800',
    letterSpacing: 3,
    marginBottom: 4,
  },
  greetingName: {
    fontSize: 38,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -1.5,
    lineHeight: 40,
  },
  greetingEmail: {
    fontSize: 12,
    color: '#333333',
    fontWeight: '500',
    marginTop: 4,
  },

  // ── CTA Button ──────────────────────────────────────────────────────────
  ctaBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 0,              // sharp — brutalist
    marginBottom: 48,
    overflow: 'hidden',
  },
  ctaInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 24,
    gap: 16,
  },
  ctaOverline: {
    fontSize: 9,
    fontWeight: '800',
    color: '#888888',
    letterSpacing: 2.5,
    marginBottom: 4,
  },
  ctaTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#000000',
    letterSpacing: -0.8,
  },
  ctaSub: {
    fontSize: 11,
    color: '#777777',
    fontWeight: '500',
    marginTop: 3,
  },
  ctaArrowBox: {
    width: 40,
    height: 40,
    borderRadius: 0,              // sharp — contrast to pill elsewhere
    borderWidth: 1,
    borderColor: '#000000',
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaArrow: {
    fontSize: 28,
    color: '#FFFFFF',
    fontWeight: '300',
    lineHeight: 30,
  },

  // ── Section headers ─────────────────────────────────────────────────────
  sectionHeader: {
    marginBottom: 16,
    gap: 2,
  },
  sectionOverline: {
    fontSize: 9,
    color: '#333333',
    fontWeight: '800',
    letterSpacing: 3,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.8,
  },

  // ── Stats row ────────────────────────────────────────────────────────────
  statsRow: {
    flexDirection: 'row',
    gap: 1,                       // 1px gap = visible dark border stripe
    marginBottom: 48,
  },

  // ── Analytics card ───────────────────────────────────────────────────────
  analyticsCard: {
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: '#1A1A1A',
    borderRadius: 0,
    padding: 20,
    marginBottom: 48,
  },
  analyticsFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#1A1A1A',
  },
  analyticsFooterItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  analyticsFooterDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#1A1A1A',
  },
  analyticsFooterVal: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  analyticsFooterLabel: {
    fontSize: 8,
    color: '#333333',
    fontWeight: '700',
    letterSpacing: 1.5,
    textAlign: 'center',
  },

  // ── Empty states ─────────────────────────────────────────────────────────
  emptyState: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  emptyText: {
    fontSize: 12,
    color: '#333333',
    textAlign: 'center',
    lineHeight: 18,
  },

  // ── Session list ─────────────────────────────────────────────────────────
  sessionList: {
    borderWidth: 1,
    borderColor: '#1A1A1A',
    borderRadius: 0,
    overflow: 'hidden',
    marginBottom: 48,
    gap: 0,
  },

  // ── Sign out ─────────────────────────────────────────────────────────────
  signOutBtn: {
    alignItems: 'center',
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#1A1A1A',
    borderRadius: 0,
  },
  signOutText: {
    fontSize: 10,
    color: '#333333',
    fontWeight: '800',
    letterSpacing: 3,
  },
});

