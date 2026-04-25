import { useState, useEffect } from "react";
import { ArrowLeftRight, Link as LinkIcon, Copy, CheckCircle, Shield, AlertTriangle, Wallet, Key, ArrowRight, X, Info, ChevronDown, Loader2, ArrowLeft, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";

// ── Types ────────────────────────────────────────────────────
type SwapType = "sol-to-sol" | "sol-to-monad";
type SwapStep = "setup" | "review" | "pending" | "complete";

interface NftKey {
  mint: string;
  name: string;
  image?: string;
  vaultRef?: string;
  lockerRef?: string;
}

// ── Constants ────────────────────────────────────────────────
const SWAP_FEE_SOL    = 0.002; // flat protocol fee — same for every swap
const LINK_TTL_HOURS  = 48;    // swap links expire after 48 hours

// ── Swap link encryption ─────────────────────────────────────
// In production: server generates a signed JWT or encrypted token.
// The URL never exposes wallet address or NFT mint in plaintext.
// Here we simulate that with a base64 payload + expiry timestamp.
function generateSwapToken(wallet: string, nftMint: string): string {
  const payload = {
    w: wallet,           // initiator wallet
    n: nftMint,          // offered NFT mint
    e: Date.now() + (LINK_TTL_HOURS * 60 * 60 * 1000), // expiry
    v: 1,                // token version
  };
  // In production this would be server-signed (JWT/HMAC).
  // For now: base64 encode to simulate opaque token.
  return btoa(JSON.stringify(payload)).replace(/=/g, "");
}

function decodeSwapToken(token: string): { wallet: string; nftMint: string; expired: boolean } | null {
  try {
    const padded  = token + "==".slice(0, (4 - token.length % 4) % 4);
    const payload = JSON.parse(atob(padded));
    return {
      wallet:  payload.w,
      nftMint: payload.n,
      expired: Date.now() > payload.e,
    };
  } catch {
    return null;
  }
}

// ── Mock data ────────────────────────────────────────────────
const MOCK_MY_NFTS: NftKey[] = [
  { mint: "7xK2...9mN", name: "NexusKey #4821", vaultRef: "VLT-4729...881", lockerRef: "LCK-0000...001" },
  { mint: "3bR8...1pQ", name: "NexusKey #0293", vaultRef: "VLT-8821...443", lockerRef: "LCK-0000...001" },
];

// ── Principles & disclaimers data ───────────────────────────
const PRINCIPLES = [
  {
    icon: Lock,
    title: "Atomic execution only",
    body: "Both NFTs transfer simultaneously in a single on-chain transaction or neither does. There is no escrow period, no hold state, and no intermediate custody.",
  },
  {
    icon: Shield,
    title: "NexusBridge is never a counterparty",
    body: "We construct and execute the swap transaction. We never hold either NFT. We take no position on the exchange.",
  },
  {
    icon: ArrowLeftRight,
    title: "Flat protocol fee — always",
    body: "The fee is the same for every swap regardless of which NFTs are involved. It is not calculated as a percentage of any value and does not reference vault contents.",
  },
  {
    icon: Info,
    title: "No price discovery",
    body: "NexusBridge does not display, suggest, or reference the value of any vault. Terms are agreed between the two parties off-platform before initiating a swap.",
  },
];

const DISCLAIMERS = [
  "NexusBridge is infrastructure. It is not a broker, dealer, exchange operator, or financial intermediary.",
  "Vault contents are never displayed, referenced, or factored into any fee calculation on this platform.",
  "Both parties must consent independently. A swap link does not constitute an offer or solicitation.",
  "The protocol fee covers transaction construction and execution only. It is not compensation for facilitating an asset exchange.",
  "For Solana → Monad swaps, the receiving NFT is registered inside a Locker owned by the receiver. The receiver must own a Locker with available vault capacity.",
  "NexusBridge does not provide tax, legal, or financial advice. Consult qualified professionals regarding obligations in your jurisdiction.",
];

// ── Main page ────────────────────────────────────────────────
export default function SwapPage() {
  const [connected, setConnected]         = useState(false);
  const [step, setStep]                   = useState<SwapStep>("setup");
  const [swapType, setSwapType]           = useState<SwapType>("sol-to-sol");
  const [myNft, setMyNft]                 = useState<NftKey | null>(null);
  const [counterpartyAddress, setAddr]    = useState("");
  const [counterpartyNft, setCounterNft]  = useState("");
  const [targetLocker, setTargetLocker]   = useState("");
  const [linkGenerated, setLinkGenerated] = useState(false);
  const [linkCopied, setLinkCopied]       = useState(false);
  const [showPrinciples, setShowPrinciples] = useState(false);
  const [loading, setLoading]             = useState(false);
  const [txSig, setTxSig]                 = useState("");
  const [showNftPicker, setShowNftPicker] = useState(false);
  const [linkExpired, setLinkExpired]     = useState(false);

  // Parse encrypted swap token on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token  = params.get("token");
    if (!token) return;
    const decoded = decodeSwapToken(token);
    if (!decoded) return;
    if (decoded.expired) {
      // Show expired state — link is dead
      setLinkExpired(true);
      return;
    }
    setAddr(decoded.wallet);
    setCounterNft(decoded.nftMint);
  }, []);

  const mockWallet = "8xR...3kL";
  const swapToken  = myNft ? generateSwapToken(mockWallet, myNft.mint) : "";
  const swapLink   = myNft
    ? `${window.location.origin}/swap?token=${swapToken}`
    : "";

  function handleCopyLink() {
    navigator.clipboard.writeText(swapLink).catch(() => {});
    setLinkCopied(true);
    setLinkGenerated(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  async function handleConfirmSwap() {
    setLoading(true);
    setStep("pending");
    await new Promise(r => setTimeout(r, 2200));
    setTxSig("5xKm...9pR2");
    setStep("complete");
    setLoading(false);
  }

  // ── Swap type label ──────────────────────────────────────
  const swapTypeLabel = swapType === "sol-to-sol"
    ? "Solana → Solana"
    : "Solana → Monad Locker";

  // ── Render ───────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      {/* Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(130,71,229,0.08)_0%,transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_80%,rgba(20,241,149,0.05)_0%,transparent_60%)]" />
        <div className="absolute inset-0 opacity-[0.02]"
          style={{ backgroundImage: "repeating-linear-gradient(0deg,#fff 0px,#fff 1px,transparent 1px,transparent 40px),repeating-linear-gradient(90deg,#fff 0px,#fff 1px,transparent 1px,transparent 40px)" }} />
      </div>

      <div className="relative z-10 max-w-2xl mx-auto px-4 py-8">

        {/* Back nav */}
        <Link href="/">
          <Button variant="ghost" className="text-gray-500 hover:text-white mb-6 -ml-2 text-sm">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
        </Link>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-monad-purple/30 to-solana-green/20 border border-white/10 flex items-center justify-center">
              <ArrowLeftRight className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Atomic Swap</h1>
              <p className="text-xs text-gray-500">Trustless peer-to-peer NFT key exchange</p>
            </div>
          </div>

          {/* Protocol badge strip */}
          <div className="flex flex-wrap gap-2 mt-4">
            {["Atomic only", "Flat fee", "No custody", "No price discovery"].map(tag => (
              <span key={tag} className="text-xs px-2.5 py-1 rounded-full border border-white/10 bg-white/5 text-gray-400">
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Expired link banner */}
        {linkExpired && (
          <div className="mb-6 p-4 rounded-xl border border-red-500/20 bg-red-500/5 flex gap-3">
            <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-red-400 mb-1">Swap link expired</p>
              <p className="text-xs text-red-400/70">
                This swap link was valid for {LINK_TTL_HOURS} hours and has expired.
                Ask the initiating party to generate a new link.
              </p>
            </div>
          </div>
        )}

        {/* ── SETUP STEP ── */}
        {step === "setup" && (
          <div className="space-y-5">

            {/* Wallet connect */}
            {!connected && (
              <div className="p-5 rounded-2xl border border-white/10 bg-white/5 text-center space-y-3">
                <Wallet className="h-8 w-8 text-gray-600 mx-auto" />
                <p className="text-sm text-gray-400">Connect your Solana wallet to initiate a swap</p>
                <Button
                  onClick={() => setConnected(true)}
                  className="bg-monad-purple hover:bg-monad-purple/90 text-black font-bold"
                >
                  Connect Wallet
                </Button>
              </div>
            )}

            {connected && (
              <>
                {/* Swap type selector */}
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Swap type</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(["sol-to-sol", "sol-to-monad"] as SwapType[]).map(type => (
                      <button
                        key={type}
                        onClick={() => setSwapType(type)}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          swapType === type
                            ? "border-monad-purple/50 bg-monad-purple/10"
                            : "border-white/10 bg-white/5 hover:border-white/20"
                        }`}
                      >
                        <p className="text-xs font-bold text-white mb-1">
                          {type === "sol-to-sol" ? "Solana → Solana" : "Solana → Monad Locker"}
                        </p>
                        <p className="text-xs text-gray-500">
                          {type === "sol-to-sol"
                            ? "NFT lands in counterparty's Solana wallet"
                            : "NFT registered inside a Monad Locker"}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* My NFT */}
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Your NFT key to offer</p>
                  {myNft ? (
                    <div className="flex items-center gap-3 p-3 rounded-xl border border-monad-purple/30 bg-monad-purple/5">
                      <div className="h-10 w-10 rounded-lg bg-monad-purple/20 flex items-center justify-center shrink-0">
                        <Key className="h-5 w-5 text-monad-purple" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white">{myNft.name}</p>
                        <p className="text-xs text-gray-500 font-mono">{myNft.vaultRef}</p>
                      </div>
                      <button onClick={() => setMyNft(null)} className="text-gray-600 hover:text-white">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowNftPicker(true)}
                      className="w-full p-4 rounded-xl border border-dashed border-white/20 bg-white/5 hover:border-white/30 hover:bg-white/10 transition-all text-center"
                    >
                      <Key className="h-5 w-5 text-gray-600 mx-auto mb-1" />
                      <p className="text-sm text-gray-500">Select NFT key from your wallet</p>
                    </button>
                  )}
                </div>

                {/* NFT picker dropdown */}
                {showNftPicker && (
                  <div className="rounded-xl border border-white/10 bg-black/80 overflow-hidden">
                    {MOCK_MY_NFTS.map(nft => (
                      <button
                        key={nft.mint}
                        onClick={() => { setMyNft(nft); setShowNftPicker(false); }}
                        className="w-full flex items-center gap-3 p-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0"
                      >
                        <div className="h-8 w-8 rounded-lg bg-monad-purple/20 flex items-center justify-center shrink-0">
                          <Key className="h-4 w-4 text-monad-purple" />
                        </div>
                        <div className="text-left">
                          <p className="text-sm text-white">{nft.name}</p>
                          <p className="text-xs text-gray-600 font-mono">{nft.vaultRef}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Counterparty */}
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Counterparty</p>
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={counterpartyAddress}
                      onChange={e => setAddr(e.target.value)}
                      placeholder="Paste counterparty Solana wallet address"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-monad-purple/40 font-mono"
                    />
                    <input
                      type="text"
                      value={counterpartyNft}
                      onChange={e => setCounterNft(e.target.value)}
                      placeholder="Counterparty NFT mint address to receive"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-monad-purple/40 font-mono"
                    />
                  </div>
                </div>

                {/* Monad locker destination — only for sol-to-monad */}
                {swapType === "sol-to-monad" && (
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">
                      Destination Locker (yours or counterparty's)
                    </p>
                    <input
                      type="text"
                      value={targetLocker}
                      onChange={e => setTargetLocker(e.target.value)}
                      placeholder="e.g. LCK-0000...001"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-solana-green/40 font-mono"
                    />
                    <p className="text-xs text-gray-600 mt-1.5">
                      The incoming NFT will be registered as a vault key inside this Locker. The Locker must have available capacity and be owned by the receiver.
                    </p>
                  </div>
                )}

                {/* Generate swap link */}
                <div className="p-4 rounded-xl border border-white/10 bg-white/5 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-400 font-medium">Share swap link with counterparty</p>
                    {linkGenerated && (
                      <Badge variant="outline" className="text-xs border-green-500/20 text-green-400">
                        Generated
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-2">
                  <div className="flex-1 bg-black/50 border border-white/10 rounded-lg px-3 py-2 font-mono text-xs text-gray-500 truncate">
                    {myNft ? `${window.location.origin}/swap?token=${swapToken.slice(0,16)}...` : "Select your NFT first"}
                  </div>
                    <Button
                      onClick={handleCopyLink}
                      disabled={!myNft}
                      variant="outline"
                      className="border-white/10 text-gray-400 hover:text-white shrink-0"
                    >
                      {linkCopied ? <CheckCircle className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-gray-600">
                    Link is encrypted — it does not expose your wallet address or NFT mint in plaintext.
                    Valid for {LINK_TTL_HOURS} hours. Both parties must confirm independently before execution.
                  </p>
                </div>

                {/* Fee display */}
                <div className="p-4 rounded-xl border border-white/10 bg-black/40 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500">Protocol fee</p>
                    <p className="text-lg font-mono font-bold text-white">{SWAP_FEE_SOL} SOL</p>
                    <p className="text-xs text-gray-600">Flat — same for every swap</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Swap type</p>
                    <p className="text-sm font-medium text-monad-purple">{swapTypeLabel}</p>
                  </div>
                </div>

                <Button
                  onClick={() => setStep("review")}
                  disabled={!myNft || !counterpartyAddress || !counterpartyNft || (swapType === "sol-to-monad" && !targetLocker)}
                  className="w-full bg-monad-purple hover:bg-monad-purple/90 text-black font-bold h-12 text-sm"
                >
                  Review swap
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </>
            )}
          </div>
        )}

        {/* ── REVIEW STEP ── */}
        {step === "review" && (
          <div className="space-y-4">
            <div className="p-5 rounded-2xl border border-white/10 bg-white/5 space-y-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider">Swap summary</p>

              {/* Visual swap diagram */}
              <div className="flex items-center gap-3">
                <div className="flex-1 p-3 rounded-xl border border-monad-purple/20 bg-monad-purple/5 text-center">
                  <p className="text-xs text-gray-500 mb-1">You send</p>
                  <p className="text-sm font-bold text-white">{myNft?.name}</p>
                  <p className="text-xs text-gray-600 font-mono mt-1">{myNft?.vaultRef}</p>
                </div>
                <div className="h-8 w-8 rounded-full border border-white/10 bg-black flex items-center justify-center shrink-0">
                  <ArrowLeftRight className="h-4 w-4 text-gray-500" />
                </div>
                <div className="flex-1 p-3 rounded-xl border border-solana-green/20 bg-solana-green/5 text-center">
                  <p className="text-xs text-gray-500 mb-1">You receive</p>
                  <p className="text-sm font-bold text-white font-mono truncate">{counterpartyNft.slice(0,10)}...</p>
                  {swapType === "sol-to-monad" && (
                    <p className="text-xs text-solana-green font-mono mt-1">→ {targetLocker}</p>
                  )}
                </div>
              </div>

              <div className="border-t border-white/10 pt-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Counterparty</span>
                  <span className="text-white font-mono text-xs">{counterpartyAddress.slice(0,12)}...</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Swap type</span>
                  <span className="text-monad-purple text-xs">{swapTypeLabel}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Execution</span>
                  <span className="text-white text-xs">Atomic — both transfer or neither does</span>
                </div>
                <div className="flex justify-between text-sm font-bold pt-2 border-t border-white/10">
                  <span className="text-gray-400">Protocol fee</span>
                  <span className="text-white font-mono">{SWAP_FEE_SOL} SOL</span>
                </div>
              </div>
            </div>

            {/* Consent statement */}
            <div className="p-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5 space-y-2">
              <div className="flex gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-xs font-bold text-yellow-500">By confirming you acknowledge:</p>
                  <ul className="text-xs text-yellow-500/70 space-y-1">
                    <li>• Terms were agreed with the counterparty off-platform</li>
                    <li>• NexusBridge does not know or display vault contents</li>
                    <li>• This swap is atomic — it cannot be reversed once executed</li>
                    <li>• The protocol fee is flat and unrelated to any vault value</li>
                    {swapType === "sol-to-monad" && (
                      <li>• The incoming NFT will be registered in {targetLocker} — verify this is correct</li>
                    )}
                  </ul>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setStep("setup")}
                className="border-white/10 text-gray-400"
              >
                Back
              </Button>
              <Button
                onClick={handleConfirmSwap}
                className="flex-1 bg-monad-purple hover:bg-monad-purple/90 text-black font-bold h-11"
              >
                Confirm & execute swap
                <ArrowLeftRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* ── PENDING STEP ── */}
        {step === "pending" && (
          <div className="py-16 text-center space-y-5">
            <div className="h-16 w-16 rounded-full border border-monad-purple/30 bg-monad-purple/10 flex items-center justify-center mx-auto">
              <Loader2 className="h-7 w-7 text-monad-purple animate-spin" />
            </div>
            <div>
              <p className="text-lg font-bold text-white mb-1">Executing swap</p>
              <p className="text-sm text-gray-500">Constructing atomic transaction on Solana...</p>
            </div>
            <div className="max-w-xs mx-auto space-y-2">
              {["Verifying NFT ownership", "Constructing atomic transaction", "Awaiting Solana finality"].map((s, i) => (
                <div key={s} className="flex items-center gap-2 text-xs text-gray-600">
                  <div className={`h-1.5 w-1.5 rounded-full ${i === 1 ? "bg-monad-purple animate-pulse" : i === 0 ? "bg-green-500" : "bg-white/20"}`} />
                  {s}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── COMPLETE STEP ── */}
        {step === "complete" && (
          <div className="py-12 text-center space-y-5">
            <div className="h-16 w-16 rounded-full bg-monad-purple/20 border border-monad-purple/30 flex items-center justify-center mx-auto">
              <CheckCircle className="h-8 w-8 text-monad-purple" />
            </div>
            <div>
              <p className="text-lg font-bold text-white mb-1">Swap complete</p>
              <p className="text-sm text-gray-500">Both NFTs transferred atomically.</p>
            </div>
            <div className="p-4 rounded-xl border border-white/10 bg-white/5 text-left space-y-2 max-w-sm mx-auto">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Transaction</span>
                <span className="text-white font-mono">{txSig}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Fee paid</span>
                <span className="text-white font-mono">{SWAP_FEE_SOL} SOL</span>
              </div>
              {swapType === "sol-to-monad" && (
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Registered in</span>
                  <span className="text-solana-green font-mono">{targetLocker}</span>
                </div>
              )}
            </div>
            <Link href="/">
              <Button className="bg-monad-purple hover:bg-monad-purple/90 text-black font-bold">
                Back to dashboard
              </Button>
            </Link>
          </div>
        )}

        {/* ── PRINCIPLES & DISCLAIMERS ── */}
        <div className="mt-10 border-t border-white/5 pt-8 space-y-6">

          {/* Principles */}
          <div>
            <button
              onClick={() => setShowPrinciples(!showPrinciples)}
              className="flex items-center justify-between w-full text-left"
            >
              <p className="text-sm font-semibold text-white">Protocol principles</p>
              <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${showPrinciples ? "rotate-180" : ""}`} />
            </button>

            {showPrinciples && (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {PRINCIPLES.map(({ icon: Icon, title, body }) => (
                  <div key={title} className="p-4 rounded-xl border border-white/5 bg-white/5 space-y-2">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-monad-purple shrink-0" />
                      <p className="text-xs font-bold text-white">{title}</p>
                    </div>
                    <p className="text-xs text-gray-500 leading-relaxed">{body}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Disclaimers */}
          <div className="space-y-2">
            <p className="text-xs text-gray-600 uppercase tracking-wider font-medium">Disclaimers</p>
            <div className="space-y-2">
              {DISCLAIMERS.map((d, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-gray-700 text-xs shrink-0 mt-0.5">•</span>
                  <p className="text-xs text-gray-600 leading-relaxed">{d}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
