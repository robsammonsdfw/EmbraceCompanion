// Copied from iStride (TempoRun services/tempoDetector.ts): finding a song's
// tempo from microphone samples, and turning a tempo into a step cadence.
// Keep identical to the web's.

const ANALYSIS_RATE = 11025;   // plenty for rhythm; keeps the FFT cheap
const FRAME = 1024;
const HOP = 128;               // ~86 onset frames a second
const MIN_BPM = 50;
const MAX_BPM = 210;
// Below this the periodicity is no stronger than room noise gives.
const LOW_CONFIDENCE = 0.2;

export interface TempoResult {
  bpm: number;
  /** 0–1: how strongly the sound repeats at this tempo. */
  confidence: number;
  /** True when the recording was too noisy or unclear to trust. */
  lowConfidence: boolean;
  /** Other plausible tempos (half/double time, or a competing rhythm). */
  alternates: number[];
}

/** Up to three other tempos worth offering, always including half or double. */
function pickAlternates(bpm: number, others: number[]): number[] {
  const out: number[] = [];
  const distinct = (b: number) => [bpm, ...out].every(x => Math.abs(x - b) / x > 0.04);
  const octave = [bpm * 2, bpm / 2].filter(b => b >= 50 && b <= 220);
  for (const b of [...octave.slice(0, 1), ...others, ...octave.slice(1)]) {
    if (out.length >= 3) break;
    if (b >= 40 && b <= 240 && distinct(b)) out.push(b);
  }
  return out.map(b => Math.round(b));
}

function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

function downsample(samples: Float32Array, rate: number) {
  const factor = Math.max(1, Math.round(rate / ANALYSIS_RATE));
  if (factor === 1) return { data: samples, rate };
  const out = new Float32Array(Math.floor(samples.length / factor));
  for (let i = 0; i < out.length; i++) {
    let s = 0;
    for (let k = 0; k < factor; k++) s += samples[i * factor + k];
    out[i] = s / factor;
  }
  return { data: out, rate: rate / factor };
}

/** Onset strength: log-magnitude spectral flux, local mean removed. */
export function onsetEnvelope(samples: Float32Array, sampleRate: number) {
  const { data, rate } = downsample(samples, sampleRate);
  const frames = Math.floor((data.length - FRAME) / HOP);
  if (frames < 250) return null;
  const win = new Float64Array(FRAME);
  for (let i = 0; i < FRAME; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1));
  const bins = FRAME / 2;
  let prev = new Float64Array(bins);
  const raw = new Float64Array(frames);
  const re = new Float64Array(FRAME), im = new Float64Array(FRAME);
  for (let f = 0; f < frames; f++) {
    const off = f * HOP;
    for (let i = 0; i < FRAME; i++) { re[i] = data[off + i] * win[i]; im[i] = 0; }
    fft(re, im);
    const cur = new Float64Array(bins);
    let flux = 0;
    for (let b = 1; b < bins; b++) {
      cur[b] = Math.log1p(1000 * Math.hypot(re[b], im[b]));
      const d = cur[b] - prev[b];
      if (d > 0) flux += d;
    }
    raw[f] = f === 0 ? 0 : flux;
    prev = cur;
  }
  const fps = rate / HOP;
  // light smoothing
  const sm = new Float64Array(frames);
  const w = 3;
  for (let f = 0; f < frames; f++) {
    let s = 0, c = 0;
    for (let k = -w; k <= w; k++) { const j = f + k; if (j >= 0 && j < frames) { const g = 1 - Math.abs(k) / (w + 1); s += raw[j] * g; c += g; } }
    sm[f] = s / c;
  }
  const half = Math.round(fps * 0.3);
  const env = new Float64Array(frames);
  let sum = 0, count = 0;
  for (let f = 0; f < Math.min(frames, half); f++) { sum += sm[f]; count++; }
  for (let f = 0; f < frames; f++) {
    const add = f + half, drop = f - half - 1;
    if (add < frames) { sum += sm[add]; count++; }
    if (drop >= 0) { sum -= sm[drop]; count--; }
    env[f] = Math.max(0, sm[f] - sum / count);
  }
  return { env, fps };
}


