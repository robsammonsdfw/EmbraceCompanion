// The shapes iStride's web app uses for a live activity (TempoRun types.ts),
// kept the same here so the saved activity is the same.

export interface GeoPoint {
  lat: number;
  lng: number;
  altitude: number | null; // meters
  timestamp: number;
  speed: number | null; // meters per second
}

export interface Split {
  distanceLabel: string; // e.g., "mi 1"
  timeSeconds: number; // Time taken for this specific split
  cumulativeTime: number; // Total time elapsed
  pace: string; // Pace string e.g. "8:30"
}

export interface Interval {
  id: number;
  type: 'SPRINT' | 'RECOVERY' | 'WARMUP' | 'COOLDOWN';
  /** HIIT: what the runner saw ("Sprint", "Walk"), and which round. */
  label?: string;
  round?: number;
  startTime: number;
  duration: number; // seconds
  distance: number; // meters
  avgPace: string;
  avgSpeed: number; // m/s
  maxSpeed: number; // m/s
}

export enum TrainingZone {
  IDLE = 'IDLE',
  AEROBIC = 'AEROBIC',
  ANAEROBIC = 'ANAEROBIC',
}

export interface BodyProfile {
  /** kg. 0 = unknown — calorie and fluid estimates are hidden until it's set. */
  weight: number;
  /** null = unknown. */
  age: number | null;
  gender: 'male' | 'female' | null;
}

export enum RunMode {
  ACADEMY = 'ACADEMY',
  TRAIL = 'TRAIL',
  TRACK = 'TRACK',
  ENDURANCE = 'ENDURANCE',
  CASUAL = 'CASUAL',
  // Go Exercise. HIIT is also on Go Run: it's sprint intervals on foot.
  HIIT = 'HIIT',
  CYCLING = 'CYCLING',
  WALKING = 'WALKING',
  HEART_WALK = 'HEART_WALK',
}

export type Unit = 'imperial' | 'metric';

export const isRunMode = (v: unknown): v is RunMode =>
  typeof v === 'string' && (Object.values(RunMode) as string[]).includes(v);
