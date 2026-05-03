import { useEffect, useState } from "react";
import {
  Shield, ShieldAlert, X, Activity, Server, AlertTriangle,
  RotateCcw, CheckCircle, Layers, ArrowRight, Clock, Zap, Filter,
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

// ── Tier / Status meta ────────────────────────────────────────────────────
const TIER_META: Record<number, { label: string; desc: string; border: string; bg: string; textColor: string }> = {
  1: { label: "Tier 1", desc: "High Capacity",  border: "border-monad-purple/30", bg: "bg-monad-purple/5",  textColor: "text-monad-purple" },
  2: { label: "Tier 2", desc: "Standard",        border: "border-solana-green/30", bg: "bg-solana-green/5",  textColor: "text-solana-green" },
  3: { label: "Tier 3", desc: "Institutional",   border: "border-blue-400/30",     bg: "bg-blue-400/5",      textColor: "text-blue-400"    },
};

const STATUS_META: Record<string, { label: string; badgeClass: string; pulse?: boolean }> = {
  full:       { label: "Full",       badgeClass: "bg-white/10 text-white border-white/20" },
  filling:    { label: "Filling",    badgeClass: "bg-green-500/10 text-green-400 border-green-500/20" },
  healthy:    { label: "Healthy",    badgeClass: "bg-green-500/10 text-green-400 border-green-500/20" },
  distressed: { label: "Distressed", badgeClass: "bg-red-500 text-white border-red-600", pulse: true },
};

// ── Threat taxonomy ───────────────────────────────────────────────────────
const ALERT_CATEGORY: Record<string, string> = {
  state_mismatch: "State & Consensus", merkle_fraud:     "State & Consensus",
  finality_exploit:"State & Consensus", double_spend:    "State & Consensus",
  intrusion:      "Access & Intrusion", key_compromise:  "Access & Intrusion",
  sig_replay:     "Access & Intrusion", phishing_probe:  "Access & Intrusion",
  front_run:      "MEV & Transaction",  sandwich_attack: "MEV & Transaction",
  flashloan_probe:"MEV & Transaction",  gas_manipulation:"MEV & Transaction",
  storage_collision:"Storage & PDA",   init_error:      "Storage & PDA",
  account_hijack: "Storage & PDA",     data_corruption: "Storage & PDA",
  oracle_failure: "Oracle & RPC",      rpc_timeout:     "Oracle & RPC",
  stale_price:    "Oracle & RPC",      oracle_sybil:    "Oracle & RPC",
  honeypot:       "Circuit Breaker",   circuit_breaker: "Circuit Breaker",
  fault:          "Circuit Breaker",   error:           "Circuit Breaker",
};

const CATEGORY_META: Record<string, { textColor: string; dotColor: string; activeBg: string; activeBorder: string }> = {
  "State & Consensus": { textColor: "text-orange-400", dotColor: "bg-orange-500",  activeBg: "bg-orange-500/15", activeBorder: "border-orange-500/40" },
  "Access & Intrusion":{ textColor: "text-red-400",    dotColor: "bg-red-500",     activeBg: "bg-red-500/15",    activeBorder: "border-red-500/40"    },
  "MEV & Transaction": { textColor: "text-yellow-400", dotColor: "bg-yellow-400",  activeBg: "bg-yellow-500/12", activeBorder: "border-yellow-400/40" },
  "Storage & PDA":     { textColor: "text-blue-400",   dotColor: "bg-blue-400",    activeBg: "bg-blue-500/12",   activeBorder: "border-blue-400/40"   },
  "Oracle & RPC":      { textColor: "text-purple-400", dotColor: "bg-purple-400",  activeBg: "bg-purple-500/12", activeBorder: "border-purple-400/40" },
  "Circuit Breaker":   { textColor: "text-gray-400",   dotColor: "bg-gray-400",    activeBg: "bg-gray-500/15",   activeBorder: "border-gray-400/40"   },
};

const ALERT_TYPE_LABEL: Record<string, string> = {
  state_mismatch: "State Mismatch",    merkle_fraud:     "Merkle Fraud",
  finality_exploit:"Finality Exploit", double_spend:     "Double Spend",
  intrusion:      "Unauthorized Access",key_compromise:  "Key Compromise",
  sig_replay:     "Signature Replay",  phishing_probe:   "Phishing Probe",
  front_run:      "Front-Run",         sandwich_attack:  "Sandwich Attack",
  flashloan_probe:"Flash Loan Probe",  gas_manipulation: "Gas Manipulation",
  storage_collision:"Storage Collision",init_error:      "Init Error",
  account_hijack: "Account Hijack",    data_corruption:  "Data Corruption",
  oracle_failure: "Oracle Failure",    rpc_timeout:      "RPC Timeout",
  stale_price:    "Stale Price Feed",  oracle_sybil:     "Oracle Sybil",
  honeypot:       "Honeypot",          circuit_breaker:  "Circuit Break",
  fault:          "Vault Fault",       error:            "General Error",
};

const NEXT_ACTION_LABEL: Record<string, string> = {
  state_mismatch: "Force State Sync",     merkle_fraud:    "Reject & Flag",
  finality_exploit:"Pause Bridge",        double_spend:    "Halt & Rollback",
  intrusion:      "Quarantine Vault",     key_compromise:  "Revoke NFT Key",
  sig_replay:     "Rotate Keypair",       phishing_probe:  "Flag Source",
  front_run:      "Review Block History", sandwich_attack: "Rotate RPC Route",
  flashloan_probe:"Add Flash Guard",      gas_manipulation:"Set Gas Floor",
  storage_collision:"Remap PDA",         init_error:      "Re-deploy Vault",
  account_hijack: "Freeze & Verify",      data_corruption: "Re-derive State",
  oracle_failure: "Restart Oracle",       rpc_timeout:     "Rotate RPC",
  stale_price:    "Reject Settlement",    oracle_sybil:    "Pause & Audit Feed",
  honeypot:       "Await Clearance",      circuit_breaker: "Reset Circuit",
  fault:          "Run Diagnostics",      error:           "Review Tx Logs",
};

// ── Helpers ───────────────────────────────────────────────────────────────
function fmtAddr(addr: string): string {
  return addr.length <= 14 ? addr : `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return hrs < 24 ? `${hrs}h ago` : `${Math.floor(hrs / 24)}d ago`;
}

// ── Alert Panel with category filters ────────────────────────────────────
function VaultAlertPanel({ alerts, loading }: { alerts: LockerAlert[]; loading: boolean }) {
  const [activeCategories, setActiveCategories] = useState<Set<string> | null>(null);

  // Derive categories present in this locker's alerts
  const presentCategories = Array.from(
    new Set(alerts.map(a => ALERT_CATEGORY[a.alertType] ?? "Other"))
  ).sort();

  // Null = "All" (default). On first load with real alerts, stay on All.
  const isAllActive = activeCategories === null;

  function toggleCategory(cat: string) {
    if (isAllActive) {
      setActiveCategories(new Set([cat]));
    } else {
      const next = new Set(activeCategories);
      if (next.has(cat)) {
        next.delete(cat);
        setActiveCategories(next.size === 0 ? null : next);
      } else {
        next.add(cat);
        // If all categories are now selected, go back to All
        setActiveCategories(next.size === presentCategories.length ? null : next);
      }
    }
  }

  const filteredAlerts = isAllActive
    ? alerts
    : alerts.filter(a => activeCategories!.has(ALERT_CATEGORY[a.alertType] ?? "Other"));

  const criticals = alerts.filter(a => a.severity === "critical").length;
  const warnings  = alerts.filter(a => a.severity === "warning").length;

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

      {/* Header + severity counts */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Zap className="h-4 w-4 text-red-400" />
          Active Vault Alerts
        </h3>
        <div className="flex gap-2">
          {criticals > 0 && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/30 text-red-400 animate-pulse">
              {criticals} CRITICAL
            </span>
          )}
          {warnings > 0 && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-yellow-500/10 border border-yellow-400/30 text-yellow-400">
              {warnings} WARNING
            </span>
          )}
        </div>
      </div>

      {/* Category filter chips */}
      {presentCategories.length > 1 && (
        <div className="flex flex-wrap gap-1.5 items-center">
          <Filter className="h-3 w-3 text-gray-600 shrink-0" />
          {/* All chip */}
          <button
            onClick={() => setActiveCategories(null)}
            className={`text-[10px] font-mono px-2.5 py-1 rounded-full border transition-colors ${
              isAllActive
                ? "bg-white/15 border-white/30 text-white"
                : "bg-white/5 border-white/10 text-gray-500 hover:border-white/20 hover:text-gray-400"
            }`}
          >
            All ({alerts.length})
          </button>
          {presentCategories.map(cat => {
            const meta = CATEGORY_META[cat] ?? CATEGORY_META["Circuit Breaker"];
            const count = alerts.filter(a => (ALERT_CATEGORY[a.alertType] ?? "Other") === cat).length;
            const isActive = !isAllActive && activeCategories!.has(cat);
            return (
              <button
                key={cat}
                onClick={() => toggleCategory(cat)}
                className={`text-[10px] font-mono px-2.5 py-1 rounded-full border transition-colors flex items-center gap-1.5 ${
                  isActive
                    ? `${meta.activeBg} ${meta.activeBorder} ${meta.textColor}`
                    : "bg-white/5 border-white/10 text-gray-500 hover:border-white/20 hover:text-gray-400"
                }`}
              >
                <div className={`w-1.5 h-1.5 rounded-full ${isActive ? meta.dotColor : "bg-gray-600"}`} />
                {cat} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Alert rows */}
      <div className="space-y-2">
        {filteredAlerts.map(alert => {
          const isCrit  = alert.severity === "critical";
          const cat     = ALERT_CATEGORY[alert.alertType] ?? "Circuit Breaker";
          const catMeta = CATEGORY_META[cat] ?? CATEGORY_META["Circuit Breaker"];
          const borderCls = isCrit
            ? "border-red-500/25 bg-red-950/15 hover:bg-red-950/25"
            : "border-yellow-400/20 bg-yellow-950/10 hover:bg-yellow-950/20";
          const dotCls   = isCrit ? "bg-red-500 animate-pulse" : "bg-yellow-400";
          const typeCls  = isCrit
            ? "text-red-400 border-red-500/30 bg-red-500/10"
            : "text-yellow-400 border-yellow-400/30 bg-yellow-500/10";
          const actionLabel = NEXT_ACTION_LABEL[alert.alertType] ?? "Investigate";

          return (
            <div key={alert.id} className={`border rounded-xl p-4 transition-colors ${borderCls}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className={`mt-1 h-2 w-2 rounded-full shrink-0 ${dotCls}`} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      {/* Category label */}
                      <span className={`text-[9px] font-semibold uppercase tracking-wider ${catMeta.textColor}`}>
                        {cat}
                      </span>
                      <span className="text-gray-700">·</span>
                      {/* Slot */}
                      {alert.slotIndex != null && (
                        <span className="text-xs font-mono text-white bg-white/10 border border-white/15 px-1.5 py-0.5 rounded">
                          Slot #{alert.slotIndex}
                        </span>
                      )}
                      {/* Alert type */}
                      <Badge variant="outline" className={`text-[10px] border ${typeCls}`}>
                        {ALERT_TYPE_LABEL[alert.alertType] ?? alert.alertType.replace(/_/g, " ").toUpperCase()}
                      </Badge>
                      {/* Time */}
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
                    <div className={`text-[11px] leading-relaxed rounded-lg px-3 py-2 border ${
                      isCrit
                        ? "bg-red-950/20 border-red-500/20 text-red-300"
                        : "bg-yellow-950/15 border-yellow-400/20 text-yellow-200"
                    }`}>
                      <span className={`font-semibold ${isCrit ? "text-red-400" : "text-yellow-400"}`}>
                        Next Step:{" "}
                      </span>
                      {alert.nextStep}
                    </div>
                  </div>
                </div>
                {/* Action button */}
                <Button
                  size="sm"
                  variant="outline"
                  className={`shrink-0 text-[10px] h-7 px-2.5 ${
                    isCrit
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

      {/* Empty state after filter */}
      {filteredAlerts.length === 0 && (
        <p className="text-xs text-gray-600 text-center py-4">No alerts match the selected filter.</p>
      )}
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

  return (
    <div>
      <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
        <Server className="h-4 w-4 text-gray-400" />
        Vault Matrix (Index 0–{capacity - 1})
        {alertSlots.size > 0 && (
          <span className="text-[10px] font-mono text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full ml-1">
            {alertSlots.size} slot{alertSlots.size > 1 ? "s" : ""} flagged
          </span>
        )}
      </h3>
      <div className="bg-black/50 border border-white/5 rounded-xl p-4">
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: capacity }).map((_, i) => {
            const alertInfo  = alertSlots.get(i);
            const isCritAlert = alertInfo?.severity === "critical";
            const isWarnAlert = alertInfo?.severity === "warning";
            const isOccupied  = i < usedSlots && !alertInfo;
            const isEmpty     = i >= usedSlots && !alertInfo;

            let cellClass: string;
            if (isCritAlert) {
              cellClass = "bg-red-500 border-red-400 z-10 animate-pulse";
            } else if (isWarnAlert) {
              cellClass = "bg-yellow-400/80 border-yellow-300 z-10";
            } else if (isEmpty) {
              cellClass = "bg-white/5 border-white/5";
            } else if (isOccupied) {
              cellClass = tier === 1
                ? "bg-monad-purple/30 border-monad-purple/40 hover:bg-monad-purple/50"
                : tier === 3
                ? "bg-blue-400/20 border-blue-400/30 hover:bg-blue-400/40"
                : "bg-solana-green/20 border-solana-green/30 hover:bg-solana-green/40";
            } else {
              cellClass = "bg-white/5 border-white/5";
            }

            return (
              <div
                key={i}
                className={`aspect-square rounded-[2px] border group relative cursor-pointer ${cellClass}`}
                title={
                  alertInfo
                    ? `Vault #${i} — ${alertInfo.severity.toUpperCase()}: ${ALERT_TYPE_LABEL[alertInfo.alertType] ?? alertInfo.alertType}${alertInfo.message ? ` — ${alertInfo.message}` : ""}`
                    : `Vault #${i} (${isEmpty ? "Empty" : "Occupied"})`
                }
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
            <div className={`w-2 h-2 ${
              tier === 1 ? "bg-monad-purple/40 border border-monad-purple/60"
              : tier === 3 ? "bg-blue-400/30 border border-blue-400/40"
              : "bg-solana-green/30 border border-solana-green/50"
            }`} />
            Occupied
          </span>
          <span className="flex items-center gap-1.5"><div className="w-2 h-2 bg-white/5 border border-white/10" /> Empty</span>
          {alertSlots.size > 0 && (
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
  const [alerts, setAlerts]               = useState<LockerAlert[]>([]);
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

  const isDistressed  = locker.status === "distressed";
  const tierMeta      = TIER_META[locker.tier] ?? TIER_META[1];
  const statusMeta    = STATUS_META[locker.status] ?? { label: locker.status, badgeClass: "bg-white/10 text-gray-300 border-white/20" };
  const fillPct       = locker.capacity > 0 ? Math.round((locker.usedSlots / locker.capacity) * 100) : 0;
  const freeSlots     = locker.capacity - locker.usedSlots;
  const hasAlerts     = (locker.alertLevel && locker.alertLevel !== "none") || isDistressed;

  const headerBorderClass =
    isDistressed               ? "border-red-500/30 bg-red-500/5"
    : locker.alertLevel === "critical" ? "border-red-500/20 bg-red-950/10"
    : locker.alertLevel === "warning"  ? "border-yellow-400/20 bg-yellow-950/10"
    : `${tierMeta.border} ${tierMeta.bg}`;

  const modalBorderClass =
    isDistressed || locker.alertLevel === "critical" ? "border-red-500/30"
    : locker.alertLevel === "warning"                ? "border-yellow-400/25"
    : tierMeta.border;

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
            <div className={`h-10 w-10 rounded-xl border flex items-center justify-center ${
              isDistressed || locker.alertLevel === "critical" ? "bg-red-500/20 border-red-500/30"
              : locker.alertLevel === "warning"                ? "bg-yellow-500/15 border-yellow-400/40"
              : `${tierMeta.bg} ${tierMeta.border}`
            }`}>
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
            <div className={`border rounded-xl p-4 ${
              hasAlerts
                ? locker.alertLevel === "critical"
                  ? "bg-red-950/20 border-red-500/20"
                  : "bg-yellow-950/15 border-yellow-400/20"
                : "bg-white/5 border-white/10"
            }`}>
              <p className="text-xs text-gray-500 mb-1">Active Alerts</p>
              <p className={`text-2xl font-mono ${
                locker.alertLevel === "critical" ? "text-red-400"
                : locker.alertLevel === "warning" ? "text-yellow-400"
                : "text-white"
              }`}>
                {locker.alertCount ?? 0}
              </p>
              <p className="text-[10px] text-gray-600 mt-1">
                {locker.alertLevel === "critical" ? "requires immediate action"
                : locker.alertLevel === "warning"  ? "review recommended"
                : "no active alerts"}
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
                  isDistressed   ? "bg-red-500 animate-pulse"
                  : fillPct >= 90 ? "bg-yellow-400"
                  : locker.tier === 1 ? "bg-monad-purple"
                  : locker.tier === 3 ? "bg-blue-400"
                  : "bg-solana-green"
                }`}
                style={{ width: `${fillPct}%` }}
              />
            </div>
          </div>

          {/* Distressed diagnostics */}
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
                      {alertSlots.size > 0 ? alertSlots.size : "—"}
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

          {/* Vault-level alert drill-down with category filters */}
          {hasAlerts && (
            <VaultAlertPanel alerts={alerts} loading={alertsLoading} />
          )}

          {/* Healthy locker management */}
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
