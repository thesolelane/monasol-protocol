import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  ArrowDown, ArrowLeftRight, CheckCircle2, ChevronDown,
  Loader2, RefreshCw, Zap, AlertTriangle, Info,
} from "lucide-react";
import { getFeatureFlags } from "@/lib/featureFlags";

interface ConvertPanelProps {
  vaultId: string;
  vaultBalance: string;
  monadConnected: boolean;
}

type Stage = "form" | "review" | "converting" | "done";

const EVM_TOKENS = [
  { symbol: "MON",  label: "Monad Native",  color: "text-monad-purple", decimals: 2 },
  { symbol: "ETH",  label: "Wrapped ETH",   color: "text-blue-400",     decimals: 4 },
  { symbol: "USDC", label: "USD Coin",       color: "text-green-400",    decimals: 2 },
];

const SOL_TOKENS = [
  { symbol: "SOL",  label: "Solana Native" },
  { symbol: "wSOL", label: "Wrapped SOL"   },
  { symbol: "USDC", label: "USDC (SPL)"    },
];

const MOCK_BALANCES: Record<string, string> = {
  MON:  "12.50",
  ETH:  "0.0042",
  USDC: "245.00",
};

const MOCK_RATES: Record<string, Record<string, number>> = {
  MON:  { SOL: 0.38, wSOL: 0.38,  USDC: 18.40 },
  ETH:  { SOL: 62.5, wSOL: 62.5,  USDC: 3_400  },
  USDC: { SOL: 0.0054, wSOL: 0.0054, USDC: 1  },
};

const BRIDGE_FEE_PCT = 0.003;
const PROTOCOL_FEE   = 0.002;

const STEPS = [
  "Authorizing withdrawal on Monad",
  "Bridging via Wormhole",
  "Settling on Solana via Jupiter",
];

