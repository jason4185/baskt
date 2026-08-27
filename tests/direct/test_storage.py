from conftest import CONTRACT, GEN, hex_address, open_market


def test_storage_pickling_is_enabled_and_fixed_records_round_trip(
    direct_vm, direct_deploy, direct_alice
):
    assert direct_vm.check_pickling is True
    contract = direct_deploy(CONTRACT)
    open_market(direct_vm, contract, direct_alice)
    direct_vm.sender, direct_vm.value = direct_alice, GEN
    contract.stake(0, "UP")
    market = contract.get_market(0)
    position = contract.get_position(0, hex_address(direct_alice))
    assert market["total_pool"] == GEN
    assert position["stake"] == GEN
