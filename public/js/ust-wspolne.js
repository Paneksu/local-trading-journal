// N2 (1.6.0): wspólne kawałki modułów sekcji Ustawień (ust-*.js). Szkielet widoku i nawigacja: ustawienia.js.
// Każda sekcja to createX(ctx) → { id, html(), handle(act, v, el), onInput(ev), onChange(ev), onEscape(), enter() }; ctx opisuje ustawienia.js.
import * as F from './format.js';
import { t } from './i18n.js';
import { sanitizeChart } from './styl-wykresu.js';

export const { esc } = F;
export const L = (s, p) => esc(t(s, p));
export const THEME_NAME = { onyx: 'Onyx', platinum: 'Platinum' };
export const ratioTxt = (r) => F.num(Math.floor(r * 10) / 10, 1);
export const svgI = (body, s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
export const X_ICON = svgI('<path d="M6 6l12 12M18 6 6 18"/>');
export const fmtBytes = (n) => (n == null ? '-' : n < 1024 ? `${F.num(n, 0)} B` : n < 1024 ** 2 ? `${F.num(n / 1024, 1)} KB` : n < 1024 ** 3 ? `${F.num(n / 1024 ** 2, 1)} MB` : `${F.num(n / 1024 ** 3, 2)} GB`);
export const usdTxt = (x) => `${F.num(x, 2)} USD`;
export const gHead = (id, label) => `<h3 class="sp-g" id="${id}">${L(label)}</h3>`;
export const chk = (key, on, label) => `<label class="check"><input type="checkbox" data-chk="${key}" data-fk="chk-${key}" ${on ? 'checked' : ''}> ${L(label)}</label>`;
// Grupa sekcji: karta z nagłówkiem (jak karty dashboardu). inner zaczyna się zwykle od gHead(…); id = kotwica głębokiego linku #ustawienia/<sekcja>/<id>
export const grp = (inner, id = '') => `<section class="card sv-g"${id ? ` id="sv-g-${id}"` : ''}>${inner}</section>`;
// Kropka stanu: ok (połączono), bad (błąd), off (brak klucza, opcjonalne), wait (nie sprawdzono)
export const dot = (st) => `<i class="sv-dot" data-st="${st}" aria-hidden="true"></i>`;
// Odnośnik do instrukcji (README w repozytorium wydania; adres liczy serwer z THQ_REPO / package.json)
export const docLink = (url, label) => (url ? `<a class="sv-doc" href="${esc(url)}" target="_blank" rel="noopener">${L(label)}</a>` : '');

// N3/N4: żądania sekcji do lokalnego serwera. Zapis zawsze z nagłówkiem X-THQ i JSON-em (ochrona zapisu guardWrite); błąd serwera jako Error z .status i .code
export async function getJson(url) {
  const r = await fetch(url, { cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || t('Serwer nie odpowiada.')), { status: r.status, code: j.code });
  return j;
}
export async function postJson(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-THQ': '1' }, body: JSON.stringify(body ?? {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || t('Serwer nie odpowiada.')), { status: r.status, code: j.code, body: j });
  return j;
}
// Wiersz klucz–wartość (etykieta tłumaczona, wartość już jako HTML)
export const kv = (k, v) => `<div class="sp-kv"><span>${L(k)}</span><b>${v}</b></div>`;
// Kwota zaokrąglona w górę do centa (potwierdzenia „wpisz kwotę”): 41,2301 → 41,24
export const centsUp = (x) => Math.ceil(Math.round(Number(x) * 1e6) / 1e4) / 100;
// Wpisana kwota (przecinek albo kropka, bez „USD”) równa oczekiwanej z dokładnością do centa
export const amountMatches = (typed, expected) => { const v = Number(String(typed ?? '').trim().replace(/\s|usd/gi, '').replace(',', '.')); return Number.isFinite(v) && Math.round(v * 100) === Math.round(expected * 100); };

// Wspólne operacje na settings.chart (sekcje Wykresy i Źródła danych: nakładki newsów i earningsów)
export function chartOps(ctx) {
  const chart = () => (ctx.settings.chart = sanitizeChart(ctx.settings.chart));
  function setChart(p, { render = false } = {}) {
    ctx.settings.chart = sanitizeChart({ ...chart(), ...p });
    ctx.save();
    ctx.opts.onChart(ctx.settings.chart);
    if (render) ctx.rerender(); else ctx.refreshPreview();
  }
  const setOverlays = (fn) => { const o = JSON.parse(JSON.stringify(chart().overlays)); fn(o); setChart({ overlays: o }); };
  return { chart, setChart, setOverlays };
}
// Przełączniki [data-chk] (nakładki, newsy, earningsy, pola settings.chart): ta sama obsługa co w popoverze 1.5.0
export function onChk(el, { setChart, setOverlays }) {
  const k = el.dataset.chk, on = el.checked;
  if (k === 'sessions' || k === 'pdhl' || k === 'news' || k === 'earnings') setOverlays((o) => { o[k] = on; });
  else if (k.startsWith('newsImp-')) setOverlays((o) => { o.newsImp[k.slice(8)] = on; });
  else if (k.startsWith('earnCls-')) setOverlays((o) => { o.earnCls[k.slice(8)] = on; });
  else if (k.startsWith('sess-')) setOverlays((o) => { o.sess[k.slice(5)].on = on; });
  // pakiet I: wyłączony wykres w kartach wyszarza wybór stylu karty
  else setChart({ [k]: on }, { render: k === 'shareChart' });
  return true;
}
