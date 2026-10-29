import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, FontSize, Radius, Spacing } from '../constants/theme';

/**
 * A single metric display card used in the HUD overlay.
 *
 * Props:
 *   label       {string}   - e.g. "EAR"
 *   value       {string}   - formatted value to display
 *   unit        {string?}  - optional unit suffix
 *   accentColor {string}   - border/label accent color
 *   glowColor   {string?}  - glow shadow color
 */
export function MetricCard({ label, value, unit, accentColor, glowColor }) {
  return (
    <View style={[styles.card, { borderColor: accentColor, shadowColor: glowColor ?? accentColor }]}>
      <Text style={[styles.label, { color: accentColor }]}>{label}</Text>
      <View style={styles.valueRow}>
        <Text style={styles.value}>{value}</Text>
        {unit ? <Text style={[styles.unit, { color: accentColor }]}>{unit}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: 'rgba(15, 20, 38, 0.70)',
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm + 2,
    marginHorizontal: 4,
    alignItems: 'center',
    // Glow
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 5,
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  value: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: 0.5,
  },
  unit: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    marginLeft: 2,
    marginBottom: 2,
  },
});
