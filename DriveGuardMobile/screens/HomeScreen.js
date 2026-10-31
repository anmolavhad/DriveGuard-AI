/**
 * HomeScreen.js — DriveGuard AI
 * ─────────────────────────────────────────────────────────────────────────────
 * Complete Automotive Home Dashboard.
 * 
 * Features:
 *   • Dynamic time-of-day welcome greeting with user name & waving badge
 *   • Driver Code & Vehicle ID banner (with one-tap code copy)
 *   • Prominent "Start Detection" Cockpit CTA with live readiness status
 *   • 4-point System Diagnostic Hub (Vision AI, Dual Siren, Haptics, Cloud Sync)
 *   • "How DriveGuard Protects You" feature breakdown & technology overview
 *   • Pre-trip driver wellness & safety checklist
 *   • Quick-access IP configuration & Driver Profile modal
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Modal,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { useAuth } from '../context/AuthContext';
import { IPConfigModal } from '../components/IPConfigModal';
import AsyncStorage from '@react-native-async-storage/async-storage';

const IP_KEY = '@driveguard_server_ip';

// ─── Profile Modal ────────────────────────────────────────────────────────────
function ProfileModal({ visible, onClose, user, onSignOut }) {
  const initials = user?.displayName
    ? user.displayName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : 'DG';

  const handleCopyCode = () => {
    Alert.alert(
      'Driver Code',
      `Your permanent fleet code is: ${user?.driverCode || 'DG8042'}\n\nProvide this 6-digit code to your fleet operator on the web dashboard to link your live driving telemetry.`,
      [{ text: 'OK' }]
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={pmStyles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
        <View style={pmStyles.sheet}>
          <View style={pmStyles.handle} />

          {/* Avatar with status border */}
          <View style={pmStyles.avatar}>
            <Text style={pmStyles.avatarText}>{initials}</Text>
          </View>

          <Text style={pmStyles.name}>{user?.displayName ?? 'Driver'}</Text>
          <Text style={pmStyles.email}>{user?.email}</Text>

          {/* Driver Code Highlight */}
          <TouchableOpacity style={pmStyles.codeCard} onPress={handleCopyCode} activeOpacity={0.8}>
            <View>
              <Text style={pmStyles.codeCardLabel}>PERMANENT DRIVER CODE</Text>
              <Text style={pmStyles.codeCardValue}>{user?.driverCode || 'DG8042'}</Text>
            </View>
            <View style={pmStyles.copyBadge}>
              <Text style={pmStyles.copyBadgeText}>TAP INFO</Text>
            </View>
          </TouchableOpacity>

          {/* Details rows */}
          <View style={pmStyles.row}>
            <Text style={pmStyles.rowLabel}>VEHICLE ASSIGNED</Text>
            <Text style={pmStyles.rowValue}>{user?.vehicleId || 'FLEET-01'}</Text>
          </View>

          <View style={pmStyles.row}>
            <Text style={pmStyles.rowLabel}>ACCOUNT STATUS</Text>
            <View style={pmStyles.statusPill}>
              <View style={pmStyles.activeDot} />
              <Text style={pmStyles.statusText}>VERIFIED FLEET DRIVER</Text>
            </View>
          </View>

          <View style={pmStyles.row}>
            <Text style={pmStyles.rowLabel}>MEMBER SINCE</Text>
            <Text style={pmStyles.rowValue}>
              {user?.createdAt
                ? new Date(user.createdAt).toLocaleDateString(undefined, {
                    month: 'short', year: 'numeric',
                  })
                : 'Active'}
            </Text>
          </View>

          <View style={pmStyles.divider} />

          {/* Sign out */}
          <TouchableOpacity style={pmStyles.signOutBtn} onPress={onSignOut} activeOpacity={0.7}>
            <Text style={pmStyles.signOutText}>SIGN OUT OF DRIVER ACCOUNT</Text>
          </TouchableOpacity>

          {/* Close */}
          <TouchableOpacity style={pmStyles.closeBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={pmStyles.closeBtnText}>CLOSE</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main Screen Component ────────────────────────────────────────────────────
export function HomeScreen({ navigation }) {
  const { user, signOut } = useAuth();
  const [serverIp, setServerIp]             = useState(null);
  const [ipModalVisible, setIpModalVisible] = useState(false);
  const [profileVisible, setProfileVisible] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(IP_KEY)
      .then((v) => { if (v) setServerIp(v); })
      .catch(() => {});
  }, []);

  const handleIpSave = useCallback(async (ip) => {
    setServerIp(ip);
    try { await AsyncStorage.setItem(IP_KEY, ip); } catch (_) {}
  }, []);

  const handleStartDetection = () => {
    navigation.navigate('Camera', { serverIp });
  };

  const initials = user?.displayName
    ? user.displayName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : 'DG';

  const timeOfDay = getTimeOfDay();
  const driverCode = user?.driverCode || 'DG8042';
  const vehicleId = user?.vehicleId || 'FLEET-01';

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Top Bar ───────────────────────────────────────────────────── */}
        <View style={styles.topBar}>
          <View style={styles.brandRow}>
            <View style={styles.radarDot} />
            <Text style={styles.topBarBrand}>DRIVEGUARD</Text>
            <View style={styles.aiTag}>
              <Text style={styles.aiTagText}>AI</Text>
            </View>
          </View>

          <View style={styles.topBarActions}>
            {/* IP config pill */}
            <TouchableOpacity
              style={[styles.ipPill, serverIp && styles.ipPillConnected]}
              onPress={() => setIpModalVisible(true)}
              activeOpacity={0.7}
            >
              <View style={[styles.statusDotSmall, { backgroundColor: serverIp ? '#22C55E' : '#EAB308' }]} />
              <Text style={styles.ipPillText}>
                {serverIp ? serverIp : 'SET IP'}
              </Text>
            </TouchableOpacity>

            {/* Profile avatar */}
            <TouchableOpacity
              style={styles.avatar}
              onPress={() => setProfileVisible(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.avatarText}>{initials}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Welcome Greeting & Driver Identity ────────────────────────── */}
        <View style={styles.welcomeSection}>
          <View style={styles.greetingHeader}>
            <Text style={styles.greetingTime}>GOOD {timeOfDay.toUpperCase()},</Text>
            <Text style={styles.greetingHand}>👋</Text>
          </View>
          <Text style={styles.driverName}>{user?.displayName ?? 'Driver'}</Text>
          <Text style={styles.driverSubtitle}>
            AI fatigue surveillance is ready for your shift.
          </Text>

          {/* Quick Fleet Identity Bar */}
          <View style={styles.identityBar}>
            <View style={styles.identityItem}>
              <Text style={styles.identityLabel}>DRIVER CODE</Text>
              <TouchableOpacity
                onPress={() => Alert.alert('Permanent Code', `Your Driver Code is ${driverCode}. Share this with your fleet supervisor to monitor your trips.`)}
                style={styles.codePill}
              >
                <Text style={styles.codeText}>{driverCode}</Text>
                <Text style={styles.codeCopyHint}>📋</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.identityDivider} />
            <View style={styles.identityItem}>
              <Text style={styles.identityLabel}>ASSIGNED VEHICLE</Text>
              <Text style={styles.vehicleText}>{vehicleId}</Text>
            </View>
          </View>
        </View>

        {/* ── Hero Start Detection CTA ──────────────────────────────────── */}
        <TouchableOpacity
          style={styles.heroCta}
          onPress={handleStartDetection}
          activeOpacity={0.88}
        >
          <View style={styles.heroCtaBackground} />
          <View style={styles.heroCtaContent}>
            <View style={styles.heroLeft}>
              <View style={styles.heroStatusRow}>
                <View style={styles.heroBlinkDot} />
                <Text style={styles.heroStatusText}>AI SYSTEM ARMED & READY</Text>
              </View>
              <Text style={styles.heroTitle}>Start Guard Session</Text>
              <Text style={styles.heroSub}>
                {serverIp
                  ? `Active Host: ${serverIp} • FaceMesh 3D HUD`
                  : 'Tap to launch camera • Configure backend IP'}
              </Text>
            </View>

            <View style={styles.heroArrowCircle}>
              <Text style={styles.heroArrow}>➔</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* ── How DriveGuard Protects You (App Info & Tech) ─────────────── */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeaderLabel}>HOW DRIVEGUARD PROTECTS YOU</Text>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoNumberRow}>
            <View style={styles.infoNumberBadge}><Text style={styles.infoNumber}>01</Text></View>
            <Text style={styles.infoCardTitle}>Dynamic Baseline Calibration</Text>
          </View>
          <Text style={styles.infoCardBody}>
            During the first 5 seconds of every driving session, DriveGuard acquires your natural open-eye Eye Aspect Ratio (EAR) and sets a personalized sleep threshold at 70% of baseline. No rigid constants or false alarms.
          </Text>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoNumberRow}>
            <View style={styles.infoNumberBadge}><Text style={styles.infoNumber}>02</Text></View>
            <Text style={styles.infoCardTitle}>3-Stage Safety State Machine</Text>
          </View>
          <Text style={styles.infoCardBody}>
            • Attentive: Normal driving & natural blinks (&lt; 0.3s) are filtered.{'\n'}
            • Warning Alert: Eyes closed for 0.5s–1.4s triggers visual HUD prompt & tactile warning tap.{'\n'}
            • Critical Alarm: Eyes closed &ge; 1.5s triggers continuous high-decibel emergency siren and heavy vibration.
          </Text>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoNumberRow}>
            <View style={styles.infoNumberBadge}><Text style={styles.infoNumber}>03</Text></View>
            <Text style={styles.infoCardTitle}>Fleet Operator Telemetry</Text>
          </View>
          <Text style={styles.infoCardBody}>
            Your safety scores, yawn occurrences, and PERCLOS metrics are securely synchronized with your fleet controller in real-time, giving dispatchers instant visibility if fatigue occurs on long-haul routes.
          </Text>
        </View>

        {/* ── Pre-Trip Driver Wellness Checklist ────────────────────────── */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeaderLabel}>PRE-TRIP DRIVER CHECKLIST</Text>
        </View>

        <View style={styles.checklistContainer}>
          <View style={styles.checkItem}>
            <Text style={styles.checkIcon}>💧</Text>
            <View style={styles.checkTextWrap}>
              <Text style={styles.checkTitle}>Stay Hydrated</Text>
              <Text style={styles.checkSub}>Drink water before highway routes to reduce dry-eye fatigue.</Text>
            </View>
          </View>

          <View style={styles.checkDivider} />

          <View style={styles.checkItem}>
            <Text style={styles.checkIcon}>⏱️</Text>
            <View style={styles.checkTextWrap}>
              <Text style={styles.checkTitle}>The 2-Hour Rest Rule</Text>
              <Text style={styles.checkSub}>Take a 15-minute rest break after every 2 hours of continuous driving.</Text>
            </View>
          </View>

          <View style={styles.checkDivider} />

          <View style={styles.checkItem}>
            <Text style={styles.checkIcon}>📐</Text>
            <View style={styles.checkTextWrap}>
              <Text style={styles.checkTitle}>Phone Mount Position</Text>
              <Text style={styles.checkSub}>Mount your device securely at eye level on dashboard or AC vent.</Text>
            </View>
          </View>
        </View>

        <View style={{ height: 48 }} />
      </ScrollView>

      {/* IP Config Modal */}
      <IPConfigModal
        visible={ipModalVisible}
        currentIp={serverIp ?? ''}
        onSave={handleIpSave}
        onClose={() => setIpModalVisible(false)}
      />

      {/* Profile Modal */}
      <ProfileModal
        visible={profileVisible}
        onClose={() => setProfileVisible(false)}
        user={user}
        onSignOut={() => { setProfileVisible(false); signOut(); }}
      />
    </View>
  );
}

function getTimeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  return 'Evening';
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingTop: Platform.OS === 'ios' ? 56 : 38,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },

  // ── Top Bar ──────────────────────────────────────────────────────────────
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  radarDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22C55E',
  },
  topBarBrand: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 2.5,
  },
  aiTag: {
    backgroundColor: '#1E1E1E',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#333333',
  },
  aiTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#22C55E',
    letterSpacing: 1,
  },
  topBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ipPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#262626',
    backgroundColor: '#0D0D0D',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  ipPillConnected: {
    borderColor: '#15803D',
    backgroundColor: 'rgba(34,197,94,0.08)',
  },
  statusDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  ipPillText: {
    fontSize: 10,
    color: '#CCCCCC',
    fontWeight: '700',
    letterSpacing: 1,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#333333',
    backgroundColor: '#171717',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
  },

  // ── Welcome Section ──────────────────────────────────────────────────────
  welcomeSection: {
    marginBottom: 24,
  },
  greetingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  greetingTime: {
    fontSize: 11,
    color: '#666666',
    fontWeight: '800',
    letterSpacing: 2,
  },
  greetingHand: {
    fontSize: 14,
  },
  driverName: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    lineHeight: 38,
  },
  driverSubtitle: {
    fontSize: 13,
    color: '#888888',
    marginTop: 4,
    marginBottom: 16,
  },

  // ── Identity Bar ─────────────────────────────────────────────────────────
  identityBar: {
    flexDirection: 'row',
    backgroundColor: '#0F0F0F',
    borderWidth: 1,
    borderColor: '#222222',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  identityItem: {
    flex: 1,
  },
  identityDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#262626',
    marginHorizontal: 14,
  },
  identityLabel: {
    fontSize: 9,
    color: '#666666',
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 3,
  },
  codePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  codeText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#22C55E',
    letterSpacing: 1.2,
  },
  codeCopyHint: {
    fontSize: 11,
  },
  vehicleText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // ── Hero Start Detection CTA ─────────────────────────────────────────────
  heroCta: {
    position: 'relative',
    backgroundColor: '#111111',
    borderWidth: 1.5,
    borderColor: '#22C55E',
    borderRadius: 16,
    overflow: 'hidden',
    padding: 20,
    marginBottom: 30,
    shadowColor: '#22C55E',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  heroCtaBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(34,197,94,0.04)',
  },
  heroCtaContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroLeft: {
    flex: 1,
    paddingRight: 12,
  },
  heroStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  heroBlinkDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22C55E',
  },
  heroStatusText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#22C55E',
    letterSpacing: 1.5,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  heroSub: {
    fontSize: 12,
    color: '#888888',
    lineHeight: 16,
  },
  heroArrowCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroArrow: {
    fontSize: 18,
    fontWeight: '900',
    color: '#000000',
  },

  // ── Section Headers ──────────────────────────────────────────────────────
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    marginTop: 6,
  },
  sectionHeaderLabel: {
    fontSize: 10,
    color: '#666666',
    fontWeight: '800',
    letterSpacing: 2,
  },

  // ── App Info Cards ───────────────────────────────────────────────────────
  infoCard: {
    backgroundColor: '#0D0D0D',
    borderWidth: 1,
    borderColor: '#1E1E1E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  infoNumberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  infoNumberBadge: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#333333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoNumber: {
    fontSize: 10,
    fontWeight: '900',
    color: '#22C55E',
  },
  infoCardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  infoCardBody: {
    fontSize: 12,
    color: '#888888',
    lineHeight: 18,
  },

  // ── Pre-Trip Checklist ───────────────────────────────────────────────────
  checklistContainer: {
    backgroundColor: '#0D0D0D',
    borderWidth: 1,
    borderColor: '#1E1E1E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 6,
  },
  checkIcon: {
    fontSize: 18,
    marginTop: 2,
  },
  checkTextWrap: {
    flex: 1,
  },
  checkTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  checkSub: {
    fontSize: 11,
    color: '#666666',
    lineHeight: 15,
  },
  checkDivider: {
    height: 1,
    backgroundColor: '#1A1A1A',
    marginVertical: 10,
  },
});

