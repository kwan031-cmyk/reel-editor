import { FFmpeg } from './vendor/ffmpeg/index.js';
import { buildArgs, TRANS_SEC } from './build.js';
import { STEP, envelope, findSpikes, motion, scores, pickHighlights, candidates, segLenFor } from './analyze.js';

const $ = (s) => document.querySelector(s);
let clips = []; // { file, url, dur, start, end, text, trans, fix, ana, el }
const opt = { fit: 'cover', pos: 'bot', size: 'm', font: 'BHS', keepOrig: '1', q: '1080', music: null, vol: 70, hlLen: '15', ratio: '9:16', trSec: String(TRANS_SEC) };
// output size for a quality ('1080' / '720') in the chosen shape
const dims = (q) => { const [s, l] = q === '720' ? [720, 1280] : [1080, 1920]; return opt.ratio === '16:9' ? [l, s] : [s, l]; };
const MIN = 0.3; // shortest clip in seconds
// transitions: key = ffmpeg xfade name ('cut' = none)
const TRANS = {
  cut: { icon: '✂', name: '바로 넘기기 (컷)' },
  fade: { icon: '◐', name: '부드럽게 겹치기' },
  fadeblack: { icon: '●', name: '렌즈 가리기 (검은 화면)' },
  fadewhite: { icon: '✦', name: '하얀 번쩍' },
  zoomin: { icon: '◎', name: '빨려 들어가기 (줌)' },
  slideleft: { icon: '⇠', name: '옆으로 휙 밀기' },
  hblur: { icon: '≋', name: '흐려지며 넘기기' },
};
let seq = 0, outUrl = null, busy = false, backup = null;

/* ---------- engine (ffmpeg.wasm, runs inside the browser) ---------- */
let enginePromise = null;
const logs = [];
let onLog = null;
function engine(say = () => {}) {
  if (!enginePromise) enginePromise = (async () => {
    const ff = new FFmpeg();
    ff.on('log', ({ message }) => { logs.push(message); if (logs.length > 300) logs.shift(); onLog?.(message); });
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
    await ff.load({ coreURL: base + 'ffmpeg-core.js', wasmURL });
    return ff;
  })().catch((e) => { enginePromise = null; throw e; });
  return enginePromise;
}
function resetEngine() { enginePromise?.then((ff) => ff.terminate()).catch(() => {}); enginePromise = null; }

const ext = (name) => (name.match(/\.[a-z0-9]+$/i) || ['.mp4'])[0].toLowerCase();
const secOf = (m) => { const t = m.match(/time=(\d+):(\d+):([\d.]+)/); return t ? +t[1] * 3600 + +t[2] * 60 + +t[3] : null; };

