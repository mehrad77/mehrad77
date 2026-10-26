/**
 * Cell grids to SVG: one <path> per colour, each horizontal run of a colour one rectangle, drawn in cell units with
 * crisp edges. A grid is an array of rows; each row an array of hex colours or null (transparent).
 */

export const makeGrid = (w, h, fill = null) => Array.from({ length: h }, () => Array(w).fill(fill));

/** Paint letter rows onto a grid at (x, y); `legend` maps a letter to a hex colour, "." is skipped. */
export function stamp(grid, rows, legend, x = 0, y = 0) {
  rows.forEach((row, j) => {
    [...row].forEach((ch, i) => {
      const c = legend[ch];
      const gy = y + j;
      const gx = x + i;
      if (ch === "." || !c || gy < 0 || gy >= grid.length || gx < 0 || gx >= grid[0].length) return;
      grid[gy][gx] = c;
    });
  });
}

/** colour -> path data: runs along each row, and a run repeated on the rows below grows into one rectangle */
export function gridPaths(grid) {
  const runs = grid.map((row) => {
    const out = [];
    let x = 0;
    while (x < row.length) {
      let end = x + 1;
      while (end < row.length && row[end] === row[x]) end++;
      if (row[x]) out.push({ x, len: end - x, c: row[x] });
      x = end;
    }
    return out;
  });
  const paths = new Map();
  runs.forEach((row, y) => {
    for (const run of row) {
      if (run.used) continue;
      let h = 1;
      for (let below = runs[y + h]; below; below = runs[y + h]) {
        const same = below.find((r) => !r.used && r.x === run.x && r.len === run.len && r.c === run.c);
        if (!same) break;
        same.used = true;
        h++;
      }
      paths.set(run.c, `${paths.get(run.c) ?? ""}M${run.x} ${y}h${run.len}v${h}h-${run.len}z`);
    }
  });
  return paths;
}

export const pathsMarkup = (grid, attrs = "") =>
  [...gridPaths(grid)].map(([c, d]) => `<path fill="${c}"${attrs} d="${d}"/>`).join("");

const round = (n) => Math.round(n * 100) / 100;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A standalone SVG document in cell units, `scale` px per cell for its intrinsic size. */
export function svgDoc({ w, h, scale, title, desc, body, style = "" }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${round(w * scale)}" height="${round(h * scale)}" shape-rendering="crispEdges" role="img" aria-labelledby="t d">
<title id="t">${esc(title)}</title>
<desc id="d">${esc(desc)}</desc>
${style ? `<style>${style}</style>\n` : ""}${body}
</svg>
`;
}
