// Copied from iStride (TempoRun components/HeartRateCapture.tsx): the camera
// pulse check's maths. A fingertip over the lens is lit by the torch; blood
// volume rises and falls with each beat, changing how much red light comes
// back. The dominant rhythm in the human range is the pulse. Keep identical
// to the web's. At rest only: motion swamps the signal.

export const MEASURE_SECONDS = 25;
export const MIN_GOOD_SECONDS = 12; // usable data needed before a number is reported
const MIN_BPM = 40;
const MAX_BPM = 180;

/** Resample irregular frame timestamps onto a uniform grid. */
export const resample = (t: number[], v: number[], hz: number): number[] => {
  if (t.length < 2) return [];
  const start = t[0], end = t[t.length - 1];
  const n = Math.floor(((end - start) / 1000) * hz);
  const out: number[] = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const target = start + (i / hz) * 1000;
    while (j < t.length - 2 && t[j + 1] < target) j++;
    const span = t[j + 1] - t[j] || 1;
    const frac = Math.min(1, Math.max(0, (target - t[j]) / span));
    out.push(v[j] + (v[j + 1] - v[j]) * frac);
  }
  return out;
};

/** Remove slow drift (breathing, finger pressure) with a moving average. */
export const detrend = (x: number[], win: number): number[] => {
  const out: number[] = [];
  for (let i = 0; i < x.length; i++) {
    const a = Math.max(0, i - win), b = Math.min(x.length - 1, i + win);
    let sum = 0;
    for (let k = a; k <= b; k++) sum += x[k];
    out.push(x[i] - sum / (b - a + 1));
  }
  return out;
};

/**
 * Autocorrelation peak inside the plausible pulse band.
 * Returns bpm plus a confidence derived from peak sharpness.
 */
export const estimateBpm = (signal: number[], hz: number): { bpm: number; confidence: number } | null => {
  const n = signal.length;
  if (n < hz * 4) return null;

  const mean = signal.reduce((a, b) => a + b, 0) / n;
  const x = signal.map(v => v - mean);
  const energy = x.reduce((a, b) => a + b * b, 0);
  if (energy <= 0) return null;

  const minLag = Math.floor((60 / MAX_BPM) * hz);
  const maxLag = Math.ceil((60 / MIN_BPM) * hz);

  let bestLag = -1, bestVal = -Infinity;
  const corr: number[] = [];
  for (let lag = minLag; lag <= maxLag && lag < n; lag++) {
    let sum = 0;
    for (let i = 0; i + lag < n; i++) sum += x[i] * x[i + lag];
    const norm = sum / energy;
    corr.push(norm);
    if (norm > bestVal) { bestVal = norm; bestLag = lag; }
  }
  if (bestLag < 0 || bestVal <= 0) return null;

  // Parabolic interpolation around the peak for sub-sample accuracy
  const i = bestLag - minLag;
  const y0 = corr[i - 1] ?? bestVal, y1 = bestVal, y2 = corr[i + 1] ?? bestVal;
  const denom = y0 - 2 * y1 + y2;
  const shift = denom !== 0 ? (0.5 * (y0 - y2)) / denom : 0;
  const lag = bestLag + Math.max(-1, Math.min(1, shift));

  const bpm = (60 * hz) / lag;
  if (bpm < MIN_BPM || bpm > MAX_BPM) return null;

  // Confidence combines two things, because either alone is fooled:
  //   strength   - how periodic the signal is at all. Random noise still has
  //                a "best" lag, but its correlation is weak.
  //   prominence - how much that lag stands above the rest of the band.
  // Noise scores high on prominence and low on strength, so the product is
  // what separates a real pulse from a confident-looking accident.
  const others   = corr.filter((_, k) => Math.abs(k - i) > 2);
  const avgOther = others.length ? others.reduce((a, b) => a + b, 0) / others.length : 0;
  const strength   = Math.max(0, Math.min(1, bestVal));
  const prominence = Math.max(0, Math.min(1, (bestVal - avgOther) / (Math.abs(bestVal) + 1e-6)));

  // Below this the waveform simply is not periodic enough to call a pulse.
  if (strength < 0.15) return null;

  return { bpm: Math.round(bpm), confidence: strength * prominence };
};

/** A covered lens is dominated by red and fairly bright. */
export const lensCovered = (r: number, g: number, b: number) => r > 60 && r > g * 1.6 && r > b * 1.6;

/**
 * The reading from a finished check: the longest stretch with the lens
 * covered, resampled to 30 a second, drift removed, then the pulse found.
 * Null when there wasn't 12 seconds of steady signal or no clear pulse.
 */
export const pulseFrom = (times: number[], reds: number[], covered: boolean[]): { bpm: number; confidence: number } | null => {
  let bestA = 0, bestB = -1, a = 0;
  for (let i = 0; i <= covered.length; i++) {
    if (i === covered.length || !covered[i]) {
      if (i - a > bestB - bestA) { bestA = a; bestB = i; }
      a = i + 1;
    }
  }
  const t = times.slice(bestA, bestB), v = reds.slice(bestA, bestB);
  const spanSec = t.length > 1 ? (t[t.length - 1] - t[0]) / 1000 : 0;
  if (spanSec < MIN_GOOD_SECONDS) return null;
  const HZ = 30;
  return estimateBpm(detrend(resample(t, v, HZ), Math.round(HZ * 0.75)), HZ);
};
