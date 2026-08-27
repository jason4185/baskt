import ast
from pathlib import Path

import pytest

from conftest import CONTRACT, mock_sources, open_market, warp


SOURCE = Path(__file__).parents[2] / "contracts" / "Baskt.py"
TEXT = SOURCE.read_text(encoding="utf-8")
TREE = ast.parse(TEXT)


@pytest.mark.parametrize(
    ("binance_open", "binance_close", "bitget_open", "bitget_close", "expected"),
    [
        ("100", "101", "100", "102", "SETTLED"),
        ("101", "100", "101", "99", "SETTLED"),
        ("100", "101", "101", "100", "INCONCLUSIVE"),
        ("100", "100", "100", "100", "INCONCLUSIVE"),
    ],
)
def test_consensus_matrix(
    direct_vm, direct_deploy, direct_alice,
    binance_open, binance_close, bitget_open, bitget_close, expected,
):
    contract = direct_deploy(CONTRACT)
    open_market(direct_vm, contract, direct_alice)
    mock_sources(
        direct_vm,
        binance_open=binance_open, binance_close=binance_close,
        bitget_open=bitget_open, bitget_close=bitget_close,
    )
    warp(direct_vm, "2026-08-27T00:00:00Z")
    direct_vm.sender = direct_alice
    assert contract.settle_market(0) == expected


def test_storage_is_fixed_map_only_and_contract_is_bounded():
    assert "DynArray" not in TEXT
    class_node = next(node for node in TREE.body if isinstance(node, ast.ClassDef) and node.name == "Baskt")
    fields = {node.target.id for node in class_node.body if isinstance(node, ast.AnnAssign)}
    assert fields == {
        "market_count", "markets", "market_keys", "positions",
        "user_market_count", "user_market_index", "settlement_evidence",
    }
    assert TEXT.count("range(1, 4)") == 2
    assert "start_ms + DAY_MS - 1" in TEXT
    assert "productType=usdt-futures" in TEXT
    assert "granularity=1Dutc" in TEXT
    assert "gl.vm.run_nondet_unsafe(fetch, verify)" in TEXT


def test_all_loops_have_explicit_bounds():
    for node in ast.walk(TREE):
        if isinstance(node, (ast.For, ast.While)):
            body = ast.get_source_segment(TEXT, node) or ""
            assert "range(" in body or isinstance(node, ast.For)
            assert not isinstance(node, ast.While)
    assert "while " not in TEXT


@pytest.mark.parametrize("field", [
    "market_id", "asset", "target_timestamp", "binance_open", "binance_close",
    "binance_direction", "binance_status", "binance_attempts", "bitget_open",
    "bitget_close", "bitget_direction", "bitget_status", "bitget_attempts",
    "consensus_direction",
])
def test_consensus_material_fields_are_bound(field):
    method = next(
        node for node in ast.walk(TREE)
        if isinstance(node, ast.FunctionDef) and node.name == "_consensus_result"
    )
    body = ast.get_source_segment(TEXT, method)
    assert field in body
