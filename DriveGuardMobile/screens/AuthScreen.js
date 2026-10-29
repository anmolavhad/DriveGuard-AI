/**
 * AuthScreen.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Premium Sign-In / Register screen for DriveGuard AI.
 * Design: High-Contrast Minimalist Dark — Pure Black, White Typography,
 * Sharp / Pill shapes, 1px ultra-dark borders, zero drop shadows.
 * Supports: Email+Password login, Email+Password registration only.
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../context/AuthContext';

const { height: SH } = Dimensions.get('window');

export function AuthScreen() {
  const { signInWithEmail, registerWithEmail } = useAuth();

  const [mode, setMode]               = useState('login');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [showPass, setShowPass]       = useState(false);
  const [error, setError]             = useState('');
  const [busy, setBusy]               = useState(false);

  // Shake animation on error
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const shakeForm = useCallback(() => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue:  10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue:   6, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue:   0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  const handleSubmit = useCallback(async () => {
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') {
        await signInWithEmail(email.trim(), password);
      } else {
        await registerWithEmail(email.trim(), password, displayName.trim());
      }
    } catch (e) {
      setError(e.message);
      shakeForm();
    } finally {
      setBusy(false);
    }
  }, [mode, email, password, displayName, signInWithEmail, registerWithEmail, shakeForm]);


  const toggleMode = () => {
    setMode((m) => (m === 'login' ? 'register' : 'login'));
    setError('');
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* ── Brand Header ─────────────────────────────────────────────── */}
          <View style={styles.header}>
            {/* Overline tag */}
            <View style={styles.overlineTag}>
              <Text style={styles.overlineText}>DRIVEGUARD AI</Text>
            </View>

            {/* Main wordmark */}
            <Text style={styles.wordmark}>Stay{'\n'}Awake.</Text>

            {/* Sub-tagline */}
            <Text style={styles.tagline}>
              Intelligent fatigue detection{'\n'}for the road ahead.
            </Text>
          </View>

          {/* ── Mode tab selector ─────────────────────────────────────────── */}
          <View style={styles.modeRow}>
            <TouchableOpacity
              style={[styles.modeTab, mode === 'login' && styles.modeTabActive]}
              onPress={() => setMode('login')}
              activeOpacity={0.7}
            >
              <Text style={[styles.modeTabText, mode === 'login' && styles.modeTabTextActive]}>
                SIGN IN
              </Text>
            </TouchableOpacity>

            <View style={styles.modeTabDivider} />

            <TouchableOpacity
              style={[styles.modeTab, mode === 'register' && styles.modeTabActive]}
              onPress={() => setMode('register')}
              activeOpacity={0.7}
            >
              <Text style={[styles.modeTabText, mode === 'register' && styles.modeTabTextActive]}>
                REGISTER
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── Form ─────────────────────────────────────────────────────── */}
          <Animated.View
            style={[styles.form, { transform: [{ translateX: shakeAnim }] }]}
          >
            {/* Name field (register only) */}
            {mode === 'register' && (
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>FULL NAME</Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="John Driver"
                  placeholderTextColor="#333333"
                  value={displayName}
                  onChangeText={setDisplayName}
                  autoCapitalize="words"
                  returnKeyType="next"
                  editable={!busy}
                />
              </View>
            )}

            {/* Email field */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>EMAIL ADDRESS</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="you@example.com"
                placeholderTextColor="#333333"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                editable={!busy}
              />
            </View>

            {/* Password field */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>PASSWORD</Text>
              <View style={styles.fieldInputRow}>
                <TextInput
                  style={[styles.fieldInput, { flex: 1, borderWidth: 0 }]}
                  placeholder={mode === 'register' ? 'Min. 6 characters' : 'Enter password'}
                  placeholderTextColor="#333333"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPass}
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                  editable={!busy}
                />
                <TouchableOpacity
                  onPress={() => setShowPass((v) => !v)}
                  style={styles.eyeBtn}
                  activeOpacity={0.7}
                >
                  <Text style={styles.eyeLabel}>{showPass ? 'HIDE' : 'SHOW'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Error message */}
            {!!error && (
              <View style={styles.errorStrip}>
                <View style={styles.errorAccent} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Primary submit button */}
            <TouchableOpacity
              style={[styles.submitBtn, busy && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              activeOpacity={0.85}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#000000" size="small" />
              ) : (
                <Text style={styles.submitBtnText}>
                  {mode === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT'}
                </Text>
              )}
            </TouchableOpacity>


          </Animated.View>

          {/* ── Footer ───────────────────────────────────────────────────── */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              {mode === 'login' ? "Don't have an account?" : 'Already registered?'}
            </Text>
            <TouchableOpacity onPress={toggleMode} activeOpacity={0.7}>
              <Text style={styles.footerLink}>
                {'  '}{mode === 'login' ? 'Register' : 'Sign In'}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.legalText}>
            By continuing, you agree to safe & responsible driving practices.
          </Text>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  kav: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingTop: SH * 0.09,
    paddingBottom: 48,
    paddingHorizontal: 32,
  },

  // ── Brand Header ────────────────────────────────────────────────────────
  header: {
    marginBottom: 40,
    gap: 12,
  },
  overlineTag: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#222222',
    paddingVertical: 5,
    paddingHorizontal: 10,
    // pill shape for the small tag
    borderRadius: 999,
    marginBottom: 4,
  },
  overlineText: {
    fontSize: 10,
    color: '#555555',
    fontWeight: '700',
    letterSpacing: 3,
  },
  wordmark: {
    fontSize: 52,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -2,
    lineHeight: 54,
  },
  tagline: {
    fontSize: 14,
    color: '#555555',
    fontWeight: '400',
    lineHeight: 20,
    marginTop: 4,
  },

  // ── Mode Tabs ────────────────────────────────────────────────────────────
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
    gap: 0,
    borderWidth: 1,
    borderColor: '#1A1A1A',
    borderRadius: 0,           // sharp — brutalist
    overflow: 'hidden',
  },
  modeTab: {
    flex: 1,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  modeTabActive: {
    backgroundColor: '#FFFFFF',
  },
  modeTabDivider: {
    width: 1,
    height: 44,
    backgroundColor: '#1A1A1A',
  },
  modeTabText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#333333',
    letterSpacing: 2.5,
  },
  modeTabTextActive: {
    color: '#000000',
  },

  // ── Form fields ──────────────────────────────────────────────────────────
  form: {
    gap: 20,
  },
  field: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#444444',
    letterSpacing: 2.5,
  },
  fieldInput: {
    height: 52,
    borderWidth: 1,
    borderColor: '#1A1A1A',
    borderRadius: 0,            // sharp edges
    paddingHorizontal: 16,
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '500',
    backgroundColor: '#000000',
  },
  fieldInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1A1A1A',
    borderRadius: 0,
    backgroundColor: '#000000',
    height: 52,
    paddingHorizontal: 16,
  },
  eyeBtn: {
    paddingLeft: 12,
  },
  eyeLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#444444',
    letterSpacing: 2,
  },

  // ── Error ────────────────────────────────────────────────────────────────
  errorStrip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: '#2A0000',
    backgroundColor: '#0D0000',
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
    borderRadius: 0,
  },
  errorAccent: {
    width: 2,
    alignSelf: 'stretch',
    backgroundColor: '#EF4444',
    borderRadius: 999,
    flexShrink: 0,
  },
  errorText: {
    fontSize: 13,
    color: '#EF4444',
    fontWeight: '500',
    lineHeight: 18,
    flex: 1,
  },

  // ── Submit button ────────────────────────────────────────────────────────
  submitBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,          // extreme pill — contrast to sharp inputs
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitBtnText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#000000',
    letterSpacing: 3,
  },

  // ── Divider ──────────────────────────────────────────────────────────────
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#1A1A1A',
  },
  dividerText: {
    fontSize: 10,
    color: '#333333',
    fontWeight: '800',
    letterSpacing: 2,
  },

  // ── Google button ────────────────────────────────────────────────────────
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#1A1A1A',
    borderRadius: 999,           // pill
    paddingVertical: 16,
    gap: 12,
    backgroundColor: '#000000',
  },
  googleCircle: {
    width: 20,
    height: 20,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleG: {
    fontSize: 12,
    fontWeight: '900',
    color: '#000000',
  },
  googleBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#888888',
    letterSpacing: 0.5,
  },

  // ── Footer ───────────────────────────────────────────────────────────────
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 36,
  },
  footerText: {
    fontSize: 13,
    color: '#444444',
    fontWeight: '500',
  },
  footerLink: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  legalText: {
    fontSize: 10,
    color: '#2A2A2A',
    textAlign: 'center',
    marginTop: 20,
    lineHeight: 15,
    letterSpacing: 0.3,
  },
});

