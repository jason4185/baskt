# Baskt

Daily ETF UP/DOWN prediction markets on GenLayer.

Baskt uses Binance Futures and Bitget Futures as independent settlement
sources for daily ETF-linked perpetual markets.

## Overview

Baskt is an app-specific GenLayer prediction market, not a reusable contract
primitive or library. Each market represents one supported asset and one UTC
calendar day. Users predict whether that day's candle closes above or below
its open, then stake native GEN on `UP` or `DOWN`.

The contract is the source of truth for market state, positions, pools,
settlement evidence, payouts, refunds, and claims.

## How It Works

1. A market is created for a supported asset and future UTC day.
2. Users choose `UP` or `DOWN` and stake GEN.
3. Entries close when the target day begins at `00:00 UTC`.
4. After the target day ends, anyone can settle the market.
5. Binance Futures and Bitget Futures are checked independently.
6. If both sources agree on `UP` or `DOWN`, that side wins.
7. If they do not agree, the market is `INCONCLUSIVE` and original stakes are refunded.
8. Winning users claim their pari-mutuel payout.

## Supported Markets

V1 supports exactly these four symbols. The frontend cannot add arbitrary
assets.

| Asset | Contract symbol |
| --- | --- |
| SPY | `SPYUSDT` |
| QQQ | `QQQUSDT` |
| EWY | `EWYUSDT` |
| EWJ | `EWJUSDT` |

## Market Lifecycle

| State | Meaning |
| --- | --- |
| `OPEN` | Users can stake before the target UTC day starts. |
| `LOCKED` | The target UTC day has started. New entries are closed. |
| `READY_TO_SETTLE` | The target UTC day has ended and anyone can settle. |
| `SETTLED` | Both sources agreed on a directional result. |
| `INCONCLUSIVE` | Matching directional evidence was not established, so stakes are refunded. |

The contract derives these states from its deterministic transaction datetime
and the market's UTC timestamps. No separate market-close transaction is
required.

## Settlement

Each market resolves the exact interval:

```text
[target_start, target_end)
```

where `target_start` is the target day's UTC midnight and `target_end` is the
following UTC midnight. Source requests use:

```text
startTime = target_start_ms
endTime   = target_end_ms - 1
limit     = 1
```

Binance Futures uses daily klines with `interval=1d`. Bitget Futures uses
`productType=usdt-futures` and the mandatory `granularity=1Dutc`. The returned
candle timestamp must exactly equal `target_start_ms`; a previous, next, or
nearest-day candle is rejected.

Baskt reads the candle timestamp, open, and close. Direction is calculated
without floating-point settlement math:

```text
close > open  → UP
close < open  → DOWN
close == open → NON_DIRECTIONAL
```

Each source receives exactly three total fetch attempts. Missing, malformed,
non-success, incorrectly timestamped, or invalid candle data consumes an
attempt. A valid flat candle is not retried; it is valid `NON_DIRECTIONAL`
evidence.

The settlement truth table is:

```text
Binance UP   + Bitget UP   → SETTLED / UP
Binance DOWN + Bitget DOWN → SETTLED / DOWN
Anything else               → INCONCLUSIVE / refund_all
```

Prices are never averaged, and one source cannot settle a market by itself.
If a temporary GenLayer validator or consensus execution failure prevents a
safe result, the write fails without finalizing the market. Settlement can be
attempted again later.

## Validator Consensus

The proposer fetches the fixed Binance and Bitget sources. Validators
independently fetch the same sources and compare normalized settlement fields
instead of blindly trusting proposer data. Baskt validates the agreed result
again before storing evidence and changing the market state.

This follows the same core validator/equivalence philosophy as Strata, while
using Baskt's own assets, sources, target-day candle, and directional rules.

## Staking and Payouts

- Minimum stake: `1 GEN`.
- Maximum cumulative stake: `10 GEN` per wallet per market.
- Same-side top-ups are allowed until the market locks.
- Switching from `UP` to `DOWN`, or from `DOWN` to `UP`, is forbidden.
- There are no market, stake, or claim fees in V1.
- Positions cannot be withdrawn or transferred.

Normal payouts use integer pari-mutuel accounting:

```text
payout = total pool × user winning stake / total winning-side stake
```

The total pool is shared proportionally among users on the winning side. If
the winning side has no stake, `refund_all` is enabled and every participant
can recover the original stake. An `INCONCLUSIVE` market also refunds each
participant's original stake.

## Architecture

```text
React frontend
      ↓ reads and writes
GenLayer Bradbury
      ↓
Baskt contract
      ↓ validator consensus
Binance Futures + Bitget Futures
```

### Contract

The contract owns:

- market identity and UTC lifecycle
- positions, side pools, and total pools
- source fetching and normalized evidence
- validator-bound settlement
- payout and refund accounting
- caller-bound claims
- bounded market and position pagination