export function ConvertPanel({ vaultId, vaultBalance, monadConnected }: ConvertPanelProps) {
  const monadEnabled = getFeatureFlags().monadWalletEnabled;

  const [open, setOpen]             = useState(false);
  const [fromToken, setFromToken]   = useState(EVM_TOKENS[0]);
  const [toToken, setToToken]       = useState(SOL_TOKENS[0]);
  const [amount, setAmount]         = useState("");
  const [stage, setStage]           = useState<Stage>("form");
  const [stepIdx, setStepIdx]       = useState(0);
  const [stepDone, setStepDone]     = useState<boolean[]>([]);
  const [txSig, setTxSig]           = useState("");

  const numAmount  = parseFloat(amount) || 0;
  const rate       = MOCK_RATES[fromToken.symbol]?.[toToken.symbol] ?? 1;
  const grossOut   = numAmount * rate;
  const bridgeFee  = grossOut * BRIDGE_FEE_PCT;
  const netOut     = Math.max(0, grossOut - bridgeFee);
  const balance    = parseFloat(MOCK_BALANCES[fromToken.symbol] ?? "0");
  const overMax    = numAmount > balance;
  const canReview  = numAmount > 0 && !overMax;

  function handleMax() {
    setAmount(MOCK_BALANCES[fromToken.symbol] ?? "0");
  }

  async function startConvert() {
    setStage("converting");
    setStepIdx(0);
    setStepDone([]);

    for (let i = 0; i < STEPS.length; i++) {
      setStepIdx(i);
      await new Promise(r => setTimeout(r, 1800 + Math.random() * 800));
      setStepDone(prev => [...prev, true]);
    }

    setTxSig(`${Math.random().toString(36).slice(2, 10).toUpperCase()}...${Math.random().toString(36).slice(2, 6).toUpperCase()}`);
    setStage("done");
  }

  function reset() {
    setStage("form");
    setAmount("");
    setStepIdx(0);
    setStepDone([]);
    setTxSig("");
  }

  return (
    <div className="glass-panel rounded-2xl relative overflow-hidden mt-6 border border-white/5">
      <div className="absolute top-0 right-0 w-48 h-48 bg-monad-purple/5 blur-[60px] rounded-full pointer-events-none translate-x-1/2 -translate-y-1/2" />

      <button
        data-testid="convert-panel-toggle"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-6 py-5 relative z-10"
      >
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-monad-purple/10 text-monad-purple">
            <ArrowLeftRight className="h-5 w-5" />
          </div>
          <div className="text-left">
            <h2 className="font-display text-lg font-bold text-white">Convert</h2>
            <p className="text-xs text-gray-500">Swap EVM vault tokens to Solana</p>
          </div>
        </div>
        <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-6 space-y-5 relative z-10">

              {/* ── Not enabled ── */}
              {!monadEnabled && (
                <div className="p-4 rounded-xl border border-monad-purple/20 bg-monad-purple/5 flex gap-3">
                  <Info className="h-4 w-4 text-monad-purple shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-monad-purple mb-1">Monad wallet required</p>
                    <p className="text-xs text-gray-400">
                      Cross-chain conversion becomes available once Monad integration is live.
                      An admin can enable it from the Controller panel.
                    </p>
                  </div>
                </div>
              )}

              {/* ── Enabled but not connected ── */}
              {monadEnabled && !monadConnected && (
                <div className="p-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5 flex gap-3">
                  <AlertTriangle className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-yellow-400">Connect your Monad wallet above to authorise the conversion.</p>
                </div>
              )}

              {/* ── FORM ── */}
              {stage === "form" && (
                <div className="space-y-4">
                  {/* From */}
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">From vault ({vaultId})</p>
                    <div className="rounded-xl border border-white/10 bg-black/30 p-4 space-y-3">
                      <div className="flex gap-2">
                        {EVM_TOKENS.map(t => (
                          <button
                            key={t.symbol}
                            data-testid={`from-token-${t.symbol.toLowerCase()}`}
                            onClick={() => { setFromToken(t); setAmount(""); }}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                              fromToken.symbol === t.symbol
                                ? "border-monad-purple/50 bg-monad-purple/10 text-monad-purple"
                                : "border-white/10 bg-white/5 text-gray-400 hover:border-white/20"
                            }`}
                          >
                            {t.symbol}
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center gap-3">
                        <input
                          data-testid="convert-amount-input"
                          type="number"
                          min="0"
                          step="any"
                          value={amount}
                          onChange={e => setAmount(e.target.value)}
                          placeholder="0.00"
                          className="flex-1 bg-transparent text-2xl font-mono text-white placeholder-gray-700 focus:outline-none w-0"
                        />
                        <button
                          data-testid="convert-max-btn"
                          onClick={handleMax}
                          className="text-xs px-2 py-1 rounded-md border border-monad-purple/30 text-monad-purple hover:bg-monad-purple/10 transition-colors shrink-0"
                        >
                          MAX
                        </button>
                      </div>

                      <div className="flex justify-between items-center text-xs">
                        <span className={`${fromToken.color} font-medium`}>{fromToken.label}</span>
                        <span className="text-gray-500">
                          Balance: <span className="text-white font-mono">{MOCK_BALANCES[fromToken.symbol]} {fromToken.symbol}</span>
                        </span>
                      </div>

                      {overMax && (
                        <p className="text-xs text-red-400">Amount exceeds vault balance</p>
                      )}
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className="flex justify-center">
                    <div className="h-8 w-8 rounded-full border border-white/10 bg-black flex items-center justify-center">
                      <ArrowDown className="h-4 w-4 text-gray-500" />
                    </div>
                  </div>

                  {/* To */}
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">To Solana wallet</p>
                    <div className="rounded-xl border border-white/10 bg-black/30 p-4 space-y-3">
                      <div className="flex gap-2">
                        {SOL_TOKENS.map(t => (
                          <button
                            key={t.symbol}
                            data-testid={`to-token-${t.symbol.toLowerCase()}`}
                            onClick={() => setToToken(t)}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                              toToken.symbol === t.symbol
                                ? "border-solana-green/50 bg-solana-green/10 text-solana-green"
                                : "border-white/10 bg-white/5 text-gray-400 hover:border-white/20"
                            }`}
                          >
                            {t.symbol}
                          </button>
                        ))}
                      </div>

                      <div className="text-2xl font-mono text-solana-green">
                        {canReview ? netOut.toFixed(toToken.symbol === "USDC" ? 2 : 4) : "—"}
                      </div>

                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400">{toToken.label}</span>
                        <span className="text-gray-500">
                          Rate: <span className="text-white font-mono">1 {fromToken.symbol} ≈ {rate.toLocaleString()} {toToken.symbol}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Fee breakdown */}
                  {canReview && (
                    <div className="space-y-1.5 p-3 rounded-xl border border-white/5 bg-white/5 text-xs">
                      {[
                        ["Gross out", `${grossOut.toFixed(4)} ${toToken.symbol}`],
                        ["Bridge fee (0.3%)", `− ${bridgeFee.toFixed(4)} ${toToken.symbol}`],
                        ["Protocol fee",      `${PROTOCOL_FEE} SOL`],
                        ["You receive",       `${netOut.toFixed(4)} ${toToken.symbol}`],
                      ].map(([label, value]) => (
                        <div key={label} className="flex justify-between">
                          <span className="text-gray-500">{label}</span>
                          <span className={label === "You receive" ? "text-solana-green font-mono font-bold" : "text-gray-300 font-mono"}>{value}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <Button
                    data-testid="convert-review-btn"
                    onClick={() => setStage("review")}
                    disabled={!canReview || (monadEnabled && !monadConnected)}
                    className="w-full bg-monad-purple hover:bg-monad-purple/90 text-black font-bold h-11 disabled:opacity-40"
                  >
                    Review conversion
                  </Button>
                </div>
              )}

              {/* ── REVIEW ── */}
              {stage === "review" && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl border border-white/10 bg-white/5 space-y-3">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Conversion summary</p>

                    <div className="flex items-center gap-3">
                      <div className="flex-1 p-3 rounded-xl border border-monad-purple/20 bg-monad-purple/5 text-center">
                        <p className="text-xs text-gray-500 mb-1">You send</p>
                        <p className="text-lg font-mono font-bold text-white">{numAmount} {fromToken.symbol}</p>
                        <p className="text-xs text-gray-600 mt-0.5">from {vaultId}</p>
                      </div>
                      <ArrowLeftRight className="h-5 w-5 text-gray-600 shrink-0" />
                      <div className="flex-1 p-3 rounded-xl border border-solana-green/20 bg-solana-green/5 text-center">
                        <p className="text-xs text-gray-500 mb-1">You receive</p>
                        <p className="text-lg font-mono font-bold text-solana-green">{netOut.toFixed(4)} {toToken.symbol}</p>
                        <p className="text-xs text-gray-600 mt-0.5">to your Solana wallet</p>
                      </div>
                    </div>

                    <div className="p-3 rounded-lg border border-white/5 bg-black/30 text-xs space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Bridge route</span>
                        <span className="text-white">Monad → Wormhole → Jupiter</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Bridge fee</span>
                        <span className="text-gray-300 font-mono">0.3%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Protocol fee</span>
                        <span className="text-gray-300 font-mono">{PROTOCOL_FEE} SOL</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Est. time</span>
                        <span className="text-gray-300">~30–90 seconds</span>
                      </div>
                    </div>

                    <div className="p-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5">
                      <p className="text-xs text-yellow-400">
                        This action withdraws tokens from your Monad vault and bridges them to Solana. It cannot be reversed once confirmed.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setStage("form")}
                      className="border-white/10 text-gray-400"
                    >
                      Go back
                    </Button>
                    <Button
                      data-testid="convert-confirm-btn"
                      onClick={startConvert}
                      className="bg-monad-purple hover:bg-monad-purple/90 text-black font-bold"
                    >
                      <Zap className="h-4 w-4 mr-2" />
                      Confirm
                    </Button>
                  </div>
                </div>
              )}

              {/* ── CONVERTING ── */}
              {stage === "converting" && (
                <div className="space-y-4">
                  <div className="text-center py-2">
                    <Loader2 className="h-8 w-8 text-monad-purple animate-spin mx-auto mb-3" />
                    <p className="text-sm font-semibold text-white">Converting…</p>
                    <p className="text-xs text-gray-500 mt-1">Do not close this panel</p>
                  </div>

                  <div className="space-y-2">
                    {STEPS.map((label, i) => {
                      const done    = stepDone[i];
                      const active  = i === stepIdx && !done;
                      return (
                        <div key={label} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                          done   ? "border-solana-green/30 bg-solana-green/5"  :
                          active ? "border-monad-purple/30 bg-monad-purple/5"  :
                                   "border-white/5 bg-white/5 opacity-40"
                        }`}>
                          {done   ? <CheckCircle2 className="h-4 w-4 text-solana-green shrink-0" />  :
                           active ? <Loader2 className="h-4 w-4 text-monad-purple animate-spin shrink-0" /> :
                                    <div className="h-4 w-4 rounded-full border border-white/20 shrink-0" />}
                          <p className="text-xs text-white">{label}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── DONE ── */}
              {stage === "done" && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4 text-center"
                >
                  <div className="py-4">
                    <div className="h-14 w-14 rounded-full bg-solana-green/20 border border-solana-green/30 flex items-center justify-center mx-auto mb-3">
                      <CheckCircle2 className="h-7 w-7 text-solana-green" />
                    </div>
                    <p className="font-bold text-white text-lg mb-1">Conversion complete</p>
                    <p className="text-sm text-gray-400">
                      <span className="font-mono text-solana-green">{netOut.toFixed(4)} {toToken.symbol}</span> sent to your Solana wallet
                    </p>
                  </div>

                  <div className="p-3 rounded-xl border border-white/10 bg-white/5 text-xs space-y-1.5 text-left">
                    <div className="flex justify-between">
                      <span className="text-gray-500">From vault</span>
                      <span className="text-white font-mono">{numAmount} {fromToken.symbol}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Delivered</span>
                      <span className="text-solana-green font-mono">{netOut.toFixed(4)} {toToken.symbol}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Bridge tx</span>
                      <span className="text-gray-300 font-mono">{txSig}</span>
                    </div>
                  </div>

                  <Button
                    data-testid="convert-reset-btn"
                    onClick={reset}
                    variant="outline"
                    className="w-full border-white/10 text-gray-400"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" /> New conversion
                  </Button>
                </motion.div>
              )}

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
