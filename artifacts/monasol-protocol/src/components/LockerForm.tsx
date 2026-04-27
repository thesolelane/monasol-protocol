import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Unlock, Check, AlertCircle, Key } from "lucide-react";
import { useState } from "react";
import { motion } from "framer-motion";

interface ActiveVault {
  id: string;
  lockerId: string;
  balance: string;
  nftName: string;
}

interface LockerFormProps {
  isConnected: boolean;
  hasNftKey: boolean;
  activeVault?: ActiveVault | null;
}

export function LockerForm({ isConnected, hasNftKey, activeVault }: LockerFormProps) {
  const [amount, setAmount] = useState("");
  const [token, setToken] = useState("");
  const [isLocked, setIsLocked] = useState(false);
  const [unlockError, setUnlockError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLocked) {
      setIsLocked(true);
      setUnlockError(false);
    } else {
      if (isConnected && hasNftKey) {
        setIsLocked(false);
        setUnlockError(false);
      } else {
        setUnlockError(true);
      }
    }
  };

  return (
    <div className="glass-panel rounded-2xl p-6 sm:p-8 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-monad-purple/5 blur-[80px] rounded-full pointer-events-none -translate-y-1/2 translate-x-1/2" />

      <div className="flex items-center gap-3 mb-5">
        <div
          className={`p-3 rounded-xl ${isLocked ? "bg-red-500/20 text-red-400" : "bg-monad-purple/20 text-monad-purple"}`}
        >
          {isLocked ? <Lock className="h-6 w-6" /> : <Unlock className="h-6 w-6" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-2xl font-bold text-white">Vault Controls</h2>
            {activeVault && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white/10 text-white/60 border border-white/5 font-mono truncate max-w-[100px]" title={activeVault.id}>
                {activeVault.id.slice(0, 10)}
              </span>
            )}
          </div>
          {activeVault ? (
            <div className="flex items-center gap-1.5 mt-0.5">
              <Key className="h-3 w-3 text-solana-green" />
              <p className="text-xs text-solana-green truncate">{activeVault.nftName}</p>
            </div>
          ) : (
            <p className="text-sm text-gray-400">Manage your EVM assets via Solana Key</p>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-gray-400">
            Token Address (Monad)
          </Label>
          <div className="relative">
            <Input
              placeholder="0x..."
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="bg-black/20 border-white/10 h-12 font-mono text-sm focus-visible:ring-monad-purple"
              disabled={isLocked}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-gray-400">Amount to Lock</Label>
          <div className="relative">
            <Input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="bg-black/20 border-white/10 h-12 font-mono text-lg font-bold focus-visible:ring-monad-purple"
              disabled={isLocked}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-monad-purple bg-monad-purple/10 px-2 py-1 rounded">
              MON
            </div>
          </div>
        </div>

        <div className="pt-2">
          <Button
            type="submit"
            className={`w-full h-12 text-sm font-bold tracking-wide transition-all ${
              isLocked
                ? "bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/50"
                : "bg-monad-purple hover:bg-monad-purple/90 text-black shadow-[0_0_20px_-5px_rgba(130,71,229,0.5)]"
            }`}
          >
            {isLocked ? "UNLOCK VAULT" : "DEPOSIT & LOCK ASSETS"}
          </Button>
        </div>

        {unlockError && isLocked && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-3 text-red-400 text-xs"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>You must connect your Solana wallet and select the correct NFT Key to unlock.</span>
          </motion.div>
        )}

        {isLocked && !unlockError && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-lg bg-green-500/10 border border-green-500/20 flex items-start gap-3"
          >
            <div className="bg-green-500/20 p-1 rounded-full mt-0.5">
              <Check className="h-3 w-3 text-green-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-green-400">Assets Secured</p>
              <p className="text-xs text-green-400/70 mt-1">
                Unlockable only by holder of Solana NFT #2
              </p>
            </div>
          </motion.div>
        )}
      </form>
    </div>
  );
}
