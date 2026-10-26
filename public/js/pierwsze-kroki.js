// „Pierwsze kroki”: nakładka nad dashboardem (tło widoczne) z kreatorem instalacji i sprawdzeniem gotowości.
// Świeża instalacja: Witaj (język) → Token (wklejenie sprawdza od razu) → Strona (odpytywanie co 3 s, bez wklejania adresów)
// → Dziennik (jeden przycisk, postęp, „Ponów”) → Gotowość (sprawdzenie końcowe) → Przewodnik. Skonfigurowana instalacja:
// Witaj → Gotowość („Napraw wszystko”) → Przewodnik; token i dostęp do strony wracają do odpowiedniego kroku kreatora.
// Sprawdzenia tylko czytają; zapis w Notion wyłącznie po jawnym kliknięciu. Token nie trafia do localStorage ani do konsoli.
// English: onboarding overlay with the in-browser setup wizard and readiness checks.
import { esc } from './format.js';
import { overlay, trapTab, toast } from './modal.js';
import { t, getLang, rememberLang } from './i18n.js';
import { poradnikLink, bindPoradniki, platform } from './poradnik.js';

const svg = (body, s = 16, sw = 1.8) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
// Logo usług tylko do identyfikacji (Notion, GitHub, Node.js), monochromatyczne, w kolorze tekstu.
export const LOGO = {
  notion: `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4.4 3.3 15 2.5c1.3-.1 1.7 0 2.5.6l3.5 2.4c.6.4.8.6.8 1.1v13.2c0 .8-.3 1.3-1.4 1.4L8 22c-.8 0-1.2-.1-1.6-.6l-2.5-3.2c-.4-.6-.6-1-.6-1.6V4.8c0-.8.3-1.4 1.1-1.5Z" opacity=".16"/><path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" d="M4.4 3.3 15 2.5c1.3-.1 1.7 0 2.5.6l3.5 2.4c.6.4.8.6.8 1.1v13.2c0 .8-.3 1.3-1.4 1.4L8 22c-.8 0-1.2-.1-1.6-.6l-2.5-3.2c-.4-.6-.6-1-.6-1.6V4.8c0-.8.3-1.4 1.1-1.5Z"/><path fill="currentColor" d="M8.3 8.2v9.6h1.5v-6.6l4.6 7 1.6-.1V8l-1.5.1v6.2l-4.4-6.3Z"/></svg>`,
  github: `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2 0 1.9 1.2 1.9 1.2 1 1.8 2.8 1.3 3.5 1 0-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.3-3.1-.2-.4-.6-1.6 0-3.2 0 0 1-.3 3.4 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.8 0 3.2.9.8 1.3 1.9 1.3 3.2 0 4.6-2.8 5.6-5.5 5.9.5.4.9 1 .9 2.2v3.3c0 .3.1.7.8.6A12 12 0 0 0 12 .3"/></svg>`,
  node: svg('<path d="M12 2.5 20.5 7.4v9.2L12 21.5 3.5 16.6V7.4Z"/><path d="M9.5 9.5v5M9.5 9.5l5 5v-5"/>', 18, 1.5),
  lock: svg('<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>', 18, 1.6),
  db: svg('<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/>', 18, 1.5),
  fields: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M3.5 9.5h17M9.5 9.5v10"/>', 18, 1.5),
  views: svg('<rect x="3.5" y="4.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="4.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="14.5" width="7" height="5" rx="1.5"/><rect x="13.5" y="14.5" width="7" height="5" rx="1.5"/>', 18, 1.5),
  pen: svg('<path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/>', 18, 1.6),
  tag: svg('<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3-8.7 8.7Z"/><circle cx="8" cy="8" r="1.4"/>', 18, 1.5),
  page: svg('<path d="M6 3.5h8l4 4v13H6Z"/><path d="M14 3.5v4h4M9 12h6M9 15.5h6"/>', 18, 1.5),
};
const ICON = {
  ok: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>', 16, 2.4),
  warn: svg('<path d="M12 7v6M12 17h.01"/>', 16, 2.6),
  error: svg('<path d="M7 7l10 10M17 7 7 17"/>', 16, 2.4),
  info: svg('<path d="M12 11v6M12 7.5h.01"/>', 16, 2.4),
  wait: svg('<path d="M8 12h8"/>', 16, 2.2),
  pending: svg('<circle cx="12" cy="12" r="2.5" fill="currentColor"/>', 14, 1.8),
  ext: svg('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>', 13, 1.8),
  copy: svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>', 13, 1.8),
};
const STEP_NAME = { witaj: 'Witaj', token: 'Token', strona: 'Strona', dostep: 'Dostęp', dziennik: 'Dziennik', gotowosc: 'Gotowość', przewodnik: 'Przewodnik' };
const DB_NAME = { trades: "Trade'y", konta: 'Konta', dziennik: 'Dziennik', finanse: 'Wydatki i payouty' };
const BUILD_STEP = { page: 'Strona dziennika', databases: 'Bazy', relations: 'Relacje', formulas: 'Formuły', views: 'Widoki', demo: 'Dane przykładowe', save: 'Zapis konfiguracji' };
// wait: sprawdzenie zależy od czegoś, co trzeba poprawić wcześniej (np. token); nie liczy się jako osobny problem
const STATUS_WORD = { ok: 'gotowe', warn: 'uwaga', error: 'błąd', info: 'informacja', run: 'sprawdzam', wait: 'czeka' };
const INTEGRATIONS_URL = 'https://www.notion.so/profile/integrations';
const INTEGRATION_NAME = 'Local Trading Journal';
const RESUME_KEY = 'thq.obResume';

