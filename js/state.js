import { TRANS_SEC } from '../build.js';

export const $ = (s) => document.querySelector(s);
export const opt = { fit: 'cover', keepOrig: '1', q: '1080', music: null, vol: 70, hlLen: '15', ratio: '9:16', trSec: String(TRANS_SEC) };
// output size for a quality ('1080' / '720') in the chosen shape
export const dims = (q) => { const [s, l] = q === '720' ? [720, 1280] : [1080, 1920]; return opt.ratio === '16:9' ? [l, s] : [s, l]; };
export const MIN = 0.3; // shortest clip in seconds
// transitions: key = ffmpeg xfade name ('cut' = none)
export const TRANS = {
  cut: { icon: '✂', name: '바로 넘기기 (컷)' },
  fade: { icon: '◐', name: '부드럽게 겹치기' },
  fadeblack: { icon: '●', name: '렌즈 가리기 (검은 화면)' },
  fadewhite: { icon: '✦', name: '하얀 번쩍' },
  zoomin: { icon: '◎', name: '빨려 들어가기 (줌)' },
  slideleft: { icon: '⇠', name: '옆으로 휙 밀기' },
  hblur: { icon: '≋', name: '흐려지며 넘기기' },
  circleopen: { icon: '⊙', name: '원으로 열기' },
  circleclose: { icon: '⊚', name: '원으로 닫기' },
  wipeleft: { icon: '◧', name: '닦아 내기' },
  slideup: { icon: '⇡', name: '위로 밀기' },
  fadegrays: { icon: '◑', name: '흑백으로 넘기기' },
  squeezeh: { icon: '⊟', name: '납작하게 접기' },
};
// Some browsers (iPhone/iPad Safari, data-saver Android) load nothing and paint black until a video has played once.
// A short muted play-then-pause makes it load; callers seek after this. Already-loaded videos return at once.
export async function wake(v) {
  if (v.readyState >= 2) return;
  const muted = v.muted;
  v.muted = true;
  const p = v.play();
  p?.catch(() => asleep.add(v)); // refused (iPhone Low Power Mode): try again on the first tap
  await Promise.race([p, new Promise((r) => setTimeout(r, 1500))]).catch(() => {});
  v.pause();
  v.muted = muted;
}
// A tap allows playing, so videos that refused to wake are woken (and re-seeked to repaint) on the first one,
// and other work waiting for it (scene pictures) runs again.
const asleep = new Set(), onTap = [];
export const afterTap = (fn) => onTap.push(fn);
const tapped = () => {
  if (!asleep.size && !onTap.length) return;
  const vs = [...asleep];
  asleep.clear();
  vs.forEach((v) => { const t = v.currentTime; wake(v).then(() => { v.currentTime = t; }); }); // play() starts inside the tap
  onTap.splice(0).forEach((fn) => fn());
};
['touchend', 'click'].forEach((e) => document.addEventListener(e, tapped, { capture: true, passive: true }));
// state more than one step changes (one object so every file sees the same values)
// clips: { file, url, dur, start, end, text, trans, fix, ana, el } · sel: clip being cut · backup: clips before highlights
export const st = { backup: null, busy: false, clips: [], nowT: 0, onLog: null, outUrl: null, sel: null, seq: 0 };
