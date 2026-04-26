import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Ticket, Shield, Clock, Users, Star, Zap, ArrowLeft,
  CheckCircle, AlertTriangle, XCircle, Loader2,
  Music, MapPin, Calendar, Key, Brain, Lock,
  ChevronRight, Minus, Plus, UserCheck, Fingerprint,
  BadgeCheck
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Footer } from "@/components/Footer";
import { Link } from "wouter";

type View        = "fan" | "promoter";
type FanStep     = "browse" | "register" | "screening" | "status" | "kyc" | "complete";
type ScreenScore = "confirmed" | "waitlist" | "flagged";
type KycLevel    = "none" | "soft" | "standard" | "hard";

interface Discount { qty: number; amount: number }

interface VaultTier {
  id: string; tierId: string; label: string; prefix: string;
  capacity: number; maxSeats: number; basePriceUsd: number;
  discounts: Discount[];
  releaseOffsetHours: number; transferLockDays: number;
  kycLevel: KycLevel;
}

interface ApiEvent {
  id: string;
  name: string;
  venue: string;
  eventDate: string;
  lockerRef: string | null;
  saleDate: string | null;
  registrationDeadline: string | null;
  tiers: VaultTier[];
}

interface ScreeningResult {
  score: ScreenScore;
  walletAge: string; txDepth: string; clustering: string;
  eventHistory: string; nftHistory: string;
}

const TIER_ICONS: Record<string, any> = {
  general: Ticket,
  premium: Star,
  vip: BadgeCheck,
  accessible: Shield,
};

const TIER_COLORS: Record<string, { color: string; borderColor: string }> = {
  general:   { color: "text-blue-400",       borderColor: "border-blue-500/20" },
  premium:   { color: "text-monad-purple",   borderColor: "border-monad-purple/20" },
  vip:       { color: "text-yellow-400",     borderColor: "border-yellow-500/20" },
  accessible:{ color: "text-gray-400",       borderColor: "border-white/20" },
};

function generateToken(prefix: string, start: number, qty: number, discount: number): string {
  const pad  = (n: number) => String(n).padStart(3, "0");
  const disc = discount > 0 ? `-${discount}` : "";
  if (qty === 1) return `${prefix}${pad(start)}`;
  return `${prefix}${pad(start)}*${pad(start + qty - 1)}${disc}`;
}

function getDiscount(tier: VaultTier, qty: number): number {
  const match = tier.discounts.filter(d => qty >= d.qty).sort((a, b) => b.qty - a.qty);
  return match[0]?.amount ?? 0;
}

function totalPrice(tier: VaultTier, qty: number): number {
  return tier.basePriceUsd * qty - getDiscount(tier, qty);
}

const KYC: Record<KycLevel, { label: string; desc: string; color: string; icon: any }> = {
  none:     { label: "None",     desc: "AI screening only",         color: "text-gray-400",    icon: Shield },
  soft:     { label: "Soft",     desc: "Email + phone verified",    color: "text-blue-400",    icon: UserCheck },
  standard: { label: "Standard", desc: "Government ID verified",    color: "text-monad-purple",icon: BadgeCheck },
  hard:     { label: "Hard",     desc: "Biometric + government ID", color: "text-yellow-400",  icon: Fingerprint },
};

const SCORE_CFG = {
  confirmed: { icon: CheckCircle, color: "text-green-400",  border: "border-green-500/20",  bg: "bg-green-500/5",  label: "CONFIRMED — Purchase guaranteed" },
  waitlist:  { icon: Clock,       color: "text-yellow-400", border: "border-yellow-500/20", bg: "bg-yellow-500/5", label: "WAITLIST — Access if inventory remains" },
  flagged:   { icon: XCircle,     color: "text-red-400",    border: "border-red-500/20",    bg: "bg-red-500/5",    label: "FLAGGED — Access denied for this event" },
};

