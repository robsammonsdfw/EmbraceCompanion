// ============================================================================
// Runcam — the camera during an activity, with distance, pace and split pace
// over the picture (speed on a ride). Opened from the camera button beside
// Pause; drawn over the live numbers with Pause still pinned underneath.
//
//   camera   the live picture and numbers; the round button takes a photo
//   review   the photo with its numbers on: Share, Save to Photos, Keep
//
// Tracking, the coach and the member's music carry on throughout. The camera
// only works while the Companion is on screen, so the screen is kept awake
// while Runcam is open, and Runcam closes itself after a minute unused to
// save the battery. Nothing leaves the phone unless the member shares a shot
// or ticks "Add to this activity's photos".
//
// What is drawn over the live picture is not in the photo the camera writes:
// the numbers are drawn onto it afterwards (make.ts), with the numbers read
// the moment the button is pressed.
// ============================================================================

import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';

import { PermissionCard } from '@/shell/PermissionCard';
import { ensureCamera } from '@/shell/permissions';
import { RunCamera, type RunCameraHandle } from '@/shell/RunCamera';
import { font } from '@/shell/theme';
import { Ionicons } from '@/shell/ui';

import type { RunEngine } from '../calc/engine';
import { Help } from '../helper/ui';
import { closePanel } from '../panels';
import { DarkButton, ink, runStyles } from '../parts';
import { getPref, setPref } from '../store';
import { makeShot } from './make';
import { liveNumbers, type LiveNumber } from './numbers';
import { ShotView } from './ShotView';
import { shotCount, type Shot } from './shots';
import { useDrawer } from './useDrawer';

const KEEP_AWAKE = 'runcam';
/** Open this long with nothing pressed, Runcam closes itself. */
const IDLE_CLOSE_MS = 60_000;

// Over the camera's picture the theme doesn't apply (the picture is whatever
// the member is pointing at): white on a dark wash, in both themes.
const OVER = '#FFFFFF';
const OVER_DIM = 'rgba(255,255,255,0.82)';
const OVER_SOFT = 'rgba(255,255,255,0.18)';
const WASH = 'rgba(0,0,0,0.42)';
/** The ring and spinner inside the white photo button. */
const ON_WHITE = 'rgba(0,0,0,0.86)';

type Phase = 'ask' | 'camera' | 'making' | 'review';

const Number3: React.FC<{ n: LiveNumber }> = ({ n }) => (
  <View style={st.number}>
    <Text style={st.numberLabel} numberOfLines={1}>{n.label}</Text>
    <Text style={st.numberValue} numberOfLines={1} adjustsFontSizeToFit>{n.value}</Text>
    <Text style={st.numberUnit} numberOfLines={1}>{n.unit}</Text>
  </View>
);

