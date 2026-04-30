// ============================================================================
// guardian_multisig — MonaSol Protocol
// ----------------------------------------------------------------------------
// Manages the 5-member guardian council for a vault session:
//
//   Role breakdown:
//     • 2 Shard Members  — each captures and records one cryptographic
//                          fragment of the NFT access credential (2-of-2 split)
//     • 3 Approvers      — unanimous consent required to advance the session
//                          from Pledged → Settling
//
//   Shard model:
//     The NFT access credential is split client-side into two fragments using
//     a 2-of-2 XOR split (both fragments required to reconstruct).  Each shard
//     member submits a SHA-256 commitment hash of their fragment on-chain.
//     The raw fragments never touch the chain — only the commitments.
//     Reconstruction happens off-chain when both shard members cooperate.
//
//   Instructions:
//     • init_guardian_set   — register the 5 guardians for a session
//     • submit_shard        — shard member records their commitment hash
//     • approve_settlement  — approver casts unanimous consent vote
//     • revoke_approval     — approver withdraws consent (before threshold met)
//     • mark_settled        — monasol_protocol marks Approved → Settled
//     • close_guardian_set  — cleanup after session is Settled
//
// ============================================================================

use anchor_lang::prelude::*;

declare_id!("MSLLafYHvuDb1kkukoEijtnERRScQn2n6x7YyH2mMhX");

// --------------------------------------------------------------------------
// Constants
// --------------------------------------------------------------------------

pub const GUARDIAN_SET_SEED: &[u8]  = b"guardian_set";
pub const SHARD_RECORD_SEED: &[u8]  = b"shard_record";
pub const APPROVAL_SEED: &[u8]      = b"approval";

/// Total guardian council size.
pub const GUARDIAN_COUNT: usize     = 5;
/// Number of shard-holding members (2-of-2 split).
pub const SHARD_MEMBER_COUNT: usize = 2;
/// Approvers required for unanimous consent.
pub const APPROVER_COUNT: usize     = 3;

// --------------------------------------------------------------------------
// Program
// --------------------------------------------------------------------------

#[program]
pub mod guardian_multisig {
    use super::*;

    /// Register the guardian council for a vault session.
    ///
    /// Called once per session by the protocol operator immediately after
    /// `vault_key::move_in`.  The five guardian pubkeys are fixed for the
    /// lifetime of the session — no rotation after init.
    ///
    /// Layout of `members` array (enforced by instruction):
    ///   [0] shard_member_0
    ///   [1] shard_member_1
    ///   [2] approver_0
    ///   [3] approver_1
    ///   [4] approver_2
    pub fn init_guardian_set(
        ctx: Context<InitGuardianSet>,
        args: InitGuardianSetArgs,
    ) -> Result<()> {
        require!(
            args.members.len() == GUARDIAN_COUNT,
            GuardianError::InvalidMemberCount,
        );

        // Ensure no duplicate members
        for i in 0..GUARDIAN_COUNT {
            for j in (i + 1)..GUARDIAN_COUNT {
                require!(
                    args.members[i] != args.members[j],
                    GuardianError::DuplicateMember,
                );
            }
        }

        let gs = &mut ctx.accounts.guardian_set;
        gs.lease_id         = args.lease_id;
        gs.vault_session    = args.vault_session;
        // Safe: length already validated to be exactly GUARDIAN_COUNT above
        gs.members          = args.members.try_into().unwrap();
        gs.shards_submitted = 0;
        gs.approvals        = 0;
        gs.approval_mask    = 0b000; // bits 0-2 map to approver_0..2
        gs.status           = GuardianSetStatus::Pending;
        gs.bump             = ctx.bumps.guardian_set;

        emit!(GuardianSetInitialised {
            lease_id:      args.lease_id,
            vault_session: args.vault_session,
            members:       gs.members,
        });

        msg!(
            "guardian_multisig: init_guardian_set — lease {} session {}",
            args.lease_id,
            args.vault_session,
        );

        Ok(())
    }

