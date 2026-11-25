import { analyze, cancelled, ext, lock, probe, resetEngine, withMount } from './engine.js';
import { seqRun, showAt, timeline } from './preview.js';
import { $, MIN, TRANS, opt, st } from './state.js';
import { paintLayer, texts } from './text.js';
import { goTab, refreshView, view } from './views.js';
import { STEP } from '../analyze.js';

/* ---------- step 1: add clips ---------- */
$('#pick').addEventListener('change', (e) => { addFiles([...e.target.files]); e.target.value = ''; });

export function newClip(file, extra = {}) {
  const c = { file, url: URL.createObjectURL(file), dur: 0, start: 0, end: 0, text: '', trans: 'cut', fix: true, ana: null, ...extra };
  c.tile = $('#tileTpl').content.firstElementChild.cloneNode(true);
  c.tile.querySelector('video').src = c.url;
  c.chip = Object.assign(document.createElement('button'), { type: 'button', className: 'chip' });
  c.el = makeCard(c);
  return c;
}
export function dropClips(list, revoke) {
  list.forEach((c) => { c.el.remove(); c.frame.remove(); c.tile.remove(); c.chip.remove(); if (revoke) URL.revokeObjectURL(c.url); });
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
    st.clips.push(c);
  }
  if (first) st.sel = first;
  // new files become part of the base list, so the highlight undo point no longer applies
  if (first && st.backup) { dropClips(st.backup.filter((b) => !st.clips.includes(b)), true); st.backup = null; $('#hlUndo').hidden = true; }
  renderList();
}