// Reads duration / audio presence from ffmpeg's own log (works even when the browser can't preview the file).
async function probe(ff, path) {
  const from = logs.length;
  await ff.exec(['-hide_banner', '-i', path]); // exits non-zero by design (no output), only logs matter
  const text = logs.slice(from).join('\n');
  const m = text.match(/Duration: (\d+):(\d+):([\d.]+)/);
  return { dur: m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0, hasAudio: /Stream #\d+:\d+.*Audio:/.test(text) };
}

async function withMount(files, fn) {
  const ff = await engine();
  const dir = `/in${++seq}`;
  await ff.createDir(dir);
  await ff.mount('WORKERFS', { files }, dir);
  try { return await fn(ff, dir); } finally { await ff.unmount(dir).catch(() => {}); await ff.deleteDir(dir).catch(() => {}); }
}

function lock(on) {
  busy = on;
  if (on) stopSeq();
  document.querySelectorAll('button, input, textarea, select').forEach((x) => (x.disabled = on));
}

/* ---------- look through a clip once: loudness per moment + movement per moment ---------- */
async function analyze(c, say = () => {}) {
  if (c.ana) return c.ana;
  const name = 'p' + ext(c.file.name);
  c.ana = await withMount([new File([c.file], name)], async (ff, dir) => {
    const path = `${dir}/${name}`;
    const { dur, hasAudio } = await probe(ff, path);
    const args = ['-hide_banner', '-i', path, '-map', '0:v:0', '-vf', `fps=${1 / STEP},scale=32:56,format=gray`, '-f', 'rawvideo', '-y', 'ana_v.raw'];
    if (hasAudio) args.push('-map', '0:a:0', '-ac', '1', '-ar', '16000', '-f', 'f32le', '-y', 'ana_a.raw');
    onLog = (m) => { const t = secOf(m); if (t != null && dur) say(Math.min(1, t / dur)); };
    try { await ff.exec(args); } finally { onLog = null; }
    const v = await ff.readFile('ana_v.raw');
    const a = hasAudio ? await ff.readFile('ana_a.raw') : new Uint8Array(0);
    await ff.deleteFile('ana_v.raw').catch(() => {});
    if (hasAudio) await ff.deleteFile('ana_a.raw').catch(() => {});
    const env = envelope(new Float32Array(a.buffer, a.byteOffset, a.byteLength >> 2), 16000);
    return { dur: dur || c.dur, hasAudio, env, spikes: findSpikes(env), motion: motion(v, 32 * 56) };
  });
  return c.ana;
}

/* ---------- step 1: add clips ---------- */
$('#pick').addEventListener('change', (e) => { addFiles([...e.target.files]); e.target.value = ''; });

function newClip(file, extra = {}) {
  const c = { file, url: URL.createObjectURL(file), dur: 0, start: 0, end: 0, text: '', trans: 'cut', fix: true, ana: null, ...extra };
  c.tile = $('#tileTpl').content.firstElementChild.cloneNode(true);
  c.tile.querySelector('video').src = c.url;
  c.chip = Object.assign(document.createElement('button'), { type: 'button', className: 'chip' });
  c.el = makeCard(c);
  return c;
}
function dropClips(list, revoke) {
  list.forEach((c) => { c.el.remove(); c.tile.remove(); c.chip.remove(); if (revoke) URL.revokeObjectURL(c.url); });
}
function setTrans(c, t) {
  c.trans = t;
  c.el.querySelector('.trans').value = t;
  paintChip(c);
  renderTotal();
}
function paintChip(c) {
  const t = TRANS[c.trans];
  c.chip.textContent = t.icon;
  c.chip.classList.toggle('cut', c.trans === 'cut');
  c.chip.title = c.chip.ariaLabel = `트랜지션: ${t.name} (눌러서 바꾸기)`;
}
function addFiles(files) {
  let first = null;
  for (const file of files) {
    if (!/^video\//.test(file.type) && !/\.(mp4|mov|m4v|webm|mkv|3gp)$/i.test(file.name)) continue;
    const c = newClip(file);
    first ??= c;
    clips.push(c);
  }
  if (first) sel = first;
  // new files become part of the base list, so the highlight undo point no longer applies
  if (first && backup) { dropClips(backup.filter((b) => !clips.includes(b)), true); backup = null; $('#hlUndo').hidden = $('#hlSample').hidden = true; }
  renderList();
}

function makeCard(c) {
  const el = $('#clipTpl').content.firstElementChild.cloneNode(true);
  const q = (s) => el.querySelector(s);
  const v = q('video');
  v.src = c.url;
  c.el = el;
  const init = (dur) => {
    c.dur = dur;
    if (!c.end || c.end > dur) c.end = dur;
    q('.s').max = q('.e').max = q('.sn').max = q('.en').max = dur.toFixed(1);
    setRange(c, c.start, c.end);
  };
  if (c.dur) init(c.dur);
  q('.trans').innerHTML = Object.entries(TRANS).map(([k, t]) => `<option value="${k}">${t.icon} ${t.name}</option>`).join('');
  q('.trans').value = c.trans;
  v.addEventListener('loadedmetadata', () => { if (isFinite(v.duration) && v.duration > 0) init(v.duration); });
  v.addEventListener('error', async () => {
    q('.warn').hidden = false;
    q('.len').textContent = '길이 확인 중…';
    try {
      const { dur } = await withMount([new File([c.file], 'p' + ext(c.file.name))], (ff, d) => probe(ff, `${d}/p${ext(c.file.name)}`));
      if (dur > 0) init(dur); else q('.len').textContent = '읽을 수 없는 영상';
    } catch { q('.len').textContent = '읽을 수 없는 영상'; }
  });
  // preview loops inside the chosen range
  v.addEventListener('timeupdate', () => { if (!v.paused && c.end && v.currentTime >= c.end) { v.pause(); v.currentTime = c.start; } });
  v.addEventListener('play', () => { if (v.currentTime < c.start - 0.05 || v.currentTime >= c.end) v.currentTime = c.start; });

  q('.s').addEventListener('input', (e) => { setRange(c, +e.target.value, c.end, 's'); v.currentTime = c.start; });
  q('.e').addEventListener('input', (e) => { setRange(c, c.start, +e.target.value, 'e'); v.currentTime = c.end; });
  // typed seconds: applied on Enter or when leaving the box
  q('.sn').addEventListener('change', (e) => { setRange(c, +e.target.value || 0, c.end, 's'); v.currentTime = c.start; });
  q('.en').addEventListener('change', (e) => { setRange(c, c.start, +e.target.value || 0, 'e'); v.currentTime = c.end; });
  q('.t').addEventListener('input', (ev) => { c.text = ev.target.value; drawPreview(c); });
  q('.trans').addEventListener('change', (ev) => setTrans(c, ev.target.value));
  q('.fix input').addEventListener('change', (ev) => { c.fix = ev.target.checked; });
  el.addEventListener('click', async (ev) => {
    const b = ev.target.closest('button');
    const a = b?.dataset.a;
    if (!a || busy) return;
    const i = clips.indexOf(c);
    if (a === 'setS') { setRange(c, v.currentTime, c.end, 's'); }
    if (a === 'setE') { setRange(c, c.start, v.currentTime, 'e'); }
    if (a === 'seek') { v.currentTime = Math.max(c.start, +b.dataset.t - 1); v.muted = false; v.play(); }
    if (a === 'spike') {
      lock(true);
      try {
        await analyze(c, (p) => { b.textContent = typeof p === 'number' ? `🔊 소리 살펴보는 중… ${Math.round(p * 100)}%` : p; });
        drawSound(c);
      } catch (err) { console.error(err); resetEngine(); alert('소리를 살펴보지 못했어요. 다시 눌러 주세요.'); }
      finally { b.textContent = '🔊 튀는 소리 다시 보기'; lock(false); }
    }
    if (a === 'up' && i > 0) [clips[i - 1], clips[i]] = [clips[i], clips[i - 1]];
    if (a === 'down' && i < clips.length - 1) [clips[i + 1], clips[i]] = [clips[i], clips[i + 1]];
    if (a === 'del') { clips.splice(i, 1); dropClips([c], true); sel = clips[i] || clips[i - 1]; }
    if (['up', 'down', 'del'].includes(a)) renderList();
  });
  return el;
}

// one place that keeps start/end valid; `which` says which end the user is moving
function setRange(c, s, e, which) {
  s = Math.max(0, Math.min(s, c.dur - MIN));
  e = Math.min(c.dur, Math.max(e, MIN));
  if (e - s < MIN) { if (which === 'e') e = Math.min(c.dur, s + MIN); else s = Math.max(0, e - MIN); }
  c.start = +s.toFixed(2); c.end = +e.toFixed(2);
  const q = (x) => c.el.querySelector(x);
  q('.s').value = c.start; q('.e').value = c.end;
  q('.sn').value = c.start.toFixed(1); q('.en').value = c.end.toFixed(1);
  q('.len').textContent = `${sec(c.end - c.start)} 사용`;
  c.tile.querySelector('.d').textContent = sec(c.end - c.start);
  const tv = c.tile.querySelector('video'); // tile shows the first frame of the chosen range
  if (tv.readyState >= 1) tv.currentTime = c.start + 0.05; else tv.onloadedmetadata = () => (tv.currentTime = c.start + 0.05);
  if (c.ana) drawSound(c);
  renderTotal();
}

/* ---------- loud spots: waveform with red marks, jump buttons, and a "turn them down" box ---------- */
function spotsInRange(c) {
  return (c.ana?.spikes || []).filter((s) => s.t1 > c.start && s.t0 < c.end);
}
function drawSound(c) {
  const q = (x) => c.el.querySelector(x);
  const { env, hasAudio } = c.ana, dur = c.ana.dur || c.dur;
  const cv = q('.wave'), spk = q('.spk');
  spk.hidden = false;
  if (!hasAudio) { cv.hidden = true; q('.fix').hidden = true; spk.textContent = '소리가 없는 영상이에요.'; return; }
  cv.hidden = false;
  const W = (cv.width = cv.clientWidth * devicePixelRatio || 600), H = (cv.height = 48 * devicePixelRatio);
  const g = cv.getContext('2d');
  const max = Math.max(...env.map((e) => e.rms), 1e-6);
  const x = (t) => (t / dur) * W;
  g.fillStyle = 'rgba(255,90,31,.15)';
  g.fillRect(x(c.start), 0, x(c.end) - x(c.start), H);
  env.forEach((e, i) => {
    const t = i * STEP, h = Math.max(1, (e.rms / max) * H * 0.95);
    const loud = c.ana.spikes.some((s) => t + STEP > s.t0 && t < s.t1);
    g.fillStyle = loud ? '#ff3b3b' : t >= c.start && t < c.end ? '#d9dce1' : '#5b606a';
    g.fillRect(x(t), (H - h) / 2, Math.max(1, x(STEP) - 1), h);
  });
  const spots = spotsInRange(c);
  q('.fix').hidden = !spots.length;
  spk.innerHTML = spots.length
    ? `튀는 소리 ${spots.length}곳 (빨간 부분) — 눌러서 들어 보세요: ` +
      spots.map((s) => `<button data-a="seek" data-t="${s.t0}">▶ ${s.t0.toFixed(1)}초</button>`).join('')
    : '고른 구간에 튀는 소리가 없어요 👍';
}

const sec = (x) => `${x.toFixed(1)}초`;
let sel = null; // the clip being edited; only its card is shown
function renderList() {
  const list = $('#list'), strip = $('#strip');
  if (!clips.includes(sel)) sel = clips[0] || null;
  clips.forEach((c, i) => {
    c.el.querySelector('.no').textContent = `${i + 1}번 영상`;
    c.el.querySelector('.tr').hidden = i === clips.length - 1; // last clip has nothing after it
    c.el.hidden = c !== sel;
    list.append(c.el);
    c.tile.querySelector('b').textContent = i + 1;
    c.tile.classList.toggle('on', c === sel);
    c.tile.setAttribute('aria-label', `${i + 1}번 영상`);
    c.chip.hidden = i === clips.length - 1;
    paintChip(c);
  });
  // strip order: tile, chip, tile, chip … (only moves nodes that are out of place)
  clips.flatMap((c) => [c.tile, c.chip]).forEach((node, k) => {
    if (strip.children[k] !== node) strip.insertBefore(node, strip.children[k] || null);
  });
  $('#empty').hidden = clips.length > 0;
  strip.hidden = $('#stripHint').hidden = $('#seq').hidden = !clips.length;
  renderTotal();
}

/* ---------- transition picker: opened from the chip between two tiles ---------- */
let trFor = null;
$('#trGrid').innerHTML = Object.entries(TRANS).map(([k, t]) =>
  `<button data-t="${k}"><span class="demo" data-t="${k}"><i class="a">A</i><i class="b">B</i></span>${t.icon} ${t.name}</button>`).join('');
function openTr(c) {
  trFor = c;
  const i = clips.indexOf(c);
  $('#trTitle').textContent = `${i + 1}번 → ${i + 2}번 영상 트랜지션`;
  $('#trGrid').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.t === c.trans));
  $('#trAll').checked = false;
  $('#trDlg').showModal();
}
$('#trGrid').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || !trFor) return;
  ($('#trAll').checked ? clips.slice(0, -1) : [trFor]).forEach((c) => setTrans(c, b.dataset.t));
  $('#trDlg').close();
});
$('#trClose').addEventListener('click', () => $('#trDlg').close());
$('#strip').addEventListener('click', (e) => {
  const c = clips.find((x) => x.chip === e.target);
  if (c && !busy) openTr(c);
});
function moveClip(c, to) {
  const i = clips.indexOf(c);
  if (to < 0 || to >= clips.length || to === i) return;
  clips.splice(i, 1);
  clips.splice(to, 0, c);
  renderList();
}

