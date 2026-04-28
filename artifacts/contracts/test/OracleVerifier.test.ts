import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { OracleVerifier } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("OracleVerifier", function () {
  let verifier: OracleVerifier;
  let owner: SignerWithAddress;
  let oracle: SignerWithAddress;
  let stranger: SignerWithAddress;

  // Dummy Solana addresses encoded as bytes32
  const NFT_MINT = ethers.encodeBytes32String("SolanaNFTMint111111111");
  const NFT_OWNER = ethers.encodeBytes32String("SolanaOwnerWallet11111");

  async function buildProof(
    nftMint: string,
    nftOwner: string,
    expiry: number,
    signer: SignerWithAddress
  ): Promise<string> {
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const digest = ethers.keccak256(
      ethers.solidityPacked(
        ["bytes32", "bytes32", "uint256", "uint256"],
        [nftMint, nftOwner, expiry, chainId]
      )
    );
    // Sign with Ethereum prefix (matches toEthSignedMessageHash in contract)
    return signer.signMessage(ethers.getBytes(digest));
  }

  beforeEach(async function () {
    [owner, oracle, stranger] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("OracleVerifier");
    verifier = (await Factory.deploy(
      owner.address,
      oracle.address
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

    it("is active (not paused) on deployment", async function () {
      expect(await verifier.isActive()).to.be.true;
    });
  });

  // ─── verifyOwnership ───────────────────────────────────────────────────────

  describe("verifyOwnership", function () {
    it("accepts a valid oracle signature", async function () {
      const expiry = (await time.latest()) + 120;
      const proof = await buildProof(NFT_MINT, NFT_OWNER, expiry, oracle);

      await expect(
        verifier.verifyAccess(NFT_MINT, NFT_OWNER, proof, expiry)
      )
        .to.emit(verifier, "OwnershipVerified")
        .withArgs(NFT_MINT, NFT_OWNER, expiry);

      expect(await verifier.lastVerifiedOwner(NFT_MINT)).to.equal(NFT_OWNER);
    });

    it("rejects an expired proof", async function () {
      const expiry = (await time.latest()) - 1;
      const proof = await buildProof(NFT_MINT, NFT_OWNER, expiry, oracle);

      await expect(
        verifier.verifyAccess(NFT_MINT, NFT_OWNER, proof, expiry)
      ).to.be.revertedWith("OracleVerifier: proof expired");
    });

    it("rejects a proof signed by an unapproved signer", async function () {
      const expiry = (await time.latest()) + 120;
      const proof = await buildProof(NFT_MINT, NFT_OWNER, expiry, stranger);

      await expect(
        verifier.verifyAccess(NFT_MINT, NFT_OWNER, proof, expiry)
      ).to.be.revertedWith("OracleVerifier: signer not approved");
    });

    it("rejects proof replay", async function () {
      const expiry = (await time.latest()) + 120;
      const proof = await buildProof(NFT_MINT, NFT_OWNER, expiry, oracle);

      await verifier.verifyAccess(NFT_MINT, NFT_OWNER, proof, expiry);

      await expect(
        verifier.verifyAccess(NFT_MINT, NFT_OWNER, proof, expiry)
      ).to.be.revertedWith("OracleVerifier: proof already used");
    });

    it("rejects when paused", async function () {
      await verifier.connect(owner).pause();
      const expiry = (await time.latest()) + 120;
      const proof = await buildProof(NFT_MINT, NFT_OWNER, expiry, oracle);

      await expect(
        verifier.verifyAccess(NFT_MINT, NFT_OWNER, proof, expiry)
      ).to.be.revertedWithCustomError(verifier, "EnforcedPause");
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
