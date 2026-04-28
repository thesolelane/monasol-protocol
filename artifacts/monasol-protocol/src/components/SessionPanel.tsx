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
  History,
  Shield,
  Info,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";

interface ApiSession {
  id: string;
  sessionId: string;
  vaultId: string;
  nftMint: string;
  authorizedAddress: string;
  label: string;
  openedAt: number;
  expiresAt: number;
  status: string;
}

interface HistoryEntry {
  id: string;
  sessionId: string;
  label: string;
  authorizedAddress: string;
  openedAt: string;
  closedAt: string;
  durationMs: number;
  shareWithProtocol: boolean;
}

interface SessionPanelProps {
  vaultId: string;
  nftMint: string;
  nftName: string;
  ownerWallet: string;
}

const DURATION_OPTIONS = [
  { label: "1 Hour",   ms: 60 * 60 * 1000 },
  { label: "8 Hours",  ms: 8 * 60 * 60 * 1000 },
  { label: "24 Hours", ms: 24 * 60 * 60 * 1000 },
  { label: "7 Days",   ms: 7 * 24 * 60 * 60 * 1000 },
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

function formatDuration(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d`;
  if (h > 0) return `${h}h`;
  const m = Math.floor(ms / 60_000);
  return `${m}m`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function shortAddr(addr: string): string {
  if (addr === "Any holder") return addr;
  if (addr.length <= 16) return addr;
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

export function SessionPanel({ vaultId, nftMint, nftName, ownerWallet }: SessionPanelProps) {
  const [session, setSession] = useState<ApiSession | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loading, setLoading] = useState<"open" | "close" | null>(null);
  const [success, setSuccess] = useState<"opened" | "closed" | null>(null);

  const [durationIdx, setDurationIdx] = useState(0);
  const [authAddress, setAuthAddress] = useState("");
  const [sessionLabel, setSessionLabel] = useState("");
  const [durationOpen, setDurationOpen] = useState(false);

  // History section
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [sharingLoading, setSharingLoading] = useState(false);
  const [sharingDisclosureOpen, setSharingDisclosureOpen] = useState(false);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(iv);
  }, []);

  // Load persisted session on mount / vault+nft switch
  useEffect(() => {
    if (!vaultId) return;
    setSession(null);
    setSuccess(null);
    setAuthAddress("");
    setSessionLabel("");
    setDurationIdx(0);
    setLoadingInitial(true);
    setHistoryOpen(false);
    setHistory([]);
    setHistoryError(null);
    setSharing(false);

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

  // Fetch history when panel opens
  useEffect(() => {
    if (!historyOpen || !vaultId || !ownerWallet) return;
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError(null);
    fetch(`/api/sessions/${encodeURIComponent(vaultId)}/history?wallet=${encodeURIComponent(ownerWallet)}`)
      .then(async r => {
        if (r.status === 403) throw new Error("access_denied");
        if (!r.ok) throw new Error("fetch_failed");
        return r.json() as Promise<HistoryEntry[]>;
      })
      .then(data => {
        if (cancelled) return;
        setHistory(data);
        if (data.length > 0) setSharing(data[0].shareWithProtocol);
      })
      .catch(err => {
        if (cancelled) return;
        setHistoryError(err.message === "access_denied" ? "Access denied." : "Failed to load history.");
      })
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [historyOpen, vaultId, ownerWallet]);

  const timeLeft = session ? session.expiresAt - now : 0;
  const totalDuration = session ? session.expiresAt - session.openedAt : 1;
  const pct = session ? Math.max(0, timeLeft / totalDuration) : 0;
  const expired = session && timeLeft <= 0;
  const durations = session
    ? DURATION_OPTIONS.find(d => Math.abs(d.ms - (session.expiresAt - session.openedAt)) < 60_000)?.label ?? "Custom"
    : undefined;

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
    if (!session) return;
    const closedAt = Date.now();
    setLoading("close");
    setSuccess(null);
    try {
      const res = await fetch(
        `/api/sessions/${encodeURIComponent(vaultId)}?nftMint=${encodeURIComponent(nftMint)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Failed to close session");

      // Record to history (fire-and-forget)
      if (ownerWallet) {
        fetch(`/api/sessions/${encodeURIComponent(vaultId)}/history`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wallet: ownerWallet,
            sessionId: session.sessionId,
            label: session.label,
            authorizedAddress: session.authorizedAddress,
            openedAt: new Date(session.openedAt).toISOString(),
            closedAt: new Date(closedAt).toISOString(),
            durationMs: session.expiresAt - session.openedAt,
          }),
        }).catch(() => {});
      }

      setSession(null);
      setAuthAddress("");
      setSessionLabel("");
      setSuccess("closed");
      if (historyOpen) setHistoryOpen(false);
      setTimeout(() => setSuccess(null), 3_000);
    } catch {
      // silently fail — keep session visible
    } finally {
      setLoading(null);
    }
  }

  async function handleSharingToggle() {
    const next = !sharing;
    setSharingLoading(true);
    try {
      const r = await fetch(`/api/sessions/${encodeURIComponent(vaultId)}/sharing`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: ownerWallet, share: next }),
      });
      if (r.ok) {
        setSharing(next);
        setHistory(h => h.map(e => ({ ...e, shareWithProtocol: next })));
      }
    } catch {
      // silent — state stays unchanged
    } finally {
      setSharingLoading(false);
    }
  }

  return (
    <div className="space-y-3 mt-6">
      {/* ── Active session panel ── */}
      <div className="glass-panel rounded-2xl p-6 sm:p-8 relative overflow-hidden">
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
            {/* Active */}
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
                  <div className="px-4 py-2.5 flex justify-between"><span className="text-gray-500">Session ID</span><span className="font-mono text-white">{session.sessionId}</span></div>
                  <div className="px-4 py-2.5 flex justify-between"><span className="text-gray-500">Label</span><span className="text-white truncate max-w-[160px]">{session.label}</span></div>
                  <div className="px-4 py-2.5 flex justify-between"><span className="text-gray-500">Authorized</span><span className="font-mono text-solana-green truncate max-w-[160px]">{session.authorizedAddress}</span></div>
                  <div className="px-4 py-2.5 flex justify-between"><span className="text-gray-500">Duration</span><span className="text-white">{durations}</span></div>
                  <div className="px-4 py-2.5 flex justify-between"><span className="text-gray-500">NFT key</span><span className="text-solana-green text-xs truncate max-w-[140px]">{nftName}</span></div>
                </div>

                <AnimatePresence>
                  {success === "opened" && (
                    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-2 text-xs text-monad-purple">
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

            {/* Expired */}
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

            {/* Open session form */}
            {!session && (
              <motion.div key="form" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="space-y-4">
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
                              <Clock className="h-3.5 w-3.5 shrink-0" />{opt.label}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

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
                    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-2 text-xs text-gray-400">
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

      {/* ── Session History panel ── */}
      {vaultId && (
        <div className="glass-panel rounded-2xl overflow-hidden">
          <button
            data-testid="button-toggle-history"
            onClick={() => setHistoryOpen(v => !v)}
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-white/5 text-gray-400">
                <History className="h-4 w-4" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-white">Session History</p>
                <p className="text-xs text-gray-600">Past sessions for this vault</p>
              </div>
            </div>
            <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform duration-200 ${historyOpen ? "rotate-180" : ""}`} />
          </button>

          <AnimatePresence initial={false}>
            {historyOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="px-6 pb-6 space-y-4 border-t border-white/5">

                  {/* Share with protocol toggle */}
                  <div className="mt-4 rounded-xl border border-white/10 bg-white/5 overflow-hidden">
                    <div className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <Shield className="h-4 w-4 text-monad-purple shrink-0" />
                        <div>
                          <p className="text-xs font-semibold text-white">Share aggregate data with the protocol</p>
                          <p className="text-[11px] text-gray-500">Optional — see below for details</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          data-testid="button-toggle-sharing"
                          onClick={handleSharingToggle}
                          disabled={sharingLoading}
                          className="text-monad-purple disabled:opacity-40 transition-opacity"
                          aria-label={sharing ? "Disable protocol sharing" : "Enable protocol sharing"}
                        >
                          {sharingLoading
                            ? <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
                            : sharing
                            ? <ToggleRight className="h-6 w-6" />
                            : <ToggleLeft className="h-6 w-6 text-gray-500" />
                          }
                        </button>
                        <button
                          data-testid="button-sharing-info"
                          onClick={() => setSharingDisclosureOpen(v => !v)}
                          className="text-gray-600 hover:text-gray-400 transition-colors"
                          aria-label="What is shared?"
                        >
                          <Info className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Disclosure */}
                    <AnimatePresence initial={false}>
                      {sharingDisclosureOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-4 border-t border-white/5 pt-3 space-y-3">
                            <p className="text-[11px] font-semibold text-monad-purple uppercase tracking-wider">What gets shared</p>
                            <ul className="space-y-1.5 text-[11px] text-gray-400 leading-relaxed">
                              <li className="flex gap-2">
                                <span className="text-monad-purple shrink-0 mt-0.5">•</span>
                                <span><span className="text-white font-medium">Total session count</span> — how many sessions this vault has had</span>
                              </li>
                              <li className="flex gap-2">
                                <span className="text-monad-purple shrink-0 mt-0.5">•</span>
                                <span><span className="text-white font-medium">Aggregate duration</span> — combined time across all sessions (no per-session breakdown)</span>
                              </li>
                              <li className="flex gap-2">
                                <span className="text-monad-purple shrink-0 mt-0.5">•</span>
                                <span><span className="text-white font-medium">Last activity date</span> — when the most recent session ended</span>
                              </li>
                            </ul>

                            <p className="text-[11px] font-semibold text-monad-purple uppercase tracking-wider pt-1">What is never shared</p>
                            <ul className="space-y-1.5 text-[11px] text-gray-400 leading-relaxed">
                              <li className="flex gap-2"><span className="text-red-400 shrink-0 mt-0.5">✕</span><span>Authorized wallet addresses</span></li>
                              <li className="flex gap-2"><span className="text-red-400 shrink-0 mt-0.5">✕</span><span>Session labels or descriptions</span></li>
                              <li className="flex gap-2"><span className="text-red-400 shrink-0 mt-0.5">✕</span><span>Individual session IDs or timestamps</span></li>
                              <li className="flex gap-2"><span className="text-red-400 shrink-0 mt-0.5">✕</span><span>Any information that could identify you or a counterparty</span></li>
                            </ul>

                            <p className="text-[11px] font-semibold text-monad-purple uppercase tracking-wider pt-1">How it's used</p>
                            <p className="text-[11px] text-gray-400 leading-relaxed">
                              Aggregate data helps the protocol monitor locker health, detect unusual utilization patterns,
                              and harden the system against abuse — entirely within the Monasol Protocol.
                              <span className="text-white font-medium"> This data is never sold, never shared with third parties,
                              and never leaves the protocol.</span> You can opt out at any time and the preference takes effect immediately.
                            </p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* History rows */}
                  {historyLoading && (
                    <div className="flex items-center justify-center py-6 gap-2 text-gray-500 text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading history…
                    </div>
                  )}

                  {historyError && (
                    <div data-testid="text-history-error" className="py-4 text-center text-xs text-red-400">{historyError}</div>
                  )}

                  {!historyLoading && !historyError && history.length === 0 && (
                    <div data-testid="text-history-empty" className="py-6 text-center text-xs text-gray-600">
                      No past sessions recorded for this vault yet.
                    </div>
                  )}

                  {!historyLoading && !historyError && history.length > 0 && (
                    <div className="rounded-xl border border-white/10 overflow-hidden">
                      <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 px-4 py-2 bg-white/5 text-[10px] uppercase tracking-wider text-gray-600 border-b border-white/5">
                        <span>Session</span>
                        <span>Authorized</span>
                        <span>Opened</span>
                        <span className="text-right">Duration</span>
                      </div>
                      <div className="divide-y divide-white/5">
                        {history.map((entry, i) => (
                          <div
                            key={entry.id}
                            data-testid={`row-session-history-${i}`}
                            className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 px-4 py-3 text-xs hover:bg-white/5 transition-colors"
                          >
                            <div className="min-w-0">
                              <p className="font-mono text-white truncate">{entry.sessionId}</p>
                              <p className="text-gray-600 truncate">{entry.label}</p>
                            </div>
                            <div className="min-w-0 flex items-center">
                              <span className={`font-mono truncate ${entry.authorizedAddress === "Any holder" ? "text-gray-500" : "text-solana-green"}`}>
                                {shortAddr(entry.authorizedAddress)}
                              </span>
                            </div>
                            <div className="min-w-0 flex items-center">
                              <span className="text-gray-400 truncate">{formatDate(entry.openedAt)}</span>
                            </div>
                            <div className="flex items-center justify-end">
                              <span className="text-monad-purple font-mono font-semibold">{formatDuration(entry.durationMs)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
