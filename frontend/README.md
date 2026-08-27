# Baskt Daily Markets

Build a NEW frontend-only web app named **Baskt** for my GenLayer daily ETF UP/DOWN prediction market. Be direct: implement the complete UI in ONE pass; do not spend credits asking planning questions. Do NOT create Supabase/database/backend/auth server. Use React + TypeScript + Tailwind + shadcn/ui. The GenLayer contract is the canonical source of truth; keep blockchain calls behind a small adapter/service with placeholders for contract address/network config so I can wire the deployed contract later.

VISUAL DIRECTION from my references: dark premium prediction-market UI. Use Polymarket-style market-detail composition (large market question/content left, sticky trade card right, rules/evidence sections), Strata-style app shell/market discovery/create-market layout, and Pulse-style portfolio layout. Do not clone branding; brand everything as BASKT. Clean near-black background, charcoal cards, subtle borders, compact typography, teal/cyan primary accent, green UP, red DOWN, amber refund/inconclusive. Desktop-first but fully responsive.

APP PURPOSE: Daily ETF-linked markets where users predict whether the exact target UTC day's CLOSE is above or below OPEN. Supported assets only: SPYUSDT, QQQUSDT, EWYUSDT, EWJUSDT. Sources shown in UI: Binance + Bitget. Market lifecycle: OPEN, LOCKED, READY_TO_SETTLE, SETTLED, INCONCLUSIVE. Entries close at target_start 00:00 UTC; settlement eligible at target_end 00:00 UTC next day. 1–10 GEN cumulative stake cap per wallet/market. Same-side top-ups allowed; switching sides forbidden. No fees. INCONCLUSIVE or zero-winning-side => refund original stake.

ROUTES/PAGES:

1. `/` Markets: top nav BASKT / Markets / Portfolio / Activity / Create Market / How it works; search; network badge `GenLayer Bradbury Testnet`; wallet button. Hero `Daily ETF Markets` with short explanation. Stats cards: Open Pool, Live Markets, Your Positions, Ready to Settle. Left asset filter for All, SPY, QQQ, EWY, EWJ. Feed tabs All/Open/Locked/Ready to Settle/Settled. Market cards show asset, question like `SPY: UP or DOWN on Aug 27?`, state badge, UP/DOWN pool split bar, total pool, target day, entry cutoff, user's position, and View Market. Bounded pagination UI using returned `next_offset`/`has_more` rather than guessing offsets.
2. `/market/:id` Market detail: Polymarket-inspired layout. Header with asset icon/ticker and `SPY: UP or DOWN on Aug 27?`. Show status, target day, entry cutoff, settlement eligible time. Main probability/pool split chart area based on pool bps (no fake external odds history). Sticky right trade panel: UP and DOWN selectable buttons, amount in GEN, quick +1/+2/+5 buttons, min 1 GEN, max cumulative 10 GEN, remaining capacity, current position. Disable stake when not OPEN. If user already picked a side, disable opposite side and clearly say side switching is not allowed. After finalization replace trade panel with result/claim panel. Sections below: Rules, Settlement Evidence, Position. Evidence displays Binance and Bitget target timestamp/open/close/direction/status/attempts_used plus consensus/final status/refund_all. If evidence unavailable, show pending state. For READY_TO_SETTLE show permissionless `Settle Market` action. For claimable positions show `Claim` action and amount/type.
3. `/create` Create Market: Strata-inspired two-column layout. Four asset cards SPY/QQQ/EWY/EWJ, future UTC date picker, live preview. Preview shows entry closes at target day 00:00 UTC and settlement eligible next day 00:00 UTC. Create button. Explain permissionless creation and one canonical market per asset/day.
4. `/portfolio` Pulse-inspired. Summary cards Total Staked, Claimable, Active Positions, Settled Positions. Tabs Active / Claimable / History. Table/cards with market, side, stake, state, result, claimable, and actions. Use `get_user_positions` and `get_claimable_markets` with pagination.
5. `/activity` simple clean wallet activity timeline derived from known local transaction submissions and contract reads; do not invent chain history API.
6. `/how-it-works` concise explanation of OPEN→LOCKED→READY_TO_SETTLE→SETTLED/INCONCLUSIVE, Binance+Bitget 3-attempt consensus, strict UTC timestamp match, staking cap, payouts/refunds.

CONTRACT ADAPTER: create a single typed service/module with these reads exactly: `get_supported_assets`, `get_market`, `get_market_summary`, `get_market_state`, `get_market_by_asset_day`, `get_position`, `get_user_market`, `get_claimable`, `get_remaining_position_capacity`, `get_settlement_evidence`, `get_markets`, `get_open_markets`, `get_user_positions`, `get_ready_to_settle_markets`, `get_claimable_markets`, plus `get_market_count`, `get_config`. Writes: `create_market(asset,target_day)`, payable `stake(market_id,side,value)`, `settle_market(market_id)`, `claim(market_id)`. Keep this adapter isolated so I only need to fill network/contract connection later. Do not reconstruct settlement-critical logic in frontend; display contract-returned state/results. For dates, convert contract epoch seconds only for presentation.

DEMO STATE: until live contract config is supplied, provide a clearly marked local mock adapter with realistic sample data so every page renders. Include market 0 sample SPYUSDT Aug 27 with 1 GEN UP, 1 GEN DOWN, total 2 GEN, 50/50 bps, OPEN, no evidence yet. Make switching from mock adapter to live adapter a single config flag. Do not fake successful writes: in mock mode simulate UI state only and label it Demo Mode.

UX REQUIREMENTS: loading skeletons, empty states, error states, disabled transaction states, transaction pending/success/error toast, wallet disconnected state, responsive mobile nav. No excessive animations. No gradient-heavy design. No landing-page marketing fluff. Make it feel like a real trading product.

Use the visual references I provided as inspiration only: Polymarket detail hierarchy/sticky trade card, Strata markets/create flow, Pulse portfolio. Finish the frontend and return the preview. Do not ask me follow-up questions unless technically impossible.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/efc3eefc-1bf9-42db-8d98-468af2dc6b04).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
