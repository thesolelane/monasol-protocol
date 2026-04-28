// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IVaultVerifier
/// @notice Interface for cross-chain NFT ownership verification on Monad.
/// @dev Two implementations exist: OracleVerifier (oracle-backed, Phase 1)
///      and ZKVerifier (Solana light client, Phase 3+).
interface IVaultVerifier {
    /// @notice Emitted when a verification succeeds.
    /// @param nftMint  The Solana NFT mint address (base58 as bytes32).
    /// @param owner    The Solana wallet address claiming ownership.
    /// @param expiry   Unix timestamp after which this proof is invalid.
    event OwnershipVerified(
        bytes32 indexed nftMint,
        bytes32 indexed owner,
        uint256 expiry
    );

    /// @notice Emitted when an oracle signer is added or removed.
    event SignerUpdated(address indexed signer, bool approved);

    /// @notice Verify that `owner` holds the Solana NFT identified by `nftMint`.
    /// @dev    Reverts if proof is invalid, expired, or the verifier is paused.
    /// @param nftMint  The Solana NFT mint address encoded as bytes32.
    /// @param owner    The Solana wallet address encoded as bytes32.
    /// @param proof    Verifier-specific proof payload (oracle sig or Merkle proof).
    /// @param expiry   Unix timestamp — proof must not be used after this time.
    /// @return valid   True if ownership is confirmed.
    function verifyAccess(
        bytes32 nftMint,
        bytes32 owner,
        bytes calldata proof,
        uint256 expiry
    ) external returns (bool valid);

    /// @notice Returns the last verified owner for a given NFT mint.
    /// @dev    Returns zero bytes if the NFT has never been verified.
    function lastVerifiedOwner(bytes32 nftMint) external view returns (bytes32 owner);

    /// @notice Returns the block timestamp when the last verification for
    ///         `nftMint` was recorded.
    function lastVerifiedAt(bytes32 nftMint) external view returns (uint256 timestamp);

    /// @notice True if the verifier is accepting new proof submissions.
    function isActive() external view returns (bool);
}
