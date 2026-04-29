use anchor_lang::prelude::*;

declare_id!("4j5qMBBFtg5SL7JjjaCr7jqTNwHDu2Zt2Zf2miozsr9j");

#[program]
pub mod solana {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
