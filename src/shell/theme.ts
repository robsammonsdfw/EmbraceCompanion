// ============================================================================
// Light and dark (COMPANION_APP_PLAN.md: design)
// ============================================================================
// Dark is athletic: true black, glowing teal, huge condensed numbers (WHOOP,
// Nike Run Club). Light is clean: soft grey page, white cards with soft
// shadows, teal-to-blue gradients (Apple Fitness, Google Fit).
//
// The member picks Automatic (follows the phone), Light or Dark in Settings.
//
//   const t = useTheme()                     the current palette, re-renders on change
//   const useStyles = themed((t) => StyleSheet.create({...}))
//   const s = useStyles()                    inside a component; cached per palette
//   font.display / font.displayBold          condensed numbers and headlines
// ============================================================================

import { useSyncExternalStore } from 'react';
import { Platform, StyleSheet, useColorScheme, type ViewStyle } from 'react-native';

import { getShellPref, setShellPref } from './storage';

export type ThemeMode = 'system' | 'light' | 'dark';

export type Palette = {
  mode: 'light' | 'dark';
  /** Page background. */
  bg: string;
  /** Cards and panels. */
  card: string;
  /** A card on a card, inputs, tracks of bars. */
  sunken: string;
  line: string;
  text: string;
  dim: string;
  faint: string;
  /** EmbraceHealthAI teal, for actions and highlights. */
  accent: string;
  /** Text and icons on an accent fill. */
  onAccent: string;
  accentSoft: string;
  /** Hero gradient, start → end. */
  gradient: [string, string];
  /** Darker gradient for pressed or secondary heroes. */
  gradientDeep: [string, string];
  orange: string; orangeSoft: string;
  amber: string; amberSoft: string;
  red: string; redSoft: string;
  green: string; greenSoft: string;
  sky: string; skySoft: string;
  cyan: string; cyanSoft: string;
  rose: string; roseSoft: string;
  purple: string; purpleSoft: string;
  indigo: string;
  /** Raised cards: a soft shadow in light, a hairline in dark. */
  raised: ViewStyle;
  statusBar: 'light' | 'dark';
};

const shadow = (opacity: number, radius: number, y: number): ViewStyle =>
  Platform.select<ViewStyle>({
    ios: { shadowColor: '#0B1220', shadowOpacity: opacity, shadowRadius: radius, shadowOffset: { width: 0, height: y } },
    default: { elevation: Math.round(radius / 3) },
  }) ?? {};

export const dark: Palette = {
  mode: 'dark',
  bg: '#000000',
  card: '#121214',
  sunken: '#1C1C20',
  line: 'rgba(255,255,255,0.08)',
  text: '#FFFFFF',
  dim: '#A1A1AA',
  faint: '#6B6B75',
  accent: '#2DD4BF',
  onAccent: '#022C29',
  accentSoft: 'rgba(45,212,191,0.14)',
  gradient: ['#14B8A6', '#0EA5E9'],
  gradientDeep: ['#0F766E', '#075985'],
  orange: '#FB923C', orangeSoft: 'rgba(251,146,60,0.16)',
  amber: '#FBBF24', amberSoft: 'rgba(251,191,36,0.16)',
  red: '#F43F5E', redSoft: 'rgba(244,63,94,0.18)',
  green: '#34D399', greenSoft: 'rgba(52,211,153,0.16)',
  sky: '#38BDF8', skySoft: 'rgba(56,189,248,0.16)',
  cyan: '#22D3EE', cyanSoft: 'rgba(34,211,238,0.16)',
  rose: '#FB7185', roseSoft: 'rgba(251,113,133,0.16)',
  purple: '#C084FC', purpleSoft: 'rgba(192,132,252,0.16)',
  indigo: '#818CF8',
  raised: { borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.10)' },
  statusBar: 'light',
};

export const light: Palette = {
  mode: 'light',
  bg: '#F2F4F7',
  card: '#FFFFFF',
  sunken: '#EEF1F5',
  line: 'rgba(15,23,42,0.08)',
  text: '#0B1220',
  dim: '#475569',
  faint: '#94A3B8',
  accent: '#0D9488',
  onAccent: '#FFFFFF',
  accentSoft: 'rgba(13,148,136,0.10)',
  gradient: ['#14B8A6', '#3B82F6'],
  gradientDeep: ['#0F766E', '#1D4ED8'],
  orange: '#EA580C', orangeSoft: 'rgba(234,88,12,0.10)',
  amber: '#D97706', amberSoft: 'rgba(217,119,6,0.12)',
  red: '#E11D48', redSoft: 'rgba(225,29,72,0.10)',
  green: '#059669', greenSoft: 'rgba(5,150,105,0.10)',
  sky: '#0284C7', skySoft: 'rgba(2,132,199,0.10)',
  cyan: '#0891B2', cyanSoft: 'rgba(8,145,178,0.10)',
  rose: '#E11D48', roseSoft: 'rgba(225,29,72,0.10)',
  purple: '#9333EA', purpleSoft: 'rgba(147,51,234,0.10)',
  indigo: '#4F46E5',
  raised: shadow(0.08, 18, 6),
  statusBar: 'dark',
};

export const radius = { card: 24, tile: 20, button: 18, pill: 999 } as const;

/** Condensed sports type for numbers and headlines (loaded in src/app/_layout.tsx). */
export const font = {
  display: 'BarlowCondensed_800ExtraBold_Italic',
  displayBold: 'BarlowCondensed_700Bold',
  displayMedium: 'BarlowCondensed_600SemiBold',
} as const;

// ---- The member's choice ------------------------------------------------------------

const KEY = 'theme_mode';
let mode: ThemeMode | null = null;
const listeners = new Set<() => void>();

const readMode = (): ThemeMode => {
  if (mode === null) {
    const saved = getShellPref(KEY);
    mode = saved === 'light' || saved === 'dark' ? saved : 'system';
  }
  return mode;
};

export const setThemeMode = (next: ThemeMode) => {
  mode = next;
  setShellPref(KEY, next);
  listeners.forEach((l) => l());
};

export const useThemeMode = (): ThemeMode =>
  useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, readMode, readMode);

/** The palette in use now. */
export const useTheme = (): Palette => {
  const chosen = useThemeMode();
  const system = useColorScheme();
  const resolved = chosen === 'system' ? (system === 'light' ? 'light' : system === 'dark' ? 'dark' : 'light') : chosen;
  return resolved === 'dark' ? dark : light;
};

/** Styles built from the palette, made once per palette. */
export function themed<T>(factory: (t: Palette) => T): () => T {
  const cache = new Map<Palette, T>();
  return () => {
    const t = useTheme();
    let v = cache.get(t);
    if (v === undefined) { v = factory(t); cache.set(t, v); }
    return v;
  };
}
