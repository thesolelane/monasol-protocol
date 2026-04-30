// PATCH for src/lib/contracts.ts
// Replace the LOCKER_ABI const (lines 18–29) with this block exactly.
// The two events at the bottom are placeholders — replace with final
// Solidity event signatures once VaultMoveIn and SessionSettled are
// defined in the Locker contract.
//
// Derived from move_in() function signature already in the ABI:
//   VaultMoveIn  — emitted by move_in(), carries slot_index + signing_wallet + nft_mint
//   SessionSettled — emitted by close_session(), carries slot_index + occupant

const LOCKER_ABI = [
  "function move_in(uint256 slot_index, address signing_wallet, string nft_mint, uint8 security_mode) external payable",
  "function move_in_fee() view returns (uint256)",
  "function open_session(uint256 slot_index, uint256 duration_seconds) external",
  "function close_session(uint256 slot_index) external",
  "function transfer_lease(uint256 slot_index, address new_owner, address new_signer, string new_nft_mint) external",
  "function nft_mint(uint256) external view returns (string)",
  "function available_slots() external view returns (uint256)",
  "function capacity() external view returns (uint256)",
  "function is_full() external view returns (bool)",
  "function get_slot(uint256 index) external view returns (bool occupied, address occupant, address signer, uint8 mode, bool read_only, bool session_active)",
  // TODO: replace with final event signatures once defined in Locker.sol
  "event VaultMoveIn(uint256 indexed slot_index, address indexed signing_wallet, string nft_mint, uint8 security_mode)",
  "event SessionSettled(uint256 indexed slot_index, address indexed occupant, uint256 settled_at)",
] as const;
