// ============================================================
// NexusBridge Backend — server.js
// Express + Supabase
// Place in your Replit project root
// Run: node server.js
// ============================================================

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

// ── Supabase client ──────────────────────────────────────────
// Add these to your Replit Secrets:
//   SUPABASE_URL      → your project URL
//   SUPABASE_ANON_KEY → your anon/public key
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// ── Constants ────────────────────────────────────────────────
const LEASE_FEE_SOL    = 0.05;   // lifetime lease — flat, tier-independent for now
const MOVE_IN_FEE_SOL  = 0.001;  // flat move-in transaction fee
const DEPOSIT_FEE_SOL  = 0.001;  // flat deposit fee
const WITHDRAW_FEE_SOL = 0.001;  // flat withdrawal fee

// ── Helpers ──────────────────────────────────────────────────

// Generate abbreviated vault/locker refs from full integers
function abbreviate(prefix, num) {
  const s = String(num).padStart(10, '0');
  return `${prefix}-${s.slice(0,4)}...${s.slice(-3)}`;
}

// Generate a unique random vault number within a locker
async function generateVaultNumber(lockerId) {
  // In production this will be derived from the smart contract
  // For now: random large integer not already used in this locker
  let vaultNumber;
  let exists = true;
  while (exists) {
    vaultNumber = Math.floor(Math.random() * 99_999_999) + 10_000_000;
    const { data } = await supabase
      .from('vaults')
      .select('id')
      .eq('locker_id', lockerId)
      .eq('vault_number', vaultNumber)
      .single();
    exists = !!data;
  }
  return vaultNumber;
}

// ── Routes ───────────────────────────────────────────────────

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok' }));

