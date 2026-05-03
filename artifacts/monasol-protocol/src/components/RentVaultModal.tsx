import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { Key, Check, Shield, Zap, Wallet, ArrowRight, CheckCircle, Sparkles, Loader2, DoorOpen, AlertTriangle } from "lucide-react";

interface MintedNft {
  mint: string;
  name: string;
  tokenId: string;
  lockerRef: string;
  slotNumber: number;
  maxSlots: number;
}

interface RentVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (mintedNft: MintedNft) => void;
  connectedWallet: string | null;
  onConnectWallet?: () => void;
}

const TIERS = [
  {
    id: "tier-1",
    name: "Standard Locker",
    tier: 1,
    description: "100-slot shared locker. Ideal for individual vault holders.",
    slotsTotal: 100,
    slotsAvailable: 38,
    oneTimeFeeSOL: 0.05,
    securityLevel: "High Isolation",
    features: ["Shared among 100 members", "Auto-lock on threat", "NFT key minted on signup"],
  },
  {
    id: "tier-2",
    name: "Large Pool Locker",
    tier: 2,
    description: "500-slot pool locker. Lower minimum deposit, higher throughput.",
    slotsTotal: 500,
    slotsAvailable: 469,
    oneTimeFeeSOL: 0.05,
    securityLevel: "Standard Isolation",
    features: ["Shared among 500 members", "Batched oracle proofs", "Instant provisioning"],
  },
  {
    id: "tier-3",
    name: "Premium Private Locker",
    tier: 3,
    description: "10-slot private locker. Maximum isolation for large depositors.",
    slotsTotal: 10,
    slotsAvailable: 3,
    oneTimeFeeSOL: 2,
    securityLevel: "Absolute Isolation",
    features: ["Near-private contract", "Independent pause authority", "White-glove setup"],
  },
];

type Step = "list" | "renting" | "nft-received" | "movein" | "movein-processing" | "done";

