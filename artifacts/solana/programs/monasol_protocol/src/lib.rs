// ============================================================================
// monasol_protocol — MonaSol Protocol
// ----------------------------------------------------------------------------
// Top-level orchestrator.  Owns the state machine and coordinates CPIs
// into vault_key and guardian_multisig.
//
// Responsibilities:
//   • State machine: Active → Pledged → Settling → Released
//   • Cross-chain message receipt and verification (Wormhole NTT / deBridge
//     — pattern decided in next session)
//   • CPI into vault_key for freeze / thaw on state transitions
//   • CPI into guardian_multisig for protocol-level mutations
//   • move_in  — orchestrates vault_key::move_in
//   • move_out — orchestrates vault_key::move_out after Released
//   • open_session  / close_session  (renter fast-path, no multisig)
//   • transfer_lease / set_read_only / pause (Squads-gated)
//
// NOT responsible for:
//   • NFT lifecycle primitives (vault_key)
//   • Guardian shard logic     (guardian_multisig)
// ============================================================================

use anchor_lang::prelude::*;

// Placeholder — run `anchor keys sync` on the server to update.
declare_id!("HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny");

#[program]
pub mod monasol_protocol {
    use super::*;

    // Stubs — full implementation follows after cross-chain messaging
    // pattern is decided (tomorrow's session).

    pub fn initialize(_ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
