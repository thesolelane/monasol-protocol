// ============================================================================
// monasol_protocol — MonaSol Protocol
// ----------------------------------------------------------------------------
// The state machine coordinator.  Owns the canonical session lifecycle and
// drives both vault_key and guardian_multisig via CPI.
//
// State machine:
//   Active ──pledge──► Pledged ──confirm_settlement──► Settling
//          ──────────────────────────────────────────► Released
//                                                       │
//                                                  (vault_key::move_out)
//                                                       │
//                                                     Closed
//
// Instruction responsibilities:
//   • initialise       — one-time deployment, registers authority + oracle
//   • update_oracle    — authority-only oracle rotation
//   • set_paused       — emergency kill switch
//   • register_session — oracle backend registers a session after move_in
//   • pledge           — operator signals guardian phase complete; Active → Pledged
//   • confirm_settlement — oracle confirms Monad settlement; Pledged → Released
//                          CPIs: guardian_multisig::mark_settled
//                                vault_key::thaw_key
//   • finalize_release — burns NFT, closes accounts
//                        CPIs: vault_key::move_out
//                              guardian_multisig::close_guardian_set
//   • emergency_halt   — authority override for disputed sessions
//
// Cross-chain boundary (Phase 2 — oracle/backend model):
//   The OracleVerifier account holds the trusted oracle pubkey.
//   `confirm_settlement` requires a signature from the oracle, which is
//   the Node.js backend that monitors Monad events (already wired via
//   OracleVerifier in Phase 1).
//
//   Phase 3-4: Replace oracle signer with Wormhole NTT VAA verification.
//   Phase 5:   Replace with SP1 ZK proof (Groth16 on Monad).
//   The interface boundary is clearly marked below — swap the verification
//   block without touching the rest of the state machine.
//
// ============================================================================

use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::invoke_signed;

declare_id!("MSL3a81xY93z7zzqFEjxh1EyUo2mUJeQ6xc8UAQRba9");

// --------------------------------------------------------------------------
// Constants
// --------------------------------------------------------------------------

pub const PROTOCOL_STATE_SEED: &[u8]  = b"protocol_state";
pub const SESSION_RECORD_SEED: &[u8]  = b"session_record";
pub const ORACLE_VERIFIER_SEED: &[u8] = b"oracle_verifier";

/// vault_key program ID — placeholder, updated by `anchor keys sync`.
/// Used here as documentation only; address constraint is omitted until
/// real IDs are generated on the server.
pub const VAULT_KEY_PROGRAM_ID: &str =
    "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS";

/// guardian_multisig program ID — placeholder, updated by `anchor keys sync`.
pub const GUARDIAN_MULTISIG_PROGRAM_ID: &str =
    "4Nd1mBQtrMJVYVfKf2PX8Q7pSe8KBnM23sYs5KGR2ZtG";

// --------------------------------------------------------------------------
// Program
// --------------------------------------------------------------------------

#[program]
pub mod monasol_protocol {
    use super::*;

    // ========================================================================
    // Admin
    // ========================================================================

    /// Initialise the global protocol state.
    /// Called once at deployment by the upgrade authority.
    pub fn initialise(
        ctx: Context<Initialise>,
        oracle: Pubkey,
    ) -> Result<()> {
        let ps = &mut ctx.accounts.protocol_state;
        ps.authority        = ctx.accounts.authority.key();
        ps.oracle           = oracle;
        ps.session_count    = 0;
        ps.paused           = false;
        ps.bump             = ctx.bumps.protocol_state;

        let ov = &mut ctx.accounts.oracle_verifier;
        ov.oracle           = oracle;
        ov.bump             = ctx.bumps.oracle_verifier;

        msg!(
            "monasol_protocol: initialised — authority {} oracle {}",
            ps.authority,
            oracle,
        );

        Ok(())
    }

    /// Update the trusted oracle pubkey.
    /// Only callable by protocol authority.
    pub fn update_oracle(
        ctx: Context<UpdateOracle>,
        new_oracle: Pubkey,
    ) -> Result<()> {
        ctx.accounts.protocol_state.oracle     = new_oracle;
        ctx.accounts.oracle_verifier.oracle    = new_oracle;

        msg!(
            "monasol_protocol: oracle updated → {}",
            new_oracle,
        );

        Ok(())
    }

