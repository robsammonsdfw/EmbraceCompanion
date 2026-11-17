// ============================================================================
// What the member chose on iStride's setup screen, read back here
// (GET /runs/setup/:id; the shape is TempoRun services/companion.ts
// RunSetupPayload). Opened without one, the Companion starts with the web's
// defaults: no route, no target, the default gear.
// ============================================================================

import { HttpError, istride } from '@/shell/api';

import { kindOfMode } from './calc/activityTypes';
import type { EngineConfig } from './calc/engine';
import { HIIT_PRESETS, type HiitPlan } from './calc/hiit';
import { resolveMaxHr } from './calc/heartZones';
import { RunMode, type Unit } from './calc/types';

export interface RunSetup {
  /** Null: started from the Companion itself, with defaults. */
  setup_id: string | null;
  mode: RunMode;
  unit: Unit;
  target_distance_m: number;
  split_distance_m: number;
  target_speed_mps: number | null;
  route_id: number | null;
  /** [lat, lng] pairs. */
  planned_route: [number, number][];
  body: { weight_kg: number; age: number | null; sex: 'male' | 'female' | null };
  max_hr: number | null;
  target_zone: number | null;
  hiit: HiitPlan | null;
  hr_pre: { bpm: number; confidence: number; source: string; taken_at: number } | null;
  fuel: { start_kcal: number; fasted: { glycogen_kcal: number; fat_share: number; fat_kg: number } | null };
  gear: { gear_id?: number | null; ride_shoe_id?: number | null; kit_id?: number | null; worn_ids?: number[] };
  gear_names: { gear: string | null; ride_shoes: string | null; kit: string | null };
  weather: Record<string, unknown> | null;
  /** The full route weather report checked on the web (TempoRun services/weatherService RouteWeather). */
  weather_report?: { data: RouteWeather; route_name: string; saved_at: number } | null;
  /** Step length (m) from the music pacer. */
  pacer_stride_m?: number | null;
  /** OpenRouteService key for Reroute. */
  routing_key?: string | null;
  pause_weight_loss: boolean;
}

export interface RouteWeatherSegment {
  fromUnit: number; toUnit: number; travelCompass: string; windFromCompass: string; windSpeed: number; windGust: number;
  relation: 'headwind' | 'tailwind' | 'crosswind'; alongComponent: number; temp: number; weatherCode: number; atTime: string;
  confidence: 'good' | 'reduced';
}
export interface RouteWeather {
  segments: RouteWeatherSegment[];
  summary: {
    headwindPct: number; tailwindPct: number; crosswindPct: number; maxGust: number; tempMin: number; tempMax: number;
    apparentMin: number; apparentMax: number; precipMaxProb: number; advice: string[];
  };
  unitLabels: { distance: string; speed: string; temp: string };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * The setup for a link. The web saves it as Start is tapped, while the phone
 * is already opening this app, so "not found" is tried again for a few
 * seconds before giving up. Null: none (expired, or it never arrived).
 */
export const loadSetup = async (setupId: string): Promise<RunSetup | null> => {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const s = await istride<RunSetup>(`/runs/setup/${encodeURIComponent(setupId)}`);
      return normalize(s);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 0;
      if (status === 401) throw e;
      // 404 may be "not saved yet"; no signal may clear. Anything else won't change.
      if (status !== 404 && status !== 0) return null;
      await sleep(1000);
    }
  }
  return null;
};

const normalize = (s: RunSetup): RunSetup => ({
  ...s,
  planned_route: Array.isArray(s.planned_route) ? s.planned_route : [],
  body: s.body ?? { weight_kg: 0, age: null, sex: null },
  fuel: s.fuel ?? { start_kcal: 0, fasted: null },
  gear: s.gear ?? {},
  gear_names: s.gear_names ?? { gear: null, ride_shoes: null, kit: null },
});

type BodyBasis = { weightKg: number | null; age: number | null; sex: 'male' | 'female' | null };
type Fuel = { available_kcal: number | null; fasted: { glycogen_kcal: number; fat_share: number; fat_kg: number } | null };
type Health = { pauseWeightLoss?: boolean };

/**
 * Starting with nothing chosen: the same as tapping Start on the web's setup
 * screen untouched. Weight, age and sex are the shared ones every
 * EmbraceHealthAI app uses; with no signal the activity still starts, without
 * calorie estimates.
 */
export const defaultSetup = async (mode: RunMode, unit: Unit): Promise<RunSetup> => {
  const quiet = <T,>(p: Promise<T>) => p.catch(() => null);
  const [body, fuel, health] = await Promise.all([
    quiet(istride<BodyBasis>('/body-basis')),
    quiet(istride<Fuel>('/fuel/available')),
    quiet(istride<Health>('/health/today')),
  ]);
  const age = body?.age && body.age > 0 ? body.age : null;
  const kind = kindOfMode(mode);
  return {
    setup_id: null,
    mode,
    unit,
    target_distance_m: 0,
    split_distance_m: mode === RunMode.TRACK ? 400 : unit === 'metric' ? 1000 : 1609.34,
    target_speed_mps: null,
    route_id: null,
    planned_route: [],
    body: { weight_kg: body?.weightKg ?? 0, age, sex: body?.sex ?? null },
    max_hr: resolveMaxHr(null, age),
    target_zone: kind === 'heartwalk' ? 2 : null,
    hiit: kind === 'hiit' ? HIIT_PRESETS[1] : null,
    hr_pre: null,
    fuel: { start_kcal: fuel?.available_kcal ?? 0, fasted: fuel?.fasted ?? null },
    gear: {},
    gear_names: { gear: null, ride_shoes: null, kit: null },
    weather: null,
    pause_weight_loss: health?.pauseWeightLoss === true,
  };
};

/** The setup as the tracker reads it. */
export const engineConfig = (s: RunSetup, startedAt: number): EngineConfig => ({
  mode: s.mode,
  unit: s.unit,
  startedAt,
  targetDistance: s.target_distance_m || 0,
  splitDistance: s.split_distance_m || (s.unit === 'metric' ? 1000 : 1609.34),
  targetSpeed: s.target_speed_mps || null,
  body: { weight: s.body.weight_kg || 0, age: s.body.age, gender: s.body.sex },
  maxHr: s.max_hr,
  targetZone: s.target_zone ?? 2,
  hiitPlan: kindOfMode(s.mode) === 'hiit' ? (s.hiit ?? HIIT_PRESETS[1]) : null,
  plannedRoute: s.planned_route.map(([lat, lng]) => ({ lat, lng })),
});