    /// Shard member submits their commitment hash.
    ///
    /// `commitment` is SHA-256(fragment_bytes || lease_id_le_bytes).
    /// Mixing in the lease_id prevents cross-session replay of commitments.
    ///
    /// Both shard members must submit before approvers can vote.
    pub fn submit_shard(
        ctx: Context<SubmitShard>,
        commitment: [u8; 32],
    ) -> Result<()> {
        let gs      = &mut ctx.accounts.guardian_set;
        let record  = &mut ctx.accounts.shard_record;
        let caller  = ctx.accounts.shard_member.key();

        require!(
            gs.status == GuardianSetStatus::Pending,
            GuardianError::SetNotPending,
        );

        // Verify caller is one of the two shard members (index 0 or 1)
        let shard_index = gs.members[..SHARD_MEMBER_COUNT]
            .iter()
            .position(|m| *m == caller)
            .ok_or(GuardianError::NotAShardMember)?;

        require!(
            !record.submitted,
            GuardianError::ShardAlreadySubmitted,
        );

        // Persist the commitment
        record.lease_id     = gs.lease_id;
        record.shard_index  = shard_index as u8;
        record.member       = caller;
        record.commitment   = commitment;
        record.submitted    = true;
        record.submitted_ts = Clock::get()?.unix_timestamp;
        record.bump         = ctx.bumps.shard_record;

        gs.shards_submitted += 1;

        // Once both shards are in, advance status so approvers can vote
        if gs.shards_submitted == SHARD_MEMBER_COUNT as u8 {
            gs.status = GuardianSetStatus::ShardsComplete;
        }

        emit!(ShardSubmitted {
            lease_id:    gs.lease_id,
            shard_index: record.shard_index,
            member:      caller,
            commitment,
            timestamp:   record.submitted_ts,
        });

        msg!(
            "guardian_multisig: submit_shard — lease {} index {} member {}",
            gs.lease_id,
            shard_index,
            caller,
        );

        Ok(())
    }

    /// Approver casts their unanimous consent vote.
    ///
    /// All three approvers must vote before `guardian_set.status` advances
    /// to `Approved`.  When approved, `monasol_protocol` may drive the
    /// session from `Pledged → Settling`.
    pub fn approve_settlement(ctx: Context<ApproveSettlement>) -> Result<()> {
        let gs       = &mut ctx.accounts.guardian_set;
        let approval = &mut ctx.accounts.approval;
        let caller   = ctx.accounts.approver.key();

        require!(
            gs.status == GuardianSetStatus::ShardsComplete,
            GuardianError::ShardsNotComplete,
        );

        // Verify caller is one of the three approvers (index 2..4)
        let approver_index = gs.members[SHARD_MEMBER_COUNT..]
            .iter()
            .position(|m| *m == caller)
            .ok_or(GuardianError::NotAnApprover)?;

        let bit = 1u8 << approver_index;
        require!(
            gs.approval_mask & bit == 0,
            GuardianError::AlreadyApproved,
        );

        // Record the approval
        approval.lease_id       = gs.lease_id;
        approval.approver       = caller;
        approval.approver_index = approver_index as u8;
        approval.approved       = true;
        approval.approved_ts    = Clock::get()?.unix_timestamp;
        approval.bump           = ctx.bumps.approval;

        gs.approval_mask |= bit;
        gs.approvals     += 1;

        // Unanimous consent — all 3 approvers voted
        if gs.approvals == APPROVER_COUNT as u8 {
            gs.status = GuardianSetStatus::Approved;
        }

        emit!(ApprovalCast {
            lease_id:         gs.lease_id,
            approver:         caller,
            approver_index:   approver_index as u8,
            approvals_so_far: gs.approvals,
            unanimous:        gs.status == GuardianSetStatus::Approved,
            timestamp:        approval.approved_ts,
        });

        msg!(
            "guardian_multisig: approve_settlement — lease {} approver {} ({}/{})",
            gs.lease_id,
            caller,
            gs.approvals,
            APPROVER_COUNT,
        );

        Ok(())
    }

