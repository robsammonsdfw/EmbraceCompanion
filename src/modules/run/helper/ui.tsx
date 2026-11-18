// Helper Mode on screen: <Help> marks a control, <HelperLayer> draws the ring,
// arrow and note for the step in progress, and <HelperPill> opens "What can I
// do here?". Nothing is dimmed or blocked: the run screen stays fully usable.

import React, { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View, type ViewStyle } from 'react-native';

import { useTheme } from '@/shell/theme';

import {
  anchorMounted, anchorRef, anchorTapped, currentStep, dismissGuide, guideBlocked, guidesFor, guideStatus, loadHelper, nextStep,
  registerAnchor, scrollInfo, setHelperEnabled, setHelperScreen, startGuide, unregisterAnchor, useHelper,
} from './core';
import type { ScreenId } from './guides';

const TEAL = '#0D9488';
const INK = '#0F172A';

/** Marks a control a walkthrough can point at. */
export const Help: React.FC<{ id: string; children: React.ReactNode; style?: ViewStyle }> = ({ id, children, style }) => {
  const ref = useRef<ComponentRef<typeof View>>(null);
  const down = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => { registerAnchor(id, ref); return () => unregisterAnchor(id, ref); }, [id]);
  return (
    <View ref={ref} collapsable={false} style={style}
      onTouchStart={(e) => { down.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY }; }}
      onTouchEnd={(e) => {
        // A tap, not the end of a scroll that happened to finish here.
        const d = down.current;
        if (d && Math.abs(e.nativeEvent.pageX - d.x) < 12 && Math.abs(e.nativeEvent.pageY - d.y) < 12) anchorTapped(id);
      }}>
      {children}
    </View>
  );
};

/** Says which screen is showing, for "What can I do here?" and first-time walkthroughs. */
export const useHelperScreen = (screen: ScreenId | null) => {
  useEffect(() => { void loadHelper(); }, []);
  useEffect(() => { setHelperScreen(screen); return () => setHelperScreen(null); }, [screen]);
};

type Rect = { x: number; y: number; w: number; h: number };

/** The ring, arrow and note. Put it last inside the screen so it draws on top. */
export const HelperLayer: React.FC = () => {
  const helper = useHelper();
  const rootRef = useRef<ComponentRef<typeof View>>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [cardH, setCardH] = useState(150);
  const scrolledFor = useRef<string | null>(null);
  const step = helper.enabled ? currentStep() : null;
  const stepKey = step && helper.run ? `${helper.run.guide.id}/${step.id}` : null;
  const anchorId = step?.anchor ?? null;

  useEffect(() => {
    if (!anchorId) { setRect(null); return; }
    const measure = () => {
      const a = anchorRef(anchorId)?.current;
      const root = rootRef.current;
      if (!a || !root) { setRect(null); return; }
      root.measureInWindow((rx, ry, rw, rh) => {
        a.measureInWindow((ax, ay, aw, ah) => {
          if (!aw && !ah) { setRect(null); return; }
          setSize({ w: rw, h: rh });
          setRect({ x: ax - rx, y: ay - ry, w: aw, h: ah });
          // Off screen (further down the dashboard): bring it into view, once per step.
          const sc = scrollInfo();
          const hidden = ay - ry < 40 || ay - ry + Math.min(ah, 120) > rh - 130;
          if (hidden && sc?.ref.current && scrolledFor.current !== stepKey) {
            scrolledFor.current = stepKey;
            sc.ref.current.measureInWindow((_sx: number, sy: number) => {
              sc.ref.current?.scrollTo({ y: Math.max(0, sc.y + (ay - sy) - 190), animated: true });
            });
          }
        });
      });
    };
    measure();
    const id = setInterval(measure, 350);
    return () => clearInterval(id);
  }, [anchorId, stepKey]);

  const waiting = !!step && !!step.anchor && !anchorMounted(step.anchor);
  const show = !!step && !waiting;
  const banner = !step?.anchor || step?.placement === 'banner' || !rect;
  const onScreen = !!rect && rect.y + rect.h > 0 && rect.y < size.h;
  const below = !!rect && rect.y + rect.h + 14 + cardH < size.h - 8;
  const cardTop = banner ? 8 : below ? rect!.y + rect!.h + 14 : Math.max(8, rect!.y - 14 - cardH);
  const arrowLeft = rect ? Math.max(18, Math.min(size.w - 42, rect.x + rect.w / 2 - 12)) : 0;
  const isLast = !!helper.run && helper.run.index >= helper.run.guide.steps.length - 1;

  return (
    <View ref={rootRef} collapsable={false} pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {show && rect && onScreen && (
        <View pointerEvents="none" style={[st.ring, { left: rect.x - 5, top: rect.y - 5, width: rect.w + 10, height: rect.h + 10 }]} />
      )}
      {show && !banner && rect && onScreen && (
        <Text pointerEvents="none" style={[st.arrow, { left: arrowLeft, top: below ? rect.y + rect.h - 4 : rect.y - 24 }]}>{below ? '▲' : '▼'}</Text>
      )}
      {show && step && (
        <View style={[st.card, { top: cardTop }]} onLayout={(e) => setCardH(e.nativeEvent.layout.height)}>
          <View style={st.cardHead}>
            <Text style={st.title}>{step.title}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close this walkthrough" hitSlop={12} onPress={dismissGuide}>
              <Text style={st.close}>✕</Text>
            </Pressable>
          </View>
          {step.body ? <Text style={st.body}>{step.body}</Text> : null}
          {step.kind === 'info' && (
            <Pressable accessibilityRole="button" onPress={nextStep} style={({ pressed }) => [st.next, pressed && { opacity: 0.8 }]}>
              <Text style={st.nextText}>{step.nextLabel ?? (isLast ? 'Done' : 'Next')}</Text>
            </Pressable>
          )}
        </View>
      )}
      {helper.toast && !show && (
        <View pointerEvents="none" style={st.toast}><Text style={st.toastText}>✓ {helper.toast}</Text></View>
      )}
    </View>
  );
};

