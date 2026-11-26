import { setRange } from './clips.js';
import { stopSeq } from './preview.js';
import { MIN, st } from './state.js';
import { STEP, envelope, findSpikes, light, motion } from '../analyze.js';
import { FFmpeg } from '../vendor/ffmpeg/index.js';

/* ---------- engine (ffmpeg.wasm, runs inside the browser) ---------- */
let enginePromise = null;
export const logs = [];
export function engine(say = () => {}) {
  if (!enginePromise) { const p = enginePromise = (async () => {
    const ff = new FFmpeg();
    ff.on('log', ({ message }) => { logs.push(message); if (logs.length > 300) logs.shift(); st.onLog?.(message); });
    const base = new URL('vendor/core/', location.href).href;
    // own download with progress: ffmpeg's toBlobURL breaks when the host gzips the file
    // (Content-Length is the compressed size, so it reports an "incomplete" download) — e.g. GitHub Pages
    const res = await fetch(base + 'ffmpeg-core.wasm');
    if (!res.ok) throw new Error(`engine download failed: ${res.status}`);
    const reader = res.body.getReader(), chunks = [];
    for (let got = 0; ;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      got += value.length;
      say(`편집 엔진 내려받는 중… ${(got / 1048576).toFixed(0)} / 31 MB (처음 한 번만)`);
    }
    const wasmURL = URL.createObjectURL(new Blob(chunks, { type: 'application/wasm' }));
    say('편집 엔진 켜는 중…');
    try { await ff.load({ coreURL: base + 'ffmpeg-core.js', wasmURL }); } finally { URL.revokeObjectURL(wasmURL); } // loaded (or failed): the 31 MB copy is no longer needed
    if (enginePromise !== p) { ff.terminate(); throw new Error('cancelled'); } // 취소 pressed while it was loading
    return ff;
  })().catch((e) => { if (enginePromise === p) enginePromise = null; throw e; }); }
  return enginePromise;
}
export function resetEngine() { enginePromise?.then((ff) => ff.terminate()).catch(() => {}); enginePromise = null; }

export const ext = (name) => (name.match(/\.[a-z0-9]+$/i) || ['.mp4'])[0].toLowerCase();
export const secOf = (m) => { const t = m.match(/time=(\d+):(\d+):([\d.]+)/); return t ? +t[1] * 3600 + +t[2] * 60 + +t[3] : null; };

// Reads duration / audio presence from ffmpeg's own log (works even when the browser can't preview the file).
export async function probe(ff, path) {
  const from = logs.length;
  await ff.exec(['-hide_banner', '-i', path]); // exits non-zero by design (no output), only logs matter
  const text = logs.slice(from).join('\n');
  const m = text.match(/Duration: (\d+):(\d+):([\d.]+)/);
  return { dur: m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0, hasAudio: /Stream #\d+:\d+.*Audio:/.test(text) };
}

// Picture length of a file: phone videos often have sound that runs past the picture,
// and the file's own length is the longer of the two. Copying (no decoding) to nowhere reports the last picture time.
export async function videoLen(ff, path) {
  const from = logs.length;
  await ff.exec(['-hide_banner', '-i', path, '-map', '0:v:0', '-c', 'copy', '-f', 'null', '-']);
  const ts = logs.slice(from).map(secOf).filter((t) => t != null);
  return ts.length ? ts[ts.length - 1] : 0;
}
// A clip never reaches past its picture: shrink its length and pull the chosen end back if needed.
export function fitPicture(c, vdur) {
  if (!(vdur > MIN) || vdur >= c.dur - 0.05) return;
  c.dur = +vdur.toFixed(2);
  c.el.querySelectorAll('.s, .e, .sn, .en').forEach((x) => (x.max = c.dur.toFixed(1)));
  setRange(c, c.start, c.end);
}

export async function withMount(files, fn) {
  const ff = await engine();
  const dir = `/in${++st.seq}`;
  await ff.createDir(dir);
  await ff.mount('WORKERFS', { files }, dir);
  try { return await fn(ff, dir); } finally { await ff.unmount(dir).catch(() => {}); await ff.deleteDir(dir).catch(() => {}); }
}

export function lock(on) {
  st.busy = on;
  if (on) { stopSeq(); cancelled = false; }
  document.querySelectorAll('button, input, textarea, select').forEach((x) => (x.disabled = on));
  document.querySelectorAll('.stopJob').forEach((b) => { b.hidden = !on; b.disabled = false; }); // the one button that works while busy
}
// 취소: stopping the engine makes the running job fail at once; `cancelled` tells its error handler it was on purpose
export let cancelled = false;
document.querySelectorAll('.stopJob').forEach((b) => b.addEventListener('click', () => { if (st.busy && !cancelled) { cancelled = true; resetEngine(); } }));

/* ---------- look through a clip once: loudness per moment + movement per moment ---------- */
export async function analyze(c, say = () => {}) {
  if (c.ana) return c.ana;
  const name = 'p' + ext(c.file.name);
  c.ana = await withMount([new File([c.file], name)], async (ff, dir) => {
    const path = `${dir}/${name}`;
    const { dur, hasAudio } = await probe(ff, path);
    const args = ['-hide_banner', '-i', path, '-map', '0:v:0', '-vf', `fps=${1 / STEP},scale=32:56,format=gray`, '-f', 'rawvideo', '-y', 'ana_v.raw'];
    if (hasAudio) args.push('-map', '0:a:0', '-ac', '1', '-ar', '16000', '-f', 'f32le', '-y', 'ana_a.raw');
    st.onLog = (m) => { const t = secOf(m); if (t != null && dur) say(Math.min(1, t / dur)); };
    try { await ff.exec(args); } finally { st.onLog = null; }
    const v = await ff.readFile('ana_v.raw');
    const a = hasAudio ? await ff.readFile('ana_a.raw') : new Uint8Array(0);
    await ff.deleteFile('ana_v.raw').catch(() => {});
    if (hasAudio) await ff.deleteFile('ana_a.raw').catch(() => {});
    const env = envelope(new Float32Array(a.buffer, a.byteOffset, a.byteLength >> 2), 16000);
    const mo = motion(v, 32 * 56, 32);
    return { dur: dur || c.dur, vdur: mo.length * STEP, hasAudio, env, spikes: findSpikes(env), motion: mo, light: light(v, 32 * 56) };
  });
  return c.ana;
}
