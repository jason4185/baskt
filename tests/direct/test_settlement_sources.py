import json

import pytest

from conftest import CONTRACT, DAY_MS, TARGET, epoch_ms, mock_sources, open_market, source_body, warp


def test_source_request_parameters_and_valid_same_day_candle(
    direct_vm, direct_deploy, direct_alice
):
    contract = direct_deploy(CONTRACT)
    open_market(direct_vm, contract, direct_alice)
    mock_sources(direct_vm)
    warp(direct_vm, "2026-08-27T00:00:00Z")
    direct_vm.sender = direct_alice
    assert contract.settle_market(0) == "SETTLED"
    evidence = contract.get_settlement_evidence(0)
    assert evidence["binance"]["target_timestamp"] == epoch_ms(TARGET)
    assert evidence["bitget"]["target_timestamp"] == epoch_ms(TARGET)
    assert evidence["binance"]["attempts_used"] == 1
    assert evidence["bitget"]["attempts_used"] == 1


def test_august_24_bitget_next_day_candle_is_rejected(
    direct_vm, direct_deploy, direct_alice
):
    target_day = "2026-08-24"
    contract = direct_deploy(CONTRACT)
    open_market(direct_vm, contract, direct_alice, target_day=target_day)
    mock_sources(
        direct_vm,
        target_day=target_day,
        bitget_timestamp_delta=DAY_MS,
    )
    warp(direct_vm, "2026-08-25T00:00:00Z")
    direct_vm.sender = direct_alice
    assert contract.settle_market(0) == "INCONCLUSIVE"
    evidence = contract.get_settlement_evidence(0)
    assert evidence["bitget"]["target_timestamp"] == 1787529600000
    assert evidence["bitget"]["status"] == "UNAVAILABLE"
    assert evidence["bitget"]["attempts_used"] == 3
    assert evidence["bitget"]["close"] == 0


def test_all_three_source_attempts_are_bounded_and_unavailable_is_evidence(
    direct_vm, direct_deploy, direct_alice
):
    contract = direct_deploy(CONTRACT)
    open_market(direct_vm, contract, direct_alice)
    mock_sources(direct_vm, binance_status=503)
    warp(direct_vm, "2026-08-27T00:00:00Z")
    direct_vm.sender = direct_alice
    assert contract.settle_market(0) == "INCONCLUSIVE"
    evidence = contract.get_settlement_evidence(0)
    assert evidence["binance"]["status"] == "UNAVAILABLE"
    assert evidence["binance"]["attempts_used"] == 3
    assert evidence["bitget"]["status"] == "VALID"
    assert evidence["final_status"] == "INCONCLUSIVE"


def test_wrong_previous_and_malformed_source_payloads_are_unavailable(
    direct_vm, direct_deploy, direct_alice
):
    contract = direct_deploy(CONTRACT)
    open_market(direct_vm, contract, direct_alice)
    mock_sources(
        direct_vm,
        binance_body="not-json",
        bitget_body="[]",
    )
    warp(direct_vm, "2026-08-27T00:00:00Z")
    direct_vm.sender = direct_alice
    assert contract.settle_market(0) == "INCONCLUSIVE"
    evidence = contract.get_settlement_evidence(0)
    assert evidence["binance"]["status"] == "UNAVAILABLE"
    assert evidence["bitget"]["status"] == "UNAVAILABLE"
    assert evidence["binance"]["attempts_used"] == 3
    assert evidence["bitget"]["attempts_used"] == 3


@pytest.mark.parametrize(
    "bitget_body",
    [
        json.dumps([[str(epoch_ms(TARGET)), "100", "101", "99", "101"]]),
        json.dumps({"data": [[str(epoch_ms(TARGET)), "100", "101", "99", "101"]]}),
    ],
)
def test_bitget_requires_the_documented_success_envelope(
    direct_vm, direct_deploy, direct_alice, bitget_body
):
    contract = direct_deploy(CONTRACT)
    open_market(direct_vm, contract, direct_alice)
    direct_vm.clear_mocks()
    direct_vm.mock_web(
        r"api\.bitget\.com/api/v2/mix/market/candles.*startTime=" +
        str(epoch_ms(TARGET)) + r".*",
        {"status": 200, "body": bitget_body},
    )
    result = contract._fetch_bitget("SPYUSDT", epoch_ms(TARGET))
    assert result["status"] == "UNAVAILABLE"
    assert result["attempts_used"] == 3


def test_flat_candle_is_valid_non_directional_and_not_retried(
    direct_vm, direct_deploy, direct_alice
):
    contract = direct_deploy(CONTRACT)
    open_market(direct_vm, contract, direct_alice)
    mock_sources(
        direct_vm,
        binance_open="100", binance_close="100",
        bitget_open="100", bitget_close="101",
    )
    warp(direct_vm, "2026-08-27T00:00:00Z")
    direct_vm.sender = direct_alice
    assert contract.settle_market(0) == "INCONCLUSIVE"
    evidence = contract.get_settlement_evidence(0)
    assert evidence["binance"]["direction"] == "NON_DIRECTIONAL"
    assert evidence["binance"]["status"] == "VALID"
    assert evidence["binance"]["attempts_used"] == 1


@pytest.mark.parametrize("source", ["binance", "bitget"])
@pytest.mark.parametrize("failure_count", [1, 2])
def test_source_succeeds_on_attempt_two_or_three(
    direct_vm, direct_deploy, direct_alice, source, failure_count
):
    contract = direct_deploy(CONTRACT)
    open_market(direct_vm, contract, direct_alice)
    direct_vm.clear_mocks()
    valid_body = (
        source_body(TARGET)
        if source == "binance"
        else json.dumps({"code": "00000", "data": [[
            str(epoch_ms(TARGET)), "100", "101", "99", "101",
        ]]})
    )
    pattern = (
        r"fapi\.binance\.com/fapi/v1/klines.*startTime=" + str(epoch_ms(TARGET)) + r".*"
        if source == "binance" else
        r"api\.bitget\.com/api/v2/mix/market/candles.*startTime=" + str(epoch_ms(TARGET)) + r".*"
    )
    calls = []

    def sequence_handler(request):
        calls.append(request["url"])
        if len(calls) == failure_count:
            direct_vm._live_web_handler = None
            direct_vm.mock_web(pattern, {"status": 200, "body": valid_body})
        raise OSError("temporary source failure")

    direct_vm._live_web_handler = sequence_handler
    fetcher = getattr(contract, "_fetch_" + source)
    result = fetcher("SPYUSDT", epoch_ms(TARGET))
    assert result["status"] == "VALID"
    assert result["attempts_used"] == failure_count + 1
    assert len(calls) == failure_count


@pytest.mark.parametrize("source", ["binance", "bitget"])
def test_source_failure_on_all_three_attempts_never_makes_a_fourth_call(
    direct_vm, direct_deploy, direct_alice, source
):
    contract = direct_deploy(CONTRACT)
    open_market(direct_vm, contract, direct_alice)
    direct_vm.clear_mocks()
    calls = []

    def failure_handler(request):
        calls.append(request["url"])
        raise OSError("temporary source failure")

    direct_vm._live_web_handler = failure_handler
    fetcher = getattr(contract, "_fetch_" + source)
    result = fetcher("SPYUSDT", epoch_ms(TARGET))
    assert result["status"] == "UNAVAILABLE"
    assert result["attempts_used"] == 3
    assert len(calls) == 3
