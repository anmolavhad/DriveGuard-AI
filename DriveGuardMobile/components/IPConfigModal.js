import React, { useState, useRef, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { Colors, FontSize, Radius, Spacing, Shadow } from '../constants/theme';

const IP_STORAGE_KEY = '@driveguard_server_ip';
const IPV4_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;

/**
 * Full-screen modal for configuring the server IP address.
 *
 * Props:
 *   visible    {boolean}        - whether the modal is shown
 *   currentIp  {string}         - currently saved IP
 *   onSave     {(ip: string) => void}
 *   onClose    {() => void}
 */
export function IPConfigModal({ visible, currentIp, onSave, onClose }) {
  const [input, setInput]   = useState(currentIp ?? '');
  const [error, setError]   = useState('');
  const slideAnim           = useRef(new Animated.Value(60)).current;
  const opacityAnim         = useRef(new Animated.Value(0)).current;

  // Sync when currentIp changes externally
  useEffect(() => { setInput(currentIp ?? ''); }, [currentIp]);

  useEffect(() => {
    if (visible) {
      setError('');
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 10 }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.timing(opacityAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start();
      slideAnim.setValue(60);
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const validate = (val) => {
    const clean = val.trim();
    if (!clean) return 'Server host or IP cannot be empty.';
    const hostOnly = clean.replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '').replace(/\/.*$/, '');
    const [host] = hostOnly.split(':');
    
    // Check IPv4
    if (IPV4_REGEX.test(host)) {
      const parts = host.split('.').map(Number);
      if (parts.some((p) => p < 0 || p > 255)) return 'Each IP octet must be between 0 and 255.';
      return '';
    }
    // Check hostname / domain
    if (host === 'localhost' || /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(host)) {
      return '';
    }
    return 'Enter a valid IP (e.g. 192.168.1.5) or cloud domain (e.g. api.driveguard.com).';
  };

  const isLocalIpOnly = IPV4_REGEX.test(input.trim());

  const handleSave = async () => {
    const err = validate(input);
    if (err) { setError(err); return; }
    const ip = input.trim();
    await AsyncStorage.setItem(IP_STORAGE_KEY, ip);
    onSave(ip);
    onClose();
  };

  return (
    <Modal
      transparent
      statusBarTranslucent
      visible={visible}
      animationType="none"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />

        <Animated.View style={[styles.sheet, { opacity: opacityAnim, transform: [{ translateY: slideAnim }] }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.pill} />
            <Text style={styles.title}>Server Configuration</Text>
            <Text style={styles.subtitle}>
              Enter your local IP address for development{'\n'}or your production cloud server domain.
            </Text>
          </View>

          {/* Input section */}
          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>SERVER IP OR CLOUD DOMAIN</Text>
            <View style={[styles.inputWrapper, error ? styles.inputError : null]}>
              <Text style={styles.inputPrefix}>{isLocalIpOnly ? 'ws://' : 'host:'}</Text>
              <TextInput
                style={styles.input}
                value={input}
                onChangeText={(t) => { setInput(t); setError(''); }}
                placeholder="192.168.1.100 or api.driveguard.ai"
                placeholderTextColor={Colors.textMuted}
                keyboardType="url"
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="done"
                onSubmitEditing={handleSave}
                selectionColor={Colors.primary}
              />
              {isLocalIpOnly && <Text style={styles.inputSuffix}>:8000</Text>}
            </View>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <Text style={styles.hint}>
              💡 Local dev: Use your PC LAN IP (e.g. <Text style={styles.hintCode}>192.168.1.15</Text>){'\n'}
              ☁️ Cloud deploy: Enter your domain (e.g. <Text style={styles.hintCode}>api.driveguard.ai</Text>)
            </Text>
          </View>

          {/* Action buttons */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.8}>
              <Text style={styles.saveText}>Save & Connect</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.70)',
  },
  sheet: {
    backgroundColor: Colors.bgModal,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    ...Shadow.card,
  },
  header: {
    alignItems: 'center',
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  pill: {
    width: 40,
    height: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.border,
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  inputSection: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  inputLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1.4,
    color: Colors.primary,
    marginBottom: Spacing.sm,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 40, 70, 0.80)',
    borderWidth: 1.5,
    borderColor: Colors.borderActive,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    height: 52,
  },
  inputError: {
    borderColor: Colors.danger,
  },
  inputPrefix: {
    fontSize: FontSize.md,
    color: Colors.textMuted,
    fontWeight: '500',
    marginRight: 2,
  },
  input: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    fontWeight: '600',
    paddingVertical: 0,
  },
  inputSuffix: {
    fontSize: FontSize.md,
    color: Colors.textMuted,
    fontWeight: '500',
    marginLeft: 2,
  },
  errorText: {
    fontSize: FontSize.xs,
    color: Colors.danger,
    marginTop: Spacing.xs,
    marginLeft: 2,
  },
  hint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: Spacing.md,
    lineHeight: 18,
  },
  hintCode: {
    color: Colors.primary,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },
  cancelBtn: {
    flex: 1,
    height: 50,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  saveBtn: {
    flex: 2,
    height: 50,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.glow(Colors.primaryGlow),
  },
  saveText: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.white,
    letterSpacing: 0.3,
  },
});
