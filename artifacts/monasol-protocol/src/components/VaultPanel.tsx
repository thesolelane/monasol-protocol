import { useState, useRef } from "react";
import {
  Lock, Plus, Eye, EyeOff, Copy, Trash2, Check,
  KeyRound, ShieldAlert, ChevronDown, ChevronRight, Pencil, X,
} from "lucide-react";

const VAULT_SESSION_KEY = "monasol_vault_session";

interface VaultSecret { key: string; value: string; }
interface EnvEntry   { key: string; set: boolean; }

function getVaultToken(): string | null {
  try {
    const raw = sessionStorage.getItem(VAULT_SESSION_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as { token: string; expiresAt: number };
    return Date.now() < p.expiresAt ? p.token : null;
  } catch { return null; }
}
function storeVaultToken(token: string, expiresAt: number) {
  sessionStorage.setItem(VAULT_SESSION_KEY, JSON.stringify({ token, expiresAt }));
}

// ─── Login screen ─────────────────────────────────────────────────────────────
function VaultLogin({ onSuccess }: { onSuccess: (token: string) => void }) {
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/vault/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      const data = await res.json() as { token?: string; expiresAt?: number; error?: string };
      if (!res.ok || !data.token || !data.expiresAt) {
        setErr(data.error ?? "Invalid password");
        return;
      }
      storeVaultToken(data.token, data.expiresAt);
      onSuccess(data.token);
    } catch {
      setErr("Network error — try again");
    } finally {
      setLoading(false);
      setPw("");
    }
  }

  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="h-16 w-16 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
            <Lock className="h-8 w-8 text-yellow-400" />
          </div>
          <div className="text-center">
            <h2 className="text-xl font-bold text-white">Secrets Vault</h2>
            <p className="text-sm text-gray-500 mt-1">Owner access only · Enter vault password</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-black/40 border border-white/5 rounded-2xl p-6 space-y-4 backdrop-blur-sm">
          <div className="relative">
            <input
              type={show ? "text" : "password"}
              value={pw}
              onChange={e => setPw(e.target.value)}
              placeholder="Vault master password"
              className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500/40 transition-colors pr-10"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShow(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {err && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
              {err}
            </div>
          )}
          <button
            type="submit"
            disabled={loading || !pw}
            className="w-full bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/30 text-yellow-300 font-semibold text-sm rounded-xl py-2.5 transition-colors disabled:opacity-40"
          >
            {loading ? "Unlocking…" : "Unlock Vault"}
          </button>
        </form>

        <p className="text-center text-xs text-gray-600">
          Session expires after 4 hours · 3 attempts before lockout
        </p>
      </div>
    </div>
  );
}

