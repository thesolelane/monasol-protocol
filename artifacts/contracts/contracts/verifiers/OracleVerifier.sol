// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IVaultVerifier.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @title OracleVerifier
/// @notice Phase 1 vault verifier — trusts a set of approved oracle signers
///         to attest Solana NFT ownership on-chain on Monad.
///
/// @dev The oracle produces an off-chain ECDSA signature over:
///      keccak256(abi.encodePacked(nftMint, owner, expiry, block.chainid))
///
///      The Locker contract calls verifyOwnership() before allowing any
///      vault action that requires confirmed NFT custody.
///
///      This contract is intentionally simple — it will be replaced by
///      ZKVerifier once the Solana light client is production-ready.
contract OracleVerifier is IVaultVerifier, Ownable, Pausable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    /// @notice Approved oracle signers.
    mapping(address => bool) public approvedSigners;

    /// @notice Most recent verified owner per NFT mint.
    mapping(bytes32 => bytes32) private _lastOwner;

    /// @notice Timestamp of the most recent successful verification per mint.
    mapping(bytes32 => uint256) private _lastVerifiedAt;

    /// @notice Proofs that have already been consumed (replay protection).
    mapping(bytes32 => bool) private _usedProofs;

    /// @notice Maximum allowed proof age in seconds (default 5 minutes).
    uint256 public maxProofAge = 5 minutes;

    constructor(address initialOwner, address initialSigner)
        Ownable(initialOwner)
    {
        _setSigner(initialSigner, true);
    }

    /// @inheritdoc IVaultVerifier
    function verifyOwnership(
        bytes32 nftMint,
        bytes32 owner,
        bytes calldata proof,
        uint256 expiry
    ) external override whenNotPaused returns (bool valid) {
        require(block.timestamp <= expiry, "OracleVerifier: proof expired");
        require(
            expiry <= block.timestamp + maxProofAge,
            "OracleVerifier: proof expiry too far in future"
        );

        // Proof is a raw 65-byte ECDSA signature.
        require(proof.length == 65, "OracleVerifier: invalid proof length");

        // Reconstruct the signed digest.
        bytes32 digest = keccak256(
            abi.encodePacked(nftMint, owner, expiry, block.chainid)
        ).toEthSignedMessageHash();

        // Replay guard — each (digest) can only be used once.
        require(!_usedProofs[digest], "OracleVerifier: proof already used");

        address recovered = digest.recover(proof);
        require(approvedSigners[recovered], "OracleVerifier: signer not approved");

        // Mark proof consumed.
        _usedProofs[digest] = true;

        // Record result.
        _lastOwner[nftMint] = owner;
        _lastVerifiedAt[nftMint] = block.timestamp;

        emit OwnershipVerified(nftMint, owner, expiry);
        return true;
    }

    /// @inheritdoc IVaultVerifier
    function lastVerifiedOwner(bytes32 nftMint) external view override returns (bytes32) {
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

    // ─── Admin ───────────────────────────────────────────────────────────────

    /// @notice Add or remove an approved oracle signer.
    function setSigner(address signer, bool approved) external onlyOwner {
        _setSigner(signer, approved);
    }

    /// @notice Update the maximum allowed proof age.
    function setMaxProofAge(uint256 newAge) external onlyOwner {
        require(newAge >= 60 && newAge <= 1 hours, "OracleVerifier: age out of range");
        maxProofAge = newAge;
    }

    /// @notice Pause the verifier — no proofs accepted while paused.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Resume accepting proofs.
    function unpause() external onlyOwner {
        _unpause();
    }

    // ─── Internal ────────────────────────────────────────────────────────────

    function _setSigner(address signer, bool approved) internal {
        require(signer != address(0), "OracleVerifier: zero address");
        approvedSigners[signer] = approved;
        emit SignerUpdated(signer, approved);
    }
}
