// ============================================================================
// One Runcam shot, with what can be done with it. Shown straight after a
// photo is taken (over the live numbers) and when a shot is opened from the
// Runcam shots page.
//
//   the picture
//   Add to this activity's photos        a switch, remembered for the next shot
//   More designs · Delete
//   Share · Save to Photos · Keep        pinned at the bottom
//
// Share opens the phone's own share menu (Instagram, Messages, anything
// installed). Save to Photos asks for the save-only permission the first
// time, in plain words first.
// ============================================================================

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { saveToPhotos, shareFile } from '@/shell/media';
import { PermissionCard } from '@/shell/PermissionCard';
import { Ionicons, type IconName } from '@/shell/ui';

import { Help } from '../helper/ui';
import { ink, runStyles } from '../parts';
import { getPref, setPref } from '../store';
import type { DesignChoice, Drawer } from './drawing';
import { designsFor, PLAIN, redrawIn, setAddToActivity } from './make';
import { addedToActivity, deleteShot, pictureFile, type Shot } from './shots';

/** Design thumbnails are drawn in white, so their tiles are dark in both themes. */
const TILE = '#18181B';
const TILE_TEXT = '#A1A1AA';

const say = (e: unknown) => (e instanceof Error ? e.message : String(e));

const Action: React.FC<{ icon: IconName; title: string; onPress: () => void; primary?: boolean; busy?: boolean; disabled?: boolean }> = ({ icon, title, onPress, primary, busy, disabled }) => {
  const fg = primary ? ink.onTeal : ink.text;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} disabled={disabled || busy}
      style={({ pressed }) => [st.action, primary && { backgroundColor: ink.teal, borderWidth: 0 }, (pressed || disabled) && { opacity: 0.55 }]}>
      {busy ? <ActivityIndicator color={fg} /> : <Ionicons name={icon} size={20} color={fg} />}
      <Text style={[st.actionText, { color: fg }]} numberOfLines={1} adjustsFontSizeToFit>{title}</Text>
    </Pressable>
  );
};

