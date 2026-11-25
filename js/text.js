import { t } from './i18n.js';
import { seqRun, showAt, stopSeq, timeline } from './preview.js';
import { $, dims, st } from './state.js';
import { FX, fxAt } from '../build.js';

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


/* ---------- text templates on the preview player: tap/drag to place, size slider, show time on the whole video ---------- */
// x, y = centre of the text as a share of the frame; size = letter height as a share of the short side
const TPL = {
  title: { name: '큰 제목', font: 'BHS', size: 0.11, y: 0.2, fill: '#fff', stroke: 'rgba(0,0,0,.85)', sample: '제목을 적어요' },
  sub: { name: '자막', font: 'DOH', size: 0.06, y: 0.72, fill: '#fff', box: 'rgba(0,0,0,.6)', sample: '자막을 적어요' },
  hl: { name: '강조', font: 'BHS', size: 0.09, y: 0.5, fill: '#ffe14d', stroke: '#000', sample: '여기 주목!' },
  tag: { name: '라벨', font: 'JUA', size: 0.06, y: 0.12, fill: '#111', box: '#ffcc00', sample: '오늘의 추천' },
  pen: { name: '손글씨', font: 'PEN', size: 0.1, y: 0.6, fill: '#fff', shadow: true, sample: '손글씨 메모' },
};
export let texts = [], curT = null; // text layers, the one being edited, preview time on the whole video
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export async function layerCanvas(o, W, H, cv = document.createElement('canvas')) {
  const T = TPL[o.tpl], font = o.font || T.font;
  await document.fonts.load(`40px ${font}`).catch(() => {});
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const px = Math.round(Math.min(W, H) * o.size * (font === 'PEN' ? 1.3 : 1)); // pen script draws small
  g.font = `${px}px ${font}, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  const lines = wrap(g, o.text.trim(), W * 0.9), lh = px * 1.25;
  const cx = o.x * W, cy = o.y * H, y0 = cy - ((lines.length - 1) * lh) / 2;
  if (T.box) {
    const w = Math.max(...lines.map((l) => g.measureText(l).width)) + px * 0.8, h = lines.length * lh + px * 0.3;
    g.fillStyle = T.box;
    g.beginPath(); g.roundRect(cx - w / 2, cy - h / 2, w, h, px * 0.3); g.fill();
  }
  if (T.shadow) { g.shadowColor = 'rgba(0,0,0,.85)'; g.shadowBlur = px * 0.25; }
  lines.forEach((l, i) => {
    const y = y0 + i * lh;
    if (T.stroke) { g.lineWidth = px * 0.18; g.strokeStyle = T.stroke; g.strokeText(l, cx, y); }
    g.fillStyle = o.fill || T.fill; g.fillText(l, cx, y);
  });
  // the drawn area (+ room for outline and shadow), whole even pixels: effects move and scale only this box
  const bw = Math.max(...lines.map((l) => g.measureText(l).width)) + (T.box ? px * 0.8 : 0) + px * 0.8;
  const bh = lines.length * lh + px * 0.8;
  const ev = (v) => Math.max(2, Math.round(v / 2) * 2);
  const x = ev(clamp(cx - bw / 2, 0, W - 2)), y = ev(clamp(cy - bh / 2, 0, H - 2));
  cv.bb = { x, y, w: ev(Math.min(bw, W - x)), h: ev(Math.min(bh, H - y)) };
  o.origin = `${(cx / W) * 100}% ${(cy / H) * 100}%`;
  return cv;
}
export const paintLayer = (o) => layerCanvas(o, ...dims('720'), o.cv).then(paintLayers);
// while playing: only texts whose time has come; while stopped: also the one being edited
export function paintLayers() {
  texts.forEach((o) => {
    o.cv.hidden = !o.text.trim() || !((!seqRun && o === curT) || (st.nowT >= o.t0 && st.nowT < o.t1));
    if (!o.cv.hidden && !(o.demoUntil > performance.now())) fxStyle(o, st.nowT - o.t0);
  });
}
// draw the effect at T seconds after the text appears (held still while it is being edited)
function fxStyle(o, T) {
  const editing = !seqRun && o === curT && !(o.demoUntil > performance.now());
  const f = editing ? { a: 1, dx: 0, dy: 0, s: 1 } : fxAt(o.fx || 'none', T, o.t1 - o.t0);
  o.cv.style.opacity = f.a;
  o.cv.style.transformOrigin = o.origin || '50% 50%';
  o.cv.style.transform = `translate(${f.dx * 100}%, ${f.dy * 100}%) scale(${f.s})`;
}
// shows the chosen effect once on the preview (up to 1.6 s)
function demoFx(o) {
  const t0 = performance.now(), D = Math.min(1.6, o.t1 - o.t0);
  o.demoUntil = t0 + D * 1000; // ends by time even if animation frames stop (hidden page)
  const step = () => {
    const T = (performance.now() - t0) / 1000;
    if (T >= D || o !== curT) { o.demoUntil = 0; fxStyle(o, 0); return; }
    fxStyle(o, T); requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

$('#tplRow').innerHTML = Object.entries(TPL).map(([k, t]) => `<button data-tpl="${k}" style="font-family:${t.font}">${t.name}</button>`).join('');
$('#lyTpl').innerHTML = Object.entries(TPL).map(([k, t]) => `<option value="${k}">${t.name}</option>`).join('');
$('#tplRow').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || st.busy) return;
  const T = TPL[b.dataset.tpl], { total } = timeline();
  const t0 = +clamp(st.nowT, 0, Math.max(0, total - 1)).toFixed(1);
  const o = { text: t(T.sample), tpl: b.dataset.tpl, x: 0.5, y: T.y, size: T.size, t0, t1: +Math.min(total, t0 + 3).toFixed(1), cv: document.createElement('canvas') };
  if (o.t1 <= o.t0) o.t1 = o.t0 + 3; // no clips measured yet
  o.cv.className = 'ly';
  $('#seqStage').append(o.cv);
  texts.push(o);
  selectText(o);
  paintLayer(o);
  $('#lyText').select();
});
function renderLayerList() {
  const box = $('#layerList');
  box.innerHTML = '';
  for (const o of texts) {
    const b = Object.assign(document.createElement('button'), { type: 'button', className: o === curT ? 'on' : '',
      textContent: `${TPL[o.tpl].name} · ${o.text.trim().slice(0, 12) || '(빈 글자)'} · ${o.t0.toFixed(1)}~${o.t1.toFixed(1)}초` });
    b.onclick = () => { if (!st.busy) { selectText(o); stopSeq(); showAt(o.t0); } };
    box.append(b);
  }
}
export function selectText(o) {
  curT = o;
  $('#layerEd').hidden = !o;
  $('#seqStage').classList.toggle('edit', !!o);
  if (o) {
    $('#lyText').value = o.text; $('#lyTpl').value = o.tpl;
    $('#lySize').value = Math.round(o.size * 100); $('#lySizeV').textContent = Math.round(o.size * 100);
    $('#lyT0').value = o.t0.toFixed(1); $('#lyT1').value = o.t1.toFixed(1);
    paintPicks(o);
  }
  renderLayerList();
  paintLayers();
}
function setTimes(o, t0, t1) {
  o.t0 = +Math.max(0, t0 || 0).toFixed(1);
  o.t1 = +Math.max(o.t0 + 0.3, t1 || 0).toFixed(1);
  $('#lyT0').value = o.t0.toFixed(1); $('#lyT1').value = o.t1.toFixed(1);
  renderLayerList(); paintLayers();
}
$('#lyText').addEventListener('input', (e) => { curT.text = e.target.value; paintLayer(curT); renderLayerList(); });
$('#lyTpl').addEventListener('change', (e) => { curT.tpl = e.target.value; curT.font = curT.fill = null; paintPicks(curT); paintLayer(curT); renderLayerList(); });
const FONTS = { BHS: '굵게', DOH: '깔끔', JUA: '귀엽게', PEN: '손글씨' };
const FX_NAMES = { none: '그대로', fade: '스르륵', up: '아래에서 쏙', left: '옆에서 휙', pop: '뿅', bounce: '통통', shake: '흔들흔들', blink: '깜빡깜빡' };
$('#lyFx').innerHTML = Object.keys(FX).map((k) => `<button data-fx="${k}">${FX_NAMES[k]}</button>`).join('');
$('#lyFx').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b || !curT) return; curT.fx = b.dataset.fx; paintPicks(curT); demoFx(curT); });
const COLORS = ['#ffffff', '#ffe14d', '#ff5a5f', '#4dd2ff', '#7cfc8a', '#111111'];
$('#lyFont').innerHTML = Object.entries(FONTS).map(([k, n]) => `<button data-f="${k}" style="font-family:${k}">${n}</button>`).join('');
$('#lyColor').innerHTML = COLORS.map((c) => `<button data-c="${c}" style="background:${c}" aria-label="색 ${c}"></button>`).join('');
function paintPicks(o) {
  const T = TPL[o.tpl];
  $('#lyFont').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.f === (o.font || T.font)));
  $('#lyColor').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.c === (o.fill || T.fill)));
  $('#lyFx').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.fx === (o.fx || 'none')));
}
$('#lyFont').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b || !curT) return; curT.font = b.dataset.f; paintPicks(curT); paintLayer(curT); });
$('#lyColor').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b || !curT) return; curT.fill = b.dataset.c; paintPicks(curT); paintLayer(curT); });
$('#lySize').addEventListener('input', (e) => { curT.size = +e.target.value / 100; $('#lySizeV').textContent = e.target.value; paintLayer(curT); });
$('#lyT0').addEventListener('change', (e) => setTimes(curT, +e.target.value, curT.t1));
$('#lyT1').addEventListener('change', (e) => setTimes(curT, curT.t0, +e.target.value));
$('#lyFrom').addEventListener('click', () => setTimes(curT, st.nowT, Math.max(curT.t1, st.nowT + 0.3)));
$('#lyTo').addEventListener('click', () => setTimes(curT, Math.min(curT.t0, st.nowT - 0.3), st.nowT));
$('#lyDel').addEventListener('click', () => { curT.cv.remove(); texts.splice(texts.indexOf(curT), 1); selectText(null); });
$('#lyDone').addEventListener('click', () => selectText(null));
// tap or drag on the preview moves the text being edited there
{
  const stage = $('#seqStage');
  stage.addEventListener('pointerdown', (e) => {
    if (!curT || st.busy || e.button > 0) return;
    e.preventDefault();
    stage.setPointerCapture(e.pointerId);
    const o = curT;
    const mv = (ev) => {
      const r = stage.getBoundingClientRect();
      o.x = clamp((ev.clientX - r.left) / r.width, 0.05, 0.95);
      o.y = clamp((ev.clientY - r.top) / r.height, 0.05, 0.95);
      paintLayer(o);
    };
    mv(e);
    stage.onpointermove = mv;
    stage.onpointerup = stage.onpointercancel = () => { stage.onpointermove = null; };
  });
}
