# Baskt contract

`Baskt.py` is the complete app backend. It is intentionally not a reusable
Intelligent Contract primitive or library.

## Fixed market configuration

The only accepted assets are:

```text
SPYUSDT
QQQUSDT
EWYUSDT
EWJUSDT
```

The only settlement sources are Binance Futures and Bitget Futures. URLs,
symbols, product type, daily interval, and payout rules are contract-defined;
callers cannot override them. Binance uses `interval=1d`. Bitget uses
`productType=usdt-futures` and mandatory `granularity=1Dutc`.

For target day `D`, the contract derives UTC seconds for `D 00:00:00` and the
next midnight. Source requests use `startTime=D_start_ms` and
`endTime=D_end_ms-1`. A returned candle timestamp must equal `D_start_ms`.
The contract reads only candle indexes 0, 1, and 4: timestamp, open, and
close. Prices are normalized to eight-decimal fixed-point integers.

## Public writes

- `create_market(asset, target_day)` creates one permissionless market for a
  supported asset/day identity.
- `stake(market_id, side)` is payable in GEN and accepts `UP` or `DOWN`.
- `settle_market(market_id)` is eligible at or after target end and stores
  compact independently verified evidence.
- `claim(market_id)` calculates and marks the caller's own claim before the
  finalized transfer interaction.

Market state is time-derived for reads and staking: `OPEN` before target start,
`LOCKED` from target start, `READY_TO_SETTLE` at target end, then final
`SETTLED` or `INCONCLUSIVE`. No caller must close entries for the timestamp
lock to apply.

## Public reads

The frontend-ready surface includes `get_supported_assets`, `get_market`,
`get_market_summary`, `get_market_state`, `get_market_by_asset_day`,
`get_position`, `get_user_market`, `get_claimable`,
`get_remaining_position_capacity`, `get_settlement_evidence`, and the bounded
paginated `get_markets`, `get_open_markets`, `get_user_positions`,
`get_ready_to_settle_markets`, and `get_claimable_markets` methods.

All pages cap output and raw scans at 50. Filtered pages return the raw scan
continuation in `next_offset`; callers must use that value rather than adding
the number of returned matches.

## Settlement and claims

`close > open` produces `UP`, `close < open` produces `DOWN`, and equality
produces `NON_DIRECTIONAL`. Only Binance/Bitget matching `UP` or matching
`DOWN` produces a settled market. Any unavailable, flat, or disagreeing
source combination is `INCONCLUSIVE` and sets `refund_all`.

Normal winning claims are:

```text
total_pool * caller_winning_stake / total_winning_side_stake
```

Integer division leaves rounding dust in the contract. If the winning side
has zero stake, `refund_all` is set while the actual source direction remains
in the stored evidence. Inconclusive and zero-winner markets refund each
participant's original stake. There are no fees, withdrawals, or transfers of
positions.

Storage is fixed-map based and serialization-safe. The implementation uses no
dynamic-array storage, no unbounded storage scan, and no raw source-response
blob.
