/**
 * ONE-OFF, run locally: copies what the profile needs out of the shab.boo monorepo (../matthiola) into data/.
 * CI never runs this; build.mjs reads only data/.
 *
 *   node scripts/extract.mjs [path/to/matthiola]
 *
 * - data/palette.json   ShabUI night and day tokens (packages/kit/src/styles/tokens.css), named by role
 * - data/sprites/*.json the grey cat and the perched roller (apps/landing/src/scenes/figures/data.ts)
 * - data/skyline.json   the landing's far Istanbul (apps/landing/src/scenes/depth/far.tsx), rasterised to cells
 *
 * The figures keep their landing colours in both themes; on day paper they get a pencil outline. Edge contrast is
 * checked against the ground under each figure (the kit's rule for art: 1.7:1).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { contrast, mix } from "./lib/color.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../data");
const MONO = resolve(process.argv[2] ?? join(HERE, "../../matthiola"));

/* ---- tokens ---- */
const css = readFileSync(join(MONO, "packages/kit/src/styles/tokens.css"), "utf8");
const tokens = new Map();
for (const m of css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{3,8})\s*;/gi)) if (!tokens.has(m[1])) tokens.set(m[1], m[2]);
const t = (name) => {
  const v = tokens.get(name);
  if (!v) throw new Error(`token --${name} missing`);
  return v.length === 4 ? `#${[...v.slice(1)].map((c) => c + c).join("")}` : v;
};

/** Scene roles per theme. Night follows the landing's far city; day draws it as pencil on day paper. */
const palette = {
  night: {
    ground: t("ink"),
    sky: [t("ink"), mix(t("ink-2"), t("ink"), 0.5), t("ink-2"), mix(t("ink-3"), t("ink-2"), 0.5), t("ink-3")],
    shore: t("ink-2"),
    shoreline: t("line"),
    far1: mix(t("ink-2"), t("ink"), 0.4),
    far1Edge: mix(t("line"), mix(t("ink-2"), t("ink"), 0.4), 0.35),
    far2: mix(t("ink-2"), t("ink"), 0.7),
    far2Edge: mix(t("line"), mix(t("ink-2"), t("ink"), 0.7), 0.5),
    body: t("ink-2"),
    bodyEdge: t("line"),
    lit: mix(t("paper"), t("ink-2"), 0.45),
    litBright: mix(t("paper"), t("ink-2"), 0.6),
    light: t("paper"),
    water: t("ink-3"),
    ripple: t("line"),
    moon: t("paper"),
    moonShade: t("paper-dim"),
    text: t("paper"),
    textMuted: t("paper-dim"),
    accent: t("accent-text"),
    signal: t("signal"),
    rule: t("line"),
    control: t("line-control"),
    meterOff: t("ink-4"),
    leaf: t("accent-text"),
    leafShade: t("accent-strong"),
    bloom: t("bloom"),
    bloomShade: t("bloom-shade"),
    bloomLight: t("bloom-light"),
    soil: t("line-control"),
    soilDim: t("line"),
    outline: null,
    raised: t("ink-2"),
    strong: t("accent-strong"),
  },
  day: {
    ground: t("day-paper"),
    sky: [t("day-paper-raised"), mix(t("day-paper"), t("day-paper-raised"), 0.5), t("day-paper"), mix(t("day-paper-sunken"), t("day-paper"), 0.4), mix(t("day-paper-sunken"), t("day-paper"), 0.7)],
    shore: t("day-paper-sunken"),
    shoreline: t("day-line-control"),
    far1: mix(t("day-paper-sunken"), t("day-paper"), 0.5),
    far1Edge: t("day-line"),
    far2: t("day-paper-sunken"),
    far2Edge: mix(t("day-line-control"), t("day-line"), 0.5),
    body: t("day-paper-raised"),
    bodyEdge: t("day-line-control"),
    lit: t("day-ink-off"),
    litBright: t("day-ink-dim"),
    light: t("day-ink-dim"),
    water: t("day-paper-deep"),
    ripple: t("day-line-control"),
    moon: t("day-moon"),
    moonShade: t("day-moon-shade"),
    text: t("day-ink"),
    textMuted: t("day-ink-dim"),
    accent: t("day-accent-text"),
    signal: t("day-signal"),
    rule: t("day-line"),
    control: t("day-line-control"),
    meterOff: t("day-line"),
    leaf: t("accent-strong"),
    leafShade: t("accent"),
    bloom: t("bloom-shade"),
    bloomShade: t("day-bloom-shade"),
    bloomLight: t("bloom"),
    soil: t("day-line-control"),
    soilDim: t("day-line"),
    outline: t("day-ink-dim"),
    raised: t("day-paper-raised"),
    strong: t("accent-strong"),
  },
};

