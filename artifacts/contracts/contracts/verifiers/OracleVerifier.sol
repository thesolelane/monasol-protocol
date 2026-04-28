// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IVaultVerifier.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @title OracleVerifier
/// @notice Phase 1 vault verifier — requires `threshold` approved oracle signers
///         to attest Solana NFT ownership on-chain on Monad.
///
/// @dev Each oracle guardian produces an off-chain ECDSA signature over:
///      keccak256(abi.encodePacked(nftMint, owner, expiry, block.chainid))
///
///      `proof` passed to verifyAccess must be exactly `threshold * 65` bytes:
///      the concatenation of `threshold` unique guardian signatures in any order.
///
///      Vault._validateSignature calls verifyAccess() before allowing any
///      vault action that requires confirmed NFT custody.
///
///      This contract will be replaced by ZKVerifier once the Solana light
///      client is production-ready.
contract OracleVerifier is IVaultVerifier, Ownable, Pausable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // ─── State ────────────────────────────────────────────────────────────────

    /// @notice Approved oracle signers.
    mapping(address => bool) public approvedSigners;

    /// @notice Most recent verified owner per NFT mint.
    mapping(bytes32 => address) private _lastOwner;

    /// @notice Timestamp of the most recent successful verification per mint.
    mapping(bytes32 => uint256) private _lastVerifiedAt;

    /// @notice Proofs that have already been consumed (replay protection).
    mapping(bytes32 => bool) private _usedProofs;

    /// @notice Number of distinct guardian signatures required per proof.
    uint256 public threshold;

    /// @notice Maximum allowed proof age in seconds (default 5 minutes).
    uint256 public maxProofAge = 5 minutes;

    // ─── Minimum proof age floor (guards against instant-replay on same block) ─
    uint256 private constant MIN_PROOF_AGE = 60;

    // ─── Events ───────────────────────────────────────────────────────────────

    // OwnershipVerified and SignerUpdated are declared in IVaultVerifier.
    event ThresholdUpdated(uint256 newThreshold);

    // ─── Constructor ──────────────────────────────────────────────────────────

    /// @param initialOwner  Protocol owner / multisig — can update signers.
    /// @param guardians     Initial set of approved oracle signers.
    /// @param _threshold    Number of guardian signatures required per proof.
    constructor(
        address initialOwner,
        address[] memory guardians,
        uint256 _threshold
    ) Ownable(initialOwner) {
        require(_threshold > 0,             "OracleVerifier: threshold is zero");
        require(guardians.length >= _threshold, "OracleVerifier: too few guardians");

        for (uint256 i = 0; i < guardians.length; i++) {
            _setSigner(guardians[i], true);
        }
        threshold = _threshold;
    }

    // ─── IVaultVerifier ───────────────────────────────────────────────────────

    /// @inheritdoc IVaultVerifier
    /// @dev `proof` must be exactly `threshold * 65` bytes:
    ///      the concatenation of `threshold` unique guardian ECDSA signatures.
    function verifyAccess(
        bytes32 nftMint,
        address owner,
        uint256 expiry,
        bytes calldata proof
    ) external override whenNotPaused returns (bool) {
        require(block.timestamp <= expiry,                      "OracleVerifier: proof expired");
        require(expiry <= block.timestamp + maxProofAge,        "OracleVerifier: proof expiry too far in future");
        require(proof.length == threshold * 65,                 "OracleVerifier: invalid proof length");

        // Reconstruct the signed digest (same for all signers).
        bytes32 digest = keccak256(
            abi.encodePacked(nftMint, owner, expiry, block.chainid)
        ).toEthSignedMessageHash();

        // Replay guard — each digest can only be used once.
        require(!_usedProofs[digest], "OracleVerifier: proof already used");

        // Verify each signature comes from a unique approved signer.
        // Using a transient bitmap keyed by address is gas-efficient for small sets.
        address[] memory seen = new address[](threshold);

        for (uint256 i = 0; i < threshold; i++) {
            bytes calldata sig = proof[i * 65 : (i + 1) * 65];
            address recovered  = digest.recover(sig);
            require(approvedSigners[recovered], "OracleVerifier: signer not approved");

            // Duplicate signer check.
            for (uint256 j = 0; j < i; j++) {
                require(seen[j] != recovered, "OracleVerifier: duplicate signer");
            }
            seen[i] = recovered;
        }

        // Mark proof consumed.
        _usedProofs[digest] = true;

        // Record result.
        _lastOwner[nftMint]       = owner;
        _lastVerifiedAt[nftMint]  = block.timestamp;

        emit OwnershipVerified(nftMint, owner, expiry);
        return true;
    }

    /// @inheritdoc IVaultVerifier
    function lastVerifiedOwner(bytes32 nftMint) external view override returns (address) {
        return _lastOwner[nftMint];
    }

    /// @inheritdoc IVaultVerifier
    function lastVerifiedAt(bytes32 nftMint) external view override returns (uint256) {
        return _lastVerifiedAt[nftMint];
    }

    /// @inheritdoc IVaultVerifier
    function isActive() external view override returns (bool) {
        return !paused();
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    /// @notice Add or remove an approved oracle signer.
    function setSigner(address signer, bool approved) external onlyOwner {
        _setSigner(signer, approved);
    }

    /// @notice Update the required signature threshold.
    /// @dev    New threshold must be at least 1. Caller is responsible for
    ///         ensuring enough approved signers still exist to meet the threshold.
    function setThreshold(uint256 newThreshold) external onlyOwner {
        require(newThreshold > 0, "OracleVerifier: threshold is zero");
        threshold = newThreshold;
        emit ThresholdUpdated(newThreshold);
    }

    /// @notice Update the maximum allowed proof age.
    function setMaxProofAge(uint256 newAge) external onlyOwner {
        require(
            newAge >= MIN_PROOF_AGE && newAge <= 1 hours,
            "OracleVerifier: age out of range"
        );
        maxProofAge = newAge;
    }

    /// @notice Pause the verifier — no proofs accepted while paused.
    function pause() external onlyOwner { _pause(); }

    /// @notice Resume accepting proofs.
    function unpause() external onlyOwner { _unpause(); }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _setSigner(address signer, bool approved) internal {
        require(signer != address(0), "OracleVerifier: zero address");
        approvedSigners[signer] = approved;
        emit SignerUpdated(signer, approved);
    }
}
