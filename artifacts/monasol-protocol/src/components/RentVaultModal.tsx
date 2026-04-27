import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { Key, Check, Shield, Zap, Wallet, X, AlertTriangle } from "lucide-react";

interface RentVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
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
    minDepositSol: 10,
    oneTimeFeeSOL: 0.05,
    moveInFeeSOL: 0.001,
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
    minDepositSol: 1,
    oneTimeFeeSOL: 0.05,
    moveInFeeSOL: 0.001,
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
    minDepositSol: 1000,
    oneTimeFeeSOL: 2,
    moveInFeeSOL: 0.001,
    securityLevel: "Absolute Isolation",
    features: ["Near-private contract", "Independent pause authority", "White-glove setup"],
  },
];

export function RentVaultModal({ isOpen, onClose, onSuccess, connectedWallet, onConnectWallet }: RentVaultModalProps) {
  const [step, setStep] = useState<"list" | "renting" | "success">("list");
  const [selectedTier, setSelectedTier] = useState<string | null>(null);

  const selected = TIERS.find(t => t.id === selectedTier);

  const handleRent = () => {
    if (!selectedTier || !connectedWallet) return;
    setStep("renting");
    setTimeout(() => setStep("success"), 2200);
  };

  const handleClose = () => {
    setStep("list");
    setSelectedTier(null);
    onClose();
  };

  const handleFinish = () => {
    onSuccess();
    handleClose();
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
            Choose a locker tier. You pay a flat one-time fee — no subscriptions, no monthly charges.
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
                <p className="text-xs text-gray-500">A connected wallet is required to receive your NFT key when you rent a vault.</p>
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
                          <p className="text-[10px] text-gray-500 uppercase">one-time, lifetime</p>
                        </div>
                      </div>

                      <div className="mt-3 pt-3 border-t border-white/5 flex flex-wrap gap-x-6 gap-y-2">
                        <div>
                          <p className="text-[10px] text-gray-500 uppercase">Slots</p>
                          <p className="text-xs text-white">
                            {isFull ? "Full" : `${tier.slotsAvailable} / ${tier.slotsTotal} open`}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-500 uppercase">Min deposit</p>
                          <p className="text-xs text-white">{tier.minDepositSol} MON</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-500 uppercase">Security</p>
                          <p className="text-xs text-white flex items-center gap-1">
                            <Shield className="h-3 w-3 text-blue-400" />
                            {tier.securityLevel}
                          </p>
                        </div>
                      </div>

                      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                        {tier.features.map((f) => (
                          <li key={f} className="text-[11px] text-gray-400 flex items-center gap-1">
                            <Check className="h-3 w-3 text-solana-green shrink-0" />
                            {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>

              {/* Fee summary + CTA */}
              {selected && (
                <div className="mt-3 p-3 rounded-lg bg-white/5 border border-white/10 text-xs space-y-1">
                  <div className="flex justify-between text-gray-400">
                    <span>Lifetime lease</span>
                    <span className="font-mono text-white">{selected.oneTimeFeeSOL} SOL</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>Move-in fee</span>
                    <span className="font-mono text-white">{selected.moveInFeeSOL} SOL</span>
                  </div>
                  <div className="flex justify-between font-bold border-t border-white/10 pt-1 mt-1">
                    <span className="text-white">Total due today</span>
                    <span className="font-mono text-solana-green">
                      {(selected.oneTimeFeeSOL + selected.moveInFeeSOL).toFixed(4)} SOL
                    </span>
                  </div>
                  <p className="text-gray-600 pt-1">Minimum deposit of {selected.minDepositSol} MON required at move-in. Not charged now.</p>
                </div>
              )}

              <Button
                onClick={handleRent}
                disabled={!selectedTier}
                className="w-full mt-3 h-11 bg-solana-green hover:bg-solana-green/90 text-black font-bold shadow-[0_0_15px_-3px_rgba(20,241,149,0.4)]"
              >
                Mint NFT Key & Rent Vault
              </Button>
            </motion.div>
          )}

          {/* ── Provisioning ── */}
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
                <h3 className="font-display text-xl font-bold text-white">Provisioning Vault...</h3>
                <p className="text-sm text-gray-400">Connecting to Monad Locker contract</p>
                <p className="text-sm text-gray-400">Minting your Solana NFT key</p>
              </div>
            </motion.div>
          )}

          {/* ── Success ── */}
          {step === "success" && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="py-8 flex flex-col items-center text-center space-y-4"
            >
              <div className="h-20 w-20 rounded-full bg-solana-green/20 flex items-center justify-center border border-solana-green/30">
                <Key className="h-10 w-10 text-solana-green" />
              </div>
              <div>
                <h3 className="font-display text-xl font-bold text-white mb-1">Vault Rented</h3>
                <p className="text-sm text-gray-400">
                  Your NFT key has been minted to your wallet. Use it to move assets into your vault.
                </p>
              </div>
              <Button
                onClick={handleFinish}
                className="w-full h-11 mt-2 bg-monad-purple hover:bg-monad-purple/90 text-black font-bold"
              >
                Move In Now
              </Button>
            </motion.div>
          )}

        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
