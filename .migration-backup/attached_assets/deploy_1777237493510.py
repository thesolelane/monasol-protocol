"""
MonaSol Protocol — Deployment Script
Deploys to Monad testnet in this exact order:
  1. TreasurySplitter
  2. Locker blueprint  (compiled Locker, registered as blueprint)
  3. LockerFactory
  4. Authorize backend deployer wallet
  5. Deploy launch lockers

Run:
  python scripts/deploy.py

Requirements in .env:
  DEPLOYER_PRIVATE_KEY   — protocol owner wallet private key
  BACKEND_WALLET         — address your backend server signs with
  TREASURY_WALLET        — address that receives protocol share of fees
  LIQUIDITY_POOL_WALLET  — address that receives pool share of fees
  MONAD_TESTNET_RPC      — Monad testnet RPC URL
"""

import json
import os
import sys
from pathlib import Path
from dotenv import load_dotenv
from web3 import Web3

load_dotenv()

# ── Config ────────────────────────────────────────────────

RPC_URL            = os.getenv("MONAD_TESTNET_RPC", "https://testnet-rpc.monad.xyz")
DEPLOYER_KEY       = os.getenv("DEPLOYER_PRIVATE_KEY")
BACKEND_WALLET     = os.getenv("BACKEND_WALLET")
TREASURY_WALLET    = os.getenv("TREASURY_WALLET")
LIQUIDITY_POOL     = os.getenv("LIQUIDITY_POOL_WALLET")

# Fee split — 70% protocol treasury, 30% liquidity pool
TREASURY_BPS       = 7000

# Move-in fee in wei. 0.001 MON = 1_000_000_000_000_000 wei
DEFAULT_MOVE_IN_FEE = Web3.to_wei(0.001, "ether")

# Launch lockers — deployed immediately after factory
# (capacity, tier, move_in_fee_wei)
LAUNCH_LOCKERS = [
    (20000, "public",    DEFAULT_MOVE_IN_FEE),
    (20000, "public",    DEFAULT_MOVE_IN_FEE),
    (1000,  "standard",  Web3.to_wei(0.003, "ether")),
    (100,   "vip",       Web3.to_wei(0.01,  "ether")),
    (50,    "vip",       Web3.to_wei(0.01,  "ether")),
]

# ── Helpers ───────────────────────────────────────────────

ROOT = Path(__file__).parent.parent

def load_artifact(name: str):
    abi      = json.loads((ROOT / "abi"      / f"{name}.json").read_text())
    bytecode = (ROOT / "bytecode" / f"{name}.bin").read_text().strip()
    if not bytecode.startswith("0x"):
        bytecode = "0x" + bytecode
    return abi, bytecode

def deploy(w3: Web3, account, abi, bytecode, *args, label=""):
    contract = w3.eth.contract(abi=abi, bytecode=bytecode)
    tx = contract.constructor(*args).build_transaction({
        "from":     account.address,
        "nonce":    w3.eth.get_transaction_count(account.address),
        "gas":      3_000_000,
        "gasPrice": w3.eth.gas_price,
    })
    signed = account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    print(f"  Deploying {label}... tx: {tx_hash.hex()}")
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
    assert receipt.status == 1, f"{label} deployment failed"
    print(f"  {label} deployed at: {receipt.contractAddress}")
    return receipt.contractAddress

def send_tx(w3: Web3, account, contract, fn_name, *args, label=""):
    fn = getattr(contract.functions, fn_name)
    tx = fn(*args).build_transaction({
        "from":     account.address,
        "nonce":    w3.eth.get_transaction_count(account.address),
        "gas":      500_000,
        "gasPrice": w3.eth.gas_price,
    })
    signed = account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    print(f"  {label}... tx: {tx_hash.hex()}")
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
    assert receipt.status == 1, f"{label} failed"
    return receipt

# ── Validation ────────────────────────────────────────────

def validate_env():
    missing = []
    for var in ["DEPLOYER_PRIVATE_KEY", "BACKEND_WALLET",
                "TREASURY_WALLET", "LIQUIDITY_POOL_WALLET"]:
        if not os.getenv(var):
            missing.append(var)
    if missing:
        print(f"Missing env vars: {', '.join(missing)}")
        print("Copy .env.example to .env and fill in your values.")
        sys.exit(1)

# ── Main ──────────────────────────────────────────────────