/* ---------- order strip: drag a tile onto another to move it there, tap to edit ---------- */
const inside = (r, ev) => ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
$('#strip').addEventListener('pointerdown', (e) => {
  const tile = e.target.closest('.tile');
  if (!tile || busy || e.button > 0) return;
  e.preventDefault();
  const c = clips.find((x) => x.tile === tile);
  const r0 = tile.getBoundingClientRect(), gx = e.clientX - r0.left, gy = e.clientY - r0.top;
  let dragging = false;
  const follow = (ev) => {
    tile.style.transform = '';
    const r = tile.getBoundingClientRect();
    tile.style.transform = `translate(${ev.clientX - gx - r.left}px, ${ev.clientY - gy - r.top}px)`;
  };
  // window listeners, not pointer capture: the strip re-orders DOM nodes while dragging
  const move = (ev) => {
    if (ev.pointerId !== e.pointerId) return;
    if (!dragging && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 8) return;
    dragging = true;
    tile.classList.add('drag');
    const over = clips.find((o) => o !== c && inside(o.tile.getBoundingClientRect(), ev));
    if (over) moveClip(c, clips.indexOf(over));
    follow(ev);
  };
  const up = (ev) => {
    if (ev.pointerId !== e.pointerId) return;
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', up);
    removeEventListener('pointercancel', up);
    tile.classList.remove('drag');
    tile.style.transform = '';
    if (!dragging) { sel = c; renderList(); }
  };
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);
});
$('#strip').addEventListener('keydown', (e) => {
  const c = clips.find((x) => x.tile === e.target);
  if (!c || busy) return;
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sel = c; renderList(); }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); moveClip(c, clips.indexOf(c) + (e.key === 'ArrowLeft' ? -1 : 1)); c.tile.focus(); }
});
function renderTotal() {
  const t = clips.reduce((s, c, i) => s + (c.end - c.start) - (i < clips.length - 1 && c.trans !== 'cut' ? +opt.trSec : 0), 0);
  $('#total').textContent = clips.length ? `전체 길이: ${sec(t)}${t > 90 ? ' — 릴스는 90초까지라 조금 줄이는 게 좋아요' : ''}` : '';
}

