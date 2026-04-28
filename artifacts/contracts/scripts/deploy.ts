import hre, { ethers, network } from "hardhat";
import type { ContractTransactionResponse, ContractTransactionReceipt } from "ethers";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// ── Constants ─────────────────────────────────────────────

const ENTRYPOINT_V07 = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

const MONAD_CHAIN_ID = 10143;

// Fee split — 70% protocol treasury, 30% liquidity pool
const TREASURY_BPS = 7000;

// Move-in fee — 0.001 MON in wei
const MOVE_IN_FEE = ethers.parseEther("0.001");

// Launch lockers — deployed immediately after factory
// [capacity, tier, moveInFee]
const LAUNCH_LOCKERS: [number, string, bigint][] = [
  [20000, "public",   MOVE_IN_FEE],
  [20000, "public",   MOVE_IN_FEE],
  [1000,  "standard", ethers.parseEther("0.003")],
  [100,   "vip",      ethers.parseEther("0.01")],
  [50,    "vip",      ethers.parseEther("0.01")],
];

// ── Types ─────────────────────────────────────────────────

interface DeployedAddresses {
  network:                 string;
  chainId:                 number;
  deployedAt:              string;
  deployer:                string;
  entryPoint:              string;
  oracleVerifier:          string;
  vaultFactory:            string;
  treasurySplitter:        string;
  lockerTreasurySplitter:  string;
  lockerBlueprint:         string;
  lockerFactory:           string;
  lockers:                 LockerRecord[];
}

interface LockerRecord {
  id:       number;
  address:  string;
  capacity: number;
  tier:     string;
}

// ── Helpers ───────────────────────────────────────────────

function log(msg: string) {
  console.log(`  ${msg}`);
}

function section(title: string) {
  const pad = Math.max(0, 48 - title.length);
  console.log(`\n── ${title} ${"─".repeat(pad)}`);
}

async function waitConfirmed(
  tx: ContractTransactionResponse,
  label: string
): Promise<ContractTransactionReceipt> {
  log(`${label}... tx: ${tx.hash}`);
  const receipt = await tx.wait(1);
  if (!receipt || receipt.status !== 1) {
    throw new Error(`${label} failed — tx: ${tx.hash}`);
  }
  return receipt;
}

// ── Validation ────────────────────────────────────────────

function validateEnv(networkName: string) {
  // Local Hardhat network provides its own funded accounts — no key needed
  const isLocal = networkName === "hardhat" || networkName === "localhost";
  if (isLocal) return;

  const missing: string[] = [];
  if (!process.env.DEPLOYER_PRIVATE_KEY) missing.push("DEPLOYER_PRIVATE_KEY");
  if (missing.length > 0) {
    console.error(`\nMissing required env vars: ${missing.join(", ")}`);
    console.error("Copy .env.example to .env and fill in your values.\n");
    process.exit(1);
  }
}

// ── Main ──────────────────────────────────────────────────

