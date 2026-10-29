/**
 * HomeScreen.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Post-login home hub.
 * Design: Pure Black Minimalist — large wordmark greeting, single CTA,
 * status text suggestion, IP config. No stats / analytics (moved to tabs).
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Modal,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../context/AuthContext';
import { IPConfigModal } from '../components/IPConfigModal';
import AsyncStorage from '@react-native-async-storage/async-storage';

const IP_KEY = '@driveguard_server_ip';

// ─── Profile Modal ────────────────────────────────────────────────────────────
function ProfileModal({ visible, onClose, user, onSignOut }) {
  const initials = user?.displayName
    ? user.displayName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';

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
          {/* Header drag handle */}
          <View style={pmStyles.handle} />

          {/* Avatar */}
          <View style={pmStyles.avatar}>
            <Text style={pmStyles.avatarText}>{initials}</Text>
          </View>

          {/* Name & email */}
          <Text style={pmStyles.name}>{user?.displayName ?? 'Driver'}</Text>
          <Text style={pmStyles.email}>{user?.email}</Text>

          {/* Member since */}
          <View style={pmStyles.row}>
            <Text style={pmStyles.rowLabel}>MEMBER SINCE</Text>
            <Text style={pmStyles.rowValue}>
              {user?.createdAt
                ? new Date(user.createdAt).toLocaleDateString(undefined, {
                    month: 'long', year: 'numeric',
                  })
                : '—'}
            </Text>
          </View>

          <View style={pmStyles.divider} />

          {/* Sign out */}
          <TouchableOpacity style={pmStyles.signOutBtn} onPress={onSignOut} activeOpacity={0.7}>
            <Text style={pmStyles.signOutText}>SIGN OUT</Text>
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

const pmStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0A0A0A',
    borderTopWidth: 1,
    borderColor: '#1A1A1A',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    paddingHorizontal: 32,
    paddingTop: 20,
    paddingBottom: 48,
    alignItems: 'center',
    gap: 12,
  },
  handle: {
    width: 36,
    height: 3,
    backgroundColor: '#222222',
    borderRadius: 999,
    marginBottom: 12,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#222222',
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  avatarText: { fontSize: 24, fontWeight: '900', color: '#FFFFFF' },
  name:  { fontSize: 22, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.8 },
  email: { fontSize: 13, color: '#444444', fontWeight: '500', marginBottom: 8 },
  row: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderColor: '#1A1A1A',
  },
  rowLabel: { fontSize: 9, color: '#333333', fontWeight: '800', letterSpacing: 2 },
  rowValue: { fontSize: 13, color: '#FFFFFF', fontWeight: '600' },
  divider:  { height: 1, width: '100%', backgroundColor: '#1A1A1A', marginVertical: 4 },
  signOutBtn: {
    width: '100%',
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#1A1A1A',
    alignItems: 'center',
    marginTop: 8,
  },
  signOutText: { fontSize: 11, color: '#EF4444', fontWeight: '800', letterSpacing: 3 },
  closeBtn: { width: '100%', paddingVertical: 16, alignItems: 'center' },
  closeBtnText: { fontSize: 11, color: '#333333', fontWeight: '800', letterSpacing: 3 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export function HomeScreen({ navigation }) {
  const { user, signOut } = useAuth();
  const [serverIp, setServerIp]             = useState(null);
  const [ipModalVisible, setIpModalVisible] = useState(false);
  const [profileVisible, setProfileVisible] = useState(false);

  React.useEffect(() => {
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
    : '?';

  const timeOfDay = getTimeOfDay();

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
          <Text style={styles.topBarBrand}>DG</Text>

          <View style={styles.topBarActions}>
            {/* IP config pill */}
            <TouchableOpacity
              style={styles.ipPill}
              onPress={() => setIpModalVisible(true)}
              activeOpacity={0.7}
            >
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

        {/* ── Greeting ──────────────────────────────────────────────────── */}
        <View style={styles.greetingBlock}>
          <Text style={styles.greetingOverline}>{timeOfDay.toUpperCase()}</Text>
          <Text style={styles.greetingName}>
            {user?.displayName ?? 'Driver'}
          </Text>
          <Text style={styles.greetingEmail}>{user?.email}</Text>
        </View>

        {/* ── Start Detection CTA ───────────────────────────────────────── */}
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
            <View style={styles.ctaArrowBox}>
              <Text style={styles.ctaArrow}>›</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* ── Status / Suggestion Text ──────────────────────────────────── */}
        <View style={styles.suggestionBox}>
          <View style={styles.suggestionDot} />
          <Text style={styles.suggestionText}>
            {serverIp
              ? 'System ready. Ensure you are fully rested before starting a session. If feeling fatigued, please take a short break or nap first.'
              : 'No server configured. Tap SET IP to connect to your DriveGuard backend before starting detection.'}
          </Text>
        </View>

        {/* ── Minimal status row ────────────────────────────────────────── */}
        <View style={styles.statusRow}>
          <View style={styles.statusItem}>
            <View style={[styles.statusDot, { backgroundColor: serverIp ? '#22C55E' : '#EF4444' }]} />
            <Text style={styles.statusItemText}>
              {serverIp ? 'SERVER CONFIGURED' : 'NO SERVER'}
            </Text>
          </View>
          <View style={styles.statusItem}>
            <View style={[styles.statusDot, { backgroundColor: '#22C55E' }]} />
            <Text style={styles.statusItemText}>CAMERA READY</Text>
          </View>
        </View>

        <View style={{ height: 40 }} />
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
    paddingTop: Platform.OS === 'ios' ? 54 : 36,
    paddingHorizontal: 24,
    paddingBottom: 20,
  },

  // ── Top bar ──────────────────────────────────────────────────────────────
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
    borderRadius: 999,
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
    borderRadius: 999,
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

  // ── Greeting ──────────────────────────────────────────────────────────────
  greetingBlock: {
    marginBottom: 48,
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
    fontSize: 42,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -1.5,
    lineHeight: 44,
  },
  greetingEmail: {
    fontSize: 12,
    color: '#333333',
    fontWeight: '500',
    marginTop: 4,
  },

  // ── CTA ────────────────────────────────────────────────────────────────────
  ctaBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 0,
    marginBottom: 16,
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
    fontSize: 24,
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
    borderWidth: 1,
    borderColor: '#DDDDDD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaArrow: {
    fontSize: 28,
    color: '#000000',
    fontWeight: '300',
    lineHeight: 30,
  },

  // ── Suggestion box ────────────────────────────────────────────────────────
  suggestionBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderWidth: 1,
    borderColor: '#1A1A1A',
    padding: 16,
    marginBottom: 32,
  },
  suggestionDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#22C55E',
    marginTop: 5,
    flexShrink: 0,
  },
  suggestionText: {
    flex: 1,
    fontSize: 12,
    color: '#444444',
    lineHeight: 18,
    fontWeight: '400',
  },

  // ── Status row ────────────────────────────────────────────────────────────
  statusRow: {
    flexDirection: 'row',
    gap: 16,
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
  },
  statusItemText: {
    fontSize: 9,
    color: '#333333',
    fontWeight: '800',
    letterSpacing: 1.5,
  },
});
