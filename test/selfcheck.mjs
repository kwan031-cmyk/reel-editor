// Self-check: runs the same command the app builds, with native ffmpeg, on real clips,
// and checks the analysis helpers on made-up data.
// Usage: node test/selfcheck.mjs  (needs ffmpeg/ffprobe on PATH and F:\cks\bike_raw clips)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { buildArgs, TRANS_SEC } from '../build.js';
import { envelope, findSpikes, motion, scores, pickHighlights, candidates, STEP } from '../analyze.js';

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
  { path: `${RAW}/KakaoTalk_20261109_124918431.mp4`, start: 1, dur: 1.5, hasAudio: true, textPath: 't.png', dips: [{ t0: 0.2, t1: 0.6, gain: 0.2 }] }, // 406x720 h264
  { path: `${RAW}/KakaoTalk_20261109_124933061.mp4`, start: 2, dur: 2, hasAudio: false },  // hevc, forced silence path
  { path: `${RAW}/KakaoTalk_20261109_124918431.mp4`, start: 5, dur: 1, hasAudio: true },
];
const cases = [
  { name: 'orig+music cover cuts', keepOrig: true, music: { path: 'm.m4a' }, fit: 'cover', trans: ['cut', 'cut'] },
  { name: 'music only contain', keepOrig: false, music: { path: 'm.m4a', vol: 0.35 }, fit: 'contain', trans: ['cut', 'cut'] },
  { name: 'no audio', keepOrig: false, music: null, fit: 'cover', trans: ['cut', 'cut'] },
  { name: 'transitions mixed', keepOrig: true, music: { path: 'm.m4a' }, fit: 'cover', trans: ['zoomin', 'cut'] },
  { name: 'transitions all', keepOrig: true, music: null, fit: 'cover', trans: ['fadewhite', 'slideleft'] },
];
for (const c of cases) {
  const clips = base.map((b, i) => ({ ...b, trans: c.trans[i] }));
  const out = c.name.replace(/\W+/g, '_') + '.mp4';
  const { args, total } = buildArgs({ clips, music: c.music, keepOrig: c.keepOrig, fit: c.fit, W: 360, H: 640, out });
  const expected = 4.5 - c.trans.filter((t) => t !== 'cut').length * TRANS_SEC;
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
console.log('all passed');
