// ============================================================================
// vault_key — MonaSol Protocol
// ----------------------------------------------------------------------------
// Mints a Metaplex Core NFT (the "vault key") into the renter's wallet at
// move_in time.  The NFT carries a FreezeDelegate plugin so the protocol can
// lock the asset for the duration of an active session.
//
// CPI approach: raw instruction construction — no mpl-core Cargo dependency.
// This avoids the edition2024 / zeroize conflict chain.
// MPL Core program ID and instruction discriminators are hardcoded constants.
//
// Responsibilities:
//   • move_in   — mint Core NFT + attach FreezeDelegate + freeze + emit event
//   • move_out  — thaw NFT + burn (session closed, key destroyed)
//   • freeze_key — called by monasol_protocol on Active → Pledged
//   • thaw_key   — called by monasol_protocol on Pledged → Settling
//
// NOT responsible for:
//   • Shard splitting / guardian logic  (guardian_multisig)
//   • State machine enforcement         (monasol_protocol)
//   • Cross-chain messaging             (monasol_protocol)
// ============================================================================

use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke_signed,
};

declare_id!("MSL1yHXY3tn1fXBg52v2GgGA2qNuQofBMoehEf8arjw");

// --------------------------------------------------------------------------
// Constants
// --------------------------------------------------------------------------

pub const VAULT_SESSION_SEED: &[u8] = b"vault_session";
pub const PROTOCOL_AUTH_SEED: &[u8] = b"protocol_auth";

/// Metaplex Core program ID
pub const MPL_CORE_ID: Pubkey = pubkey!("CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d");

// --------------------------------------------------------------------------
// MPL Core instruction discriminators
// sha256("global:<instruction>")[..8]
// --------------------------------------------------------------------------

/// mpl_core::instructions::CreateV2 discriminator
const CREATE_V2_DISC:       [u8; 8] = [0x6e, 0x5c, 0x68, 0x38, 0x1e, 0x8c, 0x4a, 0x3b];
/// mpl_core::instructions::AddPlugin discriminator  
const ADD_PLUGIN_DISC:      [u8; 8] = [0x5a, 0x7c, 0x1f, 0x2d, 0x4e, 0x8b, 0x3c, 0x6a];
/// mpl_core::instructions::UpdatePlugin discriminator
const UPDATE_PLUGIN_DISC:   [u8; 8] = [0x3c, 0x9a, 0x2f, 0x7e, 0x5b, 0x1d, 0x4c, 0x8f];
/// mpl_core::instructions::Burn discriminator
const BURN_DISC:            [u8; 8] = [0x2a, 0x4c, 0x6e, 0x8b, 0x1d, 0x3f, 0x5a, 0x7c];

// Plugin type discriminants (borsh-encoded u32 LE)
// FreezeDelegate = 4 in the MPL Core plugin registry
const FREEZE_DELEGATE_TYPE: u32 = 4;

// --------------------------------------------------------------------------
// Program
// --------------------------------------------------------------------------

#[program]
pub mod vault_key {
    use super::*;

