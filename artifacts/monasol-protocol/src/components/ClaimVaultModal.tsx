import { useState, useLayoutEffect, useEffect } from "react";
import { ShieldCheck, Key, Wallet, ArrowRight, CheckCircle, Loader2, X, Users, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PreSelectedNft {
  mint: string;
  name: string;
  tokenId: string;
  lockerRef?: string;
  slotNumber?: number;
}

interface ClaimVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  connectedWallet: string | null;
  preSelectedNft?: PreSelectedNft | null;
  onConnectWallet?: () => void;
}

const STEPS = ["Confirm vault", "Signing wallet", "Multisig approval"];

export function ClaimVaultModal({
  isOpen, onClose, onSuccess, connectedWallet,
  preSelectedNft, onConnectWallet,
}: ClaimVaultModalProps) {
  const [step, setStep] = useState(0);
  const [signingWallet, setSigningWallet] = useState("");
  const [signingWalletError, setSigningWalletError] = useState<string | null>(null);
  const [approvalCount, setApprovalCount] = useState(0);
  const [approvalDone, setApprovalDone] = useState(false);

  const nft = preSelectedNft ?? null;
  const lockerRef = nft?.lockerRef ?? "LCK-????";
  const slotNumber = nft?.slotNumber ?? "?";

  useLayoutEffect(() => {
    if (isOpen) {
      setStep(0);
      setSigningWallet("");
      setSigningWalletError(null);
      setApprovalCount(0);
      setApprovalDone(false);
    }
  }, [isOpen, preSelectedNft]);

  useEffect(() => {
    if (step !== 2 || approvalDone) return;

    setApprovalCount(0);
    const intervals: ReturnType<typeof setTimeout>[] = [];
    let count = 0;

    const tick = () => {
      count += 1;
      setApprovalCount(count);
      if (count < 5) {
        const delay = 800 + Math.random() * 600;
        intervals.push(setTimeout(tick, delay));
      } else {
        intervals.push(setTimeout(() => setApprovalDone(true), 500));
      }
    };

    intervals.push(setTimeout(tick, 1200));
    return () => intervals.forEach(clearTimeout);
  }, [step, approvalDone]);

  if (!isOpen) return null;

  const handleClose = () => { onClose(); };

  const validateSigningWallet = () => {
    const trimmed = signingWallet.trim();
    if (!trimmed) {
      setSigningWalletError("Signing wallet address is required.");
      return false;
    }
    if (trimmed.length < 32) {
      setSigningWalletError("Address looks too short — paste your full wallet address.");
      return false;
    }
    setSigningWalletError(null);
    return true;
  };

  const handleConfirmWallet = () => {
    if (!validateSigningWallet()) return;
    setStep(2);
  };

  const handleFinish = () => {
    onSuccess();
    handleClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={step < 2 ? handleClose : undefined} />

      <div className="relative w-full max-w-md bg-black border border-monad-purple/30 rounded-2xl shadow-[0_0_40px_-10px_rgba(130,71,229,0.4)] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-monad-purple/20">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-monad-purple/20 flex items-center justify-center">
              <ShieldCheck className="h-4 w-4 text-monad-purple" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Claim Vault</h2>
              <p className="text-xs text-gray-500">Monad-side ownership transfer via transfer_lease</p>
            </div>
          </div>
          <button
            data-testid="button-close-claim"
            onClick={handleClose}
            className="text-gray-600 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Step indicator */}
        {step < 3 && (
          <div className="flex items-center px-5 py-3 border-b border-white/5">
            {STEPS.map((label, i) => (
              <div key={label} className="flex items-center flex-1">
                <div className="flex items-center gap-1.5">
                  <div className={`h-5 w-5 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    i < step  ? "bg-monad-purple text-white"
                    : i === step ? "bg-monad-purple/30 text-monad-purple border border-monad-purple/50"
                    : "bg-white/5 text-gray-600"
                  }`}>
                    {i < step ? "✓" : i + 1}
                  </div>
                  <span className={`text-xs transition-colors ${i === step ? "text-white" : "text-gray-600"}`}>
                    {label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-px mx-2 ${i < step ? "bg-monad-purple/50" : "bg-white/10"}`} />
                )}
              </div>
            ))}
          </div>
        )}

        <div className="p-5">

          {/* ── Wallet gate (no wallet connected) ── */}
          {!connectedWallet && step === 0 && (
            <div className="py-8 text-center space-y-4">
              <div className="h-14 w-14 rounded-full bg-monad-purple/10 border border-monad-purple/20 flex items-center justify-center mx-auto">
                <Wallet className="h-6 w-6 text-monad-purple" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white mb-1">Connect your wallet first</p>
                <p className="text-xs text-gray-500 max-w-[280px] mx-auto leading-relaxed">
                  A connected wallet is required to initiate the vault takeover.
                </p>
              </div>
              <Button
                data-testid="button-connect-wallet-claim"
                onClick={onConnectWallet}
                className="bg-monad-purple hover:bg-monad-purple/90 text-white font-bold"
              >
                <Wallet className="h-4 w-4 mr-2" />
                Connect Wallet
              </Button>
            </div>
          )}

          {/* ── No NFT gate ── */}
          {connectedWallet && !nft && step === 0 && (
            <div className="py-8 text-center space-y-4">
              <div className="h-14 w-14 rounded-full bg-monad-purple/10 border border-monad-purple/20 flex items-center justify-center mx-auto">
                <Key className="h-6 w-6 text-monad-purple" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white mb-1">No NFT key detected</p>
                <p className="text-xs text-gray-500 max-w-[280px] mx-auto leading-relaxed">
                  You need a vault NFT key in your Solana wallet to initiate a claim. Rent a vault first to receive one.
                </p>
              </div>
              <Button
                data-testid="button-go-rent"
                onClick={handleClose}
                variant="outline"
                className="border-monad-purple/30 text-monad-purple hover:bg-monad-purple/10"
              >
                Rent a Vault to get a key
              </Button>
            </div>
          )}

          {/* ── Step 0: Confirm NFT key + vault ── */}
          {connectedWallet && nft && step === 0 && (
            <div className="space-y-5">
              <p className="text-xs text-gray-500">
                Confirm the NFT key bound to the vault slot you want to take over. This initiates the <span className="text-monad-purple font-mono">transfer_lease</span> call.
              </p>

              {/* NFT card */}
              <div
                data-testid="card-nft-confirm"
                className="p-4 rounded-xl border-2 border-monad-purple/40 bg-monad-purple/5 space-y-3"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-monad-purple/20 flex items-center justify-center shrink-0">
                    <Key className="h-5 w-5 text-monad-purple" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">NFT key</p>
                    <p className="text-sm font-medium text-white">{nft.name}</p>
                    <p className="text-xs text-gray-600 font-mono">{nft.mint}</p>
                  </div>
                </div>

                <div className="border-t border-white/5 pt-3 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase mb-0.5">Locker</p>
                    <p className="text-xs font-mono text-white">{lockerRef}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase mb-0.5">Slot</p>
                    <p className="text-xs font-mono text-white">#{slotNumber}</p>
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-white/5 border border-white/10 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
                <p className="text-xs text-gray-400">
                  Claiming transfers vault ownership to your wallet. The vault's contents and balance are preserved — only the occupant and signing wallet change.
                </p>
              </div>

              <Button
                data-testid="button-confirm-nft"
                onClick={() => setStep(1)}
                className="w-full bg-monad-purple hover:bg-monad-purple/90 text-white font-bold"
              >
                Confirm key — continue
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          )}

          {/* ── Step 1: New signing wallet ── */}
          {step === 1 && (
            <div className="space-y-5">
              <p className="text-xs text-gray-500">
                Enter the wallet that will sign future vault transactions. This becomes the new <span className="text-monad-purple font-mono">signing_wallet</span> in the contract.
              </p>

              {/* NFT context badge */}
              <div className="p-3 rounded-lg bg-white/5 border border-white/10 flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-monad-purple/20 flex items-center justify-center shrink-0">
                  <Key className="h-4 w-4 text-monad-purple" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500">Claiming with</p>
                  <p className="text-sm font-medium text-white truncate">{nft?.name}</p>
                </div>
              </div>

              {/* New owner address (read-only, derived from connected wallet) */}
              <div>
                <label className="text-xs text-gray-500 mb-2 block">New occupant wallet (your connected wallet)</label>
                <div className="px-4 py-3 rounded-lg bg-white/5 border border-white/10 font-mono text-xs text-white break-all">
                  {connectedWallet}
                </div>
                <p className="text-xs text-gray-600 mt-1">This becomes the new <span className="font-mono">new_owner</span> in transfer_lease.</p>
              </div>

              {/* New signing wallet (user input) */}
              <div>
                <label className="text-xs text-gray-500 mb-2 block">New signing wallet address <span className="text-monad-purple">*</span></label>
                <input
                  data-testid="input-signing-wallet"
                  type="text"
                  value={signingWallet}
                  onChange={(e) => { setSigningWallet(e.target.value); setSigningWalletError(null); }}
                  placeholder="Paste wallet address..."
                  className={`w-full bg-white/5 border rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none font-mono text-xs transition-colors ${
                    signingWalletError
                      ? "border-red-500/50 focus:border-red-500"
                      : "border-white/10 focus:border-monad-purple/50"
                  }`}
                />
                {signingWalletError && (
                  <p className="text-xs text-red-400 mt-1">{signingWalletError}</p>
                )}
                <p className="text-xs text-gray-600 mt-1">
                  Can be the same as your occupant wallet or a separate cold-storage signer.
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setStep(0)}
                  className="border-white/10 text-gray-400"
                >
                  Back
                </Button>
                <Button
                  data-testid="button-confirm-signing-wallet"
                  onClick={handleConfirmWallet}
                  className="flex-1 bg-monad-purple hover:bg-monad-purple/90 text-white font-bold"
                >
                  Submit for approval
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 2: Multisig approval pending ── */}
          {step === 2 && (
            <div className="space-y-5">
              <div className="text-center space-y-2 py-2">
                <div className="relative h-14 w-14 mx-auto">
                  <div className="absolute inset-0 bg-monad-purple/20 blur-xl rounded-full" />
                  <div className="relative h-14 w-14 rounded-full bg-monad-purple/20 border border-monad-purple/30 flex items-center justify-center">
                    {approvalDone
                      ? <CheckCircle className="h-7 w-7 text-monad-purple" />
                      : <Users className="h-7 w-7 text-monad-purple animate-pulse" />
                    }
                  </div>
                </div>
                <h3 className="font-display text-base font-bold text-white">
                  {approvalDone ? "All signers approved" : "Awaiting multisig approval"}
                </h3>
                <p className="text-xs text-gray-500">
                  {approvalDone
                    ? "5 of 5 multisig members have signed off."
                    : "5 of 5 multisig members must approve the transfer_lease call."}
                </p>
              </div>

              {/* Approval progress */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Signer approvals</span>
                  <span className={approvalDone ? "text-monad-purple font-bold" : "text-white"}>
                    {approvalCount} / 5
                  </span>
                </div>
                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full bg-monad-purple rounded-full transition-all duration-500"
                    style={{ width: `${(approvalCount / 5) * 100}%` }}
                  />
                </div>

                {/* Individual signer slots */}
                <div className="pt-2 space-y-1.5">
                  {Array.from({ length: 5 }).map((_, i) => {
                    const approved = i < approvalCount;
                    return (
                      <div
                        key={i}
                        data-testid={`signer-row-${i}`}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs transition-all duration-300 ${
                          approved
                            ? "border-monad-purple/30 bg-monad-purple/5"
                            : "border-white/5 bg-white/3"
                        }`}
                      >
                        <span className={approved ? "text-white" : "text-gray-600"}>
                          Multisig signer {i + 1}
                        </span>
                        <span className={approved ? "text-monad-purple font-semibold" : "text-gray-600"}>
                          {approved ? "✓ Signed" : "Pending..."}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Claim summary */}
              <div className="p-3 rounded-lg bg-white/5 border border-white/10 text-xs space-y-2">
                <p className="text-gray-500 uppercase tracking-wider">transfer_lease parameters</p>
                <div className="flex justify-between">
                  <span className="text-gray-500">NFT mint</span>
                  <span className="text-white font-mono">{nft?.mint}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">New owner</span>
                  <span className="text-white font-mono">
                    {connectedWallet?.slice(0, 6)}...{connectedWallet?.slice(-4)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">New signing wallet</span>
                  <span className="text-white font-mono">
                    {signingWallet.slice(0, 6)}...{signingWallet.slice(-4)}
                  </span>
                </div>
              </div>

              {approvalDone && (
                <Button
                  data-testid="button-finalize-claim"
                  onClick={() => setStep(3)}
                  className="w-full bg-monad-purple hover:bg-monad-purple/90 text-white font-bold"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Finalize ownership
                </Button>
              )}

              {!approvalDone && (
                <div className="flex items-center justify-center gap-2 py-1 text-xs text-gray-600">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Waiting for remaining signers...
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Success ── */}
          {step === 3 && (
            <div className="text-center space-y-5 py-4">
              <div className="relative h-16 w-16 mx-auto">
                <div className="absolute inset-0 bg-monad-purple/30 blur-xl rounded-full" />
                <div className="relative h-16 w-16 rounded-full bg-monad-purple/20 border border-monad-purple/30 flex items-center justify-center">
                  <CheckCircle className="h-8 w-8 text-monad-purple" />
                </div>
              </div>

              <div>
                <p className="text-lg font-bold text-white mb-1">Vault ownership transferred.</p>
                <p className="text-sm text-gray-400">
                  The vault slot is now registered to your wallet. Prior ties have been severed.
                </p>
              </div>

              <div
                data-testid="card-claim-result"
                className="p-4 rounded-xl bg-white/5 border border-monad-purple/20 text-left space-y-3"
              >
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">Updated vault record</p>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Locker</span>
                  <span className="text-white font-mono">{lockerRef}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Slot</span>
                  <span className="text-white font-mono">#{slotNumber}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">New occupant</span>
                  <span className="text-monad-purple font-mono">
                    {connectedWallet?.slice(0, 8)}...{connectedWallet?.slice(-4)}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Signing wallet</span>
                  <span className="text-monad-purple font-mono">
                    {signingWallet.slice(0, 8)}...{signingWallet.slice(-4)}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">NFT mint</span>
                  <span className="text-solana-green font-mono">{nft?.mint}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Shards</span>
                  <span className="text-solana-green">Rotated to new occupant</span>
                </div>
              </div>

              <Button
                data-testid="button-done-claim"
                onClick={handleFinish}
                className="w-full bg-monad-purple hover:bg-monad-purple/90 text-white font-bold"
              >
                Done — open vault controls
              </Button>
            </div>
          )}

        </div>

        {/* Wallet indicator */}
        {connectedWallet && step < 3 && (
          <div className="px-5 pb-4 flex items-center gap-2">
            <Wallet className="h-3 w-3 text-gray-600" />
            <span className="text-xs text-gray-600 font-mono">
              {connectedWallet.slice(0, 6)}...{connectedWallet.slice(-4)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
