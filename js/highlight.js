import { dropClips, newClip, renderList, sec } from './clips.js';
import { analyze, cancelled, engine, ext, fitPicture, lock, logs, resetEngine, withMount } from './engine.js';
import { bar, make, say } from './export.js';
import { playSeq, stopSeq } from './preview.js';
import { $, dims, opt, st } from './state.js';
import { goTab, toPanel } from './views.js';
import { STEP, candidates, pickHighlights, scores, segLenFor } from '../analyze.js';
import { buildArgs } from '../build.js';

/* ---------- highlights: look through every clip, keep the liveliest parts, make a quick sample ---------- */
const hlSay = (m) => document.querySelectorAll('.hlmsg').forEach((x) => { x.hidden = false; x.textContent = m; });
let cands = [], hlSrc = []; // candidate scenes and the original clips they come from
// looks through the original videos and fills the scene list (recommended scenes come pre-chosen)
async function findHighlights() {
  const src = (st.backup || st.clips).filter((c) => c.dur > 0); // always search the original videos
  if (!src.length) { alert('먼저 1번에서 영상을 골라 주세요.'); return false; }
  await engine(hlSay);
  for (const [k, c] of src.entries())
    await analyze(c, (p) => hlSay(`영상 살펴보는 중… ${k + 1}/${src.length}번 (${Math.round(p * 100)}%)`));
  src.forEach((c) => fitPicture(c, c.ana.vdur)); // no scenes where only the sound is left
  const sc = scores(src.map((c) => c.ana));
  const items = src.map((c, i) => ({ dur: c.dur, score: sc[i].slice(0, Math.round(c.dur / STEP)) }));
  const target = +opt.hlLen;
  hlSrc = src;
  renderCands(candidates(items, segLenFor(target, src.length), 5).sort((a, b) => a.i - b.i || a.start - b.start),
    pickHighlights(items, target));
  return true;
}
$('#hlBtn').addEventListener('click', async () => {
  if (st.busy) return;
  lock(true);
  try {
    if (await findHighlights())
      hlSay(`장면 ${cands.length}개를 찾았어요. 장면을 누르면 미리 볼 수 있어요. 쓸 장면을 고르고 "고른 장면으로 바꾸기"를 눌러요. (★가 많을수록 움직임·소리가 커요)`);
  } catch (err) {
    console.error(err); resetEngine(); hlSay(cancelled ? '그만했어요. 다시 하려면 버튼을 눌러요.' : '영상을 살펴보지 못했어요. 다시 눌러 주세요.');
  } finally { lock(false); }
});
// one tap: find highlights -> arrange the recommended scenes with soft transitions -> make the final mp4
$('#autoBtn').addEventListener('click', async () => {
  if (st.busy) return;
  lock(true);
  let ok = false;
  try { ok = await findHighlights(); } catch (err) { console.error(err); resetEngine(); hlSay(cancelled ? '그만했어요. 다시 하려면 버튼을 눌러요.' : '영상을 살펴보지 못했어요. 다시 눌러 주세요.'); }
  finally { lock(false); }
  if (!ok) return;
  arrange(cands.filter((k) => k.on));
  hlSay(`추천 장면 ${st.clips.length}개를 이어 붙여 영상을 만들고 있어요. 다 되면 화면에 바로 나와요.`);
  goTab('more'); // making and saving live in the last step
  await make(false);
  hlSay(cancelled ? '영상 만들기를 그만했어요. 다시 하려면 버튼을 눌러요.' : $('#saveRow').hidden ? '영상을 만들지 못했어요. 🎬 영상 만들기 아래 안내를 봐 주세요.'
    : `완성! 추천 장면 ${st.clips.length}개로 만든 영상이 화면에 나왔어요. 5번 모양 칸에서 💾 저장하기를 눌러요. 고치고 싶으면 2~5번 칸에서 바꾸고 다시 만들면 돼요.`);
});