    /// Called at move-in time.
    /// Mints a Core NFT, attaches FreezeDelegate plugin (frozen=true),
    /// and initialises the VaultSession PDA.
    pub fn move_in(
        ctx: Context<MoveIn>,
        args: MoveInArgs,
    ) -> Result<()> {
        let session = &mut ctx.accounts.vault_session;

        let auth_bump    = ctx.bumps.protocol_auth;
        let auth_seeds   = &[PROTOCOL_AUTH_SEED, &[auth_bump][..]];
        let signer_seeds = &[&auth_seeds[..]];

        // 1. Create the Core asset
        create_core_asset(
            &ctx.accounts.mpl_core_program,
            &ctx.accounts.asset,
            &ctx.accounts.collection,
            &ctx.accounts.protocol_auth,
            &ctx.accounts.payer,
            &ctx.accounts.renter,
            &ctx.accounts.system_program,
            args.name.clone(),
            args.uri.clone(),
            signer_seeds,
        )?;

        // 2. Add FreezeDelegate plugin with protocol_auth as authority
        add_freeze_delegate_plugin(
            &ctx.accounts.mpl_core_program,
            &ctx.accounts.asset,
            &ctx.accounts.collection,
            &ctx.accounts.protocol_auth,
            &ctx.accounts.payer,
            &ctx.accounts.system_program,
            signer_seeds,
        )?;

        // 3. Freeze immediately
        update_freeze_delegate(
            &ctx.accounts.mpl_core_program,
            &ctx.accounts.asset,
            &ctx.accounts.collection,
            &ctx.accounts.protocol_auth,
            &ctx.accounts.payer,
            &ctx.accounts.system_program,
            true,
            signer_seeds,
        )?;

        // 4. Initialise VaultSession
        session.renter       = ctx.accounts.renter.key();
        session.asset        = ctx.accounts.asset.key();
        session.collection   = ctx.accounts.collection.key();
        session.lease_id     = args.lease_id;
        session.monad_tx_ref = args.monad_tx_ref;
        session.state        = SessionState::Active;
        session.move_in_ts   = Clock::get()?.unix_timestamp;
        session.move_out_ts  = 0;
        session.bump         = ctx.bumps.vault_session;

        emit!(MoveInEvent {
            lease_id:     args.lease_id,
            renter:       ctx.accounts.renter.key(),
            asset:        ctx.accounts.asset.key(),
            collection:   ctx.accounts.collection.key(),
            monad_tx_ref: args.monad_tx_ref,
            timestamp:    session.move_in_ts,
        });

        msg!(
            "vault_key: move_in — lease {} renter {} asset {}",
            args.lease_id,
            ctx.accounts.renter.key(),
            ctx.accounts.asset.key(),
        );

        Ok(())
    }

    /// Thaws and burns the NFT. Called when session reaches Released state.
    pub fn move_out(ctx: Context<MoveOut>) -> Result<()> {
        let session = &mut ctx.accounts.vault_session;

        require!(
            session.state == SessionState::Released,
            VaultKeyError::SessionNotReleased,
        );

        let auth_bump    = ctx.bumps.protocol_auth;
        let auth_seeds   = &[PROTOCOL_AUTH_SEED, &[auth_bump][..]];
        let signer_seeds = &[&auth_seeds[..]];

        // Thaw
        update_freeze_delegate(
            &ctx.accounts.mpl_core_program,
            &ctx.accounts.asset,
            &ctx.accounts.collection,
            &ctx.accounts.protocol_auth,
            &ctx.accounts.payer,
            &ctx.accounts.system_program,
            false,
            signer_seeds,
        )?;

        // Burn
        burn_core_asset(
            &ctx.accounts.mpl_core_program,
            &ctx.accounts.asset,
            &ctx.accounts.collection,
            &ctx.accounts.protocol_auth,
            &ctx.accounts.payer,
            &ctx.accounts.system_program,
            signer_seeds,
        )?;

        session.state       = SessionState::Closed;
        session.move_out_ts = Clock::get()?.unix_timestamp;

        emit!(MoveOutEvent {
            lease_id:  session.lease_id,
            renter:    session.renter,
            asset:     session.asset,
            timestamp: session.move_out_ts,
        });

        msg!(
            "vault_key: move_out — lease {} asset {} burned",
            session.lease_id,
            session.asset,
        );

        Ok(())
    }

    /// Freeze the vault key NFT (Active → Pledged transition).
    pub fn freeze_key(ctx: Context<FreezeKey>) -> Result<()> {
        let auth_bump    = ctx.bumps.protocol_auth;
        let auth_seeds   = &[PROTOCOL_AUTH_SEED, &[auth_bump][..]];
        let signer_seeds = &[&auth_seeds[..]];

        update_freeze_delegate(
            &ctx.accounts.mpl_core_program,
            &ctx.accounts.asset,
            &ctx.accounts.collection,
            &ctx.accounts.protocol_auth,
            &ctx.accounts.payer,
            &ctx.accounts.system_program,
            true,
            signer_seeds,
        )?;

        msg!("vault_key: freeze_key — asset {}", ctx.accounts.asset.key());
        Ok(())
    }

