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
};
// state more than one step changes (one object so every file sees the same values)
// clips: { file, url, dur, start, end, text, trans, fix, ana, el } · sel: clip being cut · backup: clips before highlights
export const st = { backup: null, busy: false, clips: [], nowT: 0, onLog: null, outUrl: null, sel: null, seq: 0 };