/* ---- figures ---- */
const figures = await import(join(MONO, "apps/landing/src/scenes/figures/data.ts"));
const CLASS_VAR = { "f-ink": "ink", "f-paper": "paper", "f-dim": "paper-dim", "f-accent": "accent" };
const legendHex = (legend) =>
  Object.fromEntries(Object.entries(legend).map(([k, cls]) => [k, t(CLASS_VAR[cls] ?? cls.replace(/^f-/, ""))]));

const cat = {
  source: "apps/landing/src/scenes/figures/data.ts KHIALCHE_CAT (grey coat), painted by packages/painter",
  w: figures.KHIALCHE_CAT.w,
  h: figures.KHIALCHE_CAT.h,
  legend: legendHex(figures.CAT_GREY_LEGEND),
  frames: { rest: figures.KHIALCHE_CAT.frames.sit, blink: figures.KHIALCHE_CAT.frames["sit-blink"] },
};
const roller = {
  source: "apps/landing/src/scenes/figures/data.ts ROLLER_FAR, painted by packages/painter",
  w: figures.ROLLER_FAR.w,
  h: figures.ROLLER_FAR.h,
  grip: [16, 16],
  legend: legendHex(figures.ROLLER_LEGEND),
  frames: { rest: figures.ROLLER_FAR.frames["perch-0"], bob: figures.ROLLER_FAR.frames["perch-1"] },
};

/* ---- skyline: the landing's IstanbulFar, same seed, rasterised at CELL units per cell ---- */
const CELL = 1.5;
const X0 = -96;
const X1 = 414;
const Y0 = 62;
const Y1 = 253;
const W = Math.round((X1 - X0) / CELL);
const H = Math.round((Y1 - Y0) / CELL);
const r1 = (n) => Math.round(n * 10) / 10;

const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const arc = (cx, cy, r, from, to, n = 20) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = from + ((to - from) * i) / n;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
const upperHalf = (cx, cy, r) => [...arc(cx, cy, r, Math.PI, 2 * Math.PI)];
const cubic = (p0, p1, p2, p3, n = 16) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const s = i / n;
    const u = 1 - s;
    return [0, 1].map((k) => u ** 3 * p0[k] + 3 * u * u * s * p1[k] + 3 * u * s * s * p2[k] + s ** 3 * p3[k]);
  });
/** a stroke of width `w` along a vertical or horizontal segment, at least one cell thick */
const stroke = (x0, y0, x1, y1, w = 1) => {
  const half = Math.max(w, CELL) / 2;
  return x0 === x1 ? rect(x0 - half, Math.min(y0, y1), x0 + half, Math.max(y0, y1)) : rect(Math.min(x0, x1), y0 - half, Math.max(x0, x1), y0 + half);
};

function inPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** cell mask covered by any of the polygons */
function mask(polys) {
  const m = Array.from({ length: H }, () => Array(W).fill(false));
  for (const poly of polys) {
    const xs = poly.map((p) => p[0]);
    const ys = poly.map((p) => p[1]);
    const i0 = Math.max(0, Math.floor((Math.min(...xs) - X0) / CELL));
    const i1 = Math.min(W - 1, Math.ceil((Math.max(...xs) - X0) / CELL));
    const j0 = Math.max(0, Math.floor((Math.min(...ys) - Y0) / CELL));
    const j1 = Math.min(H - 1, Math.ceil((Math.max(...ys) - Y0) / CELL));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) if (inPoly(X0 + (i + 0.5) * CELL, Y0 + (j + 0.5) * CELL, poly)) m[j][i] = true;
  }
  return m;
}

const roles = Array.from({ length: H }, () => Array(W).fill("sky"));
/** paint a layer: fill role inside, edge role on cells whose neighbour is outside ("all" sides, or "top" only) */
function layer(polys, fill, edge, sides = "all") {
  const m = mask(polys);
  const at = (i, j) => j >= 0 && j < H && i >= 0 && i < W && m[j][i];
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      if (!m[j][i]) continue;
      const out = sides === "top" ? !at(i, j - 1) : !at(i, j - 1) || !at(i - 1, j) || !at(i + 1, j) || (j < H - 1 && !at(i, j + 1));
      if (fill || (edge && out)) roles[j][i] = edge && out ? edge : fill;
    }
  return m;
}

