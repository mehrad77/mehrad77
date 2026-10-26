/**
 * A year of contributions as a bed of matthiola: one plant per week, its height the week's level (0-4, by quartile of
 * the weeks that had any). Light from the upper left: left petals and leaves lit, right ones shaded.
 */
import { makeGrid, stamp } from "./svg.mjs";
import { textRows, textWidth } from "./text.mjs";

const COL = 6;
const MARGIN = 4;
const HEIGHTS = [0, 4, 9, 14, 20];
const RACEME = [0, 0, 3, 6, 10];

/** weekly totals -> levels 0..4 */
export function levels(totals) {
  const active = totals.filter((n) => n > 0).sort((a, b) => a - b);
  const q = (p) => active[Math.min(active.length - 1, Math.floor(p * active.length))] ?? 0;
  const [q1, q2, q3] = [q(0.25), q(0.5), q(0.75)];
  return totals.map((n) => (n === 0 ? 0 : n <= q1 ? 1 : n <= q2 ? 2 : n <= q3 ? 3 : 4));
}

function plant(g, cx, soil, level, jitter, c) {
  if (!level) return;
  const h = HEIGHTS[level] + (level > 1 ? jitter : 0);
  const top = soil - h;
  for (let y = soil - 1; y >= top; y--) g[y][cx] = c.leaf;
  if (level === 1) {
    g[top][cx - 1] = c.leaf;
    g[top][cx + 1] = c.leafShade;
    g[top - 1][cx] = c.bloomShade;
    return;
  }
  // a pair of leaves low on the stem, a second pair on the taller ones
  for (const y of level > 2 ? [soil - 2, soil - 6] : [soil - 2]) {
    g[y][cx - 1] = c.leaf;
    g[y - 1][cx - 2] = c.leaf;
    g[y][cx + 1] = c.leafShade;
    g[y - 1][cx + 2] = c.leafShade;
  }
  // the raceme: two-cell flowers alternating sides up the top of the stem, a pale bud at the tip
  const len = RACEME[level];
  for (let k = 0; k < len; k += 2) {
    const y = top + 1 + k;
    const left = (k / 2) % 2 === 0;
    if (left) {
      g[y][cx - 2] = c.bloomLight;
      g[y][cx - 1] = c.bloom;
      g[y + 1][cx - 1] = c.bloomShade;
    } else {
      g[y][cx + 1] = c.bloom;
      g[y][cx + 2] = c.bloomShade;
      g[y + 1][cx + 1] = c.bloomShade;
    }
  }
  g[top - 1][cx] = c.bloomLight;
}

/** plots: [{ total }], oldest first, one plant each (a week, or a fortnight on a narrow screen); `width` in cells (at
 * least the bed's own). The range goes under the caption when the two don't fit on one line. Returns the cell grid
 * and its size. */
export function gardenGrid(weeks, c, caption, range, width = 0) {
  const lv = levels(weeks.map((w) => w.total));
  const w = Math.max(MARGIN * 2 + weeks.length * COL, width);
  const left = Math.floor((w - weeks.length * COL) / 2);
  const soil = 2 + HEIGHTS[4] + 2;
  const ty = soil + 1 + 3 + 3;
  const stacked = textWidth(caption) + 8 + textWidth(range) > w - MARGIN * 2;
  const h = ty + 5 + (stacked ? 8 : 0) + 2;
  const g = makeGrid(w, h);
  let seed = 887;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  weeks.forEach((_, i) => plant(g, left + i * COL + 2, soil, lv[i], Math.floor(rnd() * 3) - 1, c));
  for (let x = MARGIN - 2; x < w - MARGIN + 2; x++) g[soil][x] = c.soil;
  // the hatch under the soil line, as on the landing's ground
  for (let x = MARGIN; x < w - MARGIN - 2; x += 5 + Math.floor(rnd() * 5)) {
    const y = soil + 2 + Math.floor(rnd() * 2);
    g[y][x] = c.soilDim;
    g[y + 1][x + 1] = c.soilDim;
  }
  stamp(g, textRows(caption), { "#": c.textMuted }, MARGIN, ty);
  stamp(g, textRows(range), { "#": c.textMuted }, stacked ? MARGIN : w - MARGIN - textWidth(range), stacked ? ty + 8 : ty);
  return { grid: g, w, h, levels: lv };
}