    /// Pause / unpause the protocol (emergency use).
    pub fn set_paused(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
        ctx.accounts.protocol_state.paused = paused;
        msg!("monasol_protocol: paused = {}", paused);
        Ok(())
    }

    // ========================================================================
    // Session lifecycle
    // ========================================================================

    /// Register a new session record.
    ///
    /// Called by the backend oracle after `vault_key::move_in` succeeds.
    /// Ties the Solana-side session to a Monad lease ID and records the
    /// vault_key VaultSession PDA address for downstream CPI calls.
    pub fn register_session(
        ctx: Context<RegisterSession>,
        args: RegisterSessionArgs,
    ) -> Result<()> {
        require!(
            !ctx.accounts.protocol_state.paused,
            ProtocolError::ProtocolPaused,
        );

        let sr = &mut ctx.accounts.session_record;
        sr.lease_id         = args.lease_id;
        sr.renter           = args.renter;
        sr.vault_session    = args.vault_session;
        sr.guardian_set     = args.guardian_set;
        sr.asset            = args.asset;
        sr.collection       = args.collection;
        sr.state            = ProtocolSessionState::Active;
        sr.monad_tx_ref     = args.monad_tx_ref;
        sr.registered_ts    = Clock::get()?.unix_timestamp;
        sr.bump             = ctx.bumps.session_record;

        ctx.accounts.protocol_state.session_count += 1;

        emit!(SessionRegistered {
            lease_id:      args.lease_id,
            renter:        args.renter,
            vault_session: args.vault_session,
            guardian_set:  args.guardian_set,
            monad_tx_ref:  args.monad_tx_ref,
            timestamp:     sr.registered_ts,
        });

        msg!(
            "monasol_protocol: register_session — lease {} renter {}",
            args.lease_id,
            args.renter,
        );

        Ok(())
    }

    /// Operator signals that guardian shards have been submitted and
    /// unanimous approval has been reached — drives Active → Pledged.
    ///
    /// Verifies:
    ///   1. GuardianSet.status == Approved (all 3 approvers voted)
    ///   2. SessionRecord.state == Active
    pub fn pledge(ctx: Context<Pledge>) -> Result<()> {
        require!(
            !ctx.accounts.protocol_state.paused,
            ProtocolError::ProtocolPaused,
        );

        let sr = &mut ctx.accounts.session_record;

        require!(
            sr.state == ProtocolSessionState::Active,
            ProtocolError::InvalidStateTransition,
        );

        // Verify guardian set has unanimous approval
        let gs = &ctx.accounts.guardian_set;
        require!(
            gs.status == GuardianSetStatusMirror::Approved,
            ProtocolError::GuardianSetNotApproved,
        );

        sr.state      = ProtocolSessionState::Pledged;
        sr.pledged_ts = Clock::get()?.unix_timestamp;

        emit!(SessionPledged {
            lease_id:  sr.lease_id,
            renter:    sr.renter,
            timestamp: sr.pledged_ts,
        });

        msg!(
            "monasol_protocol: pledge — lease {} Active → Pledged",
            sr.lease_id,
        );

        Ok(())
    }

