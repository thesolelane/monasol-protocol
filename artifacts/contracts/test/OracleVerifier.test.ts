import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { OracleVerifier } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("OracleVerifier", function () {
  let verifier: OracleVerifier;
  let owner: SignerWithAddress;
  let oracle: SignerWithAddress;
  let oracle2: SignerWithAddress;
  let stranger: SignerWithAddress;
  let vaultOwner: SignerWithAddress;

  // Solana NFT mint encoded as bytes32
  const NFT_MINT = ethers.encodeBytes32String("SolanaNFTMint111111111");

  // Builds a single 65-byte guardian signature over the canonical digest.
  async function buildSig(
    nftMint: string,
    ownerAddr: string,
    expiry: number,
    signer: SignerWithAddress
  ): Promise<string> {
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const digest = ethers.keccak256(
      ethers.solidityPacked(
        ["bytes32", "address", "uint256", "uint256"],
        [nftMint, ownerAddr, expiry, chainId]
      )
    );
    return signer.signMessage(ethers.getBytes(digest));
  }

  // Concatenates signatures from multiple signers into one proof blob.
  async function buildMultiProof(
    nftMint: string,
    ownerAddr: string,
    expiry: number,
    signers: SignerWithAddress[]
  ): Promise<string> {
    const sigs = await Promise.all(
      signers.map((s) => buildSig(nftMint, ownerAddr, expiry, s))
    );
    // Strip 0x from all but the first, then concatenate.
    return sigs[0] + sigs.slice(1).map((s) => s.slice(2)).join("");
  }

  beforeEach(async function () {
    [owner, oracle, oracle2, stranger, vaultOwner] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("OracleVerifier");
    // Deploy with threshold=1 (single-guardian mode — matches testnet deploy script)
    verifier = (await Factory.deploy(
      owner.address,
      [oracle.address],
      1
    )) as OracleVerifier;
    await verifier.waitForDeployment();
  });

  // ─── Deployment ────────────────────────────────────────────────────────────

  describe("Deployment", function () {
    it("sets the owner correctly", async function () {
      expect(await verifier.owner()).to.equal(owner.address);
    });

    it("approves the initial signer", async function () {
      expect(await verifier.approvedSigners(oracle.address)).to.be.true;
    });

    it("sets threshold correctly", async function () {
      expect(await verifier.threshold()).to.equal(1);
    });

    it("is active (not paused) on deployment", async function () {
      expect(await verifier.isActive()).to.be.true;
    });
  });

  // ─── verifyAccess — threshold = 1 ──────────────────────────────────────────

  describe("verifyAccess (threshold = 1)", function () {
    it("accepts a valid oracle signature", async function () {
      const expiry = (await time.latest()) + 120;
      const proof  = await buildSig(NFT_MINT, vaultOwner.address, expiry, oracle);

      await expect(
        verifier.verifyAccess(NFT_MINT, vaultOwner.address, expiry, proof)
      )
        .to.emit(verifier, "OwnershipVerified")
        .withArgs(NFT_MINT, vaultOwner.address, expiry);

      expect(await verifier.lastVerifiedOwner(NFT_MINT)).to.equal(vaultOwner.address);
    });

    it("rejects an expired proof", async function () {
      const expiry = (await time.latest()) - 1;
      const proof  = await buildSig(NFT_MINT, vaultOwner.address, expiry, oracle);

      await expect(
        verifier.verifyAccess(NFT_MINT, vaultOwner.address, expiry, proof)
      ).to.be.revertedWith("OracleVerifier: proof expired");
    });

    it("rejects a proof signed by an unapproved signer", async function () {
      const expiry = (await time.latest()) + 120;
      const proof  = await buildSig(NFT_MINT, vaultOwner.address, expiry, stranger);

      await expect(
        verifier.verifyAccess(NFT_MINT, vaultOwner.address, expiry, proof)
      ).to.be.revertedWith("OracleVerifier: signer not approved");
    });

    it("rejects proof replay", async function () {
      const expiry = (await time.latest()) + 120;
      const proof  = await buildSig(NFT_MINT, vaultOwner.address, expiry, oracle);

      await verifier.verifyAccess(NFT_MINT, vaultOwner.address, expiry, proof);

      await expect(
        verifier.verifyAccess(NFT_MINT, vaultOwner.address, expiry, proof)
      ).to.be.revertedWith("OracleVerifier: proof already used");
    });

    it("rejects when paused", async function () {
      await verifier.connect(owner).pause();
      const expiry = (await time.latest()) + 120;
      const proof  = await buildSig(NFT_MINT, vaultOwner.address, expiry, oracle);

      await expect(
        verifier.verifyAccess(NFT_MINT, vaultOwner.address, expiry, proof)
      ).to.be.revertedWithCustomError(verifier, "EnforcedPause");
    });

    it("rejects proof with wrong byte length", async function () {
      const expiry = (await time.latest()) + 120;
      // Provide two signatures worth of bytes but threshold is 1
      const proof  = await buildMultiProof(NFT_MINT, vaultOwner.address, expiry, [oracle, oracle]);

      await expect(
        verifier.verifyAccess(NFT_MINT, vaultOwner.address, expiry, proof)
      ).to.be.revertedWith("OracleVerifier: invalid proof length");
    });
  });

  // ─── verifyAccess — threshold = 2 ──────────────────────────────────────────

  describe("verifyAccess (threshold = 2)", function () {
    beforeEach(async function () {
      // Add oracle2 as approved signer and raise threshold to 2.
      await verifier.connect(owner).setSigner(oracle2.address, true);
      await verifier.connect(owner).setThreshold(2);
    });

    it("accepts two valid guardian signatures", async function () {
      const expiry = (await time.latest()) + 120;
      const proof  = await buildMultiProof(NFT_MINT, vaultOwner.address, expiry, [oracle, oracle2]);

      await expect(
        verifier.verifyAccess(NFT_MINT, vaultOwner.address, expiry, proof)
      ).to.emit(verifier, "OwnershipVerified");
    });

    it("rejects with only one signature when threshold is 2", async function () {
      const expiry = (await time.latest()) + 120;
      const proof  = await buildSig(NFT_MINT, vaultOwner.address, expiry, oracle);

      await expect(
        verifier.verifyAccess(NFT_MINT, vaultOwner.address, expiry, proof)
      ).to.be.revertedWith("OracleVerifier: invalid proof length");
    });

    it("rejects duplicate signers in a multi-sig proof", async function () {
      const expiry = (await time.latest()) + 120;
      // oracle signs twice — should fail duplicate check.
      const proof  = await buildMultiProof(NFT_MINT, vaultOwner.address, expiry, [oracle, oracle]);

      await expect(
        verifier.verifyAccess(NFT_MINT, vaultOwner.address, expiry, proof)
      ).to.be.revertedWith("OracleVerifier: duplicate signer");
    });
  });

  // ─── Admin ─────────────────────────────────────────────────────────────────

  describe("Admin", function () {
    it("owner can add a new signer", async function () {
      await verifier.connect(owner).setSigner(stranger.address, true);
      expect(await verifier.approvedSigners(stranger.address)).to.be.true;
    });

    it("owner can remove a signer", async function () {
      await verifier.connect(owner).setSigner(oracle.address, false);
      expect(await verifier.approvedSigners(oracle.address)).to.be.false;
    });

    it("non-owner cannot modify signers", async function () {
      await expect(
        verifier.connect(stranger).setSigner(stranger.address, true)
      ).to.be.revertedWithCustomError(verifier, "OwnableUnauthorizedAccount");
    });

    it("owner can update threshold", async function () {
      await verifier.connect(owner).setSigner(oracle2.address, true);
      await verifier.connect(owner).setThreshold(2);
      expect(await verifier.threshold()).to.equal(2);
    });

    it("non-owner cannot update threshold", async function () {
      await expect(
        verifier.connect(stranger).setThreshold(2)
      ).to.be.revertedWithCustomError(verifier, "OwnableUnauthorizedAccount");
    });

    it("owner can pause and unpause", async function () {
      await verifier.connect(owner).pause();
      expect(await verifier.isActive()).to.be.false;

      await verifier.connect(owner).unpause();
      expect(await verifier.isActive()).to.be.true;
    });

    it("owner can update maxProofAge within bounds", async function () {
      await verifier.connect(owner).setMaxProofAge(10 * 60);
      expect(await verifier.maxProofAge()).to.equal(10 * 60);
    });

    it("rejects maxProofAge below minimum", async function () {
      await expect(
        verifier.connect(owner).setMaxProofAge(30)
      ).to.be.revertedWith("OracleVerifier: age out of range");
    });
  });
});