// the city, ported from far.tsx with its seed and its order of draws, so the windows land where the landing's do
const [IX0, IX1] = [-1560, 960];
let seed = 34_2026;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const flats = [];
const row = (name, base, lo, hi, gap) => {
  const polys = [];
  const lit = [];
  for (let x = IX0; x < IX1; ) {
    const w = 10 + Math.floor(rnd() * 18);
    const near = x + w > 350 && x < 410;
    const h = near ? lo * 0.6 : lo + rnd() * (hi - lo);
    const top = r1(base - h);
    if (rnd() < 0.35)
      polys.push([[x, base], [x, top], [r1(x + w / 2), r1(top - 5)], [x + w, top], [x + w, base]]);
    else {
      polys.push(rect(x, top, x + w, base));
      flats.push({ row: name, x, w, top });
    }
    for (let wy = top + 4; wy < base - 4; wy += 6)
      for (let wx = x + 3; wx < x + w - 3; wx += 5) if (rnd() < 0.07) lit.push(rect(wx, r1(wy), wx + 2, r1(wy) + 3));
    x += w + gap;
  }
  return { polys, lit };
};
const hills = row("hills", 232, 40, 96, 0);
const back = row("back", 236, 20, 64, 0);
const front = row("front", 244, 10, 34, 1);
const mosques = [];
for (let x = IX0 + 70; x < IX1 - 60; x += 150 + Math.floor(rnd() * 140)) {
  if (x > 320 && x < 440) continue;
  const r = 12 + Math.floor(rnd() * 10);
  const b = 236 - 26;
  mosques.push(rect(x - r - 8, b, x + r + 8, b + 26), upperHalf(x, b, r));
  mosques.push(upperHalf(x - r - 2, b, 6), upperHalf(x + r + 2, b, 6));
  mosques.push(rect(x - 0.6, b - r - 6, x + 0.6, b - r));
  const four = rnd() < 0.4;
  for (const mx of four ? [x - r - 14, x - r - 6, x + r + 6, x + r + 14] : [x - r - 10, x + r + 10]) {
    const mh = 2 * r + 34 + Math.floor(rnd() * 12);
    mosques.push([[mx - 1.5, b + 26], [mx - 1.5, b + 26 - mh], [mx, b + 20 - mh], [mx + 1.5, b + 26 - mh], [mx + 1.5, b + 26]]);
  }
}
let shore = [];
for (let x = IX0; x <= IX1; x += 15) shore.push([x, r1(230 + 4 * Math.sin(x / 97) + 2 * Math.sin(x / 31 + 1))]);
shore = [...shore, [IX1, 252], [IX0, 252]];

layer([shore], "shore", "shoreline", "top");
layer(hills.polys, "far1", "far1Edge");
// the towers: the business cluster and Camlica on its hill
layer(
  [
    rect(-62, 140, -48, 236),
    [[-42, 236], [-42, 118], [-34, 104], [-26, 118], [-26, 236]],
    [[-20, 236], [-20, 100], [-4, 90], [-4, 236]],
    [[4, 236], [4, 124], [9, 120], [14, 124], [14, 236]],
    [[18, 236], [18, 132], [23, 128], [28, 132], [28, 236]],
  ],
  "body",
  "bodyEdge",
);
layer([stroke(-34, 104, -34, 86), stroke(-12, 95, -12, 76)], "bodyEdge", null);
layer([cubic([150, 236], [164, 222], [184, 216], [196, 216]).concat(cubic([196, 216], [210, 216], [230, 224], [244, 236]))], "far2", "far2Edge", "top");
layer([[[193, 218], [195, 100], [198, 100], [200, 218]], rect(188, 128, 205, 136), rect(190, 110, 203, 116)], "body", "bodyEdge");
layer([stroke(196.5, 100, 196.5, 76)], "bodyEdge", null);
layer(back.polys, "far2", "far2Edge");
layer(mosques, "body", "bodyEdge");
layer(front.polys, "body", "bodyEdge");
layer([...hills.lit, ...back.lit, ...front.lit], "lit", null);
layer(
  [-58, -52, -37, -31, -15, -9, 7, 21, 10].map((x, k) => rect(x, [150, 172, 136, 196, 126, 166, 140, 160, 190][k], x + 2, [150, 172, 136, 196, 126, 166, 140, 160, 190][k] + 3)),
  "lit",
  null,
);
layer([rect(191, 131, 193, 133), rect(195, 131, 197, 133), rect(199, 131, 201, 133)], "litBright", null);
layer([rect(-35, 84, -33, 86), rect(-13, 74, -11, 76), rect(195.5, 74, 197.5, 76)], "light", null);
// the Bosphorus and its ripples
layer([rect(IX0, 240, IX1, 252)], "water", null);
layer(
  [[-1400, 14], [-1100, 10], [-800, 12], [-500, 10], [-200, 14], [100, 10], [300, 12], [520, 14], [760, 10]].map(([x, l], k) =>
    stroke(x, [246, 244, 247, 245, 246, 244, 247, 245, 246][k], x + l, [246, 244, 247, 245, 246, 244, 247, 245, 246][k]),
  ),
  "ripple",
  null,
);
// Galata: the stone cylinder, its balcony ring, the conical cap
layer([rect(372, 176, 388, 240), rect(370, 172, 390, 176), [[372, 172], [380, 154], [388, 172]]], "body", "bodyEdge");
layer([373, 377, 381, 385].map((x) => rect(x, 177, x + 2, 179)), "litBright", null);

