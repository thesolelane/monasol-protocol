import { Shield, ShieldAlert, X, Activity, Server, AlertTriangle, RotateCcw, CheckCircle, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Locker {
  id: string;
  externalId: string;
  tier: number;
  capacity: number;
  usedSlots: number;
  status: string;
  minDepositSol: string | null;
  monadAddress?: string | null;
  alertLevel?: "none" | "warning" | "critical";
  alertCount?: number;
}

interface LockerZoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  locker: Locker | null;
}

const TIER_META: Record<number, { label: string; desc: string; color: string; border: string; bg: string; textColor: string }> = {
  1: { label: "Tier 1",  desc: "High Capacity",   color: "text-monad-purple",  border: "border-monad-purple/30",  bg: "bg-monad-purple/5",  textColor: "text-monad-purple" },
  2: { label: "Tier 2",  desc: "Standard",         color: "text-solana-green",  border: "border-solana-green/30",  bg: "bg-solana-green/5",  textColor: "text-solana-green" },
  3: { label: "Tier 3",  desc: "Institutional",    color: "text-blue-400",      border: "border-blue-400/30",      bg: "bg-blue-400/5",      textColor: "text-blue-400"    },
};

const STATUS_META: Record<string, { label: string; badgeClass: string; pulse?: boolean }> = {
  full:       { label: "Full",        badgeClass: "bg-white/10 text-white border-white/20" },
  filling:    { label: "Filling",     badgeClass: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
  healthy:    { label: "Healthy",     badgeClass: "bg-green-500/10 text-green-400 border-green-500/20" },
  distressed: { label: "Distressed",  badgeClass: "bg-red-500 text-white border-red-600", pulse: true },
};

function VaultMatrix({ capacity, usedSlots, status, tier }: { capacity: number; usedSlots: number; status: string; tier: number }) {
  const DISTRESSED_FAULTY = [42, 43, 88, 102, 103, 104, 215, 344, 345, 401, 402, 418, 485, 489, 490];
  const tierMeta = TIER_META[tier] ?? TIER_META[1];

  const cols = capacity <= 10 ? capacity : capacity <= 100 ? 20 : 25;

  const faultSet = new Set(status === "distressed" ? DISTRESSED_FAULTY.filter(i => i < capacity) : []);

  return (
    <div>
      <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
        <Server className="h-4 w-4 text-gray-400" />
        Vault Matrix (Index 0–{capacity - 1})
      </h3>
      <div className="bg-black/50 border border-white/5 rounded-xl p-4">
        <div className={`grid gap-1`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: capacity }).map((_, i) => {
            const isFaulty = faultSet.has(i);
            const isOccupied = i < usedSlots && !isFaulty;
            const isEmpty = i >= usedSlots && !isFaulty;

            const errorTypes = ["STATE MISMATCH", "RPC TIMEOUT", "FRONT-RUN DETECTED"];
            const errorType = isFaulty ? (i < 485 ? errorTypes[i % 3] : ["HONEYPOT QUARANTINE", "INIT ERROR", "STORAGE COLLISION"][i - 485] ?? errorTypes[0]) : "";

            return (
              <div
                key={i}
                className={`aspect-square rounded-[2px] border group relative cursor-pointer
                  ${isFaulty
                    ? "bg-red-500 border-red-400 z-10"
                    : isEmpty
                    ? "bg-white/5 border-white/5"
                    : `${tier === 1 ? "bg-monad-purple/30 border-monad-purple/40 hover:bg-monad-purple/50" : tier === 3 ? "bg-blue-400/20 border-blue-400/30 hover:bg-blue-400/40" : "bg-solana-green/20 border-solana-green/30 hover:bg-solana-green/40"}`}
                `}
                title={`Vault #${i} ${isFaulty ? `(${errorType})` : isEmpty ? "(Empty)" : "(Occupied)"}`}
              >
                {isFaulty && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-44 p-2 bg-gray-900 border border-red-500/50 rounded-lg shadow-xl z-50 text-left pointer-events-none">
                    <p className="text-[10px] font-bold text-red-400 mb-1">VAULT #{i}</p>
                    <p className="text-[10px] text-gray-300 font-mono">{errorType}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <div className={`w-2 h-2 ${tier === 1 ? "bg-monad-purple/40 border border-monad-purple/60" : tier === 3 ? "bg-blue-400/30 border border-blue-400/40" : "bg-solana-green/30 border border-solana-green/50"}`} />
            Occupied
          </span>
          <span className="flex items-center gap-1.5"><div className="w-2 h-2 bg-white/5 border border-white/10" /> Empty</span>
          {status === "distressed" && (
            <span className="flex items-center gap-1.5"><div className="w-2 h-2 bg-red-500 border border-red-400" /> Faulted</span>
          )}
        </div>
      </div>
    </div>
  );
}

export function LockerZoomModal({ isOpen, onClose, locker }: LockerZoomModalProps) {
  if (!isOpen || !locker) return null;

  const isDistressed = locker.status === "distressed";
  const tierMeta = TIER_META[locker.tier] ?? TIER_META[1];
  const statusMeta = STATUS_META[locker.status] ?? { label: locker.status, badgeClass: "bg-white/10 text-gray-300 border-white/20" };

  const fillPct = locker.capacity > 0 ? Math.round((locker.usedSlots / locker.capacity) * 100) : 0;
  const freeSlots = locker.capacity - locker.usedSlots;

  const headerBorderClass = isDistressed ? "border-red-500/30 bg-red-500/5" : `${tierMeta.border} ${tierMeta.bg}`;
  const modalBorderClass = isDistressed ? "border-red-500/30" : tierMeta.border;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      <div className={`relative w-full max-w-4xl max-h-[90vh] bg-black border ${modalBorderClass} rounded-2xl shadow-2xl flex flex-col overflow-hidden`}>

        {/* Header */}
        <div className={`shrink-0 flex items-center justify-between p-5 border-b border-white/10 ${headerBorderClass}`}>
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-xl border flex items-center justify-center ${isDistressed ? "bg-red-500/20 border-red-500/30" : locker.alertLevel === "critical" ? "bg-red-500/15 border-red-500/40" : locker.alertLevel === "warning" ? "bg-yellow-500/15 border-yellow-400/40" : `${tierMeta.bg} ${tierMeta.border}`}`}>
              {isDistressed || locker.alertLevel === "critical"
                ? <ShieldAlert className="h-5 w-5 text-red-500" />
                : locker.alertLevel === "warning"
                ? <ShieldAlert className="h-5 w-5 text-yellow-400" />
                : <Shield className={`h-5 w-5 ${tierMeta.textColor}`} />
              }
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white font-mono">{locker.externalId}</h2>
                <Badge
                  variant="outline"
                  className={`text-[10px] border ${statusMeta.badgeClass} ${statusMeta.pulse ? "animate-pulse" : ""}`}
                >
                  {statusMeta.label.toUpperCase()}
                </Badge>
                {locker.alertLevel === "critical" && (
                  <Badge variant="outline" className="text-[10px] border border-red-500/50 text-red-400 bg-red-500/10 animate-pulse">
                    {locker.alertCount} CRITICAL ALERT{(locker.alertCount ?? 0) > 1 ? "S" : ""}
                  </Badge>
                )}
                {locker.alertLevel === "warning" && (
                  <Badge variant="outline" className="text-[10px] border border-yellow-400/50 text-yellow-400 bg-yellow-500/10">
                    {locker.alertCount} FAULT{(locker.alertCount ?? 0) > 1 ? "S" : ""}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-gray-400">
                {tierMeta.label}: {tierMeta.desc} Locker • {locker.capacity.toLocaleString()} Vault Capacity
                {locker.minDepositSol && ` • ${locker.minDepositSol} MON move-in`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-2 bg-white/5 rounded-lg">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Capacity</p>
              <p className="text-2xl font-mono text-white">{locker.capacity.toLocaleString()}</p>
              <p className="text-[10px] text-gray-600 mt-1">total vault slots</p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Occupied</p>
              <p className={`text-2xl font-mono ${isDistressed ? "text-red-400" : tierMeta.textColor}`}>
                {locker.usedSlots.toLocaleString()}
              </p>
              <p className="text-[10px] text-gray-600 mt-1">{fillPct}% utilization</p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Available</p>
              <p className="text-2xl font-mono text-white">{freeSlots.toLocaleString()}</p>
              <p className="text-[10px] text-gray-600 mt-1">open slots</p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Min Deposit</p>
              <p className="text-2xl font-mono text-white">{locker.minDepositSol ?? "—"}</p>
              <p className="text-[10px] text-gray-600 mt-1">SOL required</p>
            </div>
          </div>

          {/* Fill bar */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-5">
            <div className="flex justify-between items-center mb-3">
              <p className="text-sm font-semibold text-white flex items-center gap-2">
                <Layers className="h-4 w-4 text-gray-400" /> Utilization
              </p>
              <p className={`text-sm font-mono ${isDistressed ? "text-red-400" : tierMeta.textColor}`}>{fillPct}%</p>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  isDistressed ? "bg-red-500 animate-pulse" :
                  fillPct >= 90 ? "bg-yellow-400" :
                  locker.tier === 1 ? "bg-monad-purple" :
                  locker.tier === 3 ? "bg-blue-400" :
                  "bg-solana-green"
                }`}
                style={{ width: `${fillPct}%` }}
              />
            </div>
          </div>

          {/* Distressed-specific diagnostics */}
          {isDistressed && (
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
                    <p className="text-2xl font-mono text-red-400">14 <span className="text-sm text-gray-500">/ {locker.capacity}</span></p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Locked TVL at Risk</p>
                    <p className="text-xl font-mono text-white">2,840 SOL</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Healthy-locker actions */}
          {!isDistressed && (
            <div className={`border ${tierMeta.border} ${tierMeta.bg} rounded-xl p-5`}>
              <h3 className={`text-sm font-bold mb-3 flex items-center gap-2 ${tierMeta.textColor}`}>
                <CheckCircle className="h-4 w-4" /> Locker Management
              </h3>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className={`border ${tierMeta.border} ${tierMeta.textColor} hover:${tierMeta.bg}`}>
                  Update Metadata
                </Button>
                <Button size="sm" variant="outline" className={`border ${tierMeta.border} ${tierMeta.textColor} hover:${tierMeta.bg}`}>
                  Adjust Capacity
                </Button>
                <Button size="sm" variant="outline" className={`border ${tierMeta.border} ${tierMeta.textColor} hover:${tierMeta.bg}`}>
                  View Transactions
                </Button>
              </div>
            </div>
          )}

          {/* Vault matrix */}
          <VaultMatrix
            capacity={locker.capacity}
            usedSlots={locker.usedSlots}
            status={locker.status}
            tier={locker.tier}
          />
        </div>
      </div>
    </div>
  );
}
