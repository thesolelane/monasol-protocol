// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IVaultVerifier.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title ZKVerifier
/// @notice Phase 3+ verifier stub — Solana light client running natively on Monad.
///
/// @dev STATUS: STUB — NOT PRODUCTION READY.
///
///      This contract defines the interface and storage layout that the
///      Solana light client verifier will implement. It is deployed on
///      Monad testnet as a placeholder so that Locker contracts can
///      reference the correct address from day one.
///
///      The Solana light client will:
///        1. Maintain a rolling set of verified Solana block headers.
///        2. Accept Merkle proofs of NFT account state from those headers.
///        3. Verify NFT ownership without any trusted intermediary.
///
///      Implementation timeline: 6-12 months of specialist engineering.
///      Formal specification and independent security audit required
///      before any mainnet deployment.
///
///      Until then, MonaSol Protocol uses OracleVerifier for Phase 1.
contract ZKVerifier is IVaultVerifier, Ownable {

    // ── Light Client State (populated once implementation is ready) ───────────

    /// @notice The most recently accepted Solana slot number.
    uint64 public latestSlot;

    /// @notice Merkle root of the Solana account state at `latestSlot`.
    bytes32 public latestStateRoot;

    /// @notice Mapping from accepted slot to state root (historical window).
    mapping(uint64 => bytes32) public slotRoots;

    // ── Verification Records ──────────────────────────────────────────────────

    mapping(bytes32 => address)  private _lastOwner;
    mapping(bytes32 => uint256)  private _lastVerifiedAt;

    bool private _active;

    constructor(address initialOwner) Ownable(initialOwner) {
        _active = false;
    }

    // ── IVaultVerifier ────────────────────────────────────────────────────────

    /// @inheritdoc IVaultVerifier
    /// @dev STUB: always reverts until the light client is implemented.
    ///      proof is expected to be an RLP-encoded Merkle inclusion proof
    ///      against `latestStateRoot` once real implementation lands.
    function verifyAccess(
        bytes32,
        address,
        uint256,
        bytes calldata
    ) external pure override returns (bool) {
        revert("ZKVerifier: not yet implemented - use OracleVerifier");
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
        return _active;
    }

    // ── Admin (light client header relay — placeholder) ───────────────────────

    /// @notice Submit a new Solana slot header.
    /// @dev    In production this will require a validity proof (SNARK/STARK)
    ///         confirming the header is part of the canonical Solana chain.
    ///         For now it is owner-gated as a trusted relay stub.
    function submitHeader(uint64 slot, bytes32 stateRoot) external onlyOwner {
        require(slot > latestSlot, "ZKVerifier: slot not newer");
        latestSlot = slot;
        latestStateRoot = stateRoot;
        slotRoots[slot] = stateRoot;
    }

    /// @notice Activate or deactivate the verifier.
    /// @dev    Will be called once the real implementation passes audit.
    function setActive(bool active) external onlyOwner {
        _active = active;
    }
}
