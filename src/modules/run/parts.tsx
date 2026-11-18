// The live dashboard's building blocks, in light and dark (the shell's
// theme.ts): big condensed numbers readable at arm's length outdoors, and
// controls large enough for gloves.
//
// `ink` (colours) and the style sheets made with runStyles() are refreshed for
// the current theme by <RunThemed>, which wraps the live screen and remounts
// it when the theme changes, so everything below can read them directly.

import React, { Fragment } from 'react';
import { Pressable, StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native';

import { dark, font, useTheme, type Palette } from '@/shell/theme';

import type { Unit } from './calc/types';
import { Help } from './helper/ui';

const inkFor = (t: Palette) => {
  const d = t.mode === 'dark';
  return {
    mode: t.mode,
    bg: t.bg, panel: t.card, line: d ? '#27272A' : 'rgba(15,23,42,0.10)', text: t.text, dim: t.dim, faint: t.faint,
    teal: d ? '#14B8A6' : '#0D9488', tealSoft: t.accent, onTeal: t.onAccent,
    orange: t.orange, red: d ? '#DC2626' : '#DC2626', amber: t.amber, sky: t.sky, green: t.green, rose: t.rose,
    indigo: t.indigo, purple: t.purple, cyan: t.cyan,
    // Tinted backgrounds for chips, notices and buttons.
    amberBg: t.amberSoft, tealBg: t.accentSoft, redBg: t.redSoft, orangeBg: t.orangeSoft, purpleBg: t.purpleSoft,
    cyanBg: t.cyanSoft, greenBg: t.greenSoft, skyBg: t.skySoft, indigoBg: d ? 'rgba(129,140,248,0.16)' : 'rgba(79,70,229,0.10)',
    raised: t.raised,
  };
};

/** The dashboard's colours for the current theme. */
export const ink = inkFor(dark);

const sheets: (() => void)[] = [];
/** A style sheet rebuilt from `ink` whenever the theme changes. */
export function runStyles<T extends object>(make: () => T): T {
  const sheet = make();
  sheets.push(() => { Object.assign(sheet, make()); });
  return sheet;
}

let applied: Palette = dark;
const apply = (t: Palette) => {
  if (applied === t) return;
  applied = t;
  Object.assign(ink, inkFor(t));
  sheets.forEach((rebuild) => rebuild());
};

/** Wraps the live screen: applies the theme, and starts it afresh when the theme changes. */
export function RunThemed({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  apply(t);
  return <Fragment key={t.mode}>{children}</Fragment>;
}

export const distUnit = (u: Unit) => (u === 'imperial' ? 'mi' : 'km');
export const speedUnit = (u: Unit) => (u === 'imperial' ? 'MPH' : 'KPH');

export const Panel: React.FC<{ children: React.ReactNode; style?: ViewStyle }> = ({ children, style }) => (
  <View style={[s.panel, style]}>{children}</View>
);

export const Tile: React.FC<{ label: string; value: React.ReactNode; sub?: string; color?: string; accent?: string }> = ({ label, value, sub, color = ink.text, accent = ink.dim }) => (
  <View style={s.tile}>
    <Text style={[s.tileLabel, { color: accent }]} numberOfLines={1}>{label}</Text>
    <Text style={[s.tileValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    {sub ? <Text style={s.tileSub} numberOfLines={1}>{sub}</Text> : null}
  </View>
);

export const Row: React.FC<{ children: React.ReactNode; style?: ViewStyle }> = ({ children, style }) => <View style={[s.row, style]}>{children}</View>;

export const Big: React.FC<{ value: string; unit: string; color?: string; valueColor?: string; size?: number }> = ({ value, unit, color = ink.teal, valueColor = ink.text, size = 104 }) => (
  <View style={{ alignItems: 'center' }}>
    <Text style={[s.big, { fontSize: size, lineHeight: size * 1.06, color: valueColor }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    <Text style={[s.bigUnit, { color }]}>{unit}</Text>
  </View>
);

/** A square button that's easy to hit: ▲ ▼ + −. */
export const Nudge: React.FC<{ label: string; text: string; onPress: () => void; disabled?: boolean; wide?: boolean }> = ({ label, text, onPress, disabled, wide }) => (
  <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={disabled} hitSlop={6}
    style={({ pressed }) => [s.nudge, wide && { width: 64 }, (pressed || disabled) && { opacity: 0.4 }]}>
    <Text style={s.nudgeText}>{text}</Text>
  </Pressable>
);

export const Chip: React.FC<{ text: string; bg: string; fg: string }> = ({ text, bg, fg }) => (
  <View style={[s.chip, { backgroundColor: bg }]}><View style={[s.dot, { backgroundColor: fg }]} /><Text style={[s.chipText, { color: fg }]}>{text}</Text></View>
);

export const DarkButton: React.FC<{ title: string; onPress: () => void; bg?: string; fg?: string; style?: ViewStyle; textStyle?: TextStyle; disabled?: boolean }> = ({ title, onPress, bg = ink.panel, fg = ink.text, style, textStyle, disabled }) => (
  <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled}
    style={({ pressed }) => [s.button, { backgroundColor: bg }, style, (pressed || disabled) && { opacity: 0.6 }]}>
    <Text style={[s.buttonText, { color: fg }, textStyle]}>{title}</Text>
  </Pressable>
);

/** Fuel: estimated kcal left from what was eaten (or burned, when nothing was logged), with + Gel. iStride's FuelGauge. */
export const FuelGauge: React.FC<{
  startCalories: number; consumed: number; burned: number; hasWeight: boolean; unit: Unit;
  fasted: { glycogen_kcal: number; fat_share: number; fat_kg: number } | null; onGel: () => void;
}> = ({ startCalories, consumed, burned, hasWeight, unit, fasted, onGel }) => {
  const isFasted = startCalories <= 0 && !!fasted && fasted.glycogen_kcal > 0;
  const fuelIn = isFasted ? fasted!.glycogen_kcal + consumed : startCalories + consumed;
  const hasFuelLog = fuelIn > 0;
  const drain = isFasted ? burned * (1 - fasted!.fat_share) : burned;
  const fatBurnedG = isFasted ? (burned * fasted!.fat_share) / 9 : 0;
  const remaining = fuelIn - drain;
  const pct = hasFuelLog ? Math.max(0, Math.min(100, (remaining / fuelIn) * 100)) : null;
  const low = pct !== null && pct < 20;
  const value = !hasWeight ? '--' : hasFuelLog ? String(Math.max(0, Math.round(remaining))) : String(Math.round(burned));
  const label = !hasWeight ? 'Add weight for est.' : hasFuelLog ? (isFasted ? 'Est. glycogen kcal left' : 'Est. kcal left') : 'Est. kcal burned';
  return (
    <Help id="runs.live.fuel" style={s.gauge}>
      <Text style={[s.tileLabel, { color: ink.amber }]}>Fuel</Text>
      {pct !== null && hasWeight && (
        <View style={s.bar}><View style={[s.barFill, { width: `${pct}%`, backgroundColor: low ? ink.red : ink.amber }]} /></View>
      )}
      <Text style={[s.gaugeValue, low && { color: ink.red }]}>{value}</Text>
      <Text style={s.tileSub}>{label}</Text>
      {consumed > 0 && <Text style={[s.tileSub, { color: ink.amber }]}>+{Math.round(consumed)} taken</Text>}
      {isFasted && hasWeight && <Text style={[s.tileSub, { color: ink.orange }]}>Fasted · ~{Math.round(fatBurnedG)} g fat used</Text>}
      {isFasted && hasWeight && fasted!.fat_kg > 0 && (
        <Text style={s.tileSub}>Fat stores ~{unit === 'imperial' ? `${Math.round(fasted!.fat_kg * 2.20462)} lb` : `${Math.round(fasted!.fat_kg)} kg`}</Text>
      )}
      <Help id="runs.live.gel" style={{ alignSelf: 'stretch' }}>
        <DarkButton title="+ Gel" onPress={onGel} bg={ink.amberBg} fg={ink.amber} style={s.gaugeButton} />
      </Help>
    </Help>
  );
};

/** Fluid: logged sips minus estimated sweat, with + Sip. iStride's HydrationGauge. */
export const HydrationGauge: React.FC<{ lost: number; intake: number; hasWeight: boolean; onSip: () => void }> = ({ lost, intake, hasWeight, onSip }) => {
  const net = intake - lost;
  const pct = hasWeight ? Math.max(0, Math.min(100, ((net + 1000) / 1200) * 100)) : 0;
  const low = hasWeight && net < -500;
  return (
    <Help id="runs.live.fluid" style={s.gauge}>
      <Text style={[s.tileLabel, { color: ink.cyan }]}>Fluid</Text>
      <View style={s.bar}><View style={[s.barFill, { width: `${pct}%`, backgroundColor: low ? ink.sky : ink.cyan }]} /></View>
      <Text style={s.gaugeValue}>{hasWeight ? Math.abs(Math.round(net)) : '--'}</Text>
      <Text style={s.tileSub}>{hasWeight ? `Est. mL ${net < 0 ? 'deficit' : 'surplus'}` : 'Add weight for est.'}</Text>
      <Help id="runs.live.sip" style={{ alignSelf: 'stretch' }}>
        <DarkButton title="+ Sip" onPress={onSip} bg={ink.cyanBg} fg={ink.cyan} style={s.gaugeButton} />
      </Help>
    </Help>
  );
};

export const s = runStyles(() => StyleSheet.create({
  panel: { backgroundColor: ink.panel, borderRadius: 24, borderWidth: ink.mode === 'dark' ? 1 : 0, borderColor: ink.line, padding: 16, gap: 10, ...ink.raised },
  row: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, minWidth: 0, backgroundColor: ink.panel, borderRadius: 20, borderWidth: ink.mode === 'dark' ? 1 : 0, borderColor: ink.line, paddingVertical: 12, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', ...ink.raised },
  tileLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  tileValue: { fontFamily: font.display, fontSize: 30, lineHeight: 34, fontVariant: ['tabular-nums'] },
  tileSub: { fontSize: 11, fontWeight: '700', color: ink.faint, textAlign: 'center' },
  big: { color: ink.text, fontFamily: font.display, fontVariant: ['tabular-nums'], letterSpacing: -1 },
  bigUnit: { fontFamily: font.display, fontSize: 22, textTransform: 'uppercase', letterSpacing: 1 },
  nudge: { width: 52, height: 48, borderRadius: 14, backgroundColor: ink.mode === 'dark' ? ink.line : 'rgba(15,23,42,0.06)', alignItems: 'center', justifyContent: 'center' },
  nudgeText: { color: ink.text, fontSize: 20, fontWeight: '900' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  chipText: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  button: { borderRadius: 18, minHeight: 52, paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderWidth: ink.mode === 'dark' ? 1 : 0, borderColor: ink.line },
  buttonText: { fontSize: 15, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.6 },
  gauge: { flex: 1, backgroundColor: ink.panel, borderRadius: 20, borderWidth: ink.mode === 'dark' ? 1 : 0, borderColor: ink.line, padding: 12, alignItems: 'center', gap: 4, ...ink.raised },
  gaugeValue: { color: ink.text, fontFamily: font.display, fontSize: 32, lineHeight: 36, fontVariant: ['tabular-nums'] },
  gaugeButton: { alignSelf: 'stretch', marginTop: 4 },
  bar: { alignSelf: 'stretch', height: 10, borderRadius: 5, backgroundColor: ink.mode === 'dark' ? ink.line : 'rgba(15,23,42,0.08)', overflow: 'hidden' },
  barFill: { height: 10, borderRadius: 5 },
}));
