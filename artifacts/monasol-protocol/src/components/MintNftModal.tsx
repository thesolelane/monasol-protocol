import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Terminal, Upload, Loader2, Key, QrCode, ImageIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface MintNftModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (nft: { id: string; name: string; image: string; rarity: string }) => void;
}

export function MintNftModal({ isOpen, onClose, onSuccess }: MintNftModalProps) {
  const [step, setStep] = useState<"form" | "minting" | "success">("form");
  const [collectionName, setCollectionName] = useState("MonasolProtocol Secure Keys");
  const [keyName, setKeyName] = useState("Vault Key #001");
  const [mintMethod, setMintMethod] = useState<"qr" | "image">("qr");
  const [logs, setLogs] = useState<string[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Generate a random seed when the modal opens to use for the visual signature if the user hasn't typed much
  const visualSeed = useMemo(() => Math.random().toString(36).substring(7), [isOpen]);
  const currentSeed = keyName.length > 2 ? keyName : visualSeed;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

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
      
      if (mintMethod === 'qr') {
        await addLog("> Generating secure QR payload...", 400);
        await addLog(`Applying visual signature hash: ${currentSeed.substring(0, 8)}...`, 300);
        await addLog("Payload: monasol://auth/vault/0442/sig=9x2...", 300);
      } else {
        await addLog("> Processing custom image asset...", 600);
        await addLog("Optimizing image resolution and generating hash...", 400);
      }

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
    const finalImage = mintMethod === 'image' && previewImage 
      ? previewImage 
      : `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(currentSeed)}&backgroundColor=000000`;

    onSuccess({
      id: Math.random().toString(36).substring(7),
      name: keyName,
      image: finalImage,
      rarity: mintMethod === 'qr' ? "Visual QR Key" : "Custom Art",
    });
    setStep("form");
    setLogs([]);
    setPreviewImage(null);
    onClose();
  };

  const handleClose = () => {
    if (step !== "minting") {
      setStep("form");
      setLogs([]);
      setPreviewImage(null);
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
            Mint a secure NFT bearer instrument directly to your wallet.
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
                <Label className="text-xs uppercase tracking-wider text-gray-400">Key Name</Label>
                <Input
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  className="bg-white/5 border-white/10 focus-visible:ring-solana-green font-mono"
                  placeholder="Enter a name to generate your visual signature"
                />
              </div>

              <div className="space-y-3">
                <Label className="text-xs uppercase tracking-wider text-gray-400">Key Format</Label>
                <Tabs value={mintMethod} onValueChange={(v) => setMintMethod(v as "qr" | "image")} className="w-full">
                  <TabsList className="grid w-full grid-cols-2 bg-white/5 border border-white/10">
                    <TabsTrigger value="qr" className="data-[state=active]:bg-solana-green data-[state=active]:text-black transition-all">
                      <QrCode className="h-4 w-4 mr-2" />
                      Secure QR Code
                    </TabsTrigger>
                    <TabsTrigger value="image" className="data-[state=active]:bg-solana-green data-[state=active]:text-black transition-all">
                      <ImageIcon className="h-4 w-4 mr-2" />
                      Custom Image
                    </TabsTrigger>
                  </TabsList>
                  
                  <div className="mt-4 min-h-[160px] border border-white/10 rounded-lg bg-black/40 flex items-center justify-center p-4 relative overflow-hidden">
                    <TabsContent value="qr" className="m-0 w-full flex flex-col items-center justify-center text-center space-y-4">
                       <div className="p-4 bg-white rounded-lg relative">
                         <QrCode className="h-20 w-20 text-black" />
                         <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                           <div className="h-8 w-8 rounded overflow-hidden border-2 border-white bg-black">
                             <img 
                               src={`https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(currentSeed)}`} 
                               alt="Visual Signature" 
                               className="w-full h-full object-cover"
                             />
                           </div>
                         </div>
                       </div>
                       <div>
                         <p className="text-sm font-bold text-solana-green">Cryptographic QR Key</p>
                         <p className="text-xs text-gray-400 max-w-[250px] mx-auto mt-1">
                           Includes a unique visual signature based on the Key Name so you can easily recognize it.
                         </p>
                       </div>
                    </TabsContent>
                    
                    <TabsContent value="image" className="m-0 w-full h-full">
                      {previewImage ? (
                        <div className="relative w-full h-full min-h-[140px] flex items-center justify-center group">
                          <img src={previewImage} alt="Preview" className="max-h-[140px] rounded-md object-contain" />
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-md">
                            <Label htmlFor="image-upload" className="cursor-pointer text-white text-xs font-bold px-3 py-1.5 bg-white/20 rounded hover:bg-white/30 transition-colors">
                              Change Image
                            </Label>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full min-h-[140px] text-gray-500 hover:text-white transition-colors cursor-pointer w-full">
                          <Label htmlFor="image-upload" className="flex flex-col items-center justify-center cursor-pointer w-full h-full">
                            <Upload className="h-8 w-8 mb-3" />
                            <span className="text-sm font-medium">Click to upload custom art</span>
                            <span className="text-[10px] mt-1 text-gray-500">JPG, PNG, GIF up to 5MB</span>
                          </Label>
                        </div>
                      )}
                      <input 
                        id="image-upload" 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={handleImageUpload}
                      />
                    </TabsContent>
                  </div>
                </Tabs>
              </div>

              <div className="p-3 bg-solana-green/10 border border-solana-green/20 rounded-lg flex gap-3 items-start">
                 <div className="p-1.5 bg-solana-green/20 rounded-full mt-0.5">
                   <Key className="h-3 w-3 text-solana-green" />
                 </div>
                 <div>
                   <p className="text-xs font-bold text-solana-green">No Sign-in Required</p>
                   <p className="text-[10px] text-solana-green/70 leading-tight mt-1">
                     Keys are minted directly to your connected wallet. The asset itself is the only authentication needed to unlock funds.
                   </p>
                 </div>
              </div>

              <Button
                onClick={handleMint}
                className="w-full h-12 bg-solana-green hover:bg-solana-green/90 text-black font-bold shadow-[0_0_15px_-3px_rgba(20,241,149,0.4)]"
              >
                Mint {mintMethod === 'qr' ? 'QR Key' : 'Image Key'}
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
              {mintMethod === 'qr' ? (
                <div className="p-3 bg-white rounded-xl relative">
                  <QrCode className="h-24 w-24 text-black" />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="h-10 w-10 rounded overflow-hidden border-[3px] border-white bg-black">
                      <img 
                        src={`https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(currentSeed)}`} 
                        alt="Visual Signature" 
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-24 w-24 rounded-xl overflow-hidden border-2 border-solana-green/50">
                  <img src={previewImage || ""} alt="Minted NFT" className="w-full h-full object-cover" />
                </div>
              )}
              
              <div>
                <h3 className="font-display text-xl font-bold text-white mb-1">Minting Complete</h3>
                <p className="text-sm text-gray-400">Your {mintMethod === 'qr' ? 'QR Key' : 'Custom Image Key'} is now in your wallet.</p>
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