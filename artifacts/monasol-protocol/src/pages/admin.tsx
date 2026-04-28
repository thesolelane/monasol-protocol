import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DeployLockerModal } from "@/components/DeployLockerModal";
import { LockerZoomModal } from "@/components/LockerZoomModal";
import { Shield, Server, Activity, Users, Settings, ArrowLeft, ShieldAlert, KeyRound, Link as LinkIcon, EyeOff, FileCode2, FlaskConical } from "lucide-react";
import { getFeatureFlags, setFeatureFlag } from "@/lib/featureFlags";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Footer } from "@/components/Footer";

interface ProtocolStats {
  tvlUsd: string;
  tvlTrend: string;
  activeVaults: number;
  maxVaults: number;
  nftKeysMinted: number;
  nftUtilizationPct: number;
  syncLatencyMs: number;
  circuitBreakerActive: boolean;
}

interface Locker {
  id: string;
  externalId: string;
  tier: number;
  capacity: number;
  usedSlots: number;
  status: string;
  minDepositSol: string | null;
}

function formatTvl(tvlUsd: string): string {
  const n = parseFloat(tvlUsd);
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

export default function AdminDashboard() {
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);
  const [zoomedLockerId, setZoomedLockerId] = useState<string | null>(null);
  const [monadWalletEnabled, setMonadWalletEnabled] = useState(() => getFeatureFlags().monadWalletEnabled);

  function toggleMonadWallet() {
    const next = !monadWalletEnabled;
    setFeatureFlag("monadWalletEnabled", next);
    setMonadWalletEnabled(next);
  }

  const { data: stats } = useQuery<ProtocolStats>({
    queryKey: ["/api/stats"],
    staleTime: 30_000,
  });

  const { data: lockers = [] } = useQuery<Locker[]>({
    queryKey: ["/api/lockers"],
    staleTime: 30_000,
  });

  const tier1Lockers = lockers.filter(l => l.tier === 1);
  const tier2Lockers = lockers.filter(l => l.tier === 2);
  const tier3Lockers = lockers.filter(l => l.tier === 3);

  const tvl = stats ? formatTvl(stats.tvlUsd) : "$42.5M";
  const activeLockers = stats ? lockers.length : 128;
  const nftsMinted = stats?.nftKeysMinted ?? 4291;
  const nftUtil = stats?.nftUtilizationPct ?? 89;
  const syncLatency = stats ? `~${stats.syncLatencyMs}ms` : "~400ms";
  const circuitBreakerActive = stats?.circuitBreakerActive ?? false;

  function lockerColor(locker: Locker, index: number): string {
    if (locker.status === "distressed") return "bg-red-500 border-red-400 shadow-[0_0_10px_rgba(239,68,68,0.8)] animate-pulse z-10 relative cursor-pointer";
    if (locker.tier === 1) {
      return locker.status === "full" ? "bg-monad-purple/80 border-monad-purple" :
        locker.status === "filling" ? "bg-monad-purple/40 border-monad-purple/50" :
        "bg-white/5 border-white/10";
    }
    if (locker.tier === 2) {
      return locker.status === "full" ? "bg-solana-green/80 border-solana-green" :
        locker.status === "filling" ? "bg-solana-green/40 border-solana-green/50" :
        "bg-white/5 border-white/10";
    }
    return locker.status === "full" ? "bg-blue-500/80 border-blue-500" :
      locker.status === "filling" ? "bg-blue-500/40 border-blue-500/50" :
      "bg-white/5 border-white/10";
  }

  const tier1Full = tier1Lockers.filter(l => l.status === "full").length;
  const tier1Total = tier1Lockers.length;
  const tier2Full = tier2Lockers.filter(l => l.status === "full").length;
  const tier2Total = tier2Lockers.length;
  const tier2HasDistressed = tier2Lockers.some(l => l.status === "distressed");
  const tier3Full = tier3Lockers.filter(l => l.status === "full").length;
  const tier3Total = tier3Lockers.length;

  const tier1Pct = tier1Total > 0 ? Math.round((tier1Full / tier1Total) * 100) : 76;
  const tier2Pct = tier2Total > 0 ? Math.round(((tier2Total - tier2Lockers.filter(l => l.status === "healthy").length) / tier2Total) * 100) : 92;
  const tier3Pct = tier3Total > 0 ? Math.round((tier3Full / tier3Total) * 100) : 45;

  return (
    <div className="min-h-screen w-full relative overflow-hidden bg-black text-white p-4 sm:p-8">
      <div className="fixed inset-0 z-0 bg-linear-to-br from-monad-purple/10 via-black to-solana-green/5 pointer-events-none" />

      <div className="relative z-10 max-w-7xl mx-auto">
        <div className="mb-8">
          <Link href="/">
            <Button variant="ghost" className="text-gray-400 hover:text-white mb-4 -ml-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to App
            </Button>
          </Link>

          <div className="flex items-center justify-between border-b border-white/10 pb-6">
            <div>
              <h1 className="text-3xl font-bold font-display flex items-center gap-3">
                <Shield className="h-8 w-8 text-monad-purple" />
                MonasolProtocol <span className="text-gray-500">Controller</span>
              </h1>
              <p className="text-gray-400 mt-2">Zero-Trust Cross-Chain Protocol Management.</p>
            </div>
            <div className="flex gap-3">
              <Badge variant="outline" className="bg-monad-purple/10 text-monad-purple border-monad-purple/30">
                EVM: Active
              </Badge>
              <Badge variant="outline" className="bg-solana-green/10 text-solana-green border-solana-green/30">
                SVM: Active
              </Badge>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-black/40 border border-white/5 rounded-xl p-5 backdrop-blur-sm">
            <p className="text-sm text-gray-500 mb-1">Total Value Locked (EVM)</p>
            <p className="text-2xl font-mono text-white">{tvl}</p>
            <p className="text-xs text-green-400 mt-2">{stats?.tvlTrend ?? "+5.2% 24h"}</p>
          </div>
          <div className="bg-black/40 border border-white/5 rounded-xl p-5 backdrop-blur-sm">
            <p className="text-sm text-gray-500 mb-1">Active Lockers (Monad)</p>
            <p className="text-2xl font-mono text-white">{activeLockers}</p>
            <p className="text-xs text-gray-400 mt-2">Across 3 Tiers</p>
          </div>
          <div className="bg-black/40 border border-white/5 rounded-xl p-5 backdrop-blur-sm">
            <p className="text-sm text-gray-500 mb-1">NFT Keys Minted (Solana)</p>
            <p className="text-2xl font-mono text-white">{nftsMinted.toLocaleString()}</p>
            <p className="text-xs text-monad-purple mt-2">{nftUtil}% Utilization</p>
          </div>
          <div className="bg-black/40 border border-white/5 rounded-xl p-5 backdrop-blur-sm">
            <p className="text-sm text-gray-500 mb-1">Cross-Chain Sync Latency</p>
            <p className="text-2xl font-mono text-white">{syncLatency}</p>
            <p className="text-xs text-solana-green mt-2">Optimal</p>
          </div>
        </div>

        <div className="mb-8">
          <h2 className="text-lg font-bold flex items-center gap-2 text-white mb-4">
            <Server className="h-5 w-5 text-gray-400" />
            Locker Landscape
          </h2>
          <div className="bg-black/40 border border-white/5 rounded-xl p-6 backdrop-blur-sm">
            <div className="flex flex-col gap-6">
              <div>
                <div className="flex justify-between items-end mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      Tier 1: High Capacity <Badge variant="outline" className="border-green-500/30 text-green-400 bg-green-500/10 text-[10px] ml-2">Healthy</Badge>
                    </h3>
                    <p className="text-xs text-gray-500">100 Vaults per Locker • 10 SOL Min Deposit</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono text-white">{tier1Total || 82} Lockers</p>
                    <p className="text-xs text-gray-500">{tier1Pct}% full</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {(tier1Lockers.length > 0 ? tier1Lockers : Array.from({ length: 82 }, (_, i) => ({ id: `t1-${i}`, externalId: `LCK-T1-${i}`, status: i < 62 ? "full" : i < 75 ? "filling" : "healthy", tier: 1, capacity: 100, usedSlots: 0, minDepositSol: "10" }))).map((l, i) => (
                    <div
                      key={l.id}
                      className={`h-6 w-6 rounded-sm border ${lockerColor(l, i)}`}
                      title={`${l.externalId} (${l.status})`}
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="flex justify-between items-end mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      Tier 2: Standard {tier2HasDistressed && <Badge variant="outline" className="border-red-500/50 text-red-400 bg-red-500/10 text-[10px] ml-2 animate-pulse">Critical Alert</Badge>}
                    </h3>
                    <p className="text-xs text-gray-500">500 Vaults per Locker • 1 SOL Min Deposit</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono text-white">{tier2Total || 34} Lockers</p>
                    <p className="text-xs text-gray-500">{tier2Pct}% full</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {(tier2Lockers.length > 0 ? tier2Lockers : Array.from({ length: 34 }, (_, i) => ({ id: `t2-${i}`, externalId: `LCK-T2-${i}`, status: (i === 12 || i === 18) ? "distressed" : i < 31 ? "full" : "filling", tier: 2, capacity: 500, usedSlots: 0, minDepositSol: "1" }))).map((l, i) => (
                    <div
                      key={l.id}
                      onClick={() => l.status === "distressed" && setZoomedLockerId(l.externalId)}
                      className={`h-6 w-6 rounded-sm border ${l.status !== "distressed" ? "cursor-default" : ""} ${lockerColor(l, i)}`}
                      title={`${l.externalId} ${l.status === "distressed" ? "(DISTRESSED - CLICK TO VIEW)" : `(${l.status})`}`}
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="flex justify-between items-end mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      Tier 3: Institutional <Badge variant="outline" className="border-blue-400/30 text-blue-400 bg-blue-400/10 text-[10px] ml-2">Scaling</Badge>
                    </h3>
                    <p className="text-xs text-gray-500">10 Vaults per Locker • 1000 SOL Min Deposit</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono text-white">{tier3Total || 12} Lockers</p>
                    <p className="text-xs text-gray-500">{tier3Pct}% full</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {(tier3Lockers.length > 0 ? tier3Lockers : Array.from({ length: 12 }, (_, i) => ({ id: `t3-${i}`, externalId: `LCK-T3-${i}`, status: i < 5 ? "full" : i < 9 ? "filling" : "healthy", tier: 3, capacity: 10, usedSlots: 0, minDepositSol: "1000" }))).map((l, i) => (
                    <div
                      key={l.id}
                      className={`h-8 w-12 rounded-sm border cursor-default ${lockerColor(l, i)}`}
                      title={`${l.externalId} (${l.status})`}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-white/10 flex flex-wrap justify-between items-center text-xs text-gray-500 gap-y-2">
              <div className="flex flex-wrap gap-4">
                <span className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-white/80" /> Full Capacity</span>
                <span className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-white/40 border border-white/50" /> Accepting Deposits</span>
                <span className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-white/5 border border-white/10" /> Empty / Ready</span>
                <span className="flex items-center gap-2 text-red-400"><div className="w-3 h-3 rounded-sm bg-red-500 border border-red-400 shadow-[0_0_8px_rgba(239,68,68,0.5)] animate-pulse" /> Distressed / Frozen</span>
              </div>
              <p>Landscape auto-updates every 12s</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-6">
            <h2 className="text-lg font-bold flex items-center gap-2 text-monad-purple">
              <Server className="h-5 w-5" />
              Monad (EVM) Layer
            </h2>

            <div className="bg-white/5 border border-monad-purple/30 rounded-xl p-6 relative overflow-hidden backdrop-blur-sm">
              <div className="absolute top-0 right-0 w-32 h-32 bg-monad-purple/5 rounded-bl-full -z-10" />
              <h3 className="font-bold mb-2 text-white">Locker Deployment</h3>
              <p className="text-gray-400 mb-6 text-sm">
                Deploy new isolated Vyper smart contracts to hold user vaults. Required when current pools reach 90% capacity.
              </p>
              <Button
                onClick={() => setIsDeployModalOpen(true)}
                className="w-full bg-monad-purple hover:bg-monad-purple/90 text-black font-bold shadow-[0_0_15px_-3px_rgba(130,71,229,0.3)]"
              >
                <FileCode2 className="h-4 w-4 mr-2" />
                Deploy New Locker
              </Button>
            </div>

            <div className="bg-black/40 border border-white/5 rounded-xl p-6 backdrop-blur-sm">
              <h3 className="font-bold mb-4 text-white">Protocol Circuit Breaker</h3>
              <p className="text-gray-400 mb-4 text-xs">
                Emergency global pause. Overrides user-level settings. Requires 3/5 multi-sig consensus.
              </p>
              <div className="p-4 border border-red-500/20 bg-red-500/5 rounded-lg mb-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-red-400 flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4" /> Global Status
                  </span>
                  <Badge variant="outline" className={circuitBreakerActive ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-green-500/10 text-green-400 border-green-500/20"}>
                    {circuitBreakerActive ? "PAUSED" : "Operational"}
                  </Badge>
                </div>
              </div>
              <Button variant="destructive" className="w-full bg-red-950 text-red-500 border border-red-900 hover:bg-red-900">
                Initiate Emergency Freeze
              </Button>
            </div>
          </div>

          <div className="lg:col-span-1 space-y-6">
            <h2 className="text-lg font-bold flex items-center gap-2 text-solana-green">
              <KeyRound className="h-5 w-5" />
              Solana (SVM) Layer
            </h2>

            <div className="bg-white/5 border border-solana-green/30 rounded-xl p-6 relative overflow-hidden backdrop-blur-sm">
              <div className="absolute top-0 right-0 w-32 h-32 bg-solana-green/5 rounded-bl-full -z-10" />
              <h3 className="font-bold mb-2 text-white">Metaplex Core Collection</h3>
              <p className="text-gray-400 mb-6 text-sm">
                Manage the master NFT collection that acts as the source of truth for vault ownership rights.
              </p>
              <div className="space-y-3">
                <Button variant="outline" className="w-full border-solana-green/20 text-solana-green hover:bg-solana-green/10">
                  Update Collection Metadata
                </Button>
                <Button variant="outline" className="w-full border-solana-green/20 text-solana-green hover:bg-solana-green/10">
                  Verify Collection Hash
                </Button>
              </div>
            </div>

            <div className="bg-black/40 border border-white/5 rounded-xl p-6 backdrop-blur-sm">
              <h3 className="font-bold mb-4 text-white">Yield NFT Mechanics</h3>
              <p className="text-gray-400 mb-4 text-xs">
                Configure the secondary Yield NFT issuance parameters and APY distribution rules.
              </p>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-400">Base Reward Rate</span>
                    <span className="text-white font-mono">4.2% APY</span>
                  </div>
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-solana-green w-[42%]" />
                  </div>
                </div>
                <Button variant="secondary" className="w-full bg-white/5 hover:bg-white/10 text-white">
                  Adjust Yield Parameters
                </Button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-1 space-y-6">
            <h2 className="text-lg font-bold flex items-center gap-2 text-blue-400">
              <LinkIcon className="h-5 w-5" />
              Cross-Chain & Privacy
            </h2>

            <div className="bg-white/5 border border-blue-400/30 rounded-xl p-6 relative overflow-hidden backdrop-blur-sm">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-400/5 rounded-bl-full -z-10" />
              <h3 className="font-bold mb-2 text-white">Solana Light Client</h3>
              <p className="text-gray-400 mb-4 text-sm">
                Monad-side verifier for Solana state roots. Replaces traditional oracles for trustless execution.
              </p>
              <div className="p-3 bg-black/50 rounded border border-white/5 mb-4">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Last Sync Root:</span>
                  <span className="text-blue-400 font-mono">8xR...3kL</span>
                </div>
                <div className="flex justify-between text-xs mt-2">
                  <span className="text-gray-500">Blocks Behind:</span>
                  <span className="text-white font-mono">2 slots</span>
                </div>
              </div>
              <Button variant="outline" className="w-full border-blue-400/20 text-blue-400 hover:bg-blue-400/10">
                Force State Sync
              </Button>
            </div>

            <div className="bg-black/40 border border-white/5 rounded-xl p-6 backdrop-blur-sm">
              <h3 className="font-bold mb-4 text-white flex items-center gap-2">
                <EyeOff className="h-4 w-4" />
                On-Chain Opacity
              </h3>
              <p className="text-gray-400 mb-4 text-xs">
                Manage the stealth addressing subsystem that prevents correlation between Monad Vaults and Solana NFT Keys.
              </p>
              <Button variant="secondary" className="w-full bg-white/5 hover:bg-white/10 text-white">
                Rotate Stealth Relayers
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-8">
          <h2 className="text-lg font-bold flex items-center gap-2 text-white mb-4">
            <FlaskConical className="h-5 w-5 text-gray-400" />
            Feature Flags
          </h2>
          <div className="bg-black/40 border border-white/5 rounded-xl p-6 backdrop-blur-sm">
            <p className="text-xs text-gray-500 mb-5">
              Enable features that are in development. Changes take effect immediately — no page reload needed.
            </p>
            <div className="flex items-center justify-between py-4 border-b border-white/5">
              <div>
                <p className="text-sm font-semibold text-white">Monad Wallet Connection</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Shows the "Connect Monad" button on the main app. Off until Monad integration is live.
                </p>
              </div>
              <button
                data-testid="toggle-monad-wallet"
                onClick={toggleMonadWallet}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  monadWalletEnabled ? "bg-monad-purple" : "bg-white/10"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    monadWalletEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      </div>

      <DeployLockerModal
        isOpen={isDeployModalOpen}
        onClose={() => setIsDeployModalOpen(false)}
        onSuccess={() => {}}
      />

      <LockerZoomModal
        isOpen={!!zoomedLockerId}
        onClose={() => setZoomedLockerId(null)}
        lockerId={zoomedLockerId || ""}
      />

      <Footer />
    </div>
  );
}
