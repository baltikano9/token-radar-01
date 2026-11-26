// token-radar-01 value model.
// Every number on the board is derived from the snapshot's own figures:
// TVL, 7-day TVL change, time listed with no token recorded, category, chains,
// and (for calibration only) the market caps of protocols whose token already trades.
// No protocol name appears anywhere in this file.

export type Protocol = {
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvl: number;
  change7d: number | null;
  listedAtMs: number | null;
  geckoId: string | null;
  symbol: string | null;
  mcap: number | null;
  preToken: boolean;
};

export type Snapshot = {
  date: string; // ISO date, e.g. 2026-11-14
  dateMs: number;
  source: string;
  protocols: Protocol[];
  watchlist: string[];
};

export type Valuation = {
  tier: "pre-token" | "trades";
  fdvUsd: number; // modelled fully diluted value if a token launched today
  value: number; // implied value used for ranking (whole dollars)
  multiple: number; // FDV / TVL multiple used
  multipleSource: string;
  priorMultiple: number;
  peerMedian: number | null;
  peers: number;
  momentum: number;
  ageFactor: number;
  chainFactor: number;
  monthsNoToken: number | null;
  airdropPoolUsd: number;
  per1kUsd: number; // pro-rata airdrop value per $1,000 of current TVL share
  tierScale: number; // 1 for pre-token; < 1 when a traded row is scaled under the pre-token floor
};

export type BoardRow = {
  rank: number;
  slug: string;
  name: string;
  implied_value_usd: number;
  tier: "pre-token" | "trades";
  watchlist: boolean;
  category: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  months_no_token: number | null;
  symbol: string | null;
  gecko_id: string | null;
  mcap_usd: number | null;
  derivation: {
    fdv_usd: number;
    multiple: number;
    multiple_source: string;
    prior_multiple: number;
    peer_median: number | null;
    peers: number;
    momentum: number;
    age_factor: number;
    chain_factor: number;
    tier_scale: number;
    airdrop_pool_usd: number;
    per_1k_usd: number;
    formula: string;
  };
  farm_steps: string[];
};

export const BOARD_SIZE = 200;
export const TRADED_RESERVE = 30; // traded rows kept on the board as the comparison tier
export const AIRDROP_SHARE = 0.07; // share of FDV assumed to go to farmers
export const TRADED_RESIDUAL = 0.08; // residual incentive value left for a token that already trades
const DAY = 86_400_000;
const MONTH = 30.44 * DAY;
const DEFAULT_DATE = "2026-11-14";

// ---------- parsing ----------

function num(v: unknown): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function pick(o: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
}

function tokenField(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (t === "" || t === "-" || t.toLowerCase() === "null" || t.toLowerCase() === "none") return null;
  return t;
}