export const ShotView: React.FC<{
  shot: Shot;
  drawer: Drawer;
  /** The right-hand button: "Keep" after a photo, "Done" on the shots page. */
  keepTitle: string;
  onKeep: () => void;
  onDeleted: () => void;
  /** Tells the screen above that the shot changed (a new design, the switch). */
  onChange: (shot: Shot) => void;
}> = ({ shot, drawer, keepTitle, onKeep, onDeleted, onChange }) => {
  const [busy, setBusy] = useState<'share' | 'save' | 'draw' | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [askPhotos, setAskPhotos] = useState(false);
  const [designs, setDesigns] = useState<DesignChoice[] | null>(null);
  const [picking, setPicking] = useState(false);
  const path = pictureFile(shot).uri;
  const plain = shot.design === PLAIN;
  const added = addedToActivity(shot);

  useEffect(() => { setNote(plain ? { ok: false, text: 'The numbers couldn’t be put on this one. Tap More designs to try again.' } : null); setPicking(false); setDesigns(null); }, [shot.id, plain]);

  const share = async () => {
    setBusy('share');
    setNote(null);
    try { await shareFile(path, 'image/jpeg'); } catch (e) { setNote({ ok: false, text: `Couldn’t open the share menu. ${say(e)}` }); } finally { setBusy(null); }
  };

  const save = async () => {
    setBusy('save');
    setNote(null);
    try {
      const r = await saveToPhotos(path);
      if (r === 'saved') setPref('perm.photos', 'granted');
      setNote(r === 'saved' ? { ok: true, text: 'Saved to Photos.' }
        : { ok: false, text: 'Saving to Photos is turned off for the Companion. Turn it on in your phone’s Settings, then try again.' });
    } catch (e) { setNote({ ok: false, text: `Couldn’t save it. ${say(e)}` }); } finally { setBusy(null); }
  };
  // The first time, say in plain words what the phone is about to ask. Android 13 and later asks nothing.
  const startSave = () => {
    const silent = Platform.OS === 'android' && Number(Platform.Version) >= 33;
    if (silent || getPref('perm.photos') === 'granted') void save(); else setAskPhotos(true);
  };

  const openDesigns = async () => {
    setPicking(true);
    setNote(null);
    if (designs) return;
    try { setDesigns(await designsFor(drawer, shot)); } catch (e) { setPicking(false); setNote({ ok: false, text: `Couldn’t load the designs. ${say(e)}` }); }
  };
  const pick = async (design: string) => {
    setPicking(false);
    if (design === shot.design) return;
    setBusy('draw');
    try { onChange(await redrawIn(drawer, shot, design)); } catch (e) { setNote({ ok: false, text: `Couldn’t redraw it. ${say(e)}` }); } finally { setBusy(null); }
  };

  const setAdd = async (on: boolean) => {
    setNote(null);
    try {
      const next = await setAddToActivity(drawer, shot, on);
      onChange(next);
      if (!on && next.upload !== 'none') setNote({ ok: true, text: 'It’s already with the activity. You can remove it from the report’s photos in iStride.' });
    } catch (e) { setNote({ ok: false, text: `Couldn’t get the photo ready. ${say(e)}` }); }
  };

  const remove = () =>
    Alert.alert('Delete this shot?', added === 'added' ? 'It comes off this phone. The copy with the activity stays in iStride.' : 'It comes off this phone and can’t be brought back.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { deleteShot(shot); drawer.forget(shot.id); onDeleted(); } },
    ]);

  if (askPhotos) {
    return (
      <View style={st.fill}>
        <View style={st.pad}>
          <PermissionCard kind="photos" onReady={() => { setPref('perm.photos', 'granted'); setAskPhotos(false); void save(); }} />
        </View>
        <View style={st.fill} />
        <View style={st.bar}><Action icon="arrow-back" title="Back" onPress={() => setAskPhotos(false)} /></View>
      </View>
    );
  }

  if (picking) {
    return (
      <View style={st.fill}>
        <Text style={st.heading}>Pick a design</Text>
        {designs ? (
          <ScrollView contentContainerStyle={st.grid}>
            {designs.map((d) => (
              <Pressable key={d.id} accessibilityRole="button" accessibilityLabel={d.name} onPress={() => void pick(d.id)}
                style={({ pressed }) => [st.tile, d.id === shot.design && { borderColor: ink.tealSoft }, pressed && { opacity: 0.6 }]}>
                <Image source={{ uri: `data:image/png;base64,${d.thumb}` }} style={st.thumb} resizeMode="contain" />
                <Text style={st.tileText} numberOfLines={1}>{d.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : <View style={st.center}><ActivityIndicator color={ink.tealSoft} size="large" /></View>}
        <View style={st.bar}><Action icon="arrow-back" title="Back" onPress={() => setPicking(false)} /></View>
      </View>
    );
  }

  return (
    <View style={st.fill}>
      <View style={st.pictureBox}>
        <Image key={path} source={{ uri: path }} style={st.picture} resizeMode="contain" accessibilityLabel="Your Runcam picture" />
        {busy === 'draw' && <View style={st.veil}><ActivityIndicator color="#FFFFFF" size="large" /></View>}
      </View>
      {note && <Text style={[st.note, { color: note.ok ? ink.green : ink.orange }]} accessibilityLiveRegion="polite">{note.text}</Text>}
      {!plain && (
        <View style={st.line}>
          <View style={st.fill}>
            <Text style={st.lineTitle}>Add to this activity’s photos</Text>
            <Text style={st.lineSub}>
              {added === 'added' ? 'Added. It’s in the activity’s report in iStride.'
                : added === 'failed' ? 'iStride didn’t take it. It’s still on your phone.'
                : added === 'waiting' ? 'It goes to the report in iStride when the activity is saved.'
                : 'Off: it stays on your phone.'}
            </Text>
          </View>
          <Switch value={shot.upload !== 'none'} onValueChange={(v) => void setAdd(v)} trackColor={{ true: ink.teal, false: ink.line }} />
        </View>
      )}
      <View style={st.links}>
        <Pressable accessibilityRole="button" onPress={() => void openDesigns()} hitSlop={8} style={st.link}>
          <Ionicons name="color-palette-outline" size={18} color={ink.tealSoft} />
          <Text style={[st.linkText, { color: ink.tealSoft }]}>More designs</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={remove} hitSlop={8} style={st.link}>
          <Ionicons name="trash-outline" size={18} color={ink.dim} />
          <Text style={[st.linkText, { color: ink.dim }]}>Delete</Text>
        </Pressable>
      </View>
      {/* Pinned: nothing above pushes these off the screen. */}
      <Help id="companion.runcam.actions">
        <View style={st.bar}>
          <Action icon="share-outline" title="Share" onPress={() => void share()} primary busy={busy === 'share'} disabled={!!busy} />
          <Action icon="download-outline" title="Save to Photos" onPress={startSave} busy={busy === 'save'} disabled={!!busy} />
          <Action icon="checkmark" title={keepTitle} onPress={onKeep} disabled={!!busy} />
        </View>
      </Help>
    </View>
  );
};

const st = runStyles(() => StyleSheet.create({
  fill: { flex: 1 },
  pad: { padding: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pictureBox: { flex: 1, minHeight: 140, marginHorizontal: 12, marginTop: 10 },
  picture: { flex: 1, borderRadius: 14 },
  // Over the picture, in both themes.
  veil: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 14 },
  note: { fontSize: 13, fontWeight: '700', paddingHorizontal: 14, paddingTop: 8 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 10 },
  lineTitle: { color: ink.text, fontSize: 15, fontWeight: '800' },
  lineSub: { color: ink.dim, fontSize: 12, marginTop: 1 },
  links: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 10 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36 },
  linkText: { fontSize: 14, fontWeight: '800' },
  bar: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10 },
  action: { flex: 1, minHeight: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 6, backgroundColor: ink.panel, borderWidth: ink.mode === 'dark' ? 1 : 0, borderColor: ink.line, ...ink.raised },
  actionText: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.4 },
  heading: { color: ink.text, fontSize: 20, fontWeight: '900', paddingHorizontal: 14, paddingTop: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12 },
  tile: { width: '31.5%', backgroundColor: TILE, borderRadius: 12, borderWidth: 2, borderColor: 'transparent', overflow: 'hidden' },
  thumb: { width: '100%', aspectRatio: 360 / 236 },
  tileText: { color: TILE_TEXT, fontSize: 10, fontWeight: '800', paddingHorizontal: 6, paddingBottom: 6 },
}));