async function call(url, body) {
  const r = await fetch(url, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-THQ': '1' }, body: JSON.stringify(body) });
  let j = {};
  try { j = await r.json(); } catch { /* brak treści */ }
  if (!r.ok) throw Object.assign(new Error(j.error || t('Błąd {status}', { status: r.status })), { status: r.status, code: j.code, fields: j.fields });
  return j;
}
const post = (url, body = {}) => call(url, body);
const get = (url) => call(url);
const L = (s, p) => esc(t(s, p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createOnboarding({ getMeta = () => ({}), onGuide = () => {}, onUpdate = () => {}, onDone = () => {}, onConfigured = async () => {}, onAttention = () => {} } = {}) {
  let root = null, card = null, step = 0, opener = null, flow = ['witaj', 'gotowosc', 'przewodnik'];
  let setup = null;            // /api/setup/state
  let fresh = false;           // kreator świeżej instalacji (po sprawdzeniu OK przechodzi sam do przewodnika)
  let res = null, running = false, runErr = '';
  const open = { schema: null, demo: null, fix: null };
  const tok = { replace: false, checking: false, ok: null, err: '', timer: 0, last: '' };
  const pg = { pages: null, err: '', sel: '', timer: 0, sig: '', autoNext: 0 };
  const mk = { pageId: '', title: '', demo: true, job: null, starting: false, err: '', timer: 0, done: false };
  let tests = 0;

  const cur = () => flow[step];
  const stopTimers = () => { clearTimeout(tok.timer); clearInterval(pg.timer); pg.timer = 0; clearTimeout(pg.autoNext); clearInterval(mk.timer); mk.timer = 0; };

  // ---------- krok: Witaj ----------
  function welcomeHtml() {
    const row = (logo, title, text) => `<li class="ck"><span class="ck-logo">${logo}</span><span class="ck-txt"><b>${L(title)}</b><span>${L(text)}</span></span></li>`;
    const lang = getLang();
    const help = platform() === 'mac'
      ? [['macos-open', 'macOS: „Nie można otworzyć aplikacji”'], ['smartscreen', 'Windows: ostrzeżenie SmartScreen']]
      : [['smartscreen', 'Windows: ostrzeżenie SmartScreen'], ['macos-open', 'macOS: „Nie można otworzyć aplikacji”']];
    return `<h1 class="ob-h" id="ob-title" tabindex="-1">${L('Pierwsze kroki')}</h1>
      <p class="ob-lead">${fresh ? L('Połączymy dashboard z Twoim Notion. Wkleisz token i udostępnisz jedną stronę, resztę zrobimy sami.') : L('Najpierw sprawdzimy, czy dashboard jest gotowy do pracy z Twoim dziennikiem w Notion. Potem w kilku krokach pokażemy, jak działa, na danych przykładowych.')}</p>
      <div class="ob-lang"><span class="lbl" id="ob-lang">${L('Język')}</span><div class="seg" role="group" aria-labelledby="ob-lang"><button type="button" data-ob="lang" data-v="pl" aria-pressed="${lang === 'pl'}" lang="pl">Polski</button><button type="button" data-ob="lang" data-v="en" aria-pressed="${lang === 'en'}" lang="en">English</button></div></div>
      <ul class="ck-list plain">
        ${row(LOGO.notion, 'Dane zostają w Twoim Notion', 'Dashboard czyta i zapisuje wpisy przez Twoją integrację. Nie ma tu żadnej chmury pośredniej.')}
        ${row(LOGO.lock, 'Działa tylko na tym komputerze', 'Serwer słucha na 127.0.0.1, a token Notion nie trafia do przeglądarki.')}
        ${row(LOGO.github, 'Aktualizacje bez utraty danych', 'Nowe wersje z GitHub. Przed zmianami w Notion zawsze powstaje kopia baz.')}
      </ul>
      <div class="ob-help"><span class="lbl">${L('Pomoc z instalacją')}</span>${help.map(([id, label]) => poradnikLink([id], { label: t(label) })).join('')}</div>`;
  }

  // ---------- krok: Token ----------
  function tokenStatusHtml() {
    if (tok.checking) return `<p class="ob-status run"><span class="spin" aria-hidden="true"></span>${L('Sprawdzam token…')}</p>`;
    if (tok.ok) return `<p class="ob-status ok">${ICON.ok}${L('Połączono: {name}', { name: [tok.ok.name, tok.ok.workspace].filter(Boolean).join(' · ') || 'Notion' })}</p>`;
    if (tok.err) return `<p class="ob-status err" role="alert">${ICON.error}${esc(tok.err)}</p>`;
    return '';
  }
  function tokenHtml() {
    return `<h1 class="ob-h" id="ob-title" tabindex="-1">${L('Token Notion')}</h1>
      <p class="ob-lead">${tok.replace ? L('Wklej nowy token. Stary zostanie zastąpiony dopiero wtedy, gdy nowy zadziała.') : L('Dashboard łączy się z Notion przez Twoją własną integrację. Utwórz ją i wklej jej token.')}</p>
      <a class="btn ob-cta" href="${INTEGRATIONS_URL}" target="_blank" rel="noopener">${LOGO.notion}${L('Utwórz integrację w Notion')}${ICON.ext}</a>
      <ol class="ck-how ob-how">
        <li>${L('Kliknij New integration.')}</li>
        <li>${L('Nazwa:')} <code>${INTEGRATION_NAME}</code> <button type="button" class="btn ghost sm ob-copy" data-ob="copy" data-v="${INTEGRATION_NAME}">${ICON.copy}${L('Kopiuj')}</button>${L(', typ Internal, Twój workspace. Zapisz.')}</li>
        <li>${L('Przy Internal Integration Secret kliknij Show, skopiuj token i wklej go poniżej.')}</li>
      </ol>
      ${poradnikLink(['notion-integracja', 'notion-token'])}
      <div class="fld ob-field"><label class="lbl" for="ob-token">${L('Wklej token')}</label>
        <input id="ob-token" type="password" autocomplete="off" spellcheck="false" autocapitalize="off" placeholder="ntn_…" aria-describedby="ob-token-st">
        <div id="ob-token-st" aria-live="polite">${tokenStatusHtml()}</div></div>`;
  }
  function paintTokenStatus() { const el = card?.querySelector('#ob-token-st'); if (el) el.innerHTML = tokenStatusHtml(); paintFoot(); }
  async function checkToken(value) {
    const token = String(value || '').trim();
    if (!token || token === tok.last) return;
    tok.last = token;
    tok.checking = true; tok.err = ''; tok.ok = null; paintTokenStatus();
    try {
      const r = await post('/api/setup/token', { token, replace: tok.replace || undefined });
      tok.ok = { name: r.name, workspace: r.workspace };
    } catch (e) {
      if (e.code === 'has-token') tok.ok = { name: t('token jest już zapisany'), workspace: '' };
      else tok.err = e.fields?.token || e.message;
    }
    tok.checking = false;
    const input = card?.querySelector('#ob-token');
    if (tok.ok && input) { input.value = ''; tok.last = ''; } // token nie zostaje w polu
    paintTokenStatus();
    if (tok.ok) { await onConfigured({ token: true }); setTimeout(() => { if (cur() === 'token') next(); }, 700); }
  }

  // ---------- krok: Strona (i Dostęp) ----------
  const pageIcon = (p) => (p.icon && !/^https?:/.test(p.icon) ? `<span class="pg-emoji" aria-hidden="true">${esc(p.icon)}</span>` : LOGO.page);
  function pagesZoneHtml() {
    const access = cur() === 'dostep';
    const pages = pg.pages || [];
    const waiting = `<p class="ob-wait live"><span class="pulse" aria-hidden="true"></span>${L('Czekam na udostępnienie strony…')}</p>`;
    const how = `<ol class="ck-how ob-how"><li>${L('Otwórz w Notion dowolną stronę na dziennik (może być pusta).')}</li><li>${L('Kliknij ••• → Połączenia (Connections) i wybierz integrację Local Trading Journal.')}</li></ol>`;
    if (pg.err) return `<p class="ob-status err" role="alert">${ICON.error}${esc(pg.err)}</p>${how}`;
    if (pg.pages === null) return `<p class="ob-wait"><span class="spin" aria-hidden="true"></span>${L('Szukam stron udostępnionych integracji…')}</p>`;
    if (!pages.length || (access && !pages.some((p) => p.journal))) return `${how}${waiting}${poradnikLink(['notion-polaczenia'])}`;
    const sel = pages.find((p) => p.id === pg.sel);
    return `<ul class="pg-list" role="radiogroup" aria-label="${L('Strony w Notion')}">${pages.map((p) => `<li><button type="button" class="pg" role="radio" aria-checked="${p.id === pg.sel}" data-ob="page" data-v="${esc(p.id)}">
        <span class="ck-logo">${pageIcon(p)}</span><span class="ck-txt"><b>${esc(p.title || t('Bez tytułu'))}</b><span>${p.journal ? L('Jest tu już dziennik') : p.partial ? esc(t('Niepełny dziennik, brakuje: {list}', { list: p.partial.map((d) => t(DB_NAME[d] || d)).join(', ') })) : L('Nowy dziennik powstanie w tej stronie')}</span></span>
        ${p.journal ? `<span class="um-add">${L('dziennik')}</span>` : ''}</button></li>`).join('')}</ul>
      ${sel?.journal ? `<p class="fhint">${L('Na tej stronie jest już dziennik (np. z innego komputera). Połączymy go bez zmian w Notion.')}</p>` : ''}
      <details class="ob-more"><summary>${L('Nie widzisz swojej strony?')}</summary>${how}${poradnikLink(['notion-polaczenia'])}</details>`;
  }
  function pagesHtml() {
    const access = cur() === 'dostep';
    return `<h1 class="ob-h" id="ob-title" tabindex="-1">${access ? L('Dostęp do dziennika') : L('Strona w Notion')}</h1>
      <p class="ob-lead">${access ? L('Integracja nie widzi strony z dziennikiem. Udostępnij ją, a dashboard sam to zauważy.') : L('Wskaż stronę, w której powstanie dziennik. Integracja widzi tylko strony, które jej udostępnisz.')}</p>
      <div class="pg-zone">${pagesZoneHtml()}</div>`;
  }
  async function pollPages() {
    try {
      const r = await post('/api/setup/pages');
      pg.err = '';
      const before = (pg.pages || []).length;
      pg.pages = r.pages || [];
      if (!pg.sel || !pg.pages.some((p) => p.id === pg.sel)) pg.sel = (pg.pages.find((p) => p.journal) || pg.pages[0])?.id || '';
      const sig = JSON.stringify([pg.pages.map((p) => [p.id, p.title, !!p.journal, p.partial]), pg.sel, pg.err]);
      if (sig !== pg.sig) { pg.sig = sig; const z = card?.querySelector('.pg-zone'); if (z) { z.innerHTML = pagesZoneHtml(); bindPoradniki(z); } paintFoot(); }
      // przejście dalej bez klikania: dostęp przywrócony albo pierwsza udostępniona strona (jedna, bez dziennika)
      if (cur() === 'dostep' && pg.pages.some((p) => p.journal)) { stopTimers(); toast(t('Integracja widzi dziennik.')); goTo('gotowosc', { recheck: true }); return; }
      if (cur() === 'strona' && before === 0 && pg.pages.length === 1 && !pg.pages[0].journal) {
        clearTimeout(pg.autoNext);
        pg.autoNext = setTimeout(() => { if (cur() === 'strona') choosePage(); }, 900);
      }
    } catch (e) {
      if (e.code === 'no-token') { stopTimers(); goTo('token'); return; }
      pg.err = e.message;
      const z = card?.querySelector('.pg-zone'); if (z) z.innerHTML = pagesZoneHtml();
    }
  }
  function startPagesPoll() { stopTimers(); pg.sig = ''; pollPages(); pg.timer = setInterval(pollPages, 3000); }
  async function choosePage() {
    const p = (pg.pages || []).find((x) => x.id === pg.sel);
    if (!p) return;
    if (p.journal) {
      try {
        const r = await post('/api/setup/connect', { pageId: p.id });
        toast(t('Połączono istniejący dziennik.'));
        await afterInstall(r.lang);
      } catch (e) { pg.err = e.message; const z = card?.querySelector('.pg-zone'); if (z) z.innerHTML = pagesZoneHtml(); }
      return;
    }
    mk.pageId = p.id; mk.title = p.title;
    goTo('dziennik');
  }

  // ---------- krok: Dziennik ----------
  function buildHtml() {
    const job = mk.job;
    const st = job?.steps || [];
    let body = '';
    if (job || mk.starting) {
      const done = st.filter((s) => s.status === 'done' || s.status === 'skipped').length;
      body = `<div class="um-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${st.length || 7}" aria-valuenow="${done}" aria-label="${L('Postęp tworzenia dziennika')}"><i style="width:${st.length ? (done / st.length) * 100 : 4}%"></i></div>
        <ol class="um-steps">${st.map((s) => `<li class="st-${s.status}"><span class="um-ic">${s.status === 'running' ? '<span class="spin" aria-hidden="true"></span>' : s.status === 'done' ? ICON.ok : s.status === 'error' ? ICON.error : s.status === 'skipped' ? ICON.wait : ICON.pending}</span><span>${L(BUILD_STEP[s.id] || s.id)}</span><span class="sr">(${L({ pending: 'czeka', running: 'w toku', done: 'gotowe', error: 'błąd', skipped: 'pominięte' }[s.status] || s.status)})</span></li>`).join('')}</ol>`;
      if (job?.error) body += `<div class="um-err" role="alert"><b>${L('Tworzenie przerwane')}</b><p>${esc(job.error.message)}</p><p class="fhint">${L('„Ponów” wznowi od miejsca przerwania. To, co już powstało, nie zostanie zdublowane.')}</p></div>`;
      if (job?.done) {
        const sv = job.skippedViews || [];
        body += `<p class="ob-status ok">${ICON.ok}${L('Dziennik jest gotowy.')}</p>`;
        if (sv.length) body += `<p class="fhint">${esc(t.p('API Notion nie utworzyło {n} widoków: ', sv.length) + sv.map((v) => `${v.name} (${t(DB_NAME[v.db] || v.db)})`).join(', '))}. ${L('Dodasz je ręcznie, patrz README, sekcja „Widoki ręcznie”. Dashboard działa bez nich.')}</p>`;
      }
    }
    return `<h1 class="ob-h" id="ob-title" tabindex="-1">${L('Utwórz dziennik')}</h1>
      <p class="ob-lead">${L('W stronie „{title}” powstanie podstrona z czterema bazami: Trade\'y, Konta, Dziennik oraz Wydatki i payouty. Niczego obok nie zmienimy.', { title: mk.title || t('wybrana strona') })}</p>
      <label class="check big ob-demo"><input type="checkbox" id="ob-demo" ${mk.demo ? 'checked' : ''} ${job?.running || mk.starting || job?.done ? 'disabled' : ''}><span>${L('Dodaj przykładowe wpisy DEMO (usuniesz je jednym kliknięciem w gotowości)')}</span></label>
      <div class="ob-build" aria-live="polite">${body}</div>`;
  }
  function paintBuild() { const b = card?.querySelector('.ob-build'); if (b && cur() === 'dziennik') { const keepDemo = card.querySelector('#ob-demo'); card.querySelector('.ob-body').innerHTML = buildHtml(); void keepDemo; } paintFoot(); }
  async function startBuild() {
    mk.starting = true; mk.err = '';
    mk.demo = card?.querySelector('#ob-demo')?.checked ?? mk.demo;
    paintBuild();
    try { await post('/api/setup/create', { pageId: mk.pageId, lang: getLang(), demo: mk.demo }); }
    catch (e) {
      if (e.code !== 'running') { mk.starting = false; mk.job = { ...(mk.job || { steps: [] }), running: false, error: { message: e.code === 'already' ? t('Dziennik jest już utworzony.') : e.message } }; paintBuild(); if (e.code === 'already') afterInstall(); return; }
    }
    clearInterval(mk.timer);
    mk.timer = setInterval(async () => {
      try { mk.job = await get('/api/setup/status'); } catch { return; }
      mk.starting = false;
      paintBuild();
      if (mk.job.done || mk.job.error) {
        clearInterval(mk.timer); mk.timer = 0;
        if (mk.job.done) { mk.done = true; await sleep(mk.job.skippedViews?.length ? 2200 : 700); afterInstall(); }
      }
    }, 700);
  }
  async function afterInstall(lang) {
    if (lang && lang !== getLang()) { rememberLang(lang); try { sessionStorage.setItem(RESUME_KEY, 'gotowosc'); } catch { /* brak */ } location.reload(); return; }
    await onConfigured({ installed: true });
    setup = await get('/api/setup/state').catch(() => setup);
    goTo('gotowosc', { recheck: true });
  }

  // ---------- krok: Gotowość ----------
  const statusHtml = (st) => `<span class="ck-st st-${st}">${st === 'run' ? '<span class="spin" aria-hidden="true"></span>' : ICON[st]}<span class="sr">${L(STATUS_WORD[st] || st)}</span></span>`;
  let issueCount = 0;
  function row({ key, logo, title, text, st, fix = '', action = '' }) {
    if (st === 'error' || st === 'warn') issueCount++;
    return `<li class="ck${st === 'error' || st === 'warn' ? ' has-fix' : ''}" data-ck="${esc(key)}"><span class="ck-logo">${logo}</span>
      <span class="ck-txt"><b>${esc(title)}</b><span>${text}</span></span>${statusHtml(st)}
      ${fix || action ? `<div class="ck-fix">${fix}${action ? `<div class="ck-act">${action}</div>` : ''}</div>` : ''}</li>`;
  }
  const kindWord = (k) => t(k === 'option' ? 'opcja' : k === 'view' ? 'widok' : 'pole');
  function changesList(changes) {
    const seen = new Set();
    const ch = (changes || []).filter((c) => { const k = `${c.db}|${c.kind}|${c.name}`; if (seen.has(k)) return false; seen.add(k); return true; });
    return ch.length ? `<ul class="ck-changes">${ch.map((c) => `<li${c.status === 'conflict' ? ' class="conflict"' : ''}><span class="um-add">${c.status === 'conflict' ? L('konflikt') : L('dodane')}</span>${esc(kindWord(c.kind))} „${esc(c.name)}” · ${esc(t(DB_NAME[c.db] || c.db))}${c.detail && !/^[a-z_]+$/.test(String(c.detail)) ? `<small>${esc(c.detail)}</small>` : ''}</li>`).join('')}</ul>` : '';
  }
  function fixAllHtml() {
    const s = open.fix;
    if (!s) return '';
    if (s.loading) return `<div class="ck-fix ob-fixall"><p class="ob-wait"><span class="spin" aria-hidden="true"></span>${L('Sprawdzam, co da się naprawić…')}</p></div>`;
    if (s.err) return `<div class="ck-fix ob-fixall"><p class="ferr">${L('Nie udało się: {msg}', { msg: s.err })}</p></div>`;
    const d = s.data || {};
    const list = changesList(d.changes);
    const man = (d.manual || []).length ? `<p class="fhint">${L('Do dodania ręcznie w Notion:')} ${d.manual.map((m) => esc(`${m.name} (${t(DB_NAME[m.db] || m.db)})`)).join(', ')}</p>` : '';
    const sc = d.shortcut === 'missing' ? `<p>${L('Utworzę skrót „Otwórz journal w Notion” w folderze dashboardu.')}</p>` : '';
    const nothing = !list && !sc;
    return `<div class="ck-fix ob-fixall"><p class="ck-plan-h">${nothing ? L('Nie ma nic do naprawienia automatycznie.') : L('Zostanie dodane w Notion (nic nie zostanie usunięte ani nadpisane):')}</p>${list}${sc}${man}
      <div class="ck-act">${nothing ? '' : `<button type="button" class="btn primary sm" data-ob="fixall-apply" ${s.applying ? 'disabled' : ''}>${s.applying ? L('Naprawiam…') : L('Napraw')}</button>`}<button type="button" class="btn ghost sm" data-ob="fixall-cancel">${L('Anuluj')}</button></div></div>`;
  }
  function demoAction() {
    const s = open.demo;
    if (!s) return `<button type="button" class="btn sm" data-ob="demo-preview">${L('Usuń dane DEMO')}</button>`;
    if (s.loading) return `<p class="ob-wait"><span class="spin" aria-hidden="true"></span>${L('Szukam wpisów DEMO…')}</p>`;
    if (s.err) return `<p class="ferr">${L('Nie udało się: {msg}', { msg: s.err })}</p>`;
    const n = s.data?.count || 0;
    return `<div class="ck-plan"><p class="ck-plan-h">${esc(t.p('{n} wpisów DEMO trafi do kosza Notion (da się je przywrócić w Notion).', n))}</p>
      <div class="ck-act"><button type="button" class="btn primary sm danger" data-ob="demo-apply" ${s.applying || !n ? 'disabled' : ''}>${s.applying ? L('Usuwam…') : esc(t.p('Usuń {n} wpisów', n))}</button><button type="button" class="btn ghost sm" data-ob="demo-cancel">${L('Anuluj')}</button></div></div>`;
  }
  function rowBase(id) {
    const base = {
      node: [LOGO.node, 'Node.js'], token: [LOGO.notion, 'Token Notion'], root: [LOGO.notion, 'Strona dziennika'], databases: [LOGO.db, 'Bazy'],
      schema: [LOGO.fields, 'Pola w bazach'], views: [LOGO.views, 'Widoki w Notion'], write: [LOGO.pen, 'Zapis do Notion'],
      security: [LOGO.lock, 'Tylko ten komputer'], update: [LOGO.github, 'Aktualizacje'], demo: [LOGO.tag, 'Dane przykładowe DEMO'],
    }[id] || [LOGO.db, id];
    return { logo: base[0], title: t(base[1]) };
  }
  function checksHtml() {
    const head = `<h1 class="ob-h" id="ob-title" tabindex="-1">${L('Gotowość')}</h1>`;
    if (!res && running) {
      const ids = ['node', 'token', 'root', 'databases', 'schema', 'views', 'write', 'security', 'update'];
      return `${head}<p class="ob-lead">${L('Sprawdzam połączenie z Notion i bazy. To tylko odczyt.')}</p><ul class="ck-list">${ids.map((id) => row({ key: id, ...rowBase(id), text: L('Sprawdzam…'), st: 'run' })).join('')}</ul>`;
    }
    if (!res) return `${head}<p class="ob-lead">${runErr ? L('Nie udało się sprawdzić: {msg}', { msg: runErr }) : ''}</p><div class="ck-act"><button type="button" class="btn" data-ob="recheck">${L('Sprawdź ponownie')}</button></div>`;
    const by = Object.fromEntries(res.checks.map((c) => [c.id, c]));
    issueCount = 0;
    const rows = [];
    const c = (id) => by[id] || { status: 'info', detail: '' };
    const blockedSt = (x) => (x.code === 'blocked' ? 'wait' : x.status);
    const nd = c('node');
    rows.push(row({ key: 'node', ...rowBase('node'), st: nd.status, text: nd.status === 'ok' ? L('{v}. Wymagana wersja 22 lub nowsza.', { v: nd.detail }) : L('{v}. Potrzebny jest Node.js 22 lub nowszy.', { v: nd.detail }),
      fix: nd.status === 'ok' ? '' : `<p>${L('Zainstaluj Node.js 22 LTS ze strony')} <a href="https://nodejs.org" target="_blank" rel="noopener">nodejs.org</a> ${L('i uruchom dashboard ponownie.')}</p>${poradnikLink([platform() === 'mac' ? 'node-macos' : 'node-windows'])}` }));
    const tk = c('token');
    rows.push(row({ key: 'token', ...rowBase('token'), st: tk.status,
      text: tk.status === 'ok' ? L('Połączono jako {name}.', { name: tk.detail }) : tk.code === 'missing' ? L('Brak tokenu.') : tk.code === 'invalid' ? L('Notion odrzucił token: wygasł albo jest błędny.') : esc(tk.detail),
      fix: tk.status === 'ok' ? '' : poradnikLink(['token-zmiana'], { label: t('Jak zmienić token w Ustawieniach') }),
      action: tk.status === 'ok' ? '' : `<button type="button" class="btn primary sm" data-ob="goto-token">${L('Wklej nowy token')}</button>` }));
    const rt = c('root');
    const noAccess = rt.code === 'noaccess' || (c('databases').items || []).some((d) => d.code === 'noaccess');
    rows.push(row({ key: 'root', ...rowBase('root'), st: blockedSt(rt),
      text: rt.status === 'ok' ? `${esc(rt.detail)}${rt.url ? ` · <a href="${esc(rt.url)}" target="_blank" rel="noopener">${L('otwórz')}${ICON.ext}</a>` : ''}` : rt.code === 'none' ? L('Brak adresu strony z dziennikiem.') : esc(rt.detail),
      fix: rt.code === 'none' ? `<p>${L('Dashboard działa, brakuje tylko linków do Notion. „Napraw wszystko” albo ponowne połączenie strony to uzupełni.')}</p>` : '',
      action: rt.code === 'noaccess' ? `<button type="button" class="btn primary sm" data-ob="goto-access">${L('Udostępnij stronę')}</button>` : '' }));
    for (const d of c('databases').items || []) {
      rows.push(row({ key: `db-${d.db}`, logo: LOGO.db, title: t('Baza {name}', { name: d.title || t(DB_NAME[d.db] || d.db) }), st: blockedSt(d),
        text: d.status === 'ok' ? esc(t.p('{n} wpisów', d.count || 0)) : esc(d.detail || ''),
        action: d.code === 'noaccess' && rt.code !== 'noaccess' ? `<button type="button" class="btn primary sm" data-ob="goto-access">${L('Udostępnij stronę')}</button>` : d.code === 'missing' ? `<button type="button" class="btn sm" data-ob="goto-page">${L('Wybierz stronę dziennika')}</button>` : '' }));
    }
    const sc = c('schema');
    const missing = sc.missing || [];
    const scBlocked = sc.status === 'error' && !missing.length && !(c('databases').items || []).some((d) => d.status === 'ok');
    rows.push(row({ key: 'schema', ...rowBase('schema'), st: scBlocked ? 'wait' : sc.status,
      text: sc.status === 'ok' ? L('Wszystkie pola są na miejscu (schemat {v}).', { v: sc.current }) : scBlocked ? L('Najpierw popraw token i bazy.') : missing.length ? esc(t.p('Brakuje {n} pól: ', missing.length) + missing.map((m) => `${m.name} (${t(DB_NAME[m.db] || m.db)})`).join(', ')) : L('Schemat w Notion jest starszy niż ta wersja ({a} → {b}).', { a: sc.installed, b: sc.current }) }));
    const vw = c('views');
    const vm = vw.missing || [];
    rows.push(row({ key: 'views', ...rowBase('views'), st: scBlocked ? 'wait' : vw.status,
      text: scBlocked ? L('Najpierw popraw token i bazy.') : vw.status === 'ok' ? L('Widoki dziennika są w Notion.') : esc(t.p('Brakuje {n} widoków: ', vm.length) + vm.map((v) => `${v.name} (${t(DB_NAME[v.db] || v.db)})`).join(', ')) }));
    const wr = c('write');
    rows.push(row({ key: 'write', ...rowBase('write'), st: wr.code === 'skipped' ? 'info' : blockedSt(wr), text: wr.code === 'skipped' ? L('Sprawdzane przy pełnym sprawdzeniu.') : esc(wr.detail),
      fix: wr.status === 'error' && wr.code !== 'blocked' ? `<p>${L('W ustawieniach integracji w Notion zaznacz Insert content i Update content, a potem kliknij „Sprawdź ponownie”.')}</p>` : '' }));
    const se = c('security');
    rows.push(row({ key: 'security', ...rowBase('security'), st: se.status, text: L('Serwer słucha tylko na {host}, zapis jest chroniony przed obcymi stronami.', { host: se.detail }) }));
    const up = c('update');
    rows.push(row({ key: 'update', ...rowBase('update'), st: up.status,
      text: up.disabled ? L('Sprawdzanie aktualizacji jest wyłączone w Ustawieniach.') : up.available ? L('Dostępna wersja {v}.', { v: up.latest }) : up.offline ? L('Brak połączenia z GitHub. Dashboard działa normalnie.') : L('Masz najnowszą wersję ({v}).', { v: up.detail }),
      action: up.available ? `<button type="button" class="btn sm" data-ob="update">${L('Zobacz aktualizację')}</button>` : '' }));
    const dm = c('demo');
    const dn = dm.count || 0;
    rows.push(row({ key: 'demo', ...rowBase('demo'), st: 'info',
      text: dn ? esc(t.p('{n} wpisów DEMO w Notion. Usuń je, gdy zaczniesz wpisywać własne.', dn)) : L('W Notion nie ma wpisów DEMO.'),
      action: dn ? demoAction() : '' }));
    const issues = issueCount;
    const sum = issues ? esc(t.p('Zostały {n} rzeczy do poprawienia.', issues)) : L('Wszystko gotowe.');
    const fixBtn = issues ? `<button type="button" class="btn primary sm" data-ob="fixall" ${open.fix ? 'disabled' : ''}>${L('Napraw wszystko')}</button>` : '';
    void noAccess;
    return `${head}<div class="ck-sum ${issues ? 'bad' : 'good'}" role="status" aria-live="polite"><b>${sum}</b><span class="ck-sum-act">${fixBtn}<button type="button" class="btn sm" data-ob="recheck" ${running ? 'disabled' : ''}>${running ? L('Sprawdzam…') : L('Sprawdź ponownie')}</button></span></div>
      ${fixAllHtml()}<ul class="ck-list">${rows.join('')}</ul>`;
  }

  function guideHtml() {
    return `<h1 class="ob-h" id="ob-title" tabindex="-1">${L('Jak działa dziennik')}</h1>
      <p class="ob-lead">${fresh ? L('Dziennik jest gotowy. Przewodnik pokaże dashboard krok po kroku na danych przykładowych; możesz go pominąć.') : L('Przewodnik pokaże dashboard krok po kroku na danych przykładowych. Twoje dane i ustawienia zostają bez zmian, a w tym trybie nic nie zapisuje się w Notion.')}</p>
      <ol class="ob-tour">${['Filtry: typ, okres, konta', 'Najważniejsze liczby', 'Krzywa kapitału i spadki', 'Rozbicia i rozkład R', 'Dodawanie trade\'ów', 'Konta prop i payouty', 'Ustawienia'].map((x) => `<li>${L(x)}</li>`).join('')}</ol>`;
  }

  // ---------- rysowanie ----------
  function paintFoot() {
    if (!card) return;
    const id = cur();
    const last = step === flow.length - 1;
    const back = step && !['dziennik'].includes(id) && !(id === 'gotowosc' && fresh) ? `<button type="button" class="btn ghost" data-ob="back">${L('Wstecz')}</button>` : '';
    let main;
    if (id === 'token') main = `<button type="button" class="btn primary" data-ob="next" ${tok.ok ? '' : 'disabled'}>${L('Dalej')}</button>`;
    else if (id === 'strona') {
      const sel = (pg.pages || []).find((p) => p.id === pg.sel);
      main = `<button type="button" class="btn primary" data-ob="choose" ${sel ? '' : 'disabled'}>${sel?.journal ? L('Połącz istniejący dziennik') : L('Dalej')}</button>`;
    } else if (id === 'dostep') main = `<button type="button" class="btn" data-ob="goto-ready">${L('Wróć do gotowości')}</button>`;
    else if (id === 'dziennik') {
      const job = mk.job;
      main = job?.error ? `<button type="button" class="btn primary" data-ob="build">${L('Ponów')}</button>`
        : job?.done ? `<button type="button" class="btn primary" data-ob="next">${L('Dalej')}</button>`
          : `<button type="button" class="btn primary" data-ob="build" ${mk.starting || job?.running ? 'disabled' : ''}>${mk.starting || job?.running ? L('Tworzę…') : L('Utwórz dziennik')}</button>`;
    } else if (last && id === 'przewodnik') main = `<button type="button" class="btn" data-ob="finish">${L('Przejdź do dashboardu')}</button><button type="button" class="btn primary" data-ob="guide">${L('Pokaż przewodnik')}</button>`;
    else if (last) main = `<button type="button" class="btn primary" data-ob="finish">${L('Zakończ')}</button>`;
    else main = `<button type="button" class="btn primary" data-ob="next">${L('Dalej')}</button>`;
    card.querySelector('.ob-foot').innerHTML = `${last && id === 'przewodnik' ? '' : `<button type="button" class="ob-skip" data-ob="skip">${L('Pomiń')}</button>`}<span class="grow"></span>${back}${main}`;
  }
  function paint({ focusTitle = false } = {}) {
    if (!card) return;
    const id = cur();
    const body = card.querySelector('.ob-body');
    const keep = focusTitle ? 0 : body.scrollTop;
    card.querySelector('.ob-steps').innerHTML = flow.map((s, i) => `<li class="${i < step ? 'done' : i === step ? 'on' : ''}"${i === step ? ' aria-current="step"' : ''}><i></i><span>${L(STEP_NAME[s])}</span></li>`).join('');
    card.querySelector('.ob-count').textContent = t('Krok {a} z {b}', { a: step + 1, b: flow.length });
    body.innerHTML = id === 'witaj' ? welcomeHtml() : id === 'token' ? tokenHtml() : id === 'strona' || id === 'dostep' ? pagesHtml() : id === 'dziennik' ? buildHtml() : id === 'gotowosc' ? checksHtml() : guideHtml();
    bindPoradniki(body);
    body.scrollTop = keep;
    paintFoot();
    if (focusTitle) (id === 'token' ? card.querySelector('#ob-token') : card.querySelector('#ob-title'))?.focus({ preventScroll: true });
  }

  async function runChecks({ quick = false } = {}) {
    if (running) return res;
    running = true; runErr = '';
    if (cur() === 'gotowosc') paint();
    try { res = await post('/api/health/full', quick ? { quick: true } : {}); } catch (e) { runErr = e.message; res = null; }
    running = false;
    open.schema = null; open.demo = null; open.fix = null;
    if (cur() === 'gotowosc') paint();
    onAttention(!!res?.checks?.some((c) => c.status === 'error'));
    // świeża instalacja: po udanym sprawdzeniu od razu przewodnik (z „Pomiń”)
    if (fresh && cur() === 'gotowosc' && res && !res.checks.some((c) => c.status === 'error')) setTimeout(() => { if (cur() === 'gotowosc') go(step + 1); }, 1200);
    return res;
  }

  function go(n) {
    stopTimers();
    step = Math.max(0, Math.min(flow.length - 1, n));
    card.classList.remove('enter'); void card.offsetWidth; card.classList.add('enter');
    const id = cur();
    if (id === 'strona' || id === 'dostep') { pg.pages = pg.pages || null; }
    paint({ focusTitle: true });
    if (id === 'strona' || id === 'dostep') startPagesPoll();
    if (id === 'gotowosc' && !res && !running) runChecks();
  }
  const next = () => go(step + 1);
  // przejście do kroku; brakujący krok kreatora (token, dostęp, strona) wstawiamy przed „Gotowość”
  function goTo(id, { recheck = false } = {}) {
    let i = flow.indexOf(id);
    if (i < 0) {
      const at = flow.indexOf('gotowosc');
      flow.splice(at < 0 ? flow.length : at, 0, id);
      i = flow.indexOf(id);
    }
    if (id === 'gotowosc' && recheck) res = null;
    go(i);
  }

  async function finish(markDone = true) {
    if (markDone) { try { await post('/api/config', { onboarded: true }); } catch { /* pokaże się ponownie przy następnym starcie */ } }
    close();
    onDone();
  }

  async function onClick(e) {
    const b = e.target.closest('[data-ob]');
    if (!b) return;
    const a = b.dataset.ob;
    if (a === 'next') next();
    else if (a === 'back') go(step - 1);
    else if (a === 'skip' || a === 'finish') finish(true);
    else if (a === 'guide') { await finish(true); onGuide(); }
    else if (a === 'recheck') runChecks();
    else if (a === 'update') { close(); onUpdate(); }
    else if (a === 'lang') {
      if (b.dataset.v === getLang()) return;
      try { await post('/api/config', { lang: b.dataset.v }); } catch { /* lokalnie i tak zmieniamy */ }
      rememberLang(b.dataset.v);
      try { sessionStorage.setItem(RESUME_KEY, cur()); } catch { /* brak */ }
      location.reload();
    } else if (a === 'copy') {
      try { await navigator.clipboard.writeText(b.dataset.v); toast(t('Skopiowano: {v}', { v: b.dataset.v })); } catch { toast(t('Nie udało się skopiować. Zaznacz tekst i skopiuj ręcznie.'), { error: true }); }
    } else if (a === 'page') { pg.sel = b.dataset.v; pg.sig = ''; const z = card.querySelector('.pg-zone'); z.innerHTML = pagesZoneHtml(); bindPoradniki(z); paintFoot(); z.querySelector(`[data-v="${CSS.escape(pg.sel)}"]`)?.focus(); }
    else if (a === 'choose') choosePage();
    else if (a === 'build') startBuild();
    else if (a === 'goto-token') { tok.replace = true; tok.ok = null; tok.err = ''; goTo('token'); }
    else if (a === 'goto-access') goTo('dostep');
    else if (a === 'goto-page') { fresh = false; goTo('strona'); }
    else if (a === 'goto-ready') goTo('gotowosc', { recheck: true });
    else if (a === 'fixall') {
      const by = Object.fromEntries((res?.checks || []).map((c) => [c.id, c]));
      // nienaprawialne automatycznie: token i dostęp prowadzą do odpowiedniego kroku z odpytywaniem na żywo
      if (by.token && by.token.status === 'error') { tok.replace = true; goTo('token'); return; }
      if (by.root?.code === 'noaccess' || (by.databases?.items || []).some((d) => d.code === 'noaccess')) { goTo('dostep'); return; }
      open.fix = { loading: true }; paint();
      try { open.fix = { data: await post('/api/health/fix-all', { apply: false }) }; } catch (err) { open.fix = { err: err.message }; }
      paint();
    } else if (a === 'fixall-cancel') { open.fix = null; paint(); }
    else if (a === 'fixall-apply') {
      open.fix = { ...open.fix, applying: true }; paint();
      try {
        const r = await post('/api/health/fix-all', { apply: true });
        toast(t.p('Dodano w Notion: {n} zmian.', (r.changes || []).filter((c) => c.status !== 'conflict').length));
        await onConfigured({ fixed: true });
        res = null; await runChecks();
      } catch (err) { open.fix = { ...open.fix, applying: false, err: err.message }; paint(); }
    } else if (a === 'demo-preview') {
      open.demo = { loading: true }; paint();
      try { open.demo = { data: await post('/api/demo/remove', {}) }; } catch (err) { open.demo = { err: err.message }; }
      paint();
    } else if (a === 'demo-cancel') { open.demo = null; paint(); }
    else if (a === 'demo-apply') {
      open.demo = { ...open.demo, applying: true }; paint();
      try { const r = await post('/api/demo/remove', { apply: true }); toast(t.p('Usunięto {n} wpisów DEMO.', r.count || 0)); await onConfigured({ demo: true }); await runChecks(); }
      catch (err) { open.demo = { ...open.demo, applying: false, err: err.message }; paint(); }
    }
  }

  function onInput(e) {
    if (e.target.id === 'ob-token') {
      clearTimeout(tok.timer);
      const v = e.target.value;
      tok.timer = setTimeout(() => checkToken(v), 300);
    } else if (e.target.id === 'ob-demo') mk.demo = e.target.checked;
  }

  // Ustala przebieg kreatora na podstawie stanu instalacji.
  function planFlow({ mode }) {
    if (mode === 'token-replace') { fresh = false; tok.replace = true; return ['token', 'gotowosc']; }
    if (!setup || setup.configured) { fresh = false; return ['witaj', 'gotowosc', 'przewodnik']; }
    fresh = true;
    if (setup.resumable && setup.parentPageId) { mk.pageId = setup.parentPageId; mk.title = mk.title || t('wybrana strona'); return ['witaj', 'dziennik', 'gotowosc', 'przewodnik']; }
    return ['witaj', ...(setup.hasToken ? [] : ['token']), 'strona', 'dziennik', 'gotowosc', 'przewodnik'];
  }

  async function show({ at = 0, from = null, mode = '' } = {}) {
    if (root && mode) close();
    if (root) { goTo(typeof at === 'string' ? at : flow[at] || flow[0]); return; }
    opener = from || document.activeElement;
    setup = await get('/api/setup/state').catch(() => null);
    flow = planFlow({ mode });
    root = document.createElement('div');
    root.className = 'ob';
    root.innerHTML = `<div class="ob-card enter" role="dialog" aria-modal="true" aria-labelledby="ob-title">
      <div class="ob-top"><ol class="ob-steps" aria-label="${L('Kroki')}"></ol><span class="ob-count"></span></div>
      <div class="ob-body"></div><div class="ob-foot"></div></div>`;
    document.body.append(root);
    document.documentElement.classList.add('lb-lock');
    card = root.querySelector('.ob-card');
    overlay.current = { onKey(ev) {
      if (ev.key === 'Escape') { ev.preventDefault(); if (!mk.job?.running) finish(true); }
      else trapTab(ev, card);
    } };
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('paste', (e) => { if (e.target.id === 'ob-token') { clearTimeout(tok.timer); setTimeout(() => checkToken(e.target.value), 0); } });
    root.addEventListener('change', onInput);
    const idx = typeof at === 'string' ? Math.max(0, flow.indexOf(at)) : Math.min(at, flow.length - 1);
    if (typeof at === 'string' && flow.indexOf(at) < 0) { goToInit(at); return; }
    step = idx;
    paint({ focusTitle: true });
    if (cur() === 'gotowosc' && !res) runChecks();
    if (cur() === 'strona' || cur() === 'dostep') startPagesPoll();
  }
  function goToInit(id) { step = 0; paint(); goTo(id); }

  function close() {
    if (!root) return;
    stopTimers();
    root.remove();
    root = card = null;
    overlay.current = null;
    document.documentElement.classList.remove('lb-lock');
    if (opener && document.contains(opener)) opener.focus();
  }

  // Start dashboardu: kreator przy pierwszym uruchomieniu; w tle zawsze szybkie sprawdzenie (bez prób zapisu).
  async function auto({ loadFailed = false } = {}) {
    let resume = '';
    try { resume = sessionStorage.getItem(RESUME_KEY) || ''; sessionStorage.removeItem(RESUME_KEY); } catch { /* brak */ }
    const m = getMeta() || {};
    if (m.onboarded === false || resume) {
      // świeża instalacja: język z przeglądarki, raz na sesję
      let asked = false;
      try { asked = sessionStorage.getItem('thq.langAsked') === '1'; sessionStorage.setItem('thq.langAsked', '1'); } catch { /* brak */ }
      const want = String(navigator.language || '').toLowerCase().startsWith('pl') ? 'pl' : 'en';
      if (!asked && !resume && m.onboarded === false && want !== getLang()) {
        try { await post('/api/config', { lang: want }); rememberLang(want); location.reload(); return true; } catch { /* zostaje bieżący */ }
      }
      await show({ at: resume || 0 });
      return true;
    }
    let r = null;
    try { r = await post('/api/health/full', { quick: true }); } catch { return false; }
    const bad = r.checks.some((c) => c.status === 'error');
    onAttention(bad);
    if (bad && loadFailed) { res = r; await show({ at: 'gotowosc' }); return true; }
    return false;
  }

  const settingsHtml = () => `<div class="rule-x"></div><div class="sp-f"><span class="lbl">${L('Pierwsze kroki')}</span>
    <p class="upd-line">${L('Sprawdzenie gotowości i przewodnik po dashboardzie na danych przykładowych.')}</p>
    <div class="upd-actions"><button type="button" class="btn sm" data-act="ob-open" data-fk="ob-open">${L('Otwórz pierwsze kroki')}</button><button type="button" class="btn ghost sm" data-act="ob-token" data-fk="ob-token">${L('Zmień token')}</button></div></div>`;

  void tests;
  return { show, close, auto, settingsHtml, isOpen: () => !!root };
}
