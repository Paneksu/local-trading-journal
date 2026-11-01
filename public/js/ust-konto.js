// N2 (1.6.0): Ustawienia → Konto i Notion: połączenie z Notion (stan i „Sprawdź połączenie”), dziennik (link, schemat baz),
// pierwsze kroki („Otwórz pierwsze kroki”, „Zmień token”), dane przykładowe DEMO i urządzenia (synchronizacja, lista, dodanie).
// Pierwsze kroki i urządzenia przeniesione bez zmian z zakładek „Ogólne” i „Urządzenia” popovera 1.5.0 (moduły pierwsze-kroki.js i urzadzenia.js).
import { t } from './i18n.js';
import { esc, L, gHead, grp, dot } from './ust-wspolne.js';

// final (ocena wyglądu P2-7): zamiast „schemat baz 6” zdanie zrozumiałe bez wiedzy o migracjach
function schemaLine(m) {
  if (m.installedSchema == null || !m.installedSchema) return '';
  if (m.schemaVersion && m.installedSchema < m.schemaVersion) return esc(t('Dziennik potrzebuje aktualizacji struktury (wersja {v} z {cur}). Zrobi to aktualizacja albo „Napraw wszystko” w pierwszych krokach.', { v: m.installedSchema, cur: m.schemaVersion }));
  return esc(t('Struktura dziennika aktualna (wersja {v})', { v: m.installedSchema }));
}
export function createKonto(ctx) {
  function notionHtml() {
    const c = ctx.diag()?.connections?.notion;
    const last = c?.last;
    const st = !c ? 'wait' : !c.configured ? 'bad' : last ? (last.ok ? 'ok' : 'bad') : 'wait';
    const line = !c ? t('Sprawdzam…') : !c.configured ? t('Nie połączono. Otwórz pierwsze kroki, żeby połączyć dziennik.') : last ? last.detail : t('Token i bazy są zapisane. Połączenia jeszcze nie sprawdzono.');
    return `${gHead('sv-konto-notion', 'Połączenie z Notion')}
      <div class="sv-conn">${dot(st)}<span class="sv-conn-t">${esc(line)}</span><button type="button" class="btn sm" data-act="diag-test" data-v="notion" data-fk="diag-test-notion"${c?.configured ? '' : ' disabled'}>${L('Sprawdź połączenie')}</button></div>
      <p class="note">${L('Token integracji leży w pliku .env na tym komputerze. Dashboard czyta i zapisuje tylko strony, które udostępnisz integracji JustJournal.')}</p>`;
  }
  function dziennikHtml() {
    const m = ctx.getMeta() || {};
    const link = m.notionUrl ? `<a class="btn sm" href="${esc(m.notionUrl)}" target="_blank" rel="noopener">${L('Otwórz dziennik w Notion')}</a>` : '';
    return `${gHead('sv-konto-dziennik', 'Dziennik')}
      <div class="sp-f"><p class="upd-line">${schemaLine(m)}</p><div class="upd-actions">${link}</div></div>
      ${ctx.opts.onboardingHtml()}`;
  }
  function demoHtml() {
    const n = ctx.opts.demoCount();
    if (!n) return '';
    return grp(`${gHead('sv-konto-demo', 'Dane przykładowe DEMO')}
      <div class="sp-f"><p class="upd-line">${esc(t.p('{n} wpisów DEMO w Notion. Usuń je, gdy zaczniesz wpisywać własne.', n))}</p>
        <div class="upd-actions"><button type="button" class="btn sm" data-act="demo-remove" data-fk="demo-remove">${L('Usuń dane DEMO')}</button></div></div>`, 'demo');
  }
  function html() {
    return grp(notionHtml(), 'notion') + grp(dziennikHtml(), 'dziennik') + demoHtml()
      + grp(`${gHead('sv-konto-dev', 'Urządzenia')}${ctx.opts.devicesHtml()}`, 'urzadzenia');
  }
  function onChange(ev) {
    if (ev.target.matches('[data-act="sync-toggle"]')) { ctx.opts.onSyncToggle(ev.target.checked); return true; }
    return false;
  }
  return { id: 'konto', html, handle: () => false, onInput: () => false, onChange, onEscape: () => false, enter() { ctx.opts.onTab('urzadzenia'); } };
}
