// Copied from iStride (TempoRun services/tempoDetector.ts): turning a song's
// tempo into a step cadence. Keep identical to the web's.

/**
 * 1 step per beat, 2 (a slow song), or ½ (a very fast one). Nobody runs
 * above ~200 steps a minute, so doubling never goes past that.
 */
export function stepsPerBeatFor(bpm: number, referenceSpm = 165): number {
  const ref = referenceSpm > 60 ? referenceSpm : 165;
  const options = [0.5, 1, 2].filter(m => bpm * m >= 60 && bpm * m <= 200);
  if (options.length === 0) return 1;
  return options.reduce((a, b) => (Math.abs(b * bpm - ref) < Math.abs(a * bpm - ref) ? b : a));
}

/** BPM from tap times (ms). Median interval, so one late tap doesn't skew it. */
export function bpmFromTaps(times: number[]): number | null {
  if (times.length < 6) return null;
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1]);
  const sorted = [...gaps].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const steady = gaps.filter(g => Math.abs(g - median) < median * 0.25);
  if (steady.length < 3) return null;
  const avg = steady.reduce((a, b) => a + b, 0) / steady.length;
  const bpm = 60000 / avg;
  return bpm >= 40 && bpm <= 240 ? Math.round(bpm) : null;
}
