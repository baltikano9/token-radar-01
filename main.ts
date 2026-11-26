// token-radar-01 — entry point. Node 22, standard library only.
// Usage: MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { boardIssue, buildBoard, buildRadar, dataScript, parseSnapshot, BOARD_SIZE } from "./lib/model.ts";
import { buildDossier } from "./vendor/makefun-board.ts";

const ROOT = dirname(fileURLToPath(import.meta.url));

function arg(name: string): string | undefined {
  const argv = process.argv.slice(2);
  const i = argv.indexOf(name);
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith(name + "="));
  return eq ? eq.slice(name.length + 1) : undefined;
}

function fail(msg: string): never {
  console.error(`token-radar-01: ${msg}`);
  process.exit(1);
}

const inputPath = resolve(arg("--input") ?? "/input/snapshot.json");
const outDir = resolve(arg("--output") ?? process.env.MAKEFUN_OUTPUT_DIR ?? "/output");

if (!existsSync(inputPath)) fail(`snapshot not found at ${inputPath}`);
let raw: unknown;
try {
  raw = JSON.parse(readFileSync(inputPath, "utf8"));
} catch (e) {
  fail(`could not parse ${inputPath}: ${(e as Error).message}`);
}

// 1. Model
const snap = parseSnapshot(raw);
if (snap.protocols.length === 0) fail("snapshot holds no protocols");
const board = buildBoard(snap, BOARD_SIZE);

// 2. Gate: refuse to write a board of the wrong shape.
const issue = boardIssue(board, snap.watchlist);
if (issue) fail(`board failed the gate: ${issue}`);

mkdirSync(outDir, { recursive: true });
const radar = buildRadar(board, snap);
writeFileSync(join(outDir, "board.json"), JSON.stringify({ rows: board }) + "\n");

// 3. Dashboard + screenshots, then the page's data beside index.html.
const dashSrc = join(ROOT, "dashboard");
const dashOut = join(outDir, "dashboard");
if (!existsSync(dashSrc)) fail("dashboard/ is missing");
cpSync(dashSrc, dashOut, { recursive: true });
writeFileSync(join(dashOut, "data.js"), dataScript(radar));
const shotsSrc = join(ROOT, "screenshots");
if (existsSync(shotsSrc)) cpSync(shotsSrc, join(outDir, "screenshots"), { recursive: true });

// 4. Screenshot deep links: detail = highest-ranked watchlist protocol,
//    filter = most common category among the top 40 pre-token rows.
const topWatch = board.filter((r) => r.watchlist).slice(0, 5);
const catCount = new Map<string, number>();
for (const r of board.filter((x) => x.tier === "pre-token").slice(0, 40))
  catCount.set(r.category, (catCount.get(r.category) ?? 0) + 1);
const topCat = [...catCount.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? board[0].category;
const shots = [
  { name: "1-board.png", query: "dashboard/?view=board" },
  { name: "2-detail.png", query: `dashboard/?view=detail&slug=${encodeURIComponent(topWatch[0]?.slug ?? board[0].slug)}` },
  { name: "3-filtered.png", query: `dashboard/?view=filtered&filter=${encodeURIComponent(topCat)}` },
];
writeFileSync(join(outDir, "shots.json"), JSON.stringify(shots, null, 2) + "\n");
// Keep the repo's shots.json in step with the data when it is writable (not at grade time).
try {
  const repoShots = join(ROOT, "shots.json");
  const current = existsSync(repoShots) ? readFileSync(repoShots, "utf8") : "";
  const next = JSON.stringify(shots, null, 2) + "\n";
  if (current !== next) {
    writeFileSync(repoShots, next);
    console.log("shots.json updated with deep links taken from this board");
  }
} catch {
  /* read-only checkout: the copy in the output directory is authoritative */
}

// 5. Dossier, written last with the vendored make.fun library: the scorer
//    rebuilds it from this output directory and compares bytes.
writeFileSync(
  join(outDir, "dossier.json"),
  buildDossier(outDir, {
    text_max_bytes: 65_536,
    screenshots: { max: 4, max_bytes: 524_288 },
    dashboard: { max_files: 400, max_bytes: 4_194_304 },
  }),
);

// 6. Report
const fmt = (n: number) => "$" + n.toLocaleString("en-US");
console.log(`token-radar-01 · snapshot ${snap.date} · ${snap.protocols.length} protocols · watchlist ${snap.watchlist.length}`);
console.log(`board: ${board.length} rows (${radar.stats.pre_token} pre-token, ${radar.stats.traded} trading), watchlist covered ${radar.stats.watchlist_on_board}/${snap.watchlist.length}`);
for (const r of board.slice(0, 5)) console.log(`  #${r.rank} ${r.name} (${r.slug}) ${fmt(r.implied_value_usd)}`);
console.log(`wrote ${join(outDir, "board.json")}, dashboard/, dossier.json`);