function makeCard(c) {
  const el = $('#clipTpl').content.firstElementChild.cloneNode(true);
  const q = (s) => el.querySelector(s);
  const v = q('video');
  v.src = c.url;
  c.el = el;
  c.frame = q('.frame'); // shown in the viewer while cutting this clip
  const init = (dur) => {
    c.dur = dur = Math.min(dur, c.vdur ?? c.ana?.vdur ?? dur); // the file length may include sound past the picture
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

  // the clip on screen plays only its chosen part: start there, stop at the end and go back to the start
  v.addEventListener('play', () => { if (v.currentTime < c.start - 0.05 || v.currentTime >= c.end - 0.05) v.currentTime = c.start; });
  v.addEventListener('timeupdate', () => { if (!v.paused && v.currentTime >= c.end) { v.pause(); v.currentTime = c.start; } });
  q('.s').addEventListener('input', (e) => { setRange(c, +e.target.value, c.end, 's'); v.currentTime = c.start; });
  q('.e').addEventListener('input', (e) => { setRange(c, c.start, +e.target.value, 'e'); v.currentTime = c.end; });
  // typed seconds: applied on Enter or when leaving the box
  q('.sn').addEventListener('change', (e) => { setRange(c, +e.target.value || 0, c.end, 's'); v.currentTime = c.start; });
  q('.en').addEventListener('change', (e) => { setRange(c, c.start, +e.target.value || 0, 'e'); v.currentTime = c.end; });
  q('.trans').addEventListener('change', (ev) => setTrans(c, ev.target.value));
  q('.fix input').addEventListener('change', (ev) => { c.fix = ev.target.checked; });
  el.addEventListener('click', async (ev) => {
    const b = ev.target.closest('button');
    const a = b?.dataset.a;
    if (!a || st.busy) return;
    const i = st.clips.indexOf(c);
    if (a === 'setS') { setRange(c, v.currentTime, c.end, 's'); }
    if (a === 'setE') { setRange(c, c.start, v.currentTime, 'e'); }
    if (a === 'seek') { v.currentTime = Math.max(c.start, +b.dataset.t - 1); v.muted = false; v.play(); }
    if (a === 'spike') {
      lock(true);
      try {
        await analyze(c, (p) => { b.textContent = typeof p === 'number' ? `🔊 소리 살펴보는 중… ${Math.round(p * 100)}%` : p; });
        drawSound(c);
      } catch (err) { console.error(err); resetEngine(); if (!cancelled) alert('소리를 살펴보지 못했어요. 다시 눌러 주세요.'); }
      finally { b.textContent = '🔊 튀는 소리 다시 보기'; lock(false); }
    }
    if (a === 'up' && i > 0) [st.clips[i - 1], st.clips[i]] = [st.clips[i], st.clips[i - 1]];
    if (a === 'down' && i < st.clips.length - 1) [st.clips[i + 1], st.clips[i]] = [st.clips[i], st.clips[i + 1]];
    if (a === 'del') { st.clips.splice(i, 1); dropClips([c], true); st.sel = st.clips[i] || st.clips[i - 1]; }
    if (['up', 'down', 'del'].includes(a)) renderList();
  });
  return el;
}

// one place that keeps start/end valid; `which` says which end the user is moving
export function setRange(c, s, e, which) {
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
export function spotsInRange(c) {
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

export const sec = (x) => `${x.toFixed(1)}초`;
// the clip being edited; only its card is shown
export function renderList() {
  const list = $('#list'), strip = $('#strip');
  if (!st.clips.includes(st.sel)) st.sel = st.clips[0] || null;
  st.clips.forEach((c, i) => {
    c.el.querySelector('.no').textContent = `${i + 1}번 영상`;
    c.el.querySelector('.tr').hidden = i === st.clips.length - 1; // last clip has nothing after it
    c.el.hidden = c !== st.sel;
    list.append(c.el);
    c.tile.querySelector('b').textContent = i + 1;
    c.tile.classList.toggle('on', c === st.sel);
    c.tile.setAttribute('aria-label', `${i + 1}번 영상`);
    c.chip.hidden = i === st.clips.length - 1;
    paintChip(c);
  });
  // strip order: tile, chip, tile, chip … (only moves nodes that are out of place)
  st.clips.flatMap((c) => [c.tile, c.chip]).forEach((node, k) => {
    if (strip.children[k] !== node) strip.insertBefore(node, strip.children[k] || null);
  });
  strip.hidden = $('#stripHint').hidden = !st.clips.length;
  $('#cutHint').hidden = st.clips.length > 0; // only the "add videos first" note
  $('#clipPick').replaceChildren(...st.clips.map((c, i) => Object.assign(document.createElement('button'), {
    type: 'button', className: c === st.sel ? 'on' : '', textContent: `${i + 1}번 영상`,
    onclick: () => { if (!st.busy) { st.sel = c; renderList(); } } })));
  refreshView();
  renderTotal();
}

/* ---------- transition picker: opened from the chip between two tiles ---------- */
let trFor = null;
$('#trGrid').innerHTML = Object.entries(TRANS).map(([k, t]) =>
  `<button data-t="${k}"><span class="demo" data-t="${k}"><i class="a">A</i><i class="b">B</i></span>${t.icon} ${t.name}</button>`).join('');
function openTr(c) {
  trFor = c;
  const i = st.clips.indexOf(c);
  $('#trTitle').textContent = `${i + 1}번 → ${i + 2}번 영상 트랜지션`;
  $('#trGrid').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.t === c.trans));
  $('#trAll').checked = false;
  $('#trDlg').showModal();
}
$('#trGrid').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || !trFor) return;
  ($('#trAll').checked ? st.clips.slice(0, -1) : [trFor]).forEach((c) => setTrans(c, b.dataset.t));
  $('#trDlg').close();
});
$('#trClose').addEventListener('click', () => $('#trDlg').close());
$('#strip').addEventListener('click', (e) => {
  const c = st.clips.find((x) => x.chip === e.target);
  if (c && !st.busy) openTr(c);
});
function moveClip(c, to) {
  const i = st.clips.indexOf(c);
  if (to < 0 || to >= st.clips.length || to === i) return;
  st.clips.splice(i, 1);
  st.clips.splice(to, 0, c);
  renderList();
}

