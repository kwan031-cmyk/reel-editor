import { $ } from './state.js';

/* ---------- visitor / video counters ----------
   GitHub Pages can't store numbers, so a free no-signup counter service (CountAPI by mileshilliard; Abacus died 2026-11) keeps them.
   shortcut: if that service shuts down the counters just show "-"; move to own storage if that happens. */
const COUNT_API = 'https://countapi.mileshilliard.com/api/v1', COUNT_NS = 'sf-ttukdik';
const counting = location.hostname.endsWith('github.io'); // local tests don't add fake numbers
export async function counter(key, hit) {
  try {
    const r = await fetch(`${COUNT_API}/${hit && counting ? 'hit' : 'get'}/${COUNT_NS}-${key}`);
    if (r.status === 404) return 0; // never counted yet
    return r.ok ? (await r.json()).value : null;
  } catch { return null; }
}
export const showCount = (id, v) => { if (v != null) $(id).textContent = v.toLocaleString('ko-KR'); };
(async () => {
  const today = new Date().toISOString().slice(0, 10);
  let seen = null;
  try { seen = localStorage.getItem('visitDay'); localStorage.setItem('visitDay', today); } catch {} // once per browser per day
  showCount('#cVisit', await counter('visits', seen !== today));
  showCount('#cMade', await counter('videos', false));
})();

/* ---------- feedback box ----------
   Sends to a Google Form owned by the site admin; only the admin sees responses (Google Forms > Responses).
   no-cors: Google gives no readable reply, so a sent message can't be confirmed — only network failure is caught. */
const FB_FORM = '1FAIpQLSdk9VHF4wbMmGcIX-THY5s_O3-vFxm0mTmkksjYsGrlqMk44Q', FB_ENTRY = 'entry.1560983443';
$('#fbOpen').addEventListener('click', () => { $('#fbMsg').textContent = ''; $('#fbDlg').showModal(); });
$('#fbClose').addEventListener('click', () => $('#fbDlg').close());
$('#fbSend').addEventListener('click', async () => {
  const text = $('#fbText').value.trim();
  if (!text) { $('#fbMsg').textContent = '내용을 적어 주세요.'; return; }
  $('#fbSend').disabled = true; $('#fbMsg').textContent = '보내는 중...';
  try {
    await fetch(`https://docs.google.com/forms/d/e/${FB_FORM}/formResponse`, { method: 'POST', mode: 'no-cors', body: new URLSearchParams({ [FB_ENTRY]: text, pageHistory: '0,1' }) }); // pageHistory: the form has 2 sections
    $('#fbText').value = ''; $('#fbMsg').textContent = '고마워요! 잘 전달됐어요 🙏';
  } catch { $('#fbMsg').textContent = '인터넷 연결을 확인하고 다시 눌러 주세요.'; }
  $('#fbSend').disabled = false;
});