/* ---------- step 3: options ---------- */
document.querySelectorAll('.seg').forEach((seg) => seg.addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b || busy) return;
  seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  opt[seg.dataset.k] = b.dataset.v;
  document.body.classList.toggle('contain', opt.fit === 'contain');
  document.body.classList.toggle('wide', opt.ratio === '16:9');
  if (['pos', 'size', 'font', 'ratio'].includes(seg.dataset.k)) clips.forEach(drawPreview);
  if (seg.dataset.k === 'trSec') { $('#trSecIn').value = opt.trSec; renderTotal(); }
}));
$('#trSecIn').addEventListener('change', (e) => {
  const v = Math.min(3, Math.max(0.1, Math.round(+e.target.value * 10) / 10 || 0.4)); // keep it sane; clips still cap it at half their length
  e.target.value = opt.trSec = String(v);
  document.querySelectorAll('[data-k=trSec] button').forEach((x) => x.classList.toggle('on', +x.dataset.v === v));
  renderTotal();
});
$('#musicVol').addEventListener('input', (e) => { opt.vol = +e.target.value; $('#musicVolV').textContent = `${opt.vol}%`; });
$('#musicPick').addEventListener('change', (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  opt.music = f;
  $('#musicName').textContent = f.name;
  $('#musicDel').hidden = false;
});
$('#musicDel').addEventListener('click', () => {
  opt.music = null;
  $('#musicName').textContent = '음악 고르기 (선택)';
  $('#musicDel').hidden = true;
});