/** The Helper button: opens the switch and this screen's walkthroughs. */
export const HelperPill: React.FC = () => {
  const dark = useTheme().mode === 'dark';
  const helper = useHelper();
  const [open, setOpen] = useState(false);
  const on = helper.enabled === true;
  const guides = guidesFor(helper.screen).filter((g) => g.listed !== false);
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel="Helper" onPress={() => setOpen(true)} hitSlop={8}
        style={({ pressed }) => [st.pill, { backgroundColor: on ? TEAL : dark ? '#27272A' : '#E2E8F0' }, pressed && { opacity: 0.8 }]}>
        <Text style={[st.pillText, { color: on ? '#FFFFFF' : dark ? '#D4D4D8' : '#334155' }]}>? {on ? 'What can I do here?' : 'Helper'}</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={st.backdrop} onPress={() => setOpen(false)} />
        <View style={st.sheet}>
          <View style={st.sheetHead}>
            <View style={{ flex: 1 }}>
              <Text style={st.sheetTitle}>Helper Mode</Text>
              <Text style={st.sheetNote}>
                {on ? 'Arrows point to the next thing to tap, with a short note on what it does. Turn it off once you’ve got the hang of it.'
                  : 'Turn it on for arrows and short instructions that walk you through each part of the app.'}
              </Text>
            </View>
            <Switch value={on} onValueChange={setHelperEnabled} trackColor={{ true: TEAL, false: '#CBD5E1' }} />
          </View>
          <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 10, paddingBottom: 8 }}>
            {on && guides.length > 0 && <Text style={st.sheetLabel}>What can I do here?</Text>}
            {on && guides.map((g) => {
              const status = guideStatus(g);
              const blocked = guideBlocked(g);
              return (
                <View key={g.id} style={st.guide}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.guideTitle}>{g.title}</Text>
                    <Text style={st.sheetNote}>{blocked ?? g.summary}</Text>
                    {status && <Text style={[st.status, { color: status === 'completed' ? TEAL : '#94A3B8' }]}>{status === 'completed' ? '✓ Done' : 'Skipped'}</Text>}
                  </View>
                  <Pressable accessibilityRole="button" disabled={!!blocked} onPress={() => { setOpen(false); setTimeout(() => startGuide(g), 350); }}
                    style={({ pressed }) => [st.showMe, (pressed || !!blocked) && { opacity: 0.4 }]}>
                    <Text style={st.showMeText}>Show me</Text>
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>
          <Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={st.done}><Text style={st.doneText}>Close</Text></Pressable>
        </View>
      </Modal>
    </>
  );
};

const st = StyleSheet.create({
  ring: { position: 'absolute', borderWidth: 3, borderColor: '#2DD4BF', borderRadius: 16 },
  arrow: { position: 'absolute', color: '#2DD4BF', fontSize: 24, lineHeight: 26 },
  card: { position: 'absolute', left: 12, right: 12, backgroundColor: '#FFFFFF', borderRadius: 18, padding: 14, gap: 8, borderWidth: 2, borderColor: '#2DD4BF',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  title: { flex: 1, color: INK, fontSize: 18, fontWeight: '900' },
  close: { color: '#64748B', fontSize: 18, fontWeight: '900', paddingHorizontal: 4 },
  body: { color: '#334155', fontSize: 15, lineHeight: 21 },
  next: { alignSelf: 'flex-end', backgroundColor: TEAL, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 20, minWidth: 96, alignItems: 'center' },
  nextText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  toast: { position: 'absolute', left: 16, right: 16, top: 10, backgroundColor: INK, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#2DD4BF' },
  toastText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', textAlign: 'center' },
  pill: { borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12, alignSelf: 'flex-start' },
  pillText: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.6 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, gap: 12, paddingBottom: 30 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sheetTitle: { color: INK, fontSize: 20, fontWeight: '900' },
  sheetNote: { color: '#475569', fontSize: 13, lineHeight: 18 },
  sheetLabel: { color: '#64748B', fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  guide: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F1F5F9', borderRadius: 14, padding: 12 },
  guideTitle: { color: INK, fontSize: 15, fontWeight: '900' },
  status: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase', marginTop: 2 },
  showMe: { backgroundColor: INK, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12 },
  showMeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  done: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: '#E2E8F0' },
  doneText: { color: INK, fontSize: 15, fontWeight: '900' },
});