    /// Approver withdraws their vote.
    ///
    /// Only permitted before unanimous consent is reached.
    /// Once `Approved` or `Settled`, the set is locked — no revocation.
    pub fn revoke_approval(ctx: Context<RevokeApproval>) -> Result<()> {
        let gs       = &mut ctx.accounts.guardian_set;
        let approval = &mut ctx.accounts.approval;
        let caller   = ctx.accounts.approver.key();

        // Block revocation once Approved or Settled — shards don't regress,
        // only approval votes can be withdrawn while still in ShardsComplete.
        require!(
            gs.status != GuardianSetStatus::Approved
                && gs.status != GuardianSetStatus::Settled,
            GuardianError::AlreadyApprovedCannotRevoke,
        );

        require!(
            approval.approved,
            GuardianError::NotYetApproved,
        );

        let bit = 1u8 << approval.approver_index;
        gs.approval_mask &= !bit;
        gs.approvals     -= 1;
        approval.approved = false;

        emit!(ApprovalRevoked {
            lease_id:       gs.lease_id,
            approver:       caller,
            approver_index: approval.approver_index,
            timestamp:      Clock::get()?.unix_timestamp,
        });

        msg!(
            "guardian_multisig: revoke_approval — lease {} approver {}",
            gs.lease_id,
            caller,
        );

        Ok(())
    }

    /// Called by monasol_protocol to mark the guardian set as settled.
    /// Transitions status Approved → Settled so close_guardian_set can run.
    ///
    /// TODO: Enforce that caller is monasol_protocol's program authority PDA
    ///       once the CPI pattern is wired in monasol_protocol.
    pub fn mark_settled(ctx: Context<MarkSettled>) -> Result<()> {
        let gs = &mut ctx.accounts.guardian_set;

        require!(
            gs.status == GuardianSetStatus::Approved,
            GuardianError::SetNotApproved,
        );

        gs.status = GuardianSetStatus::Settled;

        msg!(
            "guardian_multisig: mark_settled — lease {}",
            gs.lease_id,
        );

        Ok(())
    }

    /// Close the guardian set after a session ends.
    ///
    /// Rent is returned to the fee payer.  Only callable once the
    /// guardian set is in Settled status (monasol_protocol sets this
    /// before the session is Released).
    pub fn close_guardian_set(ctx: Context<CloseGuardianSet>) -> Result<()> {
        let gs = &ctx.accounts.guardian_set;

        require!(
            gs.status == GuardianSetStatus::Settled,
            GuardianError::SetNotSettled,
        );

        msg!(
            "guardian_multisig: close_guardian_set — lease {}",
            gs.lease_id,
        );

        // Account is closed via `close = fee_payer` constraint below
        Ok(())
    }
}

// --------------------------------------------------------------------------
// Accounts
// --------------------------------------------------------------------------