/* ---------- text drawn on a transparent canvas: same picture for preview and for the final video ---------- */
function wrap(g, text, maxW) {
  const out = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const ch of para) {
      if (g.measureText(line + ch).width > maxW && line) {
        const sp = line.lastIndexOf(' ');
        if (sp > 0 && ch !== ' ') { out.push(line.slice(0, sp)); line = line.slice(sp + 1) + ch; }
        else { out.push(line); line = ch === ' ' ? '' : ch; }
      } else line += ch;
    }
    out.push(line);
  }
  return out;
}
async function textCanvas(text, W, H) {
  await document.fonts.load(`40px ${opt.font}`).catch(() => {});
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const px = Math.round(Math.min(W, H) * { s: 0.06, m: 0.085, l: 0.115 }[opt.size]); // short side, so 16:9 text isn't huge
  g.font = `${opt.font === 'PEN' ? Math.round(px * 1.3) : px}px ${opt.font}, sans-serif`; // pen script draws small
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.lineWidth = px * 0.18; g.strokeStyle = 'rgba(0,0,0,.85)'; g.fillStyle = '#fff';
  const lines = wrap(g, text.trim(), W * 0.86);
  const lh = px * 1.25;
  // bottom stays above the area Instagram covers with its buttons/caption
  const y0 = H * { top: 0.2, mid: 0.5, bot: 0.7 }[opt.pos] - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => { g.strokeText(l, W / 2, y0 + i * lh); g.fillText(l, W / 2, y0 + i * lh); });
  return cv;
}
async function drawPreview(c) {
  const img = c.el.querySelector('.txt');
  if (!c.text.trim()) { img.hidden = true; return; }
  img.src = (await textCanvas(c.text, ...dims('720'))).toDataURL();
  img.hidden = false;
}

/* ---------- highlights: look through every clip, keep the liveliest parts, make a quick sample ---------- */
const hlSay = (m) => { $('#hlMsg').hidden = false; $('#hlMsg').textContent = m; };
let cands = [], hlSrc = []; // candidate scenes and the original clips they come from
$('#hlBtn').addEventListener('click', async () => {
  const src = (backup || clips).filter((c) => c.dur > 0); // always search the original videos
  if (!src.length) { alert('먼저 1번에서 영상을 골라 주세요.'); return; }
  lock(true);
  try {
    await engine(hlSay);
    for (const [k, c] of src.entries())
      await analyze(c, (p) => hlSay(`영상 살펴보는 중… ${k + 1}/${src.length}번 (${Math.round(p * 100)}%)`));
    const sc = scores(src.map((c) => c.ana));
    const items = src.map((c, i) => ({ dur: c.dur, score: sc[i] }));
    const target = +opt.hlLen;
    hlSrc = src;
    renderCands(candidates(items, segLenFor(target, src.length), 5).sort((a, b) => a.i - b.i || a.start - b.start),
      pickHighlights(items, target));
    hlSay(`장면 ${cands.length}개를 찾았어요. 장면을 누르면 미리 볼 수 있어요. 쓸 장면을 고르고 "배치해서 이어보기"를 누르세요. (★가 많을수록 움직임·소리가 커요)`);
  } catch (err) {
    console.error(err); resetEngine(); hlSay('영상을 살펴보지 못했어요. 다시 눌러 주세요.');
  } finally { lock(false); }
});

const paintCand = (k) => { k.el.classList.toggle('on', k.on); k.el.querySelector('.pick').textContent = k.on ? '✔ 쓸 거예요' : '＋ 고르기'; };
function candInfo() {
  const on = cands.filter((k) => k.on);
  $('#candInfo').hidden = false;
  $('#candInfo').textContent = `고른 장면 ${on.length}개 · ${sec(on.reduce((s, k) => s + k.end - k.start, 0))}`;
}
function renderCands(list, chosen) {
  cands.forEach((k) => URL.revokeObjectURL(k.url));
  const box = $('#cands');
  box.innerHTML = '';
  const vmax = Math.max(...list.map((k) => k.v), 1e-6);
  cands = list.map((k) => {
    const el = $('#candTpl').content.firstElementChild.cloneNode(true);
    const url = URL.createObjectURL(hlSrc[k.i].file), v = el.querySelector('video');
    const cand = { ...k, el, url, on: chosen.some((p) => p.i === k.i && p.start === k.start) };
    v.src = url;
    v.addEventListener('loadedmetadata', () => { v.currentTime = k.start; });
    v.addEventListener('timeupdate', () => { if (v.currentTime >= k.end) v.currentTime = k.start; }); // loop the scene
    v.addEventListener('click', () => {
      if (!v.paused) return v.pause();
      cands.forEach((x) => x !== cand && x.el.querySelector('video').pause());
      if (v.currentTime < k.start || v.currentTime >= k.end) v.currentTime = k.start;
      v.play();
    });
    el.querySelector('.cmeta').textContent =
      `${k.i + 1}번 영상 · ${k.start.toFixed(1)}~${k.end.toFixed(1)}초 ${'★'.repeat(Math.max(1, Math.round((k.v / vmax) * 3)))}`;
    el.querySelector('.pick').addEventListener('click', () => { if (busy) return; cand.on = !cand.on; paintCand(cand); candInfo(); });
    paintCand(cand);
    box.append(el);
    return cand;
  });
  box.hidden = $('#hlMake').hidden = $('#hlSave').hidden = false;
  candInfo();
}