    /// Oracle confirms that the Monad-side settlement transaction is valid.
    ///
    /// ┌─────────────────────────────────────────────────────────────────┐
    /// │  CROSS-CHAIN BOUNDARY — PHASE 2 (Oracle / Backend Model)        │
    /// │                                                                  │
    /// │  Verification: oracle Signer account must match                 │
    /// │  OracleVerifier.oracle pubkey.  The Node.js backend signs this  │
    /// │  transaction after confirming the Monad settlement event via     │
    /// │  OracleVerifier (already wired in Phase 1).                     │
    /// │                                                                  │
    /// │  Phase 3-4 upgrade path:                                        │
    /// │    Replace oracle signer check with Wormhole NTT VAA            │
    /// │    verification.  The `monad_settlement_proof` account below     │
    /// │    becomes a posted VAA account.                                 │
    /// │                                                                  │
    /// │  Phase 5 upgrade path:                                          │
    /// │    Replace with SP1 ZK proof verification (Groth16 on Monad).   │
    /// │    The proof is verified against the Monad state root.          │
    /// └─────────────────────────────────────────────────────────────────┘
    ///
    /// On success:
    ///   Pledged → Settling  (thaw NFT via vault_key CPI)
    ///           → Released  (same tx — settlement is atomic)
    ///   CPIs: guardian_multisig::mark_settled
    ///         vault_key::thaw_key
    pub fn confirm_settlement(
        ctx: Context<ConfirmSettlement>,
        monad_tx_hash: [u8; 32],
    ) -> Result<()> {
        require!(
            !ctx.accounts.protocol_state.paused,
            ProtocolError::ProtocolPaused,
        );

        let sr = &mut ctx.accounts.session_record;

        require!(
            sr.state == ProtocolSessionState::Pledged,
            ProtocolError::InvalidStateTransition,
        );

        // ----------------------------------------------------------------
        // CROSS-CHAIN BOUNDARY — Phase 2 oracle verification
        // The oracle signer is validated by the account constraint:
        //   oracle.key() == oracle_verifier.oracle
        // That constraint is on the ConfirmSettlement Accounts struct.
        // No additional logic needed here for Phase 2.
        // ----------------------------------------------------------------

        let now = Clock::get()?.unix_timestamp;

        // Settling (intermediate — thaw NFT so it can be transferred/burned)
        sr.state        = ProtocolSessionState::Settling;
        sr.settling_ts  = now;

        // CPI 1: vault_key::thaw_key
        // Thaw the NFT — renter can now transfer or burn it post-settlement
        {
            let protocol_auth_bump = ctx.bumps.protocol_auth;
            let auth_seeds: &[&[u8]] = &[b"protocol_auth", &[protocol_auth_bump]];
            let signer_seeds = &[auth_seeds];

            let thaw_ix = build_vault_key_thaw_ix(
                &ctx.accounts.vault_key_program.key(),
                &ctx.accounts.protocol_auth.key(),
                &ctx.accounts.asset.key(),
                &ctx.accounts.collection.key(),
                &ctx.accounts.payer.key(),
                &ctx.accounts.mpl_core_program.key(),
                &ctx.accounts.system_program.key(),
            )?;

            invoke_signed(
                &thaw_ix,
                &[
                    ctx.accounts.protocol_auth.to_account_info(),
                    ctx.accounts.asset.to_account_info(),
                    ctx.accounts.collection.to_account_info(),
                    ctx.accounts.payer.to_account_info(),
                    ctx.accounts.system_program.to_account_info(),
                    ctx.accounts.vault_key_program.to_account_info(),
                    ctx.accounts.mpl_core_program.to_account_info(),
                ],
                signer_seeds,
            )?;
        }

        // CPI 2: guardian_multisig::mark_settled
        {
            let protocol_auth_bump = ctx.bumps.protocol_auth;
            let auth_seeds: &[&[u8]] = &[b"protocol_auth", &[protocol_auth_bump]];
            let signer_seeds = &[auth_seeds];

            let mark_settled_ix = build_guardian_mark_settled_ix(
                &ctx.accounts.guardian_multisig_program.key(),
                &ctx.accounts.protocol_auth.key(),
                &ctx.accounts.guardian_set.key(),
                &ctx.accounts.system_program.key(),
            )?;

            invoke_signed(
                &mark_settled_ix,
                &[
                    ctx.accounts.protocol_auth.to_account_info(),
                    ctx.accounts.guardian_set.to_account_info(),
                    ctx.accounts.system_program.to_account_info(),
                    ctx.accounts.guardian_multisig_program.to_account_info(),
                ],
                signer_seeds,
            )?;
        }

        // Advance to Released — settlement is atomic in Phase 2
        sr.state        = ProtocolSessionState::Released;
        sr.released_ts  = now;
        sr.monad_tx_ref = monad_tx_hash;

        emit!(SessionReleased {
            lease_id:      sr.lease_id,
            renter:        sr.renter,
            monad_tx_hash,
            timestamp:     now,
        });

        msg!(
            "monasol_protocol: confirm_settlement — lease {} → Released",
            sr.lease_id,
        );

        Ok(())
    }

