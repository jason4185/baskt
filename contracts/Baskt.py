# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

import json
from dataclasses import dataclass
from typing import NoReturn

from genlayer import *


DAY = 86400
MILLIS = 1000
DAY_MS = DAY * MILLIS
GEN = u256(10**18)
MIN_STAKE = GEN
MAX_STAKE = u256(10) * GEN
MAX_FORWARD_DAYS = 366
MAX_PAGE = 50
MAX_SCAN = 50
MAX_SOURCE_BYTES = 60000
PRICE_SCALE = 10**8

OPEN = "OPEN"
LOCKED = "LOCKED"
READY_TO_SETTLE = "READY_TO_SETTLE"
SETTLED = "SETTLED"
INCONCLUSIVE = "INCONCLUSIVE"

UP = "UP"
DOWN = "DOWN"
NON_DIRECTIONAL = "NON_DIRECTIONAL"
NONE = "NONE"

VALID = "VALID"
UNAVAILABLE = "UNAVAILABLE"

EXPECTED = "[EXPECTED]"
EXTERNAL = "[EXTERNAL]"
MALFORMED_DATA = "[MALFORMED_DATA]"
TRANSIENT = "[TRANSIENT]"
ACCOUNTING = "[ACCOUNTING]"

ASSETS = ("SPYUSDT", "QQQUSDT", "EWYUSDT", "EWJUSDT")
BINANCE_URL = "https://fapi.binance.com/fapi/v1/klines?"
BITGET_URL = "https://api.bitget.com/api/v2/mix/market/candles?"


@allow_storage
@dataclass
class MarketRecord:
    market_id: u256
    asset: str
    target_day: str
    target_start: u256
    target_end: u256
    state: str
    winning_side: str
    up_pool: u256
    down_pool: u256
    total_pool: u256
    paid_out: u256
    refund_all: bool
    created_at: str


@allow_storage
@dataclass
class PositionRecord:
    market_id: u256
    owner: Address
    side: str
    stake: u256
    claimed: bool


@allow_storage
@dataclass
class EvidenceRecord:
    market_id: u256
    target_timestamp: u256
    binance_open: u256
    binance_close: u256
    binance_direction: str
    binance_status: str
    binance_attempts: u256
    bitget_open: u256
    bitget_close: u256
    bitget_direction: str
    bitget_status: str
    bitget_attempts: u256
    consensus_direction: str
    final_status: str
    refund_all: bool


def _err(kind: str, message: str) -> NoReturn:
    raise gl.vm.UserError(kind + " " + message)


def _digits(value: str) -> bool:
    return len(value) > 0 and len(value) <= 40 and all(char in "0123456789" for char in value)


def _parse_decimal(raw) -> int:
    """Parse a source decimal into a fixed-point integer without floats."""
    if not isinstance(raw, str):
        return 0
    text = raw.strip()
    if (not text or len(text) > 40 or text.startswith(("+", "-")) or
            "e" in text.lower() or text.count(".") > 1):
        return 0
    pieces = text.split(".")
    whole = pieces[0]
    fraction = pieces[1] if len(pieces) == 2 else ""
    if (not _digits(whole) or (len(pieces) == 2 and not fraction) or
            (fraction and not _digits(fraction)) or len(fraction) > 8):
        return 0
    value = int(whole) * PRICE_SCALE
    if fraction:
        value += int((fraction + "0" * 8)[:8])
    return value if 0 < value <= 10**20 else 0


def _parse_timestamp(raw) -> int:
    if not isinstance(raw, str) or not _digits(raw):
        return -1
    try:
        return int(raw)
    except Exception:
        return -1


