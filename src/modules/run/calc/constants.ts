// Copied from iStride (TempoRun constants.ts, commit ea7c71d). The live numbers must match the
// web dashboard, so keep this identical to that file: change it there first.

import type { BodyProfile } from './types';

export const METERS_TO_MILES = 0.000621371;
export const METERS_TO_KM = 0.001;
export const METERS_TO_FEET = 3.28084;
export const LBS_TO_KG = 0.453592;
export const MPS_TO_MPH = 2.23694;
export const MPS_TO_KPH = 3.6;

// Race Distances in Meters
export const RACE_DISTANCES = {
  SPRINT: [
    { label: '100m', meters: 100 },
    { label: '200m', meters: 200 },
    { label: '400m', meters: 400 },
    { label: '800m', meters: 800 },
    { label: '1000m', meters: 1000 },
    { label: '1600m', meters: 1600 }, // ~1 Mile track
  ],
  ENDURANCE: [
    { label: '1km', meters: 1000 },
    { label: '1 Mile', meters: 1609.34 },
    { label: '5km', meters: 5000 },
    { label: '10km', meters: 10000 },
    { label: '1/2 Mara', meters: 21097.5 },
    { label: 'Marathon', meters: 42195 },
  ]
};

// Casual Mode: Calorie Equivalents
export const FOOD_BURNS = [
  { k: 70, label: "Cookie", icon: "🍪" },
  { k: 105, label: "Banana", icon: "🍌" },
  { k: 140, label: "Cola Can", icon: "🥤" },
  { k: 250, label: "Glazed Donut", icon: "🍩" },
  { k: 285, label: "Slice of Pizza", icon: "🍕" },
  { k: 350, label: "Med. Fries", icon: "🍟" },
  { k: 540, label: "Big Burger", icon: "🍔" },
  { k: 800, label: "Burrito", icon: "🌯" },
  { k: 1200, label: "Whole Pizza", icon: "🍕" }
];

// Helper to format seconds into MM:SS or HH:MM:SS
export const formatDuration = (seconds: number): string => {
  if (!isFinite(seconds) || isNaN(seconds)) return "-:--";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10); // tenths

  // For sprints (under 1 min), show decimal
  if (seconds < 60) {
     return `${s}.${ms}`;
  }

  if (h > 0) {
    return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

// A running clock: 0:08, 4:52, 1:02:09 (whole seconds; no sprint tenths).
export const formatClock = (seconds: number): string => {
  if (!isFinite(seconds) || seconds < 0) return "--";
  const t = Math.round(seconds);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};

// A duration the coach can say out loud: "38 minutes 10 seconds".
export const speakDuration = (seconds: number): string => {
  const t = Math.max(0, Math.round(seconds));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const part = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  if (h > 0) return [part(h, 'hour'), m ? part(m, 'minute') : ''].filter(Boolean).join(' ');
  return [m ? part(m, 'minute') : '', s || !m ? part(s, 'second') : ''].filter(Boolean).join(' ');
};

// Calculate Haversine distance between two points in meters
export const getDistanceFromLatLonInM = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d * 1000; // Distance in meters
};

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

// Convert Speed (m/s) to Speed string (MPH or KPH)
export const formatSpeed = (speedMps: number, unit: 'imperial' | 'metric'): string => {
  if (speedMps <= 0.1) return "0.0";
  const speed = unit === 'imperial' ? speedMps * MPS_TO_MPH : speedMps * MPS_TO_KPH;
  return speed.toFixed(1);
};

// Convert Speed (m/s) to Pace (mm:ss per mile/km)
/** maxSecs: slower than this reads "Walk" (20 min/mi for runs; walks pass more). */
export const calculatePace = (speedMps: number, unit: 'imperial' | 'metric', maxSecs = 1200): string => {
  if (speedMps <= 0.1) return "-:--"; 

  let paceSeconds = 0;
  if (unit === 'imperial') {
    const speedMpm = speedMps * 60 * METERS_TO_MILES;
    paceSeconds = speedMpm > 0 ? 1 / speedMpm * 60 : 0;
  } else {
    const speedKpm = speedMps * 60 * METERS_TO_KM;
    paceSeconds = speedKpm > 0 ? 1 / speedKpm * 60 : 0;
  }

  if (paceSeconds > maxSecs || paceSeconds <= 0) return "Walk";
  return formatDuration(paceSeconds);
};