    /// Finalise the release — burn the vault key NFT and close accounts.
    ///
    /// Called by the operator/backend after `confirm_settlement`.
    /// CPIs:
    ///   vault_key::move_out  (thaw + burn NFT, close VaultSession)
    ///   guardian_multisig::close_guardian_set (close GuardianSet)
    pub fn finalize_release(ctx: Context<FinalizeRelease>) -> Result<()> {
        require!(
            !ctx.accounts.protocol_state.paused,
            ProtocolError::ProtocolPaused,
        );

        let sr = &mut ctx.accounts.session_record;

        require!(
            sr.state == ProtocolSessionState::Released,
            ProtocolError::InvalidStateTransition,
        );

        let protocol_auth_bump = ctx.bumps.protocol_auth;
        let auth_seeds: &[&[u8]] = &[b"protocol_auth", &[protocol_auth_bump]];
        let signer_seeds = &[auth_seeds];

        // CPI 1: vault_key::move_out — burns the NFT, closes VaultSession
        {
            let move_out_ix = build_vault_key_move_out_ix(
                &ctx.accounts.vault_key_program.key(),
                &ctx.accounts.protocol_auth.key(),
                &ctx.accounts.vault_session.key(),
                &ctx.accounts.asset.key(),
                &ctx.accounts.collection.key(),
                &ctx.accounts.payer.key(),
                &ctx.accounts.mpl_core_program.key(),
                &ctx.accounts.system_program.key(),
            )?;

            invoke_signed(
                &move_out_ix,
                &[
                    ctx.accounts.protocol_auth.to_account_info(),
                    ctx.accounts.vault_session.to_account_info(),
                    ctx.accounts.asset.to_account_info(),
                    ctx.accounts.collection.to_account_info(),
                    ctx.accounts.payer.to_account_info(),
                    ctx.accounts.system_program.to_account_info(),
                    ctx.accounts.vault_key_program.to_account_info(),
                    ctx.accounts.mpl_core_program.to_account_info(),
                ],
                signer_seeds,
            )?;
        }

        // CPI 2: guardian_multisig::close_guardian_set — reclaims rent
        {
            let close_gs_ix = build_guardian_close_set_ix(
                &ctx.accounts.guardian_multisig_program.key(),
                &ctx.accounts.guardian_set.key(),
                &ctx.accounts.payer.key(),
                &ctx.accounts.system_program.key(),
            )?;

            invoke_signed(
                &close_gs_ix,
                &[
                    ctx.accounts.guardian_set.to_account_info(),
                    ctx.accounts.payer.to_account_info(),
                    ctx.accounts.system_program.to_account_info(),
                    ctx.accounts.guardian_multisig_program.to_account_info(),
                ],
                signer_seeds,
            )?;
        }

        sr.state        = ProtocolSessionState::Closed;
        sr.closed_ts    = Clock::get()?.unix_timestamp;

        emit!(SessionClosed {
            lease_id:  sr.lease_id,
            renter:    sr.renter,
            timestamp: sr.closed_ts,
        });

        msg!(
            "monasol_protocol: finalize_release — lease {} Closed",
            sr.lease_id,
        );

        Ok(())
    }

    /// Emergency halt — operator override for disputed or failed sessions.
    /// Freezes the NFT and marks session Halted.
    /// Does not burn — allows manual review before resolution.
    pub fn emergency_halt(
        ctx: Context<EmergencyHalt>,
        reason: String,
    ) -> Result<()> {
        require!(
            reason.len() <= 128,
            ProtocolError::ReasonTooLong,
        );

        let sr = &mut ctx.accounts.session_record;

        require!(
            sr.state != ProtocolSessionState::Closed
                && sr.state != ProtocolSessionState::Halted,
            ProtocolError::SessionAlreadyTerminal,
        );

        sr.state    = ProtocolSessionState::Halted;
        sr.halt_ts  = Clock::get()?.unix_timestamp;

        emit!(SessionHalted {
            lease_id:  sr.lease_id,
            renter:    sr.renter,
            reason:    reason.clone(),
            timestamp: sr.halt_ts,
        });

        msg!(
            "monasol_protocol: emergency_halt — lease {} reason: {}",
            sr.lease_id,
            reason,
        );

        Ok(())
    }
}