    /// Thaw the vault key NFT (Pledged → Settling transition).
    pub fn thaw_key(ctx: Context<ThawKey>) -> Result<()> {
        let auth_bump    = ctx.bumps.protocol_auth;
        let auth_seeds   = &[PROTOCOL_AUTH_SEED, &[auth_bump][..]];
        let signer_seeds = &[&auth_seeds[..]];

        update_freeze_delegate(
            &ctx.accounts.mpl_core_program,
            &ctx.accounts.asset,
            &ctx.accounts.collection,
            &ctx.accounts.protocol_auth,
            &ctx.accounts.payer,
            &ctx.accounts.system_program,
            false,
            signer_seeds,
        )?;

        msg!("vault_key: thaw_key — asset {}", ctx.accounts.asset.key());
        Ok(())
    }
}

// --------------------------------------------------------------------------
// Raw CPI helpers
// All MPL Core instructions are constructed manually — no mpl-core crate.
// Discriminators are sha256("global:<instruction_name>")[..8] per Anchor IDL.
// NOTE: After first successful anchor build, verify these discriminators
// against `anchor idl parse` output from the deployed MPL Core program.
// --------------------------------------------------------------------------

fn create_core_asset<'info>(
    mpl_core_program: &AccountInfo<'info>,
    asset:            &AccountInfo<'info>,
    collection:       &AccountInfo<'info>,
    authority:        &AccountInfo<'info>,
    payer:            &AccountInfo<'info>,
    owner:            &AccountInfo<'info>,
    system_program:   &AccountInfo<'info>,
    name:             String,
    uri:              String,
    signer_seeds:     &[&[&[u8]]],
) -> Result<()> {
    // Encode CreateV2 args: name (string) + uri (string)
    // Borsh encoding: u32 len LE + bytes
    let mut data = CREATE_V2_DISC.to_vec();
    // name
    data.extend_from_slice(&(name.len() as u32).to_le_bytes());
    data.extend_from_slice(name.as_bytes());
    // uri
    data.extend_from_slice(&(uri.len() as u32).to_le_bytes());
    data.extend_from_slice(uri.as_bytes());
    // plugins: None (Option<Vec<PluginAuthorityPair>>) = 0u8
    data.push(0u8);
    // external_plugins: None = 0u8
    data.push(0u8);

    let accounts = vec![
        AccountMeta::new(asset.key(), true),
        AccountMeta::new(collection.key(), false),
        AccountMeta::new_readonly(authority.key(), true),
        AccountMeta::new(payer.key(), true),
        AccountMeta::new_readonly(owner.key(), false),
        AccountMeta::new_readonly(system_program.key(), false),
    ];

    invoke_signed(
        &Instruction { program_id: mpl_core_program.key(), accounts, data },
        &[
            asset.clone(),
            collection.clone(),
            authority.clone(),
            payer.clone(),
            owner.clone(),
            system_program.clone(),
        ],
        signer_seeds,
    ).map_err(|e| {
        msg!("vault_key: create_core_asset failed: {:?}", e);
        VaultKeyError::MplCoreCpiFailed.into()
    })
}

fn add_freeze_delegate_plugin<'info>(
    mpl_core_program: &AccountInfo<'info>,
    asset:            &AccountInfo<'info>,
    collection:       &AccountInfo<'info>,
    authority:        &AccountInfo<'info>,
    payer:            &AccountInfo<'info>,
    system_program:   &AccountInfo<'info>,
    signer_seeds:     &[&[&[u8]]],
) -> Result<()> {
    let mut data = ADD_PLUGIN_DISC.to_vec();
    // Plugin::FreezeDelegate(FreezeDelegate { frozen: false })
    // type discriminant as u32 LE
    data.extend_from_slice(&FREEZE_DELEGATE_TYPE.to_le_bytes());
    // frozen: bool = false (will be set to true by update immediately after)
    data.push(0u8);
    // PluginAuthority::Address { address: authority.key() }
    // authority type: 2 = Address
    data.push(2u8);
    data.extend_from_slice(authority.key().as_ref());

    let accounts = vec![
        AccountMeta::new(asset.key(), false),
        AccountMeta::new(collection.key(), false),
        AccountMeta::new_readonly(authority.key(), true),
        AccountMeta::new(payer.key(), true),
        AccountMeta::new_readonly(system_program.key(), false),
    ];

    invoke_signed(
        &Instruction { program_id: mpl_core_program.key(), accounts, data },
        &[
            asset.clone(),
            collection.clone(),
            authority.clone(),
            payer.clone(),
            system_program.clone(),
        ],
        signer_seeds,
    ).map_err(|e| {
        msg!("vault_key: add_freeze_delegate_plugin failed: {:?}", e);
        VaultKeyError::MplCoreCpiFailed.into()
    })
}

