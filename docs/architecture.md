# Baskt backend architecture

Baskt keeps the GenLayer boundary narrow:

```text
wallet action
  -> fixed asset/day market identity
  -> bounded Binance + Bitget daily-candle fetches
  -> exact timestamp and fixed-point validation
  -> independently verified source directions
  -> deterministic final state and pool accounting
  -> caller-bound claim
```

The frontend, cached market data, and convenience analytics are outside the
contract. The contract owns market identity, timestamps, stake custody,
source normalization, consensus-bound evidence, finalization, and claims.

## Identity and time

There are exactly four accepted assets: `SPYUSDT`, `QQQUSDT`, `EWYUSDT`, and
`EWJUSDT`. The identity key is `asset|target_start_seconds`. Market creation
accepts only the asset and `YYYY-MM-DD` target day. The day must be future at
creation and no more than 366 days ahead, and duplicates are rejected.

Transaction datetime from `gl.message_raw["datetime"]` is the only clock.
Wall-clock APIs are not used. The target interval is:

| Value | Meaning |
| --- | --- |
| `target_start` | target day at UTC midnight, stored in UTC seconds |
| `target_end` | following day at UTC midnight, stored in UTC seconds |
| request `startTime` | `target_start * 1000` |
| request `endTime` | `target_end * 1000 - 1` |

Reads derive `OPEN`, `LOCKED`, and `READY_TO_SETTLE` directly from those
timestamps, so entry closure does not depend on a keeper transaction. A
settlement consensus failure leaves the stored market unchanged and thus
retryable. Successful finalization stores `SETTLED` or `INCONCLUSIVE`; no
final state can be settled again.

## Storage and indexing

The contract has seven persisted fields: a market counter, market records,
asset/day lookup, position records, per-wallet position counts, per-wallet
market indexes, and one compact evidence record per market. Records use
storage-safe dataclasses with scalar integers, strings, booleans, and an
address. There is no dynamic-array storage.

Each first position creates one dense user-index entry. Same-market top-ups
update the existing position and do not create another index entry. Position
keys use the normalized lowercase `0x`-prefixed address, including all caller
reads, so casing or an omitted `0X` prefix cannot create a second logical
position.

All writes validate the complete operation before persistent writes. This is
especially important for a failed top-up: the position, user index, side pool,
and total pool remain unchanged. Claims set `claimed` and increment
`paid_out` before queuing the finalized transfer. The paid-out guard prevents
claims from exceeding the market pool.

## Source boundary

Binance Futures is requested from the fixed daily klines endpoint with the
asset symbol, `interval=1d`, the exact millisecond range, and `limit=1`.
Bitget Futures is requested from the fixed mix candles endpoint with the asset
symbol, `productType=usdt-futures`, `granularity=1Dutc`, the same exact range,
and `limit=1`. No URL, exchange, interval, or product setting is caller
controlled.

Each source gets exactly three total attempts. A transport/API failure,
non-success response, malformed JSON or payload, missing row, wrong timestamp,
missing field, invalid decimal, or non-positive open/close consumes an attempt.
The first valid candle stops attempts; a flat candle is valid and is not
retried. Three failures produce a compact `UNAVAILABLE` source record with
zero prices and `attempts_used=3`.

The exact timestamp check prevents a previous-day or next-day candle from
being used. For example, resolving `2026-08-24` requires timestamp
`1787529600000`; `1787616000000` is the next day and is rejected.

The leader fetch result is independently re-fetched by the validator through
`gl.vm.run_nondet_unsafe`. Equivalence binds the market id, asset, target
timestamp, both normalized open/close pairs, each direction/status/attempt
count, and the final consensus direction. Request time, volume, high/low,
trade count, request IDs, and raw response text are not persisted or compared.
If validator execution cannot establish equivalence, the write fails safely;
that transient GenLayer failure is not stored as source unavailability.

## Truth table and accounting

```text
UP + UP                  -> SETTLED / UP
DOWN + DOWN              -> SETTLED / DOWN
anything else            -> INCONCLUSIVE / refund_all
```

The second row includes disagreement, one or both unavailable sources, and
one or both `NON_DIRECTIONAL` candles. Prices are never averaged. A settled
direction with zero winning-side liquidity also sets `refund_all` while
retaining the `SETTLED` source direction for auditability.

Stake is native GEN: minimum 1 GEN, maximum cumulative 10 GEN per wallet per
market. A position is one side only and cannot be withdrawn or transferred.
Winning claims use integer pari-mutuel arithmetic. Inconclusive and
`refund_all` claims return original stake. Losers cannot claim, claimed
positions cannot claim twice, and rounding dust stays in the contract.

## Reads and pagination

`get_market_summary` is the primary market-card read. It includes timestamps,
state, pools, basis-point pool percentages, winning side, refund flag, and
settlement/finalization booleans. `get_user_market` combines side, stake,
capacity, claim state, result, and internally calculated claim amount.
`get_settlement_evidence` returns normalized Binance and Bitget source objects
plus consensus/final-status fields, never raw API blobs.

Every page accepts at most 50 output items. Full market and user-position
pages use dense indexes. Filtered market and claim pages scan at most 50 raw
IDs/index entries per call and return the actual raw continuation. Sparse
matches therefore remain safe and resumable without pretending that
`next_offset` equals `offset + len(items)`.

## Security assumptions and verification

The contract assumes the GenLayer runtime supplies authenticated sender/value,
transaction datetime, storage serialization, and finalized native transfer
semantics. Source data is untrusted until exact shape, timestamp, numeric, and
consensus checks pass. Expected input/state errors, external source failures,
malformed source data, transient consensus failures, and accounting invariants
are kept conceptually distinct.

Direct tests use deterministic web mocks and enable storage pickling checks.
Integration tests exercise deployment and reads against a configured
GenLayer environment. Required checks are:

```bash
genvm-lint check contracts/Baskt.py
genvm-lint schema contracts/Baskt.py --output baskt-schema.json
genvm-lint typecheck contracts/Baskt.py
pytest tests/direct/ -v
```

The source remains deliberately app-specific and below the 52 KB acceptance
limit; tests and documentation are outside the deployed contract source.