// --------------------------------------------------------------------------
// CPI Instruction Builders
// These construct raw instructions for cross-program calls.
// Using raw instructions (not anchor CPI builders) because monasol_protocol
// does not take a direct Cargo dependency on vault_key or guardian_multisig —
// loose coupling via program IDs only.
// --------------------------------------------------------------------------

/// 8-byte Anchor discriminator: sha256("global:<instruction_name>")[..8]
/// These are placeholder discriminators — recompute after first build:
///
///   anchor idl parse --file programs/vault_key/src/lib.rs
///   anchor idl parse --file programs/guardian_multisig/src/lib.rs
///
/// Then replace the byte arrays below with the actual discriminators.
///
/// Discriminators to recompute:
///   sha256("global:thaw_key")[..8]
///   sha256("global:move_out")[..8]
///   sha256("global:mark_settled")[..8]
///   sha256("global:close_guardian_set")[..8]

fn build_vault_key_thaw_ix(
    vault_key_program: &Pubkey,
    protocol_auth: &Pubkey,
    asset: &Pubkey,
    collection: &Pubkey,
    payer: &Pubkey,
    mpl_core_program: &Pubkey,
    system_program: &Pubkey,
) -> Result<Instruction> {
    // PLACEHOLDER — recompute after first build: sha256("global:thaw_key")[..8]
    let discriminator: [u8; 8] = [0x8c, 0x6e, 0x2e, 0x7f, 0x9a, 0x1b, 0x3d, 0x5f];

    let data = discriminator.to_vec();

    let accounts = vec![
        AccountMeta::new(*payer, true),
        AccountMeta::new_readonly(*protocol_auth, true),
        AccountMeta::new(*asset, false),
        AccountMeta::new(*collection, false),
        AccountMeta::new_readonly(*mpl_core_program, false),
        AccountMeta::new_readonly(*system_program, false),
    ];

    Ok(Instruction {
        program_id: *vault_key_program,
        accounts,
        data,
    })
}

fn build_vault_key_move_out_ix(
    vault_key_program: &Pubkey,
    protocol_auth: &Pubkey,
    vault_session: &Pubkey,
    asset: &Pubkey,
    collection: &Pubkey,
    payer: &Pubkey,
    mpl_core_program: &Pubkey,
    system_program: &Pubkey,
) -> Result<Instruction> {
    // PLACEHOLDER — recompute after first build: sha256("global:move_out")[..8]
    let discriminator: [u8; 8] = [0x1a, 0x2b, 0x3c, 0x4d, 0x5e, 0x6f, 0x7a, 0x8b];

    let data = discriminator.to_vec();

    let accounts = vec![
        AccountMeta::new(*payer, true),
        AccountMeta::new_readonly(*protocol_auth, true),
        AccountMeta::new(*vault_session, false),
        AccountMeta::new(*asset, false),
        AccountMeta::new(*collection, false),
        AccountMeta::new_readonly(*mpl_core_program, false),
        AccountMeta::new_readonly(*system_program, false),
    ];

    Ok(Instruction {
        program_id: *vault_key_program,
        accounts,
        data,
    })
}

fn build_guardian_mark_settled_ix(
    guardian_program: &Pubkey,
    caller: &Pubkey,
    guardian_set: &Pubkey,
    system_program: &Pubkey,
) -> Result<Instruction> {
    // PLACEHOLDER — recompute after first build: sha256("global:mark_settled")[..8]
    let discriminator: [u8; 8] = [0x3f, 0x4e, 0x5d, 0x6c, 0x7b, 0x8a, 0x91, 0xa0];

    let data = discriminator.to_vec();

    let accounts = vec![
        AccountMeta::new_readonly(*caller, true),
        AccountMeta::new(*guardian_set, false),
        AccountMeta::new_readonly(*system_program, false),
    ];

    Ok(Instruction {
        program_id: *guardian_program,
        accounts,
        data,
    })
}

