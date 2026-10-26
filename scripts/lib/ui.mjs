/**
 * The hello page's card and buttons as pixel pictures. The card follows shab.boo's #hello card (a raised panel with a
 * dashed accent edge); the buttons follow ShabUI's PixelButton (notched corners, a one-step ledge under the bottom
 * edge, light from the upper left). Every word is drawn in the pixel fonts, wrapped to the picture's width.
 */
import { MARK_ROWS, CAP, HEIGHT, proseRows, proseSpan, proseWidth } from "./font.mjs";
import { makeGrid, stamp } from "./svg.mjs";
import { textRows, textWidth } from "./text.mjs";

/** A dashed edge, two on and two off, mirrored from each corner so all four corners open alike. */
export function dashedFrame(g, w, h, ink) {
  const on = (i, n) => {
    const d = Math.min(i, n - 1 - i);
    return d >= 4 && d % 4 < 2;
  };
  for (let x = 0; x < w; x++) if (on(x, w)) g[0][x] = g[h - 1][x] = ink;
  for (let y = 0; y < h; y++) if (on(y, h)) g[y][0] = g[y][w - 1] = ink;
}

/** every cell of the rows drawn as a k x k block */
export const scaleRows = (rows, k) =>
  k === 1 ? rows : rows.flatMap((r) => Array(k).fill([...r].map((ch) => ch.repeat(k)).join("")));

/**
 * Greedy wrap: break `text` at `sep` so each line measures at most `max` by `width`. Returns each line with where it
 * starts in `text`. A single piece wider than `max` throws: the layout has to make room for it.
 */
export function wrap(text, max, width, sep = " ") {
  const pieces = text.split(sep);
  const lines = [];
  let start = 0;
  let line = null;
  let lineStart = 0;
  for (const piece of pieces) {
    const next = line === null ? piece : `${line}${sep}${piece}`;
    if (line !== null && width(next) > max) {
      lines.push({ text: line, start: lineStart });
      line = piece;
      lineStart = start;
    } else {
      if (line === null) lineStart = start;
      line = next;
    }
    if (width(piece) > max) throw new Error(`"${piece}" is wider than ${max} cells`);
    start += piece.length + sep.length;
  }
  if (line !== null) lines.push({ text: line, start: lineStart });
  return lines;
}

const LABEL_GAP = 2;

/** The card, `w` cells wide: the greeting large, the tagline, then the role and the stack as tracked HUD labels. */
export function card(c, p, w) {
  const PAD_X = w < 200 ? 9 : 12;
  const PAD_Y = 8;
  const BIG = 2;
  const inner = w - PAD_X * 2;
  const label = (s) => wrap(s, inner, (t) => textWidth(t, LABEL_GAP), " · ").map((l) => textRows(l.text, LABEL_GAP));
  // the name never breaks across lines: its spaces are held as no-break spaces while wrapping
  const NBSP = "\u00a0";
  const held = p.hello.replace(p.name, p.name.replaceAll(" ", NBSP));
  const unhold = (t) => t.replaceAll(NBSP, " ");
  const greeting = wrap(held, Math.floor(inner / BIG), (t) => proseWidth(unhold(t))).map((l) => ({ ...l, text: unhold(l.text) }));
  const blocks = [
    { lines: greeting.map((l) => scaleRows(proseRows(l.text), BIG)), ink: c.text, lead: 2, after: 4 },
    { lines: wrap(p.tagline, inner, proseWidth).map((l) => proseRows(l.text)), ink: c.textMuted, lead: 0, after: 8 },
    { lines: label(p.role), ink: c.textMuted, lead: 3, after: 5 },
    { lines: label(p.stack), ink: c.textMuted, lead: 3, after: 0 },
  ];
  // the greeting's mark rows hold nothing (no accented capitals): start the card at its cap line
  const trimTop = MARK_ROWS * BIG;
  const blockH = (b) => b.lines.reduce((n, rows) => n + rows.length, 0) + b.lead * (b.lines.length - 1);
  const h = PAD_Y * 2 - trimTop + blocks.reduce((n, b) => n + blockH(b) + b.after, 0);
  const g = makeGrid(w, h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) g[y][x] = c.raised;
  dashedFrame(g, w, h, c.strong);
  let y = PAD_Y - trimTop;
  const tops = [];
  for (const b of blocks) {
    for (const rows of b.lines) {
      tops.push(y);
      stamp(g, rows, { "#": b.ink }, PAD_X, y);
      y += rows.length + b.lead;
    }
    y += b.after - b.lead;
  }
  // the name underlined, a cell under the baseline, as on the hello page: on every greeting line it runs through
  const at = p.hello.indexOf(p.name);
  if (at >= 0)
    greeting.forEach((line, i) => {
      const from = Math.max(at, line.start) - line.start;
      const to = Math.min(at + p.name.length, line.start + line.text.length) - line.start;
      if (to <= from) return;
      const [x0, x1] = proseSpan(line.text, from, to);
      const uy = tops[i] + (MARK_ROWS + CAP) * BIG + 1;
      for (let x = x0 * BIG; x < x1 * BIG; x++) g[uy][PAD_X + x] = c.textMuted;
    });
  return { grid: g, w, h };
}

/**
 * A pixel button: `lines` of [text, ink role] runs in the 5x7 font, the arrow on the last line. The frame's four edges
 * stop short of the corners; a fifth edge a step lower is the ledge. At least `minW` cells wide, the arrow at the end.
 * `compact` trims the padding for narrow screens.
 */
export function button(c, lines, minW = 0, compact = false) {
  const PAD_X = compact ? 4 : 6;
  const PAD_TOP = 4;
  const PAD_BOTTOM = 3;
  const ARROW_GAP = compact ? 5 : 9;
  const arrow = proseRows("→");
  const widest = Math.max(...lines.map((parts) => proseWidth(parts.map(([s]) => s).join(""))));
  const iw = widest + ARROW_GAP + arrow[0].length;
  const ih = PAD_TOP + HEIGHT * lines.length + PAD_BOTTOM;
  const w = Math.max(iw + PAD_X * 2 + 2, minW);
  const h = ih + 3;
  const g = makeGrid(w, h);
  for (let y = 1; y <= ih; y++) for (let x = 1; x < w - 1; x++) g[y][x] = c.raised;
  for (let x = 1; x < w - 1; x++) g[0][x] = g[ih + 1][x] = g[ih + 2][x] = c.control;
  for (let y = 1; y <= ih; y++) g[y][0] = g[y][w - 1] = c.control;
  lines.forEach((parts, i) => {
    let x = 1 + PAD_X;
    for (const [s, role] of parts) {
      stamp(g, proseRows(s), { "#": c[role] }, x, 1 + PAD_TOP + i * HEIGHT);
      x += proseWidth(s) + 1;
    }
  });
  stamp(g, arrow, { "#": c.text }, w - 1 - PAD_X - arrow[0].length, 1 + PAD_TOP + (lines.length - 1) * HEIGHT);
  return { grid: g, w, h };
}