def main():
    validate_env()

    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    if not w3.is_connected():
        print(f"Cannot connect to {RPC_URL}")
        sys.exit(1)

    account = w3.eth.account.from_key(DEPLOYER_KEY)
    balance = w3.eth.get_balance(account.address)
    print(f"\nDeployer:  {account.address}")
    print(f"Balance:   {Web3.from_wei(balance, 'ether')} MON")
    print(f"Network:   chain_id={w3.eth.chain_id}\n")

    if balance < Web3.to_wei(0.1, "ether"):
        print("Deployer balance too low. Fund with testnet MON first.")
        sys.exit(1)

    deployed = {}

    # 1. TreasurySplitter
    print("Step 1 — TreasurySplitter")
    abi, bytecode = load_artifact("TreasurySplitter")
    deployed["TreasurySplitter"] = deploy(
        w3, account, abi, bytecode,
        account.address,   # protocol (deployer is protocol owner)
        TREASURY_WALLET,
        LIQUIDITY_POOL,
        TREASURY_BPS,
        label="TreasurySplitter"
    )

    # 2. Locker blueprint
    # Vyper blueprints are prefixed with ERC-5202 preamble (0xFE7100...)
    # We deploy the raw Locker bytecode as a blueprint.
    print("\nStep 2 — Locker blueprint")
    _, locker_bytecode = load_artifact("Locker")
    # ERC-5202 blueprint prefix
    blueprint_preamble = "0xFE7100"
    blueprint_initcode = (
        blueprint_preamble
        + "61"
        + hex(len(bytes.fromhex(locker_bytecode[2:])))[2:].zfill(4)
        + "3d81600a3d39f3"
        + locker_bytecode[2:]
    )
    tx = {
        "from":     account.address,
        "nonce":    w3.eth.get_transaction_count(account.address),
        "gas":      3_000_000,
        "gasPrice": w3.eth.gas_price,
        "data":     locker_bytecode,   # deploy raw — factory uses create_from_blueprint
    }
    signed = account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    print(f"  Deploying Locker blueprint... tx: {tx_hash.hex()}")
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
    assert receipt.status == 1, "Locker blueprint deployment failed"
    deployed["LockerBlueprint"] = receipt.contractAddress
    print(f"  Locker blueprint at: {receipt.contractAddress}")

    # 3. LockerFactory
    print("\nStep 3 — LockerFactory")
    abi, bytecode = load_artifact("LockerFactory")
    deployed["LockerFactory"] = deploy(
        w3, account, abi, bytecode,
        account.address,                  # protocol
        deployed["TreasurySplitter"],
        deployed["LockerBlueprint"],
        label="LockerFactory"
    )

    # 4. Authorize backend wallet
    print("\nStep 4 — Authorize backend deployer")
    factory_abi, _ = load_artifact("LockerFactory")
    factory = w3.eth.contract(
        address=deployed["LockerFactory"],
        abi=factory_abi
    )
    send_tx(
        w3, account, factory,
        "authorize_deployer",
        Web3.to_checksum_address(BACKEND_WALLET),
        label=f"Authorize {BACKEND_WALLET}"
    )

    # 5. Deploy launch lockers
    print("\nStep 5 — Launch lockers")
    locker_addresses = []
    for capacity, tier, fee in LAUNCH_LOCKERS:
        receipt = send_tx(
            w3, account, factory,
            "deploy_locker",
            capacity, tier, fee,
            label=f"Locker {tier} cap={capacity}"
        )
        # Parse LockerDeployed event to get address
        logs = factory.events.LockerDeployed().process_receipt(receipt)
        if logs:
            locker_addr = logs[0]["args"]["locker_address"]
            locker_addresses.append(locker_addr)
            print(f"    Locker address: {locker_addr}")

    # ── Summary ───────────────────────────────────────────
    print("\n" + "="*55)
    print("DEPLOYMENT COMPLETE")
    print("="*55)
    print(f"TreasurySplitter : {deployed['TreasurySplitter']}")
    print(f"Locker blueprint : {deployed['LockerBlueprint']}")
    print(f"LockerFactory    : {deployed['LockerFactory']}")
    for i, addr in enumerate(locker_addresses):
        cap, tier, _ = LAUNCH_LOCKERS[i]
        print(f"Locker {i} ({tier:8s} cap={cap:6d}) : {addr}")
    print("="*55)

    # Save addresses to file for backend to read
    output = {
        "chain_id":          w3.eth.chain_id,
        "protocol_owner":    account.address,
        "treasury_splitter": deployed["TreasurySplitter"],
        "locker_blueprint":  deployed["LockerBlueprint"],
        "locker_factory":    deployed["LockerFactory"],
        "lockers":           locker_addresses,
    }
    out_path = ROOT / "deployed_addresses.json"
    out_path.write_text(json.dumps(output, indent=2))
    print(f"\nAddresses saved to: {out_path}")


if __name__ == "__main__":
    main()