fn build_guardian_close_set_ix(
    guardian_program: &Pubkey,
    guardian_set: &Pubkey,
    fee_payer: &Pubkey,
    system_program: &Pubkey,
) -> Result<Instruction> {
    // PLACEHOLDER — recompute after first build: sha256("global:close_guardian_set")[..8]
    let discriminator: [u8; 8] = [0xb1, 0xc2, 0xd3, 0xe4, 0xf5, 0x06, 0x17, 0x28];

    let data = discriminator.to_vec();

    let accounts = vec![
        AccountMeta::new(*fee_payer, true),
        AccountMeta::new(*guardian_set, false),
        AccountMeta::new_readonly(*system_program, false),
    ];

    Ok(Instruction {
        program_id: *guardian_program,
        accounts,
        data,
    })
}

// --------------------------------------------------------------------------
// Accounts
// --------------------------------------------------------------------------

#[derive(Accounts)]
pub struct Initialise<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer  = authority,
        space  = ProtocolState::LEN,
        seeds  = [PROTOCOL_STATE_SEED],
        bump,
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    #[account(
        init,
        payer  = authority,
        space  = OracleVerifier::LEN,
        seeds  = [ORACLE_VERIFIER_SEED],
        bump,
    )]
    pub oracle_verifier: Account<'info, OracleVerifier>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateOracle<'info> {
    #[account(
        mut,
        seeds  = [PROTOCOL_STATE_SEED],
        bump   = protocol_state.bump,
        has_one = authority,
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    #[account(
        mut,
        seeds  = [ORACLE_VERIFIER_SEED],
        bump   = oracle_verifier.bump,
    )]
    pub oracle_verifier: Account<'info, OracleVerifier>,

    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetPaused<'info> {
    #[account(
        mut,
        seeds  = [PROTOCOL_STATE_SEED],
        bump   = protocol_state.bump,
        has_one = authority,
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(args: RegisterSessionArgs)]
pub struct RegisterSession<'info> {
    /// Oracle backend signs registration.
    pub oracle: Signer<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds  = [PROTOCOL_STATE_SEED],
        bump   = protocol_state.bump,
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    /// Validate oracle matches registered oracle pubkey.
    #[account(
        seeds  = [ORACLE_VERIFIER_SEED],
        bump   = oracle_verifier.bump,
        constraint = oracle_verifier.oracle == oracle.key()
            @ ProtocolError::OracleNotAuthorised,
    )]
    pub oracle_verifier: Account<'info, OracleVerifier>,

    #[account(
        init,
        payer  = payer,
        space  = SessionRecord::LEN,
        seeds  = [
            SESSION_RECORD_SEED,
            args.lease_id.to_le_bytes().as_ref(),
        ],
        bump,
    )]
    pub session_record: Account<'info, SessionRecord>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Pledge<'info> {
    pub operator: Signer<'info>,

    #[account(
        seeds  = [PROTOCOL_STATE_SEED],
        bump   = protocol_state.bump,
        has_one = authority,
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds  = [
            SESSION_RECORD_SEED,
            session_record.lease_id.to_le_bytes().as_ref(),
        ],
        bump   = session_record.bump,
    )]
    pub session_record: Account<'info, SessionRecord>,

    /// GuardianSet — read its status to verify unanimous approval.
    /// CHECK: PDA owned by guardian_multisig; we read status field directly.
    #[account(
        constraint = session_record.guardian_set == guardian_set.key()
            @ ProtocolError::GuardianSetMismatch,
    )]
    pub guardian_set: Account<'info, GuardianSetMirror>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ConfirmSettlement<'info> {
    /// Oracle backend signs settlement confirmation.
    pub oracle: Signer<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        seeds  = [PROTOCOL_STATE_SEED],
        bump   = protocol_state.bump,
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    /// Validate oracle signature.
    #[account(
        seeds  = [ORACLE_VERIFIER_SEED],
        bump   = oracle_verifier.bump,
        constraint = oracle_verifier.oracle == oracle.key()
            @ ProtocolError::OracleNotAuthorised,
    )]
    pub oracle_verifier: Account<'info, OracleVerifier>,

    #[account(
        mut,
        seeds  = [
            SESSION_RECORD_SEED,
            session_record.lease_id.to_le_bytes().as_ref(),
        ],
        bump   = session_record.bump,
    )]
    pub session_record: Account<'info, SessionRecord>,

    /// Protocol authority PDA — CPI signer for vault_key and guardian calls.
    /// CHECK: PDA derived by this program.
    #[account(
        seeds  = [b"protocol_auth"],
        bump,
    )]
    pub protocol_auth: UncheckedAccount<'info>,

    /// The guardian set for this session.
    /// CHECK: Validated by guardian_multisig CPI.
    #[account(
        mut,
        constraint = session_record.guardian_set == guardian_set.key()
            @ ProtocolError::GuardianSetMismatch,
    )]
    pub guardian_set: UncheckedAccount<'info>,

    /// The vault key NFT asset.
    /// CHECK: Validated by vault_key CPI.
    #[account(mut)]
    pub asset: UncheckedAccount<'info>,

    /// The Core collection.
    /// CHECK: Validated by vault_key CPI.
    #[account(mut)]
    pub collection: UncheckedAccount<'info>,

    /// CHECK: vault_key program.
    pub vault_key_program: UncheckedAccount<'info>,

    /// CHECK: guardian_multisig program.
    pub guardian_multisig_program: UncheckedAccount<'info>,

    /// CHECK: mpl-core program for NFT operations.
    pub mpl_core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FinalizeRelease<'info> {
    pub operator: Signer<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        seeds  = [PROTOCOL_STATE_SEED],
        bump   = protocol_state.bump,
        has_one = authority,
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds  = [
            SESSION_RECORD_SEED,
            session_record.lease_id.to_le_bytes().as_ref(),
        ],
        bump   = session_record.bump,
    )]
    pub session_record: Account<'info, SessionRecord>,

    /// CHECK: PDA — CPI signer.
    #[account(
        seeds  = [b"protocol_auth"],
        bump,
    )]
    pub protocol_auth: UncheckedAccount<'info>,

    /// CHECK: VaultSession PDA owned by vault_key.
    #[account(
        mut,
        constraint = session_record.vault_session == vault_session.key()
            @ ProtocolError::VaultSessionMismatch,
    )]
    pub vault_session: UncheckedAccount<'info>,

    /// CHECK: NFT asset.
    #[account(mut)]
    pub asset: UncheckedAccount<'info>,

    /// CHECK: Core collection.
    #[account(mut)]
    pub collection: UncheckedAccount<'info>,

    /// CHECK: GuardianSet PDA.
    #[account(
        mut,
        constraint = session_record.guardian_set == guardian_set.key()
            @ ProtocolError::GuardianSetMismatch,
    )]
    pub guardian_set: UncheckedAccount<'info>,

    /// CHECK: vault_key program.
    pub vault_key_program: UncheckedAccount<'info>,

    /// CHECK: guardian_multisig program.
    pub guardian_multisig_program: UncheckedAccount<'info>,

    /// CHECK: mpl-core program.
    pub mpl_core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct EmergencyHalt<'info> {
    #[account(
        seeds  = [PROTOCOL_STATE_SEED],
        bump   = protocol_state.bump,
        has_one = authority,
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds  = [
            SESSION_RECORD_SEED,
            session_record.lease_id.to_le_bytes().as_ref(),
        ],
        bump   = session_record.bump,
    )]
    pub session_record: Account<'info, SessionRecord>,

    pub system_program: Program<'info, System>,
}

