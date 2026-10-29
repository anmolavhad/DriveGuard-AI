/**
 * theme.js — DriveGuard AI Design System
 * ─────────────────────────────────────────────────────────────────────────────
 * High-Contrast Minimalist Dark. Pure Black dominant.
 * No generic blues, no soft grays, no drop shadows.
 */

export const Colors = {
  // ── Core backgrounds ────────────────────────────────────────────────────
  bg:            '#000000',   // Pure black — dominant screen background
  bgCard:        '#0A0A0A',   // Near-black card surface
  bgCardAlt:     '#111111',   // Slightly lifted surface
  bgModal:       '#0A0A0A',
  bgHUD:         'rgba(0,0,0,0.90)',

  // ── Borders / Dividers ──────────────────────────────────────────────────
  border:        '#1A1A1A',   // Ultra-dark gray — 1px component borders
  borderMid:     '#222222',   // Slightly lighter separator
  borderHover:   '#333333',   // Interactive hover state border

  // ── Legacy aliases (still used by Camera/HUD) ───────────────────────────
  borderActive:  '#444444',
  primary:       '#FFFFFF',   // Remapped: white is now "primary"
  primaryGlow:   'rgba(255,255,255,0.08)',

  // ── Typography ──────────────────────────────────────────────────────────
  textPrimary:   '#FFFFFF',   // Pure white — primary text & active icons
  textSecondary: '#888888',   // Mid-gray — secondary metadata
  textMuted:     '#444444',   // Muted — disabled / placeholder
  textLabel:     '#555555',
  textInverted:  '#000000',   // Black text on white surfaces

  // ── Status ──────────────────────────────────────────────────────────────
  attentive:     '#22C55E',
  attentiveGlow: 'rgba(34,197,94,0.20)',
  drowsy:        '#F59E0B',
  drowsyGlow:    'rgba(245,158,11,0.20)',
  sleeping:      '#EF4444',
  sleepingGlow:  'rgba(239,68,68,0.20)',
  connected:     '#22C55E',
  disconnected:  '#EF4444',

  // ── Utility ─────────────────────────────────────────────────────────────
  white:         '#FFFFFF',
  danger:        '#EF4444',
  success:       '#22C55E',
  warning:       '#F59E0B',
  overlay:       'rgba(0,0,0,0.72)',
};

// Intentional whitespace: macro (32-48px) padding on containers,
// tight micro-spacing (4-8px) between related elements.
export const Spacing = {
  xs:   4,
  sm:   8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
};

// Bespoke: either sharp (0) or extreme pill (999). No middle ground.
export const Radius = {
  none: 0,
  sm:   4,   // kept for legacy refs in Camera/HUD
  md:   4,
  lg:   4,
  xl:   4,
  pill: 999,
  full: 999,
};

export const FontSize = {
  overline: 10,   // uppercase tracked tags
  xs:       11,
  sm:       13,
  md:       15,
  lg:       18,
  xl:       24,
  xxl:      32,
  hero:     42,
};

// No drop shadows — borders + negative space only
export const Shadow = {
  card: {
    shadowColor:   'transparent',
    shadowOffset:  { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius:  0,
    elevation:     0,
  },
  glow: (_color) => ({
    shadowColor:   'transparent',
    shadowOffset:  { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius:  0,
    elevation:     0,
  }),
};
