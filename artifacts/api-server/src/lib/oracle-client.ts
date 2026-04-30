// =============================================================================
// src/lib/oracle-client.ts
// =============================================================================
// Anchor program clients, PDA derivation, and typed instruction builders
// for the three MonaSol Solana programs.
//
// IDL loading: uses createRequire (CJS shim) because tsconfig uses
// moduleResolution: "bundler" without resolveJsonModule — direct ESM JSON
// imports are not supported in this build configuration.
//
// Paths: IDL require() paths are relative to dist/index.mjs (runtime output).
//        Type import paths are relative to src/lib/ (compile time).
// =============================================================================

import { createRequire }   from "module";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionSignature,
} from "@solana/web3.js";
import {
  AnchorProvider,
  Program,
  BN,
  Wallet,
  setProvider,
} from "@coral-xyz/anchor";
import { logger } from "./logger";
import {
  connection,
  oracleKeypair,
  VAULT_KEY_PROGRAM_ID,
  GUARDIAN_MULTISIG_PROGRAM_ID,
  MONASOL_PROTOCOL_PROGRAM_ID,
  MPL_CORE_PROGRAM_ID,
} from "./solana";

// IDL loader — deferred until getPrograms() is first called so the server
// starts cleanly in environments where `anchor build` hasn't run yet.
// Paths are resolved at runtime relative to dist/index.mjs via createRequire.
// From dist/index.mjs: ../../solana/target/idl/ = artifacts/solana/target/idl/
const _require = createRequire(import.meta.url);

function loadIdl(name: string): unknown {
  return _require(`../../solana/target/idl/${name}.json`);
}

// Type-only imports — erased at compile time, safe with isolatedModules.
// Paths relative to src/lib/: ../../../solana/target/types/ = artifacts/solana/target/types/
import type { VaultKey }         from "../../../solana/target/types/vault_key";
import type { GuardianMultisig } from "../../../solana/target/types/guardian_multisig";
import type { MonasolProtocol }  from "../../../solana/target/types/monasol_protocol";

// -----------------------------------------------------------------------------
// Seeds — must match on-chain constants exactly
// -----------------------------------------------------------------------------

const VAULT_SESSION_SEED   = Buffer.from("vault_session");
const PROTOCOL_AUTH_SEED   = Buffer.from("protocol_auth");
const GUARDIAN_SET_SEED    = Buffer.from("guardian_set");
const PROTOCOL_STATE_SEED  = Buffer.from("protocol_state");
const SESSION_RECORD_SEED  = Buffer.from("session_record");
const ORACLE_VERIFIER_SEED = Buffer.from("oracle_verifier");

// -----------------------------------------------------------------------------
// Lazy program clients — initialised once on first call
// -----------------------------------------------------------------------------

let _provider: AnchorProvider | null = null;
let _vaultKey: Program<VaultKey> | null = null;
let _guardian: Program<GuardianMultisig> | null = null;
let _monasol:  Program<MonasolProtocol> | null = null;

export function getPrograms(): {
  provider: AnchorProvider;
  vaultKey: Program<VaultKey>;
  guardian: Program<GuardianMultisig>;
  monasol:  Program<MonasolProtocol>;
} {
  if (!connection)     throw new Error("SOLANA_RPC_URL is not configured");
  if (!oracleKeypair) throw new Error("ORACLE_KEYPAIR is not configured");

  if (!_provider) {
    const wallet = new Wallet(oracleKeypair);
    _provider = new AnchorProvider(connection, wallet, {
      commitment:          "confirmed",
      preflightCommitment: "confirmed",
    });
    setProvider(_provider);
  }

  if (!_vaultKey) {
    _vaultKey = new Program(loadIdl("vault_key") as unknown as VaultKey, _provider);
  }
  if (!_guardian) {
    _guardian = new Program(loadIdl("guardian_multisig") as unknown as GuardianMultisig, _provider);
  }
  if (!_monasol) {
    _monasol = new Program(loadIdl("monasol_protocol") as unknown as MonasolProtocol, _provider);
  }

  return { provider: _provider, vaultKey: _vaultKey, guardian: _guardian, monasol: _monasol };
}

