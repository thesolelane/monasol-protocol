import { useState, useLayoutEffect } from "react";
import { Key, Wallet, ArrowRight, CheckCircle, Loader2, X, ShieldCheck, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Nft {
  mint: string;
  name: string;
  image?: string;
  tokenId: string;
}

interface MoveInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (vault: VaultResult) => void;
  connectedWallet: string | null;
  preSelectedNft?: Nft | null;
  onMintKey?: () => void;
  onConnectWallet?: () => void;
}

interface VaultResult {
  vault_ref: string;
  locker_ref: string;
  fees: { lifetime_lease: number; move_in_fee: number; total_due: number };
}

const STEPS = ['Present key', 'Set preferences', 'Confirm claim'];

export function MoveInModal({
  isOpen, onClose, onSuccess, connectedWallet,
  preSelectedNft, onMintKey, onConnectWallet,
}: MoveInModalProps) {
  const [step, setStep]               = useState(0);
  const [selectedNft, setSelectedNft] = useState<Nft | null>(null);
  const [depositMon, setDepositMon]   = useState('');
  const [securityMode, setMode]       = useState<'system' | 'self' | null>(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [result, setResult]           = useState<VaultResult | null>(null);

  useLayoutEffect(() => {
    if (isOpen) {
      if (preSelectedNft) {
        setSelectedNft(preSelectedNft);
        setStep(1);
      } else {
        setSelectedNft(null);
        setStep(0);
      }
      setDepositMon('');
      setMode(null);
      setError(null);
      setResult(null);
      setLoading(false);
    }
  }, [isOpen, preSelectedNft]);

  if (!isOpen) return null;

  const handleClose = () => { onClose(); };

  async function handleMoveIn() {
    if (!connectedWallet || !selectedNft) return;
    setLoading(true);
    setError(null);
    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const vaultRef  = `VLT-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}...${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
      const lockerRef = `LCK-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}...${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
      setResult({ vault_ref: vaultRef, locker_ref: lockerRef, fees: { lifetime_lease: 0, move_in_fee: 0, total_due: 0 } });
      setStep(3);
    } catch {
      setError('Could not reach the MonasolProtocol server. Check your connection.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative w-full max-w-md bg-black border border-white/10 rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-monad-purple/20 flex items-center justify-center">
              <ShieldCheck className="h-4 w-4 text-monad-purple" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Claim Vault Ownership</h2>
              <p className="text-xs text-gray-500">Register your NFT key — rotate shards to your wallet</p>
            </div>
          </div>
          <button onClick={handleClose} className="text-gray-600 hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Step indicator */}
        {step < 3 && (
          <div className="flex items-center gap-0 px-5 py-3 border-b border-white/5">
            {STEPS.slice(0, 3).map((label, i) => (
              <div key={label} className="flex items-center gap-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <div className={`h-5 w-5 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    i < step  ? 'bg-monad-purple text-black'
                    : i === step ? 'bg-monad-purple/30 text-monad-purple border border-monad-purple/50'
                    : 'bg-white/5 text-gray-600'
                  }`}>
                    {i < step ? '✓' : i + 1}
                  </div>
                  <span className={`text-xs transition-colors ${i === step ? 'text-white' : 'text-gray-600'}`}>
                    {label}
                  </span>
                </div>
                {i < 2 && <div className={`flex-1 h-px mx-2 ${i < step ? 'bg-monad-purple/50' : 'bg-white/10'}`} />}
              </div>
            ))}
          </div>
        )}

        {/* Step content */}
        <div className="p-5">

          {/* ── Step 0: Mint required gate ── */}
          {step === 0 && (
            <div className="py-8 text-center space-y-4">
              <div className="h-16 w-16 rounded-full bg-solana-green/10 border border-solana-green/20 flex items-center justify-center mx-auto">
                <Key className="h-7 w-7 text-solana-green" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white mb-1">NFT key required in your wallet</p>
                <p className="text-xs text-gray-500 max-w-[280px] mx-auto leading-relaxed">
                  To claim ownership, you need the vault's NFT key in your Solana wallet. You can mint a new one, or use a key you already hold.
                </p>
              </div>
              <div className="flex flex-col gap-2 max-w-[220px] mx-auto pt-2">
                {!connectedWallet && (
                  <Button onClick={onConnectWallet} variant="outline" className="w-full bg-black/40 border-solana-green/30 text-solana-green hover:bg-solana-green/10 h-10">
                    <Wallet className="h-4 w-4 mr-2" />
                    Connect Wallet First
                  </Button>
                )}
                <Button onClick={onMintKey} className="w-full bg-solana-green hover:bg-solana-green/90 text-black font-bold h-11 shadow-[0_0_15px_-3px_rgba(20,241,149,0.4)]">
                  <Key className="h-4 w-4 mr-2" />
                  Mint a New Vault Key
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 1: Deposit + security mode ── */}
          {step === 1 && (
            <div className="space-y-5">
              {/* NFT badge */}
              <div className="p-3 rounded-lg bg-white/5 border border-white/10 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-monad-purple/20 flex items-center justify-center shrink-0 overflow-hidden">
                  {selectedNft?.image
                    ? <img src={selectedNft.image} alt={selectedNft.name} className="h-full w-full object-cover" />
                    : <Key className="h-5 w-5 text-monad-purple" />
                  }
                </div>
                <div>
                  <p className="text-xs text-gray-500">Vault key</p>
                  <p className="text-sm font-medium text-white">{selectedNft?.name}</p>
                  <p className="text-xs text-gray-600 font-mono">{selectedNft?.mint.slice(0, 12)}...</p>
                </div>
              </div>

              {/* MON deposit */}
              <div>
                <label className="text-xs text-gray-500 mb-2 block">Initial MON deposit (optional)</label>
                <div className="relative">
                  <input
                    type="number"
                    value={depositMon}
                    onChange={(e) => setDepositMon(e.target.value)}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 pr-16 text-white placeholder-gray-600 focus:outline-none focus:border-monad-purple/50 font-mono"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-500 pointer-events-none">MON</span>
                </div>
                <p className="text-xs text-gray-600 mt-1">The vault and its contents transfer with the NFT. Any existing balance carries over — this deposit is additive.</p>
              </div>

              {/* Security mode */}
              <div>
                <label className="text-xs text-gray-500 mb-2 block">Security mode</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMode('system')}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      securityMode === 'system'
                        ? 'border-monad-purple bg-monad-purple/10'
                        : 'border-white/10 bg-white/5 hover:border-white/20'
                    }`}
                  >
                    <p className="text-xs font-bold text-white mb-1">System</p>
                    <p className="text-xs text-gray-500">Auto-lock with your Locker on threat</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('self')}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      securityMode === 'self'
                        ? 'border-solana-green bg-solana-green/10'
                        : 'border-white/10 bg-white/5 hover:border-white/20'
                    }`}
                  >
                    <p className="text-xs font-bold text-white mb-1">Self</p>
                    <p className="text-xs text-gray-500">Receive alarm, decide yourself</p>
                  </button>
                </div>
                <p className="text-xs text-gray-600 mt-1">You can change this anytime from your vault settings.</p>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(0)} className="border-white/10 text-gray-400">
                  Back
                </Button>
                <Button
                  onClick={() => setStep(2)}
                  className="flex-1 bg-monad-purple hover:bg-monad-purple/90 text-black font-bold"
                >
                  Review
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 2: Review & confirm ── */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                <p className="text-xs text-gray-500 uppercase tracking-wider">Ownership claim summary</p>

                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">NFT key</span>
                  <span className="text-white font-medium">{selectedNft?.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Shard rotation</span>
                  <span className="text-solana-green text-xs font-medium">→ Your wallet</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Security mode</span>
                  <Badge variant="outline" className={`text-xs ${
                    securityMode === 'system' ? 'border-monad-purple/30 text-monad-purple'
                    : securityMode === 'self'  ? 'border-solana-green/30 text-solana-green'
                    : 'border-white/10 text-gray-500'
                  }`}>
                    {securityMode ?? 'unset'}
                  </Badge>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Prior wallet ties</span>
                  <span className="text-red-400 text-xs font-medium">✗ Severed on confirm</span>
                </div>

                <div className="border-t border-white/10 pt-3">
                  <div className="flex justify-between text-sm font-bold">
                    <span className="text-white">Additional MON deposit</span>
                    <span className="text-monad-purple font-mono">
                      {parseFloat(depositMon) > 0 ? `${parseFloat(depositMon).toFixed(4)} MON` : 'None'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    Existing vault balance transfers with the NFT. This deposit is additive.
                  </p>
                </div>
              </div>

              {/* Requirements checklist */}
              <div className="rounded-xl border border-white/10 bg-white/5 divide-y divide-white/5">
                <div className="px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Key className="h-3.5 w-3.5 text-solana-green" />
                    <span className="text-xs text-gray-400">NFT key in wallet</span>
                  </div>
                  <span className="text-xs font-semibold text-solana-green">✓ Verified</span>
                </div>
                <div className="px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <PenLine className="h-3.5 w-3.5 text-monad-purple" />
                    <span className="text-xs text-gray-400">Wallet signature</span>
                  </div>
                  <span className="text-xs font-semibold text-monad-purple">Requested on confirm</span>
                </div>
              </div>

              <p className="text-xs text-gray-600 text-center">
                Both are required. The multi-sig will not rotate shards without a valid NFT proof and your wallet signature.
              </p>

              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <p className="text-xs text-red-400">{error}</p>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)} className="border-white/10 text-gray-400" disabled={loading}>
                  Back
                </Button>
                <Button onClick={handleMoveIn} disabled={loading} className="flex-1 bg-monad-purple hover:bg-monad-purple/90 text-black font-bold">
                  {loading
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Awaiting signature...</>
                    : <><ShieldCheck className="h-4 w-4 mr-2" /> Sign & claim ownership</>
                  }
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 3: Done ── */}
          {step === 3 && (
            <div className="text-center space-y-5 py-4">
              <div className="h-16 w-16 rounded-full bg-monad-purple/20 flex items-center justify-center mx-auto">
                <CheckCircle className="h-8 w-8 text-monad-purple" />
              </div>
              <div>
                <p className="text-lg font-bold text-white mb-1">Ownership confirmed.</p>
                <p className="text-sm text-gray-400">All shards are now registered to your wallet. Prior ties have been severed.</p>
              </div>
              {result && (
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-left space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Locker</span>
                    <span className="text-white font-mono">{result.locker_ref}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Vault</span>
                    <span className="text-monad-purple font-mono font-bold">{result.vault_ref}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Shard status</span>
                    <span className="text-solana-green">Rotated to your wallet</span>
                  </div>
                </div>
              )}
              <Button
                onClick={() => { if (result) onSuccess(result); handleClose(); }}
                className="w-full bg-monad-purple hover:bg-monad-purple/90 text-black font-bold"
              >
                Open vault controls
              </Button>
            </div>
          )}
        </div>

        {/* Wallet indicator */}
        {step < 3 && connectedWallet && (
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
