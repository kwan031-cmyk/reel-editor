// Self-check: runs the same command the app builds, with native ffmpeg, on real clips,
// and checks the analysis helpers on made-up data.
// Usage: node test/selfcheck.mjs  (needs ffmpeg/ffprobe on PATH and F:\cks\bike_raw clips)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { buildArgs, TRANS_SEC, FX, fxAt } from '../build.js';
import { envelope, findSpikes, motion, light, scores, pickHighlights, candidates, STEP } from '../analyze.js';

/* ---- analysis helpers ---- */
{
  const rate = 1000, quiet = 0.02;
  const s = new Float32Array(rate * 10).map((_, i) => (i % 2 ? quiet : -quiet));
  for (let i = 4 * rate; i < 4.5 * rate; i++) s[i] = i % 2 ? 0.9 : -0.9; // loud bang at 4.0-4.5s
  const env = envelope(s, rate);
  assert.equal(env.length, 10 / STEP);
  const sp = findSpikes(env);
  assert.equal(sp.length, 1, 'one spike');
  assert.ok(sp[0].t0 <= 4 && sp[0].t1 >= 4.5 && sp[0].t1 < 5, `spike range ${sp[0].t0}-${sp[0].t1}`);
  assert.ok(sp[0].gain < 0.2, 'spike gets turned down');
  assert.equal(findSpikes(envelope(new Float32Array(rate * 5).fill(0.1), rate)).length, 0, 'steady sound has no spikes');

  const size = 4, frames = new Uint8Array(size * 8); // frame 5 changes completely
  frames.fill(255, 5 * size, 6 * size);
  const m = motion(frames, size);
  assert.equal(m.length, 8);
  assert.equal(m[5], 1); assert.equal(m[3], 0);

  // clip 0 is boring, clip 1 has action at 6-9s -> highlights come from there
  const mk = (dur, hot) => ({ motion: Array.from({ length: dur / STEP }, (_, i) => (hot(i * STEP) ? 0.5 : 0.01)),
    env: Array.from({ length: dur / STEP }, () => ({ rms: 0.1, peak: 0.2 })) });
  const a = [mk(10, () => false), mk(12, (t) => t >= 6 && t < 9)];
  const sc = scores(a);
  const h = pickHighlights([{ dur: 10, score: sc[0] }, { dur: 12, score: sc[1] }], 6);
  assert.ok(h.some((x) => x.i === 1 && x.start >= 5 && x.start <= 6.5), JSON.stringify(h));
  const one = pickHighlights([{ dur: 10, score: sc[0] }, { dur: 12, score: sc[1] }], 2);
  assert.ok(one.length === 1 && one[0].i === 1 && one[0].start >= 5.5 && one[0].start <= 6.5, JSON.stringify(one));
  const totalPicked = h.reduce((s2, x) => s2 + x.end - x.start, 0);
  assert.ok(totalPicked >= 5 && totalPicked <= 8, `picked ${totalPicked}s`);
  // one 60s video with action at 10s, 30s and 50s -> several separate, non-overlapping candidates, best first
  const long = mk(60, (t) => [10, 30, 50].some((x) => t >= x && t < x + 3));
  const cs = candidates([{ dur: 60, score: scores([long])[0] }], 3, 5);
  assert.equal(cs.length, 5, 'five candidates from one video');
  const top3 = cs.slice(0, 3).map((x) => x.start).sort((p, q) => p - q);
  assert.deepEqual(top3, [10, 30, 50], JSON.stringify(cs));
  for (const x of cs) for (const y of cs) if (x !== y) assert.ok(x.end + 0.5 <= y.start || y.end + 0.5 <= x.start, 'no overlap');

  // camera sliding over a still textured scene counts much less than a square moving in a still scene
  const W = 32, H = 56, tex = (x, y) => ((x * 37 + y * 91) % 256);
  const pan = new Uint8Array(W * H * 2), obj = new Uint8Array(W * H * 2);
  for (let f = 0; f < 2; f++) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    pan[f * W * H + y * W + x] = tex(x + f, y);
    obj[f * W * H + y * W + x] = (x >= 8 + f * 10 && x < 16 + f * 10 && y >= 20 && y < 30) ? 255 : 0;
  }
  const mp = motion(pan, W * H, W)[1], mo = motion(obj, W * H, W)[1];
  assert.ok(mp < 0.01 && mo > 0.05, `pan ${mp} vs object ${mo}`);

  // light: black and flat frames are spotted
  const lt = light(new Uint8Array([0, 0, 0, 0, 200, 200, 200, 200, 0, 255, 0, 255]), 4);
  assert.ok(lt[0].mean < 0.01 && lt[1].std < 0.01 && lt[2].std > 0.4, JSON.stringify(lt));

  // a bang over quiet beats steady loud noise; both clips have the same small movement
  const flat = (dur, rms, bang) => ({ motion: Array(dur / STEP).fill(0.02),
    env: Array.from({ length: dur / STEP }, (_, i) => ({ rms: bang && i * STEP >= 5 && i * STEP < 7 ? 0.5 : rms, peak: 0.6 })) });
  const sn = scores([flat(10, 0.4, false), flat(10, 0.02, true)]);
  const hn = pickHighlights([{ dur: 10, score: sn[0] }, { dur: 10, score: sn[1] }], 2);
  assert.ok(hn.length === 1 && hn[0].i === 1 && hn[0].start >= 4 && hn[0].start <= 6, `bang wins ${JSON.stringify(hn)}`);

  // a dark stretch is passed over even when it moves as much
  const dk = { ...mk(10, (t) => (t >= 1 && t < 3) || (t >= 6 && t < 8)),
    light: Array.from({ length: 40 }, (_, i) => ({ mean: i * STEP < 4 ? 0.02 : 0.5, std: 0.2 })) };
  const hd = pickHighlights([{ dur: 10, score: scores([dk])[0] }], 2);
  assert.ok(hd[0].start >= 5, `dark skipped ${JSON.stringify(hd)}`);

  // a one-frame jump (a cut inside the video) is not action
  const cut = mk(10, (t) => t >= 7 && t < 9);
  cut.motion[10] = 1; // 2.5s: one big jump
  const hc = pickHighlights([{ dur: 10, score: scores([cut])[0] }], 2);
  assert.ok(hc[0].start >= 6, `cut ignored ${JSON.stringify(hc)}`);

  // two good videos, room for two scenes: one from each, even if video 0 has two better ones
  const two = [mk(20, (t) => (t >= 2 && t < 4) || (t >= 12 && t < 14)), mk(20, (t) => t >= 8 && t < 10)];
  two[1].motion = two[1].motion.map((m) => m * 0.8);
  const st2 = scores(two);
  const h2 = pickHighlights([{ dur: 20, score: st2[0] }, { dur: 20, score: st2[1] }], 4);
  assert.deepEqual(h2.map((x) => x.i), [0, 1], `one from each ${JSON.stringify(h2)}`);
  console.log('OK analysis helpers');
}

