// Czysty parser notatek wydania (markdown z GitHuba) do listy bloków. Bez DOM, więc testowany w Node (testy/run.mjs).
// Notatki to tekst z zewnątrz: obrazki i HTML są pomijane (nic z nich nie trafia do strony), render robi aktualizacja.js przez createElement + textContent.
// English: pure release-notes parser (no DOM). Images and HTML are dropped; the renderer only uses createElement + textContent.

const IMG_MD = /!\[[^\]]*\]\([^)]*\)/g;        // ![alt](url)
const IMG_REF = /!\[[^\]]*\]\[[^\]]*\]/g;      // ![alt][ref]
const HTML_TAG = /<\/?[a-zA-Z][^>]*>|<!--[\s\S]*?-->/g;
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;  // ---, ***, ___
const SHOTS_HEADING = /zrzut|screenshot/i;

// Zwraca { blocks: [{ type: 'h'|'li'|'p', level?, text }], hadImages }.
export function parseMarkdown(md) {
  const blocks = [];
  let hadImages = false;
  let para = null;
  let shots = null; // otwarta sekcja „Zrzuty / Screenshots”: { at: indeks nagłówka, images: czy były w niej obrazki }
  const endShots = () => { // sekcja zrzutów z obrazkami to same zrzuty i podpisy: znika w całości (nagłówek, podpisy, dopiski)
    if (shots && shots.images) blocks.splice(shots.at);
    shots = null;
  };
  const closePara = () => { para = null; };
  for (const raw of String(md || '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) { closePara(); continue; }
    if (RULE.test(line) || /^\s*tree-sha256:/i.test(line)) { closePara(); continue; } // dane techniczne wydania
    if (/^\s*</.test(line)) { // linia z tagiem HTML (<img>, <details>, <p align>…): pomijana w całości
      if (/<img\b/i.test(line)) { hadImages = true; if (shots) shots.images = true; }
      closePara(); continue;
    }
    let text = line;
    if (IMG_MD.test(text) || IMG_REF.test(text) || /<img\b/i.test(text)) { hadImages = true; if (shots) shots.images = true; }
    IMG_MD.lastIndex = 0; IMG_REF.lastIndex = 0;
    // link opakowujący obrazek: [![alt](img)](url) → po wycięciu obrazka zostaje pusty link
    text = text.replace(IMG_MD, '').replace(IMG_REF, '').replace(HTML_TAG, '').replace(/\[\s*\]\([^)]*\)/g, '');
    const h = text.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
    const li = text.match(/^\s*[-*+]\s+(.*)$/);
    const onlyRemoved = text !== line && !text.replace(/[-*+#\s]/g, '');
    if (onlyRemoved) { closePara(); continue; } // linia była samym obrazkiem
    if (h) { closePara(); endShots(); if (SHOTS_HEADING.test(h[2])) shots = { at: blocks.length, images: false }; blocks.push({ type: 'h', level: h[1].length, text: h[2].replace(/\s*#+\s*$/, '').trim() }); }
    else if (li) { closePara(); blocks.push({ type: 'li', text: li[1].trim() }); }
    else if (para) { para.text += ' ' + text.trim(); }
    else { para = { type: 'p', text: text.trim() }; blocks.push(para); }
  }
  endShots();
  // nagłówek „Zrzuty / Screenshots”, pod którym nic nie zostało
  const out = blocks.filter((b, i) => {
    if (b.type !== 'h' || !SHOTS_HEADING.test(b.text)) return true;
    const next = blocks[i + 1];
    return !!next && next.type !== 'h';
  });
  return { blocks: out, hadImages };
}