#[derive(Accounts)]
#[instruction(args: InitGuardianSetArgs)]
pub struct InitGuardianSet<'info> {
    /// Protocol operator — pays for the guardian set account.
    #[account(mut)]
    pub operator: Signer<'info>,

    #[account(
        init,
        payer = operator,
        space = GuardianSet::LEN,
        seeds = [
            GUARDIAN_SET_SEED,
            args.lease_id.to_le_bytes().as_ref(),
        ],
        bump,
    )]
    pub guardian_set: Account<'info, GuardianSet>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SubmitShard<'info> {
    /// Must be one of the two shard members registered in guardian_set.
    pub shard_member: Signer<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [
            GUARDIAN_SET_SEED,
            guardian_set.lease_id.to_le_bytes().as_ref(),
        ],
        bump = guardian_set.bump,
    )]
    pub guardian_set: Account<'info, GuardianSet>,

    /// One ShardRecord per shard member per session.
    #[account(
        init,
        payer = payer,
        space = ShardRecord::LEN,
        seeds = [
            SHARD_RECORD_SEED,
            guardian_set.lease_id.to_le_bytes().as_ref(),
            shard_member.key().as_ref(),
        ],
        bump,
    )]
    pub shard_record: Account<'info, ShardRecord>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ApproveSettlement<'info> {
    /// Must be one of the three approvers registered in guardian_set.
    pub approver: Signer<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [
            GUARDIAN_SET_SEED,
            guardian_set.lease_id.to_le_bytes().as_ref(),
        ],
        bump = guardian_set.bump,
    )]
    pub guardian_set: Account<'info, GuardianSet>,

    /// One Approval record per approver per session.
    #[account(
        init,
        payer = payer,
        space = ApprovalRecord::LEN,
        seeds = [
            APPROVAL_SEED,
            guardian_set.lease_id.to_le_bytes().as_ref(),
            approver.key().as_ref(),
        ],
        bump,
    )]
    pub approval: Account<'info, ApprovalRecord>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevokeApproval<'info> {
    pub approver: Signer<'info>,

    #[account(
        mut,
        seeds = [
            GUARDIAN_SET_SEED,
            guardian_set.lease_id.to_le_bytes().as_ref(),
        ],
        bump = guardian_set.bump,
    )]
    pub guardian_set: Account<'info, GuardianSet>,

    #[account(
        mut,
        seeds = [
            APPROVAL_SEED,
            guardian_set.lease_id.to_le_bytes().as_ref(),
            approver.key().as_ref(),
        ],
        bump = approval.bump,
        has_one = approver,
    )]
    pub approval: Account<'info, ApprovalRecord>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseGuardianSet<'info> {
    #[account(mut)]
    pub fee_payer: Signer<'info>,

    #[account(
        mut,
        seeds = [
            GUARDIAN_SET_SEED,
            guardian_set.lease_id.to_le_bytes().as_ref(),
        ],
        bump = guardian_set.bump,
        close = fee_payer,
    )]
    pub guardian_set: Account<'info, GuardianSet>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MarkSettled<'info> {
    /// Only monasol_protocol's program authority should call this.
    /// Full CPI-caller restriction wired in monasol_protocol.
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [
            GUARDIAN_SET_SEED,
            guardian_set.lease_id.to_le_bytes().as_ref(),
        ],
        bump = guardian_set.bump,
    )]
    pub guardian_set: Account<'info, GuardianSet>,

    pub system_program: Program<'info, System>,
}

// --------------------------------------------------------------------------
// State
// --------------------------------------------------------------------------

#[account]
pub struct GuardianSet {
    /// Lease ID from Monad — ties this set to a VaultSession.
    pub lease_id:         u64,              // 8
    /// The VaultSession PDA this guardian set protects.
    pub vault_session:    Pubkey,           // 32
    /// All 5 members: [shard_0, shard_1, approver_0, approver_1, approver_2]
    pub members:          [Pubkey; 5],      // 160
    /// How many shard commitments have been submitted (0, 1, or 2).
    pub shards_submitted: u8,              // 1
    /// How many approvers have voted (0..3).
    pub approvals:        u8,              // 1
    /// Bitmask of approver votes — bit N = approver index N has voted.
    pub approval_mask:    u8,              // 1
    /// Current status of this guardian set.
    pub status:           GuardianSetStatus, // 1
    pub bump:             u8,              // 1
}

impl GuardianSet {
    // discriminator(8) + fields
    pub const LEN: usize = 8 + 8 + 32 + 160 + 1 + 1 + 1 + 1 + 1;
}

