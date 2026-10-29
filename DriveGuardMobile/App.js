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

// ─── Pure B&W tab icon renderer ───────────────────────────────────────────────
function TabIcon({ label, focused }) {
  const icons = {
    Home:      focused ? '◆' : '◇',
    Analytics: focused ? '▣' : '□',
    History:   focused ? '≡' : '≡',
    Settings:  focused ? '◉' : '○',
  };
  return (
    <View style={tabIconStyles.wrap}>
      <Text style={[tabIconStyles.icon, focused && tabIconStyles.iconFocused]}>
        {icons[label] ?? '·'}
      </Text>
      <Text style={[tabIconStyles.label, focused && tabIconStyles.labelFocused]}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

const tabIconStyles = StyleSheet.create({
  wrap:         { alignItems: 'center', justifyContent: 'center', gap: 2 },
  icon:         { fontSize: 14, color: '#333333' },
  iconFocused:  { color: '#FFFFFF' },
  label:        { fontSize: 8, fontWeight: '800', letterSpacing: 1.5, color: '#333333' },
  labelFocused: { color: '#FFFFFF' },
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