// -----------------------------------------------------------------------------
// PDA derivation
// -----------------------------------------------------------------------------

export function deriveVaultSession(renter: PublicKey, collection: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [VAULT_SESSION_SEED, renter.toBuffer(), collection.toBuffer()],
    VAULT_KEY_PROGRAM_ID
  );
  return pda;
}

export function deriveProtocolAuth(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [PROTOCOL_AUTH_SEED],
    VAULT_KEY_PROGRAM_ID
  );
  return pda;
}

export function deriveGuardianSet(leaseId: BN): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [GUARDIAN_SET_SEED, leaseId.toArrayLike(Buffer, "le", 8)],
    GUARDIAN_MULTISIG_PROGRAM_ID
  );
  return pda;
}

export function deriveProtocolState(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [PROTOCOL_STATE_SEED],
    MONASOL_PROTOCOL_PROGRAM_ID
  );
  return pda;
}

export function deriveSessionRecord(leaseId: BN): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [SESSION_RECORD_SEED, leaseId.toArrayLike(Buffer, "le", 8)],
    MONASOL_PROTOCOL_PROGRAM_ID
  );
  return pda;
}

export function deriveOracleVerifier(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [ORACLE_VERIFIER_SEED],
    MONASOL_PROTOCOL_PROGRAM_ID
  );
  return pda;
}

// -----------------------------------------------------------------------------
// Transaction retry wrapper
// -----------------------------------------------------------------------------

const MAX_RETRIES = 3;

async function withRetry<T>(
  fn: () => Promise<T>,
  label: string
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const isBlockhashExpiry =
        err?.message?.includes("Blockhash not found") ||
        err?.message?.includes("block height exceeded");

      if (isBlockhashExpiry && attempt < MAX_RETRIES) {
        logger.warn({ label, attempt }, "Blockhash expired — retrying");
        continue;
      }

      logger.error({ err, label }, "Solana transaction failed");
      throw err;
    }
  }
  throw new Error(`${label}: exceeded ${MAX_RETRIES} retry attempts`);
}

// -----------------------------------------------------------------------------
// Instruction builders
// -----------------------------------------------------------------------------

export interface RegisterSessionParams {
  leaseId:      BN;
  renter:       PublicKey;
  vaultSession: PublicKey;
  guardianSet:  PublicKey;
  asset:        PublicKey;
  collection:   PublicKey;
  monadTxRef:   number[];
}

export async function registerSession(
  params: RegisterSessionParams
): Promise<TransactionSignature> {
  const { monasol } = getPrograms();

  const protocolState  = deriveProtocolState();
  const oracleVerifier = deriveOracleVerifier();
  const sessionRecord  = deriveSessionRecord(params.leaseId);

  return withRetry(async () => {
    const sig = await monasol.methods
      .registerSession({
        leaseId:      params.leaseId,
        renter:       params.renter,
        vaultSession: params.vaultSession,
        guardianSet:  params.guardianSet,
        asset:        params.asset,
        collection:   params.collection,
        monadTxRef:   params.monadTxRef,
      })
      .accountsStrict({
        oracle:        oracleKeypair!.publicKey,
        payer:         oracleKeypair!.publicKey,
        protocolState,
        oracleVerifier,
        sessionRecord,
        systemProgram: SystemProgram.programId,
      })
      .signers([oracleKeypair!])
      .rpc();

    logger.info(
      { sig, leaseId: params.leaseId.toString(), renter: params.renter.toBase58() },
      "oracle: register_session confirmed"
    );
    return sig;
  }, "register_session");
}

// -----------------------------------------------------------------------------

