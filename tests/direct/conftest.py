import json
import sys
from datetime import datetime, timezone

import pytest


CONTRACT = "contracts/Baskt.py"
GEN = 10**18
DAY_MS = 86400000
NOW = "2026-08-20T12:00:00Z"
TARGET = "2026-08-26"


@pytest.fixture(autouse=True)
def enable_storage_pickling_checks(request):
    if "direct_vm" not in request.fixturenames:
        yield
        return
    try:
        direct_vm = request.getfixturevalue("direct_vm")
    except pytest.FixtureLookupError:
        yield
        return
    direct_vm.check_pickling = True
    yield


def hex_address(address):
    return "0x" + bytes(address).hex()


def warp(vm, value):
    vm.warp(value)
    sys.modules["genlayer.gl"].message_raw["datetime"] = value


def epoch_ms(day):
    return int(datetime.strptime(day, "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp()) * 1000


def open_market(vm, contract, sender, asset="SPYUSDT", target_day=TARGET):
    warp(vm, NOW)
    vm.sender = sender
    return contract.create_market(asset, target_day)


def source_body(day, opened="100", closed="101", timestamp_delta=0):
    return json.dumps([[epoch_ms(day) + timestamp_delta, opened, "101", "99", closed]])


def mock_sources(
    vm,
    target_day=TARGET,
    binance_open="100",
    binance_close="101",
    bitget_open="100",
    bitget_close="101",
    binance_status=200,
    bitget_status=200,
    binance_body=None,
    bitget_body=None,
    binance_timestamp_delta=0,
    bitget_timestamp_delta=0,
):
    vm.clear_mocks()
    start_ms = epoch_ms(target_day)
    vm.mock_web(
        r"fapi\.binance\.com/fapi/v1/klines.*startTime=" + str(start_ms) + r".*",
        {
            "status": binance_status,
            "body": binance_body if binance_body is not None else source_body(
                target_day, binance_open, binance_close, binance_timestamp_delta
            ),
        },
    )
    vm.mock_web(
        r"api\.bitget\.com/api/v2/mix/market/candles.*startTime=" + str(start_ms) + r".*",
        {
            "status": bitget_status,
            "body": bitget_body if bitget_body is not None else json.dumps({
                "code": "00000",
                "data": [[
                    str(start_ms + bitget_timestamp_delta), bitget_open,
                    "101", "99", bitget_close,
                ]],
            }),
        },
    )


def settle(vm, contract, sender, target_day=TARGET, market_id=0, **source_options):
    mock_sources(vm, target_day=target_day, **source_options)
    day_after = datetime.strptime(target_day, "%Y-%m-%d").date().toordinal()
    end_day = datetime.fromordinal(day_after + 1).strftime("%Y-%m-%d")
    warp(vm, end_day + "T00:00:00Z")
    vm.sender = sender
    return contract.settle_market(market_id)
