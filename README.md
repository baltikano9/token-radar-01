# token-radar-01

A token launch radar for the 14 November 2026 DefiLlama snapshot: it ranks every protocol that records no token by an implied value built only from the snapshot's own figures, then lists the protocols whose token already trades as a separate, lower tier. Implied value = TVL × category FDV/TVL multiple (recalibrated against traded peers' market caps in the same snapshot) × 7-day momentum × launch pressure from months listed with no token × chain breadth. Every row carries a farm plan with concrete actions, costs and times for its category and chains, and a no-network dashboard lets you sort, filter and open a detail view for each one.

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/baltikano9/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/baltikano9/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

Node 22, standard library only. Output: `board.json` (200 ranked rows), `dashboard/` with `data.js`, `screenshots/`, `shots.json` and `dossier.json`.
Open `out/dashboard/index.html` through any static server. Deep links: `?view=board`, `?view=detail&slug=<slug>`, `?view=filtered&filter=<category, chain or text>`.

## Model

| Factor | From the snapshot | Range |
| --- | --- | --- |
| TVL | `tvl` | base |
| Category multiple | `category`; prior FDV/TVL blended in log space with the median `mcap / tvl` of ≥3 traded peers in the same category, weight n/(n+5) | 0.05–5× |
| Momentum | `change_7d`, exp(0.9 · clip(Δ, −40%, +60%)) | 0.70–1.72× |
| Launch pressure | months since `listed_at` with no token recorded: 0.5 + 0.7·(1 − e^(−m/9)), decaying after 30 months | 0.5–1.2× |
| Chain breadth | `chains`: 1 + 0.05 per extra chain | 1–1.5× |

Pre-token (no `gecko_id`, no `symbol`) rows rank first. Rows whose token already trades keep 8% of modelled value as residual incentives and are scaled under the pre-token floor, so implied value never rises with rank. All 40 watchlist protocols are always on the board.

<sub>Entered on [make.fun](https://make.fun/?ref=ftn0yn4s&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
