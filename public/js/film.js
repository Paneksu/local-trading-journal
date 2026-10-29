// Filmy z wykresem i wynikiem (pakiet J, etap 18, P16). Ten moduł NAGRYWA, nie rysuje: klatkę rysuje renderCard(canvas, { …, at }) z udostepnij-render.js
// (jeden renderer dla PNG i filmu), a tu jest tylko pętla klatek, MediaRecorder, film tła w elemencie <video> i pomiar czasu klatki.
// P21 (27.10.2026), słowa użytkownika: «bez muzyki narazie». Filmy bez dźwięku: strumień z canvas.captureStream() ma wyłącznie tor obrazu (tory audio, gdyby
// się pojawiły, są zatrzymywane i usuwane), bez AudioContext i bez toru z filmu tła; element <video> tła jest zawsze wyciszony.
// Film tła z dysku użytkownika: URL.createObjectURL w tej karcie przeglądarki, nigdy nie jest wysyłany ani zapisywany (bez żądań sieciowych i bez pamięci
// przeglądarki); przy kolejnym otwarciu okna wybiera się go ponownie. Adres obiektu zwalnia okno Udostępnij przy zamknięciu.
// P20: MediaRecorder w Chrome i Edge nagrywa MP4 fragmentowany (moof/mdat); czy Instagram i TikTok go przyjmują, sprawdza użytkownik (etap 18b warunkowo).
// English: browser-only video recording of the animated share card (no audio, background video never leaves the device).
import { FORMATS } from './udostepnij-render.js';