const cellOf = (x, y) => [Math.round((x - X0) / CELL), Math.round((y - Y0) / CELL)];
// the cat sits on the front-row flat roof nearest Galata's left; the roller grips Galata's cap
const perch = flats
  .filter((f) => f.row === "front" && f.w >= 16 && f.x > 250 && f.x + f.w < 366)
  .sort((a, b) => b.x - a.x)[0];
if (!perch) throw new Error("no flat roof for the cat");
const [catX, catY] = cellOf(perch.x + perch.w / 2, perch.top);
// the cap's apex as drawn: the first ink cell down the tip's column (the nominal apex can round a row too high)
const [tipX] = cellOf(380, 154);
const tipY = roles.findIndex((r) => r[tipX] !== "sky");
const placements = {
  cat: { x: catX - 12, y: catY - cat.h },
  roller: { x: tipX - roller.grip[0], y: tipY - roller.grip[1] - 1 },
};

/* ---- checks: figure edges against what they stand on, in both themes ---- */
const report = [];
for (const [name, fig] of [["cat", cat], ["roller", roller]]) {
  const at = placements[name];
  for (const theme of ["night", "day"]) {
    let worst = Number.POSITIVE_INFINITY;
    for (const rows of Object.values(fig.frames))
      rows.forEach((r, j) =>
        [...r].forEach((ch, i) => {
          if (ch === ".") return;
          const edge = [[0, -1], [-1, 0], [1, 0], [0, 1]].some(([dx, dy]) => (rows[j + dy]?.[i + dx] ?? ".") === ".");
          if (!edge) return;
          const gy = at.y + j;
          const gx = at.x + i;
          const role = roles[gy]?.[gx] ?? "sky";
          const ground = role === "sky" ? palette[theme].sky[Math.min(4, Math.floor((gy / H) * 5))] : palette[theme][role];
          // on day paper the pencil outline is the edge: it is what must stand off the ground
          const outline = palette[theme].outline;
          worst = Math.min(worst, outline ? contrast(outline, ground) : contrast(fig.legend[ch], ground));
        }),
      );
    report.push(`${name} ${theme}: worst edge ${worst.toFixed(2)}:1${palette[theme].outline ? " (the pencil outline)" : ""}`);
  }
}

/* ---- write ---- */
const letters = {
  sky: ".", shore: "s", shoreline: "S", far1: "h", far1Edge: "H", far2: "b", far2Edge: "B", body: "f", bodyEdge: "F",
  lit: "w", litBright: "W", light: "L", water: "q", ripple: "r",
};
mkdirSync(join(OUT, "sprites"), { recursive: true });
writeFileSync(join(OUT, "palette.json"), `${JSON.stringify({ source: "packages/kit/src/styles/tokens.css", ...palette }, null, 2)}\n`);
writeFileSync(join(OUT, "sprites/cat.json"), `${JSON.stringify(cat, null, 2)}\n`);
writeFileSync(join(OUT, "sprites/roller.json"), `${JSON.stringify(roller, null, 2)}\n`);
writeFileSync(
  join(OUT, "skyline.json"),
  `${JSON.stringify(
    {
      source: "apps/landing/src/scenes/depth/far.tsx IstanbulFar, rasterised",
      w: W,
      h: H,
      legend: Object.fromEntries(Object.entries(letters).map(([k, v]) => [v, k])),
      placements,
      rows: roles.map((r) => r.map((role) => letters[role]).join("")),
    },
    null,
    1,
  )}\n`,
);
console.log(`skyline ${W}x${H} cells; cat at ${placements.cat.x},${placements.cat.y}; roller at ${placements.roller.x},${placements.roller.y}`);
for (const line of report) console.log(line);