const paintCand = (k) => { k.el.classList.toggle('on', k.on); k.el.querySelector('.pick').textContent = k.on ? '✔ 쓸 거예요' : '＋ 고르기'; };
function candInfo() {
  const on = cands.filter((k) => k.on);
  $('#candInfo').hidden = false;
  $('#candInfo').textContent = `고른 장면 ${on.length}개 · ${sec(on.reduce((s, k) => s + k.end - k.start, 0))}`;
}
// Scenes show a still picture; one shared player moves into the scene being watched.
// (A video per scene meant many players on the same big files: phones drop some and they turn black.)
const player = Object.assign(document.createElement('video'), { muted: true, playsInline: true, preload: 'auto' });
let playing = null; // the scene the player is in
function stopCand() {
  player.pause();
  playing?.el.classList.remove('playing');
  playing = null;
}
player.addEventListener('timeupdate', () => { if (playing && player.currentTime >= playing.end) player.currentTime = playing.start; }); // loop the scene
async function playCand(k) {
  if (playing === k) return stopCand();
  stopCand();
  playing = k;
  k.el.classList.add('playing');
  k.el.querySelector('.cthumb').append(player);
  if (player.src !== k.url) { player.src = k.url; await new Promise((r) => player.addEventListener('loadedmetadata', r, { once: true })); }
  if (playing !== k) return;
  player.currentTime = k.start;
  player.play().catch(() => {});
}
// still pictures, one at a time from one hidden player
let thumbTok = 0;
async function drawThumbs(list) {
  const tok = ++thumbTok, v = Object.assign(document.createElement('video'), { muted: true, playsInline: true, preload: 'auto' });
  const wait = (ev) => new Promise((r) => { v.addEventListener(ev, r, { once: true }); v.addEventListener('error', r, { once: true }); setTimeout(r, 4000); });
  for (const k of list) {
    if (tok !== thumbTok) break;
    if (v.src !== k.url) { v.src = k.url; await wait('loadeddata'); }
    v.currentTime = Math.min(k.start + 0.3, (k.start + k.end) / 2);
    await wait('seeked');
    const cv = k.el.querySelector('canvas');
    if (v.videoWidth) { cv.width = v.videoWidth / 4; cv.height = v.videoHeight / 4; cv.getContext('2d').drawImage(v, 0, 0, cv.width, cv.height); }
  }
  v.removeAttribute('src'); v.load(); // let the decoder go
}
function renderCands(list, chosen) {
  stopCand();
  player.removeAttribute('src');
  new Set(cands.map((k) => k.url)).forEach((u) => URL.revokeObjectURL(u));
  const urls = new Map(); // one object URL per original file
  const box = $('#cands');
  box.innerHTML = '';
  const vmax = Math.max(...list.map((k) => k.v), 1e-6);
  cands = list.map((k) => {
    const el = $('#candTpl').content.firstElementChild.cloneNode(true);
    const f = hlSrc[k.i].file;
    if (!urls.has(f)) urls.set(f, URL.createObjectURL(f));
    const cand = { ...k, el, url: urls.get(f), on: chosen.some((p) => p.i === k.i && p.start === k.start) };
    el.querySelector('.cthumb').addEventListener('click', () => playCand(cand));
    el.querySelector('.cmeta').textContent =
      `${k.i + 1}번 영상 · ${k.start.toFixed(1)}~${k.end.toFixed(1)}초 ${'★'.repeat(Math.max(1, Math.round((k.v / vmax) * 3)))}`;
    el.querySelector('.pick').addEventListener('click', () => { if (st.busy) return; cand.on = !cand.on; paintCand(cand); candInfo(); });
    paintCand(cand);
    box.append(el);
    return cand;
  });
  drawThumbs(cands);
  box.hidden = $('#hlMake').hidden = false;
  candInfo();
}

