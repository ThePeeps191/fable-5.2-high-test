// The landscape. Everything on the canvas is drawn from scratch each frame:
// sky, sun, clouds, eight ridges of hills, trees, grass, wind, and one traveller.
// Two numbers drive all of it: how hard the wind blows and how warmly the sun shines.

const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// ---------- colour ----------

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const css = (c, a = 1) =>
  a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a.toFixed(3)})`;
const luminance = (c) => {
  const f = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
};

const palette = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, hex(v)]));

// Three weathers. Every colour on screen is a blend of these.
const CALM = palette({
  skyTop: '#8fbccb', skyMid: '#bcdad9', skyLow: '#ece9cd',
  m3: '#9dbcc6', m2: '#7ba3b3', m1: '#5a8799',
  h3: '#5f927f', h2: '#407a66', h1: '#2c6253',
  ground: '#235247', road: '#e9dcae', front: '#0f2f2d',
  grass: '#3c7f62', grassDark: '#184239',
  tree: '#1c4a41', treeLit: '#3d8266',
  cloud: '#f6f6ea', haze: '#dfe9da',
  sun: '#fdf0b4', halo: '#fff6d2', ribbon: '#ffffff',
  cloak: '#d93a2b', cloakShade: '#a82a25',
  ink: '#12273a',
});
const STORM = palette({
  skyTop: '#14222f', skyMid: '#26404f', skyLow: '#6d8b93',
  m3: '#3e5a68', m2: '#2f4a58', m1: '#233b48',
  h3: '#24484a', h2: '#1a3b3e', h1: '#143035',
  ground: '#10282d', road: '#93a096', front: '#071619',
  grass: '#2a5a55', grassDark: '#0c2226',
  tree: '#0c2227', treeLit: '#1f4a49',
  cloud: '#0e1a24', haze: '#5f7d86',
  sun: '#b9c7c4', halo: '#93aab0', ribbon: '#eef5f2',
  cloak: '#b92f2a', cloakShade: '#851f22',
  ink: '#12273a',
});
const SUN = palette({
  skyTop: '#f6b950', skyMid: '#fbd27a', skyLow: '#fff0bf',
  m3: '#d9a3a8', m2: '#b97f9c', m1: '#8f5f8c',
  h3: '#b7a444', h2: '#8a933c', h1: '#5f7c35',
  ground: '#3f6430', road: '#ffe9ab', front: '#1e3a22',
  grass: '#7fa23a', grassDark: '#2c4c27',
  tree: '#2f5527', treeLit: '#86a53a',
  cloud: '#fff7dc', haze: '#ffe3ae',
  sun: '#fffbe6', halo: '#fff3c2', ribbon: '#fffdf0',
  cloak: '#e23b25', cloakShade: '#b22a21',
  ink: '#3d1830',
});
// Blue does not turn to gold without passing through mud, so the sky takes a
// detour through a pale, milky noon on the way.
const MILD = palette({
  skyTop: '#dbe6c9', skyMid: '#eeecca', skyLow: '#fbf5d8', cloud: '#fffbea', haze: '#f1ecc9',
  sun: '#ffe08a', halo: '#fff0b0',
});
const KEYS = Object.keys(CALM);
const PALE_INK = hex('#f4f5ea');
const SKIN = hex('#e7b48c');
const SHIRT = hex('#f3ead2');
const SLEEVE = hex('#dccfae');
const CLOTH = hex('#2b2733');
const STAFF = hex('#6b4a2e');
const GOLD = hex('#f2c14e');

// ---------- noise ----------

function hash(n, seed = 0) {
  let h = Math.imul(n | 0, 374761393) ^ Math.imul(seed | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, seed) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash(i, seed), hash(i + 1, seed), u);
}
function lin(x, seed) {
  const i = Math.floor(x);
  return lerp(hash(i, seed), hash(i + 1, seed), x - i);
}
function fbm(x, seed, octaves) {
  let sum = 0, amp = 0.5, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += vnoise(x, seed + o * 31) * amp;
    norm += amp;
    amp *= 0.5;
    x *= 2.03;
  }
  return sum / norm;
}

// ---------- the land ----------

// Back to front. base: where the foot of the ridge sits, as a fraction of the
// canvas height. amp: how far it rises above that. p: parallax speed.
const LAYERS = [
  { id: 'm3', base: 0.640, amp: 0.165, freq: 0.0270, p: 0.03, ridged: 1.0, seed: 11, haze: 0.62, step: 4 },
  { id: 'm2', base: 0.668, amp: 0.120, freq: 0.0340, p: 0.06, ridged: 0.9, seed: 23, haze: 0.52, step: 4 },
  { id: 'm1', base: 0.700, amp: 0.085, freq: 0.0300, p: 0.11, ridged: 0.45, seed: 37, haze: 0.42, step: 5 },
  { id: 'h3', base: 0.746, amp: 0.060, freq: 0.0230, p: 0.20, ridged: 0, seed: 41, haze: 0.30, step: 6 },
  { id: 'h2', base: 0.794, amp: 0.064, freq: 0.0200, p: 0.36, ridged: 0, seed: 53, haze: 0.18, step: 6,
    trees: { spacing: 5.5, chance: 0.42, min: 3.2, max: 6.0 } },
  { id: 'h1', base: 0.842, amp: 0.058, freq: 0.0165, p: 0.58, ridged: 0, seed: 67, haze: 0.08, step: 6,
    trees: { spacing: 9, chance: 0.5, min: 6.5, max: 11 } },
  { id: 'ground', base: 0.893, amp: 0.030, freq: 0.0085, p: 1.0, ridged: 0, seed: 71, haze: 0, step: 6 },
  { id: 'front', base: 0.992, amp: 0.045, freq: 0.0110, p: 1.7, ridged: 0, seed: 83, haze: 0, step: 8 },
];
const LAYER = Object.fromEntries(LAYERS.map((l) => [l.id, l]));

function ridge(layer, xU) {
  const x = xU * layer.freq + layer.seed * 17.31;
  const soft = fbm(x, layer.seed, 4);
  if (!layer.ridged) return soft;
  // Mountains are cut from straight slopes: a tent where the noise folds, plus facets.
  const fold = 1 - Math.abs(2 * fbm(x + 40, layer.seed + 5, 2) - 1);
  const peaks = 0.6 * Math.pow(fold, 1.25) + 0.27 * lin(x * 2.7 + 3, layer.seed + 9) + 0.13 * lin(x * 6.3, layer.seed + 13);
  return lerp(soft, peaks, layer.ridged);
}

// ---------- wind ribbons, clouds ----------

const RIBBONS = [
  { y: 0.33, len: 46, amp: 1.5, waves: 1.2, v: 1.0, off: 0.05, R: 2.6, dir: 1, wd: 0.42, at: -1, near: false },
  { y: 0.58, len: 38, amp: 1.2, waves: 1.6, v: 0.82, off: 0.55, R: 2.0, dir: -1, wd: 0.34, at: -1, near: false },
  { y: 0.44, len: 54, amp: 2.0, waves: 1.4, v: 1.15, off: 0.32, R: 3.2, dir: 1, wd: 0.5, at: 0.16, near: false },
  { y: 0.69, len: 42, amp: 1.4, waves: 2.0, v: 0.95, off: 0.78, R: 2.2, dir: 1, wd: 0.36, at: 0.26, near: false },
  { y: 0.52, len: 34, amp: 1.0, waves: 1.3, v: 1.3, off: 0.18, R: 1.7, dir: -1, wd: 0.3, at: 0.36, near: false },
  { y: 0.80, len: 50, amp: 1.5, waves: 1.7, v: 1.08, off: 0.63, R: 2.6, dir: 1, wd: 0.44, at: 0.44, near: true },
  { y: 0.385, len: 40, amp: 1.7, waves: 1.5, v: 0.9, off: 0.9, R: 2.3, dir: -1, wd: 0.36, at: 0.52, near: false },
  { y: 0.635, len: 58, amp: 2.2, waves: 1.9, v: 1.22, off: 0.44, R: 3.0, dir: 1, wd: 0.52, at: 0.6, near: false },
  { y: 0.745, len: 36, amp: 1.2, waves: 1.4, v: 1.4, off: 0.12, R: 1.9, dir: -1, wd: 0.32, at: 0.68, near: true },
  { y: 0.28, len: 44, amp: 1.6, waves: 1.3, v: 1.05, off: 0.7, R: 2.4, dir: 1, wd: 0.4, at: 0.76, near: false },
  { y: 0.87, len: 40, amp: 1.0, waves: 1.6, v: 1.5, off: 0.36, R: 1.8, dir: 1, wd: 0.34, at: 0.82, near: true },
];

const CLOUDS = Array.from({ length: 11 }, (_, i) => ({
  x: hash(i, 301),
  y: 0.07 + 0.36 * hash(i, 302),
  size: 5 + 6.5 * hash(i, 303),
  speed: 0.55 + 0.75 * hash(i, 304),
  at: (i + 0.5) / 11,
  puffs: Array.from({ length: 5 }, (_, j) => ({
    dx: (j - 2) * 0.62 + (hash(i * 7 + j, 305) - 0.5) * 0.3,
    r: 0.52 + 0.4 * hash(i * 7 + j, 306) - Math.abs(j - 2) * 0.1,
  })),
}));

function makeGrain() {
  const size = 192;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const r = hash(i, 911);
    const v = r > 0.5 ? 255 : 0;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = Math.abs(r - 0.5) * 2 * 15;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// Two-bone reach, for knees and elbows.
function reach(ax, ay, bx, by, l1, l2, dir) {
  const dx = bx - ax, dy = by - ay;
  const d = Math.min(Math.hypot(dx, dy), l1 + l2 - 0.01);
  const a0 = Math.atan2(dy, dx);
  const a1 = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  return [ax + l1 * Math.cos(a0 + dir * a1), ay + l1 * Math.sin(a0 + dir * a1)];
}

export class Scene {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.grain = makeGrain();
    this.grainPattern = null;

    this.t = 20;          // seconds of weather
    this.camX = 0;        // how far the traveller has walked, in px
    this.windDrift = 0;   // how far the wind has blown, in px
    this.phase = 0;       // walk cycle

    this.wind = 0.1;      this.windTarget = 0.1;
    this.sun = 0.3;       this.sunTarget = 0.3;
    this.heat = 0;        // how warm the traveller is, 0–1
    this.grip = 0.2;      // how tightly he holds the cloak, 0–1
    this.cloak = 1;       // 1 worn, 0 slung over the shoulder
    this.cloakWorn = true;

    this.W = 0; this.H = 0; this.U = 1; this.dpr = 1;
    this.pal = {};
    this.tone = 'dark';
    this.blend();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const W = Math.max(1, Math.round(r.width));
    const H = Math.max(1, Math.round(r.height));
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (W * H * dpr * dpr > 5.2e6) dpr = Math.max(1, Math.sqrt(5.2e6 / (W * H)));
    if (W === this.W && H === this.H && dpr === this.dpr) return;
    this.W = W; this.H = H; this.dpr = dpr;
    this.U = H / 100;
    this.portrait = W < H * 0.9;
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.grainPattern = this.ctx.createPattern(this.grain, 'repeat');
  }

  setWeather(wind, sun) {
    this.windTarget = clamp(wind);
    this.sunTarget = clamp(sun);
  }

  // ---------- simulation ----------

  step(dt) {
    dt = Math.min(dt, 0.1);
    const ease = 1 - Math.exp(-dt * 2.4);
    this.wind += (this.windTarget - this.wind) * ease;
    this.sun += (this.sunTarget - this.sun) * ease;
    const w = this.wind, s = this.sun;

    // He warms up only when the sun is strong and the wind lets it be.
    const heatTarget = clamp((s - 0.9 * w - 0.4) / 0.45);
    const rate = heatTarget > this.heat ? 0.6 : 1.3;
    this.heat += (heatTarget - this.heat) * (1 - Math.exp(-dt * rate));

    if (this.cloakWorn && this.heat > 0.88) this.cloakWorn = false;
    else if (!this.cloakWorn && this.heat < 0.6) this.cloakWorn = true;
    const goal = this.cloakWorn ? 1 : 0;
    const d = dt / 1.25;
    this.cloak = goal > this.cloak ? Math.min(goal, this.cloak + d) : Math.max(goal, this.cloak - d);

    // The harder it blows, the tighter he holds.
    const gripTarget = clamp(0.15 + 1.0 * w - 0.6 * this.heat) * (this.cloakWorn ? 1 : 0);
    this.grip += (gripTarget - this.grip) * (1 - Math.exp(-dt * 3));

    const pace = this.pace();
    const v = 7 * this.U * pace;
    this.camX += v * dt;
    this.phase += ((v / this.figureScale()) * Math.PI) / (2 * this.stride(pace)) * dt;
    this.windDrift += (3 + 30 * w * w + 10 * w) * this.U * dt;
    this.t += dt;
    this.blend();
  }

  // Jump straight to where the weather would leave things. Used when motion is reduced.
  settle() {
    this.wind = this.windTarget;
    this.sun = this.sunTarget;
    for (let i = 0; i < 80; i++) {
      const camX = this.camX, phase = this.phase, drift = this.windDrift, t = this.t;
      this.step(0.1);
      this.camX = camX; this.phase = phase; this.windDrift = drift; this.t = t;
    }
  }

  pace() {
    const w = this.wind;
    return (1 - 0.74 * smooth(0.15, 1, w)) * lerp(1.06, 1 - 0.2 * smooth(0.45, 0.9, this.heat), this.cloak);
  }
  stride(pace) { return 11 * (0.5 + 0.5 * clamp(pace)); }
  figureScale() { return (this.portrait ? 0.16 : 0.185) * this.H / 100; }

  // What the traveller is doing, in words, for the sandbox status line.
  mood() {
    const w = this.windTarget, s = this.sunTarget;
    if (!this.cloakWorn) return 'off';
    if (this.heat > 0.55 && s - 0.9 * w - 0.4 >= 0.396) return 'loosening';
    if (w > 0.72) return 'gale';
    if (w > 0.4) return 'windy';
    if (s > 0.72 && w > 0.2) return 'both';
    if (s > 0.6) return 'warm';
    if (w > 0.22) return 'breezy';
    return 'easy';
  }

  // ---------- colour ----------

  blend() {
    const w = this.wind, s = this.sun;
    const dark = smooth(0.22, 0.78, w) * (1 - 0.5 * smooth(0.3, 1, s));
    const warm = smooth(0.34, 0.95, s) * (1 - 0.75 * dark);
    this.dark = dark;
    this.warm = warm;
    for (const k of KEYS) {
      const base = mix(CALM[k], STORM[k], dark);
      this.pal[k] = !MILD[k] ? mix(base, SUN[k], warm)
        : warm < 0.5 ? mix(base, MILD[k], warm * 2) : mix(MILD[k], SUN[k], warm * 2 - 1);
    }
    const lum = luminance(mix(this.pal.skyTop, this.pal.skyMid, 0.5));
    this.skyLum = lum;
    if (this.tone === 'dark' && lum < 0.2) this.tone = 'light';
    else if (this.tone === 'light' && lum > 0.26) this.tone = 'dark';
  }

  // The colours the page around the canvas should take.
  colours() {
    const p = this.pal;
    return {
      tone: this.tone,
      ink: css(this.tone === 'light' ? PALE_INK : p.ink),
      sky: css(mix(p.skyTop, p.skyMid, 0.5)),
      ground: css(p.front),
    };
  }

  gust(x) {
    const k = x / this.U, t = this.t;
    return 0.72 + 0.2 * Math.sin(k * 0.085 + t * 1.9) + 0.14 * Math.sin(k * 0.23 + t * 3.3 + 1.7);
  }

  ridgeY(layer, x) {
    const xU = (x + this.camX * layer.p) / this.U;
    return (layer.base - layer.amp * ridge(layer, xU)) * this.H;
  }

  // ---------- drawing ----------

  render() {
    const { ctx, W, H, U, pal } = this;
    if (!W) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    this.drawSky();
    this.drawSun();
    this.drawClouds();

    for (const id of ['m3', 'm2', 'm1', 'h3', 'h2', 'h1']) this.drawLayer(LAYER[id]);

    this.drawStreaks(false);
    for (const r of RIBBONS) if (!r.near) this.drawRibbon(r);

    this.drawGround();
    this.drawTraveller();
    this.drawRoadsideGrass();

    for (const r of RIBBONS) if (r.near) this.drawRibbon(r);
    this.drawStreaks(true);
    this.drawFront();

    ctx.fillStyle = this.grainPattern;
    ctx.fillRect(0, 0, W, H);
  }

  drawSky() {
    const { ctx, W, H, pal } = this;
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.7);
    g.addColorStop(0, css(pal.skyTop));
    g.addColorStop(0.55, css(pal.skyMid));
    g.addColorStop(1, css(pal.skyLow));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  sunPosition() {
    const { W, H, U } = this;
    const s = this.sun;
    const x = this.portrait ? W * 0.74 : Math.max(W * 0.8, W - 34 * U);
    const y = H * (this.portrait ? lerp(0.42, 0.36, s) : lerp(0.27, 0.2, s));
    const r = U * lerp(4.2, 7.4, smooth(0.1, 1, s)) * (this.portrait ? 0.85 : 1);
    return { x, y, r };
  }

  drawSun() {
    const { ctx, U, pal } = this;
    const { x, y, r } = this.sunPosition();
    const s = this.sun;
    const show = 1 - 0.94 * this.dark;
    if (show < 0.02) return;

    const halos = [[3.9, 0.1], [2.7, 0.16], [1.75, 0.26]];
    for (const [k, a] of halos) {
      ctx.fillStyle = css(pal.halo, a * (0.35 + 0.65 * s) * show);
      ctx.beginPath();
      ctx.arc(x, y, r * k * (1 + 0.012 * Math.sin(this.t * 0.6 + k)), 0, TAU);
      ctx.fill();
    }

    const rays = smooth(0.42, 0.9, s) * show;
    if (rays > 0.01) {
      const n = 28;
      const spin = this.t * 0.035;
      ctx.fillStyle = css(pal.halo, 0.55 * rays);
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const a = spin + (i / n) * TAU;
        const long = i % 2 === 0;
        const r0 = r * 1.28;
        const r1 = r * (long ? 2.55 : 1.95) * (1 + 0.03 * Math.sin(this.t * 0.9 + i * 1.3));
        const half = (long ? 0.034 : 0.026);
        ctx.moveTo(x + Math.cos(a - half) * r0, y + Math.sin(a - half) * r0);
        ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
        ctx.lineTo(x + Math.cos(a + half) * r0, y + Math.sin(a + half) * r0);
        ctx.closePath();
      }
      ctx.fill();
    }

    ctx.fillStyle = css(pal.sun, show);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }

  drawClouds() {
    const { ctx, W, H, U, pal } = this;
    const cover = clamp(0.5 + 0.6 * this.dark - 0.5 * this.warm);
    const swell = 1 + 0.75 * this.dark;
    for (const c of CLOUDS) {
      const a = smooth(c.at - 0.14, c.at + 0.14, cover);
      if (a < 0.01) continue;
      const size = c.size * U * swell * (this.portrait ? 0.68 : 1);
      const span = W + size * 6;
      const x = W + size * 3 - ((c.x * span + this.windDrift * 0.16 * c.speed) % span);
      const y = c.y * H * (this.portrait ? 1.15 : 1);
      // Mixed into the sky rather than laid over it, so overlapping clouds merge.
      const f = clamp(y / (H * 0.7));
      const behind = f < 0.55 ? mix(pal.skyTop, pal.skyMid, f / 0.55) : mix(pal.skyMid, pal.skyLow, (f - 0.55) / 0.45);
      ctx.fillStyle = css(mix(behind, pal.cloud, lerp(0.5, 0.86, this.dark)), a);
      // puffs sitting on a ruled line: draw the circles, then cut them off flat
      const belly = y + size * 0.13;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x - size * 4, y - size * 2, size * 8, belly - (y - size * 2));
      ctx.clip();
      ctx.beginPath();
      for (const p of c.puffs) {
        const px = x + p.dx * size;
        const pr = p.r * size * 0.62;
        ctx.moveTo(px + pr, y);
        ctx.arc(px, y, pr, 0, TAU);
      }
      ctx.fill();
      ctx.restore();
    }
  }

  tracePath(layer, dy = 0) {
    const { ctx, W, H } = this;
    const step = layer.step;
    ctx.beginPath();
    ctx.moveTo(-step, H + 2);
    for (let x = -step; x <= W + step; x += step) ctx.lineTo(x, this.ridgeY(layer, x) + dy);
    ctx.lineTo(W + step, H + 2);
    ctx.closePath();
  }

  drawLayer(layer) {
    const { ctx, H, U, pal } = this;
    const col = pal[layer.id];
    const top = (layer.base - layer.amp) * H;
    const bottom = (layer.base + 0.07) * H;

    // a thin lit edge along each ridge, like a second pull of the block
    this.tracePath(layer, 0);
    ctx.fillStyle = css(mix(col, pal.skyLow, 0.34));
    ctx.fill();

    this.tracePath(layer, U * 0.32);
    const g = ctx.createLinearGradient(0, top, 0, bottom);
    g.addColorStop(0, css(col));
    g.addColorStop(1, css(mix(col, pal.haze, layer.haze)));
    ctx.fillStyle = g;
    ctx.fill();

    if (layer.trees) this.drawTrees(layer);
  }

  drawTrees(layer) {
    const { ctx, W, U, pal } = this;
    const tr = layer.trees;
    const gap = tr.spacing * U;
    const cam = this.camX * layer.p;
    const margin = tr.max * U;
    const from = Math.floor((cam - margin) / gap);
    const to = Math.ceil((cam + W + margin) / gap);
    const far = layer.id === 'h2';
    const dark = far ? mix(pal.tree, pal.h2, 0.28) : pal.tree;
    const lit = far ? mix(pal.treeLit, pal.h2, 0.3) : pal.treeLit;
    for (let k = from; k <= to; k++) {
      if (hash(k, layer.seed + 1) > tr.chance) continue;
      const x = (k + hash(k, layer.seed + 2) * 0.7) * gap - cam;
      const h = lerp(tr.min, tr.max, hash(k, layer.seed + 3)) * U;
      const y = this.ridgeY(layer, x) + U * 0.5;
      const sway = -(this.wind * 0.34 * this.gust(x) + 0.012 * Math.sin(this.t * 0.9 + k));
      if (hash(k, layer.seed + 4) < 0.72) this.poplar(x, y, h, sway, dark, lit);
      else this.roundTree(x, y, h * 0.62, sway, dark, lit);
    }
  }

  poplar(x, y, h, sway, dark, lit) {
    const { ctx } = this;
    const n = 12;
    const bend = (v) => sway * h * v * v;
    const half = (v) => 0.125 * h * Math.pow(Math.sin(Math.PI * Math.pow(v, 0.55)), 0.9);
    const py = (v) => y - 0.13 * h - v * 0.87 * h;

    ctx.strokeStyle = css(dark);
    ctx.lineWidth = Math.max(1, h * 0.028);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + bend(0.15), y - h * 0.3);
    ctx.stroke();

    ctx.fillStyle = css(dark);
    ctx.beginPath();
    ctx.moveTo(x + bend(0), py(0));
    for (let i = 1; i <= n; i++) { const v = i / n; ctx.lineTo(x + bend(v) + half(v), py(v)); }
    for (let i = n - 1; i >= 0; i--) { const v = i / n; ctx.lineTo(x + bend(v) - half(v), py(v)); }
    ctx.fill();

    ctx.fillStyle = css(lit);
    ctx.beginPath();
    ctx.moveTo(x + bend(0.06) + half(0.06) * 0.2, py(0.06));
    for (let i = 1; i <= n; i++) { const v = 0.06 + (i / n) * 0.9; ctx.lineTo(x + bend(v) + half(v) * 0.86, py(v)); }
    for (let i = n; i >= 0; i--) { const v = 0.06 + (i / n) * 0.9; ctx.lineTo(x + bend(v) + half(v) * 0.16, py(v)); }
    ctx.fill();
  }

  roundTree(x, y, h, sway, dark, lit) {
    const { ctx } = this;
    const lean = sway * h * 1.1;
    ctx.strokeStyle = css(dark);
    ctx.lineWidth = Math.max(1, h * 0.06);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x, y - h * 0.3, x + lean * 0.5, y - h * 0.55);
    ctx.stroke();
    const r = h * 0.36;
    const cx = x + lean * 0.7, cy = y - h * 0.68;
    ctx.fillStyle = css(dark);
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * (1 + Math.abs(sway) * 0.5), r * 0.92, 0, 0, TAU);
    ctx.ellipse(cx - r * 0.62 + lean * 0.25, cy + r * 0.3, r * 0.62, r * 0.56, 0, 0, TAU);
    ctx.ellipse(cx + r * 0.62, cy + r * 0.34, r * 0.56, r * 0.5, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = css(lit);
    ctx.beginPath();
    ctx.ellipse(cx + r * 0.3, cy - r * 0.2, r * 0.6, r * 0.52, 0, 0, TAU);
    ctx.ellipse(cx + r * 0.78, cy + r * 0.3, r * 0.36, r * 0.3, 0, 0, TAU);
    ctx.fill();
  }

  drawGround() {
    const { ctx, W, U, pal } = this;
    const layer = LAYER.ground;
    const step = layer.step;

    this.tracePath(layer, 0);
    ctx.fillStyle = css(mix(pal.ground, pal.grass, 0.55));
    ctx.fill();

    // the road runs along the crest
    ctx.beginPath();
    for (let x = -step; x <= W + step; x += step) {
      const y = this.ridgeY(layer, x) + U * 0.45;
      if (x === -step) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    for (let x = W + step; x >= -step; x -= step) {
      const xU = (x + this.camX) / U;
      const wob = 0.32 * (vnoise(xU * 0.12, 5) - 0.5);
      ctx.lineTo(x, this.ridgeY(layer, x) + U * (2.25 + wob));
    }
    ctx.closePath();
    ctx.fillStyle = css(pal.road);
    ctx.fill();

    // the bank below the road
    ctx.beginPath();
    ctx.moveTo(-step, this.H + 2);
    for (let x = -step; x <= W + step; x += step) {
      const xU = (x + this.camX) / U;
      const wob = 0.32 * (vnoise(xU * 0.12, 5) - 0.5);
      ctx.lineTo(x, this.ridgeY(layer, x) + U * (2.25 + wob));
    }
    ctx.lineTo(W + step, this.H + 2);
    ctx.closePath();
    ctx.fillStyle = css(pal.ground);
    ctx.fill();
  }

  blades(layer, { spacing, min, max, offset, width, seed, colourA, colourB, stiffness }) {
    const { ctx, W, U } = this;
    const gap = spacing * U;
    const cam = this.camX * layer.p;
    const from = Math.floor((cam - max * U) / gap);
    const to = Math.ceil((cam + W + max * U) / gap);
    const w = this.wind;
    for (const pass of [0, 1]) {
      ctx.strokeStyle = css(pass ? colourB : colourA);
      ctx.lineWidth = width * U;
      ctx.beginPath();
      for (let k = from; k <= to; k++) {
        const r = hash(k, seed);
        if ((r > 0.5 ? 1 : 0) !== pass) continue;
        const x = (k + hash(k, seed + 1)) * gap - cam;
        const h = lerp(min, max, hash(k, seed + 2)) * U;
        const y = this.ridgeY(layer, x) + offset * U + hash(k, seed + 3) * 0.5 * U;
        const idle = 0.1 * Math.sin(this.t * 1.1 + k * 0.7) + (hash(k, seed + 4) - 0.5) * 0.5;
        const lean = idle - (w * 1.5 * this.gust(x)) / stiffness;
        const tipX = x + Math.sin(lean) * h;
        const tipY = y - Math.cos(lean) * h;
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + Math.sin(lean * 0.25) * h * 0.55, y - h * 0.6, tipX, tipY);
      }
      ctx.stroke();
    }
  }

  drawRoadsideGrass() {
    const { pal } = this;
    this.blades(LAYER.ground, {
      spacing: 0.42, min: 0.9, max: 2.3, offset: 2.5, width: 0.2, seed: 501,
      colourA: pal.ground, colourB: mix(pal.grass, pal.ground, 0.35), stiffness: 1,
    });
  }

  drawFront() {
    const { ctx, pal } = this;
    const layer = LAYER.front;
    this.blades(layer, {
      spacing: 0.55, min: 2.2, max: 5.6, offset: 0.6, width: 0.3, seed: 601,
      colourA: pal.front, colourB: mix(pal.front, pal.grassDark, 0.7), stiffness: 1.25,
    });
    this.tracePath(layer, 0);
    ctx.fillStyle = css(pal.front);
    ctx.fill();
  }

  ribbonLine(r, x) {
    const { W, H } = this;
    if (this.portrait) return H * lerp(0.5, 0.9, (r.y - 0.28) / 0.6);
    if (r.y >= 0.5) return H * r.y;
    // high ribbons dive under the text as they cross the page
    const low = 0.505 + (r.y - 0.28) * 0.5;
    return H * lerp(r.y, low, smooth(W * 0.93, W * 0.6, x));
  }

  drawRibbon(r) {
    const { ctx, W, U, pal } = this;
    const w = this.wind;
    const base = r.at < 0 ? 0.3 + 0.7 * smooth(0, 0.3, w) : smooth(r.at, r.at + 0.14, w);
    const alpha = base * smooth(0.0, 0.07, w) * lerp(0.5, 0.92, smooth(0.1, 0.8, w));
    if (alpha < 0.01) return;

    const L = r.len * U * (0.8 + 0.5 * w);
    const R = r.R * U;
    const span = W + L * 1.5 + R * 4;
    const headX = W + R * 2 - ((r.off * span + this.windDrift * r.v) % span);
    const n = 46;
    const bodyEnd = 0.74;
    const turns = 1.3;
    const endY = this.ribbonLine(r, headX);
    const cy = endY - r.dir * R;

    let px = 0, py = 0;
    ctx.strokeStyle = css(pal.ribbon, alpha);
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      let x, y;
      if (u <= bodyEnd) {
        const b = u / bodyEnd;
        x = headX + L * (1 - b);
        const env = Math.sin(Math.PI * b) * (0.35 + 0.65 * b) * (1 - b * b * b) * 1.5;
        y = this.ribbonLine(r, x) + r.amp * U * (0.7 + 0.6 * w) * env *
            Math.sin(TAU * r.waves * b - this.t * (0.8 + 2.2 * w) * r.v + r.off * 9);
      } else {
        const c = (u - bodyEnd) / (1 - bodyEnd);
        const beta = c * turns * TAU;
        const rho = R * (1 - 0.82 * c);
        x = headX - rho * Math.sin(beta);
        y = cy + r.dir * rho * Math.cos(beta);
      }
      if (i > 0) {
        const taper = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.75)), 0.8);
        ctx.lineWidth = Math.max(0.6, r.wd * U * taper);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      px = x; py = y;
    }
  }

  // Dust and leaves that only a real wind picks up.
  drawStreaks(near) {
    const { ctx, W, H, U, pal } = this;
    const a = smooth(0.42, 0.95, this.wind);
    if (a < 0.01) return;
    const n = near ? 16 : 34;
    const seed = near ? 707 : 808;
    ctx.strokeStyle = css(pal.ribbon, 0.34 * a);
    ctx.lineWidth = U * (near ? 0.16 : 0.1);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const sp = 1.6 + 1.8 * hash(i, seed);
      const len = U * (3 + 7 * hash(i, seed + 1)) * (0.5 + this.wind);
      const span = W + len * 2;
      const x = W + len - ((hash(i, seed + 2) * span + this.windDrift * sp) % span);
      const band = near ? [0.8, 0.98] : [this.portrait ? 0.52 : 0.5, 0.86];
      const y = H * lerp(band[0], band[1], hash(i, seed + 3)) + U * 0.8 * Math.sin(this.t * 2 + i);
      ctx.moveTo(x, y);
      ctx.lineTo(x + len, y - U * 0.25);
    }
    ctx.stroke();

    if (near) return;
    const leaves = 12;
    for (let i = 0; i < leaves; i++) {
      const sp = 1.1 + 1.1 * hash(i, 909);
      const span = W + U * 10;
      const x = W + U * 5 - ((hash(i, 910) * span + this.windDrift * sp) % span);
      const y = H * lerp(0.56, 0.9, hash(i, 911)) + U * 2.4 * Math.sin(this.t * (1.5 + hash(i, 912)) + i * 2.1);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(this.t * (3 + 4 * hash(i, 913)) + i);
      ctx.fillStyle = css(i % 3 ? mix(pal.grass, GOLD, 0.25) : pal.treeLit, a);
      ctx.beginPath();
      ctx.ellipse(0, 0, U * 0.55, U * 0.22, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  // ---------- the traveller ----------

  travellerX() {
    return this.portrait ? this.W * 0.56 : this.W * 0.63;
  }

  drawTraveller() {
    const { ctx, U, pal } = this;
    const x = this.travellerX();
    const y = this.ridgeY(LAYER.ground, x) + U * 1.45;
    const k = this.figureScale();
    const local = clamp(this.wind * (0.86 + 0.3 * (this.gust(x) - 0.72)));

    // his shadow, thrown back along the road once the sun is out
    const light = clamp(0.1 + 0.9 * this.warm - 0.6 * this.dark);
    ctx.fillStyle = css(mix(pal.ground, CLOTH, 0.5), 0.34 * light + 0.06);
    ctx.beginPath();
    ctx.ellipse(x - k * (4 + 14 * this.warm), y + k * 0.6, k * (13 + 12 * this.warm), k * 2.1, 0, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, -k); // y now points up; the figure is 100 units tall
    this.figure(local);
    ctx.restore();
  }

  figure(w) {
    const { ctx, pal, t } = this;
    const c = this.cloak;
    const pace = this.pace();
    const S = this.stride(pace);
    const phase = this.phase;
    const dim = 0.3 * this.dark;
    const tint = (col) => mix(col, STORM.skyTop, dim);

    const moving = Math.abs(c - (this.cloakWorn ? 1 : 0)) > 0.001;
    const swirl = moving ? Math.sin(Math.PI * c) : 0;
    const open = smooth(0.2, 0.62, this.heat) * (1 - smooth(0.25, 0.5, w));
    const closed = clamp(c * (1 - open));

    const lean = 0.05 + 0.4 * w + 0.03 * Math.sin(phase * 2);
    const bow = 0.3 * smooth(0.35, 1, w) - 0.1 * (1 - c);
    const bob = Math.abs(Math.sin(phase)) * 1.3 * (S / 11);

    const hip = [0, 42.6 + bob];
    const ux = Math.sin(lean), uy = Math.cos(lean);
    const body = (lx, ly) => [hip[0] + lx * uy + ly * ux, hip[1] - lx * ux + ly * uy];
    const neck = body(0, 33);
    const ha = lean + bow;
    const head = [neck[0] + 7.6 * Math.sin(ha) + 0.8, neck[1] + 7.6 * Math.cos(ha)];

    const footAt = (ph) => {
      ph = ((ph % TAU) + TAU) % TAU;
      if (ph < Math.PI) return [S * (1 - 2 * (ph / Math.PI)), 0, 0];
      const u = (ph - Math.PI) / Math.PI;
      const e = u * u * (3 - 2 * u);
      return [S * (-1 + 2 * e), 5.2 * (S / 11) * Math.sin(Math.PI * u), Math.sin(Math.PI * u)];
    };

    const leg = (ph, colour) => {
      const [fx, fy, swing] = footAt(ph);
      const ankle = [hip[0] + fx, fy + 2.2];
      const knee = reach(hip[0], hip[1], ankle[0], ankle[1], 21, 21, 1);
      ctx.strokeStyle = css(colour);
      ctx.lineWidth = 5.4;
      ctx.beginPath();
      ctx.moveTo(hip[0], hip[1] - 1);
      ctx.lineTo(knee[0], knee[1]);
      ctx.lineTo(ankle[0], ankle[1]);
      ctx.stroke();
      const pitch = -0.55 * swing + 0.25 * swing * swing;
      ctx.lineWidth = 4.4;
      ctx.beginPath();
      ctx.moveTo(ankle[0] - 1, ankle[1] - 0.2);
      ctx.lineTo(ankle[0] + 5.2 * Math.cos(pitch), ankle[1] - 0.6 + 5.2 * Math.sin(pitch));
      ctx.stroke();
    };

    const cloth = tint(CLOTH);
    leg(phase + Math.PI, mix(cloth, pal.ground, 0.22));
    leg(phase, cloth);

    // --- the cape: a ribbon of cloth hung from the shoulders, and whatever the wind does to it
    const M = 10;
    const length = lerp(33, 53, c);
    const seg = length / M;
    const stream = clamp(0.05 + 1.12 * w + 0.9 * swirl, 0, 1.25);
    const flutter = 0.05 + 0.26 * w + 0.15 * swirl;
    const root = body(-3.2, 32.2);
    const spine = [root];
    let cx = root[0], cy = root[1];
    for (let j = 1; j <= M; j++) {
      const f = j / M;
      const th = lean * (1 - 0.7 * f) + stream * 1.32 * Math.pow(f, 0.72) +
                 flutter * f * Math.sin(t * (2.6 + 9 * w) - j * 0.82) +
                 0.05 * Math.sin(phase * 2 - f * 2) * (1 - w);
      cx -= Math.sin(th) * seg;
      cy -= Math.cos(th) * seg;
      spine.push([cx, cy]);
    }
    const widthAt = (f) => lerp(3.6, 12.6, Math.pow(f, 0.8)) * lerp(0.86, 1, c) * (1 - 0.18 * stream * f);
    const fore = [], aft = [];
    for (let j = 0; j <= M; j++) {
      const a = spine[Math.max(0, j - 1)], b = spine[Math.min(M, j + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const d = Math.hypot(dx, dy) || 1;
      const nx = -dy / d, ny = dx / d;
      const hw = widthAt(j / M);
      // the side nearest the body stays closer to it
      fore.push([spine[j][0] - nx * hw * 0.82, spine[j][1] - ny * hw * 0.82]);
      aft.push([spine[j][0] + nx * hw, spine[j][1] + ny * hw]);
    }
    const through = (pts) => {
      for (let j = 1; j < pts.length - 1; j++) {
        const mx = (pts[j][0] + pts[j + 1][0]) / 2, my = (pts[j][1] + pts[j + 1][1]) / 2;
        ctx.quadraticCurveTo(pts[j][0], pts[j][1], mx, my);
      }
      const last = pts[pts.length - 1];
      ctx.lineTo(last[0], last[1]);
    };
    ctx.fillStyle = css(pal.cloakShade);
    ctx.beginPath();
    ctx.moveTo(fore[0][0], fore[0][1]);
    through(fore);
    const hemF = fore[M], hemA = aft[M];
    const hemWave = 1.6 + 2.4 * w;
    ctx.bezierCurveTo(
      lerp(hemF[0], hemA[0], 0.33) - hemWave * Math.sin(t * 7 + 1), lerp(hemF[1], hemA[1], 0.33) - hemWave,
      lerp(hemF[0], hemA[0], 0.66) + hemWave * Math.sin(t * 7), lerp(hemF[1], hemA[1], 0.66) + hemWave * 0.4,
      hemA[0], hemA[1]);
    through(aft.slice().reverse());
    ctx.closePath();
    ctx.fill();

    // --- tunic
    const shirt = tint(SHIRT);
    ctx.fillStyle = css(shirt);
    ctx.beginPath();
    const tunic = [[-5.4, -9.5], [6.0, -9.5], [5.4, 0], [5.9, 14], [5.0, 29], [2.2, 34], [-3.6, 34], [-5.6, 28], [-5.9, 10], [-5.4, 0]];
    tunic.forEach(([lx, ly], i) => { const p = body(lx, ly); if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = css(shirt);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = css(tint(STAFF));
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    let b0 = body(-5.6, 1.2), b1 = body(5.6, 1.2);
    ctx.moveTo(b0[0], b0[1]);
    ctx.lineTo(b1[0], b1[1]);
    ctx.stroke();

    // --- the front of the cloak. Closed it covers him to the knee; open it hangs behind
    // his arm; off, it is a fold of red over one shoulder.
    const tight = 1 - 0.16 * this.grip;
    const hem = lerp(13, -15.5, c);
    const front = (full, back) => lerp(back, full * tight, closed);
    const fl = (0.5 + 2.2 * w) * Math.sin(t * (4 + 8 * w) + 2);
    const panel = [
      body(-4.6, 34.6), body(3.9, 34.6),
      body(front(7.6, -1.2), 23), body(front(8.8, -2.6), lerp(24, 7, c)),
      body(front(8.4, -3.6) + fl * 0.5, hem + 1.5),
      body(-7.8 - 2.5 * stream + fl, hem), body(-7.2 - 1.2 * stream, lerp(26, 14, c)),
    ];
    ctx.fillStyle = css(pal.cloak);
    ctx.beginPath();
    ctx.moveTo(panel[0][0], panel[0][1]);
    ctx.lineTo(panel[1][0], panel[1][1]);
    ctx.quadraticCurveTo(panel[2][0], panel[2][1], panel[3][0], panel[3][1]);
    ctx.lineTo(panel[4][0], panel[4][1]);
    ctx.quadraticCurveTo((panel[4][0] + panel[5][0]) / 2, (panel[4][1] + panel[5][1]) / 2 - 1.6 - fl * 0.4, panel[5][0], panel[5][1]);
    ctx.quadraticCurveTo(panel[6][0], panel[6][1], panel[0][0], panel[0][1]);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = css(pal.cloak);
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // --- head and hat
    ctx.fillStyle = css(tint(SKIN));
    ctx.beginPath();
    ctx.arc(head[0], head[1], 5.3, 0, TAU);
    ctx.fill();
    ctx.beginPath(); // nose
    ctx.moveTo(head[0] + 4.6 * Math.cos(-ha) , head[1] + 4.6 * Math.sin(-ha) + 1.4);
    ctx.lineTo(head[0] + 7.4 * Math.cos(-ha - 0.12), head[1] + 7.4 * Math.sin(-ha - 0.12));
    ctx.lineTo(head[0] + 4.6 * Math.cos(-ha - 0.3), head[1] + 4.6 * Math.sin(-ha - 0.3) - 1);
    ctx.fill();

    ctx.save();
    ctx.translate(head[0], head[1]);
    ctx.rotate(-ha - 0.1 + 0.16 * (1 - c));
    ctx.fillStyle = css(cloth);
    ctx.beginPath();
    ctx.ellipse(0.4, 3.1, 11.2, 1.9, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-5.4, 3.2);
    ctx.bezierCurveTo(-5.2, 11.5, 5.6, 11.5, 5.8, 3.2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = css(tint(GOLD));
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(-5.2, 5);
    ctx.lineTo(5.6, 5);
    ctx.stroke();
    ctx.lineCap = 'round';
    ctx.restore();
    const brim = [head[0] + 6.5 * Math.cos(-ha) + 3.2 * Math.sin(ha), head[1] + 6.5 * Math.sin(-ha) + 3.2 * Math.cos(ha)];

    // --- clasp
    if (closed > 0.5) {
      const clasp = body(3.6, 32.4);
      ctx.fillStyle = css(tint(GOLD), smooth(0.5, 0.8, closed));
      ctx.beginPath();
      ctx.arc(clasp[0], clasp[1], 1.25, 0, TAU);
      ctx.fill();
    }

    // --- the staff, planted once every two steps
    const sp = (((phase + Math.PI * 0.9) % TAU) + TAU) % TAU / TAU;
    let tipX, tipY = 0;
    if (sp < 0.62) tipX = lerp(17, -5, sp / 0.62);
    else {
      const u = (sp - 0.62) / 0.38;
      tipX = lerp(-5, 17, u * u * (3 - 2 * u));
      tipY = 3.4 * Math.sin(Math.PI * u);
    }
    tipX = lerp(11, tipX, S / 11);
    const sleeve = tint(SLEEVE);
    const shoulder = body(1.2, 30.2);
    const grasp = body(10.8 + 0.25 * (tipX - 6), 10 + 4 * w);
    const sd = Math.hypot(grasp[0] - tipX, grasp[1] - tipY) || 1;
    const sx = (grasp[0] - tipX) / sd, sy = (grasp[1] - tipY) / sd;
    ctx.strokeStyle = css(tint(STAFF));
    ctx.lineWidth = 2.1;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX + sx * 84, tipY + sy * 84);
    ctx.stroke();

    // --- the far arm: at rest it is hidden; in a gale it comes up to hold his hat on
    const hat = smooth(0.48, 0.8, w) * c;
    if (hat > 0.01) {
      const farShoulder = body(2.4, 30.6);
      const chest = body(5.6, 25);
      const hx = lerp(chest[0], brim[0], hat), hy = lerp(chest[1], brim[1], hat);
      const el = reach(farShoulder[0], farShoulder[1], hx, hy, 11.5, 11.5, -1);
      ctx.strokeStyle = css(sleeve, clamp(hat * 1.6));
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(farShoulder[0], farShoulder[1]);
      ctx.lineTo(el[0], el[1]);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      ctx.fillStyle = css(tint(SKIN), clamp(hat * 1.6));
      ctx.beginPath();
      ctx.arc(hx, hy, 2.3, 0, TAU);
      ctx.fill();
    }

    // --- the near arm, on the staff
    const elbow = reach(shoulder[0], shoulder[1], grasp[0], grasp[1], 12.6, 12.6, -1);
    ctx.strokeStyle = css(sleeve);
    ctx.lineWidth = 4.3;
    ctx.beginPath();
    ctx.moveTo(shoulder[0], shoulder[1]);
    ctx.lineTo(elbow[0], elbow[1]);
    ctx.lineTo(grasp[0], grasp[1]);
    ctx.stroke();
    ctx.fillStyle = css(tint(SKIN));
    ctx.beginPath();
    ctx.arc(grasp[0], grasp[1], 2.5, 0, TAU);
    ctx.fill();

    // --- and once the cloak is off, he whistles
    const tune = (1 - c) * smooth(0.3, 0.6, this.warm);
    if (tune > 0.02) {
      for (let i = 0; i < 3; i++) {
        const u = (((t * 0.3 + i / 3) % 1) + 1) % 1;
        const nx = head[0] + 9 + 20 * u + 2.5 * Math.sin(u * 9 + i);
        const ny = head[1] + 5 + 19 * u;
        const a = Math.sin(Math.PI * u) * tune;
        ctx.fillStyle = css(pal.ink, a);
        ctx.strokeStyle = css(pal.ink, a);
        ctx.beginPath();
        ctx.ellipse(nx, ny, 1.9, 1.35, 0.4, 0, TAU);
        ctx.fill();
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        ctx.moveTo(nx + 1.7, ny + 0.4);
        ctx.lineTo(nx + 1.7, ny + 7.2);
        ctx.quadraticCurveTo(nx + 3.2, ny + 6.4, nx + 4.4, ny + 4.6);
        ctx.stroke();
      }
    }
  }
}
