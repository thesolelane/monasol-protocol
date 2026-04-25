import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ShieldAlert, AlertTriangle, Lock, Clock, Settings2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function CircuitBreaker() {
  const [isActive, setIsActive] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rateLimit, setRateLimit] = useState("50000");
  const [timeDelay, setTimeDelay] = useState("24");

  return (
    <div className="glass-panel rounded-2xl p-6 sm:p-8 relative overflow-hidden mt-8 border border-white/5">
      {/* Background Decor */}
      <div className={`absolute top-0 right-0 w-64 h-64 blur-[80px] rounded-full pointer-events-none -translate-y-1/2 translate-x-1/2 transition-colors duration-500 ${isActive ? 'bg-red-500/10' : 'bg-blue-500/5'}`} />

      <div className="flex items-center justify-between mb-6 relative z-10">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-xl transition-colors duration-500 ${isActive ? 'bg-red-500/20 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'bg-blue-500/20 text-blue-400'}`}>
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold text-white">Circuit Breaker</h2>
            <p className="text-sm text-gray-400">User-controlled vault security</p>
          </div>
        </div>
        <Button 
          variant="ghost" 
          size="icon"
          onClick={() => setSettingsOpen(!settingsOpen)}
          className="text-gray-400 hover:text-white hover:bg-white/10"
        >
          <Settings2 className="h-5 w-5" />
        </Button>
      </div>

      <AnimatePresence>
        {settingsOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-6 space-y-4 overflow-hidden"
          >
            <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-gray-400 flex items-center gap-2">
                  <Coins className="h-3 w-3" />
                  Max Withdrawal Rate (24h)
                </Label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</div>
                  <Input
                    type="number"
                    value={rateLimit}
                    onChange={(e) => setRateLimit(e.target.value)}
                    className="bg-black/40 border-white/10 h-10 pl-7 font-mono text-sm focus-visible:ring-blue-500"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-gray-400 flex items-center gap-2">
                  <Clock className="h-3 w-3" />
                  Mandatory Time Delay
                </Label>
                <div className="relative">
                  <Input
                    type="number"
                    value={timeDelay}
                    onChange={(e) => setTimeDelay(e.target.value)}
                    className="bg-black/40 border-white/10 h-10 font-mono text-sm focus-visible:ring-blue-500"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">Hours</div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="p-5 rounded-xl border border-white/10 bg-white/5 relative z-10 flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-white">Emergency Freeze</h3>
            {isActive && (
              <span className="flex h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            )}
          </div>
          <p className="text-xs text-gray-400 max-w-[200px]">
            {isActive 
              ? "Vault is completely locked. No withdrawals allowed." 
              : "Instantly halt all vault activity. Requires hardware key signature."}
          </p>
        </div>
        
        <Switch
          checked={isActive}
          onCheckedChange={setIsActive}
          className={`data-[state=checked]:bg-red-500`}
        />
      </div>

      {isActive && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-3"
        >
          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-400 leading-relaxed">
            <strong>VAULT FROZEN.</strong> All EVM assets are locked. To unfreeze, you must sign a transaction with your primary Solana hardware wallet.
          </p>
        </motion.div>
      )}
    </div>
  );
}