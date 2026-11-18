// ============================================================================
// Where the heart rate comes from, and the three ways to get one (iStride's
// HeartRateSource and HeartRateCapture):
//   ❤ Connect monitor  a Bluetooth strap or band, live every second, also with
//                      the phone locked. Average, max and time in zone need it.
//   📷 Check pulse      a fingertip over the back camera for about 25 seconds.
//                      At rest only. Counts for two minutes.
//   ⌚ Enter            the number a watch shows. Counts for two minutes.
// ============================================================================

import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import {
  connectHeartRate, disconnectHeartRate, ensureBluetooth, lastHeartRateDevice, scanHeartRateMonitors, useHeartRate, type HeartRateDevice,
} from '@/shell/heartRate';
import { PermissionCard } from '@/shell/PermissionCard';
import { ensureCamera } from '@/shell/permissions';
import { PulseCamera, type PulseSample } from '@/shell/PulseCamera';

import type { RunEngine } from './calc/engine';
import { lensCovered, MEASURE_SECONDS, pulseFrom } from './calc/pulse';
import { Help } from './helper/ui';
import { enterHeartRate } from './liveRun';
import { closePanel, openPanel } from './panels';
import { DarkButton, ink, Nudge, Panel, Row, s } from './parts';
import { getPref, setPref } from './store';

type Mode = 'idle' | 'askBluetooth' | 'scanning' | 'typing';

