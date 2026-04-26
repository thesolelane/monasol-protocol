import { useState } from "react";
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

interface VaultTier {
  id: string; label: string; icon: any; prefix: string;
  capacity: number; maxSeats: number; basePrice: number;
  discounts: { qty: number; amount: number }[];
  releaseOffset: number; transferLock: number;
  kycLevel: KycLevel; color: string; borderColor: string;
}

interface ScreeningResult {
  score: ScreenScore;
  walletAge: string; txDepth: string; clustering: string;
  eventHistory: string; nftHistory: string;
}

// Token generator — * is range operator (seats A through B)
function generateToken(prefix: string, start: number, qty: number, discount: number): string {
  const pad  = (n: number) => String(n).padStart(3, "0");
  const disc = discount > 0 ? `-${discount}` : "";
  if (qty === 1) return `${prefix}${pad(start)}`;
  return `${prefix}${pad(start)}*${pad(start + qty - 1)}${disc}`;
}

function getDiscount(tier: VaultTier, qty: number): number {
  const match = tier.discounts.filter(d => qty >= d.qty).sort((a,b) => b.qty - a.qty);
  return match[0]?.amount ?? 0;
}
function totalPrice(tier: VaultTier, qty: number): number {
  return tier.basePrice * qty - getDiscount(tier, qty);
}

const EVENT = {
  name: "The Midnight — Endless Summer Tour",
  venue: "Madison Square Garden, New York",
  date: "June 14, 2027 — 8:00 PM EDT",
  locker: "LCK-7821...449",
  saleDate: "May 1, 2027 — 10:00 AM EDT",
  regDeadline: "April 29, 2027",
};

const TIERS: VaultTier[] = [
  { id:"general", label:"General", icon:Ticket, prefix:"#",
    capacity:8000, maxSeats:5, basePrice:85,
    discounts:[{qty:2,amount:5},{qty:3,amount:10},{qty:5,amount:15}],
    releaseOffset:0, transferLock:30, kycLevel:"soft",
    color:"text-blue-400", borderColor:"border-blue-500/20" },
  { id:"premium", label:"Premium", icon:Star, prefix:"#PRE-",
    capacity:2000, maxSeats:3, basePrice:175,
    discounts:[{qty:2,amount:10},{qty:3,amount:20}],
    releaseOffset:0, transferLock:14, kycLevel:"standard",
    color:"text-monad-purple", borderColor:"border-monad-purple/20" },
  { id:"vip", label:"VIP", icon:BadgeCheck, prefix:"#VIP-",
    capacity:200, maxSeats:2, basePrice:350,
    discounts:[],
    releaseOffset:48, transferLock:0, kycLevel:"hard",
    color:"text-yellow-400", borderColor:"border-yellow-500/20" },
  { id:"accessible", label:"Accessible", icon:Shield, prefix:"#ACC-",
    capacity:100, maxSeats:2, basePrice:85,
    discounts:[],
    releaseOffset:0, transferLock:30, kycLevel:"soft",
    color:"text-gray-400", borderColor:"border-white/20" },
];

const KYC: Record<KycLevel,{label:string;desc:string;color:string;icon:any}> = {
  none:     {label:"None",     desc:"AI screening only",          color:"text-gray-400",    icon:Shield},
  soft:     {label:"Soft",     desc:"Email + phone verified",     color:"text-blue-400",    icon:UserCheck},
  standard: {label:"Standard", desc:"Government ID verified",     color:"text-monad-purple",icon:BadgeCheck},
  hard:     {label:"Hard",     desc:"Biometric + government ID",  color:"text-yellow-400",  icon:Fingerprint},
};

const SCORE_CFG = {
  confirmed:{icon:CheckCircle,color:"text-green-400",border:"border-green-500/20",bg:"bg-green-500/5",label:"CONFIRMED — Purchase guaranteed"},
  waitlist: {icon:Clock,      color:"text-yellow-400",border:"border-yellow-500/20",bg:"bg-yellow-500/5",label:"WAITLIST — Access if inventory remains"},
  flagged:  {icon:XCircle,    color:"text-red-400",  border:"border-red-500/20",  bg:"bg-red-500/5",  label:"FLAGGED — Access denied for this event"},
};

