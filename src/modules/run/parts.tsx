// The live dashboard's building blocks: dark, with big numbers readable at
// arm's length outdoors, and controls large enough for gloves.

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native';

import type { Unit } from './calc/types';
import { Help } from './helper/ui';

export const ink = {
  bg: '#000000', panel: '#18181B', line: '#27272A', text: '#FFFFFF', dim: '#A1A1AA', faint: '#71717A',
  teal: '#14B8A6', tealSoft: '#2DD4BF', orange: '#FB923C', red: '#DC2626', amber: '#FBBF24', sky: '#38BDF8',
  green: '#34D399', rose: '#F87171', indigo: '#818CF8', purple: '#A855F7',
} as const;

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
    <Text style={[s.big, { fontSize: size, lineHeight: size * 1.02, color: valueColor }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
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
        <DarkButton title="+ Gel" onPress={onGel} bg="#422006" fg="#FDE047" style={s.gaugeButton} />
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
      <Text style={[s.tileLabel, { color: '#22D3EE' }]}>Fluid</Text>
      <View style={s.bar}><View style={[s.barFill, { width: `${pct}%`, backgroundColor: low ? '#0891B2' : '#22D3EE' }]} /></View>
      <Text style={s.gaugeValue}>{hasWeight ? Math.abs(Math.round(net)) : '--'}</Text>
      <Text style={s.tileSub}>{hasWeight ? `Est. mL ${net < 0 ? 'deficit' : 'surplus'}` : 'Add weight for est.'}</Text>
      <Help id="runs.live.sip" style={{ alignSelf: 'stretch' }}>
        <DarkButton title="+ Sip" onPress={onSip} bg="#083344" fg="#67E8F9" style={s.gaugeButton} />
      </Help>
    </Help>
  );
};

/** Type your pulse: big − and + around the number, then Save. */
export const PulseEntry: React.FC<{ last: number | null; onSave: (bpm: number) => void }> = ({ last, onSave }) => {
  const [open, setOpen] = useState(false);
  const [bpm, setBpm] = useState(last ?? 110);
  if (!open) {
    return (
      <Help id="exercise.live.hrSource">
        <DarkButton title="♥ Enter your pulse" onPress={() => { setBpm(last ?? 110); setOpen(true); }} fg={ink.rose} />
      </Help>
    );
  }
  const bump = (d: number) => setBpm((v) => Math.max(40, Math.min(220, v + d)));
  return (
    <Panel>
      <Text style={[s.tileLabel, { color: ink.rose, textAlign: 'center' }]}>Your pulse now (beats a minute)</Text>
      <Row style={{ justifyContent: 'center', alignItems: 'center' }}>
        <Nudge label="Down 10" text="−10" onPress={() => bump(-10)} wide />
        <Nudge label="Down 1" text="−" onPress={() => bump(-1)} />
        <Text style={[s.gaugeValue, { fontSize: 44, width: 90, textAlign: 'center' }]}>{bpm}</Text>
        <Nudge label="Up 1" text="+" onPress={() => bump(1)} />
        <Nudge label="Up 10" text="+10" onPress={() => bump(10)} wide />
      </Row>
      <Row>
        <DarkButton title="Cancel" onPress={() => setOpen(false)} style={{ flex: 1 }} />
        <Help id="exercise.live.hrSet" style={{ flex: 1 }}>
          <DarkButton title="Save" onPress={() => { onSave(bpm); setOpen(false); }} bg={ink.teal} fg="#042F2E" />
        </Help>
      </Row>
    </Panel>
  );
};

export const s = StyleSheet.create({
  panel: { backgroundColor: ink.panel, borderRadius: 22, borderWidth: 1, borderColor: ink.line, padding: 14, gap: 10 },
  row: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, minWidth: 0, backgroundColor: ink.panel, borderRadius: 18, borderWidth: 1, borderColor: ink.line, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase' },
  tileValue: { fontSize: 24, fontWeight: '900', fontVariant: ['tabular-nums'] },
  tileSub: { fontSize: 11, fontWeight: '700', color: ink.faint, textAlign: 'center' },
  big: { color: ink.text, fontWeight: '900', fontStyle: 'italic', fontVariant: ['tabular-nums'], letterSpacing: -3 },
  bigUnit: { fontSize: 20, fontWeight: '900', fontStyle: 'italic', textTransform: 'uppercase' },
  nudge: { width: 52, height: 48, borderRadius: 12, backgroundColor: ink.line, alignItems: 'center', justifyContent: 'center' },
  nudgeText: { color: '#E4E4E7', fontSize: 20, fontWeight: '900' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  chipText: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  button: { borderRadius: 14, minHeight: 50, paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: ink.line },
  buttonText: { fontSize: 15, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },
  gauge: { flex: 1, backgroundColor: ink.panel, borderRadius: 18, borderWidth: 1, borderColor: ink.line, padding: 10, alignItems: 'center', gap: 4 },
  gaugeValue: { color: ink.text, fontSize: 26, fontWeight: '900', fontStyle: 'italic', fontVariant: ['tabular-nums'] },
  gaugeButton: { alignSelf: 'stretch', marginTop: 4 },
  bar: { alignSelf: 'stretch', height: 10, borderRadius: 5, backgroundColor: ink.line, overflow: 'hidden' },
  barFill: { height: 10, borderRadius: 5 },
});
