// Copied from iStride (TempoRun services/hiit.ts, commit ea7c71d). The live numbers must match the
// web dashboard, so keep this identical to that file: change it there first.

/**
 * HIIT on foot: sprints with walking (or jogging) recoveries, timed by the
 * app. The coach calls every change, beeps 3-2-1 into each sprint, and each
 * sprint and recovery is logged with its distance and speeds.
 */

export interface HiitPlan {
  id: string;
  name: string;
  warmupSecs: number;
  workSecs: number;
  restSecs: number;
  rounds: number;
  cooldownSecs: number;
  /** What the recovery is called on screen and by the coach. */
  restLabel: 'Walk' | 'Jog';
  /** No timer: the runner taps to switch between sprint and recovery. */
  manual?: boolean;
}

export const HIIT_PRESETS: HiitPlan[] = [
  { id: 'starter',  name: 'Starter',  warmupSecs: 300, workSecs: 20, restSecs: 100, rounds: 6,  cooldownSecs: 180, restLabel: 'Walk' },
  { id: 'classic',  name: 'Classic',  warmupSecs: 300, workSecs: 30, restSecs: 90,  rounds: 8,  cooldownSecs: 300, restLabel: 'Walk' },
  { id: 'pyramid',  name: 'Builder',  warmupSecs: 300, workSecs: 45, restSecs: 75,  rounds: 8,  cooldownSecs: 300, restLabel: 'Jog' },
  { id: 'tabata',   name: 'Tabata',   warmupSecs: 300, workSecs: 20, restSecs: 10,  rounds: 8,  cooldownSecs: 180, restLabel: 'Walk' },
  { id: 'manual',   name: 'Tap to switch', warmupSecs: 0, workSecs: 0, restSecs: 0, rounds: 0, cooldownSecs: 0, restLabel: 'Walk', manual: true },
];

export type HiitPhaseKind = 'warmup' | 'work' | 'rest' | 'cooldown';
export interface HiitPhase { kind: HiitPhaseKind; secs: number; round: number; label: string }

export const hiitPhases = (p: HiitPlan): HiitPhase[] => {
  if (p.manual) return [];
  const out: HiitPhase[] = [];
  if (p.warmupSecs > 0) out.push({ kind: 'warmup', secs: p.warmupSecs, round: 0, label: 'Warm-up' });
  for (let r = 1; r <= p.rounds; r++) {
    out.push({ kind: 'work', secs: p.workSecs, round: r, label: 'Sprint' });
    // No recovery after the last sprint: the cool-down is the recovery.
    if (r < p.rounds || p.cooldownSecs === 0) out.push({ kind: 'rest', secs: p.restSecs, round: r, label: p.restLabel });
  }
  if (p.cooldownSecs > 0) out.push({ kind: 'cooldown', secs: p.cooldownSecs, round: 0, label: 'Cool-down' });
  return out;
};

export const hiitTotal = (p: HiitPlan) => hiitPhases(p).reduce((t, x) => t + x.secs, 0);

/** Where the workout is at a given active time. index −1 = finished. */
export const hiitPhaseAt = (phases: HiitPhase[], elapsed: number) => {
  let t = 0;
  for (let i = 0; i < phases.length; i++) {
    if (elapsed < t + phases[i].secs) {
      return { index: i, phase: phases[i], startsAt: t, remaining: Math.ceil(t + phases[i].secs - elapsed), next: phases[i + 1] ?? null };
    }
    t += phases[i].secs;
  }
  return { index: -1, phase: null as HiitPhase | null, startsAt: t, remaining: 0, next: null as HiitPhase | null };
};

const secsWords = (s: number) => (s >= 60 && s % 60 === 0 ? `${s / 60} minute${s === 60 ? '' : 's'}` : s > 60 ? `${Math.floor(s / 60)} minute${s >= 120 ? 's' : ''} ${s % 60} seconds` : `${s} seconds`);

/** What the coach says as a phase starts. */
export const hiitCue = (ph: HiitPhase | null, plan: HiitPlan): string => {
  if (!ph) return 'Workout complete. Nice work. Keep moving easy, or finish when you are ready.';
  if (ph.kind === 'warmup') return `HIIT, ${plan.rounds} sprints. ${secsWords(ph.secs)} easy to warm up.`;
  if (ph.kind === 'cooldown') return `Sprints done. ${secsWords(ph.secs)} easy to cool down.`;
  if (ph.kind === 'work') return `Sprint ${ph.round}${ph.round === plan.rounds ? ', last one' : ` of ${plan.rounds}`}. Go! ${secsWords(ph.secs)}.`;
  return `${ph.label}. ${secsWords(ph.secs)} to recover.`;
};

export const hiitPlanSummary = (p: HiitPlan) =>
  p.manual ? 'You tap to switch between sprint and recovery.'
  : `${p.rounds} × ${p.workSecs}s sprint / ${p.restSecs}s ${p.restLabel.toLowerCase()}` +
    `${p.warmupSecs ? ` · ${Math.round(p.warmupSecs / 60)} min warm-up` : ''}${p.cooldownSecs ? ` · ${Math.round(p.cooldownSecs / 60)} min cool-down` : ''}`;
