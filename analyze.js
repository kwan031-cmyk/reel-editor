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

// gray frames (size bytes each, w pixels wide) -> per-frame change 0..1 versus the previous frame.
// The previous frame is also tried shifted by up to SHIFT pixels and the smallest change is kept,
// so a hand-held camera sliding over a still scene counts far less than things moving in the scene.
const SHIFT = 2;
export function motion(frames, size, w = size) {
  const n = Math.floor(frames.length / size), h = size / w, out = [0];
  const r = Number.isInteger(h) && w > 2 * SHIFT && h > 2 * SHIFT ? SHIFT : 0;
  for (let f = 1; f < n; f++) {
    const a = f * size, b = (f - 1) * size;
    let best = Infinity;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      let d = 0, cnt = 0;
      for (let y = r; y < h - r; y++) for (let x = r; x < w - r; x++) {
        d += Math.abs(frames[a + y * w + x] - frames[b + (y + dy) * w + x + dx]); cnt++;
      }
      best = Math.min(best, d / cnt);
    }
    out.push(best / 255);
  }
  return out;
}

// gray frames -> per-frame { mean, std } brightness 0..1 (dark or flat pictures make poor highlights)
export function light(frames, size) {
  const n = Math.floor(frames.length / size), out = [];
  for (let f = 0; f < n; f++) {
    let s = 0, q = 0;
    for (let k = f * size; k < (f + 1) * size; k++) { s += frames[k]; q += frames[k] * frames[k]; }
    const mean = s / size;
    out.push({ mean: mean / 255, std: Math.sqrt(Math.max(0, q / size - mean * mean)) / 255 });
  }
  return out;
}

// Per-window score 0..1 for each clip, from { motion, env, light? }:
//  - movement in the scene (a single-frame jump, i.e. a cut or a flash, is not action)
//  - sound that rises above the clip's own background (steady wind or engine noise is not exciting), plus a little plain loudness
//  - lowered for dark or flat pictures and for the first/last half second (hand on the record button)
export function scores(list, step = STEP) {
  const top = (arr) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length * 0.95)] || 1e-6; };
  const med = (arr) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] || 0; };
  const mot = list.map((x) => x.motion.map((m, i, a) => {
    const p = a[i - 1] ?? 0, n = a[i + 1] ?? 0;
    return m > 0.25 && m > 3 * Math.max(p, n) ? Math.max(p, n) : m;
  }));
  const rise = list.map((x) => { const bg = med(x.env.map((e) => e.rms)); return x.env.map((e) => Math.max(0, e.rms - bg)); });
  const mTop = top(mot.flat()), rTop = top(list.flatMap((x) => x.env.map((e) => e.rms))), eTop = top(rise.flat());
  return list.map((x, c) => {
    const n = Math.max(x.motion.length, x.env.length);
    const raw = Array.from({ length: n }, (_, i) => {
      const m = Math.min(1, (mot[c][i] || 0) / mTop);
      const a = 0.7 * Math.min(1, (rise[c][i] || 0) / eTop) + 0.3 * Math.min(1, (x.env[i]?.rms || 0) / rTop);
      const l = x.light?.[i];
      let q = 1;
      if (l && l.mean < 0.08) q *= 0.2; // almost black
      else if (l && l.std < 0.03) q *= 0.5; // one flat colour (pocket, wall, sky)
      if (i * step < 0.5 || (n - i) * step <= 0.5) q *= 0.6;
      return (0.6 * m + 0.4 * a) * q;
    });
    return raw.map((v, i) => [raw[i - 1] ?? v, v, raw[i + 1] ?? v].sort((p, q) => p - q)[1]); // drop one-window blips
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
      let sum = 0, peak = 0;
      for (let k = s; k < s + w; k++) { sum += it.score[k] || 0; peak = Math.max(peak, it.score[k] || 0); }
      // mostly the average, partly the best moment: a short strong burst is not drowned by calm around it
      all.push({ i, start: s * step, end: s * step + len, v: 0.75 * (sum / w) + 0.25 * peak });
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
// Every clip whose best scene is reasonably good (>= 40% of the very best) gets one scene first,
// so one busy video does not push all the others out.
export function pickHighlights(items, target, step = STEP) {
  const all = candidates(items, segLenFor(target, items.length), Infinity, step);
  const best = all[0]?.v || 0;
  const firsts = items.map((_, i) => all.find((c) => c.i === i)).filter((c) => c && c.v >= best * 0.4).sort((a, b) => b.v - a.v);
  const picked = [];
  let total = 0;
  for (const c of [...firsts, ...all.filter((c) => !firsts.includes(c))]) {
    if (total >= target - 0.5) break;
    picked.push(c);
    total += c.end - c.start;
  }
  return picked.sort((a, b) => a.i - b.i || a.start - b.start).map(({ i, start, end }) => ({ i, start, end }));
}
