// Copied from iStride (TempoRun services/exerciseCalories.ts, commit ea7c71d). The live numbers must match the
// web dashboard, so keep this identical to that file: change it there first.

/**
 * Calorie models per activity. Running keeps its MET table in constants.ts.
 *
 * Why separate models: at the same 10 mph a cyclist is barely working while a
 * runner is near their limit, and a walker's cost depends on hills far more
 * than a runner's. So cycling uses the physics of moving a bike (what a power
 * meter measures) and walking uses the ACSM walking equation. With a live
 * heart-rate monitor, App prefers the heart-rate formula over either.
 */

const KCAL_PER_JOULE = 1 / 4184;
/** Muscles turn about 24% of food energy into work at the pedals. */
const CYCLING_EFFICIENCY = 0.24;
/** Above ~35 mph a recreational rider is descending, not pedalling. */
const COASTING_SPEED = 15.6;

/**
 * Cycling, kcal per second. Pedalling power = rolling resistance + climbing
 * + air drag, for an upright rider (CdA 0.5 m², tyres Crr 0.006, bike 10 kg).
 * Power below zero (descending) is coasting. Capped at what a fit amateur can
 * hold (5 W/kg, 450 W) so a noisy GPS grade can't invent a monster effort.
 */
export const cyclingKcalPerSecond = (speedMps: number, gradePercent: number, riderKg: number): number => {
  if (!(riderKg > 0)) return 0;
  const resting = riderKg / 3600; // 1 MET ≈ 1 kcal per kg per hour
  if (speedMps < 1) return resting;
  if (speedMps > COASTING_SPEED) return resting * 1.5; // braced on a fast descent
  const g = Math.max(-0.15, Math.min(0.15, (gradePercent || 0) / 100));
  const mass = riderKg + 10;
  const rolling = 9.81 * mass * 0.006 * speedMps;
  const climbing = 9.81 * mass * g * speedMps;
  const drag = 0.5 * 1.225 * 0.5 * speedMps ** 3;
  const power = Math.max(0, Math.min(Math.min(5 * riderKg, 450), rolling + climbing + drag));
  return (power / CYCLING_EFFICIENCY) * KCAL_PER_JOULE + resting;
};

/**
 * Walking, kcal per second, from the ACSM metabolic equations:
 *   walking  VO2 = 3.5 + 0.1·v + 1.8·v·grade   (v in m/min, up to ~5 mph)
 *   running  VO2 = 3.5 + 0.2·v + 0.9·v·grade   (a walker breaking into a jog)
 * VO2 in mL/kg/min; 5 kcal per litre of oxygen. Downhill counts as flat:
 * the equations aren't valid for descents.
 */
export const walkingKcalPerSecond = (speedMps: number, gradePercent: number, kg: number): number => {
  if (!(kg > 0)) return 0;
  const v = speedMps * 60;
  const grade = Math.max(0, Math.min(0.25, (gradePercent || 0) / 100));
  let vo2 = 3.5;
  if (speedMps >= 0.3) vo2 = v > 134 ? 3.5 + 0.2 * v + 0.9 * v * grade : 3.5 + 0.1 * v + 1.8 * v * grade;
  return (vo2 * kg / 1000 * 5) / 60;
};
