import { useState } from "react";
import { Shield, Key, Wallet, ArrowRight, CheckCircle, Loader2, X, Home, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ── Types ────────────────────────────────────────────────────
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
  availableNfts: Nft[];
}

interface VaultResult {
  vault_ref: string;
  locker_ref: string;
  fees: { lifetime_lease: number; move_in_fee: number; total_due: number };
}

// ── Constants ────────────────────────────────────────────────
const API_URL       = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const LEASE_FEE     = 0.05;
const MOVE_IN_FEE   = 0.001;
const TOTAL_FEE     = LEASE_FEE + MOVE_IN_FEE;

// ── Step definitions ─────────────────────────────────────────
const STEPS = ['Select key', 'Set deposit', 'Review', 'Done'];

export function MoveInModal({ isOpen, onClose, onSuccess, connectedWallet, availableNfts }: MoveInModalProps) {
  const [step, setStep]               = useState(0);
  const [selectedNft, setSelectedNft] = useState<Nft | null>(null);
  const [depositSol, setDepositSol]   = useState('');
  const [securityMode, setMode]       = useState<'system' | 'self' | null>(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [result, setResult]           = useState<VaultResult | null>(null);

  if (!isOpen) return null;

  const reset = () => {
    setStep(0); setSelectedNft(null); setDepositSol('');
    setMode(null); setLoading(false); setError(null); setResult(null);
  };

  const handleClose = () => { reset(); onClose(); };

  // ── Step 0: Select NFT key ───────────────────────────────
  const StepSelectKey = () => (
    <div className="space-y-4">
      <div className="text-center pb-2 border-b border-white/10">
        <p className="text-sm text-gray-400">
          Select an NFT from your wallet to register as your vault key.
          You keep the NFT — it never leaves your wallet.
        </p>
      </div>

      {availableNfts.length === 0 ? (
        <div className="py-10 text-center space-y-3">
          <div className="h-12 w-12 rounded-full bg-white/5 flex items-center justify-center mx-auto">
            <Key className="h-5 w-5 text-gray-500" />
          </div>
          <p className="text-sm text-gray-500">No NFTs found in your wallet.</p>
          <p className="text-xs text-gray-600">Connect your Solana wallet or mint a NexusBridge key.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 max-h-64 overflow-y-auto pr-1">
          {availableNfts.map((nft) => (
            <button
              key={nft.mint}
              onClick={() => setSelectedNft(nft)}
              className={`relative p-3 rounded-xl border text-left transition-all ${
                selectedNft?.mint === nft.mint
                  ? 'border-monad-purple bg-monad-purple/10'
                  : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
              }`}
            >
              {selectedNft?.mint === nft.mint && (
                <div className="absolute top-2 right-2">
                  <CheckCircle className="h-4 w-4 text-monad-purple" />
                </div>
              )}
              <div className="h-16 w-full rounded-lg bg-white/5 mb-2 overflow-hidden">
                {nft.image
                  ? <img src={nft.image} alt={nft.name} className="h-full w-full object-cover" />
                  : <div className="h-full w-full flex items-center justify-center">
                      <Key className="h-6 w-6 text-gray-600" />
                    </div>
                }
              </div>
              <p className="text-xs font-medium text-white truncate">{nft.name}</p>
              <p className="text-xs text-gray-600 font-mono truncate">{nft.mint.slice(0,8)}...</p>
            </button>
          ))}
        </div>
      )}

      <Button
        onClick={() => setStep(1)}
        disabled={!selectedNft}
        className="w-full bg-monad-purple hover:bg-monad-purple/90 text-black font-bold"
      >
        Continue
        <ArrowRight className="h-4 w-4 ml-2" />
      </Button>
    </div>
  );

  // ── Step 1: Deposit amount + security mode ───────────────
  const StepDeposit = () => (
    <div className="space-y-5">
      <div className="p-3 rounded-lg bg-white/5 border border-white/10 flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-monad-purple/20 flex items-center justify-center shrink-0">
          <Key className="h-5 w-5 text-monad-purple" />
        </div>
        <div>
          <p className="text-xs text-gray-500">Vault key</p>
          <p className="text-sm font-medium text-white">{selectedNft?.name}</p>
          <p className="text-xs text-gray-600 font-mono">{selectedNft?.mint.slice(0,12)}...</p>
        </div>
      </div>

      <div>
        <label className="text-xs text-gray-500 mb-2 block">Initial SOL deposit (optional)</label>
        <div className="relative">
          <input
            type="number"
            value={depositSol}
            onChange={(e) => setDepositSol(e.target.value)}
            placeholder="0.00"
            min="0"
            step="0.01"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-monad-purple/50 font-mono"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-500">SOL</span>
        </div>
        <p className="text-xs text-gray-600 mt-1">You can deposit more anytime after move-in.</p>
      </div>

      <div>
        <label className="text-xs text-gray-500 mb-2 block">Security mode</label>
        <div className="grid grid-cols-2 gap-2">
          <button
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
  );

  // ── Step 2: Review & confirm ─────────────────────────────
  const StepReview = () => (
    <div className="space-y-4">
      <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
        <p className="text-xs text-gray-500 uppercase tracking-wider">Move-in summary</p>

        <div className="flex justify-between text-sm">
          <span className="text-gray-400">NFT key</span>
          <span className="text-white font-medium">{selectedNft?.name}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Initial deposit</span>
          <span className="text-white font-mono">{parseFloat(depositSol) || 0} SOL</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Security mode</span>
          <Badge variant="outline" className={`text-xs ${
            securityMode === 'system'
              ? 'border-monad-purple/30 text-monad-purple'
              : securityMode === 'self'
              ? 'border-solana-green/30 text-solana-green'
              : 'border-white/10 text-gray-500'
          }`}>
            {securityMode ?? 'unset'}
          </Badge>
        </div>

        <div className="border-t border-white/10 pt-3 space-y-2">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Fees (flat — one time)</p>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Lifetime lease</span>
            <span className="text-white font-mono">{LEASE_FEE} SOL</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Move-in fee</span>
            <span className="text-white font-mono">{MOVE_IN_FEE} SOL</span>
          </div>
          <div className="flex justify-between text-sm font-bold border-t border-white/10 pt-2">
            <span className="text-white">Total due today</span>
            <span className="text-monad-purple font-mono">{(TOTAL_FEE + (parseFloat(depositSol) || 0)).toFixed(4)} SOL</span>
          </div>
        </div>
      </div>

      <div className="p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20 flex gap-2">
        <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
        <p className="text-xs text-yellow-500/80">
          This is a lifetime lease. You pay once and the vault is yours permanently.
          Fees do not reference or depend on what you deposit — they are flat infrastructure pricing.
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setStep(1)} className="border-white/10 text-gray-400" disabled={loading}>
          Back
        </Button>
        <Button
          onClick={handleMoveIn}
          disabled={loading}
          className="flex-1 bg-monad-purple hover:bg-monad-purple/90 text-black font-bold"
        >
          {loading ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Moving in...</>
          ) : (
            <><Home className="h-4 w-4 mr-2" /> Confirm move-in</>
          )}
        </Button>
      </div>
    </div>
  );

  // ── Step 3: Success ──────────────────────────────────────
  const StepDone = () => (
    <div className="text-center space-y-5 py-4">
      <div className="h-16 w-16 rounded-full bg-monad-purple/20 flex items-center justify-center mx-auto">
        <CheckCircle className="h-8 w-8 text-monad-purple" />
      </div>
      <div>
        <p className="text-lg font-bold text-white mb-1">Welcome home.</p>
        <p className="text-sm text-gray-400">Your vault is live. Your NFT is your key.</p>
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
            <span className="text-gray-500">Lease</span>
            <span className="text-green-400">Paid — lifetime</span>
          </div>
        </div>
      )}

      <Button
        onClick={() => { if (result) onSuccess(result); handleClose(); }}
        className="w-full bg-monad-purple hover:bg-monad-purple/90 text-black font-bold"
      >
        View my vault
      </Button>
    </div>
  );

  // ── Move-in API call ─────────────────────────────────────
  async function handleMoveIn() {
    if (!connectedWallet || !selectedNft) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/move-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerWallet:  connectedWallet,
          nftTokenId:   selectedNft.tokenId,
          nftMint:      selectedNft.mint,
          depositSol:   parseFloat(depositSol) || 0,
          securityMode: securityMode,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Move-in failed. Please try again.');
        return;
      }

      setResult({ vault_ref: data.vault_ref, locker_ref: data.locker_ref, fees: data.fees });
      setStep(3);
    } catch (err) {
      setError('Could not reach the NexusBridge server. Check your connection.');
    } finally {
      setLoading(false);
    }
  }

  // ── Modal shell ──────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative w-full max-w-md bg-black border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-monad-purple/20 flex items-center justify-center">
              <Home className="h-4 w-4 text-monad-purple" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Move In</h2>
              <p className="text-xs text-gray-500">Create your vault — lifetime lease</p>
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
                    i < step ? 'bg-monad-purple text-black'
                    : i === step ? 'bg-monad-purple/30 text-monad-purple border border-monad-purple/50'
                    : 'bg-white/5 text-gray-600'
                  }`}>
                    {i < step ? '✓' : i + 1}
                  </div>
                  <span className={`text-xs transition-colors ${
                    i === step ? 'text-white' : 'text-gray-600'
                  }`}>{label}</span>
                </div>
                {i < 2 && <div className={`flex-1 h-px mx-2 ${i < step ? 'bg-monad-purple/50' : 'bg-white/10'}`} />}
              </div>
            ))}
          </div>
        )}

        {/* Step content */}
        <div className="p-5">
          {step === 0 && <StepSelectKey />}
          {step === 1 && <StepDeposit />}
          {step === 2 && <StepReview />}
          {step === 3 && <StepDone />}
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
