from conftest import CONTRACT, GEN, NOW, TARGET, hex_address, mock_sources, open_market, warp


def test_lifecycle_and_primary_reads(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT)
    assert contract.get_supported_assets() == ["SPYUSDT", "QQQUSDT", "EWYUSDT", "EWJUSDT"]
    config = contract.get_config()
    assert config["sides"] == ["UP", "DOWN"]
    assert config["source_directions"] == ["UP", "DOWN", "NON_DIRECTIONAL"]

    market_id = open_market(direct_vm, contract, direct_alice)
    assert market_id == 0
    assert contract.get_market_by_asset_day("spyusdt", TARGET)["asset"] == "SPYUSDT"
    assert contract.get_market_state(0)["state"] == "OPEN"

    direct_vm.sender, direct_vm.value = direct_alice, GEN
    contract.stake(0, "UP")
    wallet = hex_address(direct_alice)
    assert contract.get_position(0, wallet)["stake"] == GEN
    assert contract.get_user_market(0, wallet)["remaining_capacity"] == 9 * GEN

    warp(direct_vm, "2026-08-26T00:00:00Z")
    assert contract.get_market_state(0)["state"] == "LOCKED"
    with direct_vm.expect_revert("market is locked"):
        contract.stake(0, "UP")

    warp(direct_vm, "2026-08-27T00:00:00Z")
    assert contract.get_market_state(0)["state"] == "READY_TO_SETTLE"
    summary = contract.get_market_summary(0)
    assert summary["settlement_ready"] is True
    assert summary["up_pool"] == GEN and summary["total_pool"] == GEN

    mock_sources(direct_vm)
    direct_vm.sender = direct_alice
    assert contract.settle_market(0) == "SETTLED"
    summary = contract.get_market_summary(0)
    assert summary["market_state"] == "SETTLED"
    assert summary["settled"] is True and summary["inconclusive"] is False
    evidence = contract.get_settlement_evidence(0)
    assert evidence["binance"]["direction"] == "UP"
    assert evidence["bitget"]["direction"] == "UP"
    assert evidence["consensus_direction"] == "UP"
    assert evidence["final_status"] == "SETTLED"

    with direct_vm.expect_revert("already finalized"):
        contract.settle_market(0)


def test_creation_rules_and_duplicate_identity(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT)
    warp(direct_vm, NOW)
    direct_vm.sender = direct_alice
    for bad_asset in ("BTCUSDT", "SPY", "", "SPYUSDT/QQQUSDT"):
        with direct_vm.expect_revert("unsupported asset"):
            contract.create_market(bad_asset, TARGET)
    for bad_day in ("2026-8-26", "2026/08/26", "2026-02-29"):
        with direct_vm.expect_revert("target day"):
            contract.create_market("SPYUSDT", bad_day)
    with direct_vm.expect_revert("future"):
        contract.create_market("SPYUSDT", "2026-08-20")
    contract.create_market("SPYUSDT", TARGET)
    with direct_vm.expect_revert("duplicate market"):
        contract.create_market("spyusdt", TARGET)


def test_read_pagination_uses_bounded_raw_continuations(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy(CONTRACT)
    for index, day in enumerate(("2026-08-26", "2026-08-27", "2026-08-28")):
        open_market(direct_vm, contract, direct_alice, target_day=day)
        direct_vm.sender, direct_vm.value = direct_alice, GEN
        contract.stake(index, "UP")
    page0 = contract.get_markets(0, 2)
    page1 = contract.get_markets(page0["next_offset"], 2)
    assert page0["has_more"] is True and page0["next_offset"] == 2
    assert [item["market_id"] for item in page1["markets"]] == [2]
    assert page1["has_more"] is False

    open_page = contract.get_open_markets(0, 1)
    assert len(open_page["markets"]) == 1
    assert open_page["next_offset"] == 1
    user_page = contract.get_user_positions(hex_address(direct_alice), 0, 2)
    assert user_page["total"] == 3 and user_page["has_more"] is True
    assert user_page["next_offset"] == 2
    claims = contract.get_claimable_markets(hex_address(direct_bob), 0, 5)
    assert claims["claims"] == [] and claims["next_offset"] == 0


def test_ready_market_filter_continues_over_sparse_ids(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT)
    open_market(direct_vm, contract, direct_alice, target_day="2026-08-26")
    open_market(direct_vm, contract, direct_alice, target_day="2026-08-29")
    warp(direct_vm, "2026-08-27T00:00:00Z")
    first = contract.get_ready_to_settle_markets(0, 1)
    assert [item["market_id"] for item in first["markets"]] == [0]
    assert first["next_offset"] == 1 and first["has_more"] is True
    second = contract.get_ready_to_settle_markets(first["next_offset"], 1)
    assert second["markets"] == []
    assert second["next_offset"] == 2 and second["has_more"] is False