function toMs(v: unknown): number | null {
  const n = num(v);
  if (n !== null) return n > 1e12 ? n : n * 1000;
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

function parseProtocol(o: Record<string, unknown>): Protocol | null {
  const slug = String(pick(o, ["slug", "name", "id"]) ?? "").trim();
  if (!slug) return null;
  const name = String(pick(o, ["name", "slug"]) ?? slug).trim();
  const chainsRaw = pick(o, ["chains", "chain"]);
  const chains = Array.isArray(chainsRaw)
    ? chainsRaw.map((c) => String(c)).filter((c) => c.trim() !== "")
    : typeof chainsRaw === "string" && chainsRaw.trim() !== ""
      ? [chainsRaw]
      : [];
  const geckoId = tokenField(pick(o, ["gecko_id", "geckoId", "gecko"]));
  const symbol = tokenField(pick(o, ["symbol", "token_symbol", "token"]));
  return {
    slug,
    name,
    category: String(pick(o, ["category"]) ?? "Other").trim() || "Other",
    chains,
    tvl: Math.max(0, num(pick(o, ["tvl", "tvl_usd", "tvlUsd"])) ?? 0),
    change7d: num(pick(o, ["change_7d", "change7d", "change_7d_pct"])),
    listedAtMs: toMs(pick(o, ["listed_at", "listedAt", "listed"])),
    geckoId,
    symbol,
    mcap: num(pick(o, ["mcap", "market_cap", "mcap_usd"])),
    preToken: geckoId === null && symbol === null,
  };
}

export function parseSnapshot(raw: unknown): Snapshot {
  const root = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const found = Array.isArray(raw) ? raw : pick(root, ["protocols", "data", "items"]);
  // Accept an array of protocols or an object keyed by slug.
  const list: unknown[] = Array.isArray(found)
    ? found
    : found && typeof found === "object"
      ? Object.entries(found as Record<string, unknown>).map(([k, v]) =>
          v && typeof v === "object" ? { slug: k, ...(v as Record<string, unknown>) } : v)
      : [];
  const protocols: Protocol[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const p = parseProtocol(item as Record<string, unknown>);
    if (p && !seen.has(p.slug)) {
      seen.add(p.slug);
      protocols.push(p);
    }
  }
  const wlRaw = pick(root, ["watchlist", "watch_list", "watch"]);
  const watchlist: string[] = [];
  for (const w of Array.isArray(wlRaw) ? wlRaw : []) {
    if (typeof w === "string") {
      watchlist.push(w);
    } else if (w && typeof w === "object") {
      const p = parseProtocol(w as Record<string, unknown>);
      if (!p) continue;
      watchlist.push(p.slug);
      if (!seen.has(p.slug)) {
        seen.add(p.slug);
        protocols.push(p);
      }
    }
  }
  const dateRaw = pick(root, ["fetched_at", "snapshot_date", "date", "generated_at", "as_of"]);
  const dateMs = toMs(dateRaw) ?? Date.parse(DEFAULT_DATE + "T00:00:00Z");
  return {
    date: new Date(dateMs).toISOString().slice(0, 10),
    dateMs,
    source: String(pick(root, ["source"]) ?? "DefiLlama"),
    protocols,
    watchlist: [...new Set(watchlist)],
  };
}

// ---------- value model ----------

// FDV/TVL priors by category: how much token value a dollar of deposits has
// historically supported. Fee-dense categories (perps, DEXs) carry more value per
// TVL dollar than pass-through custody (staking, CEX). Recalibrated below with the
// snapshot's own traded peers whenever they carry a market cap.
const PRIORS: Record<string, number> = {
  derivatives: 1.8, "options": 1.4, dexs: 1.1, "dex aggregator": 1.5, bridge: 0.9,
  "cross chain": 0.9, "cross chain bridge": 0.9, chain: 1.6, launchpad: 1.4,
  "prediction market": 1.6, lending: 0.55, cdp: 0.45, "yield aggregator": 0.5,
  yield: 0.55, "basis trading": 0.5, rwa: 0.35, "rwa lending": 0.4,
  "liquid staking": 0.22, restaking: 0.4, "liquid restaking": 0.3, "staking pool": 0.25,
  cex: 0.12, services: 0.9, "onchain capital allocator": 0.6, payments: 0.9,
};
const DEFAULT_PRIOR = 0.6;

export type ModelContext = {
  dateMs: number;
  peerMedian: Map<string, { median: number; n: number }>;
};

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function modelContext(snap: Snapshot): ModelContext {
  const groups = new Map<string, number[]>();
  for (const p of snap.protocols) {
    if (p.preToken || !p.mcap || p.mcap <= 0 || p.tvl < 1_000_000) continue;
    const r = p.mcap / p.tvl;
    if (r < 0.01 || r > 50) continue; // drop broken outliers
    const k = p.category.toLowerCase();
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const peerMedian = new Map<string, { median: number; n: number }>();
  for (const [k, rs] of groups) if (rs.length >= 3) peerMedian.set(k, { median: median(rs), n: rs.length });
  return { dateMs: snap.dateMs, peerMedian };
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const r3 = (x: number) => Math.round(x * 1000) / 1000;

export function impliedValue(p: Protocol, ctx: ModelContext): Valuation {
  const key = p.category.toLowerCase();
  const prior = PRIORS[key] ?? DEFAULT_PRIOR;
  const peer = ctx.peerMedian.get(key) ?? null;
  // Blend prior and peer median in log space; weight grows with peer count.
  const w = peer ? peer.n / (peer.n + 5) : 0;
  const multiple = clamp(Math.exp((1 - w) * Math.log(prior) + w * Math.log(peer ? peer.median : prior)), 0.05, 5);
  const multipleSource = peer
    ? `category prior ${prior}× blended with median mcap/TVL ${r3(peer.median)}× of ${peer.n} traded ${p.category} peers in the snapshot`
    : `category prior ${prior}× (fewer than 3 traded ${p.category} peers with a market cap in the snapshot)`;

  // Momentum: 7-day TVL change, clipped to [-40%, +60%], mapped through exp.
  const g = clamp(p.change7d ?? 0, -40, 60);
  const momentum = Math.exp((g / 100) * 0.9);

  // Launch pressure: protocols listed a while with no token recorded face rising
  // pressure to launch one; very old ones that never did are less likely to.
  const months = p.listedAtMs !== null ? Math.max(0, (ctx.dateMs - p.listedAtMs) / MONTH) : null;
  let ageFactor = 0.85;
  if (months !== null) {
    const ramp = 1 - Math.exp(-months / 9);
    const decay = months > 30 ? Math.exp(-(months - 30) / 48) : 1;
    ageFactor = 0.5 + 0.7 * ramp * decay;
  }

  // Chain breadth: each extra chain widens the user base a drop must reach.
  const chainFactor = 1 + 0.05 * Math.min(Math.max(p.chains.length - 1, 0), 10);

  const fdv = p.tvl * multiple * momentum * ageFactor * chainFactor;
  const tier = p.preToken ? "pre-token" : "trades";
  const pool = p.preToken ? fdv * AIRDROP_SHARE : fdv * TRADED_RESIDUAL;
  const value = Math.max(1, Math.round(p.preToken ? fdv : fdv * TRADED_RESIDUAL));
  return {
    tier,
    fdvUsd: Math.round(fdv),
    value,
    multiple: r3(multiple),
    multipleSource,
    priorMultiple: prior,
    peerMedian: peer ? r3(peer.median) : null,
    peers: peer ? peer.n : 0,
    momentum: r3(momentum),
    ageFactor: r3(ageFactor),
    chainFactor: r3(chainFactor),
    monthsNoToken: months === null ? null : Math.round(months * 10) / 10,
    airdropPoolUsd: Math.round(pool),
    per1kUsd: p.tvl > 0 ? Math.round((pool / p.tvl) * 1000 * 100) / 100 : 0,
    tierScale: 1,
  };
}

// ---------- farm plans ----------

type ChainCost = { gas: number; label: string; fund: string };

function chainCost(chain: string): ChainCost {
  const c = chain.toLowerCase();
  if (c === "ethereum") return { gas: 6, label: "Ethereum mainnet", fund: "withdraw ETH and USDC from an exchange straight to Ethereum (withdrawal fee about $3-8, 10-20 minutes)" };
  if (c === "bitcoin") return { gas: 3, label: "Bitcoin", fund: "withdraw BTC from an exchange to a self-custody wallet (network fee about $2-5, 30-60 minutes for confirmations)" };
  if (c === "solana") return { gas: 0.01, label: "Solana", fund: "withdraw SOL and USDC from an exchange to a Solana wallet (fee under $1, about 2 minutes)" };
  const cheap: Record<string, number> = { arbitrum: 0.15, base: 0.05, optimism: 0.1, polygon: 0.03, linea: 0.1, scroll: 0.1, blast: 0.08, mantle: 0.05, zksync: 0.15, "zksync era": 0.15, sonic: 0.03, berachain: 0.05, unichain: 0.05, ink: 0.05, sui: 0.02, aptos: 0.01, sei: 0.02, "hyperliquid l1": 0.01, hyperliquid: 0.01, bsc: 0.12, binance: 0.12, avalanche: 0.2, ton: 0.05, tron: 1.0, starknet: 0.1, near: 0.02, cardano: 0.2, plasma: 0.02 };
  const gas = cheap[c] ?? 0.3;
  return { gas, label: chain, fund: `fund a ${chain} wallet directly from an exchange if it supports ${chain} withdrawals, otherwise bridge USDC from Ethereum or Arbitrum (bridge fee about $2-6, 5-20 minutes)` };
}

const usd = (x: number) =>
  x >= 1e9 ? `$${(x / 1e9).toFixed(2)}B` : x >= 1e6 ? `$${(x / 1e6).toFixed(1)}M` : x >= 1e4 ? `$${Math.round(x / 1e3)}k` : `$${x.toFixed(x < 10 ? 2 : 0)}`;

function pct(share: number): string {
  const x = share * 100;
  if (x >= 1) return `${x.toFixed(1)}%`;
  if (x >= 0.01) return `${x.toFixed(3)}%`;
  return `${x.toPrecision(2)}%`;
}

function coreAction(p: Protocol, stake: number, c: ChainCost): string[] {
  const k = p.category.toLowerCase();
  const tx = (n: number) => usd(n * c.gas);
  if (/lending|cdp/.test(k))
    return [
      `Supply ${usd(stake)} of the deepest collateral market on ${p.name} (${c.label}) — usually USDC or ETH; 2 transactions (approve + supply), about ${tx(2)} in gas and 5 minutes.`,
      `Borrow a stablecoin against it at 30-35% loan-to-value and keep the health factor above 1.8; borrowing activity is weighted heavily in lending points programs. Cost: 1-2 transactions (${tx(2)}), plus net borrow interest of roughly ${usd(stake * 0.33 * 0.02 / 4)} per quarter at a 2% supply/borrow spread.`,
    ];
  if (/dex/.test(k))
    return [
      `Provide ${usd(stake)} of liquidity to the pool with the most volume on ${p.name} (${c.label}); prefer a stable or blue-chip pair, and if pools are concentrated set a ±5% range. 3 transactions (two approvals + deposit), about ${tx(3)} and 10 minutes.`,
      `Route real swaps through ${p.name} each week — e.g. $300 of rebalancing trades — since DEX drops usually weight volume alongside liquidity. Cost: about 0.05-0.3% fee per swap (${usd(300 * 0.002)}) plus ${tx(1)} gas, 3 minutes a week.`,
    ];
  if (/derivative|option|perp|prediction/.test(k))
    return [
      `Deposit ${usd(stake)} of USDC margin into ${p.name} on ${c.label}; 1-2 transactions, about ${tx(2)} and 5 minutes.`,
      `Trade at 1-2× leverage in both directions (or hedge a spot holding) for about $10k notional a week; at a typical 0.05% taker fee that costs ${usd(5)} a week, ${usd(65)} over 13 weeks. If ${p.name} runs a liquidity vault, park idle margin there for the vault's points stream.`,
    ];
  if (/restaking/.test(k))
    return [
      `Restake ${usd(stake)} of ETH or the accepted liquid staking token on ${p.name} (${c.label}); 2 transactions (approve + deposit), about ${tx(2)} and 5 minutes. Note the withdrawal queue — typically 7+ days — before you commit.`,
      `Delegate to an operator listed on ${p.name} and, if a liquid receipt token is issued, post it as collateral or LP on a second protocol to stack points. Extra cost: 2-3 transactions (${tx(3)}), 10 minutes.`,
    ];
  if (/staking/.test(k))
    return [
      `Stake ${usd(stake)} of the chain's native asset through ${p.name} on ${c.label} and hold the receipt token; 1-2 transactions, about ${tx(2)} and 5 minutes. Unstaking can take days, so budget the exit time.`,
      `Put the receipt token to work in a lending market or LP pool that accepts it, which often earns referral or integration points too; 2-3 transactions (${tx(3)}), 10 minutes.`,
    ];
  if (/bridge|cross chain/.test(k))
    return [
      `Bridge ${usd(Math.min(stake, 1000))} through ${p.name} from ${c.label} to a second chain and back once a week; at about 0.05% plus gas that is ${usd(Math.min(stake, 1000) * 0.001 + 2 * c.gas)} per round trip and 15-30 minutes.`,
      `Vary destination chains and keep a 4-12 week streak — bridge drops have repeatedly weighted distinct months active and distinct chains over raw volume. Total over 13 weeks: about ${usd(13 * (Math.min(stake, 1000) * 0.001 + 2 * c.gas))}.`,
    ];
  if (/cex/.test(k))
    return [
      `Open and verify an account on ${p.name} (identity check, 1-3 days), then deposit ${usd(stake)}; the deposit costs only the sending network fee (${usd(c.gas)} on ${c.label}).`,
      `Hold the balance in the exchange's earn product and place at least one trade a month (about 0.1% fee, ${usd(stake * 0.001)} per full turn, 5 minutes); ${p.preToken ? `${p.name} records no token, so this is an option on a future exchange token` : "rewards here come from the exchange's existing programs"} — keep the position small relative to custody risk.`,
    ];
  if (/rwa|basis|yield|vault|allocator/.test(k))
    return [
      `Deposit ${usd(stake)} into the largest vault on ${p.name} (${c.label}); 2 transactions (approve + deposit), about ${tx(2)} and 5 minutes. Check redemption terms first — some vaults settle withdrawals in 1-7 days.`,
      `Hold the vault share for at least 90 days; yield products usually score time-weighted balance, so a steady deposit beats in-and-out. If the share token is accepted as collateral elsewhere, loop once at low LTV (${tx(3)}, 10 minutes).`,
    ];
  return [
    `Use the core product of ${p.name} (${p.category}) on ${c.label} with ${usd(stake)} of working capital; budget 2-3 transactions (${tx(3)}) and 15 minutes for the first session.`,
    `Repeat a meaningful action weekly for 13 weeks — programs at protocols that record no token usually reward weeks active more than one-off size. About ${tx(13)} in gas and 5 minutes a week.`,
  ];
}

export function farmSteps(p: Protocol, v: Valuation): string[] {
  const chain = p.chains[0] ?? "Ethereum";
  const c = chainCost(chain);
  const stake = p.tvl >= 250_000_000 ? 5000 : p.tvl >= 25_000_000 ? 2500 : 1000;
  const share = p.tvl > 0 ? stake / p.tvl : 0;
  const steps: string[] = [];

  if (v.tier === "trades") {
    steps.push(`${p.name} already trades (${p.symbol ?? p.geckoId ?? "token listed"}), so there is no first airdrop to farm; implied value here is the residual incentive stream (${Math.round(TRADED_RESIDUAL * 100)}% of modelled FDV), scaled under the pre-token tier.`);
  } else {
    const listed = v.monthsNoToken === null ? "with no listing date in the snapshot" : `after ${v.monthsNoToken} months listed`;
    steps.push(`${p.name} records no token ${listed} (${p.category}, ${usd(p.tvl)} TVL). Before depositing, read its docs and official account for a points or season page (10 minutes, free) and note whether it scores deposits, volume, weeks active or referrals — weight the steps below accordingly.`);
  }
  steps.push(`Set up: ${c.fund}. Keep about ${usd(Math.max(1, c.gas * 20))} of gas on ${c.label} to cover roughly 20 transactions over the campaign.`);
  steps.push(...coreAction(p, stake, c));
  if (p.chains.length > 1) {
    const second = p.chains.find((x) => chainCost(x).gas < c.gas) ?? p.chains[1];
    const c2 = chainCost(second);
    steps.push(`${p.name} also runs on ${p.chains.length - 1} other chain${p.chains.length > 2 ? "s" : ""}; repeat a smaller ${usd(Math.round(stake / 5))} position on ${c2.label} (gas about ${usd(c2.gas * 3)} for 3 transactions, 15 minutes) so the wallet shows multi-chain use.`);
  }
  const oppCost = stake * 0.04 * (90 / 365);
  if (v.tier === "pre-token") {
    steps.push(`Size it: modelled airdrop pool ≈ ${usd(v.airdropPoolUsd)} (${Math.round(AIRDROP_SHARE * 100)}% of the ${usd(v.fdvUsd)} implied value). A ${usd(stake)} position is ${pct(share)} of current TVL, a pro-rata ${usd(v.airdropPoolUsd * share)} if held through launch, against ${usd(oppCost)} of 90-day opportunity cost at a 4% stablecoin rate.`);
  }
  steps.push(`Track and exit: log each transaction and the points balance weekly (5 minutes). Withdraw if 7-day TVL falls more than 25%, if the protocol's audits or admin keys change, or once a token is announced and the snapshot date has passed; exit costs about ${usd(c.gas * 2)} in gas.`);

  return steps.map((s) => {
    const t = s.trim();
    return t.length > 600 ? t.slice(0, 597) + "..." : t;
  });
}

// ---------- board ----------

export function buildBoard(snap: Snapshot, size = BOARD_SIZE): BoardRow[] {
  const ctx = modelContext(snap);
  const wl = new Set(snap.watchlist);
  const scored = snap.protocols
    .filter((p) => p.tvl > 0 || wl.has(p.slug))
    .map((p) => ({ p, v: impliedValue(p, ctx) }));
  const byValue = (a: { p: Protocol; v: Valuation }, b: { p: Protocol; v: Valuation }) =>
    b.v.value - a.v.value || b.p.tvl - a.p.tvl || a.p.slug.localeCompare(b.p.slug);

  const pre = scored.filter((x) => x.p.preToken).sort(byValue);
  const traded = scored.filter((x) => !x.p.preToken).sort(byValue);
  const reserve = Math.min(TRADED_RESERVE, traded.length);

  // Pre-token tier: every watchlist slug, then the highest values until the tier is full.
  const preSlots = Math.max(size - reserve, 0);
  const preChosen = pre.filter((x) => wl.has(x.p.slug));
  for (const x of pre) {
    if (preChosen.length >= preSlots) break;
    if (!wl.has(x.p.slug)) preChosen.push(x);
  }
  preChosen.sort(byValue);

  // Traded tier: any watchlist slug the data marks as traded, then the largest values.
  const tradedChosen = traded.filter((x) => wl.has(x.p.slug));
  for (const x of traded) {
    if (preChosen.length + tradedChosen.length >= size) break;
    if (!wl.has(x.p.slug)) tradedChosen.push(x);
  }
  tradedChosen.sort(byValue);

  // Scale the traded tier so its top sits just under the pre-token floor; order inside is kept.
  const floor = preChosen.length ? preChosen[preChosen.length - 1].v.value : Infinity;
  const topTraded = tradedChosen.length ? tradedChosen[0].v.value : 0;
  const scale = topTraded > 0 && floor !== Infinity && topTraded >= floor ? (floor * 0.95) / topTraded : 1;
  for (const x of tradedChosen) {
    x.v.tierScale = r3(scale);
    x.v.value = Math.max(1, Math.round(x.v.value * scale));
  }

  const all = [...preChosen, ...tradedChosen];
  // Safety pass: implied value never increases with rank.
  for (let i = 1; i < all.length; i++) {
    if (all[i].v.value > all[i - 1].v.value) all[i].v.value = all[i - 1].v.value;
  }

  return all.map(({ p, v }, i) => ({
    rank: i + 1,
    slug: p.slug,
    name: p.name,
    implied_value_usd: v.value,
    tier: v.tier,
    watchlist: wl.has(p.slug),
    category: p.category,
    chains: p.chains,
    tvl_usd: Math.round(p.tvl),
    change_7d: p.change7d === null ? null : Math.round(p.change7d * 100) / 100,
    listed_at: p.listedAtMs === null ? null : new Date(p.listedAtMs).toISOString().slice(0, 10),
    months_no_token: v.monthsNoToken,
    symbol: p.symbol,
    gecko_id: p.geckoId,
    mcap_usd: p.mcap === null ? null : Math.round(p.mcap),
    derivation: {
      fdv_usd: v.fdvUsd,
      multiple: v.multiple,
      multiple_source: v.multipleSource,
      prior_multiple: v.priorMultiple,
      peer_median: v.peerMedian,
      peers: v.peers,
      momentum: v.momentum,
      age_factor: v.ageFactor,
      chain_factor: v.chainFactor,
      tier_scale: v.tierScale,
      airdrop_pool_usd: v.airdropPoolUsd,
      per_1k_usd: v.per1kUsd,
      formula:
        v.tier === "pre-token"
          ? "TVL × multiple × momentum × age × chains"
          : `TVL × multiple × momentum × age × chains × ${TRADED_RESIDUAL} residual × ${r3(v.tierScale)} tier scale`,
    },
    farm_steps: farmSteps(p, v),
  }));
}

// ---------- dashboard payload ----------

export function radarRow(r: BoardRow) {
  return {
    rank: r.rank, slug: r.slug, name: r.name, value: r.implied_value_usd, tier: r.tier,
    wl: r.watchlist, cat: r.category, chains: r.chains, tvl: r.tvl_usd, ch7: r.change_7d,
    listed: r.listed_at, months: r.months_no_token, sym: r.symbol, mcap: r.mcap_usd,
    d: r.derivation, steps: r.farm_steps,
  };
}

export function buildRadar(board: BoardRow[], snap: Snapshot) {
  const count = (xs: string[]) => {
    const m = new Map<string, number>();
    for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  };
  const pre = board.filter((r) => r.tier === "pre-token");
  return {
    snapshot_date: snap.date,
    source: snap.source,
    protocols_in_snapshot: snap.protocols.length,
    watchlist_size: snap.watchlist.length,
    pre_token_in_snapshot: snap.protocols.filter((p) => p.preToken).length,
    model: {
      airdrop_share: AIRDROP_SHARE,
      traded_residual: TRADED_RESIDUAL,
      summary:
        "Implied value = TVL × category FDV/TVL multiple (prior blended with traded peers' median mcap/TVL from this snapshot) × 7-day momentum exp(0.9·clip(Δ7d,−40%,+60%)) × launch pressure 0.5+0.7·(1−e^(−months/9))·decay(>30 months) × chain breadth (1+0.05 per extra chain, max 1.5). Pre-token rows rank first; traded rows keep 8% residual and are scaled under the pre-token floor.",
    },
    stats: {
      rows: board.length,
      pre_token: pre.length,
      traded: board.length - pre.length,
      watchlist_on_board: board.filter((r) => r.watchlist).length,
      pre_token_value_usd: pre.reduce((s, r) => s + r.implied_value_usd, 0),
      pre_token_tvl_usd: pre.reduce((s, r) => s + r.tvl_usd, 0),
    },
    categories: count(board.map((r) => r.category)),
    chains: count(board.flatMap((r) => r.chains)),
    rows: board.map(radarRow),
  };
}

export function dataScript(radar: unknown): string {
  return `// token-radar-01 data, generated by main.ts\nwindow.RADAR_DATA = ${JSON.stringify(radar)};\n`;
}

// ---------- gate ----------

export function boardIssue(rows: BoardRow[], watchlist: string[]): string | null {
  if (!Array.isArray(rows) || rows.length < 100) return `board has ${rows?.length ?? 0} rows, needs at least 100`;
  const slugs = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.rank !== i + 1) return `row ${i} has rank ${r.rank}, expected ${i + 1}`;
    if (!r.slug || !r.name) return `rank ${r.rank} is missing slug or name`;
    if (slugs.has(r.slug)) return `slug ${r.slug} appears twice`;
    slugs.add(r.slug);
    const v = r.implied_value_usd;
    if (!Number.isInteger(v) || v <= 0) return `rank ${r.rank} implied_value_usd ${v} is not a positive whole number`;
    if (i > 0 && v > rows[i - 1].implied_value_usd) return `rank ${r.rank} value rises above rank ${i}`;
    if (!Array.isArray(r.farm_steps) || r.farm_steps.length < 3 || r.farm_steps.length > 12)
      return `rank ${r.rank} has ${r.farm_steps?.length ?? 0} farm steps, needs 3-12`;
    for (const s of r.farm_steps) {
      const t = typeof s === "string" ? s.trim() : "";
      if (t.length < 20 || t.length > 600) return `rank ${r.rank} has a farm step of ${t.length} characters`;
    }
  }
  if (rows[0].implied_value_usd === rows[rows.length - 1].implied_value_usd) return "all implied values are equal";
  const missing = watchlist.filter((s) => !slugs.has(s));
  if (missing.length) return `watchlist slugs missing from board: ${missing.join(", ")}`;
  return null;
}