// each chosen scene as its own mp4 in the chosen shape (screen fit + quality from step 3, original sound, no text)
let hlUrls = [];
$('#hlSave').addEventListener('click', async () => {
  const on = cands.filter((k) => k.on).sort((a, b) => a.i - b.i || a.start - b.start);
  if (!on.length) { alert('저장할 장면을 하나 이상 골라 주세요.'); return; }
  if (busy) return;
  lock(true);
  const [W, H] = dims(opt.q);
  const box = $('#hlFiles');
  hlUrls.forEach((u) => URL.revokeObjectURL(u));
  hlUrls = [];
  box.innerHTML = '';
  box.hidden = false;
  const files = [];
  try {
    await engine(hlSay);
    for (const [n, k] of on.entries()) {
      const o = hlSrc[k.i], name = 'p' + ext(o.file.name);
      hlSay(`장면 클립 만드는 중… ${n + 1}/${on.length}`);
      const data = await withMount([new File([o.file], name)], async (ff, dir) => {
        const { args } = buildArgs({ clips: [{ path: `${dir}/${name}`, start: k.start, dur: k.end - k.start, hasAudio: o.ana.hasAudio }],
          music: null, keepOrig: true, fit: opt.fit, W, H, out: 'clip.mp4' });
        const from = logs.length;
        if (await ff.exec(args) !== 0) throw new Error(logs.slice(from).slice(-6).join('\n'));
        const out = await ff.readFile('clip.mp4');
        await ff.deleteFile('clip.mp4').catch(() => {});
        return out;
      });
      const fname = `하이라이트_${k.i + 1}번영상_${k.start.toFixed(1)}-${k.end.toFixed(1)}초.mp4`;
      const blob = new Blob([data.buffer], { type: 'video/mp4' }), url = URL.createObjectURL(blob);
      hlUrls.push(url);
      files.push(new File([blob], fname, { type: 'video/mp4' }));
      box.append(Object.assign(document.createElement('a'), { href: url, download: fname, className: 'big',
        textContent: `⬇ ${n + 1}. ${k.i + 1}번 영상 ${k.start.toFixed(1)}~${k.end.toFixed(1)}초 저장` }));
    }
    if (navigator.canShare?.({ files })) {
      const b = Object.assign(document.createElement('button'), { className: 'big primary', textContent: '📤 모두 공유 / 사진첩에 저장' });
      b.onclick = () => navigator.share({ files }).catch(() => {});
      box.prepend(b);
    }
    hlSay(`장면 클립 ${on.length}개 완성! 아래 버튼을 눌러 하나씩 저장하세요.`);
  } catch (err) {
    console.error(err); resetEngine();
    hlSay('장면 클립을 만들지 못했어요. 3번에서 "빠르게 720p"를 고르고 다시 해 보세요.');
  } finally { lock(false); }
});
$('#hlMake').addEventListener('click', async () => {
  const on = cands.filter((k) => k.on).sort((a, b) => a.i - b.i || a.start - b.start);
  if (!on.length) { alert('샘플에 쓸 장면을 하나 이상 골라 주세요.'); return; }
  if (busy) return;
  if (backup) dropClips(clips, true); // replacing an earlier sample list
  else { backup = clips; dropClips(clips, false); } // keep the originals for "되돌리기"
  clips = on.map((k) => { const o = hlSrc[k.i]; return newClip(o.file, { dur: o.dur, start: k.start, end: k.end, trans: 'fade', ana: o.ana }); });
  sel = clips[0];
  renderList();
  $('#hlUndo').hidden = false;
  $('#hlSample').hidden = false;
  hlSay('고른 장면을 아래에 배치했어요. 이어서 보기로 확인하고, 마음에 들면 "샘플 저장"을 누르세요. 순서·트랜지션은 아래에서 바꿀 수 있어요.');
  stopSeq();
  $('#seq').scrollIntoView({ behavior: 'smooth', block: 'center' });
  $('#seqPlay').click();
});
$('#hlSample').addEventListener('click', async () => {
  if (busy || !clips.length) return;
  stopSeq();
  await make(true);
});
$('#hlUndo').addEventListener('click', () => {
  if (!backup || busy) return;
  dropClips(clips, true);
  clips = backup; backup = null; sel = clips[0];
  renderList();
  $('#hlUndo').hidden = $('#hlSample').hidden = true;
  hlSay('찾기 전 영상으로 돌아왔어요.');
});

/* ---------- play all arranged clips in a row, with transitions acted out in CSS (no encoding) ---------- */
let seqRun = null, musicUrl = null, musicOf = null;
// plain timer, not requestAnimationFrame: rAF stops while the page is hidden and the player would hang
const until = (run, fn) => new Promise((res) => { const tick = () => (run.stop || fn() ? res() : setTimeout(tick, 25)); tick(); });
const playSafe = (v) => v.play().catch(() => { v.muted = true; return v.play().catch(() => {}); }); // autoplay rules may block sound

