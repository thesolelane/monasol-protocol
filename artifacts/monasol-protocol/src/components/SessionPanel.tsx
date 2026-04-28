import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Play,
  Square,
  Clock,
  Wallet,
  Loader2,
  CheckCircle,
  ChevronDown,
} from "lucide-react";

interface ApiSession {
  sessionId: string;
  vaultId: string;
  nftMint: string;
  authorizedAddress: string;
  label: string;
  openedAt: number;
  expiresAt: number;
  status: string;
}

interface SessionPanelProps {
  vaultId: string;
  nftMint: string;
  nftName: string;
}

const DURATION_OPTIONS = [
  { label: "1 Hour",  ms: 60 * 60 * 1000 },
  { label: "8 Hours", ms: 8 * 60 * 60 * 1000 },
  { label: "24 Hours",ms: 24 * 60 * 60 * 1000 },
  { label: "7 Days",  ms: 7 * 24 * 60 * 60 * 1000 },
];

function formatTimeLeft(ms: number): string {
  if (ms <= 0) return "Expired";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  if (h > 0) return `${h}h ${m}m remaining`;
  if (m > 0) return `${m}m ${s}s remaining`;
  return `${s}s remaining`;
}

export function SessionPanel({ vaultId, nftMint, nftName }: SessionPanelProps) {
  const [session, setSession] = useState<ApiSession | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loading, setLoading] = useState<"open" | "close" | null>(null);
  const [success, setSuccess] = useState<"opened" | "closed" | null>(null);

  const [durationIdx, setDurationIdx] = useState(0);
  const [authAddress, setAuthAddress] = useState("");
  const [sessionLabel, setSessionLabel] = useState("");
  const [durationOpen, setDurationOpen] = useState(false);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(iv);
  }, []);

  // Load persisted session on mount / vault switch
  useEffect(() => {
    if (!vaultId) return;
    setSession(null);
    setSuccess(null);
    setAuthAddress("");
    setSessionLabel("");
    setDurationIdx(0);
    setLoadingInitial(true);

    fetch(`/api/sessions/${encodeURIComponent(vaultId)}?nftMint=${encodeURIComponent(nftMint)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && (data.status === "open" || data.status === "expired")) {
          setSession(data);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingInitial(false));
  }, [vaultId, nftMint]);

  const timeLeft = session ? session.expiresAt - now : 0;
  const totalDuration = session ? session.expiresAt - session.openedAt : 1;
  const pct = session ? Math.max(0, timeLeft / totalDuration) : 0;
  const expired = session && timeLeft <= 0;

  async function handleOpen() {
    setLoading("open");
    setSuccess(null);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vaultId,
          nftMint,
          authorizedAddress: authAddress.trim() || "",
          label: sessionLabel.trim() || "",
          durationMs: DURATION_OPTIONS[durationIdx].ms,
        }),
      });
      if (!res.ok) throw new Error("Failed to open session");
      const data: ApiSession = await res.json();
      setSession(data);
      setSuccess("opened");
      setTimeout(() => setSuccess(null), 3_000);
    } catch {
      // silently fail — UI stays on form
    } finally {
      setLoading(null);
    }
  }

  async function handleClose() {
    setLoading("close");
    setSuccess(null);
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(vaultId)}?nftMint=${encodeURIComponent(nftMint)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to close session");
      setSession(null);
      setAuthAddress("");
      setSessionLabel("");
      setSuccess("closed");
      setTimeout(() => setSuccess(null), 3_000);
    } catch {
      // silently fail — keep session visible
    } finally {
      setLoading(null);
    }
  }

  const durations = session
    ? DURATION_OPTIONS.find(d => Math.abs(d.ms - (session.expiresAt - session.openedAt)) < 60_000)?.label ?? "Custom"
    : undefined;

  return (
    <div className="glass-panel rounded-2xl p-6 sm:p-8 relative overflow-hidden mt-6">
      <div className="absolute top-0 right-0 w-56 h-56 bg-monad-purple/5 blur-[80px] rounded-full pointer-events-none -translate-y-1/2 translate-x-1/2" />

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-xl ${session && !expired ? "bg-monad-purple/20 text-monad-purple" : "bg-white/5 text-gray-500"}`}>
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold text-white">Sessions</h2>
            <p className="text-xs text-gray-500 truncate max-w-[180px]">{vaultId}</p>
          </div>
        </div>

        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold ${
          loadingInitial
            ? "bg-white/5 border-white/10 text-gray-600"
            : session && !expired
            ? "bg-monad-purple/20 border-monad-purple/40 text-monad-purple"
            : expired
            ? "bg-red-500/10 border-red-500/20 text-red-400"
            : "bg-white/5 border-white/10 text-gray-500"
        }`}>
          <div className={`h-1.5 w-1.5 rounded-full ${session && !expired ? "bg-monad-purple animate-pulse" : "bg-current"}`} />
          {loadingInitial ? "…" : session && !expired ? "OPEN" : expired ? "EXPIRED" : "CLOSED"}
        </div>
      </div>

      {/* Initial load skeleton */}
      {loadingInitial && (
        <div className="space-y-3 animate-pulse">
          <div className="h-10 rounded-lg bg-white/5" />
          <div className="h-10 rounded-lg bg-white/5" />
          <div className="h-11 rounded-lg bg-white/5" />
        </div>
      )}

      {!loadingInitial && (
        <AnimatePresence mode="wait">
          {/* ── Active session ── */}
          {session && !expired && (
            <motion.div key="active" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="space-y-4">
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                  <span>{formatTimeLeft(timeLeft)}</span>
                  <span>{Math.round(pct * 100)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <motion.div className="h-full rounded-full bg-monad-purple" style={{ width: `${pct * 100}%` }} transition={{ duration: 0.5 }} />
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 divide-y divide-white/5 text-sm">
                <div className="px-4 py-2.5 flex justify-between">
                  <span className="text-gray-500">Session ID</span>
                  <span className="font-mono text-white">{session.sessionId}</span>
                </div>
                <div className="px-4 py-2.5 flex justify-between">
                  <span className="text-gray-500">Label</span>
                  <span className="text-white truncate max-w-[160px]">{session.label}</span>
                </div>
                <div className="px-4 py-2.5 flex justify-between">
                  <span className="text-gray-500">Authorized</span>
                  <span className="font-mono text-solana-green truncate max-w-[160px]">{session.authorizedAddress}</span>
                </div>
                <div className="px-4 py-2.5 flex justify-between">
                  <span className="text-gray-500">Duration</span>
                  <span className="text-white">{durations}</span>
                </div>
                <div className="px-4 py-2.5 flex justify-between">
                  <span className="text-gray-500">NFT key</span>
                  <span className="text-solana-green text-xs truncate max-w-[140px]">{nftName}</span>
                </div>
              </div>

              <AnimatePresence>
                {success === "opened" && (
                  <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="flex items-center gap-2 text-xs text-monad-purple">
                    <CheckCircle className="h-3.5 w-3.5" /> Session opened and saved
                  </motion.div>
                )}
              </AnimatePresence>

              <Button onClick={handleClose} disabled={loading === "close"}
                className="w-full h-11 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 font-bold">
                {loading === "close"
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Closing session...</>
                  : <><Square className="h-4 w-4 mr-2 fill-red-400" /> Close Session</>}
              </Button>
            </motion.div>
          )}

          {/* ── Expired ── */}
          {expired && (
            <motion.div key="expired" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 text-center">
                <p className="text-sm text-red-400 font-semibold mb-1">Session expired</p>
                <p className="text-xs text-gray-500">Close it on-chain to release resources, then open a new one.</p>
              </div>
              <Button onClick={handleClose} disabled={loading === "close"}
                className="w-full h-11 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 font-bold">
                {loading === "close"
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Closing...</>
                  : <><Square className="h-4 w-4 mr-2 fill-red-400" /> Close Expired Session</>}
              </Button>
            </motion.div>
          )}

          {/* ── Open session form ── */}
          {!session && (
            <motion.div key="form" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="space-y-4">
              {/* Duration picker */}
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-gray-400">Session Duration</Label>
                <div className="relative">
                  <button type="button" data-testid="button-session-duration"
                    onClick={() => setDurationOpen(v => !v)}
                    className="w-full h-11 px-4 flex items-center justify-between rounded-md border border-white/10 bg-black/20 text-sm text-white hover:border-monad-purple/40 transition-colors">
                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-monad-purple" />
                      {DURATION_OPTIONS[durationIdx].label}
                    </div>
                    <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${durationOpen ? "rotate-180" : ""}`} />
                  </button>
                  <AnimatePresence>
                    {durationOpen && (
                      <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                        className="absolute z-20 top-full mt-1 w-full rounded-xl border border-white/10 bg-black/90 backdrop-blur-md overflow-hidden shadow-xl">
                        {DURATION_OPTIONS.map((opt, i) => (
                          <button key={i} type="button" data-testid={`option-duration-${i}`}
                            onClick={() => { setDurationIdx(i); setDurationOpen(false); }}
                            className={`w-full px-4 py-2.5 text-left text-sm flex items-center gap-2 hover:bg-monad-purple/20 transition-colors ${i === durationIdx ? "text-monad-purple font-semibold" : "text-gray-300"}`}>
                            <Clock className="h-3.5 w-3.5 shrink-0" />
                            {opt.label}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Authorized address */}
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-gray-400">
                  Authorized Address
                  <span className="normal-case text-gray-600 ml-1">(optional — leave blank to allow any key holder)</span>
                </Label>
                <div className="relative">
                  <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-600" />
                  <Input data-testid="input-session-auth-address"
                    placeholder="0x... or any Solana address"
                    value={authAddress}
                    onChange={e => setAuthAddress(e.target.value)}
                    className="bg-black/20 border-white/10 h-11 pl-10 font-mono text-sm focus-visible:ring-monad-purple" />
                </div>
              </div>

              {/* Session label */}
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-gray-400">
                  Session Label
                  <span className="normal-case text-gray-600 ml-1">(optional)</span>
                </Label>
                <Input data-testid="input-session-label"
                  placeholder="e.g. DeFi bridge, collateral proof…"
                  value={sessionLabel}
                  onChange={e => setSessionLabel(e.target.value)}
                  className="bg-black/20 border-white/10 h-11 text-sm focus-visible:ring-monad-purple" />
              </div>

              <AnimatePresence>
                {success === "closed" && (
                  <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="flex items-center gap-2 text-xs text-gray-400">
                    <CheckCircle className="h-3.5 w-3.5 text-solana-green" /> Session closed and removed
                  </motion.div>
                )}
              </AnimatePresence>

              <Button data-testid="button-open-session" onClick={handleOpen} disabled={loading === "open"}
                className="w-full h-11 bg-monad-purple hover:bg-monad-purple/90 text-black font-bold shadow-[0_0_20px_-5px_rgba(130,71,229,0.5)]">
                {loading === "open"
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Opening session...</>
                  : <><Play className="h-4 w-4 mr-2 fill-black" /> Open Session</>}
              </Button>

              <p className="text-[11px] text-gray-600 text-center leading-relaxed">
                Calls <span className="font-mono text-gray-500">open_session</span> on the Monad Locker contract.
                Sessions persist across page refreshes.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}