// ─── Secret row ───────────────────────────────────────────────────────────────
function SecretRow({
  secret, token, onUpdate, onDelete,
}: {
  secret: VaultSecret;
  token: string;
  onUpdate: (key: string, value: string) => void;
  onDelete: (key: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(secret.value);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleReveal() { setRevealed(v => !v); }
  function handleCopy() {
    navigator.clipboard.writeText(secret.value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  function handleEdit() {
    setEditValue(secret.value);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }
  function handleCancelEdit() { setEditing(false); setEditValue(secret.value); }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/vault/secrets", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ key: secret.key, value: editValue }),
      });
      if (res.ok) { onUpdate(secret.key, editValue); setEditing(false); }
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!confirming) { setConfirming(true); return; }
    await fetch(`/api/vault/secrets/${encodeURIComponent(secret.key)}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}` },
    });
    onDelete(secret.key);
  }

  return (
    <div className="group flex items-center gap-3 px-4 py-3 border-b border-white/5 hover:bg-white/[0.02] transition-colors">
      <KeyRound className="h-3.5 w-3.5 text-gray-600 shrink-0" />

      <span className="font-mono text-xs text-gray-300 w-56 shrink-0 truncate">{secret.key}</span>

      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") handleCancelEdit(); }}
            className="w-full bg-black/60 border border-yellow-500/30 rounded-lg px-3 py-1 text-xs font-mono text-white focus:outline-none focus:border-yellow-500/60"
          />
        ) : (
          <span className="font-mono text-xs text-gray-400 select-none">
            {revealed ? secret.value : "•".repeat(Math.min(secret.value.length, 24))}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {editing ? (
          <>
            <button onClick={handleSave} disabled={saving} className="p-1.5 rounded-lg bg-green-500/20 hover:bg-green-500/30 text-green-400 transition-colors" title="Save">
              {saving ? <span className="text-[10px]">…</span> : <Check className="h-3.5 w-3.5" />}
            </button>
            <button onClick={handleCancelEdit} className="p-1.5 rounded-lg hover:bg-white/5 text-gray-500 transition-colors" title="Cancel">
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <>
            <button onClick={handleReveal} className="p-1.5 rounded-lg hover:bg-white/5 text-gray-500 hover:text-gray-300 transition-colors" title={revealed ? "Hide" : "Reveal"}>
              {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
            <button onClick={handleCopy} className="p-1.5 rounded-lg hover:bg-white/5 text-gray-500 hover:text-gray-300 transition-colors" title="Copy">
              {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
            <button onClick={handleEdit} className="p-1.5 rounded-lg hover:bg-white/5 text-gray-500 hover:text-gray-300 transition-colors" title="Edit">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleDelete}
              onBlur={() => setConfirming(false)}
              className={`p-1.5 rounded-lg transition-colors ${confirming ? "bg-red-500/20 text-red-400 hover:bg-red-500/30" : "hover:bg-white/5 text-gray-500 hover:text-red-400"}`}
              title={confirming ? "Click again to confirm delete" : "Delete"}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Add secret form ──────────────────────────────────────────────────────────
function AddSecretForm({
  token, onAdd,
}: {
  token: string;
  onAdd: (secret: VaultSecret) => void;
}) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [showVal, setShowVal] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!key || !/^[A-Z0-9_]+$/.test(key)) {
      setErr("Key must be uppercase letters, numbers, and underscores");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/vault/secrets", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ key, value }),
      });
      const data = await res.json() as { success?: boolean; error?: string };
      if (!res.ok) { setErr(data.error ?? "Failed to save"); return; }
      onAdd({ key, value });
      setKey(""); setValue(""); setOpen(false);
    } finally { setSaving(false); }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-500/15 hover:bg-green-500/25 border border-green-500/20 text-green-400 text-sm font-semibold transition-colors"
      >
        <Plus className="h-4 w-4" />
        New Secret
      </button>
    );
  }

  return (
    <form onSubmit={handleAdd} className="bg-black/50 border border-white/10 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold text-white">New Secret</span>
        <button type="button" onClick={() => setOpen(false)} className="text-gray-500 hover:text-gray-300">
          <X className="h-4 w-4" />
        </button>
      </div>
      <input
        type="text"
        value={key}
        onChange={e => setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))}
        placeholder="SECRET_KEY_NAME"
        className="w-full bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500/40"
        autoFocus
      />
      <div className="relative">
        <input
          type={showVal ? "text" : "password"}
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="secret value"
          className="w-full bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500/40 pr-9"
        />
        <button type="button" onClick={() => setShowVal(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
          {showVal ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>
      {err && <p className="text-xs text-red-400">{err}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving || !key || !value}
          className="flex-1 bg-green-500/20 hover:bg-green-500/30 border border-green-500/20 text-green-400 text-xs font-semibold rounded-lg py-2 transition-colors disabled:opacity-40"
        >
          {saving ? "Saving…" : "Add Secret"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="px-4 bg-white/5 hover:bg-white/10 text-gray-400 text-xs rounded-lg py-2 transition-colors">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Main vault panel ─────────────────────────────────────────────────────────
export function VaultPanel() {
  const [token, setToken] = useState<string | null>(getVaultToken);
  const [secrets, setSecrets] = useState<VaultSecret[]>([]);
  const [envKeys, setEnvKeys] = useState<EnvEntry[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [envExpanded, setEnvExpanded] = useState(false);

  async function loadSecrets(t: string) {
    setLoading(true);
    try {
      const res = await fetch("/api/vault/secrets", {
        headers: { "Authorization": `Bearer ${t}` },
      });
      if (!res.ok) { setToken(null); return; }
      const data = await res.json() as { vault: VaultSecret[]; env: EnvEntry[] };
      setSecrets(data.vault);
      setEnvKeys(data.env);
    } finally { setLoading(false); }
  }

  async function handleLogin(t: string) {
    setToken(t);
    await loadSecrets(t);
  }

  function handleUpdate(key: string, value: string) {
    setSecrets(prev => prev.map(s => s.key === key ? { ...s, value } : s));
  }
  function handleDelete(key: string) {
    setSecrets(prev => prev.filter(s => s.key !== key));
  }
  function handleAdd(secret: VaultSecret) {
    setSecrets(prev => {
      const exists = prev.find(s => s.key === secret.key);
      if (exists) return prev.map(s => s.key === secret.key ? secret : s);
      return [...prev, secret].sort((a, b) => a.key.localeCompare(b.key));
    });
  }

  if (!token) return <VaultLogin onSuccess={handleLogin} />;

  const filtered = secrets.filter(s =>
    s.key.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6 mt-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
            <Lock className="h-4.5 w-4.5 text-yellow-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              Secrets Vault
              <span className="text-[10px] font-mono bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded-md">
                {secrets.length} stored
              </span>
            </h2>
            <p className="text-[11px] text-gray-500">AES-256-GCM encrypted · Owner access only</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => loadSecrets(token)}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Refresh
          </button>
          <AddSecretForm token={token} onAdd={handleAdd} />
        </div>
      </div>

      <div className="bg-black/40 border border-white/5 rounded-2xl overflow-hidden backdrop-blur-sm">
        <div className="px-4 py-3 border-b border-white/5">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter secrets…"
            className="w-full bg-transparent text-sm text-white placeholder-gray-600 focus:outline-none"
          />
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-gray-500">Decrypting vault…</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-xs text-gray-500">
            {search ? "No secrets match your filter" : "No secrets stored yet — add your first one"}
          </div>
        ) : (
          <div>
            {filtered.map(s => (
              <SecretRow
                key={s.key}
                secret={s}
                token={token}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      <div className="bg-black/40 border border-white/5 rounded-2xl overflow-hidden backdrop-blur-sm">
        <button
          onClick={() => setEnvExpanded(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 border-b border-white/5 hover:bg-white/[0.02] transition-colors"
        >
          <span className="text-sm font-semibold text-white flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-gray-500" />
            Environment Variables
            <span className="text-[10px] font-mono bg-white/5 border border-white/10 text-gray-500 px-1.5 py-0.5 rounded-md">
              {envKeys.length} detected
            </span>
          </span>
          {envExpanded ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
        </button>
        {envExpanded && (
          <div className="divide-y divide-white/5 max-h-64 overflow-y-auto">
            {envKeys.map(e => (
              <div key={e.key} className="flex items-center justify-between px-4 py-2.5">
                <span className="font-mono text-xs text-gray-400">{e.key}</span>
                <span className="text-[10px] text-gray-600 font-mono">
                  {e.set ? "•••••••" : "not set"}
                </span>
              </div>
            ))}
          </div>
        )}
        {!envExpanded && (
          <div className="px-4 py-2.5">
            <p className="text-[11px] text-gray-600">Click to view injected environment variable keys (values are masked)</p>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => { sessionStorage.removeItem(VAULT_SESSION_KEY); setToken(null); setSecrets([]); setEnvKeys([]); }}
          className="text-xs text-gray-600 hover:text-red-400 transition-colors"
        >
          Lock vault
        </button>
      </div>
    </div>
  );
}
