// ============================================================================
// /run/shots — Runcam shots: every photo taken with Runcam that is still on
// this phone, newest first, under the activity it was taken in. Tap one to
// share it, save it to Photos, redraw it in another design, add it to the
// activity's photos, or delete it.
// ============================================================================

import { Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { BackHandler, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Ionicons } from '@/shell/ui';

import { ink, runStyles, RunThemed } from '../parts';
import { ShotView } from './ShotView';
import { addedToActivity, pictureFile, sendWaitingShots, shotsBytes, useShots, type Shot } from './shots';
import { useDrawer } from './useDrawer';

const dayOf = (t: number) => {
  try { return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(t)); }
  catch { return new Date(t).toDateString(); }
};
const sizeText = (bytes: number) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export default function Shots() {
  return <RunThemed><ShotsPage /></RunThemed>;
}

function ShotsPage() {
  const shots = useShots();
  const [openId, setOpenId] = useState<string | null>(null);
  const { element: drawingPage, drawer } = useDrawer();
  const open = openId ? shots.find((s) => s.id === openId) ?? null : null;

  // A photo ticked for an activity that has since saved goes up now.
  useEffect(() => { void sendWaitingShots(); }, []);

  // Android's back button closes the open shot before it leaves the page.
  useEffect(() => {
    if (!open) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { setOpenId(null); return true; });
    return () => sub.remove();
  }, [open]);

  // One group for each activity, in the order of its newest shot.
  const groups = useMemo(() => {
    const out: { key: string; title: string; shots: Shot[] }[] = [];
    for (const s of shots) {
      const g = out.find((x) => x.key === s.clientRunId);
      if (g) g.shots.push(s); else out.push({ key: s.clientRunId, title: `${s.label} · ${dayOf(s.takenAt)}`, shots: [s] });
    }
    return out;
  }, [shots]);
  const bytes = useMemo(() => shotsBytes(), [shots]);

  return (
    <SafeAreaView style={st.page} edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{
        title: open ? 'Runcam shot' : 'Runcam shots',
        // With a shot open, Back returns to the shots first.
        headerLeft: open ? () => (
          <Pressable accessibilityRole="button" accessibilityLabel="Back to your shots" onPress={() => setOpenId(null)} hitSlop={12} style={st.back}>
            <Ionicons name="chevron-back" size={26} color={ink.tealSoft} />
            <Text style={st.backText}>Shots</Text>
          </Pressable>
        ) : undefined,
      }} />
      {drawingPage}
      {open ? (
        <ShotView shot={open} drawer={drawer} keepTitle="Done" onChange={() => undefined} onKeep={() => setOpenId(null)} onDeleted={() => setOpenId(null)} />
      ) : shots.length === 0 ? (
        <View style={st.empty}>
          <Ionicons name="camera-outline" size={44} color={ink.faint} />
          <Text style={st.emptyTitle}>No shots yet</Text>
          <Text style={st.emptyText}>During an activity, tap the camera button beside Pause. Runcam puts your distance, pace and split pace on the photo.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={st.body}>
          <Text style={st.summary}>{shots.length === 1 ? '1 shot' : `${shots.length} shots`} on this phone, using {sizeText(bytes)}. They stay here until you delete them.</Text>
          {groups.map((g) => (
            <View key={g.key} style={st.group}>
              <Text style={st.groupTitle}>{g.title}</Text>
              <View style={st.grid}>
                {g.shots.map((s) => (
                  <Pressable key={s.id} accessibilityRole="button" accessibilityLabel={`Open the shot from ${dayOf(s.takenAt)}`} onPress={() => setOpenId(s.id)}
                    style={({ pressed }) => [st.cell, pressed && { opacity: 0.7 }]}>
                    <Image source={{ uri: pictureFile(s).uri }} style={st.thumb} resizeMode="cover" />
                    {s.upload !== 'none' && <View style={st.badge}><Ionicons name={addedToActivity(s) === 'added' ? 'cloud-done-outline' : 'cloud-upload-outline'} size={14} color="#FFFFFF" /></View>}
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const st = runStyles(() => StyleSheet.create({
  page: { flex: 1, backgroundColor: ink.bg },
  body: { padding: 14, gap: 18, paddingBottom: 32 },
  summary: { color: ink.dim, fontSize: 14, lineHeight: 20 },
  group: { gap: 8 },
  groupTitle: { color: ink.text, fontSize: 16, fontWeight: '900' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { width: '31.5%', aspectRatio: 9 / 16, borderRadius: 12, overflow: 'hidden', backgroundColor: ink.panel },
  thumb: { width: '100%', height: '100%' },
  // Over the picture, in both themes.
  badge: { position: 'absolute', right: 6, top: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10 },
  emptyTitle: { color: ink.text, fontSize: 20, fontWeight: '900' },
  emptyText: { color: ink.dim, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  back: { flexDirection: 'row', alignItems: 'center', marginLeft: -6 },
  backText: { color: ink.tealSoft, fontSize: 16, fontWeight: '700' },
}));
