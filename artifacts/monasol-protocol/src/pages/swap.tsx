import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ArrowLeftRight, Link as LinkIcon, Copy, CheckCircle, Shield,
  AlertTriangle, Wallet, Key, ArrowRight, X, Info, ChevronDown,
  Loader2, ArrowLeft, Lock, Send
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Footer } from "@/components/Footer";
import { Link } from "wouter";

type SwapType = "sol-to-sol" | "sol-to-monad";
type SwapStep = "setup" | "review" | "pending" | "complete";

interface NftKey {
  id: string;
  mint: string;
  name: string;
  image: string | null;
  vaultRef: string | null;
  lockerRef: string | null;
  isTicket: boolean;
  transferLockDays: number;
  kycLevel: string;
  eventName: string | null;
}

const SWAP_FEE_SOL   = 0.002;
const LINK_TTL_HOURS = 48;
const MOCK_WALLET    = "8xR...3kL";

function generateSwapToken(wallet: string, nftMint: string): string {
  const payload = {
    w: wallet,
    n: nftMint,
    e: Date.now() + (LINK_TTL_HOURS * 60 * 60 * 1000),
    v: 1,
  };
  return btoa(JSON.stringify(payload)).replace(/=/g, "");
}

function decodeSwapToken(token: string): { wallet: string; nftMint: string; expired: boolean } | null {
  try {
    const padded  = token + "==".slice(0, (4 - token.length % 4) % 4);
    const payload = JSON.parse(atob(padded));
    return { wallet: payload.w, nftMint: payload.n, expired: Date.now() > payload.e };
  } catch {
    return null;
  }
}

const PRINCIPLES = [
  { icon: Lock,          title: "Atomic execution only",                body: "Both NFTs transfer simultaneously in a single on-chain transaction or neither does. There is no escrow period, no hold state, and no intermediate custody." },
  { icon: Shield,        title: "MonasolProtocol is never a counterparty", body: "We construct and execute the swap transaction. We never hold either NFT. We take no position on the exchange." },
  { icon: ArrowLeftRight,title: "Flat protocol fee — always",           body: "The fee is the same for every swap regardless of which NFTs are involved. It is not calculated as a percentage of any value and does not reference vault contents." },
  { icon: Info,          title: "No price discovery",                   body: "MonasolProtocol does not display, suggest, or reference the value of any vault. Terms are agreed between the two parties off-platform before initiating a swap." },
];