// ── Profile Modal Styles ──────────────────────────────────────────────────────
const pmStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0D0D0D',
    borderTopWidth: 1,
    borderColor: '#262626',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 40,
    alignItems: 'center',
    gap: 10,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: '#333333',
    borderRadius: 2,
    marginBottom: 10,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: '#22C55E',
    backgroundColor: '#171717',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  avatarText: { fontSize: 22, fontWeight: '900', color: '#FFFFFF' },
  name:  { fontSize: 20, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.5 },
  email: { fontSize: 12, color: '#666666', fontWeight: '500', marginBottom: 6 },
  codeCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#22C55E',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginVertical: 6,
  },
  codeCardLabel: {
    fontSize: 8,
    color: '#22C55E',
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  codeCardValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 2,
    marginTop: 2,
  },
  copyBadge: {
    backgroundColor: 'rgba(34,197,94,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  copyBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#22C55E',
    letterSpacing: 1,
  },
  row: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 11,
    borderTopWidth: 1,
    borderColor: '#1A1A1A',
  },
  rowLabel: { fontSize: 9, color: '#555555', fontWeight: '800', letterSpacing: 1.5 },
  rowValue: { fontSize: 13, color: '#FFFFFF', fontWeight: '600' },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22C55E',
  },
  statusText: {
    fontSize: 10,
    color: '#22C55E',
    fontWeight: '800',
    letterSpacing: 1,
  },
  divider:  { height: 1, width: '100%', backgroundColor: '#1A1A1A', marginVertical: 6 },
  signOutBtn: {
    width: '100%',
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(239,68,68,0.06)',
    marginTop: 4,
  },
  signOutText: { fontSize: 10, color: '#EF4444', fontWeight: '800', letterSpacing: 2 },
  closeBtn: { width: '100%', paddingVertical: 12, alignItems: 'center' },
  closeBtnText: { fontSize: 10, color: '#666666', fontWeight: '800', letterSpacing: 2 },
});
