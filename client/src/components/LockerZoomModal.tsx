import { useState } from "react";
import { Shield, ShieldAlert, X, Activity, Server, AlertTriangle, ArrowRight, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface LockerZoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  lockerId: string;
}

export function LockerZoomModal({ isOpen, onClose, lockerId }: LockerZoomModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-black border border-red-500/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between p-5 border-b border-white/10 bg-red-500/5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-red-500/20 border border-red-500/30 flex items-center justify-center">
              <ShieldAlert className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white font-mono">LCK-T2-{lockerId}</h2>
                <Badge variant="destructive" className="bg-red-500 text-white animate-pulse">DISTRESSED</Badge>
              </div>
              <p className="text-xs text-gray-400">Tier 2 Standard Locker • 500 Vault Capacity</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-2 bg-white/5 rounded-lg">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Diagnostics Panel */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="col-span-2 bg-red-950/20 border border-red-500/20 rounded-xl p-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <AlertTriangle className="h-24 w-24 text-red-500" />
              </div>
              <h3 className="text-sm font-bold text-red-400 mb-3 flex items-center gap-2">
                <Activity className="h-4 w-4" /> Root Cause Analysis
              </h3>
              <p className="text-white text-sm mb-4 max-w-lg">
                Solana state root verification failed on Monad cross-chain bridge. 
                Invalid merkle proof detected for vault subset. Circuit breaker engaged automatically.
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="destructive" className="bg-red-500 hover:bg-red-600 text-white">
                  Force State Sync
                </Button>
                <Button size="sm" variant="outline" className="border-red-500/30 text-red-400 hover:bg-red-500/10">
                  <RotateCcw className="h-3 w-3 mr-2" /> Re-verify Proofs
                </Button>
              </div>
            </div>
            
            <div className="bg-white/5 border border-white/10 rounded-xl p-5 flex flex-col justify-center">
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Affected Vaults</p>
                  <p className="text-2xl font-mono text-red-400">14 <span className="text-sm text-gray-500">/ 500</span></p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Locked TVL at Risk</p>
                  <p className="text-xl font-mono text-white">2,840 SOL</p>
                </div>
              </div>
            </div>
          </div>

          {/* Fault Matrix */}
          <div>
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <Server className="h-4 w-4 text-gray-400" /> Vault Matrix (Index 0-499)
            </h3>
            <div className="bg-black/50 border border-white/5 rounded-xl p-4">
              <div className="grid grid-cols-[repeat(25,minmax(0,1fr))] gap-1">
                {Array.from({ length: 500 }).map((_, i) => {
                  // Simulate some random scattered faults
                  const isFaulty = [42, 43, 88, 102, 103, 104, 215, 344, 345, 401, 402, 418, 489, 490].includes(i);
                  const isEmpty = i > 460 && !isFaulty;
                  
                  return (
                    <div 
                      key={i}
                      className={`aspect-square rounded-xs border flex items-center justify-center group relative cursor-pointer
                        ${isFaulty ? 'bg-red-500 border-red-400 z-10' : 
                          isEmpty ? 'bg-white/5 border-white/5' : 
                          'bg-solana-green/20 border-solana-green/30 hover:bg-solana-green/40'}`}
                      title={`Vault #${i} ${isFaulty ? '(STATE MISMATCH)' : isEmpty ? '(Empty)' : '(Healthy)'}`}
                    >
                      {/* Tooltip on hover */}
                      {isFaulty && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-48 p-2 bg-gray-900 border border-red-500/50 rounded-lg shadow-xl z-50 text-left">
                          <p className="text-[10px] font-bold text-red-400 mb-1">VAULT #{i} ERROR</p>
                          <p className="text-[10px] text-gray-300">Monad balance: 145 SOL</p>
                          <p className="text-[10px] text-gray-300">Solana NFT Key: Unverified</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              
              <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1.5"><div className="w-2 h-2 bg-solana-green/30 border border-solana-green/50" /> Healthy Vault</span>
                <span className="flex items-center gap-1.5"><div className="w-2 h-2 bg-red-500 border border-red-400" /> State Mismatch</span>
                <span className="flex items-center gap-1.5"><div className="w-2 h-2 bg-white/5 border border-white/10" /> Empty Index</span>
              </div>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}
