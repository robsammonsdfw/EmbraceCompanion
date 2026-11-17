// Copied from iStride (TempoRun App.tsx): the Academy session and the word the
// coach uses for a split. Keep identical to the web's.

import { RunMode, type Unit } from './types';

/**
 * Academy mode ("AI Coach & Drills"): a structured 25-minute session — warm
 * up, six strides each with one form focus, cool down — with spoken cues at
 * every change.
 */
export interface AcademyPhase { name: string; secs: number; kind: 'easy' | 'fast'; cue: string }

/** The split as the coach says it ("Mile 3 complete", not "mi 3"). */
export const splitWord = (mode: RunMode, unit: Unit) =>
  mode === RunMode.TRACK ? 'Lap' : unit === 'imperial' ? 'Mile' : 'Kilometer';

const ACADEMY_FOCUS = [
  'quick, light feet',
  'run tall, hips forward',
  'arms at ninety degrees, driving back',
  'land under your hips, not out in front',
  'relaxed face, shoulders and hands',
  'put it all together',
];
export const ACADEMY_PLAN: AcademyPhase[] = [
  { name: 'Warm-up', secs: 300, kind: 'easy', cue: 'Academy session. Five minutes easy to warm up. Relaxed shoulders, short quick steps.' },
  ...ACADEMY_FOCUS.flatMap((focus, i): AcademyPhase[] => [
    { name: `Stride ${i + 1} of 6`, secs: 60, kind: 'fast',
      cue: `${i === 5 ? 'Last stride' : `Stride ${i + 1}`}. Pick it up to a strong, controlled pace for one minute. Focus: ${focus}.` },
    { name: 'Recover', secs: 90, kind: 'easy', cue: 'Ease off. Easy jog and let your breathing settle.' },
  ]),
  { name: 'Cool-down', secs: 300, kind: 'easy', cue: 'Drills done. Five minutes easy to cool down.' },
];
export const ACADEMY_TOTAL = ACADEMY_PLAN.reduce((t, p) => t + p.secs, 0);
export const ACADEMY_DONE_CUE = 'Session complete. Run easy as long as you like, or finish when you are ready.';

/** Where an Academy session is at a given active time. index -1 = finished. */
export const academyPhaseAt = (elapsed: number) => {
  let t = 0;
  for (let i = 0; i < ACADEMY_PLAN.length; i++) {
    if (elapsed < t + ACADEMY_PLAN[i].secs) {
      return { index: i, phase: ACADEMY_PLAN[i] as AcademyPhase | null, remaining: Math.ceil(t + ACADEMY_PLAN[i].secs - elapsed), next: ACADEMY_PLAN[i + 1] ?? null };
    }
    t += ACADEMY_PLAN[i].secs;
  }
  return { index: -1, phase: null as AcademyPhase | null, remaining: 0, next: null as AcademyPhase | null };
};
