// Shared building blocks for Companion screens.

import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius } from './theme';

export const Screen: React.FC<{ children: React.ReactNode; scroll?: boolean }> = ({ children, scroll = true }) => (
  <SafeAreaView style={styles.page} edges={['bottom', 'left', 'right']}>
    {scroll ? <ScrollView contentContainerStyle={styles.pad}>{children}</ScrollView> : <View style={[styles.pad, styles.fill]}>{children}</View>}
  </SafeAreaView>
);

export const Card: React.FC<{ children: React.ReactNode; tone?: 'plain' | 'teal' | 'orange' | 'danger'; style?: ViewStyle }> = ({ children, tone = 'plain', style }) => (
  <View style={[styles.card, tone === 'teal' && styles.teal, tone === 'orange' && styles.orange, tone === 'danger' && styles.danger, style]}>{children}</View>
);

export const Title: React.FC<{ children: React.ReactNode }> = ({ children }) => <Text style={styles.title}>{children}</Text>;
export const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => <Text style={styles.label}>{children}</Text>;
export const Body: React.FC<{ children: React.ReactNode; muted?: boolean }> = ({ children, muted }) => (
  <Text style={[styles.body, muted && styles.muted]}>{children}</Text>
);

export const Button: React.FC<{
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger';
  busy?: boolean;
  disabled?: boolean;
}> = ({ title, onPress, kind = 'primary', busy, disabled }) => (
  <Pressable
    accessibilityRole="button"
    onPress={onPress}
    disabled={disabled || busy}
    style={({ pressed }) => [
      styles.button,
      kind === 'primary' && styles.primary,
      kind === 'secondary' && styles.secondary,
      kind === 'danger' && styles.dangerButton,
      (pressed || disabled) && styles.dim,
    ]}
  >
    {busy ? (
      <ActivityIndicator color={kind === 'secondary' ? colors.tealDark : '#fff'} />
    ) : (
      <Text style={[styles.buttonText, kind === 'secondary' && styles.secondaryText]}>{title}</Text>
    )}
  </Pressable>
);

export const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.stat}>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.label}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.page },
  pad: { padding: 16, gap: 14 },
  fill: { flex: 1 },
  card: { backgroundColor: colors.card, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 8 },
  teal: { backgroundColor: colors.tealSoft, borderColor: colors.tealSoft },
  orange: { backgroundColor: colors.orangeSoft, borderColor: colors.orangeSoft },
  danger: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoft },
  title: { fontSize: 18, fontWeight: '800', color: colors.ink },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', color: colors.muted },
  body: { fontSize: 15, lineHeight: 21, color: colors.ink },
  muted: { color: colors.muted },
  button: { borderRadius: radius.button, paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', minHeight: 50 },
  primary: { backgroundColor: colors.teal },
  secondary: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  dangerButton: { backgroundColor: colors.danger },
  dim: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  secondaryText: { color: colors.tealDark },
  stat: { flex: 1, minWidth: '40%', gap: 2 },
  statValue: { fontSize: 26, fontWeight: '800', color: colors.ink, fontVariant: ['tabular-nums'] },
});