export const RuncamPanel: React.FC<{ e: RunEngine; clientRunId: string }> = ({ e, clientRunId }) => {
  const cam = useRef<RunCameraHandle>(null);
  const [phase, setPhase] = useState<Phase>(() => (getPref('perm.camera') === 'granted' ? 'camera' : 'ask'));
  const [facing, setFacing] = useState<'back' | 'front'>(() => (getPref('runcam.facing') === 'front' ? 'front' : 'back'));
  const [shot, setShot] = useState<Shot | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [onScreen, setOnScreen] = useState(AppState.currentState === 'active');
  const [kept, setKept] = useState(() => shotCount());
  const touched = useRef(Date.now());
  const { element: drawingPage, drawer } = useDrawer();

  // Permission was given before: make sure it still is, without the card.
  const checked = useRef(false);
  useEffect(() => {
    if (checked.current || phase !== 'camera') return;
    checked.current = true;
    ensureCamera().then((r) => { if (r !== 'granted') { setPref('perm.camera', ''); setPhase('ask'); } }).catch(() => setPhase('ask'));
  }, [phase]);

  // The camera only runs while the Companion is on screen.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setOnScreen(s === 'active'));
    return () => sub.remove();
  }, []);

  // Keep the screen awake while Runcam is open, whatever the dashboard's own switch says.
  useEffect(() => {
    void activateKeepAwakeAsync(KEEP_AWAKE);
    return () => { void deactivateKeepAwake(KEEP_AWAKE); };
  }, []);

  // Left open and unused: close, so the camera isn't running in a pocket.
  useEffect(() => {
    if (phase !== 'camera') return undefined;
    touched.current = Date.now();
    const timer = setInterval(() => { if (Date.now() - touched.current > IDLE_CLOSE_MS) closePanel(); }, 5000);
    return () => clearInterval(timer);
  }, [phase]);

  const snap = async () => {
    const camera = cam.current;
    if (!camera || phase !== 'camera') return;
    touched.current = Date.now();
    setProblem(null);
    setPhase('making');
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    try {
      const cameraPath = await camera.takePhoto();
      const made = await makeShot(drawer, { cameraPath, engine: e, clientRunId });
      setShot(made);
      setKept(shotCount());
      setPhase('review');
    } catch (err) {
      setProblem(`That photo didn’t take. ${err instanceof Error ? err.message : String(err)}`);
      setPhase('camera');
    }
  };

  const flip = () => {
    touched.current = Date.now();
    const next = facing === 'back' ? 'front' : 'back';
    setFacing(next);
    setPref('runcam.facing', next);
  };

  const openShots = () => { closePanel(); router.push('/run/shots'); };

  const n = liveNumbers(e);

  return (
    <View style={st.page}>
      {drawingPage}

      {phase === 'ask' && (
        <View style={st.ask}>
          <Help id="companion.runcam.allow">
            <PermissionCard kind="runcam" onReady={() => { setPref('perm.camera', 'granted'); setPhase('camera'); }} />
          </Help>
          <View style={st.fill} />
          <DarkButton title="Close" onPress={closePanel} style={{ minHeight: 64 }} />
        </View>
      )}

      {(phase === 'camera' || phase === 'making') && (
        <View style={st.fill} onTouchStart={() => { touched.current = Date.now(); }}>
          <RunCamera ref={cam} active={onScreen} facing={facing} style={st.fill}
            onError={(m) => setProblem(`The camera stopped. ${m}`)}>
            <View style={st.over} pointerEvents="box-none">
              <View style={st.top} pointerEvents="box-none">
                <Pressable accessibilityRole="button" accessibilityLabel="Close Runcam" onPress={closePanel} hitSlop={10} style={st.round}>
                  <Ionicons name="close" size={26} color={OVER} />
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={facing === 'back' ? 'Switch to the front camera' : 'Switch to the back camera'}
                  onPress={flip} hitSlop={10} style={st.round} disabled={phase !== 'camera'}>
                  <Ionicons name="camera-reverse-outline" size={26} color={OVER} />
                </Pressable>
              </View>

              <View pointerEvents="box-none">
                {problem && <Text style={st.problem} accessibilityLiveRegion="polite">{problem}</Text>}
                <View style={st.numbers} pointerEvents="none">
                  <Number3 n={n.distance} />
                  <Number3 n={n.now} />
                  <Number3 n={n.split} />
                </View>
                <View style={st.shutterRow} pointerEvents="box-none">
                  <View style={st.side}>
                    {kept > 0 && (
                      <Pressable accessibilityRole="button" accessibilityLabel={`Runcam shots, ${kept}`} onPress={openShots} hitSlop={8} style={st.pill}>
                        <Ionicons name="images-outline" size={18} color={OVER} />
                        <Text style={st.pillText}>{kept}</Text>
                      </Pressable>
                    )}
                  </View>
                  <Help id="companion.runcam.shutter">
                    <Pressable accessibilityRole="button" accessibilityLabel="Take a photo" onPress={() => void snap()} disabled={phase !== 'camera'}
                      style={({ pressed }) => [st.shutter, pressed && { transform: [{ scale: 0.94 }] }]}>
                      {phase === 'making' ? <ActivityIndicator color={ON_WHITE} /> : <View style={st.shutterIn} />}
                    </Pressable>
                  </Help>
                  <View style={st.side} />
                </View>
                <Text style={st.brand}>{phase === 'making' ? 'Putting your numbers on it…' : 'EmbraceHealthAI'}</Text>
              </View>
            </View>
          </RunCamera>
        </View>
      )}

      {phase === 'review' && shot && (
        <ShotView shot={shot} drawer={drawer} keepTitle="Keep"
          onChange={setShot}
          onKeep={() => { setShot(null); setPhase('camera'); }}
          onDeleted={() => { setShot(null); setKept(shotCount()); setPhase('camera'); }} />
      )}
    </View>
  );
};

const st = runStyles(() => StyleSheet.create({
  page: { flex: 1, backgroundColor: ink.bg },
  fill: { flex: 1 },
  ask: { flex: 1, padding: 14, gap: 12 },
  over: { flex: 1, justifyContent: 'space-between' },
  top: { flexDirection: 'row', justifyContent: 'space-between', padding: 12 },
  round: { width: 48, height: 48, borderRadius: 24, backgroundColor: WASH, alignItems: 'center', justifyContent: 'center' },
  problem: { color: OVER, backgroundColor: ink.red, fontSize: 14, fontWeight: '800', marginHorizontal: 12, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, overflow: 'hidden' },
  numbers: { flexDirection: 'row', backgroundColor: WASH, paddingVertical: 8, paddingHorizontal: 6 },
  number: { flex: 1, alignItems: 'center', minWidth: 0 },
  numberLabel: { color: OVER_DIM, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  numberValue: { color: OVER, fontFamily: font.display, fontSize: 40, lineHeight: 44, fontVariant: ['tabular-nums'] },
  numberUnit: { color: OVER_DIM, fontSize: 12, fontWeight: '800' },
  shutterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: WASH, paddingTop: 6 },
  side: { flex: 1, alignItems: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: 22, backgroundColor: OVER_SOFT },
  pillText: { color: OVER, fontSize: 15, fontWeight: '900' },
  shutter: { width: 76, height: 76, borderRadius: 38, backgroundColor: OVER, alignItems: 'center', justifyContent: 'center' },
  shutterIn: { width: 62, height: 62, borderRadius: 31, borderWidth: 3, borderColor: ON_WHITE },
  brand: { color: OVER_DIM, backgroundColor: WASH, fontSize: 12, fontWeight: '800', textAlign: 'center', paddingTop: 4, paddingBottom: 8 },
}));