function prep(v, c) {
  v.getAnimations().forEach((a) => a.cancel());
  v.style.cssText = 'opacity:0';
  v.muted = opt.keepOrig !== '1';
  if (v.dataset.src !== c.url) { v.src = c.url; v.dataset.src = c.url; }
  return new Promise((res) => {
    const go = () => { v.addEventListener('seeked', res, { once: true }); v.currentTime = c.start; };
    v.readyState >= 1 ? go() : v.addEventListener('loadedmetadata', go, { once: true });
  });
}
function act(t, a, b, veil, ms) {
  const o = { duration: ms, easing: 'ease-in-out' };
  a.style.zIndex = 1; b.style.zIndex = 2; b.style.opacity = 1;
  let anims = [];
  if (t === 'fade') anims = [b.animate([{ opacity: 0 }, { opacity: 1 }], o)];
  if (t === 'fadeblack' || t === 'fadewhite') {
    veil.style.background = t === 'fadeblack' ? '#000' : '#fff';
    anims = [veil.animate([{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], o),
      b.animate([{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1, offset: 0.5 }, { opacity: 1 }], o)];
  }
  if (t === 'zoomin') { a.style.zIndex = 3; anims = [a.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(2.5)', opacity: 0 }], o)]; }
  if (t === 'slideleft') anims = [a.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-100%)' }], o),
    b.animate([{ transform: 'translateX(100%)' }, { transform: 'translateX(0)' }], o)];
  if (t === 'hblur') anims = [a.animate([{ filter: 'blur(0)' }, { filter: 'blur(14px)' }], o),
    b.animate([{ opacity: 0, filter: 'blur(14px)' }, { opacity: 1, filter: 'blur(0)' }], o)];
  // timer fallback: animations may not report "finished" while the page is hidden
  return Promise.race([Promise.all(anims.map((x) => x.finished.catch(() => {}))), new Promise((r) => setTimeout(r, ms + 150))])
    .then(() => { anims.forEach((x) => x.cancel()); a.style.opacity = 0; a.style.zIndex = 1; });
}
function stopSeq() {
  if (!seqRun) return;
  seqRun.stop = true;
  seqRun = null;
  $('#seqStage').querySelectorAll('video').forEach((v) => v.pause());
  $('#seqStage').querySelector('audio')?.pause();
  $('#seqPlay').textContent = '▶ 처음부터 이어서 보기 (트랜지션 포함)';
}
$('#seqPlay').addEventListener('click', async () => {
  if (seqRun) return stopSeq();
  const list = clips.filter((c) => c.dur > 0);
  if (!list.length) return;
  const run = (seqRun = { stop: false });
  $('#seqPlay').textContent = '■ 멈추기';
  const stage = $('#seqStage'), veil = stage.querySelector('.veil'), txt = stage.querySelector('.txt');
  let [cur, nxt] = stage.querySelectorAll('video');
  let au = stage.querySelector('audio');
  if (opt.music) {
    if (musicOf !== opt.music) { if (musicUrl) URL.revokeObjectURL(musicUrl); musicUrl = URL.createObjectURL(opt.music); musicOf = opt.music; }
    if (!au) au = stage.appendChild(document.createElement('audio'));
    au.src = musicUrl; au.volume = Math.min(1, opt.vol / 100); au.currentTime = 0;
  }
  const showText = (c) => { const p = c.el.querySelector('.txt'); txt.hidden = p.hidden; if (!p.hidden) txt.src = p.src; };
  await prep(cur, list[0]);
  if (run.stop) return;
  cur.style.opacity = 1;
  playSafe(cur);
  if (opt.music) playSafe(au);
  for (let i = 0; i < list.length && !run.stop; i++) {
    const c = list[i], n = list[i + 1];
    showText(c);
    const ready = n ? prep(nxt, n) : null; // load the next clip while this one plays
    const d = n && c.trans !== 'cut' ? Math.min(+opt.trSec, (c.end - c.start) / 2, (n.end - n.start) / 2) : 0;
    await until(run, () => cur.currentTime >= c.end - d || cur.ended);
    if (run.stop || !n) break;
    await ready;
    if (run.stop) break;
    playSafe(nxt);
    if (d) setTimeout(() => showText(n), (d * 1000) / 2);
    await act(c.trans, cur, nxt, veil, d * 1000);
    cur.pause();
    [cur, nxt] = [nxt, cur];
  }
  if (seqRun === run) stopSeq();
});

/* ---------- step 4: make the mp4 ---------- */
const say = (m) => { $('#progMsg').textContent = m; };
const bar = (p) => { $('#barFill').style.width = `${Math.round(p * 100)}%`; };

$('#make').addEventListener('click', () => make(false));
async function make(sample) {
  const list = clips.filter((c) => c.dur > 0);
  if (!list.length) { alert('먼저 1번에서 영상을 골라 주세요.'); return; }
  lock(true);
  $('#prog').hidden = false; $('#result').hidden = true; bar(0);
  if (sample) $('#prog').scrollIntoView({ behavior: 'smooth', block: 'center' });
  const [W, H] = dims(sample ? '720' : opt.q);
  const keepOrig = opt.keepOrig === '1';
  const t0 = Date.now();
  try {
    const ff = await engine(say);
    say('준비 중…');
    const names = list.map((c, i) => `c${i}${ext(c.file.name)}`);
    const files = list.map((c, i) => new File([c.file], names[i]));
    if (opt.music) files.push(new File([opt.music], 'music' + ext(opt.music.name)));
    const data = await withMount(files, async (ff, dir) => {
      const items = [];
      for (const [i, c] of list.entries()) {
        const it = { path: `${dir}/${names[i]}`, start: c.start, dur: c.end - c.start, hasAudio: false, trans: c.trans };
        if (keepOrig) it.hasAudio = c.ana ? c.ana.hasAudio : (await probe(ff, it.path)).hasAudio;
        if (keepOrig && c.fix) it.dips = spotsInRange(c).map((s) => ({ t0: Math.max(0, s.t0 - c.start), t1: Math.min(it.dur, s.t1 - c.start), gain: s.gain }));
        if (c.text.trim()) {
          const blob = await new Promise((r) => textCanvas(c.text, W, H).then((cv) => cv.toBlob(r, 'image/png')));
          it.textPath = `t${i}.png`;
          await ff.writeFile(it.textPath, new Uint8Array(await blob.arrayBuffer()));
        }
        items.push(it);
      }
      const music = opt.music ? { path: `${dir}/music${ext(opt.music.name)}`, vol: opt.vol / 100 } : null;
      const { args, total } = buildArgs({ clips: items, music, keepOrig, fit: opt.fit, W, H, trSec: +opt.trSec });
      onLog = (m) => {
        const t = secOf(m);
        if (t == null) return;
        const p = Math.min(1, t / total), el = (Date.now() - t0) / 1000;
        bar(p);
        say(`${sample ? '샘플 ' : ''}만드는 중… ${Math.round(p * 100)}%${p > 0.05 ? ` (약 ${Math.ceil((el / p - el) / 60)}분 남음)` : ''}`);
      };
      say('만드는 중… 0%');
      const from = logs.length;
      const code = await ff.exec(args);
      if (code !== 0) throw new Error(logs.slice(from).slice(-8).join('\n'));
      const out = await ff.readFile('out.mp4');
      for (const it of items) if (it.textPath) await ff.deleteFile(it.textPath).catch(() => {});
      await ff.deleteFile('out.mp4').catch(() => {});
      return out;
    });
    showResult(new Blob([data.buffer], { type: 'video/mp4' }), (Date.now() - t0) / 1000, sample);
  } catch (err) {
    console.error(err);
    resetEngine(); // a crashed (out of memory) engine can't be reused
    say('만들기에 실패했어요. 영상이 길거나 기기 메모리가 부족할 수 있어요. 3번에서 "빠르게 720p"를 고르거나 영상을 짧게 잘라서 다시 해 보세요.');
    bar(0);
  } finally {
    onLog = null;
    lock(false);
  }
}

function showResult(blob, secs, sample) {
  if (!sample) counter('videos', true).then((v) => showCount('#cMade', v)); // samples don't count
  if (outUrl) URL.revokeObjectURL(outUrl);
  outUrl = URL.createObjectURL(blob);
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  const name = `릴스${sample ? '_샘플' : ''}_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.mp4`;
  $('#outVideo').src = outUrl;
  $('#save').href = outUrl;
  $('#save').download = name;
  const file = new File([blob], name, { type: 'video/mp4' });
  const share = $('#share');
  share.hidden = !navigator.canShare?.({ files: [file] });
  share.onclick = () => navigator.share({ files: [file] }).catch(() => {});
  bar(1);
  say(`${sample ? '샘플(720p) ' : ''}완성! (${(blob.size / 1048576).toFixed(1)} MB, ${Math.round(secs)}초 걸림)`);
  $('#result').hidden = false;
  $('#result').scrollIntoView({ behavior: 'smooth' });
}

/* ---------- visitor / video counters ----------
   GitHub Pages can't store numbers, so a free no-signup counter service (Abacus) keeps them.
   shortcut: if that service shuts down the counters just show "-"; move to own storage if that happens. */
const COUNT_API = 'https://abacus.jasoncameron.dev', COUNT_NS = 'sf-ttukdik';
const counting = location.hostname.endsWith('github.io'); // local tests don't add fake numbers
async function counter(key, hit) {
  try {
    const r = await fetch(`${COUNT_API}/${hit && counting ? 'hit' : 'get'}/${COUNT_NS}/${key}`);
    if (r.status === 404) return 0; // never counted yet
    return r.ok ? (await r.json()).value : null;
  } catch { return null; }
}
const showCount = (id, v) => { if (v != null) $(id).textContent = v.toLocaleString('ko-KR'); };
(async () => {
  const today = new Date().toISOString().slice(0, 10);
  let seen = null;
  try { seen = localStorage.getItem('visitDay'); localStorage.setItem('visitDay', today); } catch {} // once per browser per day
  showCount('#cVisit', await counter('visits', seen !== today));
  showCount('#cMade', await counter('videos', false));
})();
