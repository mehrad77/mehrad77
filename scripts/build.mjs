/**
 * Tunes the station: fetches a year of contributions, public repos, releases and blog posts; adds new log entries;
 * paints the header scene, the hello card and its buttons, the stats strip and the garden in night and day; rewrites
 * the README between its markers. Every word on the page is drawn in pixel fonts; data/profile.json holds the copy.
 * Zero dependencies, Node 24.
 *
 *   GITHUB_TOKEN=$(gh auth token) node scripts/build.mjs
 *
 * Log entries are never rewritten once they exist: edit their text in data/log.json by hand and it stays. Entries
 * you add yourself carry "source": "note".
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gardenGrid } from "./lib/garden.mjs";
import { makeGrid, pathsMarkup, stamp, svgDoc } from "./lib/svg.mjs";
import { textRows, textWidth } from "./lib/text.mjs";
import { button, card, dashedFrame, scaleRows } from "./lib/ui.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const USER = "mehrad77";
const FEED = "https://blog.shab.boo/rss.xml";
const VISIBLE = 6;
/** the log table on the README; data/log.json keeps filling either way, so turning it back on loses nothing */
const SHOW_LOG = false;
const TOKEN = process.env.PROFILE_PAT || process.env.GITHUB_TOKEN;

const readJson = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const write = (p, s) => writeFileSync(join(ROOT, p), s);
const palette = readJson("data/palette.json");
const profile = readJson("data/profile.json");
const THEMES = ["night", "day"];
/** px per cell for every picture: a whole number, so each cell is the same size on screen and the pictures stay
 * within GitHub's README column on a desktop (the widest, the scene, is 680px) */
const SCALE = 2;

/* ---- fetch ---- */
async function github() {
  if (!TOKEN) throw new Error("set GITHUB_TOKEN (locally: GITHUB_TOKEN=$(gh auth token))");
  const query = `query($login: String!) {
    user(login: $login) {
      createdAt
      contributionsCollection { contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } } }
      all: repositories(privacy: PUBLIC, ownerAffiliations: OWNER) { totalCount }
      repositories(first: 100, privacy: PUBLIC, ownerAffiliations: OWNER, isFork: false, orderBy: { field: CREATED_AT, direction: DESC }) {
        nodes {
          name url description createdAt stargazerCount isArchived
          releases(first: 5, orderBy: { field: CREATED_AT, direction: DESC }) { nodes { name tagName url publishedAt isDraft } }
        }
      }
    }
  }`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { authorization: `bearer ${TOKEN}`, "content-type": "application/json", "user-agent": USER },
    body: JSON.stringify({ query, variables: { login: USER } }),
  });
  const body = await res.json();
  if (!res.ok || body.errors) throw new Error(`GitHub: ${res.status} ${JSON.stringify(body.errors ?? body)}`);
  return body.data.user;
}

async function posts() {
  try {
    const xml = await (await fetch(FEED)).text();
    const tag = (s, n) => s.match(new RegExp(`<${n}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${n}>`))?.[1]?.trim() ?? "";
    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, item]) => ({
      title: tag(item, "title"),
      url: tag(item, "link"),
      note: tag(item, "description"),
      date: new Date(tag(item, "pubDate")).toISOString().slice(0, 10),
    }));
  } catch (err) {
    console.warn(`blog feed skipped: ${err.message}`);
    return [];
  }
}

const [user, feed] = await Promise.all([github(), posts()]);

/* ---- log ---- */
const log = readJson("data/log.json");
const known = new Set(log.entries.map((e) => e.url));
const add = (e) => {
  if (!e.url || known.has(e.url) || e.date < log.since) return;
  known.add(e.url);
  log.entries.push({ ...e, source: "auto" });
};
const firstSentence = (s) => (s ?? "").split(/(?<=[.!?])\s|\s—\s/)[0].replace(/\.$/, "").trim();
for (const r of user.repositories.nodes) {
  if (r.name === USER || r.isArchived) continue;
  add({ date: r.createdAt.slice(0, 10), kind: "repo", title: r.name, url: r.url, note: firstSentence(r.description) });
  // releases: one line per repo per month, the newest, so a busy week of tags doesn't flood the log
  const months = new Set(log.entries.filter((e) => e.kind === "release" && e.repo === r.name).map((e) => e.date.slice(0, 7)));
  for (const rel of r.releases.nodes) {
    const month = rel.publishedAt?.slice(0, 7);
    if (rel.isDraft || !month || months.has(month)) continue;
    months.add(month);
    add({
      date: rel.publishedAt.slice(0, 10),
      kind: "release",
      repo: r.name,
      title: `${r.name} ${rel.tagName}`,
      url: rel.url,
      note: rel.name && rel.name !== rel.tagName ? rel.name : "",
    });
  }
}
for (const p of feed) add({ ...p, kind: "post", note: firstSentence(p.note) });
log.entries.sort((a, b) => b.date.localeCompare(a.date));
write("data/log.json", `${JSON.stringify(log, null, 2)}\n`);

