import { t } from './i18n.js';
import { stopSeq, syncCtl } from './preview.js';
import { $, st, wake } from './state.js';
import { selectText } from './text.js';

/* ---------- one viewer: whole preview, the clip being cut, or the finished video ---------- */
let tab = 'add', view = 'seq';
export function setView(v) {
  view = v;
  const has = st.clips.length > 0;
  if (v !== 'seq') stopSeq();
  if (v !== 'result') $('#outVideo').pause();
  if (v !== 'clip') $('#clipSlot').querySelectorAll('video').forEach((x) => x.pause());
  else {
    if (st.sel.frame.parentNode !== $('#clipSlot')) $('#clipSlot').replaceChildren(st.sel.frame);
    const cv = st.sel.frame.querySelector('video'), c = st.sel; // open on the chosen part, not the start of the file
    const toStart = () => wake(cv).then(() => { if (cv.currentTime < c.start - 0.05 || cv.currentTime > c.end) cv.currentTime = c.start; });
    cv.readyState >= 1 ? toStart() : cv.addEventListener('loadedmetadata', toStart, { once: true });
  }
  $('#seqStage').hidden = v !== 'seq';
  $('#clipSlot').hidden = v !== 'clip';
  $('#result').hidden = v !== 'result';
  $('#empty').hidden = has || v === 'result';
  $('#ctlbar').hidden = !has && v !== 'result';
  $('#backEdit').hidden = v !== 'result';
  syncCtl();
  $('#viewName').textContent = v === 'result' ? '✨ 완성된 영상' : v === 'clip' ? `✂️ ${st.clips.indexOf(st.sel) + 1}번 영상 자르기` : '👀 미리보기';
}
export const refreshView = () => setView(view === 'result' ? 'result' : tab === 'cut' && st.sel ? 'clip' : 'seq');
export function goTab(t) {
  if (tab === 'text' && t !== 'text') selectText(null); // a tap on the preview should not move text from another step
  tab = t;
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  document.querySelectorAll('.pane').forEach((p) => (p.hidden = p.dataset.pane !== t));
  view = 'seq';
  refreshView();
}
// bring the step into view when its top is off screen or hidden low behind the phone tab bar
export const toPanel = () => { const t = $('.panel').getBoundingClientRect().top; if (t < 0 || t > innerHeight * 0.6) $('.panel').scrollIntoView({ behavior: 'smooth' }); };
$('.tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && !st.busy) { goTab(b.dataset.tab); toPanel(); } });
document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { goTab(b.dataset.go); toPanel(); }));
// 새로 만들기: everything lives in this page only, so a fresh page is a clean start (the engine stays in the browser cache)
document.querySelectorAll('.newProj').forEach((b) => b.addEventListener('click', () => {
  if (st.busy) return;
  if (st.clips.length && !confirm(t('지금 만든 내용(영상·글자·음악)이 모두 지워져요. 저장 안 한 영상은 사라져요.\n새로 만들까요?'))) return;
  location.reload();
}));
$('#backEdit').addEventListener('click', () => { view = 'seq'; refreshView(); });
export { view };
