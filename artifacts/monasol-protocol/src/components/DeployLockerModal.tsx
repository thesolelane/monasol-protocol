import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Terminal, Lock, Shield, Server, Box, Layers } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface DeployLockerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function DeployLockerModal({ isOpen, onClose, onSuccess }: DeployLockerModalProps) {
  const [step, setStep] = useState<"form" | "deploying" | "success">("form");
  const [lockerType, setLockerType] = useState("public");
  const [lockerName, setLockerName] = useState("Monad Public Pool #7");
  const [logs, setLogs] = useState<string[]>([]);

  const handleDeploy = () => {
    setStep("deploying");
    setLogs(["Initializing Vyper compiler...", "Connecting to Monad Mainnet RPC..."]);

    const mockProcess = async () => {
      const addLog = (msg: string, delay: number) => {
        return new Promise<void>((resolve) => {
          setTimeout(() => {
            setLogs((prev) => [...prev, msg]);
            resolve();
          }, delay);
        });
      };

      await addLog(`> vyper compile contracts/${lockerType === 'vip' ? 'VIPLocker' : 'PublicLocker'}.vy`, 800);
      await addLog("Contract compiled successfully. Bytecode size: 14.2kb", 500);
      await addLog("Estimating deployment gas...", 400);
      await addLog(`Gas Estimate: ${lockerType === 'vip' ? '500,000' : '150,000'} gwei`, 300);
      await addLog("> monasol-cli deploy --network monad", 1000);
      await addLog("Broadcasting transaction to Monad...", 800);
      await addLog("Transaction Signature: 0x8f2a...91bC", 1500);
      await addLog("Awaiting 1 confirmation...", 1000);
      await addLog("✅ Locker Factory Contract Deployed!", 500);
      await addLog(`Contract Address: 0x${Math.random().toString(16).substring(2, 10)}...${Math.random().toString(16).substring(2, 6)}`, 200);

      setTimeout(() => {
        setStep("success");
      }, 1500);
    };

    mockProcess();
  };

  const handleFinish = () => {
    onSuccess();
    setStep("form");
    setLogs([]);
    onClose();
  };

  const handleClose = () => {
    if (step !== "deploying") {
      setStep("form");
      setLogs([]);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md bg-black/90 border-white/10 text-white backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl flex items-center gap-2">
            <Server className="h-5 w-5 text-monad-purple" />
            Deploy Monad Locker
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Deploy a new isolated Vyper smart contract on Monad to hold user vaults.
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {step === "form" && (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6 py-4"
            >
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-gray-400">Locker Type</Label>
                <Select value={lockerType} onValueChange={setLockerType}>
                  <SelectTrigger className="bg-white/5 border-white/10 focus:ring-monad-purple">
                    <SelectValue placeholder="Select Locker Type" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-950 border-white/10 text-white">
                    <SelectItem value="public">
                      <div className="flex items-center gap-2">
                        <Layers className="h-4 w-4 text-gray-400" />
                        <div>
                          <p className="font-bold text-sm text-white">Public Pool (20,000 Vaults)</p>
                          <p className="text-xs text-gray-500">Shared contract, subsidized deployment.</p>
                        </div>
                      </div>
                    </SelectItem>
                    <SelectItem value="vip">
                      <div className="flex items-center gap-2 mt-2">
                        <Box className="h-4 w-4 text-monad-purple" />
                        <div>
                          <p className="font-bold text-sm text-monad-purple">VIP Isolation (10 Vaults)</p>
                          <p className="text-xs text-gray-500">Dedicated contract, maximum security.</p>
                        </div>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-gray-400">Locker Name</Label>
                <Input
                  value={lockerName}
                  onChange={(e) => setLockerName(e.target.value)}
                  className="bg-white/5 border-white/10 focus-visible:ring-monad-purple font-mono"
                />
              </div>

              <div className="rounded-lg border border-white/5 bg-black/40 p-4 space-y-3">
                 <div className="flex justify-between items-center text-xs">
                   <span className="text-gray-400">Network:</span>
                   <span className="font-mono text-white flex items-center gap-1">
                     <div className="h-1.5 w-1.5 rounded-full bg-monad-purple shadow-[0_0_5px_rgba(130,71,229,0.8)]" />
                     Monad Mainnet
                   </span>
                 </div>
                 <div className="flex justify-between items-center text-xs">
                   <span className="text-gray-400">Compiler:</span>
                   <span className="font-mono text-white">Vyper v0.3.10</span>
                 </div>
                 <div className="flex justify-between items-center text-xs">
                   <span className="text-gray-400">Estimated Gas:</span>
                   <span className="font-mono text-monad-purple">
                     {lockerType === 'vip' ? '~500,000 MON ($12.00)' : '~150,000 MON ($0.08)'}
                   </span>
                 </div>
              </div>

              <Button
                onClick={handleDeploy}
                className="w-full h-12 bg-monad-purple hover:bg-monad-purple/90 text-black font-bold shadow-[0_0_15px_-3px_rgba(130,71,229,0.4)]"
              >
                Deploy Locker Contract
              </Button>
            </motion.div>
          )}

          {step === "deploying" && (
            <motion.div
              key="deploying"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="py-6"
            >
              <div className="bg-black border border-white/10 rounded-lg p-4 font-mono text-xs sm:text-xs h-64 overflow-y-auto shadow-inner relative flex flex-col">
                <div className="absolute top-0 left-0 w-full h-6 bg-linear-to-b from-black to-transparent z-10" />
                <div className="flex-1 space-y-1 mt-2">
                  {logs.map((log, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-gray-600 shrink-0">{new Date().toISOString().split('T')[1].substring(0, 8)}</span>
                      <span className={
                        log.startsWith(">") ? "text-purple-400 font-bold" :
                        log.includes("✅") ? "text-green-400 font-bold" :
                        log.includes("Signature:") || log.includes("Address:") ? "text-yellow-400" :
                        "text-gray-300"
                      }>
                        {log}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 text-monad-purple mt-4">
                    <span className="flex h-2 w-2 rounded-full bg-monad-purple animate-ping" />
                    <span>Awaiting Monad consensus...</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {step === "success" && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="py-6 flex flex-col items-center text-center space-y-4"
            >
              <div className="h-20 w-20 rounded-full bg-monad-purple/20 flex items-center justify-center border border-monad-purple/30">
                <Shield className="h-10 w-10 text-monad-purple" />
              </div>
              <div>
                <h3 className="font-display text-xl font-bold text-white mb-1">Deployment Complete</h3>
                <p className="text-sm text-gray-400">
                  {lockerType === 'vip' ? 'Your dedicated VIP 10-Vault Locker is live.' : 'New Public 20,000-Vault Locker is live.'}
                </p>
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