/* ---- numbers ---- */
const now = new Date();
const today = now.toISOString().slice(0, 10);
const weeks = user.contributionsCollection.contributionCalendar.weeks
  .map((w) => ({ start: w.contributionDays[0].date, total: w.contributionDays.reduce((n, d) => n + d.contributionCount, 0) }))
  .slice(-52);
const contributions = weeks.reduce((n, w) => n + w.total, 0);
const created = new Date(user.createdAt);
const years = Math.floor((now - created) / (365.2425 * 864e5));
const repos = user.all.totalCount;
const stars = user.repositories.nodes.reduce((n, r) => n + r.stargazerCount, 0);
const activeWeeks = weeks.filter((w) => w.total > 0).length;
/** the HUD meter: twelve bars, lit by the share of weeks with any contributions */
const signal = Math.round((activeWeeks / weeks.length) * 12);
const fmt = (n) => n.toLocaleString("en-US");
const monthYear = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

/* ---- paint: the header scene ---- */
const sky = readJson("data/skyline.json");
const cat = readJson("data/sprites/cat.json");
const roller = readJson("data/sprites/roller.json");

/** a figure frame, with a one-cell pencil outline when the theme asks for one */
function figure(frame, legend, outline, w, h) {
  const g = makeGrid(w + 2, h + 2);
  stamp(g, frame, legend, 1, 1);
  if (outline)
    for (let y = 0; y < h + 2; y++)
      for (let x = 0; x < w + 2; x++)
        if (!g[y][x] && [[0, -1], [-1, 0], [1, 0], [0, 1]].some(([dx, dy]) => frame[y - 1 + dy]?.[x - 1 + dx] && frame[y - 1 + dy][x - 1 + dx] !== "."))
          g[y][x] = outline;
  return g;
}

/** The scene through a window `view` = { x0, w, moon: [x, y] } (cells of the full skyline): the whole city on a
 * desktop, its right-hand end (Camlica, Galata, the cat and the bird) on a phone. */
