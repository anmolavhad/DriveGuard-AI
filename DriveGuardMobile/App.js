/**
 * App.js  —  DriveGuard AI  (Navigation Root — SDK 58)
 * ─────────────────────────────────────────────────────────────────────────────
 * Navigation flow:
 *   Not authenticated → AuthScreen
 *   Authenticated     → Bottom Tab Navigator (Home | Analytics | History | Settings)
 *                           └─ Home "Start Detection" → CameraScreen (native stack modal)
 *
 * Providers:
 *   - SafeAreaProvider
 *   - AuthProvider (global user/session context)
 *   - SleepAlarmModal (critical alarm overlay, above everything)
 */

import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NavigationContainer }        from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator }   from '@react-navigation/bottom-tabs';
import { SafeAreaProvider }           from 'react-native-safe-area-context';
import { StatusBar }                  from 'expo-status-bar';
import Svg, { Path }                  from 'react-native-svg';

import { AuthProvider, useAuth }  from './context/AuthContext';
import { AuthScreen }             from './screens/AuthScreen';
import { HomeScreen }             from './screens/HomeScreen';
import { AnalyticsScreen }        from './screens/AnalyticsScreen';
import { HistoryScreen }          from './screens/HistoryScreen';
import { SettingsScreen }         from './screens/SettingsScreen';
import { CameraScreen }           from './components/CameraScreen';
import { SleepAlarmModal }        from './components/SleepAlarmModal';

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

// ─── Precision Automotive Tab Icons (Icon-Only Minimalist) ───────────────────
function TabIcon({ label, focused }) {
  const color = focused ? '#FFFFFF' : '#666666';
  const strokeWidth = focused ? 2.3 : 1.7;

  let iconNode = null;
  if (label === 'Home') {
    iconNode = (
      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth}>
        <Path
          d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1V9.5z"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill={focused ? 'rgba(255,255,255,0.14)' : 'none'}
        />
      </Svg>
    );
  } else if (label === 'Analytics') {
    iconNode = (
      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth}>
        <Path d="M18 20V10M12 20V4M6 20v-6" strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M3 20h18" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  } else if (label === 'History') {
    iconNode = (
      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth}>
        <Path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  } else if (label === 'Settings') {
    iconNode = (
      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth}>
        <Path d="M12 15a3 3 0 100-6 3 3 0 000 6z" strokeLinecap="round" strokeLinejoin="round" />
        <Path
          d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  }

  return (
    <View style={tabIconStyles.wrap}>
      <View style={tabIconStyles.iconBox}>{iconNode}</View>
      {focused && <View style={tabIconStyles.activeDot} />}
    </View>
  );
}

const tabIconStyles = StyleSheet.create({
  wrap:        { alignItems: 'center', justifyContent: 'center', height: '100%', gap: 4 },
  iconBox:     { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  activeDot:   { width: 4, height: 4, borderRadius: 2, backgroundColor: '#FFFFFF' },
});

// ─── Bottom Tab Navigator ─────────────────────────────────────────────────────
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: '#000000',
          borderTopWidth: 1,
          borderTopColor: '#1A1A1A',
          height: 64,
          paddingBottom: 0,
          // No elevation / shadow
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarIcon: ({ focused }) => (
          <TabIcon label={route.name} focused={focused} />
        ),
      })}
    >
      <Tab.Screen name="Home"      component={HomeScreen} />
      <Tab.Screen name="Analytics" component={AnalyticsScreen} />
      <Tab.Screen name="History"   component={HistoryScreen} />
      <Tab.Screen name="Settings"  component={SettingsScreen} />
    </Tab.Navigator>
  );
}

// ─── Root navigator — auth gate + camera modal ────────────────────────────────
function AppNavigator() {
  const { isAuthenticated, loading } = useAuth();
  const [alarmVisible, setAlarmVisible] = useState(false);
  const alarmShownRef = useRef(false);

  const handleCriticalAlarm = useCallback(() => {
    if (!alarmShownRef.current) {
      alarmShownRef.current = true;
      setAlarmVisible(true);
    }
  }, []);

  const handleAlarmDismiss = useCallback(() => {
    setAlarmVisible(false);
    alarmShownRef.current = false;
  }, []);

  if (loading) return null;

  return (
    <View style={styles.root}>
      <NavigationContainer>
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#000000' },
          }}
        >
          {!isAuthenticated ? (
            <Stack.Screen
              name="Auth"
              component={AuthScreen}
              options={{ animation: 'none' }}
            />
          ) : (
            <>
              {/* Main tabs */}
              <Stack.Screen
                name="Main"
                component={MainTabs}
                options={{ animation: 'none' }}
              />
              {/* Camera — full-screen modal on top of tabs */}
              <Stack.Screen
                name="Camera"
                options={{ animation: 'slide_from_bottom', gestureEnabled: false }}
              >
                {(props) => (
                  <CameraScreen
                    {...props}
                    onCriticalAlarm={handleCriticalAlarm}
                  />
                )}
              </Stack.Screen>
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>

      {/* Global critical alarm overlay — z-indexed above everything */}
      <SleepAlarmModal
        visible={alarmVisible}
        onDismiss={handleAlarmDismiss}
      />
    </View>
  );
}

// ─── Root export ──────────────────────────────────────────────────────────────
export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <AppNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
});
