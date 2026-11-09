// Ties the page to the landscape: scrolling tells the story by changing the
// weather, and at the end the two sliders hand the weather to the reader.

import { Scene } from './scene.js';

const root = document.documentElement;
const telling = document.querySelector('.telling');
const stage = telling.querySelector('.stage');
const canvas = stage.querySelector('.land');
const passages = [...stage.querySelectorAll('.passage')];
const sandbox = stage.querySelector('.sandbox');
const windInput = document.getElementById('wind');
const sunInput = document.getElementById('sun');
const report = document.getElementById('report');
const themeColour = document.querySelector('meta[name="theme-color"]');
const still = window.matchMedia('(prefers-reduced-motion: reduce)');

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// [wind, sun] for each passage, in order. The last is the sandbox.
const WEATHER = [
  [0.10, 0.30], // the title
  [0.12, 0.30], // the argument
  [0.10, 0.32], // the traveller and the wager
  [0.60, 0.12], // the Wind draws a breath
  [1.00, 0.00], // the gale
  [0.05, 0.14], // out of breath
  [0.03, 0.66], // a little light, then warmth
  [0.00, 1.00], // the cloak comes off
  [0.00, 0.86], // the moral
  null,
];

const REPORTS = {
  easy: 'He’s walking easy, cloak on.',
  breezy: 'He’s turned his collar up.',
  windy: 'He’s pulled the cloak shut and put his head down.',
  gale: 'He’s holding on with everything he has. Blow harder and he’ll only hold tighter.',
  warm: 'He’s straightened up and loosened the clasp. Keep going.',
  both: 'Hot sun, stiff wind. He’s keeping the cloak on against the wind, so let the wind drop.',
  loosening: 'He’s far too warm. Any moment now.',
  off: 'Off it comes, and nobody forced him. Bring back the wind and he’ll put it on again.',
};

function start() {
  const scene = new Scene(canvas);
  const last = passages.length - 1;
  telling.style.setProperty('--n', passages.length);

  // Split the title into letters so the opening gust can carry them in.
  const title = stage.querySelector('.title');
  let n = 0;
  for (const node of [...title.childNodes]) {
    if (node.nodeType !== Node.TEXT_NODE) continue;
    const frag = document.createDocumentFragment();
    node.textContent.split(/(\s+)/).forEach((part) => {
      if (!part.trim()) { frag.append(part); return; }
      const word = document.createElement('span');
      word.className = 'word';
      word.setAttribute('aria-hidden', 'true');
      for (const ch of part) {
        const s = document.createElement('span');
        s.className = 'ch';
        s.style.setProperty('--i', n++);
        s.textContent = ch;
        word.append(s);
      }
      frag.append(word);
    });
    node.replaceWith(frag);
  }

  const userWeather = () => [windInput.value / 100, sunInput.value / 100];
  for (const input of [windInput, sunInput]) {
    const fill = () => input.style.setProperty('--v', `${input.value}%`);
    input.addEventListener('input', () => { fill(); dirty = true; });
    fill();
  }

  // How far through the telling the reader is, in passages: 0 is the title,
  // `last` is the sandbox.
  const position = () => {
    const h = stage.offsetHeight || window.innerHeight;
    return clamp(-telling.getBoundingClientRect().top / h, 0, last);
  };

  let playing = false;
  let shown = [];
  const apply = (pos) => {
    passages.forEach((el, i) => {
      const o = +(1 - smooth(0.26, 0.46, Math.abs(pos - i))).toFixed(3);
      if (shown[i] !== o) { el.style.opacity = o; shown[i] = o; }
    });

    const nowPlaying = pos > last - 0.5;
    if (nowPlaying !== playing) {
      playing = nowPlaying;
      sandbox.classList.toggle('live', playing);
      if (playing) {
        // he starts the sandbox the way he started the story
        scene.heat = 0;
        scene.cloakWorn = true;
        mood = '';
      }
    }

    const i = Math.min(Math.floor(pos), last - 1);
    const a = WEATHER[i];
    const b = WEATHER[i + 1] || userWeather();
    const k = smooth(0.3, 0.7, pos - i);
    scene.setWeather(lerp(a[0], b[0], k), lerp(a[1], b[1], k));
  };

  let painted = {};
  let frames = 0;
  const paint = () => {
    const c = scene.colours();
    if (c.ink !== painted.ink) stage.style.setProperty('--ink', c.ink);
    if (c.sky !== painted.sky) stage.style.setProperty('--sky', c.sky);
    if (c.ground !== painted.ground) root.style.setProperty('--ground', c.ground);
    if (themeColour && c.sky !== painted.sky && frames % 12 === 0) themeColour.content = c.sky;
    painted = c;
  };

  let mood = '';
  let moodSince = 0;
  let pending = '';
  const tell = (now) => {
    if (!playing) return;
    const m = scene.mood();
    if (m !== pending) { pending = m; moodSince = now; }
    // wait for the mood to hold before saying it, so dragging doesn't chatter
    if (pending !== mood && (now - moodSince > 450 || still.matches)) {
      mood = pending;
      report.textContent = REPORTS[mood];
    }
  };

  let dirty = true;
  let visible = true;
  let previous = performance.now();
  const frame = (now) => {
    const dt = Math.min((now - previous) / 1000, 0.1);
    previous = now;
    frames++;
    if (visible && (dirty || !still.matches)) {
      apply(position());
      if (still.matches) scene.settle(); else scene.step(dt);
      scene.render();
      paint();
      tell(now);
      dirty = false;
    }
    requestAnimationFrame(frame);
  };

  const measure = () => { scene.resize(); dirty = true; };
  new ResizeObserver(measure).observe(stage);
  window.addEventListener('scroll', () => { dirty = true; }, { passive: true });
  still.addEventListener('change', () => { dirty = true; });
  new IntersectionObserver((entries) => {
    visible = entries[entries.length - 1].isIntersecting;
    dirty = true;
  }).observe(stage);

  // Links to a passage scroll to the point in the telling where it is on stage.
  const goTo = (hash, instant) => {
    const el = hash.length > 1 && document.getElementById(hash.slice(1));
    const i = passages.indexOf(el);
    if (i < 0) return false;
    const top = telling.getBoundingClientRect().top + window.scrollY + i * stage.offsetHeight;
    window.scrollTo({ top, behavior: instant || still.matches ? 'auto' : 'smooth' });
    return true;
  };
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (!link) return;
    const hash = link.getAttribute('href');
    if (goTo(hash, false)) {
      e.preventDefault();
      history.pushState(null, '', hash);
    }
  });
  window.addEventListener('hashchange', () => goTo(location.hash, true));
  // The sliders are always reachable by keyboard and screen reader; reaching
  // one from elsewhere in the story brings the sandbox on stage.
  sandbox.addEventListener('focusin', () => { if (!playing) goTo('#your-turn', true); });

  scene.resize();
  if (location.hash) {
    // the browser's own jump to an anchor lands wrong inside a pinned stage, so correct it
    goTo(location.hash, true);
    window.addEventListener('load', () => requestAnimationFrame(() => goTo(location.hash, true)), { once: true });
  }
  apply(position());
  if (still.matches) scene.settle();
  else scene.wind = 0.42; // the opening gust that carries the title in
  requestAnimationFrame(frame);
}

try {
  if (!canvas.getContext || !canvas.getContext('2d')) throw new Error('no canvas');
  start();
} catch (err) {
  // Fall back to the plain page: the whole fable is still there to read.
  root.classList.remove('js');
  console.error(err);
}