function scene(theme, view) {
  const c = palette[theme];
  const { w, h } = sky;
  const g = makeGrid(w, h);
  // the sky: five bands from the top down to the horizon, a checker dither where two meet
  const band = (y) => Math.min(4, (y / (h * 0.82)) * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const role = sky.legend[sky.rows[y][x]];
      if (role !== "sky") {
        g[y][x] = c[role];
        continue;
      }
      const b = band(y);
      const i = Math.floor(b);
      const up = b - i > 0.7 && (x + y) % 2 === 0 ? 1 : 0;
      g[y][x] = c.sky[Math.min(4, i + up)];
    }
  // stars, night only, in clear sky; three of them twinkle
  const stars = [];
  if (theme === "night") {
    let seed = 88_7;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let k = 0; k < 40; k++) {
      const x = Math.floor(rnd() * w);
      const y = Math.floor(rnd() * h * 0.5);
      if (sky.legend[sky.rows[y][x]] === "sky" && sky.legend[sky.rows[y + 1]?.[x]] === "sky") stars.push([x, y]);
    }
    for (const [x, y] of stars.slice(3)) g[y][x] = c.moonShade;
  }
  // the moon: a crescent lit from the left, its inner edge in shade
  const [mx, my] = view.moon;
  const mr = 7;
  for (let y = my - mr; y <= my + mr; y++)
    for (let x = mx - mr; x <= mx + mr; x++) {
      const inDisc = (x - mx) ** 2 + (y - my) ** 2 <= mr * mr;
      const cut = (px, py) => (px - mx - 4) ** 2 + (py - my + 2) ** 2 <= mr * mr;
      if (!inDisc || cut(x, y)) continue;
      g[y][x] = cut(x + 1, y) || cut(x, y - 1) ? c.moonShade : c.moon;
    }
  // the window, then chip its corners: a stepped frame
  const vw = view.w;
  const win = g.map((row) => row.slice(view.x0, view.x0 + vw));
  for (const [x, y] of [[0, 0], [1, 0], [0, 1], [vw - 1, 0], [vw - 2, 0], [vw - 1, 1], [0, h - 1], [1, h - 1], [0, h - 2], [vw - 1, h - 1], [vw - 2, h - 1], [vw - 1, h - 2]])
    win[y][x] = null;

  const at = (p) => `transform="translate(${p.x - 1 - view.x0} ${p.y - 1})"`;
  const fig = (spr, frame) => figure(spr.frames[frame], spr.legend, c.outline, spr.w, spr.h);
  const twinkle = stars
    .slice(0, 3)
    .filter(([x]) => x >= view.x0 + 2 && x < view.x0 + vw - 2)
    .map(([x, y], k) => `<path class="tw tw${k}" fill="${c.moon}" d="M${x - view.x0} ${y}h1v1h-1z"/>`)
    .join("");
  const body = [
    pathsMarkup(win),
    twinkle,
    `<g ${at(sky.placements.cat)}><g class="cat-rest">${pathsMarkup(fig(cat, "rest"))}</g><g class="cat-blink">${pathsMarkup(fig(cat, "blink"))}</g></g>`,
    `<g ${at(sky.placements.roller)}><g class="bird-rest">${pathsMarkup(fig(roller, "rest"))}</g><g class="bird-bob">${pathsMarkup(fig(roller, "bob"))}</g></g>`,
  ].join("\n");
  const style = [
    ".cat-blink,.bird-bob{opacity:0}",
    "@media (prefers-reduced-motion:no-preference){",
    ".cat-blink{animation:on 7s steps(1,end) infinite}.cat-rest{animation:off 7s steps(1,end) infinite}",
    ".bird-bob{animation:bob 5.3s steps(1,end) infinite}.bird-rest{animation:unbob 5.3s steps(1,end) infinite}",
    ".tw{animation:off 4s steps(1,end) infinite}.tw1{animation-delay:-1.3s;animation-duration:5.1s}.tw2{animation-delay:-2.9s;animation-duration:6.7s}",
    "}",
    "@keyframes on{0%,94%{opacity:0}95%,97%{opacity:1}98%,100%{opacity:0}}",
    "@keyframes off{0%,94%{opacity:1}95%,97%{opacity:0}98%,100%{opacity:1}}",
    "@keyframes bob{0%,38%{opacity:0}40%,48%{opacity:1}50%,78%{opacity:0}80%,83%{opacity:1}85%,100%{opacity:0}}",
    "@keyframes unbob{0%,38%{opacity:1}40%,48%{opacity:0}50%,78%{opacity:1}80%,83%{opacity:0}85%,100%{opacity:1}}",
  ].join("");
  return svgDoc({
    w: vw,
    h,
    scale: SCALE,
    title: "Radio Shab Boo",
    desc: `Istanbul's skyline ${theme === "night" ? "at night under a crescent moon" : "by day, drawn in pencil"}: ${view.x0 ? "" : "the business towers, "}Camlica on its hill, the Bosphorus, and a grey cat on a rooftop beside Galata Tower, where a roller bird is perched.`,
    body,
    style,
  });
}