export const HeartRateSource: React.FC<{ e: RunEngine }> = ({ e }) => {
  const monitor = useHeartRate();
  const [mode, setMode] = useState<Mode>('idle');
  const [found, setFound] = useState<HeartRateDevice[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [bpm, setBpm] = useState(e.spotHr?.bpm ?? 110);
  const stopScan = useRef<(() => void) | null>(null);
  useEffect(() => () => { stopScan.current?.(); }, []);

  const connected = monitor.status === 'connected' || monitor.status === 'reconnecting';
  const last = lastHeartRateDevice();

  const scan = () => {
    setProblem(null);
    setFound([]);
    setMode('scanning');
    stopScan.current?.();
    stopScan.current = scanHeartRateMonitors((d) => setFound((list) => (list.some((x) => x.id === d.id) ? list : [...list, d])));
  };
  const connect = async () => {
    setProblem(null);
    // The plain words come first, the first time only.
    if (getPref('perm.bluetooth') !== 'granted') { setMode('askBluetooth'); return; }
    const allowed = await ensureBluetooth();
    if (allowed !== 'granted') { setProblem('Bluetooth is off or not allowed. Turn it on in Settings, then try again.'); return; }
    scan();
  };
  const pick = async (d: HeartRateDevice) => {
    stopScan.current?.(); stopScan.current = null;
    setMode('idle');
    try { await connectHeartRate(d.id); } catch (err) { setProblem(`Couldn't connect to ${d.name}: ${(err as Error).message}`); }
  };
  const bump = (d: number) => setBpm((v) => Math.max(40, Math.min(220, v + d)));

  return (
    <Help id="exercise.live.hrSource">
      <Panel>
        <Text style={[s.tileLabel, { color: ink.rose }]}>Heart rate</Text>
        {connected ? (
          <>
            <Text style={{ color: ink.text, fontSize: 16, fontWeight: '800' }}>
              ♥ {monitor.device?.name ?? 'Monitor'} · {monitor.status === 'reconnecting' ? 'reconnecting…' : monitor.bpm ? `live, ${monitor.bpm} bpm` : 'connected'}
            </Text>
            <DarkButton title="Disconnect" onPress={() => { void disconnectHeartRate(); }} fg={ink.dim} />
          </>
        ) : mode === 'askBluetooth' ? (
          <PermissionCard kind="bluetooth" onReady={() => { setPref('perm.bluetooth', 'granted'); scan(); }} />
        ) : mode === 'scanning' ? (
          <>
            <Text style={{ color: ink.dim, fontSize: 14 }}>
              {found.length ? 'Tap your monitor:' : 'Looking for monitors… Wear the strap, and set a watch or WHOOP to broadcast heart rate.'}
            </Text>
            {found.map((d) => <DarkButton key={d.id} title={d.name || 'Heart-rate monitor'} onPress={() => { void pick(d); }} fg={ink.text} />)}
            <DarkButton title="Cancel" onPress={() => { stopScan.current?.(); stopScan.current = null; setMode('idle'); }} fg={ink.dim} />
          </>
        ) : mode === 'typing' ? (
          <>
            <Text style={[s.tileSub, { fontSize: 13 }]}>Your heart rate in beats a minute</Text>
            <Help id="exercise.live.hrInput">
              <Row style={{ justifyContent: 'center', alignItems: 'center' }}>
                <Nudge label="Down 10" text="−10" onPress={() => bump(-10)} wide />
                <Nudge label="Down 1" text="−" onPress={() => bump(-1)} />
                <Text style={[s.gaugeValue, { fontSize: 44, width: 90, textAlign: 'center' }]}>{bpm}</Text>
                <Nudge label="Up 1" text="+" onPress={() => bump(1)} />
                <Nudge label="Up 10" text="+10" onPress={() => bump(10)} wide />
              </Row>
            </Help>
            <Row>
              <DarkButton title="✕" onPress={() => setMode('idle')} style={{ flex: 1 }} />
              <Help id="exercise.live.hrSet" style={{ flex: 2 }}>
                <DarkButton title="Set" onPress={() => { enterHeartRate(bpm, 'manual'); setMode('idle'); }} bg={ink.teal} fg={ink.onTeal} />
              </Help>
            </Row>
          </>
        ) : (
          <>
            <DarkButton title={last ? `❤ Connect ${last.name || 'monitor'}` : '❤ Connect monitor'} fg={ink.rose}
              onPress={() => { if (last && getPref('perm.bluetooth') === 'granted') { connectHeartRate(last.id).catch(() => { void connect(); }); } else void connect(); }} />
            <Row>
              <Help id="exercise.live.checkPulse" style={{ flex: 1 }}>
                <DarkButton title="📷 Check pulse" onPress={() => openPanel('pulse')} fg={ink.text} />
              </Help>
              <DarkButton title="⌚ Enter" onPress={() => { setBpm(e.spotHr?.bpm ?? 110); setMode('typing'); }} fg={ink.text} style={{ flex: 1 }} />
            </Row>
            {last && <DarkButton title="Use a different monitor" onPress={() => { void connect(); }} fg={ink.dim} style={{ minHeight: 40, borderWidth: 0, backgroundColor: 'transparent' }} textStyle={{ fontSize: 12 }} />}
          </>
        )}
        {problem && <Text style={{ color: ink.orange, fontSize: 13 }}>{problem}</Text>}
        {!connected && mode === 'idle' && <Text style={s.tileSub}>Time in zone, average and max are counted from a live monitor only.</Text>}
      </Panel>
    </Help>
  );
};

type Phase = 'ask' | 'measuring' | 'done' | 'error';

/** The camera pulse check, full screen over the dashboard. */
export const PulseCheck: React.FC = () => {
  const [phase, setPhase] = useState<Phase>(() => (getPref('perm.camera') === 'granted' ? 'measuring' : 'ask'));
  const [remaining, setRemaining] = useState(MEASURE_SECONDS);
  const [quality, setQuality] = useState<'good' | 'no-finger' | 'too-dark'>('no-finger');
  const [result, setResult] = useState<{ bpm: number; confidence: number } | null>(null);
  const [message, setMessage] = useState('');
  const times = useRef<number[]>([]);
  const reds = useRef<number[]>([]);
  const covered = useRef<boolean[]>([]);
  const startedAt = useRef(0);
  const lastQuality = useRef(0);

  const begin = () => {
    times.current = []; reds.current = []; covered.current = [];
    startedAt.current = Date.now();
    setRemaining(MEASURE_SECONDS);
    setResult(null);
    setPhase('measuring');
  };
  // Permission was given before: make sure it still is, without the card.
  useEffect(() => {
    if (phase !== 'measuring' || startedAt.current) return;
    ensureCamera().then((r) => { if (r === 'granted') begin(); else { setPref('perm.camera', ''); setPhase('ask'); } }).catch(() => setPhase('ask'));
  }, [phase]);

  const finish = () => {
    const est = pulseFrom(times.current, reds.current, covered.current);
    startedAt.current = 0;
    if (!est) {
      setMessage(times.current.length < 60
        ? 'The camera sent no picture. Close this and try again.'
        : 'Could not find a clear pulse. Cover the lens and light completely with your fingertip, hold still, and try again.');
      setPhase('error');
      return;
    }
    setResult(est);
    setPhase('done');
    // It counts as your heart rate for the next two minutes.
    enterHeartRate(est.bpm, 'camera');
  };

  // The countdown runs off the clock too, so a camera that sends nothing still ends with a message.
  useEffect(() => {
    if (phase !== 'measuring') return undefined;
    const id = setInterval(() => {
      if (!startedAt.current) return;
      const elapsed = (Date.now() - startedAt.current) / 1000;
      setRemaining(Math.max(0, Math.ceil(MEASURE_SECONDS - elapsed)));
      if (elapsed >= MEASURE_SECONDS + 2) finish();
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  const onSample = (sm: PulseSample) => {
    if (!startedAt.current) return;
    const elapsed = (sm.t - startedAt.current) / 1000;
    const ok = lensCovered(sm.red, sm.green, sm.blue);
    times.current.push(sm.t);
    reds.current.push(sm.red);
    covered.current.push(ok);
    if (sm.t - lastQuality.current > 400) {
      lastQuality.current = sm.t;
      setQuality(sm.red < 40 ? 'too-dark' : ok ? 'good' : 'no-finger');
      setRemaining(Math.max(0, Math.ceil(MEASURE_SECONDS - elapsed)));
    }
    if (elapsed >= MEASURE_SECONDS) finish();
  };

  return (
    <View style={{ flex: 1, backgroundColor: ink.bg, padding: 14, gap: 12 }}>
      <Text style={{ color: ink.text, fontSize: 24, fontWeight: '900' }}>Check your pulse</Text>
      <Text style={{ color: ink.dim, fontSize: 13 }}>For fitness use only. Not a medical device.</Text>
      {phase === 'ask' && <PermissionCard kind="camera" onReady={() => { setPref('perm.camera', 'granted'); begin(); }} />}
      {phase === 'measuring' && (
        <>
          <Text style={{ color: ink.dim, fontSize: 16, lineHeight: 22 }}>
            Stand still. Rest a fingertip over the back camera and its light, pressing gently, for about {MEASURE_SECONDS} seconds.
          </Text>
          <PulseCamera active torch onSample={onSample} onError={(m) => { setMessage(m); setPhase('error'); }} style={{ height: 120, borderRadius: 16, overflow: 'hidden' }} />
          <Panel style={{ alignItems: 'center' }}>
            <Text style={[s.big, { fontSize: 84, lineHeight: 88, letterSpacing: 0 }]}>{remaining}</Text>
            <Text style={{ fontSize: 16, fontWeight: '900', color: quality === 'good' ? ink.green : ink.amber }}>
              {quality === 'good' ? 'Good signal — hold still' : quality === 'too-dark' ? 'Too dark — cover the light too' : 'Cover the lens with your fingertip'}
            </Text>
          </Panel>
        </>
      )}
      {phase === 'done' && result && (
        <Panel style={{ alignItems: 'center' }}>
          <Text style={[s.big, { fontSize: 96, lineHeight: 100, letterSpacing: 0, color: ink.rose }]}>{result.bpm}</Text>
          <Text style={[s.bigUnit, { color: ink.dim }]}>beats a minute</Text>
          <Text style={{ color: ink.dim, fontSize: 14, textAlign: 'center' }}>
            {result.confidence < 0.5 ? 'The signal was weak, so treat this as a rough reading. ' : ''}It counts as your heart rate for the next two minutes. A fitness estimate, not a medical measurement.
          </Text>
        </Panel>
      )}
      {phase === 'error' && <Panel><Text style={{ color: ink.orange, fontSize: 16, lineHeight: 22 }}>{message}</Text></Panel>}
      <View style={{ flex: 1 }} />
      {(phase === 'done' || phase === 'error') && <DarkButton title="Check again" onPress={begin} style={{ minHeight: 56 }} />}
      <DarkButton title={phase === 'done' ? 'Done' : 'Close'} onPress={closePanel} bg={phase === 'done' ? ink.teal : ink.panel} fg={phase === 'done' ? ink.onTeal : ink.text} style={{ minHeight: 64 }} />
    </View>
  );
};
