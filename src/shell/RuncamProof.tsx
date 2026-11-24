// ============================================================================
// Runcam proof — test builds only (never in the App Store or Google Play build).
//
// Proves the riskiest part of Runcam on a real phone before anything is built
// on it (RUNCAM_PLAN.md, phase 1): while an activity is being tracked and
// music is playing, record a 30-second clip, lay a different number over each
// second plus the EmbraceHealthAI name, and time the export.
//
//   Pass  the export takes under 20 s on the iPhone, under 30 s on the Android;
//         the number changes every second on playback;
//         music keeps playing; GPS points keep arriving while recording.
//
// It uses every new shell piece once: RunCamera (photo and clip), DrawingHost
// (the numbers are drawn in the hidden page), media.ts (export, save, share).
// ============================================================================

import { Directory, File, Paths } from 'expo-file-system';
import { useKeepAwake } from 'expo-keep-awake';
import { Redirect } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { VisionCamera } from 'react-native-vision-camera';

import { TEST_BUILD } from './build';
import { DrawingHost, type DrawingHostHandle } from './DrawingHost';
import { activeSession, sessionPoints, startTracking, stopTracking, type TrackSession } from './location';
import { exportClip, fileUri, saveToPhotos, shareFile, type ClipOverlay, type ExportedClip } from './media';
import { PermissionCard } from './PermissionCard';
import { ensureLocation } from './permissions';
import { RunCamera, type Clip, type RunCameraHandle } from './RunCamera';
import { font, themed, useTheme } from './theme';
import { Body, Button, Card, Label, Screen, Title } from './ui';

const CLIP_SECONDS = 30;
const OUT_W = 1080;
const OUT_H = 1920;
// Narrow strips, not full frames: the export has a limit on the total area of
// the pictures laid over a clip (see ClipOverlay in media.ts).
const STRIP = { x: 40, y: 1480, width: 1000, height: 200 };
const NAME = { x: 280, y: 1740, width: 520, height: 90 };
const TARGET_SECONDS = Platform.OS === 'ios' ? 20 : 30;

// Runs in the hidden page: one rounded strip with one line of text, as a PNG.
const DRAW = `
window.companionHandle = function (m) {
  var c = document.createElement('canvas');
  c.width = m.width; c.height = m.height;
  var g = c.getContext('2d'), w = c.width, h = c.height, r = h / 2;
  g.clearRect(0, 0, w, h);
  if (m.plate) {
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.beginPath();
    g.moveTo(r, 0); g.arcTo(w, 0, w, h, r); g.arcTo(w, h, 0, h, r); g.arcTo(0, h, 0, 0, r); g.arcTo(0, 0, w, 0, r);
    g.closePath(); g.fill();
  }
  g.fillStyle = '#ffffff';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '800 ' + Math.round(h * 0.54) + 'px system-ui, -apple-system, Roboto, sans-serif';
  g.fillText(m.text, w / 2, h / 2, w * 0.92);
  return c.toDataURL('image/png').split(',')[1];
};`;

type Stage = 'idle' | 'recording' | 'drawing' | 'exporting';
type Gps = { points: number; longestGapS: number };
type Result = { clip: Clip; out: ExportedClip; gps: Gps | null };

const useStyles = themed((t) => StyleSheet.create({
  camera: { height: 440, borderRadius: 20 },
  over: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 18 },
  // White on the camera picture in both themes.
  count: { fontFamily: font.display, fontSize: 64, color: '#FFFFFF' },
  row: { flexDirection: 'row', gap: 10 },
  grow: { flex: 1 },
  video: { width: '100%', aspectRatio: OUT_W / OUT_H, borderRadius: 20, overflow: 'hidden' },
  pass: { color: t.green, fontWeight: '800' },
  fail: { color: t.red, fontWeight: '800' },
}));

/** GPS points that arrived between two moments, and the longest wait between two of them. */
const gpsBetween = (session: TrackSession | null, from: number, to: number): Gps | null => {
  if (!session) return null;
  const times = sessionPoints(session.id).map((p) => p.t).filter((ts) => ts >= from && ts <= to);
  let gap = times.length ? Math.max(times[0] - from, to - times[times.length - 1]) : to - from;
  for (let i = 1; i < times.length; i++) gap = Math.max(gap, times[i] - times[i - 1]);
  return { points: times.length, longestGapS: Math.round(gap / 1000) };
};

function ClipPlayer({ path }: { path: string }) {
  const s = useStyles();
  const player = useVideoPlayer(fileUri(path), (p) => {
    // Silent, and never over the member's music.
    p.muted = true;
    p.audioMixingMode = 'mixWithOthers';
    p.loop = true;
    p.play();
  });
  return <VideoView player={player} style={s.video} nativeControls contentFit="contain" />;
}