// Kolejność typów: MP4 H.264 High 4.0 (Instagram, TikTok), dowolny MP4, potem WebM (Firefox) z notką w oknie.
export const MIME_ORDER = ['video/mp4;codecs=avc1.640028', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8'];
export function pickMime(isSupported) {
  if (typeof isSupported !== 'function') return null;
  for (const mime of MIME_ORDER) {
    let ok = false;
    try { ok = !!isSupported(mime); } catch { ok = false; }
    if (ok) { const mp4 = mime.startsWith('video/mp4'); return { mime, ext: mp4 ? 'mp4' : 'webm', mp4 }; }
  }
  return null;
}
export const supportedMime = () => {
  const MR = globalThis.MediaRecorder;
  return MR && typeof MR.isTypeSupported === 'function' && typeof HTMLCanvasElement !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype
    ? pickMime((t) => MR.isTypeSupported(t)) : null;
};

// Jakość: 1080p = pełny układ karty, 720p = ten sam układ w skali 2/3 (renderCard({ scale })).
export const QUALITIES = ['1080p', '720p'];
export function filmSize(format, quality) {
  const [W, H] = FORMATS[format] || FORMATS['9:16'];
  const scale = quality === '720p' ? 2 / 3 : 1;
  return { w: Math.round(W * scale), h: Math.round(H * scale), scale };
}
// Bitrate (Szacunek z karty etapu 18): 12 Mb/s dla 1080p, 6 Mb/s dla 720p.
export const bitrate = (quality) => (quality === '720p' ? 6_000_000 : 12_000_000);

// Pomiar czasu klatki: średnia i 95. percentyl (ms). Gdy p95 > 14 ms, nagrywanie przechodzi na 30 kl./s (decyzja gustu z planu, p. 3.11).
export const FPS_LIMIT_MS = 14;
export function frameStats(times) {
  const n = times?.length || 0;
  if (!n) return { n: 0, mean: 0, p95: 0 };
  const s = [...times].sort((a, b) => a - b);
  return { n, mean: times.reduce((a, b) => a + b, 0) / n, p95: s[Math.min(n - 1, Math.ceil(n * 0.95) - 1)] };
}
export const decideFps = (times) => (frameStats(times).p95 > FPS_LIMIT_MS ? 30 : 60);

// Czarno-białe tło przez ctx.filter: wsparcie sprawdzane próbą na 1 px (Safari długo nie miał filtra w canvasie); brak = przełącznik ukryty.
export function filterSupported(doc = globalThis.document) {
  try {
    const c = doc.createElement('canvas');
    c.width = c.height = 1;
    const x = c.getContext('2d', { willReadFrequently: true });
    if (!x || !('filter' in x)) return false;
    x.filter = 'grayscale(1)';
    x.fillStyle = 'red';
    x.fillRect(0, 0, 1, 1);
    const d = x.getImageData(0, 0, 1, 1).data;
    return Math.max(d[0], d[1], d[2]) - Math.min(d[0], d[1], d[2]) <= 2 && d[0] > 0; // filtr zaokrągla kanały osobno
  } catch { return false; }
}

// Film tła z pliku: wyciszony, zapętlony (krótszy film gra w kółko), pierwsza klatka wczytana przed rysowaniem. Zwraca element <video>.
export function loadVideo(file, { timeoutMs = 20000, doc = globalThis.document } = {}) {
  return new Promise((resolve, reject) => {
    if (!file || !/^video\//.test(file.type || 'video/')) { reject(new Error('type')); return; }
    const v = doc.createElement('video');
    v.muted = true; v.defaultMuted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
    v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
    const url = URL.createObjectURL(file);
    let done = false;
    const fail = (e) => { if (done) return; done = true; clearTimeout(timer); URL.revokeObjectURL(url); reject(e instanceof Error ? e : new Error('video')); };
    const timer = setTimeout(() => fail(new Error('timeout')), timeoutMs);
    v.addEventListener('loadeddata', () => { if (done) return; if (!v.videoWidth || !v.videoHeight) { fail(new Error('size')); return; } done = true; clearTimeout(timer); resolve(v); }, { once: true });
    v.addEventListener('error', () => fail(new Error('video')), { once: true });
    v.src = url;
    v.load();
  });
}
// Zwolnienie filmu tła (zatrzymanie i adres obiektu); okno woła to przy zmianie filmu i przy zamknięciu.
export function releaseVideo(video) {
  if (!video) return;
  try { video.pause(); } catch { /* już zatrzymany */ }
  const url = video.src;
  video.removeAttribute('src');
  try { video.load(); } catch { /* bez znaczenia */ }
  if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
}

const raf = (f) => (globalThis.requestAnimationFrame ? globalThis.requestAnimationFrame(f) : setTimeout(() => f(performance.now()), 16));
const errOf = (name, msg = name) => { const e = new Error(msg); e.name = name; return e; };

// Nagranie: canvas.captureStream(60) + MediaRecorder, pętla requestAnimationFrame w czasie rzeczywistym (karta przeglądarki musi być widoczna: w tle
// rAF staje, więc ukrycie karty przerywa nagranie z błędem HiddenError). draw(at) rysuje klatkę dla czasu at (s). signal (AbortController) = „Anuluj”.
// Przed startem kilkanaście klatek próbnych z najcięższej części animacji: p95 > 14 ms → od razu 30 kl./s; w trakcie, po 30 klatkach, to samo sprawdzenie.
// Zwraca { blob, mime, ext, fps, stats, audioTracks }.
export async function record({ canvas, seconds, draw, video = null, mimeInfo = supportedMime(), bitrate: bps = 12_000_000, onProgress = () => {}, signal = null, doc = globalThis.document }) {
  if (!mimeInfo) throw errOf('NotSupportedError', 'unsupported');
  if (signal?.aborted) throw errOf('AbortError');
  // próba czasu klatki (wynik idzie do statystyk razem z klatkami nagrania)
  const warm = [];
  for (let i = 0; i < 14; i++) { const t0 = performance.now(); draw(1.2 + i * 0.15); warm.push(performance.now() - t0); }
  let fps = decideFps(warm);
  // Przegląd HIJ, pkt 5 (29.10.2026): nasłuchy „Anuluj” i ukrycia karty rejestrowane PRZED play() i sprawdzane po nim (anulowanie w tym oknie nie ginie);
  // MediaRecorder tworzony w try, więc przy błędzie konstruktora finally zatrzymuje tory strumienia i film tła.
  let rec = null, stream = null, failure = null, finished = false, endLoop = () => {}, stopRes = () => {};
  const chunks = [], times = [];
  let audioTracks = 0;
  // halt kończy też pętlę klatek: przy ukrytej karcie requestAnimationFrame już nie przyjdzie
  const halt = (e) => {
    if (finished) return;
    failure = failure || e; finished = true;
    try { if (rec && rec.state !== 'inactive') rec.stop(); else stopRes(); } catch { stopRes(); }
    endLoop();
  };
  const onVis = () => { if (doc.visibilityState === 'hidden') halt(errOf('HiddenError', 'hidden')); };
  const onAbort = () => halt(errOf('AbortError'));
  doc.addEventListener('visibilitychange', onVis);
  signal?.addEventListener('abort', onAbort);
  try {
    if (video) { try { video.currentTime = 0; await video.play(); } catch { /* bez odtwarzania tło stoi na pierwszej klatce */ } }
    if (finished) throw failure; // anulowane albo ukryte w trakcie play(): nagranie nie startuje
    draw(0);
    stream = canvas.captureStream(60);
    for (const tr of stream.getAudioTracks()) { tr.stop(); stream.removeTrack(tr); } // P21: nigdy toru audio
    audioTracks = stream.getAudioTracks().length;
    rec = new MediaRecorder(stream, { mimeType: mimeInfo.mime, videoBitsPerSecond: bps });
    rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
    const stopped = new Promise((res) => { stopRes = res; rec.onstop = res; });
    rec.start();
    const t0 = performance.now();
    let last = -Infinity;
    await new Promise((resolve) => {
      endLoop = resolve;
      const frame = () => {
        if (finished) { resolve(); return; }
        const now = performance.now(), at = (now - t0) / 1000;
        if (at >= seconds) {
          draw(seconds);
          onProgress(seconds);
          raf(() => { halt(null); resolve(); }); // ostatnia klatka trafia do strumienia przed zatrzymaniem
          return;
        }
        if (now - last >= 1000 / fps - 2) {
          const s = performance.now();
          draw(at);
          times.push(performance.now() - s);
          last = now;
          if (fps === 60 && times.length === 30 && decideFps(times) === 30) fps = 30;
        }
        onProgress(at);
        raf(frame);
      };
      raf(frame);
    });
    await stopped;
  } finally {
    doc.removeEventListener('visibilitychange', onVis);
    signal?.removeEventListener('abort', onAbort);
    if (stream) for (const tr of stream.getTracks()) tr.stop();
    if (video) { try { video.pause(); } catch { /* już zatrzymany */ } }
  }
  if (failure) throw failure;
  const type = rec.mimeType || mimeInfo.mime;
  return { blob: new Blob(chunks, { type }), mime: type, ext: mimeInfo.ext, fps, stats: frameStats([...warm, ...times]), audioTracks };
}
