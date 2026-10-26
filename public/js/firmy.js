// Logo firm prop i monogramy dla pozostałych firm. Logo są znakami towarowymi właścicieli i służą wyłącznie do identyfikacji firmy.
// Pliki: public/img/firmy/*.webp, kwadrat 96×96. Dopasowanie po nazwie firmy z pola wyboru Firma (polskie i angielskie nazwy, różne skróty).
// Źródła plików (README, sekcja o logo):
//   lucid.webp: https://lucidtrading.com/wp-content/uploads/2025/09/luciddarkmode-2-4.png.webp (logo „Lucid Trading Logo” ze strony
//               lucidtrading.com, pobrane 26.10.2026, przycięte do kuli i przeskalowane do 96×96 WebP z przezroczystym tłem).
//               Kula jest ciemna, więc kafelek dostaje jasne tło z tokenów (klasa on-light) w obu motywach.
//   alpha.webp: https://alpha-futures.com/images/webclip-192.png (Alpha Futures, pobrane 26.10.2026, przeskalowane).
//   apex.webp:  https://apextraderfunding.com/app/uploads/cropped-APEX_FAV-192x192.png (Apex Trader Funding, pobrane 26.10.2026, przeskalowane).
import { esc } from './format.js';

// Kolejność ma znaczenie: pierwsze dopasowanie wygrywa. „Alpha Capital” (forex) to inna firma niż Alpha Futures, więc nie dostaje logo Alpha.
const LOGOS = [
  { key: 'lucid', re: /\blucid\b/i, file: 'lucid.webp', light: true },
  { key: 'alpha-futures', re: /^\s*alpha(\s*futures|\s*futures\s*llc)?\s*$/i, file: 'alpha.webp' },
  { key: 'apex', re: /\bapex\b/i, file: 'apex.webp' },
  { key: 'topstep', re: /\btop\s*step\b/i, file: null },
];
// Firmy podpowiadane w formularzu, nawet gdy nie ma ich jeszcze w polu wyboru Firma w Notion (Notion doda opcję przy pierwszym zapisie).
// Pigułka nie pojawia się, gdy w bazie jest już ta sama firma pod inną nazwą (np. „Lucid” zamiast „Lucid Trading”).
export const EXTRA_FIRMS = ['Lucid Trading', 'Alpha Futures', 'Apex Trader Funding', 'Topstep'];
const match = (name) => LOGOS.find((l) => l.re.test(String(name || ''))) || null;
export const firmKey = (name) => match(name)?.key || String(name || '').trim().toLowerCase();
export const logoFile = (name) => match(name)?.file || null;

export function monogram(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  const t = words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2);
  return t.toUpperCase();
}

// Kafelek 18–28 px, promień 6, tło z tokenów. Obraz jest dekoracją (nazwa firmy zawsze stoi obok jako tekst).
export function logoHtml(name, size = 22) {
  const m = match(name);
  const inner = m?.file
    ? `<img src="img/firmy/${m.file}" alt="" width="96" height="96" loading="lazy" decoding="async">`
    : `<span class="mg">${esc(monogram(name))}</span>`;
  return `<span class="logo${m?.file && m.light ? ' on-light' : ''}" style="--s:${size}px" aria-hidden="true">${inner}</span>`;
}