// --- GAP (Grade Adjusted Pace) ---
// Estimates the equivalent speed on flat ground based on gradient
export const calculateGAP = (currentSpeedMps: number, gradientPercent: number): number => {
  if (currentSpeedMps < 0.5) return currentSpeedMps; // Walking/stopped, calc irrelevant

  // Based on Minetti's energy cost equation simplified for real-time
  // Cost factor approx: 1.0 at 0%, ~1.5 at 10% uphill, ~0.8 at -10% downhill
  // We inverse cost to get speed equivalent. 
  // If cost is high (uphill), GAP speed is higher than actual speed (you are working harder).
  
  let costFactor = 1.0;
  const g = gradientPercent / 100;

  if (g > 0) {
    // Uphill: cost increases roughly linearly for runable grades
    costFactor = 1 + (g * 3.5); 
  } else {
    // Downhill: cost decreases until about -10% to -20%, then increases again (braking)
    costFactor = 1 + (g * 1.5); 
    if (costFactor < 0.6) costFactor = 0.6; // Floor
  }

  // Equivalent Flat Speed = Actual Speed * CostFactor
  return currentSpeedMps * costFactor;
};

// --- Health Calculations ---
export const getMETs = (speedMps: number): number => {
  const speedKph = speedMps * 3.6;
  if (speedKph < 0.5) return 1.0; 
  if (speedKph < 4.0) return 3.0; 
  if (speedKph < 8.0) return 6.0; 
  if (speedKph < 11.0) return 9.8; 
  if (speedKph < 14.5) return 12.8; 
  return 16.0; 
};

export const calculateCaloriesPerSecondHR = (hr: number, profile: BodyProfile): number => {
  const { weight, age, gender } = profile;
  // The formula needs all three; with any unknown there's no estimate.
  if (age === null || !gender || !(weight > 0)) return 0;
  let kCalPerMin = 0;
  if (gender === 'male') {
    kCalPerMin = ((-55.0969 + (0.6309 * hr) + (0.1988 * weight) + (0.2017 * age)) / 4.184);
  } else {
    kCalPerMin = ((-20.4022 + (0.4472 * hr) - (0.1263 * weight) + (0.074 * age)) / 4.184);
  }
  if (hr < 40) return 0;
  return Math.max(0, kCalPerMin / 60);
};

export const calculateCaloriesPerSecondMETs = (speedMps: number, weightKg: number): number => {
  const mets = getMETs(speedMps);
  const kCalPerMin = (mets * 3.5 * weightKg) / 200;
  return kCalPerMin / 60;
};

// --- Heart Rate Estimation -----------------------------------------------
// Two real measurements (before and after) plus pace let us reconstruct what
// happened in between. Everything here is explicitly an ESTIMATE and is
// labelled as such wherever it surfaces.

/** Age-predicted maximum. Tanaka et al. — more accurate than 220 minus age. */
export const estimateMaxHeartRate = (age: number): number => 208 - 0.7 * age;

/**
 * Heart rate recovery follows an exponential decay toward resting. Given a
 * reading taken `delaySeconds` after stopping, work backwards to what the
 * heart rate was at the moment of stopping.
 *
 *   HR(t) = HR_end - (HR_end - HR_rest) * (1 - e^(-t/tau))
 *
 * tau ~= 70s is typical for recreationally active adults.
 *
 * The division by e^(-t/tau) means the estimate grows explosively as the
 * delay increases — a reading at 90s back-extrapolates to physiologically
 * impossible values. Two guards prevent that: we refuse to extrapolate past
 * 90 seconds, and we clamp the result to the person's age-predicted maximum.
 * A refusal is correct here; a number above 250 bpm is not an estimate, it is
 * an artefact.
 */