// each chosen highlight as its own mp4 in the chosen shape (screen fit + quality from 모양, original sound, no text)
let hlUrls = [];
$('#hlSave').addEventListener('click', async () => {
  const on = cands.filter((k) => k.on).sort((a, b) => a.i - b.i || a.start - b.start);
  if (!on.length) { // nothing picked yet: take them to the highlight finder
    goTab('cut'); toPanel();
    hlSay(cands.length ? '저장할 장면을 하나 이상 골라 주세요. 그다음 5번 모양 칸에서 다시 눌러요.' : '먼저 "✨ 하이라이트 찾기"를 눌러 장면을 찾아요. 고른 다음 5번 모양 칸에서 "장면마다 따로 저장"을 눌러요.');
    return;
  }
  if (st.busy) return;
  lock(true);
  const [W, H] = dims(opt.q);
  const box = $('#hlFiles');
  hlUrls.forEach((u) => URL.revokeObjectURL(u));
  hlUrls = [];
  box.innerHTML = '';
  box.hidden = false;
  $('#prog').hidden = false; bar(0);
  const files = [];
  try {
    await engine(say);
    for (const [n, k] of on.entries()) {
      const o = hlSrc[k.i], name = 'p' + ext(o.file.name);
      say(`장면 저장 파일 만드는 중… ${n + 1}/${on.length}`);
      bar(n / on.length);
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
      box.append(Object.assign(document.createElement('a'), { href: url, download: fname, className: 'btn',
        textContent: `⬇ ${n + 1}. ${k.i + 1}번 영상 ${k.start.toFixed(1)}~${k.end.toFixed(1)}초 저장` }));
    }
    if (navigator.canShare?.({ files })) {
      const b = Object.assign(document.createElement('button'), { className: 'btn cta', textContent: '📤 모두 공유 / 사진첩에 저장' });
      b.onclick = () => navigator.share({ files }).catch(() => {});
      box.prepend(b);
    }
    bar(1);
    say(`장면 ${on.length}개 완성! 아래 버튼을 눌러 하나씩 저장해요.`);
  } catch (err) {
    console.error(err); resetEngine(); bar(0);
    say(cancelled ? '그만했어요. 다 만든 장면은 아래 버튼으로 저장할 수 있어요.' : '장면 파일을 만들지 못했어요. 화질을 "빠르게 720p"로 바꾸고 다시 해 보세요.');
  } finally { lock(false); }
});
function arrange(on) {
  on = [...on].sort((a, b) => a.i - b.i || a.start - b.start);
  if (st.backup) dropClips(st.clips, true); // replacing an earlier sample list
  else { st.backup = st.clips; dropClips(st.clips, false); } // keep the originals for "되돌리기"
  st.clips = on.map((k) => { const o = hlSrc[k.i]; return newClip(o.file, { dur: o.dur, start: k.start, end: k.end, trans: 'fade', ana: o.ana }); });
  st.sel = st.clips[0];
  renderList();
  $('#hlUndo').hidden = false;
}
$('#hlMake').addEventListener('click', async () => {
  const on = cands.filter((k) => k.on);
  if (!on.length) { alert('샘플에 쓸 장면을 하나 이상 골라 주세요.'); return; }
  if (st.busy) return;
  stopCand();
  arrange(on);
  hlSay('고른 장면으로 바꿨어요. 화면에서 바로 이어서 보여 줄게요. 마음에 들면 5번 모양 칸에서 🎬 영상 만들기를 눌러요.');
  stopSeq();
  scrollTo({ top: 0, behavior: 'smooth' });
  playSeq();
});
$('#hlUndo').addEventListener('click', () => {
  if (!st.backup || st.busy) return;
  dropClips(st.clips, true);
  st.clips = st.backup; st.backup = null; st.sel = st.clips[0];
  renderList();
  $('#hlUndo').hidden = true;
  hlSay('찾기 전 영상으로 돌아왔어요.');
});