export function RentVaultModal({ isOpen, onClose, onSuccess, connectedWallet, onConnectWallet }: RentVaultModalProps) {
  const [step, setStep] = useState<Step>("list");
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [mintedNft, setMintedNft] = useState<MintedNft | null>(null);

  // move-in fields
  const [slotNumber, setSlotNumber] = useState("");
  const [slotError, setSlotError] = useState<string | null>(null);
  const [signingWallet, setSigningWallet] = useState("");
  const [signingWalletError, setSigningWalletError] = useState<string | null>(null);

  // move-in processing progress
  const [initProgress, setInitProgress] = useState(0);
  const [initDone, setInitDone] = useState(false);

  const selected = TIERS.find(t => t.id === selectedTier);

  // Drive the move_in processing animation
  useEffect(() => {
    if (step !== "movein-processing" || initDone) return;
    setInitProgress(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    const stages = [15, 35, 55, 75, 90, 100];
    let i = 0;
    const tick = () => {
      if (i >= stages.length) { timers.push(setTimeout(() => setInitDone(true), 400)); return; }
      setInitProgress(stages[i]); i++;
      timers.push(setTimeout(tick, 700 + Math.random() * 500));
    };
    timers.push(setTimeout(tick, 800));
    return () => timers.forEach(clearTimeout);
  }, [step, initDone]);

  const handleRent = () => {
    if (!selectedTier || !connectedWallet || !selected) return;
    setStep("renting");
    setTimeout(() => {
      const slotNum = Math.floor(Math.random() * selected.slotsTotal) + 1;
      const lockerRef = `LCK-${selected.tier}${Math.floor(Math.random() * 9000 + 1000)}`;
      const nft: MintedNft = {
        mint: `So1${Math.random().toString(36).slice(2, 10).toUpperCase()}...${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        name: `${selected.name} Key #${slotNum}`,
        tokenId: `${selected.tier}-${slotNum}`,
        lockerRef,
        slotNumber: slotNum,
        maxSlots: selected.slotsTotal,
      };
      setMintedNft(nft);
      setStep("nft-received");
    }, 2200);
  };

  const validateSlot = () => {
    const max = mintedNft?.maxSlots ?? 100;
    const n = parseInt(slotNumber, 10);
    if (!slotNumber.trim() || isNaN(n)) { setSlotError("Please enter a slot number."); return false; }
    if (n < 1 || n > max) { setSlotError(`Slot must be between 1 and ${max}.`); return false; }
    setSlotError(null);
    return true;
  };

  const validateSigningWallet = () => {
    const trimmed = signingWallet.trim();
    if (!trimmed) { setSigningWalletError("Signing wallet address is required."); return false; }
    if (trimmed.length < 32) { setSigningWalletError("Address looks too short — paste your full wallet address."); return false; }
    setSigningWalletError(null);
    return true;
  };

  const handleSubmitMoveIn = () => {
    if (!validateSlot() || !validateSigningWallet()) return;
    setInitDone(false);
    setInitProgress(0);
    setStep("movein-processing");
  };

  const handleClose = () => {
    // Capture before clearing: if the NFT was already minted but the user
    // is deferring move-in, still call onSuccess so the NFT list refreshes.
    const alreadyMinted = mintedNft;
    setStep("list");
    setSelectedTier(null);
    setMintedNft(null);
    setSlotNumber("");
    setSlotError(null);
    setSigningWallet("");
    setSigningWalletError(null);
    setInitProgress(0);
    setInitDone(false);
    onClose();
    if (alreadyMinted) onSuccess(alreadyMinted);
  };

  const handleFinish = () => {
    // Clear mintedNft before handleClose so handleClose doesn't double-fire onSuccess
    const nft = mintedNft;
    setMintedNft(null);
    setStep("list");
    setSelectedTier(null);
    setSlotNumber("");
    setSlotError(null);
    setSigningWallet("");
    setSigningWalletError(null);
    setInitProgress(0);
    setInitDone(false);
    onClose();
    if (nft) onSuccess(nft);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-xl bg-black/90 border-white/10 text-white backdrop-blur-xl max-h-[90vh] flex flex-col overflow-hidden"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="font-display text-xl flex items-center gap-2">
            <Key className="h-5 w-5 text-solana-green" />
            Rent a Vault
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Choose a locker tier, pay the one-time lease in SOL, receive your NFT key, then move in to become the slot's first signer.
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">

          {/* ── Wallet gate ── */}
          {!connectedWallet && step === "list" && (
            <motion.div
              key="wallet-gate"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="py-10 flex flex-col items-center gap-5 text-center"
            >
              <div className="h-14 w-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                <Wallet className="h-7 w-7 text-gray-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white mb-1">Connect your Solana wallet first</p>
                <p className="text-xs text-gray-500">A connected wallet is required to receive your NFT key.</p>
              </div>
              <Button
                onClick={onConnectWallet}
                className="bg-solana-green hover:bg-solana-green/90 text-black font-bold"
              >
                <Wallet className="h-4 w-4 mr-2" />
                Connect Wallet
              </Button>
            </motion.div>
          )}

          {/* ── Tier list ── */}
          {connectedWallet && step === "list" && (
            <motion.div
              key="list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col overflow-hidden"
            >
              <div className="overflow-y-auto flex-1 py-3 pr-1 space-y-3">
                {TIERS.map((tier) => {
                  const isSelected = selectedTier === tier.id;
                  const isFull = tier.slotsAvailable === 0;
                  return (
                    <div
                      key={tier.id}
                      data-testid={`tier-card-${tier.id}`}
                      onClick={() => !isFull && setSelectedTier(tier.id)}
                      className={`p-4 rounded-xl border-2 transition-all ${
                        isFull
                          ? "border-white/5 bg-white/3 opacity-40 cursor-not-allowed"
                          : isSelected
                          ? "border-solana-green bg-solana-green/5 cursor-pointer"
                          : "border-white/10 bg-white/5 hover:border-white/20 cursor-pointer"
                      }`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <div>
                          <p className="font-bold text-white text-sm">{tier.name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{tier.description}</p>
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          <p className="font-mono font-bold text-solana-green text-sm">{tier.oneTimeFeeSOL} SOL</p>
                          <p className="text-xs text-gray-500 uppercase">one-time, lifetime</p>
                        </div>
                      </div>

                      <div className="mt-3 pt-3 border-t border-white/5 flex flex-wrap gap-x-6 gap-y-2">
                        <div>
                          <p className="text-xs text-gray-500 uppercase">Slots</p>
                          <p className="text-xs text-white">
                            {isFull ? "Full" : `${tier.slotsAvailable} / ${tier.slotsTotal} open`}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase">Security</p>
                          <p className="text-xs text-white flex items-center gap-1">
                            <Shield className="h-3 w-3 text-blue-400" />
                            {tier.securityLevel}
                          </p>
                        </div>
                      </div>

                      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                        {tier.features.map((f) => (
                          <li key={f} className="text-xs text-gray-400 flex items-center gap-1">
                            <Check className="h-3 w-3 text-solana-green shrink-0" />
                            {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>

              {selected && (
                <div className="mt-3 p-3 rounded-lg bg-solana-green/5 border border-solana-green/20 text-xs space-y-1">
                  <div className="flex justify-between font-bold">
                    <span className="text-white">Lifetime lease (one-time)</span>
                    <span className="font-mono text-solana-green">{selected.oneTimeFeeSOL} SOL</span>
                  </div>
                  <p className="text-gray-500 pt-1">
                    Fee is paid now. After minting you will move in and become the slot's first signer on Monad.
                  </p>
                </div>
              )}

              <Button
                data-testid="button-rent-vault"
                onClick={handleRent}
                disabled={!selectedTier}
                className="w-full mt-3 h-11 bg-solana-green hover:bg-solana-green/90 text-black font-bold shadow-[0_0_15px_-3px_rgba(20,241,149,0.4)]"
              >
                Pay {selected ? `${selected.oneTimeFeeSOL} SOL` : ""} & Mint NFT Key
              </Button>
            </motion.div>
          )}

          {/* ── Minting on Solana ── */}
          {step === "renting" && (
            <motion.div
              key="renting"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="py-12 flex flex-col items-center justify-center space-y-6"
            >
              <div className="relative">
                <div className="absolute inset-0 bg-solana-green/20 blur-xl rounded-full" />
                <Zap className="h-16 w-16 text-solana-green animate-pulse relative z-10" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="font-display text-xl font-bold text-white">Minting NFT Key...</h3>
                <p className="text-sm text-gray-400">Broadcasting to Solana</p>
                <p className="text-sm text-gray-400">Issuing NFT key to your wallet</p>
              </div>
            </motion.div>
          )}

          {/* ── NFT received — prompt move-in ── */}
          {step === "nft-received" && mintedNft && (
            <motion.div
              key="nft-received"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="py-6 flex flex-col items-center text-center space-y-4"
            >
              <div className="h-20 w-20 rounded-full bg-solana-green/20 flex items-center justify-center border border-solana-green/30">
                <Key className="h-10 w-10 text-solana-green" />
              </div>
              <div>
                <h3 className="font-display text-xl font-bold text-white mb-1">NFT Key Received</h3>
                <p className="text-sm text-gray-400 max-w-xs mx-auto">
                  Your key is in your wallet. Now move in — choose your slot and become the first signer.
                </p>
              </div>

              <div className="w-full p-3 rounded-lg bg-white/5 border border-white/10 text-left text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-500">NFT key</span>
                  <span className="text-white font-medium">{mintedNft.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Mint</span>
                  <span className="text-solana-green font-mono">{mintedNft.mint}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Locker</span>
                  <span className="text-white font-mono">{mintedNft.lockerRef}</span>
                </div>
              </div>

              {/* First move-in callout */}
              <div className="w-full p-3 rounded-lg bg-monad-purple/5 border border-monad-purple/20 flex items-start gap-2 text-left">
                <Sparkles className="h-4 w-4 text-monad-purple shrink-0 mt-0.5" />
                <p className="text-xs text-monad-purple/90 leading-relaxed">
                  <span className="font-bold">First move-in:</span> This slot has no previous occupant. You will be registered on Monad as the genesis signer via <span className="font-mono">move_in</span>.
                </p>
              </div>

              <Button
                data-testid="button-proceed-movein"
                onClick={() => setStep("movein")}
                className="w-full h-11 bg-monad-purple hover:bg-monad-purple/90 text-white font-bold shadow-[0_0_15px_-3px_rgba(130,71,229,0.4)]"
              >
                <DoorOpen className="h-4 w-4 mr-2" />
                Move In — become the signer
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>

              <button
                data-testid="button-movein-later"
                onClick={handleClose}
                className="text-xs text-gray-400 hover:text-gray-400 transition-colors"
              >
                Do it later from your vault dashboard
              </button>
            </motion.div>
          )}

          {/* ── Move-in: slot + signing wallet ── */}
          {step === "movein" && mintedNft && (
            <motion.div
              key="movein"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-5 overflow-y-auto"
            >
              {/* Header label */}
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-monad-purple/20 flex items-center justify-center shrink-0">
                  <DoorOpen className="h-3.5 w-3.5 text-monad-purple" />
                </div>
                <div>
                  <p className="text-xs font-bold text-white">First Move-In</p>
                  <p className="text-xs text-gray-500">
                    Initializing a fresh slot via <span className="font-mono">move_in</span> — no prior occupant
                  </p>
                </div>
                <span className="ml-auto px-1.5 py-0.5 rounded text-xs font-bold bg-monad-purple/20 text-monad-purple border border-monad-purple/30 uppercase tracking-wider shrink-0">
                  New Slot
                </span>
              </div>

              {/* NFT context */}
              <div className="p-3 rounded-lg bg-white/5 border border-white/10 flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-solana-green/10 flex items-center justify-center shrink-0">
                  <Key className="h-4 w-4 text-solana-green" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500">NFT key in wallet</p>
                  <p className="text-sm font-medium text-white truncate">{mintedNft.name}</p>
                  <p className="text-xs font-mono text-gray-400 truncate">{mintedNft.lockerRef}</p>
                </div>
              </div>

              {/* Slot number */}
              <div>
                <label className="text-xs text-gray-500 mb-2 block">
                  Slot number <span className="text-monad-purple">*</span>
                  <span className="text-gray-400 ml-1">(1 – {mintedNft.maxSlots})</span>
                </label>
                <input
                  data-testid="input-slot-number"
                  type="number"
                  min={1}
                  max={mintedNft.maxSlots}
                  value={slotNumber}
                  onChange={(e) => { setSlotNumber(e.target.value); setSlotError(null); }}
                  placeholder="e.g. 42"
                  className={`w-full bg-white/5 border rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none font-mono text-sm transition-colors ${
                    slotError
                      ? "border-red-500/50 focus:border-red-500"
                      : "border-white/10 focus:border-monad-purple/50"
                  }`}
                />
                {slotError && <p className="text-xs text-red-400 mt-1">{slotError}</p>}
                <p className="text-xs text-gray-400 mt-1">Each slot is independent with its own balance and signer.</p>
              </div>

              {/* Occupant (read-only) */}
              <div>
                <label className="text-xs text-gray-500 mb-2 block">First occupant (your connected wallet)</label>
                <div className="px-4 py-3 rounded-lg bg-white/5 border border-white/10 font-mono text-xs text-white break-all">
                  {connectedWallet}
                </div>
                <p className="text-xs text-gray-400 mt-1">Passed as <span className="font-mono">occupant</span> in move_in.</p>
              </div>

              {/* Signing wallet */}
              <div>
                <label className="text-xs text-gray-500 mb-2 block">
                  Signing wallet <span className="text-monad-purple">*</span>
                </label>
                <input
                  data-testid="input-signing-wallet-movein"
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
                {signingWalletError && <p className="text-xs text-red-400 mt-1">{signingWalletError}</p>}
                <p className="text-xs text-gray-400 mt-1">
                  This wallet authorizes future vault transactions. Can match your occupant wallet or be a separate cold-storage key.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-white/5 border border-white/10 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
                <p className="text-xs text-gray-400">
                  Once initialized, the slot is permanently bound to your NFT key and you become its first occupant.
                </p>
              </div>

              <Button
                data-testid="button-submit-movein"
                onClick={handleSubmitMoveIn}
                className="w-full h-11 bg-monad-purple hover:bg-monad-purple/90 text-white font-bold"
              >
                <DoorOpen className="h-4 w-4 mr-2" />
                Initialize slot — move in
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </motion.div>
          )}

          {/* ── Move-in processing ── */}
          {step === "movein-processing" && mintedNft && (
            <motion.div
              key="movein-processing"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-5"
            >
              <div className="text-center space-y-2 py-2">
                <div className="relative h-14 w-14 mx-auto">
                  <div className="absolute inset-0 bg-monad-purple/20 blur-xl rounded-full" />
                  <div className="relative h-14 w-14 rounded-full bg-monad-purple/20 border border-monad-purple/30 flex items-center justify-center">
                    {initDone
                      ? <CheckCircle className="h-7 w-7 text-monad-purple" />
                      : <Sparkles className="h-7 w-7 text-monad-purple animate-pulse" />
                    }
                  </div>
                </div>
                <h3 className="font-display text-base font-bold text-white">
                  {initDone ? "Slot initialized" : "Broadcasting move_in…"}
                </h3>
                <p className="text-xs text-gray-500">
                  {initDone ? "You are now the first occupant." : "Sending move_in call to the Monad vault contract."}
                </p>
              </div>

              {/* Progress */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Initialization progress</span>
                  <span className={initDone ? "text-monad-purple font-bold" : "text-white"}>{initProgress}%</span>
                </div>
                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full bg-monad-purple rounded-full transition-all duration-700"
                    style={{ width: `${initProgress}%` }}
                  />
                </div>

                <div className="pt-2 space-y-1.5">
                  {[
                    { label: "Verifying NFT key ownership", threshold: 15 },
                    { label: "Checking slot availability", threshold: 35 },
                    { label: "Writing occupant record", threshold: 55 },
                    { label: "Registering signing wallet", threshold: 75 },
                    { label: "Finalizing on-chain state", threshold: 90 },
                    { label: "Confirmed on Monad", threshold: 100 },
                  ].map(({ label, threshold }, i) => {
                    const done = initProgress >= threshold;
                    return (
                      <div
                        key={i}
                        data-testid={`init-stage-${i}`}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs transition-all duration-300 ${
                          done ? "border-monad-purple/30 bg-monad-purple/5" : "border-white/5 bg-black/20"
                        }`}
                      >
                        <span className={done ? "text-white" : "text-gray-400"}>{label}</span>
                        <span className={done ? "text-monad-purple font-semibold" : "text-gray-400"}>{done ? "✓" : "…"}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Parameters summary */}
              <div className="p-3 rounded-lg bg-white/5 border border-white/10 text-xs space-y-2">
                <p className="text-gray-500 uppercase tracking-wider">move_in parameters</p>
                <div className="flex justify-between">
                  <span className="text-gray-500">NFT mint</span>
                  <span className="text-white font-mono">{mintedNft.mint}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Locker ref</span>
                  <span className="text-white font-mono">{mintedNft.lockerRef}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Slot</span>
                  <span className="text-white font-mono">#{slotNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Occupant</span>
                  <span className="text-white font-mono">
                    {connectedWallet?.slice(0, 6)}...{connectedWallet?.slice(-4)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Signing wallet</span>
                  <span className="text-white font-mono">
                    {signingWallet.slice(0, 6)}...{signingWallet.slice(-4)}
                  </span>
                </div>
              </div>

              {initDone && (
                <Button
                  data-testid="button-finalize-movein"
                  onClick={() => setStep("done")}
                  className="w-full bg-monad-purple hover:bg-monad-purple/90 text-white font-bold"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  View my vault
                </Button>
              )}
              {!initDone && (
                <div className="flex items-center justify-center gap-2 py-1 text-xs text-gray-400">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Waiting for Monad confirmation…
                </div>
              )}
            </motion.div>
          )}

          {/* ── Done ── */}
          {step === "done" && mintedNft && (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="py-6 text-center space-y-5"
            >
              <div className="relative h-16 w-16 mx-auto">
                <div className="absolute inset-0 bg-monad-purple/30 blur-xl rounded-full" />
                <div className="relative h-16 w-16 rounded-full bg-monad-purple/20 border border-monad-purple/30 flex items-center justify-center">
                  <CheckCircle className="h-8 w-8 text-monad-purple" />
                </div>
              </div>

              <div>
                <p className="text-lg font-bold text-white mb-1">You're in.</p>
                <p className="text-sm text-gray-400">
                  Slot <span className="text-monad-purple font-mono">#{slotNumber}</span> is initialized. You are the first occupant and signing authority.
                </p>
              </div>

              <div
                data-testid="card-movein-result"
                className="p-4 rounded-xl bg-white/5 border border-monad-purple/20 text-left space-y-3"
              >
                <p className="text-xs text-gray-500 uppercase tracking-wider">Vault record</p>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Locker</span>
                  <span className="text-white font-mono">{mintedNft.lockerRef}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Slot</span>
                  <span className="text-white font-mono">#{slotNumber}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Occupant</span>
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
                  <span className="text-gray-500">NFT key</span>
                  <span className="text-solana-green font-mono">{mintedNft.mint}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Slot history</span>
                  <span className="text-gray-500 italic">None — genesis entry</span>
                </div>
              </div>

              <Button
                data-testid="button-done-movein"
                onClick={handleFinish}
                className="w-full bg-monad-purple hover:bg-monad-purple/90 text-white font-bold"
              >
                Done — open vault controls
              </Button>
            </motion.div>
          )}

        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