@allow_storage
class Baskt(gl.Contract):
    market_count: u256
    markets: TreeMap[u256, MarketRecord]
    market_keys: TreeMap[str, u256]
    positions: TreeMap[str, PositionRecord]
    user_market_count: TreeMap[str, u256]
    user_market_index: TreeMap[str, u256]
    settlement_evidence: TreeMap[u256, EvidenceRecord]

    def __init__(self):
        self.market_count = u256(0)

    @gl.public.write
    def create_market(self, asset: str, target_day: str) -> u256:
        symbol = str(asset).strip().upper()
        self._asset(symbol)
        target = self._date(target_day)
        now = self._now()
        if target <= now:
            _err(EXPECTED, "target day must be in the future")
        if target > now + MAX_FORWARD_DAYS * DAY:
            _err(EXPECTED, "target day is too far ahead")
        canonical_day = self._date_text(target)
        key = symbol + "|" + str(int(target))
        if key in self.market_keys:
            _err(EXPECTED, "duplicate market")
        market_id = self.market_count
        self.markets[market_id] = MarketRecord(
            market_id, symbol, canonical_day, target, target + DAY,
            OPEN, NONE, u256(0), u256(0), u256(0), u256(0), False,
            str(gl.message_raw["datetime"]),
        )
        self.market_keys[key] = market_id
        self.market_count += u256(1)
        return market_id

    @gl.public.write.payable
    def stake(self, market_id: u256, side: str) -> None:
        market = self._market(market_id)
        now = self._now()
        if self._effective_state(market, now) != OPEN:
            _err(EXPECTED, "market is locked")
        chosen = str(side).strip().upper()
        if chosen not in (UP, DOWN):
            _err(EXPECTED, "invalid side")
        amount = gl.message.value
        if amount < MIN_STAKE:
            _err(EXPECTED, "minimum stake is 1 GEN")

        owner = self._sender()
        key = self._position_key(market_id, owner)
        current = self.positions.get(key)
        current_stake = u256(0)
        if current is not None:
            if current.claimed:
                _err(EXPECTED, "position already claimed")
            if current.side != chosen:
                _err(EXPECTED, "cannot switch sides")
            current_stake = current.stake
        if current_stake + amount > MAX_STAKE:
            _err(EXPECTED, "maximum cumulative stake is 10 GEN")

        # All validation is complete before any persistent value is written.
        if current is None:
            current = PositionRecord(
                market_id, gl.message.sender_address, chosen, amount, False
            )
            index = self.user_market_count.get(owner, u256(0))
            self.user_market_index[self._user_index_key(owner, index)] = market_id
            self.user_market_count[owner] = index + u256(1)
        else:
            current.stake = current_stake + amount
        self.positions[key] = current
        if chosen == UP:
            market.up_pool += amount
        else:
            market.down_pool += amount
        market.total_pool += amount
        self.markets[market_id] = market

    @gl.public.write
    def settle_market(self, market_id: u256) -> str:
        market = self._market(market_id)
        if market.state in (SETTLED, INCONCLUSIVE):
            _err(EXPECTED, "market already finalized")
        if self._now() < market.target_end:
            _err(EXPECTED, "market is not ready to settle")

        # A consensus failure is intentionally not caught here. It reverts the
        # write, leaving the market retryable. Source failures are represented
        # by source-level UNAVAILABLE evidence inside this result.
        result = self._consensus_result(market)
        self._validate_result(result, market)
        consensus = result["consensus_direction"]
        final_state = SETTLED if consensus in (UP, DOWN) else INCONCLUSIVE
        refund_all = final_state == INCONCLUSIVE
        if final_state == SETTLED:
            winning_pool = market.up_pool if consensus == UP else market.down_pool
            refund_all = winning_pool == u256(0)

        evidence = EvidenceRecord(
            market_id,
            market.target_start * MILLIS,
            u256(int(result["binance_open"])),
            u256(int(result["binance_close"])),
            result["binance_direction"],
            result["binance_status"],
            u256(int(result["binance_attempts"])),
            u256(int(result["bitget_open"])),
            u256(int(result["bitget_close"])),
            result["bitget_direction"],
            result["bitget_status"],
            u256(int(result["bitget_attempts"])),
            consensus,
            final_state,
            refund_all,
        )
        market.state = final_state
        market.winning_side = consensus if final_state == SETTLED else NONE
        market.refund_all = refund_all
        self.settlement_evidence[market_id] = evidence
        self.markets[market_id] = market
        return final_state

    @gl.public.write
    def claim(self, market_id: u256) -> u256:
        market = self._market(market_id)
        if market.state not in (SETTLED, INCONCLUSIVE):
            _err(EXPECTED, "market is not finalized")
        owner = self._sender()
        key = self._position_key(market_id, owner)
        position = self.positions.get(key)
        if position is None or position.claimed or position.stake == u256(0):
            _err(EXPECTED, "nothing claimable")
        amount = self._claimable(market, position)
        if amount == u256(0):
            _err(EXPECTED, "position did not win")
        if market.paid_out > market.total_pool or amount > market.total_pool - market.paid_out:
            _err(ACCOUNTING, "payout exceeds pool")

        # Effects precede the finalized transfer interaction.
        position.claimed = True
        market.paid_out += amount
        self.positions[key] = position
        self.markets[market_id] = market
        gl.get_contract_at(position.owner).emit_transfer(value=amount, on="finalized")
        return amount

    @gl.public.view
    def get_supported_assets(self) -> list:
        return ["SPYUSDT", "QQQUSDT", "EWYUSDT", "EWJUSDT"]

    @gl.public.view
    def get_market(self, market_id: u256) -> dict:
        market = self._market(market_id)
        return self._market_view(market_id, market, self._now())

    @gl.public.view
    def get_market_summary(self, market_id: u256) -> dict:
        market = self._market(market_id)
        return self._summary(market_id, market, self._now())

    @gl.public.view
    def get_market_state(self, market_id: u256) -> dict:
        market = self._market(market_id)
        now = self._now()
        state = self._effective_state(market, now)
        return {
            "market_id": int(market_id),
            "state": state,
            "entries_open": state == OPEN,
            "settlement_ready": state == READY_TO_SETTLE,
            "settled": state == SETTLED,
            "inconclusive": state == INCONCLUSIVE,
        }

    @gl.public.view
    def get_market_by_asset_day(self, asset: str, target_day: str) -> dict:
        symbol = str(asset).strip().upper()
        self._asset(symbol)
        target = self._date(target_day)
        market_id = self.market_keys.get(symbol + "|" + str(int(target)))
        if market_id is None:
            _err(EXPECTED, "market not found")
        market = self._market(market_id)
        return self._market_view(market_id, market, self._now())

    @gl.public.view
    def get_position(self, market_id: u256, wallet: str) -> dict:
        return self._user_view(market_id, wallet, False)

    @gl.public.view
    def get_user_market(self, market_id: u256, wallet: str) -> dict:
        return self._user_view(market_id, wallet, True)

    @gl.public.view
    def get_claimable(self, market_id: u256, wallet: str) -> u256:
        market = self._market(market_id)
        position = self.positions.get(
            self._position_key(market_id, self._normalize_address(wallet))
        )
        return u256(0) if position is None else self._claimable(market, position)

    @gl.public.view
    def get_remaining_position_capacity(self, market_id: u256, wallet: str) -> u256:
        self._market(market_id)
        owner = self._normalize_address(wallet)
        position = self.positions.get(self._position_key(market_id, owner))
        used = u256(0) if position is None else position.stake
        return u256(0) if used >= MAX_STAKE else MAX_STAKE - used

    @gl.public.view
    def get_settlement_evidence(self, market_id: u256) -> dict:
        market = self._market(market_id)
        evidence = self.settlement_evidence.get(market_id)
        if evidence is None:
            _err(EXPECTED, "settlement evidence unavailable")
        return {
            "market_id": int(evidence.market_id),
            "asset": market.asset,
            "binance": {
                "source": "BINANCE",
                "symbol": market.asset,
                "target_timestamp": int(evidence.target_timestamp),
                "open": int(evidence.binance_open),
                "close": int(evidence.binance_close),
                "direction": evidence.binance_direction,
                "status": evidence.binance_status,
                "attempts_used": int(evidence.binance_attempts),
            },
            "bitget": {
                "source": "BITGET",
                "symbol": market.asset,
                "target_timestamp": int(evidence.target_timestamp),
                "open": int(evidence.bitget_open),
                "close": int(evidence.bitget_close),
                "direction": evidence.bitget_direction,
                "status": evidence.bitget_status,
                "attempts_used": int(evidence.bitget_attempts),
            },
            "binance_direction": evidence.binance_direction,
            "bitget_direction": evidence.bitget_direction,
            "consensus_direction": evidence.consensus_direction,
            "final_status": evidence.final_status,
            "refund_all": evidence.refund_all,
        }

    @gl.public.view
    def get_markets(self, offset: u256, limit: u256) -> dict:
        start, size = self._page(offset, limit, self.market_count)
        end = min(start + size, int(self.market_count))
        items = []
        for index in range(start, end):
            market_id = u256(index)
            items.append(self._market_view(market_id, self._market(market_id), self._now()))
        return {
            "offset": start, "limit": size, "total": int(self.market_count),
            "next_offset": end, "has_more": end < int(self.market_count),
            "markets": items,
        }

    @gl.public.view
    def get_open_markets(self, offset: u256, limit: u256) -> dict:
        start, size = self._page(offset, limit, self.market_count)
        total = int(self.market_count)
        scan_end = min(total, start + MAX_SCAN)
        cursor = start
        now = self._now()
        items = []
        for index in range(start, scan_end):
            cursor = index + 1
            market_id = u256(index)
            market = self._market(market_id)
            if self._effective_state(market, now) == OPEN:
                items.append(self._summary(market_id, market, now))
            if len(items) >= size:
                break
        return {
            "offset": start, "limit": size, "total": total,
            "next_offset": cursor, "has_more": cursor < total, "markets": items,
        }

    @gl.public.view
    def get_ready_to_settle_markets(self, offset: u256, limit: u256) -> dict:
        start, size = self._page(offset, limit, self.market_count)
        total = int(self.market_count)
        scan_end = min(total, start + MAX_SCAN)
        cursor = start
        now = self._now()
        items = []
        for index in range(start, scan_end):
            cursor = index + 1
            market_id = u256(index)
            market = self._market(market_id)
            if self._effective_state(market, now) == READY_TO_SETTLE:
                items.append(self._summary(market_id, market, now))
            if len(items) >= size:
                break
        return {
            "offset": start, "limit": size, "total": total,
            "next_offset": cursor, "has_more": cursor < total, "markets": items,
        }

    @gl.public.view
    def get_user_positions(self, wallet: str, offset: u256, limit: u256) -> dict:
        owner = self._normalize_address(wallet)
        total = int(self.user_market_count.get(owner, u256(0)))
        start, size = self._page(offset, limit, u256(total))
        end = min(start + size, total)
        items = []
        now = self._now()
        for index in range(start, end):
            market_id = self.user_market_index[self._user_index_key(owner, u256(index))]
            market = self._market(market_id)
            position = self.positions.get(self._position_key(market_id, owner))
            if position is None:
                _err(ACCOUNTING, "user index points to missing position")
            items.append(self._position_view(market, position, owner, now))
        return {
            "offset": start, "limit": size, "total": total,
            "next_offset": end, "has_more": end < total, "positions": items,
        }

    @gl.public.view
    def get_claimable_markets(self, wallet: str, offset: u256, limit: u256) -> dict:
        owner = self._normalize_address(wallet)
        total = int(self.user_market_count.get(owner, u256(0)))
        start, size = self._page(offset, limit, u256(total))
        scan_end = min(total, start + MAX_SCAN)
        cursor = start
        now = self._now()
        claims = []
        for index in range(start, scan_end):
            cursor = index + 1
            market_id = self.user_market_index[self._user_index_key(owner, u256(index))]
            market = self._market(market_id)
            position = self.positions.get(self._position_key(market_id, owner))
            if position is None:
                _err(ACCOUNTING, "user index points to missing position")
            amount = self._claimable(market, position)
            if amount > u256(0):
                claims.append({
                    "market_id": int(market_id),
                    "asset": market.asset,
                    "target_day": market.target_day,
                    "side": position.side,
                    "stake": int(position.stake),
                    "claimable": int(amount),
                    "claim_type": "REFUND" if market.refund_all else "WINNINGS",
                    "claimed": position.claimed,
                })
            if len(claims) >= size:
                break
        return {
            "offset": start, "limit": size, "total": total,
            "next_offset": cursor, "has_more": cursor < total, "claims": claims,
        }

    @gl.public.view
    def get_market_count(self) -> u256:
        return self.market_count

    @gl.public.view
    def get_config(self) -> dict:
        return {
            "name": "Baskt",
            "assets": ["SPYUSDT", "QQQUSDT", "EWYUSDT", "EWJUSDT"],
            "sources": ["BINANCE", "BITGET"],
            "price_scale": PRICE_SCALE,
            "minimum_stake": int(MIN_STAKE),
            "maximum_stake": int(MAX_STAKE),
            "max_page": MAX_PAGE,
            "source_attempts": 3,
            "sides": [UP, DOWN],
            "source_directions": [UP, DOWN, NON_DIRECTIONAL],
            "final_states": [SETTLED, INCONCLUSIVE],
        }

    def _consensus_result(self, market: MarketRecord) -> dict:
        # Copy primitive values into the nondeterministic closures. Validators
        # must not read a mutable storage record through the closure.
        market_id_value = str(int(market.market_id))
        asset_value = str(market.asset)
        target_timestamp_value = str(int(market.target_start * MILLIS))

        def fetch():
            binance = self._fetch_binance(asset_value, int(target_timestamp_value))
            bitget = self._fetch_bitget(asset_value, int(target_timestamp_value))
            binance_direction = binance["direction"]
            bitget_direction = bitget["direction"]
            consensus = (
                UP if binance_direction == UP and bitget_direction == UP else
                DOWN if binance_direction == DOWN and bitget_direction == DOWN else
                INCONCLUSIVE
            )
            return {
                "status": "OK",
                "market_id": market_id_value,
                "asset": asset_value,
                "target_timestamp": target_timestamp_value,
                "binance_open": str(binance["open"]),
                "binance_close": str(binance["close"]),
                "binance_direction": binance_direction,
                "binance_status": binance["status"],
                "binance_attempts": str(binance["attempts_used"]),
                "bitget_open": str(bitget["open"]),
                "bitget_close": str(bitget["close"]),
                "bitget_direction": bitget_direction,
                "bitget_status": bitget["status"],
                "bitget_attempts": str(bitget["attempts_used"]),
                "consensus_direction": consensus,
            }

        def verify(leader_result) -> bool:
            if not isinstance(leader_result, gl.vm.Return):
                return False
            try:
                validator = fetch()
                leader = leader_result.calldata
                fields = (
                    "status", "market_id", "asset", "target_timestamp",
                    "binance_open", "binance_close", "binance_direction",
                    "binance_status", "binance_attempts", "bitget_open",
                    "bitget_close", "bitget_direction", "bitget_status",
                    "bitget_attempts", "consensus_direction",
                )
                return all(leader.get(field) == validator.get(field) for field in fields)
            except Exception:
                # This is a validator/equivalence failure, not source evidence.
                return False

        return gl.vm.run_nondet_unsafe(fetch, verify)

    def _fetch_binance(self, asset: str, start_ms: int) -> dict:
        self._asset(str(asset).strip().upper())
        end_ms = start_ms + DAY_MS - 1
        url = (BINANCE_URL + "symbol=" + asset + "&interval=1d&startTime=" +
               str(start_ms) + "&endTime=" + str(end_ms) + "&limit=1")
        failure_kind = TRANSIENT
        for attempt in range(1, 4):
            try:
                response = gl.nondet.web.get(url)
                if response is None or getattr(response, "status", 0) != 200:
                    failure_kind = EXTERNAL
                    continue
                parsed = self._parse_binance(response, start_ms)
                if parsed is not None:
                    parsed["status"] = VALID
                    parsed["attempts_used"] = attempt
                    return parsed
                failure_kind = MALFORMED_DATA
            except Exception:
                # Transport and execution failures are retryable source failures.
                failure_kind = TRANSIENT
        return self._unavailable(failure_kind)

    def _fetch_bitget(self, asset: str, start_ms: int) -> dict:
        self._asset(str(asset).strip().upper())
        end_ms = start_ms + DAY_MS - 1
        url = (BITGET_URL + "symbol=" + asset + "&productType=usdt-futures" +
               "&granularity=1Dutc&startTime=" + str(start_ms) +
               "&endTime=" + str(end_ms) + "&limit=1")
        failure_kind = TRANSIENT
        for attempt in range(1, 4):
            try:
                response = gl.nondet.web.get(url)
                if response is None or getattr(response, "status", 0) != 200:
                    failure_kind = EXTERNAL
                    continue
                parsed = self._parse_bitget(response, start_ms)
                if parsed is not None:
                    parsed["status"] = VALID
                    parsed["attempts_used"] = attempt
                    return parsed
                failure_kind = MALFORMED_DATA
            except Exception:
                failure_kind = TRANSIENT
        return self._unavailable(failure_kind)

    def _unavailable(self, failure_kind: str) -> dict:
        return {
            "open": 0, "close": 0, "direction": NONE,
            "status": UNAVAILABLE, "attempts_used": 3,
            "_failure_kind": failure_kind,
        }

    def _parse_binance(self, response, start_ms: int):
        if response is None or getattr(response, "status", 0) != 200:
            return None
        body = getattr(response, "body", None)
        if not isinstance(body, (bytes, bytearray)) or len(body) == 0 or len(body) > MAX_SOURCE_BYTES:
            return None
        try:
            payload = json.loads(body.decode("utf-8"), parse_int=str, parse_float=str)
        except Exception:
            return None
        if not isinstance(payload, list) or len(payload) != 1:
            return None
        row = payload[0]
        if not isinstance(row, list) or len(row) < 5:
            return None
        timestamp = _parse_timestamp(row[0])
        opened = _parse_decimal(row[1])
        closed = _parse_decimal(row[4])
        if timestamp != start_ms or opened <= 0 or closed <= 0:
            return None
        return {
            "open": opened, "close": closed,
            "direction": self._direction(opened, closed),
        }

    def _parse_bitget(self, response, start_ms: int):
        if response is None or getattr(response, "status", 0) != 200:
            return None
        body = getattr(response, "body", None)
        if not isinstance(body, (bytes, bytearray)) or len(body) == 0 or len(body) > MAX_SOURCE_BYTES:
            return None
        try:
            payload = json.loads(body.decode("utf-8"), parse_int=str, parse_float=str)
        except Exception:
            return None
        if not isinstance(payload, dict) or payload.get("code") != "00000":
            return None
        rows = payload.get("data")
        if not isinstance(rows, list) or len(rows) != 1:
            return None
        row = rows[0]
        if not isinstance(row, list) or len(row) < 5:
            return None
        timestamp = _parse_timestamp(row[0])
        opened = _parse_decimal(row[1])
        closed = _parse_decimal(row[4])
        if timestamp != start_ms or opened <= 0 or closed <= 0:
            return None
        return {
            "open": opened, "close": closed,
            "direction": self._direction(opened, closed),
        }

    def _validate_result(self, result: dict, market: MarketRecord) -> None:
        if not isinstance(result, dict) or result.get("status") != "OK":
            _err(ACCOUNTING, "invalid settlement result")
        if (result.get("market_id") != str(int(market.market_id)) or
                result.get("asset") != market.asset or
                result.get("target_timestamp") != str(int(market.target_start * MILLIS))):
            _err(ACCOUNTING, "settlement result is not for this market")
        for source in ("binance", "bitget"):
            status = result.get(source + "_status")
            direction = result.get(source + "_direction")
            attempts = result.get(source + "_attempts")
            if status not in (VALID, UNAVAILABLE) or not _digits(str(attempts)):
                _err(ACCOUNTING, "invalid source evidence")
            if int(attempts) < 1 or int(attempts) > 3:
                _err(ACCOUNTING, "invalid source attempts")
            if status == VALID and direction not in (UP, DOWN, NON_DIRECTIONAL):
                _err(ACCOUNTING, "invalid valid-source direction")
            if status == UNAVAILABLE and direction != NONE:
                _err(ACCOUNTING, "invalid unavailable-source direction")
            if not _digits(str(result.get(source + "_open"))) or not _digits(str(result.get(source + "_close"))):
                _err(ACCOUNTING, "invalid source price evidence")
            if status == UNAVAILABLE and (int(result[source + "_open"]) != 0 or int(result[source + "_close"]) != 0):
                _err(ACCOUNTING, "unavailable source has prices")
            if status == UNAVAILABLE and int(attempts) != 3:
                _err(ACCOUNTING, "unavailable source must exhaust attempts")
            if status == VALID:
                opened = int(result[source + "_open"])
                closed = int(result[source + "_close"])
                if opened <= 0 or closed <= 0 or direction != self._direction(opened, closed):
                    _err(ACCOUNTING, "source direction does not match prices")
        expected_consensus = (
            UP if result["binance_direction"] == UP and result["bitget_direction"] == UP else
            DOWN if result["binance_direction"] == DOWN and result["bitget_direction"] == DOWN else
            INCONCLUSIVE
        )
        if result.get("consensus_direction") != expected_consensus:
            _err(ACCOUNTING, "invalid consensus direction")

    def _claimable(self, market: MarketRecord, position: PositionRecord) -> u256:
        if position.claimed or market.state not in (SETTLED, INCONCLUSIVE):
            return u256(0)
        if market.refund_all or market.state == INCONCLUSIVE:
            return position.stake
        if position.side != market.winning_side:
            return u256(0)
        winners = market.up_pool if market.winning_side == UP else market.down_pool
        if winners == u256(0):
            _err(ACCOUNTING, "missing winning-side liquidity")
        return market.total_pool * position.stake // winners

    def _user_view(self, market_id: u256, wallet: str, detailed: bool) -> dict:
        market = self._market(market_id)
        owner = self._normalize_address(wallet)
        position = self.positions.get(self._position_key(market_id, owner))
        if position is None:
            return {
                "market_id": int(market_id), "wallet": owner, "side": NONE,
                "stake": 0, "remaining_capacity": int(MAX_STAKE),
                "claimed": False, "claimable": 0,
                "result": "NOT_PARTICIPATED", "claim_type": NONE,
            }
        amount = self._claimable(market, position)
        if market.state not in (SETTLED, INCONCLUSIVE):
            result = "PENDING"
        elif position.claimed:
            result = "CLAIMED"
        elif amount > u256(0) and (market.refund_all or market.state == INCONCLUSIVE):
            result = "REFUND_AVAILABLE"
        elif amount > u256(0):
            result = "WON"
        else:
            result = "LOST"
        claim_type = (
            "REFUND" if amount > u256(0) and (market.refund_all or market.state == INCONCLUSIVE)
            else "WINNINGS" if amount > u256(0) else NONE
        )
        remaining = u256(0) if position.stake >= MAX_STAKE else MAX_STAKE - position.stake
        result_view = {
            "market_id": int(market_id), "wallet": owner, "side": position.side,
            "stake": int(position.stake), "remaining_capacity": int(remaining),
            "claimed": position.claimed, "claimable": int(amount),
            "result": result, "claim_type": claim_type,
        }
        if detailed:
            result_view["asset"] = market.asset
            result_view["target_day"] = market.target_day
            result_view["market_state"] = self._effective_state(market, self._now())
        return result_view

    def _position_view(self, market: MarketRecord, position: PositionRecord, owner: str, now: u256) -> dict:
        view = self._user_view(market.market_id, owner, True)
        view["asset"] = market.asset
        view["target_day"] = market.target_day
        view["market_state"] = self._effective_state(market, now)
        return view

    def _market_view(self, market_id: u256, market: MarketRecord, now: u256) -> dict:
        state = self._effective_state(market, now)
        return {
            "market_id": int(market_id), "asset": market.asset,
            "target_day": market.target_day, "target_start": int(market.target_start),
            "target_end": int(market.target_end), "market_state": state,
            "state": state, "winning_side": market.winning_side,
            "up_pool": int(market.up_pool), "down_pool": int(market.down_pool),
            "total_pool": int(market.total_pool), "paid_out": int(market.paid_out),
            "refund_all": market.refund_all,
            "settlement_ready": state == READY_TO_SETTLE,
            "settled": state == SETTLED,
            "inconclusive": state == INCONCLUSIVE,
            "entries_open": state == OPEN,
            "evidence_available": market_id in self.settlement_evidence,
        }

    def _summary(self, market_id: u256, market: MarketRecord, now: u256) -> dict:
        state = self._effective_state(market, now)
        up_bps, down_bps = self._pool_bps(market)
        return {
            "market_id": int(market_id), "asset": market.asset,
            "target_day": market.target_day, "target_start": int(market.target_start),
            "target_end": int(market.target_end), "market_state": state,
            "up_pool": int(market.up_pool), "down_pool": int(market.down_pool),
            "total_pool": int(market.total_pool), "up_percentage_bps": up_bps,
            "down_percentage_bps": down_bps, "winning_side": market.winning_side,
            "refund_all": market.refund_all,
            "settlement_ready": state == READY_TO_SETTLE,
            "settled": state == SETTLED, "inconclusive": state == INCONCLUSIVE,
        }

    def _pool_bps(self, market: MarketRecord):
        if market.total_pool == u256(0):
            return 0, 0
        up = market.up_pool * u256(10000) // market.total_pool
        return int(up), int(u256(10000) - up)

    def _effective_state(self, market: MarketRecord, now: u256) -> str:
        if market.state in (SETTLED, INCONCLUSIVE):
            return market.state
        if now < market.target_start:
            return OPEN
        if now < market.target_end:
            return LOCKED
        return READY_TO_SETTLE

    def _market(self, market_id: u256) -> MarketRecord:
        market = self.markets.get(market_id)
        if market is None:
            _err(EXPECTED, "market not found")
        if market.state not in (OPEN, LOCKED, READY_TO_SETTLE, SETTLED, INCONCLUSIVE):
            _err(ACCOUNTING, "invalid market state")
        return market

    def _asset(self, value: str) -> None:
        if value not in ASSETS:
            _err(EXPECTED, "unsupported asset")

    def _direction(self, opened: int, closed: int) -> str:
        return UP if closed > opened else DOWN if closed < opened else NON_DIRECTIONAL

    def _sender(self) -> str:
        return self._normalize_address(gl.message.sender_address.as_hex)

    def _normalize_address(self, value) -> str:
        text = str(value).strip().lower()
        if text.startswith("0x"):
            body = text[2:]
        else:
            body = text
        if len(body) == 40 and all(char in "0123456789abcdef" for char in body):
            return "0x" + body
        return text

    def _position_key(self, market_id: u256, owner: str) -> str:
        return str(int(market_id)) + "|" + owner

    def _user_index_key(self, owner: str, index: u256) -> str:
        return owner + "|" + str(int(index))

    def _page(self, offset: u256, limit: u256, total: u256):
        start = int(offset)
        size = int(limit)
        if size <= 0 or size > MAX_PAGE:
            _err(EXPECTED, "invalid page size")
        if start > int(total):
            _err(EXPECTED, "invalid page offset")
        return start, size

    def _now(self) -> u256:
        text = str(gl.message_raw["datetime"])
        suffix = text[19:] if len(text) >= 20 else ""
        valid_suffix = suffix in ("Z", "+00:00")
        if not valid_suffix and suffix.startswith("."):
            if suffix.endswith("Z"):
                fraction = suffix[1:-1]
            elif suffix.endswith("+00:00"):
                fraction = suffix[1:-6]
            else:
                fraction = ""
            valid_suffix = 0 < len(fraction) <= 9 and _digits(fraction)
        if len(text) < 20 or text[10] != "T" or not valid_suffix:
            _err(EXPECTED, "invalid UTC transaction time")
        if (not _digits(text[0:4]) or not _digits(text[5:7]) or
                not _digits(text[8:10]) or not _digits(text[11:13]) or
                not _digits(text[14:16]) or not _digits(text[17:19])):
            _err(EXPECTED, "invalid UTC transaction time")
        if text[13] != ":" or text[16] != ":":
            _err(EXPECTED, "invalid UTC transaction time")
        try:
            date = self._date(text[:10])
            hour, minute, second = int(text[11:13]), int(text[14:16]), int(text[17:19])
        except Exception:
            _err(EXPECTED, "invalid UTC transaction time")
        if hour > 23 or minute > 59 or second > 59:
            _err(EXPECTED, "invalid UTC transaction time")
        return date + hour * 3600 + minute * 60 + second

    def _date(self, value: str) -> u256:
        text = str(value)
        if (len(text) != 10 or text[4] != "-" or text[7] != "-" or
                not _digits(text[:4]) or not _digits(text[5:7]) or
                not _digits(text[8:10])):
            _err(EXPECTED, "target day must be YYYY-MM-DD")
        year, month, day = int(text[:4]), int(text[5:7]), int(text[8:10])
        if (year < 1970 or year > 9999 or month < 1 or month > 12 or
                day < 1 or day > self._month_days(year, month)):
            _err(EXPECTED, "invalid target day")
        before = (367 * month - 362) // 12
        if month > 2:
            before -= 1 if self._leap(year) else 2
        ordinal = (365 * (year - 1) + (year - 1) // 4 - (year - 1) // 100 +
                   (year - 1) // 400 + before + day)
        return u256((ordinal - 719163) * DAY)

    def _date_text(self, epoch: u256) -> str:
        z = int(epoch // DAY) + 719468
        era = z // 146097
        doe = z - era * 146097
        yoe = (doe - doe // 1460 + doe // 36524 - doe // 146096) // 365
        year = yoe + era * 400
        doy = doe - (365 * yoe + yoe // 4 - yoe // 100)
        month_part = (5 * doy + 2) // 153
        day = doy - (153 * month_part + 2) // 5 + 1
        month = month_part + (3 if month_part < 10 else -9)
        year += 1 if month <= 2 else 0
        return "%04d-%02d-%02d" % (year, month, day)

    def _leap(self, year: int) -> bool:
        return year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)

    def _month_days(self, year: int, month: int) -> int:
        if month == 2:
            return 29 if self._leap(year) else 28
        return 30 if month in (4, 6, 9, 11) else 31
