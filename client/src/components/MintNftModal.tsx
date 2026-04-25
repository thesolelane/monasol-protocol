import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Terminal, Upload, Loader2, Key } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface MintNftModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (nft: { id: string; name: string; image: string; rarity: string }) => void;
}

export function MintNftModal({ isOpen, onClose, onSuccess }: MintNftModalProps) {
  const [step, setStep] = useState<"form" | "minting" | "success">("form");
  const [collectionName, setCollectionName] = useState("NexusBridge Secure Keys");
  const [keyName, setKeyName] = useState("Vault Key #001");
  const [logs, setLogs] = useState<string[]>([]);

  const handleMint = () => {
    setStep("minting");
    setLogs(["Initializing Metaplex Core...", "Connecting to Solana Devnet RPC..."]);

    const mockProcess = async () => {
      const addLog = (msg: string, delay: number) => {
        return new Promise<void>((resolve) => {
          setTimeout(() => {
            setLogs((prev) => [...prev, msg]);
            resolve();
          }, delay);
        });
      };

      await addLog("> solana config get", 800);
      await addLog("Config File: /home/runner/.config/solana/cli/config.yml", 100);
      await addLog("RPC URL: https://api.devnet.solana.com", 100);
      await addLog("WebSocket URL: wss://api.devnet.solana.com/", 100);
      await addLog(`> spl-token create-token --program-id TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`, 1000);
      await addLog("Creating token 7Xz...9qL under Token-2022 Program", 500);
      await addLog(`> metaplex mint --collection "${collectionName}" --name "${keyName}"`, 1200);
      await addLog("Uploading metadata to Arweave (Irys)...", 800);
      await addLog("Transaction Signature: 4vJ9mK...pQw2", 1500);
      await addLog("✅ Successfully minted NFT Key!", 500);

      setTimeout(() => {
        setStep("success");
      }, 1000);
    };

    mockProcess();
  };

  const handleFinish = () => {
    onSuccess({
      id: Math.random().toString(36).substring(7),
      name: keyName,
      image: "https://images.unsplash.com/photo-1639815188546-c43c240ff4df?w=400&h=400&fit=crop", // Abstract crypto art
      rarity: "Custom Mint",
    });
    setStep("form");
    setLogs([]);
    onClose();
  };

  const handleClose = () => {
    if (step !== "minting") {
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
            <Key className="h-5 w-5 text-solana-green" />
            Mint New Vault Key
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Use Metaplex Core and Solana CLI to mint a new secure NFT bearer instrument.
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
                <Label className="text-xs uppercase tracking-wider text-gray-400">Collection</Label>
                <Input
                  value={collectionName}
                  onChange={(e) => setCollectionName(e.target.value)}
                  className="bg-white/5 border-white/10 focus-visible:ring-solana-green"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-gray-400">Key Name</Label>
                <Input
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  className="bg-white/5 border-white/10 focus-visible:ring-solana-green font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-gray-400">Artwork (Optional)</Label>
                <div className="h-24 rounded-lg border-2 border-dashed border-white/10 flex flex-col items-center justify-center text-gray-500 hover:text-white hover:border-white/30 hover:bg-white/5 transition-all cursor-pointer">
                  <Upload className="h-6 w-6 mb-2" />
                  <span className="text-xs">Click to upload custom art</span>
                </div>
                <p className="text-[10px] text-gray-500 text-center">Defaults to NexusBridge generative art if left blank</p>
              </div>

              <Button
                onClick={handleMint}
                className="w-full h-12 bg-solana-green hover:bg-solana-green/90 text-black font-bold shadow-[0_0_15px_-3px_rgba(20,241,149,0.4)]"
              >
                Mint via Solana CLI
              </Button>
            </motion.div>
          )}

          {step === "minting" && (
            <motion.div
              key="minting"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="py-6"
            >
              <div className="bg-black border border-white/10 rounded-lg p-4 font-mono text-[11px] sm:text-xs h-64 overflow-y-auto shadow-inner relative flex flex-col">
                <div className="absolute top-0 left-0 w-full h-6 bg-linear-to-b from-black to-transparent z-10" />
                <div className="flex-1 space-y-1 mt-2">
                  {logs.map((log, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-gray-600 shrink-0">{new Date().toISOString().split('T')[1].substring(0, 8)}</span>
                      <span className={
                        log.startsWith(">") ? "text-blue-400 font-bold" :
                        log.includes("✅") ? "text-green-400 font-bold" :
                        log.includes("Signature:") ? "text-yellow-400" :
                        "text-gray-300"
                      }>
                        {log}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 text-solana-green mt-4">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Awaiting confirmation...</span>
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
              <div className="h-20 w-20 rounded-full bg-solana-green/20 flex items-center justify-center border border-solana-green/30">
                <Terminal className="h-10 w-10 text-solana-green" />
              </div>
              <div>
                <h3 className="font-display text-xl font-bold text-white mb-1">Minting Complete</h3>
                <p className="text-sm text-gray-400">Your new NFT Key has been added to your wallet.</p>
              </div>
              <Button
                onClick={handleFinish}
                className="w-full h-12 mt-4 bg-white hover:bg-gray-200 text-black font-bold"
              >
                Use Key to Lock Vault
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}