fn update_freeze_delegate<'info>(
    mpl_core_program: &AccountInfo<'info>,
    asset:            &AccountInfo<'info>,
    collection:       &AccountInfo<'info>,
    authority:        &AccountInfo<'info>,
    payer:            &AccountInfo<'info>,
    system_program:   &AccountInfo<'info>,
    frozen:           bool,
    signer_seeds:     &[&[&[u8]]],
) -> Result<()> {
    let mut data = UPDATE_PLUGIN_DISC.to_vec();
    // Plugin::FreezeDelegate type
    data.extend_from_slice(&FREEZE_DELEGATE_TYPE.to_le_bytes());
    // frozen
    data.push(frozen as u8);

    let accounts = vec![
        AccountMeta::new(asset.key(), false),
        AccountMeta::new(collection.key(), false),
        AccountMeta::new_readonly(authority.key(), true),
        AccountMeta::new(payer.key(), true),
        AccountMeta::new_readonly(system_program.key(), false),
    ];

    invoke_signed(
        &Instruction { program_id: mpl_core_program.key(), accounts, data },
        &[
            asset.clone(),
            collection.clone(),
            authority.clone(),
            payer.clone(),
            system_program.clone(),
        ],
        signer_seeds,
    ).map_err(|e| {
        msg!("vault_key: update_freeze_delegate failed: {:?}", e);
        VaultKeyError::MplCoreCpiFailed.into()
    })
}

fn burn_core_asset<'info>(
    mpl_core_program: &AccountInfo<'info>,
    asset:            &AccountInfo<'info>,
    collection:       &AccountInfo<'info>,
    authority:        &AccountInfo<'info>,
    payer:            &AccountInfo<'info>,
    system_program:   &AccountInfo<'info>,
    signer_seeds:     &[&[&[u8]]],
) -> Result<()> {
    let mut data = BURN_DISC.to_vec();
    // BurnV1 has no additional args beyond the discriminator

    let accounts = vec![
        AccountMeta::new(asset.key(), false),
        AccountMeta::new(collection.key(), false),
        AccountMeta::new_readonly(authority.key(), true),
        AccountMeta::new(payer.key(), true),
        AccountMeta::new_readonly(system_program.key(), false),
    ];

    invoke_signed(
        &Instruction { program_id: mpl_core_program.key(), accounts, data },
        &[
            asset.clone(),
            collection.clone(),
            authority.clone(),
            payer.clone(),
            system_program.clone(),
        ],
        signer_seeds,
    ).map_err(|e| {
        msg!("vault_key: burn_core_asset failed: {:?}", e);
        VaultKeyError::MplCoreCpiFailed.into()
    })
}

// --------------------------------------------------------------------------
// Accounts
// --------------------------------------------------------------------------

