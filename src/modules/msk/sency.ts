// ============================================================================
// Sency's SDK (the only file that touches @sency/react-native-smkit-ui)
// ============================================================================
// Sency opens its own full-screen camera session over the Companion: it guides
// the member through each movement, scores it, and hands back a summary.
//
//   sencyAvailability()   can this build run a check at all?
//   prepare()             signs the SDK in and fetches its models (needs the
//                         internet the first time). Safe to call again.
//   runCheck(kind)        opens Sency's screens and resolves when they close.
//
// A build made before Sency was added still gets this code in an over-the-air
// update. It has no native half, so sencyAvailability() says 'needs-build'
// and nothing here calls into the SDK.
// ============================================================================

import { NativeModules } from 'react-native';
import { configure, SMWorkoutLibrary, startAssessment } from '@sency/react-native-smkit-ui';

import { SENCY_AUTH_KEY } from '@/shell/config';

/** Sency's ready-made assessments. Advanced MSK Health is the 360 body one. */
export type CheckKind = 'body360' | 'fitness' | 'strength' | 'cardio';

const TYPE: Record<CheckKind, SMWorkoutLibrary.AssessmentTypes> = {
  body360: SMWorkoutLibrary.AssessmentTypes.Body360,
  fitness: SMWorkoutLibrary.AssessmentTypes.Fitness,
  strength: SMWorkoutLibrary.AssessmentTypes.Strength,
  cardio: SMWorkoutLibrary.AssessmentTypes.Cardio,
};

export const isCheckKind = (v: string): v is CheckKind => v in TYPE;

/**
 * 'needs-build'  this build has no Sency in it (made before it was added)
 * 'needs-key'    the build has Sency, but no Sency key was set when it was made
 */
export type Availability = 'ready' | 'needs-build' | 'needs-key';

export const sencyAvailability = (): Availability => {
  if (NativeModules.SMKitUIManager == null) return 'needs-build';
  return SENCY_AUTH_KEY ? 'ready' : 'needs-key';
};

let preparing: Promise<void> | null = null;

/** Once per launch. A failure is forgotten, so the next call tries again. */
export const prepare = (): Promise<void> => {
  if (!preparing) {
    preparing = configure(SENCY_AUTH_KEY).then(
      () => undefined,
      (e: unknown) => { preparing = null; throw e; },
    );
  }
  return preparing;
};

export type MovementScore = { name: string; score: number | null; technique: number | null };
export type CheckResult = {
  /** False when the member left before the last movement. */
  finished: boolean;
  /** 0–100, or null when Sency sent none. */
  score: number | null;
  movements: MovementScore[];
  /** Sency's whole summary, as it sent it. */
  raw: string;
};

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null);
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const record = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

/** "OverheadSquat" → "Overhead Squat", when Sency gives an id and no name. */
const spaced = (id: string) => id.replace(/([a-z0-9])([A-Z])/g, '$1 $2');

/**
 * Sency's summary is a JSON string: total_score, and one entry per movement
 * under exercises. iPhone nests a movement's name under exercise_info; Android
 * puts it on the movement. Anything unreadable is left out, never guessed.
 */
export const readSummary = (raw: string, finished: boolean): CheckResult => {
  let data: Record<string, unknown> = {};
  try { data = record(JSON.parse(raw)); } catch { /* an empty or unreadable summary */ }
  const list = Array.isArray(data.exercises) ? data.exercises : [];
  const movements = list.map((entry): MovementScore => {
    const e = record(entry);
    const info = record(e.exercise_info);
    const name = text(e.pretty_name) || text(info.pretty_name) || spaced(text(e.exercise_id) || text(info.exercise_id));
    return { name, score: num(e.total_score), technique: num(e.technique_score) };
  }).filter((m) => m.name);
  return { finished, score: num(data.total_score), movements, raw };
};

/**
 * Opens Sency's screens for one check. Resolves when they have closed, whether
 * the member finished or left early. Sency shows its own summary first.
 *
 * No personal details are passed to Sency: where a check needs age or sex to
 * score it, Sency's own screen asks.
 */
export const runCheck = async (kind: CheckKind): Promise<CheckResult> => {
  await prepare();
  const r = await startAssessment(TYPE[kind], true, null, false, '', null);
  return readSummary(typeof r?.summary === 'string' ? r.summary : '', !!r?.didFinish);
};

/** A message a member can act on, from whatever the SDK threw. */
export const problemText = (e: unknown): string => {
  const code = text(record(e).code);
  const message = text(record(e).message) || (typeof e === 'string' ? e : '');
  if (code === 'E_SESSION_BUSY') return 'A check is already open. Close it, then try again.';
  if (/network|internet|offline|timed out|connection/i.test(message)) {
    return 'Couldn’t reach the movement check service. Check your connection and try again.';
  }
  return message ? `The check couldn’t start: ${message}` : 'The check couldn’t start. Try again.';
};