function simulate(wallet: string): ScreeningResult {
  const s = wallet.charCodeAt(wallet.length - 1) % 3;
  if (s === 0) return { score: "confirmed", walletAge: "3.2 years", txDepth: "2,847 transactions", clustering: "No shared counterparties", eventHistory: "Clean — no scalping", nftHistory: "14 NFTs held" };
  if (s === 1) return { score: "waitlist", walletAge: "4 months", txDepth: "62 transactions", clustering: "1 potential shared funder — low confidence", eventHistory: "No prior event activity", nftHistory: "2 NFTs held" };
  return { score: "flagged", walletAge: "3 days", txDepth: "4 transactions", clustering: "3 wallets share funding source — HIGH CONFIDENCE", eventHistory: "Event NFTs listed <24h — scalping pattern", nftHistory: "No genuine history" };
}

export default function EventsPage() {
  const [view, setView]           = useState<View>("fan");
  const [step, setStep]           = useState<FanStep>("browse");
  const [wallet, setWallet]       = useState("");
  const [result, setResult]       = useState<ScreeningResult | null>(null);
  const [tier, setTier]           = useState<VaultTier | null>(null);
  const [qty, setQty]             = useState(1);
  const [kycLoading, setKycLoad]  = useState(false);
  const [kycDone, setKycDone]     = useState(false);
  const [buyLoading, setBuyLoad]  = useState(false);
  const [finalToken, setToken]    = useState("");
  const [deployed, setDeployed]   = useState(false);
  const [deploying, setDeploying] = useState(false);

  const { data: event, isLoading: eventLoading } = useQuery<ApiEvent>({
    queryKey: ["/api/events/current"],
    staleTime: 60_000,
  });

  const TIERS: VaultTier[] = event?.tiers ?? [];

  async function runScreening() {
    setStep("screening");
    await new Promise(r => setTimeout(r, 3200));
    setResult(simulate(wallet));
    setStep("status");
  }

  async function startKyc(t: VaultTier) {
    setTier(t); setQty(1); setKycLoad(true); setStep("kyc");
    await new Promise(r => setTimeout(r, 2500));
    setKycDone(true); setKycLoad(false);
  }

  async function purchase() {
    if (!tier) return;
    setBuyLoad(true);
    await new Promise(r => setTimeout(r, 1800));
    const start = Math.floor(Math.random() * 800) + 100;
    setToken(generateToken(tier.prefix, start, qty, getDiscount(tier, qty)));
    setStep("complete"); setBuyLoad(false);
  }

  async function deploy() {
    setDeploying(true);
    await new Promise(r => setTimeout(r, 2500));
    setDeployed(true); setDeploying(false);
  }

  const cfg = result ? SCORE_CFG[result.score] : null;

  const EVENT_NAME = event?.name ?? "The Midnight — Endless Summer Tour";
  const EVENT_VENUE = event?.venue ?? "Madison Square Garden, New York";
  const EVENT_DATE = event?.eventDate ?? "June 14, 2027 — 8:00 PM EDT";
  const EVENT_SALE = event?.saleDate ?? "May 1, 2027 — 10:00 AM EDT";
  const EVENT_REG = event?.registrationDeadline ?? "April 29, 2027";

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_35%_20%,rgba(130,71,229,0.08)_0%,transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_75%_75%,rgba(20,241,149,0.04)_0%,transparent_55%)]" />
      </div>
      <div className="relative z-10 max-w-2xl mx-auto px-4 py-8">

        <Link href="/"><Button variant="ghost" className="text-gray-500 hover:text-white mb-6 -ml-2 text-sm">
          <ArrowLeft className="h-4 w-4 mr-2" />Back
        </Button></Link>

        <div className="mb-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-monad-purple/30 to-solana-green/10 border border-monad-purple/20 flex items-center justify-center">
              <Ticket className="h-5 w-5 text-monad-purple" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Event Ticketing</h1>
              <p className="text-xs text-gray-500">NFT-native · AI screened · identity locked</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {["AI screened", "Soul-bound KYC", "Quantity grouping", "Bot resistant"].map(t => (
              <span key={t} className="text-xs px-2.5 py-1 rounded-full border border-white/10 bg-white/5 text-gray-400">{t}</span>
            ))}
          </div>
        </div>

        <div className="flex gap-1 p-1 bg-white/5 border border-white/10 rounded-xl mb-6">
          {(["fan", "promoter"] as View[]).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${view === v ? "bg-monad-purple text-black" : "text-gray-500 hover:text-white"}`}>
              {v === "fan" ? "🎵 Fan" : "🎤 Promoter"}
            </button>
          ))}
        </div>

        {/* ══ FAN ══ */}
        {view === "fan" && (
          <div className="space-y-5">

            {/* Event card */}
            <div className="p-5 rounded-2xl border border-white/10 bg-white/5 space-y-3">
              <p className="text-lg font-bold text-white">{EVENT_NAME}</p>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5"><MapPin className="h-3 w-3 text-gray-500" /><p className="text-xs text-gray-500">{EVENT_VENUE}</p></div>
                <div className="flex items-center gap-1.5"><Calendar className="h-3 w-3 text-gray-500" /><p className="text-xs text-gray-500">{EVENT_DATE}</p></div>
              </div>
              <div className="p-3 rounded-lg bg-monad-purple/5 border border-monad-purple/20 flex items-center gap-2">
                <Clock className="h-4 w-4 text-monad-purple shrink-0" />
                <div>
                  <p className="text-xs font-medium text-monad-purple">Sale: {EVENT_SALE}</p>
                  <p className="text-xs text-gray-500">Registration closes: {EVENT_REG}</p>
                </div>
              </div>
            </div>

            {/* BROWSE */}
            {step === "browse" && <>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Ticket tiers</p>
              {eventLoading ? (
                <div className="py-8 text-center"><Loader2 className="h-6 w-6 text-monad-purple animate-spin mx-auto" /></div>
              ) : (
                <div className="space-y-3">
                  {TIERS.map(t => {
                    const TierIcon = TIER_ICONS[t.tierId] ?? Ticket;
                    const { color, borderColor } = TIER_COLORS[t.tierId] ?? { color: "text-gray-400", borderColor: "border-white/20" };
                    const KI = KYC[t.kycLevel].icon;
                    const maxDisc = t.discounts.length > 0 ? t.discounts[t.discounts.length - 1].amount : 0;
                    return (
                      <div key={t.tierId} className={`p-4 rounded-xl border ${borderColor} bg-white/5`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                              <TierIcon className={`h-5 w-5 ${color}`} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2 mb-0.5">
                                <p className="text-sm font-bold text-white">{t.label}</p>
                                {t.releaseOffsetHours > 0 && <Badge variant="outline" className="text-xs border-yellow-500/20 text-yellow-400">{t.releaseOffsetHours}h early</Badge>}
                              </div>
                              <p className="text-xs text-gray-500">Up to {t.maxSeats} seats{maxDisc > 0 ? ` · up to $${maxDisc} off` : ""}</p>
                              <div className="flex items-center gap-1 mt-0.5">
                                <KI className={`h-3 w-3 ${KYC[t.kycLevel].color}`} />
                                <p className={`text-xs ${KYC[t.kycLevel].color}`}>{KYC[t.kycLevel].label} KYC</p>
                              </div>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-lg font-bold text-white">${t.basePriceUsd}</p>
                            <p className="text-xs text-gray-600">per seat</p>
                          </div>
                        </div>
                        {t.discounts.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-white/5 flex gap-2 flex-wrap">
                            {t.discounts.map(d => (
                              <span key={d.qty} className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-400">
                                {d.qty}+ seats → ${d.amount} off
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="p-5 rounded-2xl border border-monad-purple/20 bg-monad-purple/5 space-y-3">
                <div className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-monad-purple" />
                  <p className="text-sm font-bold text-white">Register to purchase</p>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Pre-register for AI screening. Confirmed wallets get a guaranteed purchase window. KYC identity verification happens at checkout — once only, valid for all future events.
                </p>
                <Button onClick={() => setStep("register")} className="w-full bg-monad-purple hover:bg-monad-purple/90 text-black font-bold">
                  Register wallet <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </>}

            {/* REGISTER */}
            {step === "register" && (
              <div className="space-y-4">
                <input type="text" value={wallet} onChange={e => setWallet(e.target.value)}
                  placeholder="Paste your Solana wallet address"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-monad-purple/40 font-mono" />

                <div className="p-4 rounded-xl border border-white/10 bg-white/5 space-y-3">
                  <p className="text-xs font-bold text-white flex items-center gap-2"><Brain className="h-4 w-4 text-monad-purple" />AI screening checks</p>
                  {[["Wallet age", "New wallets flagged as bots"], ["Transaction depth", "Varied activity required"],
                    ["Wallet clustering", "Multi-wallet buyers detected"], ["Event history", "Scalping patterns identified"],
                    ["NFT holdings", "Genuine collector behaviour verified"]].map(([l, d]) => (
                    <div key={l} className="flex gap-2">
                      <div className="h-1.5 w-1.5 rounded-full bg-monad-purple shrink-0 mt-1.5" />
                      <div><p className="text-xs font-medium text-white">{l}</p><p className="text-xs text-gray-600">{d}</p></div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-600 leading-relaxed px-1">
                  Uses publicly available on-chain data only. No personal information collected at this stage. KYC occurs separately at checkout.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep("browse")} className="border-white/10 text-gray-400">Back</Button>
                  <Button onClick={runScreening} disabled={!wallet} className="flex-1 bg-monad-purple hover:bg-monad-purple/90 text-black font-bold">
                    Run AI screening <Brain className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </div>
            )}

            {/* SCREENING */}
            {step === "screening" && (
              <div className="py-12 text-center space-y-5">
                <div className="h-16 w-16 rounded-full border border-monad-purple/30 bg-monad-purple/10 flex items-center justify-center mx-auto">
                  <Brain className="h-7 w-7 text-monad-purple animate-pulse" />
                </div>
                <div><p className="text-lg font-bold text-white mb-1">Analyzing wallet</p><p className="text-sm text-gray-500">Scanning 5 dimensions of on-chain history...</p></div>
                <div className="max-w-xs mx-auto space-y-2 text-left">
                  {["Wallet age & creation date", "Transaction depth & variety", "Connected wallet cluster mapping", "Event NFT behavior analysis", "Computing trust score"].map((s, i) => (
                    <div key={s} className="flex items-center gap-2 text-xs text-gray-600">
                      <div className={`h-1.5 w-1.5 rounded-full ${i === 2 ? "bg-monad-purple animate-pulse" : i < 2 ? "bg-green-500" : "bg-white/20"}`} />
                      {s}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* STATUS */}
            {step === "status" && result && cfg && (
              <div className="space-y-4">
                <div className={`p-5 rounded-2xl border ${cfg.border} ${cfg.bg} space-y-4`}>
                  <div className="flex items-center gap-3">
                    <cfg.icon className={`h-6 w-6 ${cfg.color}`} />
                    <div>
                      <p className={`text-sm font-bold ${cfg.color}`}>{cfg.label}</p>
                      <p className="text-xs text-gray-500 font-mono">{wallet.slice(0, 14)}...</p>
                    </div>
                  </div>
                  <div className="space-y-2 border-t border-white/10 pt-3">
                    {[["Wallet age", result.walletAge], ["Tx depth", result.txDepth],
                      ["Clustering", result.clustering], ["Event history", result.eventHistory],
                      ["NFT history", result.nftHistory]].map(([l, v]) => (
                      <div key={l} className="flex justify-between text-xs gap-4">
                        <span className="text-gray-500 shrink-0">{l}</span>
                        <span className={`text-right font-mono ${v.includes("HIGH") || v.includes("scalping") || v === "3 days" ? "text-red-400" : "text-gray-300"}`}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {result.score === "confirmed" && (
                  <div className="space-y-3">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Select ticket tier</p>
                    {TIERS.map(t => {
                      const TierIcon = TIER_ICONS[t.tierId] ?? Ticket;
                      const { color } = TIER_COLORS[t.tierId] ?? { color: "text-gray-400" };
                      const KI = KYC[t.kycLevel].icon;
                      return (
                        <button key={t.tierId} onClick={() => startKyc(t)}
                          className="w-full flex items-center gap-3 p-4 rounded-xl border border-white/10 bg-white/5 hover:border-monad-purple/30 hover:bg-monad-purple/5 transition-all text-left">
                          <TierIcon className={`h-5 w-5 ${color} shrink-0`} />
                          <div className="flex-1">
                            <p className="text-sm font-bold text-white">{t.label}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <KI className={`h-3 w-3 ${KYC[t.kycLevel].color}`} />
                              <p className={`text-xs ${KYC[t.kycLevel].color}`}>{KYC[t.kycLevel].label} · {KYC[t.kycLevel].desc}</p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-bold text-white">${t.basePriceUsd}<span className="text-gray-500 text-xs font-normal">/seat</span></p>
                            <p className="text-xs text-gray-600">max {t.maxSeats} seats</p>
                          </div>
                          <ChevronRight className="h-4 w-4 text-gray-600 shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                )}

                {result.score !== "confirmed" && (
                  <Button onClick={() => { setStep("browse"); setResult(null); setWallet(""); }} variant="outline" className="w-full border-white/10 text-gray-400">Back to event</Button>
                )}
              </div>
            )}

            {/* KYC + QUANTITY */}
            {step === "kyc" && tier && (
              <div className="space-y-4">
                <div className="p-5 rounded-2xl border border-monad-purple/20 bg-monad-purple/5 space-y-4">
                  <div className="flex items-center gap-3">
                    <Fingerprint className="h-6 w-6 text-monad-purple" />
                    <div>
                      <p className="text-sm font-bold text-white">Identity verification</p>
                      <p className="text-xs text-gray-400">{tier.label} requires {KYC[tier.kycLevel].label} KYC — {KYC[tier.kycLevel].desc}</p>
                    </div>
                  </div>
                  {kycLoading && (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-black/30">
                      <Loader2 className="h-4 w-4 text-monad-purple animate-spin shrink-0" />
                      <p className="text-xs text-gray-400">Verifying identity via Civic Pass...</p>
                    </div>
                  )}
                  {kycDone && (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                      <CheckCircle className="h-4 w-4 text-green-400 shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-green-400">Identity verified</p>
                        <p className="text-xs text-gray-500">Soul-bound Identity Token issued to your wallet — cannot be transferred</p>
                      </div>
                    </div>
                  )}
                  {!kycLoading && !kycDone && (
                    <div className="space-y-1.5 text-xs text-gray-500">
                      {["Cannot be transferred — permanently tied to your wallet",
                        "Required at venue door alongside your ticket NFT",
                        "Valid for all future MonasolProtocol events at this KYC level",
                        "No personal data stored on-chain — verification level only"].map(s => (
                        <div key={s} className="flex gap-2">
                          <div className="h-1 w-1 rounded-full bg-gray-600 shrink-0 mt-1.5" /><p>{s}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {kycDone && (
                  <>
                    <div className="p-4 rounded-xl border border-white/10 bg-white/5 space-y-4">
                      <p className="text-xs text-gray-500 uppercase tracking-wider">How many seats?</p>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <button onClick={() => setQty(Math.max(1, qty - 1))}
                            className="h-9 w-9 rounded-lg border border-white/10 bg-white/5 flex items-center justify-center hover:bg-white/10">
                            <Minus className="h-4 w-4 text-white" />
                          </button>
                          <span className="text-2xl font-bold text-white w-8 text-center">{qty}</span>
                          <button onClick={() => setQty(Math.min(tier.maxSeats, qty + 1))}
                            className="h-9 w-9 rounded-lg border border-white/10 bg-white/5 flex items-center justify-center hover:bg-white/10">
                            <Plus className="h-4 w-4 text-white" />
                          </button>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-white">${totalPrice(tier, qty)}</p>
                          {getDiscount(tier, qty) > 0 && <p className="text-xs text-green-400">${getDiscount(tier, qty)} group discount</p>}
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-black/40 border border-white/5 flex items-center justify-between">
                        <div>
                          <p className="text-xs text-gray-600">Your ticket token</p>
                          <p className="font-mono text-sm text-monad-purple">
                            {generateToken(tier.prefix, 100, qty, getDiscount(tier, qty))}
                          </p>
                        </div>
                        <Badge variant="outline" className="border-white/10 text-gray-500 text-xs">Preview</Badge>
                      </div>
                    </div>

                    <Button onClick={purchase} disabled={buyLoading} className="w-full bg-monad-purple hover:bg-monad-purple/90 text-black font-bold h-12">
                      {buyLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing...</> : `Purchase ${qty} ticket${qty > 1 ? "s" : ""} — $${totalPrice(tier, qty)}`}
                    </Button>
                  </>
                )}
              </div>
            )}

            {/* COMPLETE */}
            {step === "complete" && tier && (
              <div className="space-y-4">
                <div className="p-6 rounded-2xl border border-green-500/20 bg-green-500/5 text-center space-y-4">
                  <CheckCircle className="h-12 w-12 text-green-400 mx-auto" />
                  <div>
                    <p className="text-lg font-bold text-white mb-1">Purchase confirmed!</p>
                    <p className="text-xs text-gray-400">Your ticket NFT has been minted to your wallet</p>
                  </div>
                  <div className="p-4 bg-black/40 rounded-xl border border-white/10">
                    <p className="text-xs text-gray-500 mb-1">Ticket token</p>
                    <p className="font-mono text-lg text-monad-purple font-bold">{finalToken}</p>
                  </div>
                  <div className="text-xs text-gray-500 space-y-1">
                    <p>{tier.label} · {qty} seat{qty > 1 ? "s" : ""} · ${totalPrice(tier, qty)}</p>
                    <p>KYC level: {KYC[tier.kycLevel].label}</p>
                    {tier.transferLockDays > 0 && <p className="text-yellow-400">Transfer locked for {tier.transferLockDays} days</p>}
                  </div>
                </div>
                <Button onClick={() => { setStep("browse"); setResult(null); setWallet(""); setKycDone(false); }} variant="outline" className="w-full border-white/10 text-gray-400">
                  Back to event
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ══ PROMOTER ══ */}
        {view === "promoter" && (
          <div className="space-y-5">
            <div className="p-5 rounded-2xl border border-white/10 bg-white/5 space-y-4">
              <p className="text-sm font-bold text-white">Event Configuration</p>
              <div className="space-y-3">
                {TIERS.map(t => {
                  const TierIcon = TIER_ICONS[t.tierId] ?? Ticket;
                  const { color } = TIER_COLORS[t.tierId] ?? { color: "text-gray-400" };
                  return (
                    <div key={t.tierId} className="flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-white/5">
                      <TierIcon className={`h-5 w-5 ${color} shrink-0`} />
                      <div className="flex-1">
                        <p className="text-sm font-bold text-white">{t.label}</p>
                        <p className="text-xs text-gray-500">{t.capacity.toLocaleString()} capacity · ${t.basePriceUsd}/seat</p>
                      </div>
                      <Badge variant="outline" className="border-white/10 text-gray-400 text-xs">{KYC[t.kycLevel].label} KYC</Badge>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-5 rounded-2xl border border-monad-purple/20 bg-monad-purple/5 space-y-4">
              <p className="text-sm font-bold text-white flex items-center gap-2">
                <Zap className="h-4 w-4 text-monad-purple" />Deploy to Monad Locker
              </p>
              <p className="text-xs text-gray-400 leading-relaxed">
                Deploy this event configuration as an on-chain Locker contract. This creates the NFT collection, sets transfer lock rules, and registers KYC requirements for each tier.
              </p>
              {!deployed ? (
                <Button onClick={deploy} disabled={deploying} className="w-full bg-monad-purple hover:bg-monad-purple/90 text-black font-bold">
                  {deploying ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deploying...</> : "Deploy Locker Contract"}
                </Button>
              ) : (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                  <CheckCircle className="h-4 w-4 text-green-400 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-green-400">Locker deployed</p>
                    <p className="text-xs text-gray-500 font-mono">LCK-{Math.random().toString(36).slice(2, 8).toUpperCase()}...{Math.random().toString(36).slice(2, 6).toUpperCase()}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
      <Footer />
    </div>
  );
}
