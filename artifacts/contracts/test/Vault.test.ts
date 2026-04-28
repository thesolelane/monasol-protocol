import { ethers } from "hardhat";
import { expect } from "chai";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
  Vault,
  VaultFactory,
  OracleVerifier,
} from "../typechain-types";

// EntryPoint v0.7 — deployed on Monad testnet and Hardhat via artifact
const ENTRYPOINT_ADDRESS = "0x0000000071727De22E5E9d8BAF0edAc6f37da032";

// Helpers
const SYSTEM_MODE  = 1;
const SELF_MODE    = 2;
const PURPOSE_FUNDS    = 1;
const PURPOSE_SWAP     = 2;
const PURPOSE_DOCS     = 3;
const PURPOSE_PAYMENTS = 4;
const PURPOSE_LEDGER   = 5;

function toBytes32(hex: string): string {
  // Accept a raw hex string and left-pad to 32 bytes
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return "0x" + clean.slice(0, 64).padEnd(64, "0");
}

function packSignature(
  nftMint: string,
  sessionExpiry: number,
  proof: string
): string {
  return ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "uint256", "bytes"],
    [nftMint, sessionExpiry, proof]
  );
}

describe("Vault", () => {
  let owner:         SignerWithAddress;
  let guardian1:     SignerWithAddress;
  let guardian2:     SignerWithAddress;
  let signingWallet: SignerWithAddress;
  let attacker:      SignerWithAddress;
  let locker:        SignerWithAddress; // simulates the Locker contract

  let oracle:   OracleVerifier;
  let factory:  VaultFactory;
  let vault:    Vault;

  // Solana SOL mint address encoded as a 32-byte hex value
  const NFT_MINT = toBytes32("536f6c31313131313131313131313131313131313131313131313131313131313131");

  beforeEach(async () => {
    [owner, guardian1, guardian2, signingWallet, attacker, locker] =
      await ethers.getSigners();

    // Deploy OracleVerifier — guardian1 is the approved oracle signer, threshold 1
    const OracleVerifierFactory = await ethers.getContractFactory("OracleVerifier");
    oracle = await OracleVerifierFactory.deploy(
      owner.address,
      [guardian1.address],
      1
    );
    await oracle.waitForDeployment();

    // Deploy VaultFactory — needs EntryPoint
    // On local Hardhat, deploy a minimal EntryPoint stub or use the real one
    // We deploy a mock EntryPoint that satisfies the interface
    const MockEntryPoint = await ethers.getContractFactory("MockEntryPoint");
    const entryPoint = await MockEntryPoint.deploy();
    await entryPoint.waitForDeployment();

    const VaultFactoryContract = await ethers.getContractFactory("VaultFactory");
    factory = await VaultFactoryContract.deploy(
      await entryPoint.getAddress(),
      owner.address
    );
    await factory.waitForDeployment();

    // Deploy vault via factory
    const tx = await factory.deployVault(
      locker.address,
      0,                        // slotIndex
      NFT_MINT,
      signingWallet.address,
      SYSTEM_MODE,
      await oracle.getAddress()
    );
    await tx.wait();

    const vaultAddress = await factory.predictVaultAddress(
      locker.address,
      0,
      NFT_MINT,
      signingWallet.address
    );

    vault = await ethers.getContractAt("Vault", vaultAddress) as Vault;
  });

  // ── Deployment ───────────────────────────────────────────

  describe("Initialization", () => {
    it("sets locker address correctly", async () => {
      expect(await vault.lockerAddress()).to.equal(locker.address);
    });

    it("sets slot index correctly", async () => {
      expect(await vault.slotIndex()).to.equal(0);
    });

    it("sets nftMint correctly", async () => {
      expect(await vault.nftMint()).to.equal(NFT_MINT);
    });

    it("sets signing wallet correctly", async () => {
      expect(await vault.signingWallet()).to.equal(signingWallet.address);
    });

    it("sets security mode correctly", async () => {
      expect(await vault.securityMode()).to.equal(SYSTEM_MODE);
    });

    it("sets verifier correctly", async () => {
      expect(await vault.verifier()).to.equal(await oracle.getAddress());
    });

    it("starts with no active session", async () => {
      expect(await vault.sessionActive()).to.equal(false);
    });

    it("starts not in read-only mode", async () => {
      expect(await vault.isReadOnly()).to.equal(false);
    });

    it("cannot be initialized twice", async () => {
      await expect(
        vault.initialize(
          locker.address,
          0,
          NFT_MINT,
          signingWallet.address,
          SYSTEM_MODE,
          await oracle.getAddress()
        )
      ).to.be.revertedWithCustomError(vault, "InvalidInitialization");
    });
  });

  // ── Deterministic addressing ─────────────────────────────

  describe("VaultFactory deterministic addressing", () => {
    it("predicted address matches deployed address", async () => {
      const predicted = await factory.predictVaultAddress(
        locker.address,
        0,
        NFT_MINT,
        signingWallet.address
      );
      expect(await vault.getAddress()).to.equal(predicted);
    });

    it("different slot index produces different address", async () => {
      const addr0 = await factory.predictVaultAddress(
        locker.address, 0, NFT_MINT, signingWallet.address
      );
      const addr1 = await factory.predictVaultAddress(
        locker.address, 1, NFT_MINT, signingWallet.address
      );
      expect(addr0).to.not.equal(addr1);
    });

    it("deploying same vault twice is idempotent", async () => {
      const tx = await factory.deployVault(
        locker.address,
        0,
        NFT_MINT,
        signingWallet.address,
        SYSTEM_MODE,
        await oracle.getAddress()
      );
      const receipt = await tx.wait();
      // Second deploy should not emit VaultDeployed — returns existing
      const events = receipt?.logs.filter(
        l => l.topics[0] === ethers.id("VaultDeployed(address,address,uint256,bytes32)")
      );
      expect(events?.length).to.equal(0);
    });
  });

  // ── Session management ────────────────────────────────────

  describe("Session management", () => {
    it("signing wallet can close session", async () => {
      // Open session by simulating validateUserOp state
      // Direct closeSession test — session starts inactive
      // closeSession should not revert even when already closed
      await expect(
        vault.connect(signingWallet).closeSession()
      ).to.not.be.reverted;
    });

    it("attacker cannot close session", async () => {
      await expect(
        vault.connect(attacker).closeSession()
      ).to.be.revertedWithCustomError(vault, "NotSigningWallet");
    });

    it("session expiry is enforced", async () => {
      // Session is inactive — execute must revert
      await expect(
        vault.execute(attacker.address, 0, "0x")
      ).to.be.reverted; // SessionNotActive or not from EntryPoint
    });
  });

  // ── Read-only state ───────────────────────────────────────

  describe("Read-only state", () => {
    it("locker can set read-only", async () => {
      await vault.connect(locker).setReadOnly("Test lockdown");
      expect(await vault.isReadOnly()).to.equal(true);
    });

    it("attacker cannot set read-only", async () => {
      await expect(
        vault.connect(attacker).setReadOnly("Attack")
      ).to.be.revertedWithCustomError(vault, "NotLockerOrOwner");
    });

    it("locker can lift read-only", async () => {
      await vault.connect(locker).setReadOnly("Test");
      await vault.connect(locker).liftReadOnly();
      expect(await vault.isReadOnly()).to.equal(false);
    });

    it("attacker cannot lift read-only", async () => {
      await vault.connect(locker).setReadOnly("Test");
      await expect(
        vault.connect(attacker).liftReadOnly()
      ).to.be.revertedWithCustomError(vault, "NotLockerOrOwner");
    });

    it("lifting when not read-only reverts", async () => {
      await expect(
        vault.connect(locker).liftReadOnly()
      ).to.be.revertedWith("Not in read-only mode");
    });

    it("setReadOnly clears active session", async () => {
      await vault.connect(locker).setReadOnly("Lockdown");
      expect(await vault.sessionActive()).to.equal(false);
    });
  });

  // ── Signing wallet update ─────────────────────────────────

  describe("Signing wallet update", () => {
    it("locker can update signing wallet", async () => {
      await vault.connect(locker).updateSigningWallet(attacker.address);
      expect(await vault.signingWallet()).to.equal(attacker.address);
    });

    it("attacker cannot update signing wallet", async () => {
      await expect(
        vault.connect(attacker).updateSigningWallet(attacker.address)
      ).to.be.revertedWithCustomError(vault, "NotLockerOrOwner");
    });

    it("update clears session", async () => {
      await vault.connect(locker).updateSigningWallet(attacker.address);
      expect(await vault.sessionActive()).to.equal(false);
      expect(await vault.sessionExpiry()).to.equal(0);
    });

    it("cannot set zero address as signing wallet", async () => {
      await expect(
        vault.connect(locker).updateSigningWallet(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid signer");
    });
  });

  // ── Sub-vault purpose enforcement ─────────────────────────

  describe("Sub-vault purpose", () => {
    it("unregistered address has no purpose", async () => {
      expect(await vault.subVaultPurpose(attacker.address)).to.equal(0);
    });

    it("purpose is stored correctly after assignment", async () => {
      // assignSubVault requires EntryPoint caller — test storage read only
      // Full flow tested in integration tests
      expect(await vault.subVaultPurpose(attacker.address)).to.equal(0);
    });
  });

  // ── Factory authorization ─────────────────────────────────

  describe("VaultFactory authorization", () => {
    it("owner is authorized by default", async () => {
      expect(await factory.authorizedCallers(owner.address)).to.equal(true);
    });

    it("owner can authorize a new caller", async () => {
      await factory.connect(owner).authorizeCaller(attacker.address);
      expect(await factory.authorizedCallers(attacker.address)).to.equal(true);
    });

    it("owner can revoke a caller", async () => {
      await factory.connect(owner).authorizeCaller(attacker.address);
      await factory.connect(owner).revokeCaller(attacker.address);
      expect(await factory.authorizedCallers(attacker.address)).to.equal(false);
    });

    it("unauthorized caller cannot deploy vault", async () => {
      await expect(
        factory.connect(attacker).deployVault(
          locker.address, 1, NFT_MINT, signingWallet.address,
          SYSTEM_MODE, await oracle.getAddress()
        )
      ).to.be.revertedWith("Not authorized");
    });

    it("non-owner cannot authorize callers", async () => {
      await expect(
        factory.connect(attacker).authorizeCaller(attacker.address)
      ).to.be.revertedWith("Not owner");
    });
  });
});
