import { useEffect, useState } from "react";
import {
  Shield, ShieldAlert, X, Activity, Server, AlertTriangle,
  RotateCcw, CheckCircle, Layers, ArrowRight, Clock, Zap,
} from "lucide-react";
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

interface LockerAlert {
  id: string;
  vaultAddress: string;
  slotIndex: number | null;
  severity: "warning" | "critical";
  alertType: string;
  message: string | null;
  createdAt: string;
  nextStep: string;
}

interface LockerZoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  locker: Locker | null;
}

const TIER_META: Record<number, { label: string; desc: string; color: string; border: string; bg: string; textColor: string }> = {
  1: { label: "Tier 1", desc: "High Capacity",  color: "text-monad-purple", border: "border-monad-purple/30", bg: "bg-monad-purple/5",  textColor: "text-monad-purple" },
  2: { label: "Tier 2", desc: "Standard",        color: "text-solana-green", border: "border-solana-green/30", bg: "bg-solana-green/5",  textColor: "text-solana-green" },
  3: { label: "Tier 3", desc: "Institutional",   color: "text-blue-400",     border: "border-blue-400/30",     bg: "bg-blue-400/5",      textColor: "text-blue-400"    },
};

const STATUS_META: Record<string, { label: string; badgeClass: string; pulse?: boolean }> = {
  full:       { label: "Full",       badgeClass: "bg-white/10 text-white border-white/20" },
  filling:    { label: "Filling",    badgeClass: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
  healthy:    { label: "Healthy",    badgeClass: "bg-green-500/10 text-green-400 border-green-500/20" },
  distressed: { label: "Distressed", badgeClass: "bg-red-500 text-white border-red-600", pulse: true },
};

const ALERT_TYPE_LABEL: Record<string, string> = {
  state_mismatch:    "State Mismatch",
  intrusion:         "Intrusion",
  rpc_timeout:       "RPC Timeout",
  fault:             "Vault Fault",
  error:             "Error",
  honeypot:          "Honeypot",
  oracle_failure:    "Oracle Failure",
  front_run:         "Front-Run",
  storage_collision: "Storage Collision",
  init_error:        "Init Error",
};

function fmtAddr(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Alert type → next-step action label (short) ───────────────────────────
const NEXT_ACTION_LABEL: Record<string, string> = {
  state_mismatch:    "Force State Sync",
  intrusion:         "Quarantine Vault",
  rpc_timeout:       "Rotate RPC Endpoint",
  fault:             "Run Diagnostic Scan",
  error:             "Review Tx Logs",
  honeypot:          "Await Security Clearance",
  oracle_failure:    "Restart Oracle Feed",
  front_run:         "Review Block History",
  storage_collision: "Remap PDA Derivation",
  init_error:        "Re-deploy Vault",
};

// ── Vault Alert Panel ─────────────────────────────────────────────────────
function VaultAlertPanel({ alerts, loading }: { alerts: LockerAlert[]; loading: boolean }) {
  const criticals = alerts.filter(a => a.severity === "critical");
  const warnings  = alerts.filter(a => a.severity === "warning");

  if (loading) {
    return (
      <div className="bg-black/40 border border-white/10 rounded-xl p-5">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <div className="h-3 w-3 rounded-full border-2 border-gray-600 border-t-gray-300 animate-spin" />
          Loading vault-level alert details…
        </div>
      </div>
    );
  }

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Zap className="h-4 w-4 text-red-400" />
          Active Vault Alerts
        </h3>
        <div className="flex gap-2">
          {criticals.length > 0 && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/30 text-red-400 animate-pulse">
              {criticals.length} CRITICAL
            </span>
          )}
          {warnings.length > 0 && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-yellow-500/10 border border-yellow-400/30 text-yellow-400">
              {warnings.length} WARNING
            </span>
          )}
        </div>
      </div>

      {/* Alert rows */}
      <div className="space-y-2">
        {alerts.map(alert => {
          const isCrit = alert.severity === "critical";
          const borderCls = isCrit
            ? "border-red-500/25 bg-red-950/15 hover:bg-red-950/25"
            : "border-yellow-400/20 bg-yellow-950/10 hover:bg-yellow-950/20";
          const dotCls = isCrit ? "bg-red-500 animate-pulse" : "bg-yellow-400";
          const typeCls = isCrit ? "text-red-400 border-red-500/30 bg-red-500/10" : "text-yellow-400 border-yellow-400/30 bg-yellow-500/10";
          const actionLabel = NEXT_ACTION_LABEL[alert.alertType] ?? "Investigate";

          return (
            <div key={alert.id} className={`border rounded-xl p-4 transition-colors ${borderCls}`}>
              <div className="flex items-start justify-between gap-3">
                {/* Left: severity dot + slot + type */}
                <div className="flex items-start gap-3 min-w-0">
                  <div className={`mt-1 h-2 w-2 rounded-full shrink-0 ${dotCls}`} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      {alert.slotIndex != null && (
                        <span className="text-xs font-mono text-white bg-white/10 border border-white/15 px-1.5 py-0.5 rounded">
                          Slot #{alert.slotIndex}
                        </span>
                      )}
                      <Badge variant="outline" className={`text-[10px] border ${typeCls}`}>
                        {ALERT_TYPE_LABEL[alert.alertType] ?? alert.alertType.replace(/_/g, " ").toUpperCase()}
                      </Badge>
                      <span className="text-[10px] text-gray-500 font-mono flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" />{fmtRelative(alert.createdAt)}
                      </span>
                    </div>
                    {/* Vault address */}
                    <p className="text-[10px] text-gray-500 font-mono mb-1.5">
                      Vault: {fmtAddr(alert.vaultAddress)}
                    </p>
                    {/* Message */}
                    {alert.message && (
                      <p className="text-xs text-gray-300 mb-2 leading-relaxed">{alert.message}</p>
                    )}
                    {/* Next step */}
                    <div className={`text-[11px] leading-relaxed rounded-lg px-3 py-2 border ${isCrit ? "bg-red-950/20 border-red-500/20 text-red-300" : "bg-yellow-950/15 border-yellow-400/20 text-yellow-200"}`}>
                      <span className={`font-semibold ${isCrit ? "text-red-400" : "text-yellow-400"}`}>Next Step: </span>
                      {alert.nextStep}
                    </div>
                  </div>
                </div>
                {/* Right: action button */}
                <Button
                  size="sm"
                  variant="outline"
                  className={`shrink-0 text-[10px] h-7 px-2.5 ${isCrit
                    ? "border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/50"
                    : "border-yellow-400/30 text-yellow-400 hover:bg-yellow-500/10 hover:border-yellow-400/50"
                  }`}
                >
                  {actionLabel}
                  <ArrowRight className="h-2.5 w-2.5 ml-1" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Vault Matrix ──────────────────────────────────────────────────────────
type AlertSlotMap = Map<number, { severity: "warning" | "critical"; alertType: string; message: string | null }>;

function VaultMatrix({
  capacity, usedSlots, status, tier, alertSlots,
}: {
  capacity: number;
  usedSlots: number;
  status: string;
  tier: number;
  alertSlots: AlertSlotMap;
}) {
  const tierMeta = TIER_META[tier] ?? TIER_META[1];
  const cols = capacity <= 10 ? capacity : capacity <= 100 ? 20 : 25;

  const hasRealAlerts = alertSlots.size > 0;
  const showMatrixAlerts = hasRealAlerts || status === "distressed";

  return (
    <div>
      <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
        <Server className="h-4 w-4 text-gray-400" />
        Vault Matrix (Index 0–{capacity - 1})
        {hasRealAlerts && (
          <span className="text-[10px] font-mono text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full ml-1">
            {alertSlots.size} slot{alertSlots.size > 1 ? "s" : ""} flagged
          </span>
        )}
      </h3>
      <div className="bg-black/50 border border-white/5 rounded-xl p-4">
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: capacity }).map((_, i) => {
            const alertInfo = alertSlots.get(i);
            const isCritAlert = alertInfo?.severity === "critical";
            const isWarnAlert = alertInfo?.severity === "warning";
            const isOccupied  = i < usedSlots && !alertInfo;
            const isEmpty     = i >= usedSlots && !alertInfo;

            let cellClass: string;
            let tooltip: string;

            if (isCritAlert) {
              cellClass = "bg-red-500 border-red-400 z-10 animate-pulse";
              tooltip = `Vault #${i} — CRITICAL: ${ALERT_TYPE_LABEL[alertInfo!.alertType] ?? alertInfo!.alertType}${alertInfo!.message ? ` — ${alertInfo!.message}` : ""}`;
            } else if (isWarnAlert) {
              cellClass = "bg-yellow-400/80 border-yellow-300 z-10";
              tooltip = `Vault #${i} — WARNING: ${ALERT_TYPE_LABEL[alertInfo!.alertType] ?? alertInfo!.alertType}${alertInfo!.message ? ` — ${alertInfo!.message}` : ""}`;
            } else if (isEmpty) {
              cellClass = "bg-white/5 border-white/5";
              tooltip = `Vault #${i} (Empty)`;
            } else if (isOccupied) {
              const occCls = tier === 1
                ? "bg-monad-purple/30 border-monad-purple/40 hover:bg-monad-purple/50"
                : tier === 3
                ? "bg-blue-400/20 border-blue-400/30 hover:bg-blue-400/40"
                : "bg-solana-green/20 border-solana-green/30 hover:bg-solana-green/40";
              cellClass = occCls;
              tooltip = `Vault #${i} (Occupied)`;
            } else {
              cellClass = "bg-white/5 border-white/5";
              tooltip = `Vault #${i}`;
            }

            return (
              <div
                key={i}
                className={`aspect-square rounded-[2px] border group relative cursor-pointer ${cellClass}`}
                title={tooltip}
              >
                {(isCritAlert || isWarnAlert) && (
                  <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-52 p-2 bg-gray-900 border ${isCritAlert ? "border-red-500/50" : "border-yellow-400/40"} rounded-lg shadow-xl z-50 text-left pointer-events-none`}>
                    <p className={`text-[10px] font-bold mb-1 ${isCritAlert ? "text-red-400" : "text-yellow-400"}`}>
                      VAULT #{i} — {isCritAlert ? "CRITICAL" : "WARNING"}
                    </p>
                    <p className="text-[10px] text-gray-300 font-mono">
                      {ALERT_TYPE_LABEL[alertInfo!.alertType] ?? alertInfo!.alertType.toUpperCase()}
                    </p>
                    {alertInfo!.message && (
                      <p className="text-[10px] text-gray-400 mt-1">{alertInfo!.message}</p>
                    )}
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
          {showMatrixAlerts && alertSlots.size > 0 && (
            <>
              <span className="flex items-center gap-1.5 text-yellow-400"><div className="w-2 h-2 bg-yellow-400/80 border border-yellow-300" /> Warning</span>
              <span className="flex items-center gap-1.5 text-red-400"><div className="w-2 h-2 bg-red-500 border border-red-400 animate-pulse" /> Critical</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────
export function LockerZoomModal({ isOpen, onClose, locker }: LockerZoomModalProps) {
  const [alerts, setAlerts]           = useState<LockerAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !locker) { setAlerts([]); return; }
    const hasAlerts = (locker.alertLevel && locker.alertLevel !== "none") || locker.status === "distressed";
    if (!hasAlerts) { setAlerts([]); return; }

    setAlertsLoading(true);
    fetch(`/api/lockers/${locker.id}/alerts`)
      .then(r => r.json())
      .then((data: { alerts: LockerAlert[] }) => setAlerts(data.alerts ?? []))
      .catch(() => setAlerts([]))
      .finally(() => setAlertsLoading(false));
  }, [isOpen, locker?.id, locker?.alertLevel, locker?.status]);

  if (!isOpen || !locker) return null;

  const isDistressed = locker.status === "distressed";
  const tierMeta  = TIER_META[locker.tier] ?? TIER_META[1];
  const statusMeta = STATUS_META[locker.status] ?? { label: locker.status, badgeClass: "bg-white/10 text-gray-300 border-white/20" };

  const fillPct   = locker.capacity > 0 ? Math.round((locker.usedSlots / locker.capacity) * 100) : 0;
  const freeSlots = locker.capacity - locker.usedSlots;

  const hasAlerts = (locker.alertLevel && locker.alertLevel !== "none") || isDistressed;
  const headerBorderClass = isDistressed    ? "border-red-500/30 bg-red-500/5"
    : locker.alertLevel === "critical"      ? "border-red-500/20 bg-red-950/10"
    : locker.alertLevel === "warning"       ? "border-yellow-400/20 bg-yellow-950/10"
    : `${tierMeta.border} ${tierMeta.bg}`;
  const modalBorderClass = isDistressed || locker.alertLevel === "critical"
    ? "border-red-500/30"
    : locker.alertLevel === "warning"
    ? "border-yellow-400/25"
    : tierMeta.border;

  // Build alertSlots map from fetched alert data
  const alertSlots: AlertSlotMap = new Map(
    alerts
      .filter(a => a.slotIndex != null)
      .map(a => [a.slotIndex!, { severity: a.severity, alertType: a.alertType, message: a.message }])
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      <div className={`relative w-full max-w-4xl max-h-[90vh] bg-black border ${modalBorderClass} rounded-2xl shadow-2xl flex flex-col overflow-hidden`}>

        {/* Header */}
        <div className={`shrink-0 flex items-center justify-between p-5 border-b border-white/10 ${headerBorderClass}`}>
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-xl border flex items-center justify-center
              ${isDistressed || locker.alertLevel === "critical" ? "bg-red-500/20 border-red-500/30"
              : locker.alertLevel === "warning"                  ? "bg-yellow-500/15 border-yellow-400/40"
              : `${tierMeta.bg} ${tierMeta.border}`}`}>
              {isDistressed || locker.alertLevel === "critical"
                ? <ShieldAlert className="h-5 w-5 text-red-500" />
                : locker.alertLevel === "warning"
                ? <ShieldAlert className="h-5 w-5 text-yellow-400" />
                : <Shield className={`h-5 w-5 ${tierMeta.textColor}`} />
              }
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-white font-mono">{locker.externalId}</h2>
                <Badge variant="outline" className={`text-[10px] border ${statusMeta.badgeClass} ${statusMeta.pulse ? "animate-pulse" : ""}`}>
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
            <div className={`border rounded-xl p-4 ${hasAlerts ? (locker.alertLevel === "critical" ? "bg-red-950/20 border-red-500/20" : "bg-yellow-950/15 border-yellow-400/20") : "bg-white/5 border-white/10"}`}>
              <p className="text-xs text-gray-500 mb-1">Active Alerts</p>
              <p className={`text-2xl font-mono ${locker.alertLevel === "critical" ? "text-red-400" : locker.alertLevel === "warning" ? "text-yellow-400" : "text-white"}`}>
                {locker.alertCount ?? 0}
              </p>
              <p className="text-[10px] text-gray-600 mt-1">
                {locker.alertLevel === "critical" ? "requires immediate action" : locker.alertLevel === "warning" ? "review recommended" : "no active alerts"}
              </p>
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
                  isDistressed   ? "bg-red-500 animate-pulse" :
                  fillPct >= 90  ? "bg-yellow-400" :
                  locker.tier === 1 ? "bg-monad-purple" :
                  locker.tier === 3 ? "bg-blue-400" :
                  "bg-solana-green"
                }`}
                style={{ width: `${fillPct}%` }}
              />
            </div>
          </div>

          {/* Distressed diagnostics (locker-wide circuit breaker) */}
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
                    <p className="text-2xl font-mono text-red-400">
                      {alertSlots.size > 0 ? alertSlots.size : 14}
                      <span className="text-sm text-gray-500"> / {locker.capacity}</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Locked TVL at Risk</p>
                    <p className="text-xl font-mono text-white">—</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Vault-level alert drill-down */}
          {hasAlerts && (
            <VaultAlertPanel alerts={alerts} loading={alertsLoading} />
          )}

          {/* Healthy-locker actions */}
          {!isDistressed && !hasAlerts && (
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
            alertSlots={alertSlots}
          />
        </div>
      </div>
    </div>
  );
}
