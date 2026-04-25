import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { motion, AnimatePresence } from "framer-motion";
import { Key, Check, Search, Shield, Zap, Info } from "lucide-react";

interface RentVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const AVAILABLE_VAULTS = [
  {
    id: "1-UNIT-ESTATE",
    name: "Single-Family Estate",
    capacity: 1,
    available: 1,
    pricePerMonth: "5000 USDC",
    securityLevel: "Absolute Isolation",
    network: "Monad",
    features: ["Dedicated Vyper Contract", "Independent Pause Authority", "White-glove setup"],
  },
  {
    id: "23-UNIT-BOUTIQUE",
    name: "Boutique Syndicate",
    capacity: 23,
    available: 5,
    pricePerMonth: "500 USDC",
    securityLevel: "Maximum Isolation",
    network: "Monad",
    features: ["Shared among 23 members", "Multi-sig native", "No public routing"],
  },
  {
    id: "100-UNIT-FUND",
    name: "Hedge Fund Pool",
    capacity: 100,
    available: 12,
    pricePerMonth: "150 USDC",
    securityLevel: "High Isolation",
    network: "Monad",
    features: ["Institutional grade", "Batched oracle proofs", "Sub-vault gating"],
  },
  {
    id: "1000-UNIT-CORP",
    name: "Corporate Treasury Pool",
    capacity: 1000,
    available: 45,
    pricePerMonth: "50 USDC",
    securityLevel: "High Isolation",
    network: "Monad",
    features: ["Sub-Vault Gating (Rooms)", "Multi-sig native", "Batched oracle proofs"],
  },
  {
    id: "10000-UNIT-COMMUNITY",
    name: "Community Pool",
    capacity: 10000,
    available: 3400,
    pricePerMonth: "5 USDC",
    securityLevel: "Standard",
    network: "Monad",
    features: ["Low gas costs", "Yield routing available", "Instant provisioning"],
  },
  {
    id: "20K-UNIT-PUBLIC",
    name: "Public Retail Pool",
    capacity: 20000,
    available: 12405,
    pricePerMonth: "Free (Subsidized)",
    securityLevel: "Standard",
    network: "Monad",
    features: ["Zero deployment cost", "Gas optimized", "Instant provisioning"],
  },
];

export function RentVaultModal({ isOpen, onClose, onSuccess }: RentVaultModalProps) {
  const [step, setStep] = useState<"list" | "renting" | "success">("list");
  const [selectedVault, setSelectedVault] = useState<string | null>(null);

  const handleRent = () => {
    if (!selectedVault) return;
    setStep("renting");

    setTimeout(() => {
      setStep("success");
    }, 2000);
  };

  const handleFinish = () => {
    onSuccess();
    setStep("list");
    setSelectedVault(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl bg-black/90 border-white/10 text-white backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl flex items-center gap-2">
            <Key className="h-5 w-5 text-solana-green" />
            Rent a Vault
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            NexusBridge controls the Locker contracts on Monad. You can rent a specific vault inside these Lockers based on your security needs.
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {step === "list" && (
            <motion.div
              key="list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4 py-4"
            >
              <div className="grid gap-4">
                {AVAILABLE_VAULTS.map((vault) => (
                  <div
                    key={vault.id}
                    onClick={() => setSelectedVault(vault.id)}
                    className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                      selectedVault === vault.id
                        ? "border-solana-green bg-solana-green/5"
                        : "border-white/5 bg-white/5 hover:border-white/20"
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="font-bold text-white text-lg">{vault.name}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-monad-purple/20 text-monad-purple border border-monad-purple/30">
                            {vault.network}
                          </span>
                          <span className="text-xs text-gray-400">
                            {vault.available} / {vault.capacity} Available
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-bold text-solana-green">{vault.pricePerMonth}</p>
                        <p className="text-[10px] text-gray-500 uppercase">per month</p>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-white/5 grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <p className="text-[10px] text-gray-500 uppercase">Security Tier</p>
                        <p className="text-sm text-gray-300 flex items-center gap-1">
                          <Shield className="h-3 w-3 text-blue-400" />
                          {vault.securityLevel}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] text-gray-500 uppercase">Features</p>
                        <ul className="text-xs text-gray-400">
                          {vault.features.slice(0, 2).map((f, i) => (
                            <li key={i} className="flex items-center gap-1">
                              <Check className="h-3 w-3 text-solana-green" />
                              {f}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 mt-4">
                <Info className="h-4 w-4 text-blue-400 shrink-0" />
                <p className="text-xs text-blue-400">
                  Renting a vault immediately mints a new Solana NFT Key to your connected wallet. You will have exclusive access to this Monad vault.
                </p>
              </div>

              <Button
                onClick={handleRent}
                disabled={!selectedVault}
                className="w-full h-12 mt-4 bg-solana-green hover:bg-solana-green/90 text-black font-bold shadow-[0_0_15px_-3px_rgba(20,241,149,0.4)]"
              >
                Mint NFT Key & Rent Vault
              </Button>
            </motion.div>
          )}

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
                <p className="text-sm text-gray-400">Connecting to Monad Locker Contract</p>
                <p className="text-sm text-gray-400">Minting Solana NFT Key...</p>
              </div>
            </motion.div>
          )}

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
                <h3 className="font-display text-xl font-bold text-white mb-1">Vault Rented Successfully!</h3>
                <p className="text-sm text-gray-400">Your new NFT Key has been added to your wallet. You now have exclusive access to this Monad Vault.</p>
              </div>
              <Button
                onClick={handleFinish}
                className="w-full h-12 mt-4 bg-white hover:bg-gray-200 text-black font-bold"
              >
                Return to Dashboard
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}