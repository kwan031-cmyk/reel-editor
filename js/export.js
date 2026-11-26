import { t } from './i18n.js';
import { spotsInRange } from './clips.js';
import { cancelled, engine, ext, fitPicture, lock, logs, probe, resetEngine, secOf, videoLen, withMount } from './engine.js';
import { counter, showCount } from './extras.js';
import { timeline } from './preview.js';
import { $, dims, opt, st } from './state.js';
import { layerCanvas, texts } from './text.js';
import { setView } from './views.js';
import { buildArgs } from '../build.js';

/* ---------- step 4: make the mp4 ---------- */
export const say = (m) => { $('#progMsg').textContent = m; };
export const bar = (p) => { $('#barFill').style.width = `${Math.round(p * 100)}%`; };

$('#make').addEventListener('click', make);
export async function make() {
  const list = st.clips.filter((c) => c.dur > 0);
  if (!list.length) { alert(t('먼저 1번에서 영상을 골라 주세요.')); return; }
  lock(true);
  $('#prog').hidden = false; $('#saveRow').hidden = true; bar(0);
  $('#prog').scrollIntoView({ behavior: 'smooth', block: 'center' });
  const [W, H] = dims(opt.q);
  const keepOrig = opt.keepOrig === '1';
  const t0 = Date.now();
  // keep the screen on while making: a phone that dims and locks stops the page (no-op where unsupported)
  const awake = navigator.wakeLock?.request('screen').catch(() => null);
  try {
    const ff = await engine(say);
    say('준비 중…');
    const names = list.map((c, i) => `c${i}${ext(c.file.name)}`);
    const files = list.map((c, i) => new File([c.file], names[i]));
    if (opt.music) files.push(new File([opt.music], 'music' + ext(opt.music.name)));
    const data = await withMount(files, async (ff, dir) => {
      // first make sure no clip reaches past the end of its picture (lengths and text times depend on it)
      for (const [i, c] of list.entries()) {
        say(`영상 길이 확인 중… ${i + 1}/${list.length}`);
        c.vdur ??= c.ana?.vdur ?? await videoLen(ff, `${dir}/${names[i]}`);
        fitPicture(c, c.vdur);
      }
      const items = [];
      for (const [i, c] of list.entries()) {
        const it = { path: `${dir}/${names[i]}`, start: c.start, dur: c.end - c.start, hasAudio: false, trans: c.trans };
        if (keepOrig) it.hasAudio = c.ana ? c.ana.hasAudio : (await probe(ff, it.path)).hasAudio;
        if (keepOrig && c.fix) it.dips = spotsInRange(c).map((s) => ({ t0: Math.max(0, s.t0 - c.start), t1: Math.min(it.dur, s.t1 - c.start), gain: s.gain }));
        items.push(it);
      }
      const overlays = [];
      for (const [k, o] of texts.entries()) {
        const t1 = Math.min(o.t1, timeline().total);
        if (!o.text.trim() || t1 - o.t0 < 0.05) continue;
        const full = await layerCanvas(o, W, H), b = full.bb;
        const cv = Object.assign(document.createElement('canvas'), { width: b.w, height: b.h });
        cv.getContext('2d').drawImage(full, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
        const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
        overlays.push({ path: `ly${k}.png`, t0: o.t0, t1, ...b, fx: o.fx || 'none' });
        await ff.writeFile(`ly${k}.png`, new Uint8Array(await blob.arrayBuffer()));
      }
      const music = opt.music ? { path: `${dir}/music${ext(opt.music.name)}`, vol: opt.vol / 100 } : null;
      const { args, total } = buildArgs({ clips: items, overlays, music, keepOrig, fit: opt.fit, W, H, trSec: +opt.trSec });
      st.onLog = (m) => {
        const t = secOf(m);
        if (t == null) return;
        const p = Math.min(1, t / total), el = (Date.now() - t0) / 1000;
        bar(p);
        say(`만드는 중… ${Math.round(p * 100)}%${p > 0.05 ? ` (약 ${Math.ceil((el / p - el) / 60)}분 남음)` : ''}`);
      };
      say('만드는 중… 0%');
      const from = logs.length;
      const code = await ff.exec(args);
      if (code !== 0) throw new Error(logs.slice(from).slice(-8).join('\n'));
      const out = await ff.readFile('out.mp4');
      for (const o of overlays) await ff.deleteFile(o.path).catch(() => {});
      await ff.deleteFile('out.mp4').catch(() => {});
      return out;
    });
    showResult(new Blob([data.buffer], { type: 'video/mp4' }), (Date.now() - t0) / 1000);
  } catch (err) {
    console.error(err);
    resetEngine(); // a crashed (out of memory) engine can't be reused
    say(cancelled ? '영상 만들기를 그만했어요. 다시 하려면 🎬 영상 만들기를 눌러요.' : '만들기에 실패했어요. 영상이 길거나 기기 메모리가 부족할 수 있어요. 5번 모양 칸에서 "빠르게 720p"를 고르거나 영상을 짧게 잘라서 다시 해 보세요.');
    bar(0);
  } finally {
    st.onLog = null;
    awake?.then((w) => w?.release());
    lock(false);
  }
}

function showResult(blob, secs) {
  counter('videos', true).then((v) => showCount('#cMade', v));
  if (st.outUrl) URL.revokeObjectURL(st.outUrl);
  st.outUrl = URL.createObjectURL(blob);
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  const name = `릴스_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.mp4`;
  $('#outVideo').src = st.outUrl;
  $('#save').href = st.outUrl;
  $('#save').download = name;
  const file = new File([blob], name, { type: 'video/mp4' });
  const share = $('#share');
  share.hidden = !navigator.canShare?.({ files: [file] });
  share.onclick = () => navigator.share({ files: [file] }).catch(() => {});
  bar(1);
  say(`완성! (${(blob.size / 1048576).toFixed(1)} MB, ${Math.round(secs)}초 걸림)`);
  $('#saveRow').hidden = false;
  setView('result');
  $('#saveRow').scrollIntoView({ behavior: 'smooth', block: 'center' }); // the viewer box itself has no layout on phones
}
