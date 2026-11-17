// ============================================================================
// Helper Mode in the Companion: the same help iStride gives on the web. An
// arrow points at the next thing to tap with a short note on what it does,
// and "What can I do here?" lists this screen's walkthroughs.
//
// One Helper for both apps: the switch and what's been done are the member's
// iStride Helper record (GET/PUT /helper, POST /helper/tasks), so a
// walkthrough finished on the web is finished here, and the other way round.
//
// A control says where it is by being wrapped in <Help id="…">; ids are
// iStride's own (TempoRun helper/guides/*Anchors.ts) wherever the control is
// the same one.
// ============================================================================

import type { ComponentRef, RefObject } from 'react';
import { useSyncExternalStore } from 'react';
import type { ScrollView, View } from 'react-native';

import { istride } from '@/shell/api';

import { getPref, setPref } from '../store';
import { GUIDES, type Guide, type ScreenId, type Step } from './guides';

export type ViewRef = RefObject<ComponentRef<typeof View> | null>;
export type ScrollRef = RefObject<ComponentRef<typeof ScrollView> | null>;

type TaskStatus = 'completed' | 'dismissed';
type ServerState = { enabled: boolean; tasks: Record<string, { status: TaskStatus }> };

interface State {
  /** Null until the member's Helper record has loaded. */
  enabled: boolean | null;
  tasks: Record<string, TaskStatus>;
  screen: ScreenId | null;
  run: { guide: Guide; index: number } | null;
  toast: string | null;
}

const state: State = { enabled: null, tasks: {}, screen: null, run: null, toast: null };
const anchors = new Map<string, ViewRef[]>();
let scroll: { ref: ScrollRef; y: number } | null = null;
let version = 0;
const listeners = new Set<() => void>();
const emit = () => { version += 1; listeners.forEach((l) => l()); };

export const useHelper = () => {
  useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => version, () => version);
  return state;
};

export const anchorRef = (id: string) => { const list = anchors.get(id); return list && list.length ? list[list.length - 1] : null; };
export const anchorMounted = (id: string) => !!anchorRef(id);
export const scrollInfo = () => scroll;
export const setScroll = (ref: ScrollRef | null) => { scroll = ref ? { ref, y: 0 } : null; };
export const noteScrollY = (y: number) => { if (scroll) scroll.y = y; };

let loading: Promise<void> | null = null;
/** The member's record has arrived: only then does a first-time walkthrough start by itself (it may already be done). */
let loaded = false;
/** The member's Helper record, once per app session. With no signal, the last known switch position. */
export const loadHelper = () => {
  if (!loading) {
    const saved = getPref('helper.enabled');
    if (saved !== null && state.enabled === null) { state.enabled = saved === '1'; emit(); }
    loading = istride<ServerState>('/helper')
      .then((s) => {
        state.enabled = !!s.enabled;
        state.tasks = Object.fromEntries(Object.entries(s.tasks ?? {}).map(([k, v]) => [k, v.status]));
        setPref('helper.enabled', state.enabled ? '1' : '0');
        loaded = true;
        emit();
        settle();
      })
      .catch(() => { loading = null; if (state.enabled === null) { state.enabled = false; emit(); } });
  }
  return loading;
};

export const setHelperEnabled = (on: boolean) => {
  state.enabled = on;
  setPref('helper.enabled', on ? '1' : '0');
  if (!on) state.run = null;
  emit();
  istride('/helper', { method: 'PUT', body: { enabled: on } }).catch(() => undefined);
  if (on) settle();
};

const record = (guide: Guide, status: TaskStatus) => {
  if (state.tasks[guide.id] === 'completed') return;
  state.tasks[guide.id] = status;
  istride('/helper/tasks', { method: 'POST', body: { taskId: guide.id, status } }).catch(() => undefined);
};

let toastTimer: ReturnType<typeof setTimeout> | null = null;
const showToast = (text: string) => {
  if (!text) return;
  state.toast = text;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { state.toast = null; emit(); }, 4000);
};

const finish = (status: TaskStatus) => {
  const run = state.run;
  if (!run) return;
  record(run.guide, status);
  state.run = null;
  if (status === 'completed') showToast(run.guide.doneMessage);
  emit();
};

export const guidesFor = (screen: ScreenId | null): Guide[] => (screen ? GUIDES.filter((g) => g.screens.includes(screen)) : []);
export const guideStatus = (g: Guide) => state.tasks[g.id] ?? null;
/** What a walkthrough needs before Show me can run it, or null when it can. */
export const guideBlocked = (g: Guide) => (g.availableWhen && !anchorMounted(g.availableWhen.anchor) ? g.availableWhen.otherwise : null);

export const currentStep = (): Step | null => (state.run ? state.run.guide.steps[state.run.index] ?? null : null);

/**
 * Moves a walkthrough past steps that don't apply (their control isn't on
 * this screen, or the member is already past them), and starts this screen's
 * first-time walkthrough when Helper Mode is on.
 */
export const settle = () => {
  let changed = false;
  for (let guard = 0; guard < 40 && state.run; guard++) {
    const step = currentStep();
    if (!step) { finish('completed'); return; }
    const past = step.skipWhenVisible?.some(anchorMounted);
    const missing = !!step.anchor && !anchorMounted(step.anchor) && !step.waitForAnchor;
    if (!past && !missing) break;
    state.run.index += 1;
    changed = true;
  }
  if (!state.run && state.enabled && loaded && state.screen) {
    const auto = guidesFor(state.screen).find((g) => g.auto && !state.tasks[g.id]);
    if (auto) { state.run = { guide: auto, index: 0 }; changed = true; settle(); }
  }
  if (changed) emit();
};

/** The screen now showing (null when leaving). A walkthrough for another screen ends quietly. */
export const setHelperScreen = (screen: ScreenId | null) => {
  if (state.screen === screen) return;
  state.screen = screen;
  const run = state.run;
  if (run && (!screen || !run.guide.screens.includes(screen))) {
    // Past its first step, moving on is what the walkthrough was for.
    if (run.index > 0) record(run.guide, 'completed');
    state.run = null;
  }
  emit();
  // After the new screen's controls have mounted.
  setTimeout(settle, 400);
};

export const startGuide = (g: Guide) => { state.run = { guide: g, index: 0 }; state.toast = null; emit(); settle(); };
export const nextStep = () => {
  const run = state.run;
  if (!run) return;
  if (run.index >= run.guide.steps.length - 1) { finish('completed'); return; }
  run.index += 1;
  emit();
  settle();
};
/** ✕ on a card: this walkthrough isn't offered by itself again (it stays in the list). */
export const dismissGuide = () => finish('dismissed');

/** A wrapped control was tapped: a "Now tap here" step pointing at it (or one of its other ways through) moves on. */
export const anchorTapped = (id: string) => {
  const step = currentStep();
  if (!step || step.kind !== 'tap') return;
  if (step.anchor === id || step.alsoAllow?.includes(id)) setTimeout(nextStep, 250);
};

export const registerAnchor = (id: string, ref: ViewRef) => {
  anchors.set(id, [...(anchors.get(id) ?? []), ref]);
  setTimeout(settle, 0);
};
export const unregisterAnchor = (id: string, ref: ViewRef) => {
  const left = (anchors.get(id) ?? []).filter((r) => r !== ref);
  if (left.length) anchors.set(id, left); else anchors.delete(id);
  setTimeout(settle, 0);
};