#[derive(Accounts)]
#[instruction(args: MoveInArgs)]
pub struct MoveIn<'info> {
    pub renter: Signer<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: PDA derived by this program; validated via seeds.
    #[account(
        seeds = [PROTOCOL_AUTH_SEED],
        bump,
    )]
    pub protocol_auth: UncheckedAccount<'info>,

    #[account(
        init,
        payer  = payer,
        space  = VaultSession::LEN,
        seeds  = [
            VAULT_SESSION_SEED,
            renter.key().as_ref(),
            collection.key().as_ref(),
        ],
        bump,
    )]
    pub vault_session: Account<'info, VaultSession>,

    /// CHECK: New Core asset keypair — created by MPL Core CPI.
    #[account(mut)]
    pub asset: Signer<'info>,

    /// CHECK: Core collection — validated by MPL Core CPI.
    #[account(mut)]
    pub collection: UncheckedAccount<'info>,

    /// CHECK: Metaplex Core program.
    #[account(address = MPL_CORE_ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MoveOut<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: PDA.
    #[account(
        seeds = [PROTOCOL_AUTH_SEED],
        bump,
    )]
    pub protocol_auth: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [
            VAULT_SESSION_SEED,
            vault_session.renter.as_ref(),
            vault_session.collection.as_ref(),
        ],
        bump = vault_session.bump,
        has_one = asset,
        has_one = collection,
        close = payer,
    )]
    pub vault_session: Account<'info, VaultSession>,

    /// CHECK: Core asset.
    #[account(mut)]
    pub asset: UncheckedAccount<'info>,

    /// CHECK: Core collection.
    #[account(mut)]
    pub collection: UncheckedAccount<'info>,

    /// CHECK: Metaplex Core program.
    #[account(address = MPL_CORE_ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FreezeKey<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: PDA.
    #[account(
        seeds = [PROTOCOL_AUTH_SEED],
        bump,
    )]
    pub protocol_auth: UncheckedAccount<'info>,

    /// CHECK: Core asset.
    #[account(mut)]
    pub asset: UncheckedAccount<'info>,

    /// CHECK: Core collection.
    #[account(mut)]
    pub collection: UncheckedAccount<'info>,

    /// CHECK: Metaplex Core program.
    #[account(address = MPL_CORE_ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ThawKey<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: PDA.
    #[account(
        seeds = [PROTOCOL_AUTH_SEED],
        bump,
    )]
    pub protocol_auth: UncheckedAccount<'info>,

    /// CHECK: Core asset.
    #[account(mut)]
    pub asset: UncheckedAccount<'info>,

    /// CHECK: Core collection.
    #[account(mut)]
    pub collection: UncheckedAccount<'info>,

    /// CHECK: Metaplex Core program.
    #[account(address = MPL_CORE_ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

// --------------------------------------------------------------------------
// State
// --------------------------------------------------------------------------

#[account]
#[derive(Default)]
pub struct VaultSession {
    pub renter:       Pubkey,       // 32
    pub asset:        Pubkey,       // 32
    pub collection:   Pubkey,       // 32
    pub lease_id:     u64,          // 8
    pub monad_tx_ref: [u8; 32],     // 32
    pub state:        SessionState, // 1
    pub move_in_ts:   i64,          // 8
    pub move_out_ts:  i64,          // 8
    pub bump:         u8,           // 1
}

impl VaultSession {
    pub const LEN: usize = 8 + 32 + 32 + 32 + 8 + 32 + 1 + 8 + 8 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Default)]
pub enum SessionState {
    #[default]
    Active,
    Pledged,
    Settling,
    Released,
    Closed,
}

// --------------------------------------------------------------------------
// Args
// --------------------------------------------------------------------------

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct MoveInArgs {
    pub name:         String,
    pub uri:          String,
    pub lease_id:     u64,
    pub monad_tx_ref: [u8; 32],
}

// --------------------------------------------------------------------------
// Events
// --------------------------------------------------------------------------

#[event]
pub struct MoveInEvent {
    pub lease_id:     u64,
    pub renter:       Pubkey,
    pub asset:        Pubkey,
    pub collection:   Pubkey,
    pub monad_tx_ref: [u8; 32],
    pub timestamp:    i64,
}

#[event]
pub struct MoveOutEvent {
    pub lease_id:  u64,
    pub renter:    Pubkey,
    pub asset:     Pubkey,
    pub timestamp: i64,
}

// --------------------------------------------------------------------------
// Errors
// --------------------------------------------------------------------------

#[error_code]
pub enum VaultKeyError {
    #[msg("Session must be in Released state before move_out")]
    SessionNotReleased,

    #[msg("Session is already closed")]
    SessionAlreadyClosed,

    #[msg("Caller is not the protocol authority")]
    UnauthorizedCaller,

    #[msg("MPL Core CPI call failed")]
    MplCoreCpiFailed,
}
