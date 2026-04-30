// ============================================================================
// guardian_multisig — MonaSol Protocol
// ----------------------------------------------------------------------------
// Manages the 5-member guardian council and shard-based approval flow.
//
// Responsibilities:
//   • Guardian registration and rotation
//   • Shard commitment recording (2-of-2 cryptographic fragments)
//   • Threshold approval for protocol-level mutations:
//       - transfer_lease
//       - set_read_only
//       - pause / unpause
//       - admin ops (update fees, update treasury)
//
// NOT responsible for:
//   • NFT minting / freezing    (vault_key)
//   • State machine enforcement (monasol_protocol)
//   • Cross-chain messaging     (monasol_protocol)
//
// NOTE: Squads v4 integration wired here once cross-chain messaging
//       pattern is decided and Squads CPI dependency is confirmed.
// ============================================================================

use anchor_lang::prelude::*;

// Placeholder — run `anchor keys sync` on the server to update.
declare_id!("4Nd1mBQtrMJVYVfKf2PX8Q7pSe8KBnM23sYs5KGR2ZtG");

#[program]
pub mod guardian_multisig {
    use super::*;

    // Stubs — full implementation follows after cross-chain messaging
    // pattern is decided (tomorrow's session).

    pub fn initialize(_ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