/* ---- real ffmpeg runs ---- */
const RAW = 'F:/cks/bike_raw';
const dir = mkdtempSync(join(tmpdir(), 'reelcheck-'));
const run = (cmd, args) => execFileSync(cmd, args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const probe = (file) => JSON.parse(run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]));

run('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=red@0.5:s=360x640,format=rgba', '-frames:v', '1', 't.png']);
run('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-t', '3', '-i', 'sine=f=440', 'm.m4a']);

const base = [
  { path: `${RAW}/KakaoTalk_20261109_124918431.mp4`, start: 1, dur: 1.5, hasAudio: true, dips: [{ t0: 0.2, t1: 0.6, gain: 0.2 }] }, // 406x720 h264
  { path: `${RAW}/KakaoTalk_20261109_124933061.mp4`, start: 2, dur: 2, hasAudio: false },  // hevc, forced silence path
  { path: `${RAW}/KakaoTalk_20261109_124918431.mp4`, start: 5, dur: 1, hasAudio: true },
];
const cases = [
  { name: 'orig+music cover cuts', keepOrig: true, music: { path: 'm.m4a' }, fit: 'cover', trans: ['cut', 'cut'] },
  { name: 'music only contain', keepOrig: false, music: { path: 'm.m4a', vol: 0.35 }, fit: 'contain', trans: ['cut', 'cut'] },
  { name: 'no audio', keepOrig: false, music: null, fit: 'cover', trans: ['cut', 'cut'] },
  { name: 'transitions mixed', keepOrig: true, music: { path: 'm.m4a' }, fit: 'cover', trans: ['zoomin', 'cut'] },
  { name: 'transitions all', keepOrig: true, music: null, fit: 'cover', trans: ['fadewhite', 'slideleft'] },
  { name: 'transitions new', keepOrig: true, music: null, fit: 'cover', trans: ['circleopen', 'squeezeh'] },
  { name: 'transitions new 2', keepOrig: true, music: null, fit: 'cover', trans: ['wipeleft', 'fadegrays'] },
  { name: 'transitions new 3', keepOrig: true, music: null, fit: 'cover', trans: ['slideup', 'circleclose'] },
  { name: 'transitions long', keepOrig: true, music: null, fit: 'cover', trans: ['fade', 'zoomin'], trSec: 0.7 },
];
for (const c of cases) {
  const clips = base.map((b, i) => ({ ...b, trans: c.trans[i] }));
  const out = c.name.replace(/\W+/g, '_') + '.mp4';
  const { args, total } = buildArgs({ clips, music: c.music, keepOrig: c.keepOrig, fit: c.fit, W: 360, H: 640, out, trSec: c.trSec });
  const expected = 4.5 - c.trans.reduce((s, t, i) => s + (t === 'cut' ? 0 : Math.min(c.trSec ?? TRANS_SEC, base[i].dur / 2, base[i + 1].dur / 2)), 0);
  assert.ok(Math.abs(total - expected) < 0.01, `${c.name}: total ${total}`);
  run('ffmpeg', args);
  assert.ok(existsSync(join(dir, out)), c.name);
  const p = probe(join(dir, out));
  const v = p.streams.find((s) => s.codec_type === 'video');
  assert.equal(`${v.width}x${v.height}`, '360x640', c.name);
  assert.equal(p.streams.some((s) => s.codec_type === 'audio'), c.keepOrig || !!c.music, c.name);
  assert.ok(Math.abs(Number(p.format.duration) - total) < 0.3, `${c.name}: duration ${p.format.duration} vs ${total}`);
  console.log('OK', c.name, p.format.duration);
}
// timed text: shows only inside its window (frame differs from the same render without it at 1.0s, matches at 2.6s)
{
  const clips = base.map((b) => ({ ...b, trans: 'cut' }));
  const mk = (out, overlays) => run('ffmpeg', buildArgs({ clips, overlays, music: null, keepOrig: false, fit: 'cover', W: 360, H: 640, out }).args);
  mk('plain.mp4', []);
  mk('timed.mp4', [{ path: 't.png', t0: 0.5, t1: 2 }, { path: 't.png', t0: 3.5, t1: 4 }]);
  const px = (file, t) => execFileSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { cwd: dir });
  const diff = (t) => { const a = px('plain.mp4', t), b = px('timed.mp4', t); return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]); };
  assert.ok(diff(1) > 30, `overlay visible at 1s (${diff(1)})`);
  assert.ok(diff(2.6) < 8, `overlay gone at 2.6s (${diff(2.6)})`);
  assert.ok(diff(3.7) > 30, `second overlay visible at 3.7s (${diff(3.7)})`);
  console.log('OK timed text');

  // text effects: a 120x60 box at (120,290) shown 0.5-3.5s; every effect renders, and where it is matches fxAt
  run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0xffff00:s=120x60,format=rgba', '-frames:v', '1', 'box.png']);
  const box = { path: 'box.png', t0: 0.5, t1: 3.5, x: 120, y: 290, w: 120, h: 60 };
  run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=black:s=360x640:r=30:d=4', 'black.mp4']);
  const black = [{ path: 'black.mp4', start: 0, dur: 4, hasAudio: false }];
  const solid = (out, fx) => run('ffmpeg', buildArgs({ clips: black, overlays: [{ ...box, fx }], music: null, keepOrig: false, fit: 'cover', W: 360, H: 640, out }).args);
  // share of yellow pixels in a row band / column band around where fxAt says the box is
  const frame = (file, t) => execFileSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { cwd: dir });
  const yellowAt = (buf, x, y) => buf[Math.round(y) * 360 + Math.round(x)] > 150;
  for (const fx of Object.keys(FX)) {
    solid(`fx_${fx}.mp4`, fx);
    for (const T of [0.05, 0.2, 0.6, 1.3]) {
      const f = fxAt(fx, T, 3), img = frame(`fx_${fx}.mp4`, 0.5 + T + 0.017);
      const cx = 180 + f.dx * 360, cy = 320 + f.dy * 640;
      if (f.a > 0.9 && f.s > 0.5 && cx > 2 && cx < 358) assert.ok(yellowAt(img, cx, cy), `${fx} at T=${T}: box centre should be at ${cx.toFixed(0)},${cy.toFixed(0)}`);
      if (f.a === 0) assert.ok(!yellowAt(img, 180, 320), `${fx} at T=${T}: box should be hidden`);
    }
  }
  // pop: small at first, full size later
  const pop = (t) => { const img = frame('fx_pop.mp4', t); let n = 0; for (let x = 0; x < 360; x++) n += yellowAt(img, x, 320); return n; };
  assert.ok(pop(0.5 + 0.08) < pop(0.5 + 1), `pop grows ${pop(0.58)} -> ${pop(1.5)}`);
  console.log('OK text effects', Object.keys(FX).join(' '));
}
// a clip whose picture ends before its sound: the joined video still has picture for the whole length
{
  run('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=180x320:r=30:d=4', '-f', 'lavfi', '-i', 'sine=f=440:d=8', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', 'short.mp4']);
  const clips = [
    { path: 'short.mp4', start: 0, dur: 2, hasAudio: true, trans: 'fade' },
    { path: 'short.mp4', start: 3.5, dur: 3, hasAudio: true, trans: 'cut' }, // only 0.5 s of picture left
    { path: 'short.mp4', start: 1, dur: 2, hasAudio: true },
  ];
  const { args, total } = buildArgs({ clips, music: null, keepOrig: true, fit: 'cover', W: 180, H: 320, out: 'short_out.mp4' });
  run('ffmpeg', args);
  const v = probe(join(dir, 'short_out.mp4')).streams.find((s) => s.codec_type === 'video');
  assert.ok(Math.abs(Number(v.duration) - total) < 0.15, `picture ${v.duration}s vs ${total}s`);
  console.log('OK short picture', v.duration, total);
}
console.log('all passed');