export const estimateEndHeartRate = (
  hrPost: number,
  hrRest: number,
  delaySeconds: number,
  age: number = 35,
): number | null => {
  if (!isFinite(hrPost) || !isFinite(hrRest) || delaySeconds < 0) return null;
  if (delaySeconds > 90) return null;           // too stale to reconstruct
  if (hrPost <= hrRest) return Math.round(hrPost);

  const TAU = 70;
  const decay = Math.exp(-delaySeconds / TAU);

  const raw = (hrPost - hrRest * (1 - decay)) / decay;
  if (!isFinite(raw)) return null;

  // If the back-extrapolation exceeds what this heart can physically reach,
  // the model has diverged and the reading is too late to be informative.
  // Return nothing rather than the ceiling: reporting the cap would present a
  // constant as if it were a measurement.
  const ceiling = estimateMaxHeartRate(age);
  if (raw > ceiling) return null;

  return Math.round(Math.max(hrPost, raw));
};

/**
 * Heart rate recovery: the drop in the first 60 seconds after stopping,
 * normalised from whatever delay the reading was actually taken at.
 * This one is close to measured rather than modelled, and it improves as
 * fitness improves — a genuinely useful number to track over time.
 */
export const estimateHeartRateRecovery = (
  hrEnd: number,
  hrPost: number,
  delaySeconds: number,
): number | null => {
  if (delaySeconds <= 0 || hrEnd <= hrPost) return null;
  const TAU = 70;
  const dropAtDelay = hrEnd - hrPost;
  const fractionAt60 = 1 - Math.exp(-60 / TAU);
  const fractionAtDelay = 1 - Math.exp(-delaySeconds / TAU);
  if (fractionAtDelay <= 0) return null;
  const recovery = dropAtDelay * (fractionAt60 / fractionAtDelay);
  // Above ~60 bpm in the first minute is beyond what is physiologically
  // plausible; treat it as a bad reading rather than a remarkable athlete.
  if (recovery > 60) return null;
  return Math.round(recovery);
};

/**
 * Average heart rate across the activity, estimated from the two readings
 * and how hard the person was working (via METs relative to their effort
 * at the end). Used for the saved avg_heart_rate when no device supplied one.
 */
export const estimateAverageHeartRate = (
  hrRest: number,
  hrEnd: number,
  avgSpeedMps: number,
  peakSpeedMps: number,
): number | null => {
  if (!isFinite(hrRest) || !isFinite(hrEnd) || hrEnd <= hrRest) return null;
  const peakMets = getMETs(peakSpeedMps || avgSpeedMps);
  const avgMets  = getMETs(avgSpeedMps);
  if (peakMets <= 1) return Math.round(hrRest);
  // Effort fraction scales the measured reserve between rest and end.
  const fraction = Math.max(0, Math.min(1, (avgMets - 1) / (peakMets - 1)));
  return Math.round(hrRest + (hrEnd - hrRest) * fraction);
};

// --- Advanced Smoothing & Training Logic ---

/**
 * Adaptive Smoother for GPS Speed.
 * Standard low-pass filters lag too much during sprints. 
 * This increases trust in raw data when acceleration is high.
 */
export class AdaptiveSmoother {
  private lastValue: number = 0;
  private alpha: number = 0.15; // Baseline smoothing (0.0 to 1.0)
  /** Fastest believable speed, m/s: 12 (27 mph) on foot, more on a bike. */
  maxSpeed = 12;

  process(raw: number): number {
    // An unrealistic jump is a GPS glitch: keep the last value.
    if (raw > this.maxSpeed) return this.lastValue; 

    // Detect high acceleration event (Sprint Start)
    const diff = Math.abs(raw - this.lastValue);
    
    // Dynamic Alpha: If difference is big, trust raw more (higher alpha)
    // If difference is small, trust history more (lower alpha)
    let dynamicAlpha = this.alpha;
    if (diff > 1.5) dynamicAlpha = 0.6; // React fast to sprints
    else if (diff > 0.5) dynamicAlpha = 0.3;

    this.lastValue = this.lastValue * (1 - dynamicAlpha) + raw * dynamicAlpha;
    return Math.max(0, this.lastValue);
  }

  reset() {
    this.lastValue = 0;
  }
}