export default function RuncamProof() {
  const s = useStyles();
  const t = useTheme();
  useKeepAwake();
  const cam = useRef<RunCameraHandle>(null);
  const host = useRef<DrawingHostHandle>(null);
  const [allowed, setAllowed] = useState(() => VisionCamera.cameraPermissionStatus === 'authorized');
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [session, setSession] = useState<TrackSession | null>(() => activeSession());
  // True when this screen started the tracking, so only its own test session is ever stopped here.
  const [own, setOwn] = useState(false);
  const ownRef = useRef(false);
  const [points, setPoints] = useState(0);
  const [stage, setStage] = useState<Stage>('idle');
  const [left, setLeft] = useState(CLIP_SECONDS);
  const [progress, setProgress] = useState(0);
  const [hostReady, setHostReady] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  // The live point count, so it's plain that tracking carries on.
  useEffect(() => {
    if (!session) return;
    const tick = () => setPoints(sessionPoints(session.id).length);
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [session]);

  // A test session this screen started ends with it; an activity's own session is left alone.
  useEffect(() => () => { if (ownRef.current) void stopTracking(); }, []);

  const fail = (e: unknown) => {
    setStage('idle');
    setProblem(e instanceof Error ? e.message : String(e));
  };

  const startTest = async () => {
    setProblem(null);
    try {
      if ((await ensureLocation()) !== 'granted') { setProblem('Location is off for the Companion. Turn it on in Settings, then come back.'); return; }
      const started = await startTracking({ title: 'Runcam proof', body: 'Tracking for the test' });
      ownRef.current = true;
      setOwn(true);
      setSession(started);
    } catch (e) { fail(e); }
  };

  const stopTest = async () => {
    await stopTracking();
    ownRef.current = false;
    setOwn(false);
    setSession(null);
    setPoints(0);
  };

  const record = async () => {
    const camera = cam.current;
    if (!camera) return;
    setProblem(null);
    setNote(null);
    setResult(null);
    setLeft(CLIP_SECONDS);
    setProgress(0);
    let from = Date.now();
    let countdown: ReturnType<typeof setInterval> | null = null;
    try {
      setStage('recording');
      const clip = await camera.startClip({
        maxSeconds: CLIP_SECONDS,
        onStarted: () => {
          from = Date.now();
          countdown = setInterval(() => setLeft(Math.max(0, CLIP_SECONDS - Math.floor((Date.now() - from) / 1000))), 250);
        },
      });
      if (countdown) clearInterval(countdown);
      const gps = gpsBetween(session, from, Date.now());

      // One picture for each second, each with a different number, and the name for the whole clip.
      setStage('drawing');
      const drawer = host.current;
      if (!drawer) throw new Error('The drawing page isn’t ready yet.');
      const dir = new Directory(Paths.cache, 'runcam-proof');
      if (!dir.exists) dir.create({ intermediates: true });
      const draw = async (name: string, body: { text: string; width: number; height: number; plate: boolean }) => {
        const file = new File(dir, name);
        if (file.exists) file.delete();
        file.create();
        await file.write(await drawer.ask<string>(body), { encoding: 'base64' });
        return file.uri;
      };
      const overlays: ClipOverlay[] = [];
      for (let i = 0; i < CLIP_SECONDS; i++) {
        const path = await draw(`second-${i + 1}.png`, { text: `SECOND ${i + 1} OF ${CLIP_SECONDS}`, width: STRIP.width, height: STRIP.height, plate: true });
        overlays.push({ path, startMs: i * 1000, endMs: (i + 1) * 1000, ...STRIP });
      }
      overlays.push({ path: await draw('name.png', { text: 'EmbraceHealthAI', width: NAME.width, height: NAME.height, plate: false }), startMs: 0, endMs: CLIP_SECONDS * 1000, ...NAME });

      setStage('exporting');
      const output = new File(dir, `runcam-proof-${Date.now()}.mp4`);
      const out = await exportClip({ input: clip.path, output: output.uri, width: OUT_W, height: OUT_H, overlays }, setProgress);
      setResult({ clip, out, gps });
      setStage('idle');
    } catch (e) {
      if (countdown) clearInterval(countdown);
      fail(e);
    }
  };

  const stopEarly = () => { void cam.current?.stopClip().catch(() => undefined); };

  const snap = async () => {
    setProblem(null);
    setNote(null);
    try { setPhoto((await cam.current?.takePhoto()) ?? null); } catch (e) { fail(e); }
  };

  const save = async (path: string) => {
    setProblem(null);
    try {
      const r = await saveToPhotos(path);
      setNote(r === 'saved' ? 'Saved to Photos.' : 'Saving to Photos is off for the Companion. Turn it on in Settings.');
    } catch (e) { fail(e); }
  };

  const share = async (path: string, type: string) => {
    setProblem(null);
    try { await shareFile(path, type); } catch (e) { fail(e); }
  };

  if (!TEST_BUILD) return <Redirect href="/" />;

  const busy = stage !== 'idle';
  const passed = result ? result.out.seconds < TARGET_SECONDS : false;

  return (
    <Screen>
      <DrawingHost ref={host} script={DRAW} onReady={() => setHostReady(true)} onError={(m) => setProblem(`Drawing page: ${m}`)} />

      <Card>
        <Title>Runcam proof</Title>
        <Body>Start music, start tracking, then walk while you record. The clip comes back with a different number on each second.</Body>
        <Body muted>Pass: the export takes under {TARGET_SECONDS} seconds, the number changes every second, your music never stops, and GPS points keep arriving.</Body>
      </Card>

      <Label>1 · Tracking</Label>
      <Card>
        <Body>{session ? `Tracking. ${points} GPS points so far.` : 'Not tracking. Start an activity first, or use the test tracking here.'}</Body>
        {!session && <Button kind="secondary" icon="navigate-outline" title="Start test tracking" onPress={() => void startTest()} disabled={busy} />}
        {session && own && <Button kind="secondary" icon="stop-circle-outline" title="Stop test tracking" onPress={() => void stopTest()} disabled={busy} />}
      </Card>

      <Label>2 · Camera</Label>
      {!allowed ? <PermissionCard kind="runcam" onReady={() => setAllowed(true)} /> : (
        <>
          <RunCamera ref={cam} active facing={facing} style={s.camera} onError={(m) => setProblem(`Camera: ${m}`)}>
            <View style={s.over}>
              {stage === 'recording' && <Text style={s.count}>{left}</Text>}
            </View>
          </RunCamera>
          <View style={s.row}>
            {stage === 'recording'
              ? <Button style={s.grow} kind="danger" icon="stop" title="Stop early" onPress={stopEarly} />
              : <Button style={s.grow} icon="videocam" title={`Record ${CLIP_SECONDS} seconds`} onPress={() => void record()} disabled={busy || !hostReady} />}
            <Button kind="secondary" icon="camera" title="Photo" onPress={() => void snap()} disabled={busy} />
            <Button kind="secondary" icon="camera-reverse-outline" title="Flip" onPress={() => setFacing(facing === 'back' ? 'front' : 'back')} disabled={busy} />
          </View>
          {stage === 'drawing' && <Body>Drawing the numbers…</Body>}
          {stage === 'exporting' && <Body>Exporting… {Math.round(progress * 100)}%</Body>}
        </>
      )}

      {problem && <Card tone="danger"><Title>Something failed</Title><Body>{problem}</Body></Card>}
      {note && <Body style={{ color: t.accent }}>{note}</Body>}

      {result && (
        <>
          <Label>3 · The clip</Label>
          <Card>
            <Text style={passed ? s.pass : s.fail}>
              {passed ? 'PASS' : 'TOO SLOW'} · export took {result.out.seconds.toFixed(1)} s (target under {TARGET_SECONDS} s)
            </Text>
            <Body>
              {(result.out.durationMs / 1000).toFixed(1)} s clip, {(result.out.bytes / 1048576).toFixed(1)} MB, {OUT_W}×{OUT_H}.
              {result.clip.ended === 'max' ? ' Stopped itself at the limit.' : result.clip.ended === 'cut' ? ' Cut short by the phone.' : ' Stopped early.'}
            </Body>
            <Body>
              {result.gps
                ? `GPS while recording: ${result.gps.points} points, longest wait ${result.gps.longestGapS} s.`
                : 'No tracking was running, so GPS wasn’t checked.'}
            </Body>
            <Body muted>Watch it: the number should change every second, start to finish.</Body>
          </Card>
          <ClipPlayer key={result.out.path} path={result.out.path} />
          <View style={s.row}>
            <Button style={s.grow} icon="download-outline" title="Save to Photos" onPress={() => void save(result.out.path)} />
            <Button style={s.grow} kind="secondary" icon="share-outline" title="Share" onPress={() => void share(result.out.path, 'video/mp4')} />
          </View>
        </>
      )}

      {photo && (
        <>
          <Label>Photo</Label>
          <Card>
            <Body>Taken: {(new File(fileUri(photo)).size / 1048576).toFixed(1)} MB JPEG.</Body>
            <View style={s.row}>
              <Button style={s.grow} icon="download-outline" title="Save to Photos" onPress={() => void save(photo)} />
              <Button style={s.grow} kind="secondary" icon="share-outline" title="Share" onPress={() => void share(photo, 'image/jpeg')} />
            </View>
          </Card>
        </>
      )}
    </Screen>
  );
}