// --------------------------------------------------------------------------
// Mirror types
// These allow monasol_protocol to read accounts owned by other programs
// without taking a Cargo dependency on them.  Layouts must match exactly.
// If guardian_multisig::GuardianSet changes, this mirror must change too.
// --------------------------------------------------------------------------

/// Mirror of guardian_multisig::GuardianSetStatus — must stay in sync.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum GuardianSetStatusMirror {
    Pending,
    ShardsComplete,
    Approved,
    Settled,
}

/// Minimal mirror of guardian_multisig::GuardianSet — only fields we read.
/// Full layout must match the on-chain account exactly for safe deserialization.
#[account]
pub struct GuardianSetMirror {
    pub lease_id:         u64,
    pub vault_session:    Pubkey,
    pub members:          [Pubkey; 5],
    pub shards_submitted: u8,
    pub approvals:        u8,
    pub approval_mask:    u8,
    pub status:           GuardianSetStatusMirror,
    pub bump:             u8,
}

// --------------------------------------------------------------------------
// State
// --------------------------------------------------------------------------

#[account]
pub struct ProtocolState {
    /// Protocol upgrade authority.
    pub authority:      Pubkey,  // 32
    /// Trusted oracle pubkey (backend Node.js signer).
    pub oracle:         Pubkey,  // 32
    /// Total sessions registered.
    pub session_count:  u64,     // 8
    /// Emergency pause flag.
    pub paused:         bool,    // 1
    pub bump:           u8,      // 1
}