// GET /lockers
// Returns all active lockers with capacity info
app.get('/lockers', async (_, res) => {
  const { data, error } = await supabase
    .from('lockers')
    .select('*')
    .eq('status', 'active')
    .order('vault_count', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /vault/:ownerWallet
// Returns all vaults owned by a wallet
app.get('/vault/:ownerWallet', async (req, res) => {
  const { ownerWallet } = req.params;
  const { data, error } = await supabase
    .from('vaults')
    .select(`
      *,
      lockers (locker_ref, tier),
      sub_vaults (*),
      transactions (tx_type, status, created_at)
    `)
    .eq('owner_wallet', ownerWallet)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /vault/ref/:vaultRef
// Returns a single vault by its abbreviated ref
app.get('/vault/ref/:vaultRef', async (req, res) => {
  const { data, error } = await supabase
    .from('vaults')
    .select(`*, lockers (locker_ref, tier)`)
    .eq('vault_ref', req.params.vaultRef)
    .single();

  if (error) return res.status(404).json({ error: 'Vault not found' });
  res.json(data);
});

// POST /move-in
// Creates a vault, registers NFT, records lease payment
// Body: { ownerWallet, nftTokenId, nftMint, depositSol, securityMode }
app.post('/move-in', async (req, res) => {
  const { ownerWallet, nftTokenId, nftMint, depositSol, securityMode } = req.body;

  // Validate required fields
  if (!ownerWallet || !nftTokenId || !nftMint) {
    return res.status(400).json({ error: 'ownerWallet, nftTokenId, and nftMint are required' });
  }

  // Check NFT not already registered
  const { data: existing } = await supabase
    .from('vaults')
    .select('id')
    .eq('nft_token_id', nftTokenId)
    .single();

  if (existing) {
    return res.status(409).json({ error: 'This NFT is already registered as a vault key' });
  }

  // Find the locker with most space (public tier for now)
  const { data: lockers, error: lockerErr } = await supabase
    .from('lockers')
    .select('*')
    .eq('status', 'active')
    .eq('tier', 'public')
    .order('vault_count', { ascending: true })
    .limit(1);

  if (lockerErr || !lockers?.length) {
    return res.status(503).json({ error: 'No available lockers. Please try again shortly.' });
  }

  const locker = lockers[0];

  // Check locker capacity
  if (locker.vault_count >= locker.vault_capacity) {
    return res.status(503).json({ error: 'Locker at capacity. New locker deploying soon.' });
  }

  // Generate vault number and refs
  const vaultNumber = await generateVaultNumber(locker.id);
  const vaultRef    = abbreviate('VLT', vaultNumber);
  const deposit     = parseFloat(depositSol) || 0;
  const totalDue    = LEASE_FEE_SOL + MOVE_IN_FEE_SOL;

  // Create the vault
  const { data: vault, error: vaultErr } = await supabase
    .from('vaults')
    .insert({
      vault_ref:        vaultRef,
      vault_number:     vaultNumber,
      locker_id:        locker.id,
      owner_wallet:     ownerWallet,
      nft_token_id:     nftTokenId,
      nft_mint:         nftMint,
      security_mode:    securityMode || 'unset',
      status:           'active',
      lease_paid:       true,
      lease_paid_at:    new Date().toISOString(),
      lease_amount_sol: LEASE_FEE_SOL,
      deposit_sol:      deposit,
    })
    .select()
    .single();

  if (vaultErr) return res.status(500).json({ error: vaultErr.message });

  // Increment locker vault count
  await supabase
    .from('lockers')
    .update({ vault_count: locker.vault_count + 1 })
    .eq('id', locker.id);

  // Record the move-in transaction
  await supabase.from('transactions').insert({
    vault_id:     vault.id,
    tx_type:      'move_in',
    status:       'confirmed',
    sol_amount:   deposit,
    flat_fee_sol: totalDue,
  });

  // Record the lease payment transaction
  await supabase.from('transactions').insert({
    vault_id:     vault.id,
    tx_type:      'lease_payment',
    status:       'confirmed',
    sol_amount:   LEASE_FEE_SOL,
    flat_fee_sol: LEASE_FEE_SOL,
  });

  res.status(201).json({
    success:    true,
    vault:      vault,
    locker_ref: locker.locker_ref,
    vault_ref:  vaultRef,
    fees: {
      lifetime_lease: LEASE_FEE_SOL,
      move_in_fee:    MOVE_IN_FEE_SOL,
      total_due:      totalDue,
    },
    message: `Vault ${vaultRef} created in ${locker.locker_ref}. Welcome home.`,
  });
});

// POST /deposit
// Records a deposit into an existing vault
// Body: { vaultId, ownerWallet, solAmount }
app.post('/deposit', async (req, res) => {
  const { vaultId, ownerWallet, solAmount } = req.body;

  const { data: vault, error } = await supabase
    .from('vaults')
    .select('*')
    .eq('id', vaultId)
    .eq('owner_wallet', ownerWallet)
    .single();

  if (error || !vault) return res.status(404).json({ error: 'Vault not found or not owned by this wallet' });
  if (vault.status !== 'active') return res.status(400).json({ error: `Vault is ${vault.status} — deposits blocked` });

  const amount = parseFloat(solAmount);
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid deposit amount' });

  // Update vault balance
  await supabase
    .from('vaults')
    .update({ deposit_sol: (parseFloat(vault.deposit_sol) || 0) + amount })
    .eq('id', vaultId);

  // Record transaction
  await supabase.from('transactions').insert({
    vault_id:     vaultId,
    tx_type:      'deposit',
    status:       'confirmed',
    sol_amount:   amount,
    flat_fee_sol: DEPOSIT_FEE_SOL,
  });

  res.json({
    success:     true,
    vault_ref:   vault.vault_ref,
    deposited:   amount,
    flat_fee:    DEPOSIT_FEE_SOL,
    new_balance: (parseFloat(vault.deposit_sol) || 0) + amount,
  });
});

// PATCH /vault/:vaultId/security-mode
// Update a vault's circuit breaker mode
// Body: { ownerWallet, securityMode }
app.patch('/vault/:vaultId/security-mode', async (req, res) => {
  const { ownerWallet, securityMode } = req.body;
  const { vaultId } = req.params;

  if (!['system','self'].includes(securityMode)) {
    return res.status(400).json({ error: 'securityMode must be system or self' });
  }

  const { data, error } = await supabase
    .from('vaults')
    .update({ security_mode: securityMode })
    .eq('id', vaultId)
    .eq('owner_wallet', ownerWallet)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, vault_ref: data.vault_ref, security_mode: data.security_mode });
});

// ── Start server ─────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`NexusBridge API running on port ${PORT}`);
  console.log(`Supabase: ${process.env.SUPABASE_URL ? 'connected' : 'NOT CONFIGURED — add SUPABASE_URL and SUPABASE_ANON_KEY to Secrets'}`);
});