function simulate(wallet: string): ScreeningResult {
  const s = wallet.charCodeAt(wallet.length-1) % 3;
  if (s===0) return {score:"confirmed",walletAge:"3.2 years",txDepth:"2,847 transactions",clustering:"No shared counterparties",eventHistory:"Clean — no scalping",nftHistory:"14 NFTs held"};
  if (s===1) return {score:"waitlist",walletAge:"4 months",txDepth:"62 transactions",clustering:"1 potential shared funder — low confidence",eventHistory:"No prior event activity",nftHistory:"2 NFTs held"};
  return {score:"flagged",walletAge:"3 days",txDepth:"4 transactions",clustering:"3 wallets share funding source — HIGH CONFIDENCE",eventHistory:"Event NFTs listed <24h — scalping pattern",nftHistory:"No genuine history"};
}

export default function EventsPage() {
  const [view, setView]           = useState<View>("fan");
  const [step, setStep]           = useState<FanStep>("browse");
  const [wallet, setWallet]       = useState("");
  const [result, setResult]       = useState<ScreeningResult|null>(null);
  const [tier, setTier]           = useState<VaultTier|null>(null);
  const [qty, setQty]             = useState(1);
  const [kycLoading, setKycLoad]  = useState(false);
  const [kycDone, setKycDone]     = useState(false);
  const [buyLoading, setBuyLoad]  = useState(false);
  const [finalToken, setToken]    = useState("");
  const [tiers, setTiers]         = useState<VaultTier[]>(TIERS);
  const [deployed, setDeployed]   = useState(false);
  const [deploying, setDeploying] = useState(false);

  async function runScreening() {
    setStep("screening");
    await new Promise(r=>setTimeout(r,3200));
    setResult(simulate(wallet));
    setStep("status");
  }

  async function startKyc(t: VaultTier) {
    setTier(t); setQty(1); setKycLoad(true); setStep("kyc");
    await new Promise(r=>setTimeout(r,2500));
    setKycDone(true); setKycLoad(false);
  }

  async function purchase() {
    if (!tier) return;
    setBuyLoad(true);
    await new Promise(r=>setTimeout(r,1800));
    const start = Math.floor(Math.random()*800)+100;
    setToken(generateToken(tier.prefix, start, qty, getDiscount(tier,qty)));
    setStep("complete"); setBuyLoad(false);
  }

  async function deploy() {
    setDeploying(true);
    await new Promise(r=>setTimeout(r,2500));
    setDeployed(true); setDeploying(false);
  }

  function updateTier(id: string, field: string, value: any) {
    setTiers(prev=>prev.map(t=>t.id===id?{...t,[field]:value}:t));
  }

  const cfg = result ? SCORE_CFG[result.score] : null;

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_35%_20%,rgba(130,71,229,0.08)_0%,transparent_55%)]"/>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_75%_75%,rgba(20,241,149,0.04)_0%,transparent_55%)]"/>
      </div>
      <div className="relative z-10 max-w-2xl mx-auto px-4 py-8">

        <Link href="/"><Button variant="ghost" className="text-gray-500 hover:text-white mb-6 -ml-2 text-sm">
          <ArrowLeft className="h-4 w-4 mr-2"/>Back
        </Button></Link>

        <div className="mb-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-monad-purple/30 to-solana-green/10 border border-monad-purple/20 flex items-center justify-center">
              <Ticket className="h-5 w-5 text-monad-purple"/>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Event Ticketing</h1>
              <p className="text-xs text-gray-500">NFT-native · AI screened · identity locked</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {["AI screened","Soul-bound KYC","Quantity grouping","Bot resistant"].map(t=>(
              <span key={t} className="text-xs px-2.5 py-1 rounded-full border border-white/10 bg-white/5 text-gray-400">{t}</span>
            ))}
          </div>
        </div>

        <div className="flex gap-1 p-1 bg-white/5 border border-white/10 rounded-xl mb-6">
          {(["fan","promoter"] as View[]).map(v=>(
            <button key={v} onClick={()=>setView(v)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${view===v?"bg-monad-purple text-black":"text-gray-500 hover:text-white"}`}>
              {v==="fan"?"🎵 Fan":"🎤 Promoter"}
            </button>
          ))}
        </div>

        {/* ══ FAN ══ */}
        {view==="fan" && (
          <div className="space-y-5">

            {/* Event card */}
            <div className="p-5 rounded-2xl border border-white/10 bg-white/5 space-y-3">
              <p className="text-lg font-bold text-white">{EVENT.name}</p>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5"><MapPin className="h-3 w-3 text-gray-500"/><p className="text-xs text-gray-500">{EVENT.venue}</p></div>
                <div className="flex items-center gap-1.5"><Calendar className="h-3 w-3 text-gray-500"/><p className="text-xs text-gray-500">{EVENT.date}</p></div>
              </div>
              <div className="p-3 rounded-lg bg-monad-purple/5 border border-monad-purple/20 flex items-center gap-2">
                <Clock className="h-4 w-4 text-monad-purple shrink-0"/>
                <div>
                  <p className="text-xs font-medium text-monad-purple">Sale: {EVENT.saleDate}</p>
                  <p className="text-xs text-gray-500">Registration closes: {EVENT.regDeadline}</p>
                </div>
              </div>
            </div>

            {/* BROWSE */}
            {step==="browse" && <>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Ticket tiers</p>
              <div className="space-y-3">
                {TIERS.map(t=>{
                  const KI=KYC[t.kycLevel].icon;
                  const maxDisc=t.discounts.length>0?t.discounts[t.discounts.length-1].amount:0;
                  return (
                    <div key={t.id} className={`p-4 rounded-xl border ${t.borderColor} bg-white/5`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                            <t.icon className={`h-5 w-5 ${t.color}`}/>
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-0.5">
                              <p className="text-sm font-bold text-white">{t.label}</p>
                              {t.releaseOffset>0&&<Badge variant="outline" className="text-xs border-yellow-500/20 text-yellow-400">{t.releaseOffset}h early</Badge>}
                            </div>
                            <p className="text-xs text-gray-500">Up to {t.maxSeats} seats{maxDisc>0?` · up to $${maxDisc} off`:""}</p>
                            <div className="flex items-center gap-1 mt-0.5">
                              <KI className={`h-3 w-3 ${KYC[t.kycLevel].color}`}/>
                              <p className={`text-xs ${KYC[t.kycLevel].color}`}>{KYC[t.kycLevel].label} KYC</p>
                            </div>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-lg font-bold text-white">${t.basePrice}</p>
                          <p className="text-xs text-gray-600">per seat</p>
                        </div>
                      </div>
                      {t.discounts.length>0&&(
                        <div className="mt-3 pt-3 border-t border-white/5 flex gap-2 flex-wrap">
                          {t.discounts.map(d=>(
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
              <div className="p-5 rounded-2xl border border-monad-purple/20 bg-monad-purple/5 space-y-3">
                <div className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-monad-purple"/>
                  <p className="text-sm font-bold text-white">Register to purchase</p>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Pre-register for AI screening. Confirmed wallets get a guaranteed purchase window. KYC identity verification happens at checkout — once only, valid for all future events.
                </p>
                <Button onClick={()=>setStep("register")} className="w-full bg-monad-purple hover:bg-monad-purple/90 text-black font-bold">
                  Register wallet <ChevronRight className="h-4 w-4 ml-1"/>
                </Button>
              </div>
            </>}

            {/* REGISTER */}
            {step==="register" && (
              <div className="space-y-4">
                <input type="text" value={wallet} onChange={e=>setWallet(e.target.value)}
                  placeholder="Paste your Solana wallet address"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-monad-purple/40 font-mono"/>

                <div className="p-4 rounded-xl border border-white/10 bg-white/5 space-y-3">
                  <p className="text-xs font-bold text-white flex items-center gap-2"><Brain className="h-4 w-4 text-monad-purple"/>AI screening checks</p>
                  {[["Wallet age","New wallets flagged as bots"],["Transaction depth","Varied activity required"],
                    ["Wallet clustering","Multi-wallet buyers detected"],["Event history","Scalping patterns identified"],
                    ["NFT holdings","Genuine collector behaviour verified"]].map(([l,d])=>(
                    <div key={l} className="flex gap-2">
                      <div className="h-1.5 w-1.5 rounded-full bg-monad-purple shrink-0 mt-1.5"/>
                      <div><p className="text-xs font-medium text-white">{l}</p><p className="text-xs text-gray-600">{d}</p></div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-600 leading-relaxed px-1">
                  Uses publicly available on-chain data only. No personal information collected at this stage. KYC occurs separately at checkout.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={()=>setStep("browse")} className="border-white/10 text-gray-400">Back</Button>
                  <Button onClick={runScreening} disabled={!wallet} className="flex-1 bg-monad-purple hover:bg-monad-purple/90 text-black font-bold">
                    Run AI screening <Brain className="h-4 w-4 ml-2"/>
                  </Button>
                </div>
              </div>
            )}

            {/* SCREENING */}
            {step==="screening" && (
              <div className="py-12 text-center space-y-5">
                <div className="h-16 w-16 rounded-full border border-monad-purple/30 bg-monad-purple/10 flex items-center justify-center mx-auto">
                  <Brain className="h-7 w-7 text-monad-purple animate-pulse"/>
                </div>
                <div><p className="text-lg font-bold text-white mb-1">Analyzing wallet</p><p className="text-sm text-gray-500">Scanning 5 dimensions of on-chain history...</p></div>
                <div className="max-w-xs mx-auto space-y-2 text-left">
                  {["Wallet age & creation date","Transaction depth & variety","Connected wallet cluster mapping","Event NFT behavior analysis","Computing trust score"].map((s,i)=>(
                    <div key={s} className="flex items-center gap-2 text-xs text-gray-600">
                      <div className={`h-1.5 w-1.5 rounded-full ${i===2?"bg-monad-purple animate-pulse":i<2?"bg-green-500":"bg-white/20"}`}/>
                      {s}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* STATUS */}
            {step==="status" && result && cfg && (
              <div className="space-y-4">
                <div className={`p-5 rounded-2xl border ${cfg.border} ${cfg.bg} space-y-4`}>
                  <div className="flex items-center gap-3">
                    <cfg.icon className={`h-6 w-6 ${cfg.color}`}/>
                    <div>
                      <p className={`text-sm font-bold ${cfg.color}`}>{cfg.label}</p>
                      <p className="text-xs text-gray-500 font-mono">{wallet.slice(0,14)}...</p>
                    </div>
                  </div>
                  <div className="space-y-2 border-t border-white/10 pt-3">
                    {[["Wallet age",result.walletAge],["Tx depth",result.txDepth],
                      ["Clustering",result.clustering],["Event history",result.eventHistory],
                      ["NFT history",result.nftHistory]].map(([l,v])=>(
                      <div key={l} className="flex justify-between text-xs gap-4">
                        <span className="text-gray-500 shrink-0">{l}</span>
                        <span className={`text-right font-mono ${v.includes("HIGH")||v.includes("scalping")||v==="3 days"?"text-red-400":"text-gray-300"}`}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {result.score==="confirmed" && (
                  <div className="space-y-3">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Select ticket tier</p>
                    {TIERS.map(t=>{
                      const KI=KYC[t.kycLevel].icon;
                      return (
                        <button key={t.id} onClick={()=>startKyc(t)}
                          className="w-full flex items-center gap-3 p-4 rounded-xl border border-white/10 bg-white/5 hover:border-monad-purple/30 hover:bg-monad-purple/5 transition-all text-left">
                          <t.icon className={`h-5 w-5 ${t.color} shrink-0`}/>
                          <div className="flex-1">
                            <p className="text-sm font-bold text-white">{t.label}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <KI className={`h-3 w-3 ${KYC[t.kycLevel].color}`}/>
                              <p className={`text-xs ${KYC[t.kycLevel].color}`}>{KYC[t.kycLevel].label} · {KYC[t.kycLevel].desc}</p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-bold text-white">${t.basePrice}<span className="text-gray-500 text-xs font-normal">/seat</span></p>
                            <p className="text-xs text-gray-600">max {t.maxSeats} seats</p>
                          </div>
                          <ChevronRight className="h-4 w-4 text-gray-600 shrink-0"/>
                        </button>
                      );
                    })}
                  </div>
                )}

                {result.score!=="confirmed" && (
                  <Button onClick={()=>{setStep("browse");setResult(null);setWallet("");}} variant="outline" className="w-full border-white/10 text-gray-400">Back to event</Button>
                )}
              </div>
            )}

            {/* KYC + QUANTITY */}
            {step==="kyc" && tier && (
              <div className="space-y-4">
                <div className="p-5 rounded-2xl border border-monad-purple/20 bg-monad-purple/5 space-y-4">
                  <div className="flex items-center gap-3">
                    <Fingerprint className="h-6 w-6 text-monad-purple"/>
                    <div>
                      <p className="text-sm font-bold text-white">Identity verification</p>
                      <p className="text-xs text-gray-400">{tier.label} requires {KYC[tier.kycLevel].label} KYC — {KYC[tier.kycLevel].desc}</p>
                    </div>
                  </div>
                  {kycLoading&&(
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-black/30">
                      <Loader2 className="h-4 w-4 text-monad-purple animate-spin shrink-0"/>
                      <p className="text-xs text-gray-400">Verifying identity via Civic Pass...</p>
                    </div>
                  )}
                  {kycDone&&(
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                      <CheckCircle className="h-4 w-4 text-green-400 shrink-0"/>
                      <div>
                        <p className="text-xs font-bold text-green-400">Identity verified</p>
                        <p className="text-xs text-gray-500">Soul-bound Identity Token issued to your wallet — cannot be transferred</p>
                      </div>
                    </div>
                  )}
                  {!kycLoading&&!kycDone&&(
                    <div className="space-y-1.5 text-xs text-gray-500">
                      {["Cannot be transferred — permanently tied to your wallet",
                        "Required at venue door alongside your ticket NFT",
                        "Valid for all future MonaSol Protocol events at this KYC level",
                        "No personal data stored on-chain — verification level only"].map(s=>(
                        <div key={s} className="flex gap-2">
                          <div className="h-1 w-1 rounded-full bg-gray-600 shrink-0 mt-1.5"/><p>{s}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {kycDone&&(
                  <>
                    <div className="p-4 rounded-xl border border-white/10 bg-white/5 space-y-4">
                      <p className="text-xs text-gray-500 uppercase tracking-wider">How many seats?</p>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <button onClick={()=>setQty(Math.max(1,qty-1))}
                            className="h-9 w-9 rounded-lg border border-white/10 bg-white/5 flex items-center justify-center hover:bg-white/10">
                            <Minus className="h-4 w-4 text-white"/>
                          </button>
                          <span className="text-2xl font-bold text-white w-8 text-center">{qty}</span>
                          <button onClick={()=>setQty(Math.min(tier.maxSeats,qty+1))}
                            className="h-9 w-9 rounded-lg border border-white/10 bg-white/5 flex items-center justify-center hover:bg-white/10">
                            <Plus className="h-4 w-4 text-white"/>
                          </button>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-white">${totalPrice(tier,qty)}</p>
                          {getDiscount(tier,qty)>0&&<p className="text-xs text-green-400">${getDiscount(tier,qty)} group discount</p>}
                        </div>
                      </div>

                      {/* Live token preview */}
                      <div className="p-3 rounded-lg bg-black/40 border border-white/5 flex items-center justify-between">
                        <div>
                          <p className="text-xs text-gray-600">Your ticket token</p>
                          <p className="text-xs text-gray-500">{qty} seat{qty>1?"s":""} · {qty} admission{qty>1?"s":""}{qty>1?" · contiguous seats assigned automatically":""}</p>
                        </div>
                        <p className={`text-sm font-mono font-bold ${tier.color}`}>
                          {generateToken(tier.prefix,21,qty,getDiscount(tier,qty))}
                        </p>
                      </div>

                      {tier.transferLock>0&&<p className="text-xs text-gray-600">Transfer locked for {tier.transferLock} days after purchase. Transfers after lock require matching KYC level.</p>}
                    </div>

                    <Button onClick={purchase} disabled={buyLoading} className="w-full bg-monad-purple hover:bg-monad-purple/90 text-black font-bold h-12">
                      {buyLoading
                        ?<><Loader2 className="h-4 w-4 mr-2 animate-spin"/>Processing...</>
                        :<><Ticket className="h-4 w-4 mr-2"/>Purchase {qty} seat{qty>1?"s":""} — ${totalPrice(tier,qty)}</>}
                    </Button>
                  </>
                )}
              </div>
            )}

            {/* COMPLETE */}
            {step==="complete" && tier && (
              <div className="text-center space-y-5 py-4">
                <div className="h-16 w-16 rounded-full bg-monad-purple/20 border border-monad-purple/30 flex items-center justify-center mx-auto">
                  <CheckCircle className="h-8 w-8 text-monad-purple"/>
                </div>
                <div>
                  <p className="text-lg font-bold text-white">You're in.</p>
                  <p className="text-sm text-gray-500">Your ticket NFT is in your wallet. See you at the show.</p>
                </div>
                <div className="p-4 rounded-xl border border-white/10 bg-white/5 text-left space-y-3">
                  {[["Ticket token",finalToken],["Seats",`${qty} admission${qty>1?"s":""}`],
                    ["Identity token","Soul-bound · issued ✓"],
                    ["Transfer lock",tier.transferLock>0?`${tier.transferLock} days`:"None"]].map(([l,v])=>(
                    <div key={l} className="flex justify-between text-xs">
                      <span className="text-gray-500">{l}</span>
                      <span className={`font-mono ${l==="Ticket token"?tier.color:l==="Identity token"?"text-green-400":"text-white"}`}>{v}</span>
                    </div>
                  ))}
                  <div className="pt-2 border-t border-white/10">
                    <p className="text-xs text-gray-500 mb-1">At the venue</p>
                    <p className="text-xs text-gray-400">Open wallet → sign door challenge → scanner verifies ticket NFT + soul-bound identity token → admit {qty}.</p>
                  </div>
                </div>
                <Link href="/"><Button className="w-full bg-monad-purple hover:bg-monad-purple/90 text-black font-bold">Back to dashboard</Button></Link>
              </div>
            )}
          </div>
        )}

        {/* ══ PROMOTER ══ */}
        {view==="promoter" && (
          <div className="space-y-5">
            {deployed?(
              <div className="text-center space-y-5 py-6">
                <div className="h-16 w-16 rounded-full bg-monad-purple/20 border border-monad-purple/30 flex items-center justify-center mx-auto">
                  <CheckCircle className="h-8 w-8 text-monad-purple"/>
                </div>
                <p className="text-lg font-bold text-white">Event deployed</p>
                <p className="text-sm text-gray-500">All vaults live and Pledged. Pre-registration open.</p>
                <div className="p-4 rounded-xl border border-white/10 bg-white/5 text-left space-y-2">
                  {[["Event Locker",EVENT.locker],["Vault tiers",`${tiers.length} deployed`],
                    ["Total seats",tiers.reduce((a,t)=>a+t.capacity,0).toLocaleString()],
                    ["Vault status","Pledged — locked until sale date"],
                    ["AI screening","Active — pre-registration open"],
                    ["Soul-bound KYC","Civic Pass integration active"]].map(([l,v])=>(
                    <div key={l} className="flex justify-between text-xs">
                      <span className="text-gray-500">{l}</span>
                      <span className={`font-mono ${v.includes("Pledged")?"text-yellow-400":v.includes("Active")||v.includes("Civic")?"text-green-400":"text-white"}`}>{v}</span>
                    </div>
                  ))}
                </div>
                <Button onClick={()=>setDeployed(false)} variant="outline" className="w-full border-white/10 text-gray-400">Configure another event</Button>
              </div>
            ):(
              <>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Event details</p>
                  <div className="space-y-2">
                    <input defaultValue={EVENT.name} placeholder="Event name"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-monad-purple/40"/>
                    <div className="grid grid-cols-2 gap-2">
                      <input defaultValue={EVENT.venue} placeholder="Venue"
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-sm text-white focus:outline-none focus:border-monad-purple/40"/>
                      <input type="datetime-local" defaultValue="2027-06-14T20:00"
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-sm text-white focus:outline-none focus:border-monad-purple/40"/>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><p className="text-xs text-gray-600 mb-1">Sale release</p>
                        <input type="datetime-local" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-monad-purple/40"/></div>
                      <div><p className="text-xs text-gray-600 mb-1">Batch size (seats/5min)</p>
                        <input type="number" defaultValue={100} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-monad-purple/40"/></div>
                    </div>
                  </div>
                </div>

                {/* Feature toggles */}
                <div className="space-y-2">
                  {[{icon:Brain,label:"AI wallet screening",desc:"Pre-registration required, bots filtered"},
                    {icon:Fingerprint,label:"Soul-bound KYC",desc:"Identity verification via Civic Pass"},
                    {icon:Lock,label:"Batch release",desc:"Drip tickets to prevent bot sweeps"}].map(({icon:Icon,label,desc})=>(
                    <div key={label} className="p-3 rounded-xl border border-monad-purple/20 bg-monad-purple/5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-monad-purple"/>
                        <div><p className="text-sm font-medium text-white">{label}</p><p className="text-xs text-gray-500">{desc}</p></div>
                      </div>
                      <div className="h-6 w-11 rounded-full bg-monad-purple relative">
                        <div className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-white"/>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Vault tier configurator */}
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Vault tiers</p>
                  <div className="space-y-3">
                    {tiers.map(t=>{
                      const previewQty=Math.min(3,t.maxSeats);
                      const previewDisc=getDiscount(t,previewQty);
                      return (
                        <div key={t.id} className={`p-4 rounded-xl border ${t.borderColor} bg-white/5 space-y-3`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <t.icon className={`h-4 w-4 ${t.color}`}/>
                              <p className="text-sm font-bold text-white">{t.label}</p>
                            </div>
                            <p className={`text-xs font-mono ${t.color}`}>{generateToken(t.prefix,21,previewQty,previewDisc)}</p>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            {([["Capacity","capacity",t.capacity],["Price ($)/seat","basePrice",t.basePrice],["Max seats/wallet","maxSeats",t.maxSeats],["Transfer lock (days)","transferLock",t.transferLock],["Early access (hrs)","releaseOffset",t.releaseOffset]] as [string,string,number][]).map(([l,f,v])=>(
                              <div key={l}>
                                <p className="text-xs text-gray-600 mb-1">{l}</p>
                                <input type="number" value={v} onChange={e=>updateTier(t.id,f,parseInt(e.target.value))}
                                  className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:border-monad-purple/40"/>
                              </div>
                            ))}
                            <div>
                              <p className="text-xs text-gray-600 mb-1">KYC level</p>
                              <select value={t.kycLevel} onChange={e=>updateTier(t.id,"kycLevel",e.target.value)}
                                className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:border-monad-purple/40">
                                {(["none","soft","standard","hard"] as KycLevel[]).map(l=>(
                                  <option key={l} value={l}>{KYC[l].label}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                          {t.discounts.length>0&&(
                            <div className="pt-2 border-t border-white/5 flex flex-wrap gap-2">
                              {t.discounts.map(d=>(
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
                </div>

                <div className="p-4 rounded-xl border border-white/10 bg-white/5 space-y-2">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Deployment summary</p>
                  {[["Vault tiers",tiers.length.toString()],["Total seats",tiers.reduce((a,t)=>a+t.capacity,0).toLocaleString()],
                    ["All vaults start","Pledged — locked until sale"],["Vault contents","Never visible — on-chain opacity"]].map(([l,v])=>(
                    <div key={l} className="flex justify-between text-xs">
                      <span className="text-gray-400">{l}</span>
                      <span className={v.includes("Pledged")?"text-yellow-400":v.includes("Never")?"text-gray-500":"text-white"}>{v}</span>
                    </div>
                  ))}
                </div>

                <Button onClick={deploy} disabled={deploying} className="w-full bg-monad-purple hover:bg-monad-purple/90 text-black font-bold h-12">
                  {deploying?<><Loader2 className="h-4 w-4 mr-2 animate-spin"/>Deploying vaults...</>:<><Zap className="h-4 w-4 mr-2"/>Deploy event vaults</>}
                </Button>
              </>
            )}
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}