#[account]
pub struct ShardRecord {
    /// Lease ID — for cross-reference.
    pub lease_id:     u64,       // 8
    /// Which shard index (0 or 1).
    pub shard_index:  u8,        // 1
    /// The shard member's pubkey.
    pub member:       Pubkey,    // 32
    /// SHA-256(fragment_bytes || lease_id_le_bytes)
    pub commitment:   [u8; 32],  // 32
    /// Whether this record has been submitted.
    pub submitted:    bool,      // 1
    /// Submission timestamp.
    pub submitted_ts: i64,       // 8
    pub bump:         u8,        // 1
}

impl ShardRecord {
    pub const LEN: usize = 8 + 8 + 1 + 32 + 32 + 1 + 8 + 1;
}

#[account]
pub struct ApprovalRecord {
    pub lease_id:       u64,    // 8
    pub approver:       Pubkey, // 32
    pub approver_index: u8,     // 1
    pub approved:       bool,   // 1
    pub approved_ts:    i64,    // 8
    pub bump:           u8,     // 1
}

impl ApprovalRecord {
    pub const LEN: usize = 8 + 8 + 32 + 1 + 1 + 8 + 1;
}

// --------------------------------------------------------------------------
// Enums
// --------------------------------------------------------------------------

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum GuardianSetStatus {
    /// Initialised — waiting for shard submissions.
    Pending,
    /// Both shard commitments recorded — approvers may now vote.
    ShardsComplete,
    /// All 3 approvers have voted — unanimous consent reached.
    Approved,
    /// Monad-side settlement confirmed — ready to close.
    Settled,
}

// --------------------------------------------------------------------------
// Args
// --------------------------------------------------------------------------

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitGuardianSetArgs {
    pub lease_id:      u64,
    pub vault_session: Pubkey,
    /// Exactly 5 pubkeys: [shard_0, shard_1, approver_0, approver_1, approver_2]
    pub members:       Vec<Pubkey>,
}

// --------------------------------------------------------------------------
// Events
// --------------------------------------------------------------------------

#[event]
pub struct GuardianSetInitialised {
    pub lease_id:      u64,
    pub vault_session: Pubkey,
    pub members:       [Pubkey; 5],
}

#[event]
pub struct ShardSubmitted {
    pub lease_id:    u64,
    pub shard_index: u8,
    pub member:      Pubkey,
    pub commitment:  [u8; 32],
    pub timestamp:   i64,
}

#[event]
pub struct ApprovalCast {
    pub lease_id:         u64,
    pub approver:         Pubkey,
    pub approver_index:   u8,
    pub approvals_so_far: u8,
    pub unanimous:        bool,
    pub timestamp:        i64,
}

#[event]
pub struct ApprovalRevoked {
    pub lease_id:       u64,
    pub approver:       Pubkey,
    pub approver_index: u8,
    pub timestamp:      i64,
}

// --------------------------------------------------------------------------
// Errors
// --------------------------------------------------------------------------

#[error_code]
pub enum GuardianError {
    #[msg("Guardian set must have exactly 5 members")]
    InvalidMemberCount,

    #[msg("Duplicate member address in guardian set")]
    DuplicateMember,

    #[msg("Guardian set is not in Pending status")]
    SetNotPending,

    #[msg("Caller is not a registered shard member")]
    NotAShardMember,

    #[msg("Shard commitment already submitted by this member")]
    ShardAlreadySubmitted,

    #[msg("Both shards must be submitted before approvers can vote")]
    ShardsNotComplete,

    #[msg("Caller is not a registered approver")]
    NotAnApprover,

    #[msg("This approver has already cast their vote")]
    AlreadyApproved,

    #[msg("Cannot revoke — unanimous consent already reached or session settled")]
    AlreadyApprovedCannotRevoke,

    #[msg("Approver has not yet cast a vote")]
    NotYetApproved,

    #[msg("Guardian set must be in Approved status to mark settled")]
    SetNotApproved,

    #[msg("Guardian set must be in Settled status to close")]
    SetNotSettled,
}
