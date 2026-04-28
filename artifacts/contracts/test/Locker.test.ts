import hre, { ethers } from "hardhat";
import { expect } from "chai";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { ContractFactory } from "ethers";

// ── Constants (mirror deploy.ts) ──────────────────────────
const TREASURY_BPS = 7000;
const MOVE_IN_FEE  = ethers.parseEther("0.001");

// ── Blueprint helper (identical to deploy.ts) ─────────────
//
// Transaction data layout when sent as initcode:
//   [ 10-byte preamble ][ 0xFE7100 ][ original bytecode ]
//
// PUSH2 payloadLen / RETURNDATASIZE / DUP2 / PUSH1 0x0a /
// RETURNDATASIZE / CODECOPY / RETURN
// → EVM stores exactly 0xFE7100 + original_bytecode
// → LockerFactory.deploy_locker uses create_from_blueprint(code_offset=3)
function _buildBlueprintBytecode(bytecode: string): string {
  const stripped   = bytecode.startsWith("0x") ? bytecode.slice(2) : bytecode;
  const payloadLen = 3 + stripped.length / 2;
  const lenHex     = payloadLen.toString(16).padStart(4, "0");
  const preamble   = `61${lenHex}3d81600a3d39f3`;
  return `0x${preamble}fe7100${stripped}`;
}

// ── Suite ─────────────────────────────────────────────────
describe("LockerFactory — blueprint clone", () => {
  let deployer: SignerWithAddress;

  before(async () => {
    [deployer] = await ethers.getSigners();
  });

  it("deploy_locker creates a working Locker clone", async () => {
    // ── Load Vyper artifacts ────────────────────────────────
    const LockerArtifact        = await hre.artifacts.readArtifact("Locker");
    const LockerFactoryArtifact = await hre.artifacts.readArtifact("LockerFactory");
    const LockerTSArtifact      = await hre.artifacts.readArtifact("LockerTreasurySplitter");

    // ── Deploy LockerTreasurySplitter ───────────────────────
    const LockerTSFactory = new ContractFactory(
      LockerTSArtifact.abi,
      LockerTSArtifact.bytecode,
      deployer
    );
    const lockerTS = await LockerTSFactory.deploy(
      deployer.address,  // _protocol
      deployer.address,  // _treasury
      deployer.address,  // _liquidity_pool
      TREASURY_BPS       // _treasury_bps
    );
    await lockerTS.waitForDeployment();
    const lockerTSAddress = await lockerTS.getAddress();

    // ── Deploy Locker as ERC-5202 blueprint ─────────────────
    const LockerImplFactory = new ContractFactory(
      [],
      _buildBlueprintBytecode(LockerArtifact.bytecode),
      deployer
    );
    const lockerBlueprintContract = await LockerImplFactory.deploy();
    await lockerBlueprintContract.waitForDeployment();
    const blueprintAddress = await lockerBlueprintContract.getAddress();

    // Sanity-check: stored code starts with ERC-5202 marker 0xFE
    const blueprintCode = await ethers.provider.getCode(blueprintAddress);
    expect(blueprintCode.slice(0, 4)).to.equal("0xfe",
      "blueprint stored code must start with 0xFE (ERC-5202 marker)");

    // ── Deploy LockerFactory ────────────────────────────────
    const LockerFactoryContractFactory = new ContractFactory(
      LockerFactoryArtifact.abi,
      LockerFactoryArtifact.bytecode,
      deployer
    );
    const lockerFactoryDeployment = await LockerFactoryContractFactory.deploy(
      deployer.address,  // _protocol
      lockerTSAddress,   // _treasury_splitter
      blueprintAddress   // _locker_blueprint
    );
    await lockerFactoryDeployment.waitForDeployment();
    const factoryAddress = await lockerFactoryDeployment.getAddress();

    // Attach with ABI so Vyper method names are callable (no TypeChain for Vyper)
    const lockerFactory = new ethers.Contract(
      factoryAddress, LockerFactoryArtifact.abi, deployer
    );

    // Authorize deployer so deploy_locker doesn't revert
    await lockerFactory.authorize_deployer(deployer.address);

    // ── Call deploy_locker ──────────────────────────────────
    const capacity = 100n;
    const tx       = await lockerFactory.deploy_locker(capacity, "public", MOVE_IN_FEE);
    const receipt  = await tx.wait(1);
    expect(receipt?.status).to.equal(1);

    // Extract the cloned locker address from the factory
    const cloneAddress = await lockerFactory.get_locker(0n);

    // ── Confirm address has code ────────────────────────────
    const code = await ethers.provider.getCode(cloneAddress);
    expect(code).to.not.equal("0x", "cloned locker must have deployed bytecode");

    // ── Attach and assert state ─────────────────────────────
    const locker = new ethers.Contract(cloneAddress, LockerArtifact.abi, deployer);

    expect(await locker.capacity()).to.equal(capacity,
      "locker.capacity() must match deploy_locker argument");

    expect(await locker.is_full()).to.equal(false,
      "fresh locker must not be full");

    expect(await locker.available_slots()).to.equal(capacity,
      "available_slots() must equal capacity on a fresh locker");
  });
});