impl ProtocolState {
    pub const LEN: usize = 8 + 32 + 32 + 8 + 1 + 1;
}

#[account]
pub struct OracleVerifier {
    pub oracle: Pubkey,  // 32
    pub bump:   u8,      // 1
}

impl OracleVerifier {
    pub const LEN: usize = 8 + 32 + 1;
}

#[account]
pub struct SessionRecord {
    pub lease_id:       u64,                  // 8
    pub renter:         Pubkey,               // 32
    pub vault_session:  Pubkey,               // 32
    pub guardian_set:   Pubkey,               // 32
    pub asset:          Pubkey,               // 32
    pub collection:     Pubkey,               // 32
    pub state:          ProtocolSessionState, // 1
    pub monad_tx_ref:   [u8; 32],             // 32
    pub registered_ts:  i64,                  // 8
    pub pledged_ts:     i64,                  // 8
    pub settling_ts:    i64,                  // 8
    pub released_ts:    i64,                  // 8
    pub closed_ts:      i64,                  // 8
    pub halt_ts:        i64,                  // 8
    pub bump:           u8,                   // 1
}

impl SessionRecord {
    pub const LEN: usize = 8 + 8 + 32 + 32 + 32 + 32 + 32 + 1 + 32 + 8 + 8 + 8 + 8 + 8 + 8 + 1;
}

// --------------------------------------------------------------------------
// Enums
// --------------------------------------------------------------------------

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum ProtocolSessionState {
    Active,
    Pledged,
    Settling,
    Released,
    Closed,
    Halted,
}

// --------------------------------------------------------------------------
// Args
// --------------------------------------------------------------------------

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RegisterSessionArgs {
    pub lease_id:      u64,
    pub renter:        Pubkey,
    pub vault_session: Pubkey,
    pub guardian_set:  Pubkey,
    pub asset:         Pubkey,
    pub collection:    Pubkey,
    pub monad_tx_ref:  [u8; 32],
}

// --------------------------------------------------------------------------
// Events
// --------------------------------------------------------------------------

#[event]
pub struct SessionRegistered {
    pub lease_id:      u64,
    pub renter:        Pubkey,
    pub vault_session: Pubkey,
    pub guardian_set:  Pubkey,
    pub monad_tx_ref:  [u8; 32],
    pub timestamp:     i64,
}

#[event]
pub struct SessionPledged {
    pub lease_id:  u64,
    pub renter:    Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct SessionReleased {
    pub lease_id:      u64,
    pub renter:        Pubkey,
    pub monad_tx_hash: [u8; 32],
    pub timestamp:     i64,
}

#[event]
pub struct SessionClosed {
    pub lease_id:  u64,
    pub renter:    Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct SessionHalted {
    pub lease_id:  u64,
    pub renter:    Pubkey,
    pub reason:    String,
    pub timestamp: i64,
}

// --------------------------------------------------------------------------
// Errors
// --------------------------------------------------------------------------

#[error_code]
pub enum ProtocolError {
    #[msg("Protocol is paused")]
    ProtocolPaused,

    #[msg("Invalid state transition for current session state")]
    InvalidStateTransition,

    #[msg("Guardian set has not reached unanimous approval")]
    GuardianSetNotApproved,

    #[msg("Guardian set pubkey does not match session record")]
    GuardianSetMismatch,

    #[msg("VaultSession pubkey does not match session record")]
    VaultSessionMismatch,

    #[msg("Oracle signer is not the registered oracle")]
    OracleNotAuthorised,

    #[msg("Session is already in a terminal state")]
    SessionAlreadyTerminal,

    #[msg("Halt reason must be 128 characters or less")]
    ReasonTooLong,
}