export interface ConfirmSettlementParams {
  leaseId:      BN;
  monadTxHash:  number[];
  guardianSet:  PublicKey;
  asset:        PublicKey;
  collection:   PublicKey;
}

export async function confirmSettlement(
  params: ConfirmSettlementParams
): Promise<TransactionSignature> {
  const { monasol } = getPrograms();

  const protocolState  = deriveProtocolState();
  const oracleVerifier = deriveOracleVerifier();
  const sessionRecord  = deriveSessionRecord(params.leaseId);
  const protocolAuth   = deriveProtocolAuth();

  return withRetry(async () => {
    const sig = await monasol.methods
      .confirmSettlement(params.monadTxHash)
      .accountsStrict({
        oracle:                   oracleKeypair!.publicKey,
        payer:                    oracleKeypair!.publicKey,
        protocolState,
        oracleVerifier,
        sessionRecord,
        protocolAuth,
        guardianSet:              params.guardianSet,
        asset:                    params.asset,
        collection:               params.collection,
        vaultKeyProgram:          VAULT_KEY_PROGRAM_ID,
        guardianMultisigProgram:  GUARDIAN_MULTISIG_PROGRAM_ID,
        mplCoreProgram:           MPL_CORE_PROGRAM_ID,
        systemProgram:            SystemProgram.programId,
      })
      .signers([oracleKeypair!])
      .rpc();

    logger.info(
      { sig, leaseId: params.leaseId.toString() },
      "oracle: confirm_settlement confirmed"
    );
    return sig;
  }, "confirm_settlement");
}

// -----------------------------------------------------------------------------

export interface FinalizeReleaseParams {
  leaseId:         BN;
  operatorKeypair: Keypair;
  vaultSession:    PublicKey;
  guardianSet:     PublicKey;
  asset:           PublicKey;
  collection:      PublicKey;
}

export async function finalizeRelease(
  params: FinalizeReleaseParams
): Promise<TransactionSignature> {
  const { monasol } = getPrograms();

  const protocolState = deriveProtocolState();
  const sessionRecord = deriveSessionRecord(params.leaseId);
  const protocolAuth  = deriveProtocolAuth();

  return withRetry(async () => {
    const sig = await monasol.methods
      .finalizeRelease()
      .accountsStrict({
        operator:                params.operatorKeypair.publicKey,
        payer:                   params.operatorKeypair.publicKey,
        protocolState,
        authority:               params.operatorKeypair.publicKey,
        sessionRecord,
        protocolAuth,
        vaultSession:            params.vaultSession,
        asset:                   params.asset,
        collection:              params.collection,
        guardianSet:             params.guardianSet,
        vaultKeyProgram:         VAULT_KEY_PROGRAM_ID,
        guardianMultisigProgram: GUARDIAN_MULTISIG_PROGRAM_ID,
        mplCoreProgram:          MPL_CORE_PROGRAM_ID,
        systemProgram:           SystemProgram.programId,
      })
      .signers([params.operatorKeypair])
      .rpc();

    logger.info(
      { sig, leaseId: params.leaseId.toString() },
      "oracle: finalize_release confirmed"
    );
    return sig;
  }, "finalize_release");
}

// -----------------------------------------------------------------------------
// Account fetchers
// -----------------------------------------------------------------------------

export async function fetchSessionRecord(leaseId: BN) {
  try {
    const { monasol } = getPrograms();
    return await monasol.account.sessionRecord.fetch(deriveSessionRecord(leaseId));
  } catch {
    return null;
  }
}

export async function fetchGuardianSet(leaseId: BN) {
  try {
    const { guardian } = getPrograms();
    return await guardian.account.guardianSet.fetch(deriveGuardianSet(leaseId));
  } catch {
    return null;
  }
}

export async function fetchVaultSession(renter: PublicKey, collection: PublicKey) {
  try {
    const { vaultKey } = getPrograms();
    return await vaultKey.account.vaultSession.fetch(deriveVaultSession(renter, collection));
  } catch {
    return null;
  }
}
