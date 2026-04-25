import { useState } from "react";
import { DeployLockerModal } from "@/components/DeployLockerModal";
import { Shield, Server, Activity, Users, Settings, ArrowLeft, ShieldAlert, KeyRound, Link as LinkIcon, EyeOff, FileCode2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";

export default function AdminDashboard() {
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);

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
                NexusBridge <span className="text-gray-500">Controller</span>
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

        {/* Global Protocol Status */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-black/40 border border-white/5 rounded-xl p-5 backdrop-blur-sm">
            <p className="text-sm text-gray-500 mb-1">Total Value Locked (EVM)</p>
            <p className="text-2xl font-mono text-white">$42.5M</p>
            <p className="text-xs text-green-400 mt-2">+5.2% 24h</p>
          </div>
          <div className="bg-black/40 border border-white/5 rounded-xl p-5 backdrop-blur-sm">
            <p className="text-sm text-gray-500 mb-1">Active Lockers (Monad)</p>
            <p className="text-2xl font-mono text-white">128</p>
            <p className="text-xs text-gray-400 mt-2">Across 3 Tiers</p>
          </div>
          <div className="bg-black/40 border border-white/5 rounded-xl p-5 backdrop-blur-sm">
            <p className="text-sm text-gray-500 mb-1">NFT Keys Minted (Solana)</p>
            <p className="text-2xl font-mono text-white">4,291</p>
            <p className="text-xs text-monad-purple mt-2">89% Utilization</p>
          </div>
          <div className="bg-black/40 border border-white/5 rounded-xl p-5 backdrop-blur-sm">
            <p className="text-sm text-gray-500 mb-1">Cross-Chain Sync Latency</p>
            <p className="text-2xl font-mono text-white">~400ms</p>
            <p className="text-xs text-solana-green mt-2">Optimal</p>
          </div>
        </div>

        {/* Active Lockers Landscape */}
        <div className="mb-8">
          <h2 className="text-lg font-bold flex items-center gap-2 text-white mb-4">
            <Server className="h-5 w-5 text-gray-400" />
            Locker Landscape
          </h2>
          <div className="bg-black/40 border border-white/5 rounded-xl p-6 backdrop-blur-sm">
            <div className="flex flex-col gap-6">
              {/* Tier 1 */}
              <div>
                <div className="flex justify-between items-end mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      Tier 1: High Capacity <Badge variant="outline" className="border-green-500/30 text-green-400 bg-green-500/10 text-[10px] ml-2">Healthy</Badge>
                    </h3>
                    <p className="text-xs text-gray-500">100 Vaults per Locker • 10 SOL Min Deposit</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono text-white">82 Lockers</p>
                    <p className="text-xs text-gray-500">76% full</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {Array.from({ length: 82 }).map((_, i) => (
                    <div 
                      key={`t1-${i}`} 
                      className={`h-6 w-6 rounded-sm border ${
                        i < 62 ? 'bg-monad-purple/80 border-monad-purple' : 
                        i < 75 ? 'bg-monad-purple/40 border-monad-purple/50' : 
                        'bg-white/5 border-white/10'
                      }`}
                      title={`Locker LCK-T1-${i} ${i < 62 ? '(Full)' : i < 75 ? '(Filling)' : '(Empty)'}`}
                    />
                  ))}
                </div>
              </div>

              {/* Tier 2 */}
              <div>
                <div className="flex justify-between items-end mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      Tier 2: Standard <Badge variant="outline" className="border-red-500/50 text-red-400 bg-red-500/10 text-[10px] ml-2 animate-pulse">Critical Alert</Badge>
                    </h3>
                    <p className="text-xs text-gray-500">500 Vaults per Locker • 1 SOL Min Deposit</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono text-white">34 Lockers</p>
                    <p className="text-xs text-gray-500">92% full</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {Array.from({ length: 34 }).map((_, i) => {
                    // Make locker #12 and #18 distressed
                    const isDistressed = i === 12 || i === 18;
                    
                    return (
                      <div 
                        key={`t2-${i}`} 
                        className={`h-6 w-6 rounded-sm border ${
                          isDistressed ? 'bg-red-500 border-red-400 shadow-[0_0_10px_rgba(239,68,68,0.8)] animate-pulse z-10 relative' :
                          i < 31 ? 'bg-solana-green/80 border-solana-green' : 
                          'bg-solana-green/40 border-solana-green/50'
                        }`}
                        title={`Locker LCK-T2-${i} ${isDistressed ? '(DISTRESSED)' : i < 31 ? '(Full)' : '(Filling)'}`}
                      />
                    )
                  })}
                </div>
              </div>

              {/* Tier 3 */}
              <div>
                <div className="flex justify-between items-end mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      Tier 3: Institutional <Badge variant="outline" className="border-blue-400/30 text-blue-400 bg-blue-400/10 text-[10px] ml-2">Scaling</Badge>
                    </h3>
                    <p className="text-xs text-gray-500">10 Vaults per Locker • 1000 SOL Min Deposit</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono text-white">12 Lockers</p>
                    <p className="text-xs text-gray-500">45% full</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div 
                      key={`t3-${i}`} 
                      className={`h-8 w-12 rounded-sm border ${
                        i < 5 ? 'bg-blue-500/80 border-blue-500' : 
                        i < 9 ? 'bg-blue-500/40 border-blue-500/50' : 
                        'bg-white/5 border-white/10'
                      }`}
                      title={`Locker LCK-T3-${i} ${i < 5 ? '(Full)' : i < 9 ? '(Filling)' : '(Empty)'}`}
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
          {/* Column 1: Monad Controls */}
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
                  <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/20">Operational</Badge>
                </div>
              </div>
              <Button variant="destructive" className="w-full bg-red-950 text-red-500 border border-red-900 hover:bg-red-900">
                Initiate Emergency Freeze
              </Button>
            </div>
          </div>

          {/* Column 2: Solana Controls */}
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

          {/* Column 3: Relay & Privacy */}
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
      </div>

      <DeployLockerModal 
        isOpen={isDeployModalOpen}
        onClose={() => setIsDeployModalOpen(false)}
        onSuccess={() => console.log('Locker deployed')}
      />
    </div>
  );
}