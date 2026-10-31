/**
 * SettingsScreen.js
 * ─────────────────────────────────────────────────────────────────────────────
 * App settings: profile editing, alert preferences, general options.
 * Design: Pure Black Minimalist — grouped row sections, no card shadows.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Switch,
  Platform,
  Alert,
  Clipboard,
  Animated,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { SleepAlarmModal } from '../components/SleepAlarmModal';

const IP_KEY = '@driveguard_server_ip';

// ─── Setting row ──────────────────────────────────────────────────────────────
function SettingRow({ label, value, onPress, accent, destructive, toggle, toggleValue, onToggle }) {
  return (
    <TouchableOpacity
      style={rowStyles.row}
      onPress={toggle ? undefined : onPress}
      activeOpacity={toggle ? 1 : 0.7}
      disabled={!onPress && !toggle}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[rowStyles.label, destructive && rowStyles.destructiveLabel]}>
          {label}
        </Text>
        {!!value && <Text style={rowStyles.value}>{value}</Text>}
      </View>
      {toggle ? (
        <Switch
          value={toggleValue}
          onValueChange={onToggle}
          trackColor={{ false: '#1A1A1A', true: '#FFFFFF' }}
          thumbColor={toggleValue ? '#000000' : '#333333'}
        />
      ) : (
        <Text style={[rowStyles.chevron, accent && { color: accent }, destructive && { color: '#EF4444' }]}>
          {onPress ? '›' : ''}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderColor: '#1A1A1A',
  },
  label:            { fontSize: 14, color: '#FFFFFF', fontWeight: '600' },
  destructiveLabel: { color: '#EF4444' },
  value:            { fontSize: 11, color: '#444444', fontWeight: '500' },
  chevron:          { fontSize: 22, color: '#333333' },
});

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ label }) {
  return (
    <View style={secStyles.wrap}>
      <Text style={secStyles.text}>{label}</Text>
    </View>
  );
}

const secStyles = StyleSheet.create({
  wrap: { paddingTop: 32, paddingBottom: 8 },
  text: { fontSize: 9, color: '#333333', fontWeight: '800', letterSpacing: 3 },
});

// ─── Edit Profile Modal ───────────────────────────────────────────────────────
function EditProfileModal({ visible, user, onClose, onSave }) {
  const [name, setName] = useState(user?.displayName ?? '');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={epStyles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
        <View style={epStyles.sheet}>
          <View style={epStyles.handle} />
          <Text style={epStyles.title}>Edit Profile</Text>

          <Text style={epStyles.fieldLabel}>DISPLAY NAME</Text>
          <TextInput
            style={epStyles.input}
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor="#333333"
            autoCapitalize="words"
          />

          <Text style={epStyles.fieldLabel}>EMAIL</Text>
          <View style={[epStyles.input, { opacity: 0.5 }]}>
            <Text style={{ color: '#FFFFFF', fontSize: 15 }}>{user?.email}</Text>
          </View>

          <TouchableOpacity
            style={epStyles.saveBtn}
            onPress={() => { onSave(name.trim()); onClose(); }}
            activeOpacity={0.85}
          >
            <Text style={epStyles.saveBtnText}>SAVE CHANGES</Text>
          </TouchableOpacity>
          <TouchableOpacity style={epStyles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={epStyles.cancelBtnText}>CANCEL</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const epStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet:   {
    backgroundColor: '#0A0A0A',
    borderTopWidth: 1,
    borderColor: '#1A1A1A',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 48,
    gap: 12,
  },
  handle:     { width: 36, height: 3, backgroundColor: '#222222', borderRadius: 999, alignSelf: 'center', marginBottom: 8 },
  title:      { fontSize: 22, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.8, marginBottom: 8 },
  fieldLabel: { fontSize: 9, color: '#333333', fontWeight: '800', letterSpacing: 2.5, marginTop: 8 },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: '#1A1A1A',
    paddingHorizontal: 16,
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '500',
    justifyContent: 'center',
  },
  saveBtn:     { backgroundColor: '#FFFFFF', paddingVertical: 18, alignItems: 'center', borderRadius: 999, marginTop: 8 },
  saveBtnText: { fontSize: 12, fontWeight: '900', color: '#000000', letterSpacing: 3 },
  cancelBtn:   { paddingVertical: 16, alignItems: 'center' },
  cancelBtnText: { fontSize: 10, color: '#333333', fontWeight: '800', letterSpacing: 2.5 },
});

// ─── Alert Volume Modal ───────────────────────────────────────────────────────
function AlertVolumeModal({ visible, onClose, currentVolume, onSave }) {
  const levels = ['Off', 'Low', 'Medium', 'High', 'Max'];
  const [selected, setSelected] = useState(currentVolume ?? 'High');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={epStyles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
        <View style={epStyles.sheet}>
          <View style={epStyles.handle} />
          <Text style={epStyles.title}>Alert Volume</Text>
          <Text style={{ fontSize: 12, color: '#444444', marginBottom: 8 }}>
            Volume level for the sleep alarm sound.
          </Text>
          {levels.map((level) => (
            <TouchableOpacity
              key={level}
              style={[avStyles.option, selected === level && avStyles.optionActive]}
              onPress={() => setSelected(level)}
              activeOpacity={0.8}
            >
              <Text style={[avStyles.optionText, selected === level && avStyles.optionTextActive]}>
                {level.toUpperCase()}
              </Text>
              {selected === level && <View style={avStyles.check} />}
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={epStyles.saveBtn}
            onPress={() => { onSave(selected); onClose(); }}
            activeOpacity={0.85}
          >
            <Text style={epStyles.saveBtnText}>CONFIRM</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const avStyles = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#1A1A1A',
    marginBottom: 4,
  },
  optionActive:     { borderColor: '#FFFFFF', backgroundColor: '#0A0A0A' },
  optionText:       { fontSize: 12, color: '#444444', fontWeight: '800', letterSpacing: 2 },
  optionTextActive: { color: '#FFFFFF' },
  check: { width: 8, height: 8, borderRadius: 999, backgroundColor: '#FFFFFF' },
});

// ─── Driver Code Badge ────────────────────────────────────────────────────────
function DriverCodeBadge({ code }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (code) {
      Clipboard.setString(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [code]);

  if (!code) return null;

  // Format code as XXX-XXX for readability
  const formatted = `${code.slice(0, 3)}-${code.slice(3)}`;

  return (
    <View style={codeStyles.wrap}>
      <View style={codeStyles.header}>
        <Text style={codeStyles.label}>YOUR DRIVER CODE</Text>
        <Text style={codeStyles.hint}>Share with operator to link your account</Text>
      </View>
      <TouchableOpacity style={codeStyles.badgeRow} onPress={handleCopy} activeOpacity={0.7}>
        <View style={codeStyles.codeBox}>
          {code.split('').map((ch, i) => (
            <View key={i} style={[codeStyles.charBox, i === 2 && codeStyles.charBoxGap]}>
              <Text style={codeStyles.charText}>{ch}</Text>
            </View>
          ))}
        </View>
        <View style={[codeStyles.copyBtn, copied && codeStyles.copyBtnActive]}>
          <Text style={[codeStyles.copyText, copied && codeStyles.copyTextActive]}>
            {copied ? 'COPIED!' : 'COPY'}
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const codeStyles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderColor: '#1A1A1A',
    padding: 16,
    marginBottom: 8,
    gap: 12,
    backgroundColor: '#050505',
  },
  header: { gap: 2 },
  label: {
    fontSize: 9,
    fontWeight: '800',
    color: '#555555',
    letterSpacing: 3,
  },
  hint: {
    fontSize: 10,
    color: '#2A2A2A',
    fontWeight: '500',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  codeBox: {
    flexDirection: 'row',
    gap: 4,
    flex: 1,
  },
  charBox: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: '#222222',
    backgroundColor: '#0A0A0A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  charBoxGap: {
    marginRight: 8,
  },
  charText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  copyBtn: {
    borderWidth: 1,
    borderColor: '#222222',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: '#000000',
  },
  copyBtnActive: {
    borderColor: '#22C55E55',
    backgroundColor: 'rgba(34,197,94,0.08)',
  },
  copyText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#444444',
    letterSpacing: 2,
  },
  copyTextActive: {
    color: '#22C55E',
  },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export function SettingsScreen() {
  const { user, signOut } = useAuth();
  const [editProfileVisible, setEditProfileVisible] = useState(false);
  const [alertVolumeVisible, setAlertVolumeVisible] = useState(false);
  const [testAlarmVisible, setTestAlarmVisible]     = useState(false);
  const [alertVolume, setAlertVolume]               = useState('High');
  const [vibrationEnabled, setVibrationEnabled]     = useState(true);
  const [autoCalibrate, setAutoCalibrate]           = useState(true);
  const [serverIp, setServerIp]                     = useState('');

  React.useEffect(() => {
    AsyncStorage.getItem(IP_KEY).then((v) => { if (v) setServerIp(v); }).catch(() => {});
  }, []);

  const initials = user?.displayName
    ? user.displayName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  const handleSaveProfile = useCallback((newName) => {
    // In a real app: update AsyncStorage user record + setUser context
    Alert.alert('Profile Updated', `Display name changed to "${newName}".`);
  }, []);

  const handleChangePhoto = useCallback(() => {
    Alert.alert('Coming Soon', 'Profile photo upload will be available in the next release.');
  }, []);

  const handleSignOut = useCallback(() => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  }, [signOut]);

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
          <Text style={styles.overline}>PREFERENCES</Text>
          <Text style={styles.title}>Settings</Text>
        </View>

        {/* ── Profile card ── */}
        <View style={styles.profileCard}>
          <View style={styles.profileAvatar}>
            <Text style={styles.profileAvatarText}>{initials}</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.profileName}>{user?.displayName ?? 'Driver'}</Text>
            <Text style={styles.profileEmail}>{user?.email}</Text>
          </View>
        </View>

        {/* ── Driver Code ── */}
        <SectionHeader label="DRIVER IDENTITY" />
        <DriverCodeBadge code={user?.driverCode} />

        {/* ── Account ── */}
        <SectionHeader label="ACCOUNT" />
        <SettingRow label="Edit Profile"        onPress={() => setEditProfileVisible(true)} />
        <SettingRow label="Change Profile Photo" onPress={handleChangePhoto} />
        <SettingRow
          label="Server IP"
          value={serverIp || 'Not configured'}
          onPress={() => Alert.alert('Configure IP', 'Update the server IP from the Home screen.')}
        />

        {/* ── Alerts ── */}
        <SectionHeader label="ALERTS & SOUND" />
        <SettingRow
          label="Alert Volume"
          value={alertVolume}
          onPress={() => setAlertVolumeVisible(true)}
        />
        <SettingRow
          label="Vibration on Alert"
          toggle
          toggleValue={vibrationEnabled}
          onToggle={setVibrationEnabled}
        />
        <SettingRow
          label="Test Emergency Siren"
          value="Test Sound & Vibration"
          accent
          onPress={() => setTestAlarmVisible(true)}
        />

        {/* ── Detection ── */}
        <SectionHeader label="DETECTION" />
        <SettingRow
          label="Auto-Calibrate on Start"
          value="Recommended"
          toggle
          toggleValue={autoCalibrate}
          onToggle={setAutoCalibrate}
        />
        <SettingRow
          label="Frame Rate"
          value="~8 FPS (optimized)"
        />

        {/* ── App ── */}
        <SectionHeader label="APP" />
        <SettingRow label="Version" value="1.0.0 — SDK 58" />
        <SettingRow label="Privacy Policy" onPress={() =>
          Alert.alert('Privacy', 'All data is stored locally on your device. No data is transmitted to external servers except your configured backend IP.')
        } />

        {/* ── Danger zone ── */}
        <SectionHeader label="ACCOUNT" />
        <SettingRow
          label="Sign Out"
          destructive
          onPress={handleSignOut}
        />

        <View style={{ height: 48 }} />
      </ScrollView>

      <EditProfileModal
        visible={editProfileVisible}
        user={user}
        onClose={() => setEditProfileVisible(false)}
        onSave={handleSaveProfile}
      />
      <AlertVolumeModal
        visible={alertVolumeVisible}
        currentVolume={alertVolume}
        onClose={() => setAlertVolumeVisible(false)}
        onSave={setAlertVolume}
      />
      <SleepAlarmModal
        visible={testAlarmVisible}
        onDismiss={() => setTestAlarmVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: '#000000' },
  scroll:        { flex: 1 },
  scrollContent: {
    paddingTop:        Platform.OS === 'ios' ? 54 : 36,
    paddingHorizontal: 24,
    paddingBottom:     20,
  },
  header:  { marginBottom: 28, gap: 2 },
  overline:{ fontSize: 9,  color: '#333333', fontWeight: '800', letterSpacing: 3 },
  title:   { fontSize: 32, color: '#FFFFFF', fontWeight: '900', letterSpacing: -1 },

  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
    borderColor: '#1A1A1A',
    padding: 16,
    marginBottom: 8,
  },
  profileAvatar: {
    width: 52,
    height: 52,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#222222',
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarText: { fontSize: 18, fontWeight: '900', color: '#FFFFFF' },
  profileName:       { fontSize: 16, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.5 },
  profileEmail:      { fontSize: 11, color: '#444444', fontWeight: '500' },
});
