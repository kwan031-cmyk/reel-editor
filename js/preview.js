import { $, opt, st, wake } from './state.js';
import { clamp, curT, paintLayers } from './text.js';
import { setView, view } from './views.js';

/* ---------- play all arranged clips in a row, with transitions acted out in CSS (no encoding) ---------- */
export let seqRun = null, musicUrl = null, musicOf = null;
// plain timer, not requestAnimationFrame: rAF stops while the page is hidden and the player would hang
const until = (run, fn) => new Promise((res) => { const tick = () => (run.stop || fn() ? res() : setTimeout(tick, 25)); tick(); });
const playSafe = (v) => v.play().catch(() => { v.muted = true; return v.play().catch(() => {}); }); // autoplay rules may block sound

function prep(v, c, t = c.start) {
  v.getAnimations().forEach((a) => a.cancel());
  v.style.cssText = 'opacity:0';
  v.muted = opt.keepOrig !== '1';
  if (v.dataset.src !== c.url) { v.src = c.url; v.dataset.src = c.url; }
  const seek = wake(v).then(() => new Promise((res) => {
    const go = () => { v.addEventListener('seeked', res, { once: true }); v.currentTime = t; };
    v.readyState >= 1 ? go() : v.addEventListener('loadedmetadata', go, { once: true });
    v.addEventListener('error', res, { once: true });
  }));
  return Promise.race([seek, new Promise((r) => setTimeout(r, 3000))]);
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
  if (t === 'circleopen') anims = [b.animate([{ clipPath: 'circle(0% at 50% 50%)' }, { clipPath: 'circle(75% at 50% 50%)' }], o)];
  if (t === 'circleclose') { a.style.zIndex = 3; anims = [a.animate([{ clipPath: 'circle(75% at 50% 50%)' }, { clipPath: 'circle(0% at 50% 50%)' }], o)]; }
  if (t === 'wipeleft') anims = [b.animate([{ clipPath: 'inset(0 0 0 100%)' }, { clipPath: 'inset(0 0 0 0)' }], o)];
  if (t === 'slideup') anims = [a.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-100%)' }], o),
    b.animate([{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }], o)];
  if (t === 'fadegrays') anims = [a.animate([{ filter: 'grayscale(0)' }, { filter: 'grayscale(1)' }], { ...o, duration: ms / 2 }),
    b.animate([{ opacity: 0, filter: 'grayscale(1)' }, { opacity: 0, filter: 'grayscale(1)', offset: 0.4 }, { opacity: 1, filter: 'grayscale(1)', offset: 0.6 }, { opacity: 1, filter: 'grayscale(0)' }], o)];
  if (t === 'squeezeh') { a.style.zIndex = 3; anims = [a.animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(0)' }], o)]; }
  // timer fallback: animations may not report "finished" while the page is hidden
  return Promise.race([Promise.all(anims.map((x) => x.finished.catch(() => {}))), new Promise((r) => setTimeout(r, ms + 150))])
    .then(() => { anims.forEach((x) => x.cancel()); a.style.opacity = 0; a.style.zIndex = 1; });
}
export function stopSeq() {
  if (!seqRun) return;
  seqRun.stop = true;
  clearInterval(seqRun.tick);
  seqRun = null;
  paintLayers();
  $('#seqStage').querySelectorAll('video').forEach((v) => v.pause());
  $('#seqStage').querySelector('audio')?.pause();
  syncCtl();
}
export async function playSeq() {
  if (seqRun) return;
  setView('seq');
  const tl = timeline(), list = tl.list.map((x) => x.c);
  if (!list.length) return;
  if (st.nowT >= tl.total - 0.1) st.nowT = 0; // at the end: play again from the start
  const i0 = Math.max(0, tl.list.findLastIndex((x) => x.at <= st.nowT + 1e-6));
  const run = (seqRun = { stop: false, at: tl.list[i0].at, c: list[i0], v: null });
  const stage = $('#seqStage'), veil = stage.querySelector('.veil');
  let [cur, nxt] = stage.querySelectorAll('video');
  nxt.style.opacity = 0;
  let au = stage.querySelector('audio');
  if (opt.music) {
    if (musicOf !== opt.music) { if (musicUrl) URL.revokeObjectURL(musicUrl); musicUrl = URL.createObjectURL(opt.music); musicOf = opt.music; }
    if (!au) au = stage.appendChild(document.createElement('audio'));
    if (au.dataset.src !== musicUrl) { au.src = musicUrl; au.dataset.src = musicUrl; }
    au.volume = Math.min(1, opt.vol / 100);
    au.currentTime = st.nowT;
  }
  syncCtl();
  run.tick = setInterval(() => { if (run.v) { st.nowT = Math.min(tl.total, run.at + run.v.currentTime - run.c.start); syncCtl(); paintLayers(); } }, 50);
  await prep(cur, list[i0], list[i0].start + st.nowT - tl.list[i0].at);
  if (run.stop) return;
  cur.style.opacity = 1;
  playSafe(cur);
  if (opt.music) playSafe(au);
  for (let i = i0; i < list.length && !run.stop; i++) {
    const c = list[i], n = list[i + 1];
    Object.assign(run, { c, v: cur, at: tl.list[i].at });
    const ready = n ? prep(nxt, n) : null; // load the next clip while this one plays
    const d = n && c.trans !== 'cut' ? Math.min(+opt.trSec, (c.end - c.start) / 2, (n.end - n.start) / 2) : 0;
    await until(run, () => cur.currentTime >= c.end - d || cur.ended || cur.error);
    if (run.stop) break;
    if (!n) { st.nowT = tl.total; break; }
    await ready;
    if (run.stop) break;
    playSafe(nxt);
    await act(c.trans, cur, nxt, veil, d * 1000);
    cur.pause();
    [cur, nxt] = [nxt, cur];
  }
  if (seqRun === run) stopSeq();
}

// where each clip starts on the joined video (same maths as build.js)
export function timeline() {
  const list = st.clips.filter((c) => c.dur > 0);
  let t = 0;
  const out = list.map((c, i) => {
    const at = t, n = list[i + 1];
    t += c.end - c.start - (n && c.trans !== 'cut' ? Math.min(+opt.trSec, (c.end - c.start) / 2, (n.end - n.start) / 2) : 0);
    return { c, at };
  });
  return { list: out, total: t };
}
// the media element on screen: the clip being cut, the finished video, or null for the whole preview
const media = () => (view === 'clip' && st.sel ? st.sel.frame.querySelector('video') : view === 'result' ? $('#outVideo') : null);
const showPos = () => syncCtl();
export function syncCtl() {
  const m = media(), playing = m ? !m.paused && !m.ended : !!seqRun;
  const total = m ? (isFinite(m.duration) ? m.duration : 0) : timeline().total, at = m ? m.currentTime : st.nowT;
  const b = $('#cPlay');
  b.ariaLabel = playing ? '멈추기' : '재생';
  b.classList.toggle('on', playing);
  $('#seqPos').max = total.toFixed(2);
  $('#seqPos').value = at;
  $('#seqPosV').textContent = `${at.toFixed(1)} / ${total.toFixed(1)}초`;
}
function togglePlay() {
  if (st.busy) return;
  const m = media();
  if (m) { if (m.paused || m.ended) m.play().catch(() => {}); else m.pause(); }
  else if (seqRun) stopSeq();
  else playSeq();
  syncCtl();
}
$('#cPlay').addEventListener('click', togglePlay);
$('#cHome').addEventListener('click', () => {
  const m = media();
  if (m) m.currentTime = 0; else { stopSeq(); showAt(0); }
  syncCtl();
});
setInterval(() => { if (!seqRun) syncCtl(); }, 200); // video clocks run on their own; keep the bar honest
// tapping the screen plays / pauses (unless it is placing a text)
$('.screen').addEventListener('click', () => { if (!(curT && view === 'seq')) togglePlay(); });
addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || /INPUT|TEXTAREA|SELECT|BUTTON/.test(document.activeElement.tagName) || $('dialog[open]')) return;
  e.preventDefault(); togglePlay();
});
// shows the frame at time t of the joined video in the preview player
let showTok = 0;
export async function showAt(t) {
  const { list, total } = timeline();
  if (!list.length) return;
  st.nowT = clamp(t, 0, total);
  showPos(); paintLayers();
  const e = list.findLast((x) => x.at <= st.nowT + 1e-6) || list[0];
  const [v, v2] = $('#seqStage').querySelectorAll('video');
  const tok = ++showTok;
  v2.style.opacity = 0;
  await prep(v, e.c, Math.min(e.c.end, e.c.start + st.nowT - e.at));
  if (tok === showTok && !seqRun) v.style.opacity = 1;
}
$('#seqPos').addEventListener('input', (e) => { const m = media(); if (m) m.currentTime = +e.target.value; else { stopSeq(); showAt(+e.target.value); } });