### Frontend

The React frontend displays markets, submits wallet transactions, and provides
market detail, portfolio, activity, create-market, and help pages. React
Query caches contract reads and refreshes relevant data after writes.

Live ETF prices and historical charts use public Binance market data for
display only. They do not determine the winning side, settlement evidence,
payouts, or refunds.

## Contract

The deployed Baskt contract is:

```text
0x1Dd45ED4eD6f66768deAF6C3c91F8999f6eD7807
```

Network: **GenLayer Bradbury Testnet**.

Public writes are:

```text
create_market(asset, target_day)
stake(market_id, side)          payable
settle_market(market_id)
claim(market_id)
```

Market creation and settlement are permissionless. Staking uses the caller's
wallet and native GEN value. Claims are bound to the caller's own position;
the caller cannot supply a payout amount or recipient.

The contract uses fixed maps, scalar counters, compact records, and bounded
loops. It has no `DynArray`, no caller-controlled source configuration, no V1
fees, and no arbitrary withdrawal path.

## Frontend

The frontend includes:

- Markets discovery and filters
- Market detail with live price, chart, pools, rules, and evidence
- Create market
- Portfolio tabs for active, claimable, and historical positions
- Browser-submitted Activity records
- How it works

Contract reads remain canonical for market state, pools, positions, claimable
amounts, remaining capacity, settlement evidence, and pagination.

## Wallets

Baskt uses RainbowKit, wagmi, and viem with injected browser wallets only.
Supported examples include MetaMask, Rabby, and other compatible EIP-1193
browser wallets. The application does not require a wallet connection to
display public markets or live prices.

## Project Structure

```text
baskt/
├── contracts/
│   ├── Baskt.py
│   └── README.md
├── tests/
│   ├── direct/
│   └── integration/
├── docs/
│   └── architecture.md
├── frontend/
│   └── ...
└── README.md
```

## Getting Started

The repository uses Node.js and npm for the frontend, and Python tooling for
contract tests and validation. Development dependencies are listed in
`requirements-dev.txt`.

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
```

GenLayer tooling also needs a configured localnet, Studio, StudioNet, or
testnet environment for execution and deployment-path tests. The checked-in
`gltest.config.yaml` provides the localnet endpoint and the `studionet`
target.

## Running the Frontend

```bash
cd frontend
npm install
npm run dev
```

Vite prints the local URL when the server starts. The frontend uses the
Bradbury configuration in `frontend/src/lib/baskt/config.ts`.

## Testing

Run contract checks from the project root:

```bash
genvm-lint check contracts/Baskt.py
genvm-lint schema contracts/Baskt.py --output baskt-schema.json
genvm-lint typecheck contracts/Baskt.py
pytest tests/direct/ -v
```

Run the deployment-path integration test with a configured GenLayer execution
environment:

```bash
BASKT_RUN_INTEGRATION=1 gltest tests/integration/ -v -s
```

Run frontend checks with npm:

```bash
cd frontend
npm run typecheck
npm run lint
npm run build
```

Direct tests use deterministic Binance and Bitget response mocks. Integration
tests exercise the configured deployment and execution path. Pickling and
storage validation is covered by the direct storage tests.

## Deployment

Use the GenLayer deployment workflow for the configured Bradbury target and
the pinned runner declared in the first line of `contracts/Baskt.py`. Do not
replace that concrete runner pin with a local-only or latest alias before
deployment.

After deployment, verify the generated schema and configure the frontend to
use the intended deployed contract address and Bradbury RPC. The current
frontend deployment points to the contract address shown above.

## Security and Design Principles

- The contract is the source of truth for all financial and settlement state.
- Assets and settlement sources are fixed allowlists.
- Callers cannot choose URLs, exchanges, intervals, results, or payout amounts.
- Source responses are bounded, strictly shaped, timestamp-checked, and normalized to fixed-point integers.
- Each source has at most three total attempts.
- Validator execution failure is kept separate from source unavailability and does not silently finalize a market.
- Claims are caller-bound, single-use, and marked before the finalized transfer interaction.
- Pool and paid-out accounting guards prevent overpayment.
- Pagination and raw scans are bounded at 50 items per call.
- Storage uses serialization-safe records and maps with no `DynArray`.
- The frontend has no private keys, seed phrases, or arbitrary RPC and contract inputs.
- Frontend price and chart data is display-only and cannot affect settlement.

## Status

Latest verified project status:

```text
Direct contract tests: 45 passed
Integration tests: 1 passed
DynArray: No
Contract size: 37,869 bytes
52 KB limit: Passed
Frontend typecheck: Passed
Frontend lint: Passed
Frontend build: Passed
```

Baskt is an app-specific V1 backend and frontend for the four supported
ETF-linked perpetual markets.