export function detectTempo(samples: Float32Array, sampleRate: number): TempoResult | null {
  const o = onsetEnvelope(samples, sampleRate);
  if (!o) return null;
  const { env, fps } = o;
  const n = env.length;
  let mean = 0;
  for (let f = 0; f < n; f++) mean += env[f];
  mean /= n;
  const c = new Float64Array(n);
  let energy = 0;
  for (let f = 0; f < n; f++) { c[f] = env[f] - mean; energy += c[f] * c[f]; }
  if (energy <= 1e-9) return null;

  const minLag = Math.floor((60 / MAX_BPM) * fps);
  const maxLag = Math.ceil((60 / MIN_BPM) * fps);
  const top = Math.min(n - 2, 4 * maxLag + 2);
  const ac = new Float64Array(top + 1);
  for (let lag = 0; lag <= top; lag++) {
    let s = 0;
    for (let f = lag; f < n; f++) s += c[f] * c[f - lag];
    ac[lag] = s / (n - lag);
  }
  const acAt = (x: number) => {
    if (x >= top) return 0;
    const i = Math.floor(x), t = x - i;
    return ac[i] * (1 - t) + ac[i + 1] * t;
  };
  // Harmonic enhancement: a real beat period also repeats at 2× and 4×.
  const eac = new Float64Array(maxLag + 2);
  for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
    eac[lag] = acAt(lag) + 0.5 * acAt(2 * lag) + 0.5 * acAt(4 * lag);
  }
  // Candidate periods = the strongest peaks.
  const peaks: { lag: number; v: number }[] = [];
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (eac[lag] > eac[lag - 1] && eac[lag] >= eac[lag + 1] && eac[lag] > 0) {
      const y0 = eac[lag - 1], y1 = eac[lag], y2 = eac[lag + 1];
      const d = y0 - 2 * y1 + y2;
      const sh = d !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / d)) : 0;
      peaks.push({ lag: lag + sh, v: y1 });
    }
  }
  if (!peaks.length) return null;
  peaks.sort((a, b) => b.v - a.v);
  const cands = peaks.slice(0, 10);

  // Score each candidate by how well an evenly spaced pulse train lines up
  // with the actual onsets, at its best phase.
  const val = (x: number) => {
    const i = Math.floor(x), t = x - i;
    if (i + 1 >= n) return 0;
    return env[i] * (1 - t) + env[i + 1] * t;
  };
  const scored = cands.map(({ lag, v }) => {
    const phases = Math.max(1, Math.round(lag));
    let best = -Infinity, sumS = 0, sumS2 = 0;
    for (let p = 0; p < phases; p++) {
      let s = 0, k = 0;
      for (let x = p; x + lag < n; x += lag, k++) {
        s += val(x) + 0.25 * val(x + lag / 2);
      }
      s /= Math.max(1, k);
      sumS += s; sumS2 += s * s;
      if (s > best) best = s;
    }
    const m = sumS / phases;
    const varr = Math.max(0, sumS2 / phases - m * m);
    const bpm = (60 * fps) / lag;
    const pulse = best + Math.sqrt(varr);
    return { lag, bpm, v, pulse, peakiness: best > 0 ? (best - m) / best : 0 };
  });
  const maxPulse = Math.max(...scored.map(s => s.pulse));
  const maxV = Math.max(...scored.map(s => s.v));
  // People tend to hear tempos near 120; this mainly settles half vs double.
  const prior = (bpm: number) => Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.6) ** 2);
  for (const s of scored as any[]) s.score = (s.pulse / maxPulse) * (s.v / maxV) ** 0.5 * prior(s.bpm);
  scored.sort((a: any, b: any) => b.score - a.score);
  const win = scored[0] as any;
  // How strongly the onsets repeat at the chosen period (normalised
  // autocorrelation, including its 2× echo). Noise doesn't repeat.
  const ac0 = energy / n;
  const normAc = (Math.max(0, acAt(win.lag)) + Math.max(0, acAt(2 * win.lag))) / (2 * ac0);
  const confidence = Math.max(0, Math.min(1, normAc));
  return {
    bpm: Math.round(win.bpm * 10) / 10,
    confidence,
    lowConfidence: confidence < LOW_CONFIDENCE,
    alternates: pickAlternates(win.bpm, scored.slice(1).map(s => s.bpm)),
  };
}

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