const DISCLAIMERS = [
  "MonasolProtocol is infrastructure. It is not a broker, dealer, exchange operator, or financial intermediary.",
  "Vault contents are never displayed, referenced, or factored into any fee calculation on this platform.",
  "Both parties must consent independently. A swap link does not constitute an offer or solicitation.",
  "The protocol fee covers transaction construction and execution only. It is not compensation for facilitating an asset exchange.",
  "For Solana → Monad swaps, the receiving NFT is registered inside a Locker owned by the receiver. The receiver must own a Locker with available vault capacity.",
  "Event ticket NFTs carry contract-enforced transfer restrictions including transfer lock periods and KYC level requirements on the receiving wallet.",
  "MonasolProtocol does not provide tax, legal, or financial advice. Consult qualified professionals regarding obligations in your jurisdiction.",
];

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
  const [swapToken, setSwapToken]         = useState("");

  const { data: nfts = [] } = useQuery<NftKey[]>({
    queryKey: ["/api/nfts", MOCK_WALLET],
    queryFn: () => fetch(`/api/nfts?wallet=${encodeURIComponent(MOCK_WALLET)}`).then(r => r.json()),
    enabled: connected,
    staleTime: 60_000,
  });

  const [swapError, setSwapError] = useState<string | null>(null);

  const confirmMutation = useMutation({
    mutationFn: async (token: string) => {
      const res = await fetch(`/api/swaps/${token}/confirm`, { method: "PATCH" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Server error ${res.status}`);
      }
      return res.json();
    },
    onSuccess: (data) => {
      setTxSig(data.txSignature ?? "");
      setSwapError(null);
      setStep("complete");
      setLoading(false);
    },
    onError: (err: Error) => {
      setSwapError(err.message);
      setStep("review");
      setLoading(false);
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token  = params.get("token");
    if (!token) return;
    const decoded = decodeSwapToken(token);
    if (!decoded) return;
    if (decoded.expired) { setLinkExpired(true); return; }
    setAddr(decoded.wallet);
    setCounterNft(decoded.nftMint);
  }, []);

  const swapLink = swapToken ? `${window.location.origin}/swap?token=${swapToken}` : "";

  function handleCopyLink() {
    navigator.clipboard.writeText(swapLink).catch(() => {});
    setLinkCopied(true);
    setLinkGenerated(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  async function handleCreateSession() {
    if (!myNft || !swapToken) return;
    try {
      const res = await fetch("/api/swaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: swapToken,
          initiatorWallet: MOCK_WALLET,
          offeredNftMint: myNft.mint,
          counterpartyWallet: counterpartyAddress || null,
          requestedNftMint: counterpartyNft || null,
          swapType,
          targetLocker: targetLocker || null,
        }),
      });
      if (res.ok) {
        const session = await res.json().catch(() => null);
        if (session?.token) setSwapToken(session.token);
      }
    } catch {
      // swapToken already set from NFT selection — continue with it
    }
  }

  async function handleConfirmSwap() {
    if (!swapToken) {
      setSwapError("No swap session found. Please start over.");
      return;
    }
    setSwapError(null);
    setLoading(true);
    setStep("pending");
    confirmMutation.mutate(swapToken);
  }

  const swapTypeLabel = swapType === "sol-to-sol" ? "Solana → Solana" : "Solana → Monad Locker";

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(130,71,229,0.08)_0%,transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_80%,rgba(20,241,149,0.05)_0%,transparent_60%)]" />
        <div className="absolute inset-0 opacity-[0.02]"
          style={{ backgroundImage: "repeating-linear-gradient(0deg,#fff 0px,#fff 1px,transparent 1px,transparent 40px),repeating-linear-gradient(90deg,#fff 0px,#fff 1px,transparent 1px,transparent 40px)" }} />
      </div>

      <div className="relative z-10 max-w-2xl mx-auto px-4 py-8">
        <Link href="/">
          <Button variant="ghost" className="text-gray-500 hover:text-white mb-6 -ml-2 text-sm">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
        </Link>

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
          <div className="flex flex-wrap gap-2 mt-4">
            {["Atomic only", "Flat fee", "No custody", "No price discovery"].map(tag => (
              <span key={tag} className="text-xs px-2.5 py-1 rounded-full border border-white/10 bg-white/5 text-gray-400">{tag}</span>
            ))}
          </div>
        </div>

        {linkExpired && (
          <div className="mb-6 p-4 rounded-xl border border-red-500/20 bg-red-500/5 flex gap-3">
            <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-red-400 mb-1">Swap link expired</p>
              <p className="text-xs text-red-400/70">This swap link was valid for {LINK_TTL_HOURS} hours and has expired. Ask the initiating party to generate a new link.</p>
            </div>
          </div>
        )}

        {/* ── SETUP STEP ── */}
        {step === "setup" && (
          <div className="space-y-5">
            {!connected && (
              <div className="p-5 rounded-2xl border border-white/10 bg-white/5 text-center space-y-3">
                <Wallet className="h-8 w-8 text-gray-600 mx-auto" />
                <p className="text-sm text-gray-400">Connect your Solana wallet to initiate a swap</p>
                <Button onClick={() => setConnected(true)} className="bg-monad-purple hover:bg-monad-purple/90 text-black font-bold">
                  Connect Wallet
                </Button>
              </div>
            )}

            {connected && (
              <>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Swap type</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(["sol-to-sol", "sol-to-monad"] as SwapType[]).map(type => (
                      <button key={type} onClick={() => setSwapType(type)}
                        className={`p-3 rounded-xl border text-left transition-all ${swapType === type ? "border-monad-purple/50 bg-monad-purple/10" : "border-white/10 bg-white/5 hover:border-white/20"}`}>
                        <p className="text-xs font-bold text-white mb-1">{type === "sol-to-sol" ? "Solana → Solana" : "Solana → Monad Locker"}</p>
                        <p className="text-xs text-gray-500">{type === "sol-to-sol" ? "NFT lands in counterparty's Solana wallet" : "NFT registered inside a Monad Locker"}</p>
                      </button>
                    ))}
                  </div>
                </div>

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
                      <button onClick={() => { setMyNft(null); setSwapToken(""); }} className="text-gray-600 hover:text-white">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setShowNftPicker(true)}
                      className="w-full p-4 rounded-xl border border-dashed border-white/20 bg-white/5 hover:border-white/30 hover:bg-white/10 transition-all text-center">
                      <Key className="h-5 w-5 text-gray-600 mx-auto mb-1" />
                      <p className="text-sm text-gray-500">Select NFT key from your wallet</p>
                    </button>
                  )}
                </div>

                {showNftPicker && (
                  <div className="rounded-xl border border-white/10 bg-black/80 overflow-hidden">
                    {nfts.map(nft => {
                      const isLocked = (nft.transferLockDays ?? 0) > 0;
                      return (
                        <button key={nft.mint}
                          onClick={() => { if (!isLocked) { setMyNft(nft); setSwapToken(generateSwapToken(MOCK_WALLET, nft.mint)); setShowNftPicker(false); } }}
                          disabled={isLocked}
                          className={`w-full flex items-center gap-3 p-3 border-b border-white/5 last:border-0 transition-colors text-left ${isLocked ? "opacity-40 cursor-not-allowed" : "hover:bg-white/5"}`}>
                          <div className="h-8 w-8 rounded-lg bg-monad-purple/20 flex items-center justify-center shrink-0">
                            <Key className="h-4 w-4 text-monad-purple" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm text-white">{nft.name}</p>
                              {nft.isTicket && <span className="text-xs px-1.5 py-0.5 rounded-full bg-monad-purple/20 text-monad-purple border border-monad-purple/20">Ticket</span>}
                              {isLocked && <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-1"><Lock className="h-2.5 w-2.5" />{nft.transferLockDays}d locked</span>}
                              {!isLocked && nft.kycLevel !== "none" && <span className="text-xs px-1.5 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">{nft.kycLevel} KYC receiver</span>}
                            </div>
                            {nft.eventName ? <p className="text-xs text-gray-600 truncate mt-0.5">{nft.eventName}</p> : <p className="text-xs text-gray-600 font-mono">{nft.vaultRef}</p>}
                            {isLocked && <p className="text-xs text-red-400/70 mt-0.5">Cannot swap — {nft.transferLockDays} days remaining on transfer lock</p>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Counterparty</p>
                  <div className="space-y-2">
                    <input type="text" value={counterpartyAddress} onChange={e => setAddr(e.target.value)}
                      placeholder="Paste counterparty Solana wallet address"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-monad-purple/40 font-mono" />
                    <input type="text" value={counterpartyNft} onChange={e => setCounterNft(e.target.value)}
                      placeholder="Counterparty NFT mint address to receive"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-monad-purple/40 font-mono" />
                  </div>
                </div>

                {swapType === "sol-to-monad" && (
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Destination Locker (yours or counterparty's)</p>
                    <input type="text" value={targetLocker} onChange={e => setTargetLocker(e.target.value)}
                      placeholder="e.g. LCK-0000...001"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-solana-green/40 font-mono" />
                    <p className="text-xs text-gray-600 mt-1.5">The incoming NFT will be registered as a vault key inside this Locker.</p>
                  </div>
                )}

                <div className="p-4 rounded-xl border border-white/10 bg-white/5 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-400 font-medium">Share swap link with counterparty</p>
                    {linkGenerated && <Badge variant="outline" className="text-xs border-green-500/20 text-green-400">Generated</Badge>}
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 bg-black/50 border border-white/10 rounded-lg px-3 py-2 font-mono text-xs text-gray-500 truncate">
                      {myNft ? `${window.location.origin}/swap?token=${generatedToken.slice(0, 16)}...` : "Select your NFT first"}
                    </div>
                    <Button onClick={handleCopyLink} disabled={!myNft} variant="outline" className="border-white/10 text-gray-400 hover:text-white shrink-0">
                      {linkCopied ? <CheckCircle className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-gray-600">Link is encrypted — valid for {LINK_TTL_HOURS} hours. Both parties must confirm independently before execution.</p>
                </div>

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
                  onClick={async () => { await handleCreateSession(); setStep("review"); }}
                  disabled={!myNft || !counterpartyAddress || !counterpartyNft || (swapType === "sol-to-monad" && !targetLocker)}
                  className="w-full bg-monad-purple hover:bg-monad-purple/90 text-black font-bold h-12 text-sm">
                  Review swap <ArrowRight className="h-4 w-4 ml-2" />
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
                  <p className="text-sm font-bold text-white font-mono">{counterpartyNft.slice(0, 12)}...</p>
                  <p className="text-xs text-gray-600 font-mono mt-1">{counterpartyAddress.slice(0, 8)}...</p>
                </div>
              </div>

              <div className="space-y-2 border-t border-white/10 pt-3">
                {[
                  ["Swap type", swapTypeLabel],
                  ["Protocol fee", `${SWAP_FEE_SOL} SOL (flat)`],
                  ...(swapType === "sol-to-monad" ? [["Target Locker", targetLocker]] : []),
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between text-xs">
                    <span className="text-gray-500">{label}</span>
                    <span className="text-white font-mono">{value}</span>
                  </div>
                ))}
              </div>

              <div className="p-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5">
                <p className="text-xs text-yellow-400 font-bold mb-1">Final confirmation</p>
                <p className="text-xs text-gray-400">By confirming, you authorise MonasolProtocol to construct and broadcast this atomic swap transaction on your behalf. This action cannot be undone.</p>
              </div>

              {swapError && (
                <div className="p-3 rounded-lg border border-red-500/20 bg-red-500/5 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                  <p className="text-xs text-red-400">{swapError}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => setStep("setup")} className="border-white/10 text-gray-400">Go back</Button>
                <Button onClick={handleConfirmSwap} disabled={loading} className="bg-monad-purple hover:bg-monad-purple/90 text-black font-bold">
                  <Send className="h-4 w-4 mr-2" />Confirm swap
                </Button>
              </div>
            </div>

            <button onClick={() => setShowPrinciples(!showPrinciples)} className="w-full flex items-center justify-between p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all">
              <p className="text-xs font-medium text-gray-400">Protocol principles & disclaimers</p>
              <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${showPrinciples ? "rotate-180" : ""}`} />
            </button>

            {showPrinciples && (
              <div className="space-y-3">
                {PRINCIPLES.map(p => (
                  <div key={p.title} className="p-4 rounded-xl border border-white/10 bg-white/5">
                    <div className="flex items-center gap-2 mb-2">
                      <p.icon className="h-4 w-4 text-monad-purple shrink-0" />
                      <p className="text-xs font-bold text-white">{p.title}</p>
                    </div>
                    <p className="text-xs text-gray-500 leading-relaxed">{p.body}</p>
                  </div>
                ))}
                <div className="p-4 rounded-xl border border-white/10 bg-white/5 space-y-2">
                  {DISCLAIMERS.map((d, i) => (
                    <div key={i} className="flex gap-2 text-xs text-gray-600">
                      <div className="h-1.5 w-1.5 rounded-full bg-gray-600 shrink-0 mt-1.5" />
                      <p>{d}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── PENDING STEP ── */}
        {step === "pending" && (
          <div className="py-16 text-center space-y-5">
            <div className="h-16 w-16 rounded-full border border-monad-purple/30 bg-monad-purple/10 flex items-center justify-center mx-auto">
              <Loader2 className="h-7 w-7 text-monad-purple animate-spin" />
            </div>
            <div>
              <p className="text-lg font-bold text-white mb-1">Broadcasting transaction</p>
              <p className="text-sm text-gray-500">Constructing atomic swap on-chain...</p>
            </div>
          </div>
        )}

        {/* ── COMPLETE STEP ── */}
        {step === "complete" && (
          <div className="space-y-4">
            <div className="p-6 rounded-2xl border border-green-500/20 bg-green-500/5 text-center space-y-4">
              <CheckCircle className="h-12 w-12 text-green-400 mx-auto" />
              <div>
                <p className="text-lg font-bold text-white mb-1">Swap complete!</p>
                <p className="text-xs text-gray-400">Both NFTs transferred atomically in a single transaction</p>
              </div>
              <div className="p-3 rounded-lg bg-black/40 border border-white/10">
                <p className="text-xs text-gray-500 mb-1">Transaction signature</p>
                <p className="font-mono text-sm text-monad-purple">{txSig}</p>
              </div>
            </div>
            <Button onClick={() => { setStep("setup"); setMyNft(null); setAddr(""); setCounterNft(""); setTargetLocker(""); setLinkGenerated(false); setSwapToken(""); setSwapError(null); }} variant="outline" className="w-full border-white/10 text-gray-400">
              Start new swap
            </Button>
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}
