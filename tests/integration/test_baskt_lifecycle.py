import os

import pytest


pytestmark = pytest.mark.slow


@pytest.mark.skipif(
    os.environ.get("BASKT_RUN_INTEGRATION") != "1",
    reason="set BASKT_RUN_INTEGRATION=1 for a configured GenLayer environment",
)
def test_baskt_deploy_and_read_surface():
    from gltest import get_contract_factory, get_gl_client
    from gltest.assertions import tx_execution_succeeded
    from genlayer_py.types import TransactionStatus

    factory = get_contract_factory("Baskt")
    contract = factory.deploy(args=[])
    client = get_gl_client()
    assert contract.address is not None
    assert client.read_contract(contract.address, "get_supported_assets", args=[]) == [
        "SPYUSDT", "QQQUSDT", "EWYUSDT", "EWJUSDT"
    ]
    tx_hash = client.write_contract(
        contract.address, "create_market", args=["SPYUSDT", "2026-09-01"]
    )
    receipt = client.wait_for_transaction_receipt(
        transaction_hash=tx_hash,
        status=TransactionStatus.FINALIZED,
    )
    assert tx_execution_succeeded(receipt)
    market = client.read_contract(contract.address, "get_market", args=[0])
    assert market["asset"] == "SPYUSDT"
    assert market["market_state"] == "OPEN"