/* ---- paint: the stats strip ---- */
/** The stats strip, `w` cells wide, its four readings in `cols` columns (4 in a row, or 2 x 2 on a phone). */
function stats(theme, w, cols) {
  const c = palette[theme];
  const rowsOf = Math.ceil(4 / cols);
  const ruleY = 20 + rowsOf * 21 + 1;
  const h = ruleY + 12;
  const g = makeGrid(w, h);
  // ground inside a dashed edge
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) g[y][x] = c.ground;
  dashedFrame(g, w, h, c.control);
  const text = (s, x, y, col, scale = 1) => stamp(g, scaleRows(textRows(s), scale), { "#": col }, x, y);
  const rule = (y) => {
    for (let x = 4; x < w - 4; x++) if (x % 2 === 0) g[y][x] = c.rule;
  };
  // the HUD line: the on-air light, the call sign, the signal meter (weeks on air out of 52)
  for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]]) g[6 + dy][6 + dx] = c.signal;
  const call = "radio shab boo";
  text(call, 12, 5, c.text);
  text("88.7 fm", 12 + textWidth(call) + 6, 5, c.accent);
  const lit = signal;
  for (let k = 0; k < 12; k++) for (let y = 5; y < 10; y++) g[y][w - 7 - (12 - k) * 3 + 1] = k < lit ? c.accent : c.meterOff;
  rule(14);
  // the readings: the value large, its label under it
  const cells = [
    [`${years}`, "years on air"],
    [fmt(contributions), "contributions · 1 yr"],
    [`${repos}`, "public repos"],
    [`${stars}`, "stars"],
  ];
  cells.forEach(([value, label], k) => {
    const x = 8 + (k % cols) * Math.floor((w - 16) / cols);
    const y = 20 + Math.floor(k / cols) * 21;
    text(value, x, y, c.text, 2);
    text(label, x, y + 12, c.textMuted);
  });
  rule(ruleY);
  const tuned = `last tuned ${today}`;
  text(tuned, w - 8 - textWidth(tuned), ruleY + 3, c.textMuted);
  const desc = `Radio Shab Boo, 88.7 FM. On air ${years} years · ${fmt(contributions)} contributions in the last year · ${repos} public repos · ${stars} stars · signal ${lit} of 12 (weeks with contributions) · last tuned ${today}.`;
  return svgDoc({
    w,
    h,
    scale: SCALE,
    title: "Station readings",
    desc,
    body: `${pathsMarkup(g)}\n<path class="dot" fill="${c.ground}" d="M7 6h1v1h-1zM6 7h3v1h-3zM7 8h1v1h-1z"/>`,
    style: ".dot{opacity:0}@media (prefers-reduced-motion:no-preference){.dot{animation:blink 2s steps(1,end) infinite}}@keyframes blink{0%,50%{opacity:0}50.1%,100%{opacity:1}}",
  });
}

/* ---- paint: the hello card, its buttons and the call line ---- */
const ui = (grid, w, h, title, desc) => svgDoc({ w, h, scale: SCALE, title, desc, body: pathsMarkup(grid) });
const cardText = `${profile.hello} ${profile.tagline} ${profile.role}. ${profile.stack}.`;
const linkLabel = (l) => l.label.toUpperCase();
/** GitHub sets the link buttons side by side with a space between; about two cells at SCALE */
const SPACE_CELLS = 2;
// one column, as wide as the scene: the card, the call button, the stats and the garden take its width, and the link
// buttons share it equally (with the spaces between them), as the hello page's buttons do
const COLUMN = sky.w;
const BUTTON_W = Math.floor((COLUMN - SPACE_CELLS * (profile.links.length - 1)) / profile.links.length);
/** the phone layout: pictures half as wide (they shrink a little more on the smallest phones), the link buttons two to
 * a row, the readings 2 x 2, a plant per fortnight */
const NARROW = 170;
const NARROW_BUTTON_W = 68;
/** GitHub's own phone breakpoint: below it the README spans the window */
const NARROW_MEDIA = "(max-width: 767px)";

/* ---- paint: the garden ---- */
const range = `${monthYear(weeks[0].start)} - ${monthYear(weeks.at(-1).start)}`.toUpperCase();
const fortnights = Array.from({ length: Math.ceil(weeks.length / 2) }, (_, i) => ({
  total: weeks.slice(i * 2, i * 2 + 2).reduce((n, w) => n + w.total, 0),
}));
function garden(theme, width, plots) {
  const { grid, w, h } = gardenGrid(plots, palette[theme], `a year of contributions · ${fmt(contributions)}`, range, width);
  return svgDoc({
    w,
    h,
    scale: SCALE,
    title: "A year of contributions",
    desc: `${fmt(contributions)} contributions from ${range.toLowerCase()}, one matthiola per ${plots.length === weeks.length ? "week" : "fortnight"}, taller for busier ones; ${weeks.length - activeWeeks} weeks were quiet.`,
    body: pathsMarkup(grid),
  });
}

