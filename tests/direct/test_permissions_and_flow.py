import ast
from datetime import date, timedelta
from pathlib import Path

from conftest import CONTRACT, GEN, TARGET, hex_address, mock_sources, open_market, warp


def test_settlement_is_permissionless_but_claim_is_caller_bound(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy(CONTRACT)
    open_market(direct_vm, contract, direct_alice)
    direct_vm.sender, direct_vm.value = direct_alice, GEN
    contract.stake(0, "UP")

    mock_sources(direct_vm)
    warp(direct_vm, "2026-08-27T00:00:00Z")
    direct_vm.sender = direct_bob
    assert contract.settle_market(0) == "SETTLED"

    with direct_vm.expect_revert("nothing claimable"):
        contract.claim(0)
    direct_vm.sender = direct_alice
    assert contract.claim(0) == GEN


def test_claimable_filtered_pages_return_raw_position_continuations(
    direct_vm, direct_deploy, direct_alice
):
    contract = direct_deploy(CONTRACT)
    days = [
        (date(2026, 8, 26) + timedelta(days=index)).isoformat()
        for index in range(52)
    ]
    for index, day in enumerate(days):
        open_market(direct_vm, contract, direct_alice, target_day=day)
        direct_vm.sender, direct_vm.value = direct_alice, GEN
        contract.stake(index, "UP")

    mock_sources(direct_vm, target_day="2026-08-26")
    warp(direct_vm, "2026-08-27T00:00:00Z")
    direct_vm.sender = direct_alice
    assert contract.settle_market(0) == "SETTLED"

    wallet = hex_address(direct_alice)
    first = contract.get_claimable_markets(wallet, 0, 1)
    assert [item["market_id"] for item in first["claims"]] == [0]
    assert first["next_offset"] == 1 and first["has_more"] is True

    second = contract.get_claimable_markets(wallet, first["next_offset"], 1)
    assert second["claims"] == []
    assert second["next_offset"] == 51 and second["has_more"] is True

    third = contract.get_claimable_markets(wallet, second["next_offset"], 1)
    assert third["claims"] == []
    assert third["next_offset"] == 52 and third["has_more"] is False


def test_write_surface_has_no_admin_or_user_selected_settlement_controls():
    source = (Path(__file__).parents[2] / "contracts" / "Baskt.py").read_text()
    tree = ast.parse(source)
    writes = {
        node.name: node
        for node in ast.walk(tree)
        if isinstance(node, ast.FunctionDef)
        and any(
            ".write" in ast.unparse(decorator)
            for decorator in node.decorator_list
        )
    }
    assert set(writes) == {"create_market", "stake", "settle_market", "claim"}
    assert [arg.arg for arg in writes["settle_market"].args.args] == ["self", "market_id"]
    assert all(
        token not in source.lower()
        for token in ("admin", "operator", "emergency", "withdraw")
    )