async function main() {
  validateEnv(network.name);

  const [deployer] = await ethers.getSigners();
  const chainInfo  = await ethers.provider.getNetwork();
  const balance    = await ethers.provider.getBalance(deployer.address);

  console.log("\n╔═══════════════════════════════════════════════════╗");
  console.log("║       MonaSol Protocol — Deployment Script        ║");
  console.log("╚═══════════════════════════════════════════════════╝");
  console.log(`  Deployer : ${deployer.address}`);
  console.log(`  Balance  : ${ethers.formatEther(balance)} MON`);
  console.log(`  Network  : ${network.name} (chainId: ${chainInfo.chainId})`);

  if (chainInfo.chainId === BigInt(MONAD_CHAIN_ID) && balance < ethers.parseEther("0.1")) {
    console.error("\n  Balance too low. Fund deployer with testnet MON first.");
    process.exit(1);
  }

  // Guardian wallet — oracle signer
  // Falls back to deployer if ORACLE_SIGNER_ADDRESS not set
  const guardianAddress = process.env.ORACLE_SIGNER_ADDRESS ?? deployer.address;
  log(`Guardian  : ${guardianAddress}`);

  // Treasury and pool — use deployer for testnet
  // Replace with Safe addresses on mainnet
  const treasuryAddress = deployer.address;
  const poolAddress     = deployer.address;

  const addresses: Partial<DeployedAddresses> = {
    network:    network.name,
    chainId:    Number(chainInfo.chainId),
    deployedAt: new Date().toISOString(),
    deployer:   deployer.address,
    entryPoint: ENTRYPOINT_V07,
    lockers:    [],
  };

  // ── Step 1: OracleVerifier ───────────────────────────────
  section("Step 1 — OracleVerifier");

  const OracleVerifierFactory = await ethers.getContractFactory("OracleVerifier");
  const oracle = await OracleVerifierFactory.deploy(
    deployer.address,       // owner — replace with Safe on mainnet
    [guardianAddress],      // guardians — add more before mainnet
    1                       // threshold — raise to 2+ before mainnet
  );
  await oracle.waitForDeployment();
  addresses.oracleVerifier = await oracle.getAddress();
  log(`OracleVerifier deployed at: ${addresses.oracleVerifier}`);

  // ── Step 2: VaultFactory ────────────────────────────────
  section("Step 2 — VaultFactory");

  const VaultFactoryContract = await ethers.getContractFactory("VaultFactory");
  const vaultFactory = await VaultFactoryContract.deploy(
    ENTRYPOINT_V07,
    deployer.address        // owner — replace with Safe on mainnet
  );
  await vaultFactory.waitForDeployment();
  addresses.vaultFactory = await vaultFactory.getAddress();
  log(`VaultFactory deployed at: ${addresses.vaultFactory}`);

  // Authorize deployer as a vault deployer
  const authTx = await vaultFactory.authorizeCaller(deployer.address);
  await waitConfirmed(authTx, "Authorize deployer as vault caller");

  // ── Step 3: TreasurySplitter ────────────────────────────
  section("Step 3 — TreasurySplitter");

  const TreasurySplitterFactory = await ethers.getContractFactory("TreasurySplitter");
  const treasurySplitter = await TreasurySplitterFactory.deploy(
    deployer.address,   // protocol owner
    treasuryAddress,    // treasury wallet
    poolAddress,        // liquidity pool wallet
    TREASURY_BPS        // 70% to treasury
  );
  await treasurySplitter.waitForDeployment();
  addresses.treasurySplitter = await treasurySplitter.getAddress();
  log(`TreasurySplitter deployed at: ${addresses.treasurySplitter}`);

  // ── Step 4: Locker blueprint + LockerFactory (Vyper) ────
  section("Step 4 — Locker blueprint + LockerFactory (Vyper)");

  // Load Vyper artifacts — no TypeChain types for Vyper,
  // use raw ABI + bytecode from Hardhat artifact store
  const LockerArtifact        = await hre.artifacts.readArtifact("Locker");
  const LockerFactoryArtifact = await hre.artifacts.readArtifact("LockerFactory");
  const LockerTSArtifact      = await hre.artifacts.readArtifact("LockerTreasurySplitter");

  // Deploy LockerTreasurySplitter (Vyper) — used by Locker contracts
  // Distinct from TreasurySplitter.sol which handles Vault-side fees
  const LockerTSFactory = new ethers.ContractFactory(
    LockerTSArtifact.abi,
    LockerTSArtifact.bytecode,
    deployer
  );
  const lockerTS = await LockerTSFactory.deploy(
    deployer.address,   // protocol owner
    treasuryAddress,    // treasury wallet
    poolAddress,        // liquidity pool
    TREASURY_BPS        // 70% to treasury
  );
  await lockerTS.waitForDeployment();
  const lockerTSAddress           = await lockerTS.getAddress();
  addresses.lockerTreasurySplitter = lockerTSAddress;
  log(`LockerTreasurySplitter deployed at: ${lockerTSAddress}`);

  // Deploy Locker blueprint — this is the implementation contract
  // LockerFactory clones it for each new locker via create_from_blueprint
  const LockerImplFactory = new ethers.ContractFactory(
    LockerArtifact.abi,
    LockerArtifact.bytecode,
    deployer
  );

  // Blueprint deployment: Vyper blueprints use ERC-5202 prefix
  // The blueprint is deployed with a special initcode that marks it
  // as a blueprint — LockerFactory's create_from_blueprint reads from it
  // We deploy the raw contract; Vyper's create_from_blueprint handles
  // the blueprint prefix internally when called from LockerFactory
  const lockerImpl = await LockerImplFactory.deploy(
    0,                  // locker_id placeholder — overridden by blueprint clone
    1,                  // capacity placeholder — overridden by blueprint clone
    "blueprint",        // tier placeholder
    deployer.address,   // protocol placeholder
    lockerTSAddress,    // treasury_splitter
    MOVE_IN_FEE         // move_in_fee placeholder
  );
  await lockerImpl.waitForDeployment();
  addresses.lockerBlueprint = await lockerImpl.getAddress();
  log(`Locker blueprint deployed at: ${addresses.lockerBlueprint}`);

  // Deploy LockerFactory — takes blueprint address
  const LockerFactoryContractFactory = new ethers.ContractFactory(
    LockerFactoryArtifact.abi,
    LockerFactoryArtifact.bytecode,
    deployer
  );
  const lockerFactory = await LockerFactoryContractFactory.deploy(
    deployer.address,           // protocol
    lockerTSAddress,            // treasury_splitter
    addresses.lockerBlueprint   // locker_blueprint
  );
  await lockerFactory.waitForDeployment();
  addresses.lockerFactory = await lockerFactory.getAddress();
  log(`LockerFactory deployed at: ${addresses.lockerFactory}`);

  // Deploy launch lockers via LockerFactory
  log("Deploying launch lockers...");
  const deployLockerFn = lockerFactory.getFunction("deploy_locker");

  for (const [capacity, tier, fee] of LAUNCH_LOCKERS) {
    const tx      = await deployLockerFn(capacity, tier, fee);
    const receipt = await waitConfirmed(tx, `Locker ${tier} cap=${capacity}`);

    // Parse LockerDeployed event to get the deployed address
    const iface               = new ethers.Interface(LockerFactoryArtifact.abi);
    const lockerDeployedTopic = iface.getEvent("LockerDeployed")?.topicHash;

    const deployedLog = receipt.logs.find(
      l => l.topics[0] === lockerDeployedTopic
    );

    if (deployedLog) {
      const parsed    = iface.parseLog({
        topics: [...deployedLog.topics],
        data:   deployedLog.data,
      });
      const lockerAddr = parsed?.args.locker_address as string;
      const lockerId   = Number(parsed?.args.locker_id);
      addresses.lockers!.push({ id: lockerId, address: lockerAddr, capacity, tier });
      log(`  Locker ${lockerId} (${tier} cap=${capacity}): ${lockerAddr}`);
    }
  }

  // ── Step 5: Verify EntryPoint ────────────────────────────
  section("Step 5 — EntryPoint verification");

  const epCode = await ethers.provider.getCode(ENTRYPOINT_V07);
  if (epCode === "0x") {
    log("WARNING: EntryPoint not found at expected address");
    log("         Running on local Hardhat — this is expected");
    log("         On Monad testnet this address is confirmed live");
  } else {
    log(`EntryPoint v0.7 confirmed live at: ${ENTRYPOINT_V07}`);
    log(`Bytecode length: ${(epCode.length - 2) / 2} bytes`);
  }

  // ── Summary ──────────────────────────────────────────────
  console.log("\n╔═══════════════════════════════════════════════════╗");
  console.log("║              DEPLOYMENT COMPLETE                  ║");
  console.log("╚═══════════════════════════════════════════════════╝");
  console.log(`  OracleVerifier         : ${addresses.oracleVerifier}`);
  console.log(`  VaultFactory           : ${addresses.vaultFactory}`);
  console.log(`  TreasurySplitter       : ${addresses.treasurySplitter}`);
  console.log(`  LockerTreasurySplitter : ${addresses.lockerTreasurySplitter}`);
  console.log(`  Locker blueprint       : ${addresses.lockerBlueprint}`);
  console.log(`  LockerFactory          : ${addresses.lockerFactory}`);
  console.log(`  EntryPoint             : ${addresses.entryPoint}`);

  // ── Write addresses file ─────────────────────────────────
  const outDir  = join(__dirname, "..", "deployed");
  const outFile = join(outDir, `${network.name}-addresses.json`);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(outFile, JSON.stringify(addresses, null, 2));

  console.log(`\n  Addresses saved to: ${outFile}`);
  console.log("  Your backend reads this file to know contract locations.\n");
}

main().catch((err) => {
  console.error("\nDeploy failed:", err.message ?? err);
  process.exit(1);
});
