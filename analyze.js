// Pure analysis helpers (no DOM) so node can check them: loudness, sudden loud spots, motion, highlights.
export const STEP = 0.25; // seconds per analysis window (video is sampled at 1/STEP fps)

// mono float samples -> per-window { rms, peak }
export function envelope(samples, rate, step = STEP) {
  const win = Math.max(1, Math.round(rate * step)), out = [];
  for (let i = 0; i + win <= samples.length; i += win) {
    let s = 0, p = 0;
    for (let j = i; j < i + win; j++) { const x = samples[j]; s += x * x; if (Math.abs(x) > p) p = Math.abs(x); }
    out.push({ rms: Math.sqrt(s / win), peak: p });
  }
  return out;
}

// Spots that jump far above the clip's usual level (~+12 dB), or that hit full scale while being
// clearly louder than usual (+6 dB) — constantly loud footage (wind, engine) is not "jumping".
// gain brings the spot back to about 1.5x the usual level.
export function findSpikes(env, step = STEP) {
  if (!env.length) return [];
  const sorted = env.map((e) => e.rms).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const thr = Math.max(median * 4, 0.05);
  const spots = [];
  env.forEach((e, i) => {
    if (e.rms <= thr && !(e.peak >= 0.98 && e.rms > median * 2)) return;
    const last = spots[spots.length - 1];
    if (last && i - last.i1 <= 2) { last.i1 = i; last.max = Math.max(last.max, e.rms); }
    else spots.push({ i0: i, i1: i, max: e.rms });
  });
  return spots.map((s) => ({
    t0: Math.max(0, s.i0 * step - 0.1),
    t1: (s.i1 + 1) * step + 0.1,
    gain: +Math.min(1, Math.max(0.1, (Math.max(median, 0.01) * 1.5) / s.max)).toFixed(2),
  }));
}

// gray frames (size bytes each) -> per-frame change 0..1 versus the previous frame
export function motion(frames, size) {
  const n = Math.floor(frames.length / size), out = [0];
  for (let f = 1; f < n; f++) {
    let d = 0;
    for (let k = 0; k < size; k++) d += Math.abs(frames[f * size + k] - frames[(f - 1) * size + k]);
    out.push(d / size / 255);
  }
  return out;
}

// per-window score: mostly movement, some loudness; both scaled against the top values of all clips
export function scores(list) {
  const top = (arr) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length * 0.95)] || 1e-6; };
  const mTop = top(list.flatMap((x) => x.motion)), rTop = top(list.flatMap((x) => x.env.map((e) => e.rms)));
  return list.map((x) => {
    const n = Math.max(x.motion.length, x.env.length);
    return Array.from({ length: n }, (_, i) =>
      0.65 * Math.min(1, (x.motion[i] || 0) / mTop) + 0.35 * Math.min(1, (x.env[i]?.rms || 0) / rTop));
  });
}

// length of one highlight piece for a target total over n clips
export const segLenFor = (target, n) => Math.min(5, Math.max(2, target / n));

// items: [{ dur, score[] }]. Best non-overlapping segments of each clip (up to perClip each),
// best first: [{ i, start, end, v }]
export function candidates(items, segLen, perClip = Infinity, step = STEP) {
  const out = [];
  items.forEach((it, i) => {
    const len = Math.min(segLen, it.dur), w = Math.max(1, Math.round(len / step)), all = [];
    for (let s = 0; s * step + len <= it.dur + 1e-6; s++) {
      let sum = 0;
      for (let k = s; k < s + w; k++) sum += it.score[k] || 0;
      all.push({ i, start: s * step, end: s * step + len, v: sum / w });
    }
    all.sort((a, b) => b.v - a.v);
    const mine = [];
    for (const c of all) {
      if (mine.length >= perClip) break;
      if (!mine.some((p) => c.start < p.end + 0.5 && p.start < c.end + 0.5)) mine.push(c);
    }
    out.push(...mine);
  });
  return out.sort((a, b) => b.v - a.v);
}

// Picks the best candidates until about `target` seconds, in timeline order.
export function pickHighlights(items, target, step = STEP) {
  const picked = [];
  let total = 0;
  for (const c of candidates(items, segLenFor(target, items.length), Infinity, step)) {
    if (total >= target - 0.5) break;
    picked.push(c);
    total += c.end - c.start;
  }
  return picked.sort((a, b) => a.i - b.i || a.start - b.start).map(({ i, start, end }) => ({ i, start, end }));
}
