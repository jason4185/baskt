from conftest import CONTRACT, GEN, hex_address, open_market, settle


def test_stake_bounds_side_lock_and_rejected_write_has_no_mutation(
    direct_vm, direct_deploy, direct_alice
):
    contract = direct_deploy(CONTRACT)
    open_market(direct_vm, contract, direct_alice)
    direct_vm.sender = direct_alice

    direct_vm.value = GEN - 1
    with direct_vm.expect_revert("minimum stake"):
        contract.stake(0, "UP")
    assert contract.get_market(0)["total_pool"] == 0

    direct_vm.value = GEN
    with direct_vm.expect_revert("invalid side"):
        contract.stake(0, "FLAT")
    assert contract.get_position(0, hex_address(direct_alice))["stake"] == 0

    direct_vm.value = 7 * GEN
    contract.stake(0, "UP")
    direct_vm.value = 4 * GEN
    with direct_vm.expect_revert("maximum cumulative stake"):
        contract.stake(0, "UP")
    position = contract.get_position(0, hex_address(direct_alice))
    assert position["stake"] == 7 * GEN
    assert contract.get_market(0)["total_pool"] == 7 * GEN

    direct_vm.value = GEN
    with direct_vm.expect_revert("cannot switch sides"):
        contract.stake(0, "DOWN")
    assert contract.get_market(0)["up_pool"] == 7 * GEN
    assert contract.get_market(0)["down_pool"] == 0

    direct_vm.value = 3 * GEN
    contract.stake(0, "UP")
    assert contract.get_remaining_position_capacity(0, hex_address(direct_alice)) == 0


def test_parimutuel_claims_round_down_and_conserve_pool(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    contract = direct_deploy(CONTRACT)
    open_market(direct_vm, contract, direct_alice)
    direct_vm.sender, direct_vm.value = direct_alice, GEN
    contract.stake(0, "UP")
    direct_vm.sender, direct_vm.value = direct_bob, 2 * GEN
    contract.stake(0, "UP")
    direct_vm.sender, direct_vm.value = direct_charlie, 7 * GEN
    contract.stake(0, "DOWN")

    assert settle(direct_vm, contract, direct_alice) == "SETTLED"
    direct_vm.sender = direct_alice
    alice = contract.claim(0)
    direct_vm.sender = direct_bob
    bob = contract.claim(0)
    expected_alice = 10 * GEN * GEN // (3 * GEN)
    expected_bob = 10 * GEN * (2 * GEN) // (3 * GEN)
    assert alice == expected_alice and bob == expected_bob
    assert contract.get_market(0)["paid_out"] == alice + bob
    assert contract.get_market(0)["paid_out"] <= 10 * GEN
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("position did not win"):
        contract.claim(0)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("nothing claimable"):
        contract.claim(0)


def test_inconclusive_refund_and_zero_winning_side_refund(
    direct_vm, direct_deploy, direct_alice
):
    contract = direct_deploy(CONTRACT)
    open_market(direct_vm, contract, direct_alice)
    direct_vm.sender, direct_vm.value = direct_alice, GEN
    contract.stake(0, "DOWN")
    result = settle(
        direct_vm, contract, direct_alice,
        binance_open="100", binance_close="101",
        bitget_open="100", bitget_close="102",
    )
    assert result == "SETTLED"
    summary = contract.get_market_summary(0)
    assert summary["winning_side"] == "UP" and summary["refund_all"] is True
    assert contract.get_claimable(0, hex_address(direct_alice)) == GEN
    assert contract.get_user_market(0, hex_address(direct_alice))["claim_type"] == "REFUND"
    assert contract.claim(0) == GEN

    open_market(direct_vm, contract, direct_alice, asset="QQQUSDT", target_day="2026-08-28")
    direct_vm.sender, direct_vm.value = direct_alice, GEN
    contract.stake(1, "UP")
    assert settle(
        direct_vm, contract, direct_alice,
        target_day="2026-08-28", market_id=1,
        binance_open="100", binance_close="101",
        bitget_open="100", bitget_close="100",
    ) == "INCONCLUSIVE"
    assert contract.get_market(1)["refund_all"] is True
    assert contract.claim(1) == GEN


def test_address_normalization_is_consistent_for_reads(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT)
    open_market(direct_vm, contract, direct_alice)
    direct_vm.sender, direct_vm.value = direct_alice, GEN
    contract.stake(0, "UP")
    wallet = hex_address(direct_alice)
    alternate = wallet.upper()
    assert contract.get_position(0, wallet)["stake"] == GEN
    assert contract.get_position(0, alternate)["stake"] == GEN
    assert contract.get_remaining_position_capacity(0, alternate) == 9 * GEN
    assert contract.get_user_positions(alternate, 0, 10)["total"] == 1