/* ---------- order strip: drag a tile onto another to move it there, tap to edit ---------- */
const inside = (r, ev) => ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
$('#strip').addEventListener('pointerdown', (e) => {
  const tile = e.target.closest('.tile');
  if (!tile || st.busy || e.button > 0) return;
  e.preventDefault();
  const c = st.clips.find((x) => x.tile === tile);
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
    const over = st.clips.find((o) => o !== c && inside(o.tile.getBoundingClientRect(), ev));
    if (over) moveClip(c, st.clips.indexOf(over));
    follow(ev);
  };
  const up = (ev) => {
    if (ev.pointerId !== e.pointerId) return;
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', up);
    removeEventListener('pointercancel', up);
    tile.classList.remove('drag');
    tile.style.transform = '';
    if (!dragging) { st.sel = c; renderList(); goTab('cut'); }
  };
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);
});
$('#strip').addEventListener('keydown', (e) => {
  const c = st.clips.find((x) => x.tile === e.target);
  if (!c || st.busy) return;
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); st.sel = c; renderList(); goTab('cut'); }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); moveClip(c, st.clips.indexOf(c) + (e.key === 'ArrowLeft' ? -1 : 1)); c.tile.focus(); }
});
function renderTotal() {
  const t = timeline().total;
  if (view === 'seq' && !seqRun && !st.busy) showAt(st.nowT); // keep a frame on screen instead of black
  bigNote();
  $('#total').textContent = st.clips.length ? `전체 길이: ${sec(t)}${t > 90 ? ' — 릴스는 90초까지라 조금 줄이는 게 좋아요' : ''}` : '';
}

// long or heavy sources take a while (most of all on phones): say so before they start
const BIG_MB = 300, BIG_MIN = 3;
function bigNote() {
  const len = new Map([...(st.backup || []), ...st.clips].map((c) => [c.file, c.dur || 0])); // each file once (highlights reuse files)
  const src = [...len.keys()];
  const mb = src.reduce((s, f) => s + f.size, 0) / 1048576;
  const min = [...len.values()].reduce((s, d) => s + d, 0) / 60;
  const big = mb > BIG_MB || min > BIG_MIN;
  document.querySelectorAll('.bigwarn').forEach((p) => {
    p.hidden = !big;
    p.textContent = `⏳ 넣은 영상이 크거나 길어요 (${src.length}개 · ${min.toFixed(1)}분 · ${Math.round(mb)} MB). 만들 때 몇 분 넘게 걸릴 수 있어요. 폰에서는 5번 모양 칸의 "빠르게 720p"가 더 빨라요. 만드는 동안 화면을 끄거나 다른 앱으로 가면 멈출 수 있어요.`;
  });
}

/* ---------- step 3: options ---------- */
document.querySelectorAll('.seg').forEach((seg) => seg.addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b || st.busy) return;
  // every copy of a choice (the length is in 넣기 and 자르기) shows the same pick
  document.querySelectorAll(`.seg[data-k="${seg.dataset.k}"] button`).forEach((x) => x.classList.toggle('on', x.dataset.v === b.dataset.v));
  opt[seg.dataset.k] = b.dataset.v;
  document.body.classList.toggle('contain', opt.fit === 'contain');
  document.body.classList.toggle('wide', opt.ratio === '16:9');
  if (seg.dataset.k === 'ratio') texts.forEach(paintLayer);
  if (seg.dataset.k === 'trSec') setTrSec(+opt.trSec);
}));
function setTrSec(x) {
  const v = Math.min(3, Math.max(0.05, Math.round(x * 20) / 20 || 0.4)); // 0.05 s steps; clips still cap it at half their length
  opt.trSec = String(+v.toFixed(2));
  $('#trSecIn').value = $('#trSecR').value = opt.trSec;
  $('#trSecV').textContent = `${(+opt.trSec).toFixed(2)}초`;
  document.querySelectorAll('[data-k=trSec] button').forEach((x) => x.classList.toggle('on', +x.dataset.v === v));
  renderTotal();
}
$('#trSecIn').addEventListener('change', (e) => setTrSec(+e.target.value));
$('#trSecR').addEventListener('input', (e) => setTrSec(+e.target.value));
document.querySelectorAll('.nudge').forEach((b) => b.addEventListener('click', () => setTrSec(+opt.trSec + +b.dataset.d)));
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
