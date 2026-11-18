// Shared building blocks for Companion screens, in light and dark (theme.ts).

import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { font, radius, themed, useTheme } from './theme';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

const useStyles = themed((t) => StyleSheet.create({
  page: { flex: 1, backgroundColor: t.bg },
  pad: { padding: 16, gap: 14, paddingBottom: 32 },
  fill: { flex: 1 },
  card: { backgroundColor: t.card, borderRadius: radius.card, padding: 18, gap: 10, ...t.raised },
  title: { fontSize: 20, fontWeight: '800', color: t.text, letterSpacing: -0.3 },
  hero: { fontFamily: font.display, fontSize: 40, lineHeight: 42, color: t.text, textTransform: 'uppercase' },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase', color: t.faint },
  body: { fontSize: 15, lineHeight: 22, color: t.text },
  muted: { color: t.dim },
  button: { borderRadius: radius.button, minHeight: 54, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, overflow: 'hidden' },
  secondary: { backgroundColor: t.card, ...t.raised },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: t.red },
  dim: { opacity: 0.55 },
  buttonText: { color: t.onAccent, fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },
  secondaryText: { color: t.text },
  ghostText: { color: t.accent },
  dangerText: { color: '#FFFFFF' },
  stat: { flex: 1, minWidth: '40%', gap: 2 },
  statValue: { fontFamily: font.display, fontSize: 40, lineHeight: 42, color: t.text, fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  rowIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: t.accentSoft },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 16, fontWeight: '700', color: t.text },
  rowSub: { fontSize: 13, color: t.dim },
  rowValue: { fontSize: 14, fontWeight: '700', color: t.dim },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: t.line, marginLeft: 54 },
  segmented: { flexDirection: 'row', backgroundColor: t.sunken, borderRadius: 14, padding: 4, gap: 4 },
  segment: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  segmentOn: { backgroundColor: t.card, ...t.raised },
  segmentText: { fontSize: 14, fontWeight: '700', color: t.dim },
  segmentTextOn: { color: t.text },
}));

export const Screen: React.FC<{ children: React.ReactNode; scroll?: boolean; style?: ViewStyle }> = ({ children, scroll = true, style }) => {
  const s = useStyles();
  return (
    <SafeAreaView style={[s.page, style]} edges={['bottom', 'left', 'right']}>
      {scroll
        ? <ScrollView contentContainerStyle={s.pad} showsVerticalScrollIndicator={false}>{children}</ScrollView>
        : <View style={[s.pad, s.fill]}>{children}</View>}
    </SafeAreaView>
  );
};

type Tone = 'plain' | 'teal' | 'orange' | 'danger';
export const Card: React.FC<{ children: React.ReactNode; tone?: Tone; style?: ViewStyle }> = ({ children, tone = 'plain', style }) => {
  const s = useStyles();
  const t = useTheme();
  const tint = tone === 'teal' ? t.accentSoft : tone === 'orange' ? t.orangeSoft : tone === 'danger' ? t.redSoft : null;
  return (
    <View style={[s.card, tint ? { backgroundColor: tint, shadowOpacity: 0, elevation: 0, borderWidth: 0 } : null, style]}>
      {children}
    </View>
  );
};

/** A card filled with the brand gradient, for the one thing a screen is for. */
export const GradientCard: React.FC<{ children: React.ReactNode; style?: ViewStyle; colors?: [string, string]; onPress?: () => void }> = ({ children, style, colors, onPress }) => {
  const t = useTheme();
  const body = (
    <LinearGradient colors={colors ?? t.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[{ borderRadius: radius.card, padding: 22, gap: 8, overflow: 'hidden' }, style]}>
      {/* A soft light in the corner, for depth. */}
      <View pointerEvents="none" style={{ position: 'absolute', width: 220, height: 220, borderRadius: 110, right: -70, top: -90, backgroundColor: 'rgba(255,255,255,0.14)' }} />
      {children}
    </LinearGradient>
  );
  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [{ borderRadius: radius.card }, t.raised, pressed && { transform: [{ scale: 0.985 }], opacity: 0.95 }]}>
      {body}
    </Pressable>
  );
};

export const Title: React.FC<{ children: React.ReactNode; style?: TextStyle }> = ({ children, style }) => <Text style={[useStyles().title, style]}>{children}</Text>;
/** Big condensed headline. */
export const Hero: React.FC<{ children: React.ReactNode; style?: TextStyle }> = ({ children, style }) => <Text style={[useStyles().hero, style]}>{children}</Text>;
export const Label: React.FC<{ children: React.ReactNode; style?: TextStyle }> = ({ children, style }) => <Text style={[useStyles().label, style]}>{children}</Text>;
export const Body: React.FC<{ children: React.ReactNode; muted?: boolean; style?: TextStyle }> = ({ children, muted, style }) => {
  const s = useStyles();
  return <Text style={[s.body, muted && s.muted, style]}>{children}</Text>;
};

export const Button: React.FC<{
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: IconName;
  busy?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}> = ({ title, onPress, kind = 'primary', icon, busy, disabled, style }) => {
  const s = useStyles();
  const t = useTheme();
  const fg = kind === 'primary' ? t.onAccent : kind === 'danger' ? '#FFFFFF' : kind === 'ghost' ? t.accent : t.text;
  const inner = busy
    ? <ActivityIndicator color={fg} />
    : <>
        {icon && <Ionicons name={icon} size={20} color={fg} />}
        <Text style={[s.buttonText, kind === 'secondary' && s.secondaryText, kind === 'ghost' && s.ghostText, kind === 'danger' && s.dangerText]}>{title}</Text>
      </>;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        s.button,
        kind === 'secondary' && s.secondary,
        kind === 'ghost' && s.ghost,
        kind === 'danger' && s.danger,
        (pressed || disabled) && s.dim,
        style,
      ]}
    >
      {kind === 'primary' && (
        <LinearGradient colors={t.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
      )}
      {inner}
    </Pressable>
  );
};

export const Stat: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color }) => {
  const s = useStyles();
  return (
    <View style={s.stat}>
      <Text style={[s.statValue, color ? { color } : null]}>{value}</Text>
      <Text style={s.label}>{label}</Text>
    </View>
  );
};

/** A settings-style row: icon, title, optional subtitle, value or chevron. */
export const ListRow: React.FC<{ icon: IconName; title: string; sub?: string; value?: string; tint?: string; onPress?: () => void; last?: boolean }> = ({ icon, title, sub, value, tint, onPress, last }) => {
  const s = useStyles();
  const t = useTheme();
  const content = (
    <View style={s.row}>
      <View style={[s.rowIcon, tint ? { backgroundColor: `${tint}22` } : null]}><Ionicons name={icon} size={20} color={tint ?? t.accent} /></View>
      <View style={s.rowText}>
        <Text style={s.rowTitle}>{title}</Text>
        {sub ? <Text style={s.rowSub}>{sub}</Text> : null}
      </View>
      {value ? <Text style={s.rowValue}>{value}</Text> : null}
      {onPress ? <Ionicons name="chevron-forward" size={18} color={t.faint} /> : null}
    </View>
  );
  return (
    <>
      {onPress
        ? <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.6 }}>{content}</Pressable>
        : content}
      {!last && <View style={s.separator} />}
    </>
  );
};

/** Two to four choices side by side (Automatic / Light / Dark). */
export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const s = useStyles();
  return (
    <View style={s.segmented}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => onChange(o.value)} style={[s.segment, on && s.segmentOn]}>
            <Text style={[s.segmentText, on && s.segmentTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export { Ionicons };