const LAYOUTS = [
  { suffix: "", width: COLUMN, buttonW: BUTTON_W, compact: false, view: { x0: 0, w: sky.w, moon: [132, 20] }, cols: 4, plots: weeks },
  {
    suffix: "-narrow",
    width: NARROW,
    buttonW: NARROW_BUTTON_W,
    compact: true,
    view: { x0: sky.w - NARROW, w: NARROW, moon: [sky.w - NARROW + 46, 18] },
    cols: 2,
    plots: fortnights,
  },
];
for (const theme of THEMES) {
  const c = palette[theme];
  for (const L of LAYOUTS) {
    const out = (name) => `assets/${name}${L.suffix}-${theme}.svg`;
    write(out("scene"), scene(theme, L.view));
    const hello = card(c, profile, L.width);
    write(out("card"), ui(hello.grid, hello.w, hello.h, `hi, I'm ${profile.name}`, cardText));
    for (const l of profile.links) {
      const b = button(c, [[[linkLabel(l), "text"]]], L.buttonW, L.compact);
      if (b.w > L.buttonW) throw new Error(`the ${l.label} button needs ${b.w} cells; the row gives each ${L.buttonW}`);
      write(out(`link-${l.id}`), ui(b.grid, b.w, b.h, l.label, `${l.label}: ${l.url}`));
    }
    // the call line: one line on a desktop; on a phone the address goes under its label
    const call = L.compact
      ? [[[profile.call, "textMuted"]], [[profile.email, "text"]]]
      : [[[`${profile.call} `, "textMuted"], [profile.email, "text"]]];
    const callButton = button(c, call, L.width, L.compact);
    write(out("call"), ui(callButton.grid, callButton.w, callButton.h, profile.call.replace(/:$/, ""), `${profile.call} ${profile.email}`));
    write(out("stats"), stats(theme, L.width, L.cols));
    write(out("garden"), garden(theme, L.width, L.plots));
  }
}

/* ---- README ---- */
const attr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** One line, so it can sit inside a link or beside other pictures in a paragraph. The browser takes the first source
 * that matches: a phone at night, a phone by day, a desktop at night; else the desktop day picture. */
const picture = (name, alt) =>
  [
    "<picture>",
    `<source media="${NARROW_MEDIA} and (prefers-color-scheme: dark)" srcset="assets/${name}-narrow-night.svg">`,
    `<source media="${NARROW_MEDIA}" srcset="assets/${name}-narrow-day.svg">`,
    `<source media="(prefers-color-scheme: dark)" srcset="assets/${name}-night.svg">`,
    `<img alt="${attr(alt)}" src="assets/${name}-day.svg">`,
    "</picture>",
  ].join("");
const linked = (url, name, alt) => `<a href="${attr(url)}">${picture(name, alt)}</a>`;
const helloMd = [
  picture("card", cardText),
  "",
  profile.links.map((l) => linked(l.url, `link-${l.id}`, l.label)).join("\n"),
  "",
  linked(`mailto:${profile.email}`, "call", `${profile.call} ${profile.email}`),
].join("\n");
const row = (e) => `| ${e.date} | ${e.kind} | [${e.title}](${e.url})${e.note ? ` — ${e.note}` : ""} |`;
const table = (rows) => ["| date | type | entry |", "| --- | --- | --- |", ...rows.map(row)].join("\n");
const [recent, earlier] = [log.entries.slice(0, VISIBLE), log.entries.slice(VISIBLE)];
const logMd = [
  table(recent),
  earlier.length ? `\n\n<details>\n<summary>earlier transmissions</summary>\n\n${table(earlier)}\n\n</details>` : "",
].join("");

const blocks = {
  scene: picture("scene", "Istanbul's skyline: a grey cat on a rooftop and a roller bird perched on Galata Tower"),
  hello: helloMd,
  stats: picture("stats", `Radio Shab Boo, 88.7 FM: on air ${years} years, ${fmt(contributions)} contributions in the last year, ${repos} public repos, ${stars} stars; signal ${signal} of 12 (weeks with contributions); last tuned ${today}`),
  log: SHOW_LOG ? logMd : "",
  garden: picture("garden", `A year of contributions, ${range.toLowerCase()}: ${fmt(contributions)} in all, one matthiola per week, taller for busier weeks; ${weeks.length - activeWeeks} quiet weeks are bare soil`),
};
let readme = readFileSync(join(ROOT, "README.md"), "utf8");
for (const [name, content] of Object.entries(blocks)) {
  const re = new RegExp(`(<!-- ${name}:start -->)[\\s\\S]*?(<!-- ${name}:end -->)`);
  if (!re.test(readme)) throw new Error(`README is missing the ${name} markers`);
  readme = readme.replace(re, (_, a, b) => `${a}\n${content}\n${b}`);
}
write("README.md", readme);
console.log(`tuned ${today}: ${log.entries.length} log entries, ${fmt(contributions)} contributions, ${repos} repos, ${stars} stars`);
