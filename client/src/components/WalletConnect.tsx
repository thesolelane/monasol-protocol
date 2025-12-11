import { Button } from "@/components/ui/button";
import { Wallet, CheckCircle2, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";

interface WalletConnectProps {
  type: "evm" | "solana";
  isConnected: boolean;
  onConnect: () => void;
}

export function WalletConnect({ type, isConnected, onConnect }: WalletConnectProps) {
  const isEvm = type === "evm";
  
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <Button
        onClick={onConnect}
        variant="outline"
        className={`relative h-14 w-full justify-start gap-4 border-2 px-6 transition-all duration-300 ${
          isConnected 
            ? isEvm 
              ? "border-monad-purple/50 bg-monad-purple/10 text-monad-purple"
              : "border-solana-green/50 bg-solana-green/10 text-solana-green"
            : "border-border hover:border-white/20"
        }`}
      >
        <div className={`rounded-full p-2 ${
          isConnected 
            ? isEvm ? "bg-monad-purple/20" : "bg-solana-green/20"
            : "bg-white/5"
        }`}>
          {isConnected ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : (
            <Wallet className="h-5 w-5" />
          )}
        </div>
        
        <div className="flex flex-col items-start text-left">
          <span className="text-xs font-medium uppercase tracking-wider opacity-70">
            {isEvm ? "Vault Owner" : "Key Holder"}
          </span>
          <span className="font-display text-lg font-bold tracking-tight">
            {isConnected 
              ? isEvm ? "0x71C...9A2" : "8xR...3kL"
              : isEvm ? "Connect Monad" : "Connect Solana"
            }
          </span>
        </div>

        {isConnected && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
             <ShieldCheck className={`h-5 w-5 ${isEvm ? "text-monad-purple" : "text-solana-green"}`} />
          </div>
        )}
      </Button>
    </motion.div>
  );
}