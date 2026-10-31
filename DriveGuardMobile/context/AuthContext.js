/**
 * AuthContext.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Global authentication & session state.
 * Uses AsyncStorage for persistence — no external auth SDK required.
 *
 * user shape:
 *   { uid, email, displayName, provider, createdAt, driverCode }
 *
 * driverCode: 6-character alphanumeric (uppercase) — permanent, generated once at registration.
 *             Used by operators on the web dashboard to add drivers to their fleet.
 *
 * sessionHistory shape (per user, stored under uid key):
 *   [ { id, startedAt, endedAt, totalAlerts, peakState, durationSec }, ... ]
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const USERS_KEY         = '@dg_users_v1';
const SESSION_KEY       = (uid) => `@dg_sessions_v1_${uid}`;
const CURRENT_USER_KEY  = '@dg_current_user_v1';

// ─── Shared storage keys (also used by the Web Dashboard) ────────────────────
// The web dashboard reads @dg_users_v1 to look up drivers by driverCode.
export const SHARED_USERS_KEY = USERS_KEY;

const AuthContext = createContext(null);

// ─── Tiny UUID generator (no external dep) ───────────────────────────────────
const uid8 = () =>
  Math.random().toString(36).slice(2, 10) +
  Math.random().toString(36).slice(2, 10);

// ─── 6-digit alphanumeric driver code generator ──────────────────────────────
// Generates a permanent, uppercase 6-character code (A-Z, 0-9).
// Probability of collision for 10,000 drivers: ~0.003% — sufficient for demo.
const generateDriverCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // excl. easily confused chars
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
};

// ─── Ensure code uniqueness across existing users ────────────────────────────
const generateUniqueDriverCode = (existingUsers) => {
  const existingCodes = new Set(
    Object.values(existingUsers).map((u) => u.driverCode).filter(Boolean)
  );
  let code;
  let attempts = 0;
  do {
    code = generateDriverCode();
    attempts++;
  } while (existingCodes.has(code) && attempts < 100);
  return code;
};

// ─── Sync driver profile with the unified DriveGuard backend ──────────────────
const syncDriverWithBackend = async (userData) => {
  if (!userData?.driverCode) return;
  try {
    const serverIp = await AsyncStorage.getItem('@driveguard_server_ip');
    if (!serverIp) return;
    await fetch(`http://${serverIp}:8000/api/drivers/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid:         userData.uid,
        email:       userData.email,
        displayName: userData.displayName,
        driverCode:  userData.driverCode,
        createdAt:   userData.createdAt,
      }),
    });
  } catch (_) {
    // Offline or server not configured yet; local state remains primary
  }
};

// ─── Basic email validation (contains "@") ───────────────────────────────────
export const isValidEmail = (email) =>
  typeof email === 'string' && email.includes('@');

// ─── Password minimum length ──────────────────────────────────────────────────
const MIN_PASSWORD_LEN = 6;

export function AuthProvider({ children }) {
  const [user, setUser]             = useState(null);   // null = logged out
  const [loading, setLoading]       = useState(true);   // initial hydration
  const [sessions, setSessions]     = useState([]);     // current user's history

  // ── Hydrate from storage on mount ─────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(CURRENT_USER_KEY);
        if (raw) {
          let saved = JSON.parse(raw);
          if (!saved.driverCode) {
            const rawUsers = await AsyncStorage.getItem(USERS_KEY);
            const users = rawUsers ? JSON.parse(rawUsers) : {};
            const code = generateUniqueDriverCode(users);
            saved.driverCode = code;
            if (saved.email && users[saved.email.toLowerCase()]) {
              users[saved.email.toLowerCase()].driverCode = code;
              await AsyncStorage.setItem(USERS_KEY, JSON.stringify(users));
            }
            await AsyncStorage.setItem(CURRENT_USER_KEY, JSON.stringify(saved));
          }
          setUser(saved);
          syncDriverWithBackend(saved);

          const sessRaw = await AsyncStorage.getItem(SESSION_KEY(saved.uid));
          setSessions(sessRaw ? JSON.parse(sessRaw) : []);
        }
      } catch (_) {
        // corrupted data — start fresh
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Persist sessions whenever they change ─────────────────────────────────
  const persistSessions = useCallback(async (uid, list) => {
    try {
      await AsyncStorage.setItem(SESSION_KEY(uid), JSON.stringify(list));
    } catch (_) {}
  }, []);

  // ── Register with email/password ──────────────────────────────────────────
  const registerWithEmail = useCallback(async (email, password, displayName) => {
    if (!isValidEmail(email)) {
      throw new Error('Please enter a valid email address (must contain "@").');
    }
    if (!password || password.length < MIN_PASSWORD_LEN) {
      throw new Error(`Password must be at least ${MIN_PASSWORD_LEN} characters.`);
    }
    if (!displayName || displayName.trim().length < 1) {
      throw new Error('Please enter your name.');
    }

    // Load existing users
    const raw   = await AsyncStorage.getItem(USERS_KEY);
    const users = raw ? JSON.parse(raw) : {};

    const emailKey = email.toLowerCase();
    if (users[emailKey]) {
      throw new Error('An account with this email already exists.');
    }

    // Generate a unique 6-char driver code
    const driverCode = generateUniqueDriverCode(users);

    const newUser = {
      uid:         uid8(),
      email:       emailKey,
      displayName: displayName.trim(),
      password,           // NOTE: for a real app, hash this. This is demo only.
      provider:    'email',
      createdAt:   new Date().toISOString(),
      driverCode,         // permanent 6-digit code for operator linkage
    };

    users[emailKey] = newUser;
    await AsyncStorage.setItem(USERS_KEY, JSON.stringify(users));

    // Persist session & set current (exclude password from public user)
    const publicUser = { ...newUser };
    delete publicUser.password;
    await AsyncStorage.setItem(CURRENT_USER_KEY, JSON.stringify(publicUser));
    setSessions([]);
    setUser(publicUser);

    // Sync driver with unified backend
    syncDriverWithBackend(publicUser);

    return publicUser;
  }, []);

  // ── Sign in with email/password ───────────────────────────────────────────
  const signInWithEmail = useCallback(async (email, password) => {
    if (!isValidEmail(email)) {
      throw new Error('Please enter a valid email address.');
    }
    if (!password) throw new Error('Please enter your password.');

    const raw   = await AsyncStorage.getItem(USERS_KEY);
    const users = raw ? JSON.parse(raw) : {};
    const emailKey = email.toLowerCase();
    const stored = users[emailKey];

    if (!stored || stored.password !== password) {
      throw new Error('Incorrect email or password.');
    }

    const publicUser = { ...stored };
    delete publicUser.password;
    await AsyncStorage.setItem(CURRENT_USER_KEY, JSON.stringify(publicUser));

    const sessRaw = await AsyncStorage.getItem(SESSION_KEY(publicUser.uid));
    setSessions(sessRaw ? JSON.parse(sessRaw) : []);
    setUser(publicUser);

    // Sync driver with unified backend
    syncDriverWithBackend(publicUser);

    return publicUser;
  }, []);

  // ── Google Sign-In (mock — replace with expo-auth-session + Google OAuth) ──
  const signInWithGoogle = useCallback(async () => {
    // ── INTEGRATION POINT ──────────────────────────────────────────────────
    // To wire up real Google OAuth with Expo:
    //   1. npm install expo-auth-session expo-crypto expo-web-browser
    //   2. Configure OAuth consent screen in Google Cloud Console
    //   3. Add scheme to app.json:  "scheme": "driveguard"
    //   4. Use AuthSession.makeRedirectUri() + Google discovery document
    //   5. Replace the mock below with real token exchange
    // ──────────────────────────────────────────────────────────────────────

    // For now, create/retrieve a mock Google user:
    const mockEmail = 'google.user@gmail.com';
    const raw       = await AsyncStorage.getItem(USERS_KEY);
    const users     = raw ? JSON.parse(raw) : {};

    let googleUser = users[mockEmail];
    if (!googleUser) {
      const driverCode = generateUniqueDriverCode(users);
      googleUser = {
        uid:         uid8(),
        email:       mockEmail,
        displayName: 'Google User',
        provider:    'google',
        createdAt:   new Date().toISOString(),
        driverCode,
      };
      users[mockEmail] = googleUser;
      await AsyncStorage.setItem(USERS_KEY, JSON.stringify(users));
    }

    const publicUser = { ...googleUser };
    delete publicUser.password;
    await AsyncStorage.setItem(CURRENT_USER_KEY, JSON.stringify(publicUser));

    const sessRaw = await AsyncStorage.getItem(SESSION_KEY(publicUser.uid));
    setSessions(sessRaw ? JSON.parse(sessRaw) : []);
    setUser(publicUser);
    return publicUser;
  }, []);

  // ── Sign out ──────────────────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    await AsyncStorage.removeItem(CURRENT_USER_KEY);
    setUser(null);
    setSessions([]);
  }, []);

  // ── Save a completed driving session ─────────────────────────────────────
  const saveSession = useCallback(async (sessionData) => {
    if (!user) return;
    const newSession = {
      id:          uid8(),
      driverCode:  user.driverCode,
      driverName:  user.displayName,
      startedAt:   sessionData.startedAt  ?? new Date().toISOString(),
      endedAt:     new Date().toISOString(),
      totalAlerts: sessionData.totalAlerts ?? 0,
      peakState:   sessionData.peakState  ?? 'AWAKE',
      durationSec: sessionData.durationSec ?? 0,
      blinkCount:  sessionData.blinkCount ?? 0,
    };
    const updated = [newSession, ...sessions].slice(0, 50); // cap at 50
    setSessions(updated);
    await persistSessions(user.uid, updated);

    // Sync session to the unified backend
    try {
      const serverIp = await AsyncStorage.getItem('@driveguard_server_ip');
      if (serverIp) {
        fetch(`http://${serverIp}:8000/api/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newSession),
        }).catch(() => {});
      }
    } catch (_) {}
  }, [user, sessions, persistSessions]);

  const value = {
    user,
    loading,
    sessions,
    isAuthenticated: !!user,
    registerWithEmail,
    signInWithEmail,
    signInWithGoogle,
    signOut,
    saveSession,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
