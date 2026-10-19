"""One tiny StudioNet deploy/write/finalized-read check for the pinned runner."""
from gltest import get_contract_factory, get_default_account
from gltest.assertions import tx_execution_succeeded
from gltest.types import TransactionHashVariant, TransactionStatus
from gltest.utils import extract_contract_address


def summarize(label: str, receipt: dict) -> None:
    leader = receipt.get("consensus_data", {}).get("leader_receipt", [{}])[0]
    print(label, {
        "hash": receipt.get("hash"),
        "status": receipt.get("status_name", receipt.get("status")),
        "leader_execution": leader.get("execution_result"),
    })


def test_pinned_runner_deploy_write_read() -> None:
    account = get_default_account()
    factory = get_contract_factory(contract_file_path="contracts/runner_probe.py")
    deployment = factory.deploy_contract_tx(
        account=account,
        wait_transaction_status=TransactionStatus.FINALIZED,
        wait_interval=10000,
        wait_retries=90,
    )
    summarize("probe_deploy", deployment)
    assert deployment.get("status_name") == "FINALIZED"
    assert tx_execution_succeeded(deployment)
    address = extract_contract_address(deployment)
    print("probe_contract", address)
    contract = factory.build_contract(contract_address=address, account=account)
    assert contract.get_count().call(transaction_hash_variant=TransactionHashVariant.LATEST_FINAL) == 1
    write = contract.bump().transact(
        wait_transaction_status=TransactionStatus.FINALIZED,
        wait_interval=10000,
        wait_retries=90,
    )
    summarize("probe_write", write)
    assert write.get("status_name") == "FINALIZED"
    assert tx_execution_succeeded(write)
    assert contract.get_count().call(transaction_hash_variant=TransactionHashVariant.LATEST_FINAL) == 2
