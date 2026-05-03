import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { WalletConnect } from "@/components/WalletConnect";
import { NftGrid } from "@/components/NftGrid";
import { LockerForm } from "@/components/LockerForm";
import { VaultExplorer } from "@/components/VaultExplorer";
import { StatsCard } from "@/components/StatsCard";
import { CircuitBreaker } from "@/components/CircuitBreaker";
import { RentVaultModal } from "@/components/RentVaultModal";
import { ClaimVaultModal } from "@/components/ClaimVaultModal";
import { MintNftModal } from "@/components/MintNftModal";
import { SessionPanel } from "@/components/SessionPanel";
import { ConvertPanel } from "@/components/ConvertPanel";
import { Shield, Coins, Activity, Zap, Wallet, Key, ArrowLeftRight, Ticket, Server, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/Footer";
import { getFeatureFlags } from "@/lib/featureFlags";
import background from "@assets/generated_images/abstract_dark_futuristic_blockchain_network_background_with_purple_and_green_neon_accents.png";

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

interface NftKey {
  id: string;
  mint: string;
  name: string;
  image: string | null;
  vaultRef: string | null;
  lockerRef: string | null;
  isTicket: boolean;
  transferLockDays: number;
  kycLevel: string;
  eventName: string | null;
}

interface RentedNft {
  mint: string;
  name: string;
  tokenId: string;
  lockerRef: string;
  slotNumber: number;
}

interface Locker {
  id: string;
  externalId: string;
  tier: number;
  capacity: number;
  usedSlots: number;
  status: string;
  minDepositSol: string;
  monadAddress?: string | null;
}

const MOCK_WALLET = "8xR...3kL";

function formatTvl(tvlUsd: string): string {
  const n = parseFloat(tvlUsd);
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

export default function Home() {
  const queryClient = useQueryClient();
  const [monadEnabled, setMonadEnabled] = useState(() => getFeatureFlags().monadWalletEnabled);
  const [evmConnected, setEvmConnected] = useState(false);
  const [solanaConnected, setSolanaConnected] = useState(false);

  useEffect(() => {
    const handler = () => setMonadEnabled(getFeatureFlags().monadWalletEnabled);
    window.addEventListener("featureFlagsChanged", handler);
    return () => window.removeEventListener("featureFlagsChanged", handler);
  }, []);
  const [selectedNft, setSelectedNft] = useState<string | null>(null);
  const [isRentModalOpen, setIsRentModalOpen] = useState(false);
  const [isClaimModalOpen, setIsClaimModalOpen] = useState(false);
  const [isMintNftOpen, setIsMintNftOpen] = useState(false);
  const [preSelectedNft, setPreSelectedNft] = useState<RentedNft | null>(null);
  const [activeVault, setActiveVault] = useState<{ id: string, lockerId: string, balance: string, nftName: string } | null>(null);

  const [lockerTierFilter, setLockerTierFilter] = useState<0 | 1 | 2 | 3>(0);

  const { data: stats } = useQuery<ProtocolStats>({
    queryKey: ["/api/stats"],
    staleTime: 30_000,
  });

  const { data: allLockers = [] } = useQuery<Locker[]>({
    queryKey: ["/api/lockers"],
    staleTime: 30_000,
  });

  const { data: nfts = [] } = useQuery<NftKey[]>({
    queryKey: ["/api/nfts", MOCK_WALLET],
    queryFn: () => fetch(`/api/nfts?wallet=${encodeURIComponent(MOCK_WALLET)}`).then(r => r.json()),
    enabled: solanaConnected,
    staleTime: 60_000,
  });

  const vaultNfts = nfts.filter(n => !n.isTicket);

  const availableNfts = vaultNfts.map(n => ({
    mint: n.mint,
    name: n.name,
    image: n.image ?? `https://images.unsplash.com/photo-1639815188546-c43c240ff4df?w=100&h=100&fit=crop`,
    tokenId: n.id,
    vaultRef: n.vaultRef ?? "VLT-???",
    lockerRef: n.lockerRef ?? "LCK-???",
  }));

  const handleSolanaConnect = () => {
    const isConnecting = !solanaConnected;
    setSolanaConnected(isConnecting);

    if (!isConnecting) {
      setSelectedNft(null);
      setActiveVault(null);
    }
  };

  const handleNftSelect = (id: string) => {
    setSelectedNft(id);
    const nft = availableNfts.find(n => n.mint === id);
    if (nft) {
      const balances: Record<string, string> = {
        "1": "12.50 MON",
        "2": "145.00 MON",
        "3": "3.14 MON",
      };
      setActiveVault({
        id: nft.vaultRef,
        lockerId: nft.lockerRef,
        balance: balances[nft.tokenId] || "0.00 MON",
        nftName: nft.name,
      });
    }
  };

  const openClaimModal = (nft?: RentedNft) => {
    setPreSelectedNft(nft ?? null);
    setIsClaimModalOpen(true);
  };

  const tvlDisplay = stats ? formatTvl(stats.tvlUsd) : "$4.2M";
  const tvlTrend = stats?.tvlTrend ?? "+12% this week";
  const activeVaultsDisplay = stats ? `${stats.activeVaults.toLocaleString()} / ${stats.maxVaults.toLocaleString()}` : "1,284 / 1,500";
  const mintedPct = stats ? `${stats.nftUtilizationPct}% Minted` : "85% Minted";

  return (
    <div className="min-h-screen w-full relative overflow-hidden">
      <div
        className="fixed inset-0 z-0 opacity-40 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${background})` }}
      />
      <div className="fixed inset-0 z-0 bg-linear-to-b from-background/80 via-background/90 to-background pointer-events-none" />

      <div className="relative z-10 container mx-auto px-4 py-8 sm:py-12 max-w-6xl">
        <header className="mb-12 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 bg-linear-to-br from-monad-purple to-solana-green rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(130,71,229,0.5)]">
                <Zap className="h-6 w-6 text-white fill-white" />
              </div>
              <h1 className="font-display text-3xl sm:text-4xl font-bold text-white tracking-tight">
                Monasol<span className="text-gray-500">Protocol</span>
              </h1>
            </div>
            <p className="text-gray-400 max-w-md">
              Secure cross-chain vault system. Lock Monad and EVM tokens, control them with Solana NFTs.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
            <Button
              data-testid="button-claim-vault-header"
              onClick={() => openClaimModal()}
              className="h-10 bg-monad-purple hover:bg-monad-purple/90 text-white font-bold shadow-[0_0_15px_-3px_rgba(130,71,229,0.4)]"
            >
              Claim Vault
            </Button>
            <Button
              data-testid="button-rent-vault-header"
              onClick={() => setIsRentModalOpen(true)}
              variant="outline"
              className="h-10 bg-black/40 border-solana-green/30 text-solana-green hover:bg-solana-green/10 hover:text-solana-green shadow-[0_0_10px_rgba(20,241,149,0.1)]"
            >
              <Key className="h-4 w-4 mr-2" />
              Rent a Vault
            </Button>
            {monadEnabled && (
              <WalletConnect
                type="evm"
                isConnected={evmConnected}
                onConnect={() => setEvmConnected(!evmConnected)}
              />
            )}
            <WalletConnect
              type="solana"
              isConnected={solanaConnected}
              onConnect={handleSolanaConnect}
            />
          </div>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          <StatsCard
            label="Protocol TVL"
            value={tvlDisplay}
            icon={Coins}
            color="purple"
            trend={tvlTrend}
          />
          <StatsCard
            label="Global Active Vaults"
            value={activeVaultsDisplay}
            icon={Shield}
            color="green"
            trend={mintedPct}
          />
          <StatsCard
            label="Platform Security"
            value={stats?.circuitBreakerActive ? "Paused" : "Active"}
            icon={Activity}
            color="blue"
            trend="100% User-Controlled"
          />
        </div>

        {/* Deployed Lockers */}
        {(() => {
          const filtered = lockerTierFilter === 0 ? allLockers : allLockers.filter(l => l.tier === lockerTierFilter);
          const statusColor = (s: string) =>
            s === "full"       ? "bg-white/80 text-black" :
            s === "filling"    ? "bg-monad-purple/80 text-white" :
            s === "distressed" ? "bg-red-500 text-white animate-pulse" :
                                 "bg-solana-green/70 text-black";
          const tierLabel = (t: number) =>
            t === 1 ? { label: "T1", color: "text-gray-300 border-white/20" } :
            t === 2 ? { label: "T2", color: "text-monad-purple border-monad-purple/30" } :
                      { label: "T3", color: "text-yellow-400 border-yellow-400/30" };

          return (
            <div className="mb-10">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <Server className="h-5 w-5 text-gray-400" />
                  <h2 className="font-display text-lg font-bold text-white">Deployed Lockers</h2>
                  {allLockers.length > 0 && (
                    <span className="text-xs font-mono bg-white/5 border border-white/10 text-gray-400 px-2 py-0.5 rounded">
                      {allLockers.length} live
                    </span>
                  )}
                </div>
                {allLockers.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <Filter className="h-3.5 w-3.5 text-gray-500" />
                    {([0, 1, 2, 3] as const).map(t => (
                      <button
                        key={t}
                        onClick={() => setLockerTierFilter(t)}
                        className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                          lockerTierFilter === t
                            ? "bg-monad-purple text-white"
                            : "bg-white/5 text-gray-400 hover:bg-white/10"
                        }`}
                      >
                        {t === 0 ? "All" : `Tier ${t}`}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-white/5 bg-black/40 backdrop-blur-sm overflow-hidden">
                {allLockers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 px-6 text-center gap-4">
                    <div className="h-12 w-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                      <Server className="h-6 w-6 text-gray-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white mb-1">No lockers deployed yet</p>
                      <p className="text-xs text-gray-500 max-w-xs">
                        Deploy your first Vyper locker contract from the admin panel. Each locker holds up to 100 vaults (Tier 1), 500 (Tier 2), or 10 institutional slots (Tier 3).
                      </p>
                    </div>
                    <a
                      href="/admin"
                      className="px-4 py-2 rounded-lg text-xs font-semibold bg-monad-purple/10 border border-monad-purple/20 text-monad-purple hover:bg-monad-purple/20 transition-colors"
                    >
                      Go to Admin → Chain Ops
                    </a>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-[auto_1fr_auto_auto_auto] text-[11px] uppercase tracking-wider text-gray-600 px-4 py-2 border-b border-white/5 gap-4">
                      <span>Tier</span>
                      <span>Locker ID</span>
                      <span className="text-right">Capacity</span>
                      <span className="text-right">Min Deposit</span>
                      <span className="text-right">Status</span>
                    </div>
                    <div className="divide-y divide-white/5 max-h-72 overflow-y-auto">
                      {filtered.map(l => {
                        const t = tierLabel(l.tier);
                        const pct = Math.round((l.usedSlots / l.capacity) * 100);
                        return (
                          <div key={l.id} className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center px-4 py-2.5 gap-4 hover:bg-white/[0.02] transition-colors">
                            <span className={`text-[10px] font-bold font-mono border rounded px-1.5 py-0.5 ${t.color}`}>
                              {t.label}
                            </span>
                            <div>
                              <span className="font-mono text-xs text-white">{l.externalId}</span>
                              {l.monadAddress && (
                                <span className="ml-2 text-[10px] text-gray-600 font-mono">{l.monadAddress.slice(0, 10)}…</span>
                              )}
                            </div>
                            <div className="text-right min-w-[80px]">
                              <div className="text-xs text-gray-300 font-mono">{l.usedSlots}/{l.capacity}</div>
                              <div className="h-1 bg-white/10 rounded-full mt-1 overflow-hidden w-16 ml-auto">
                                <div className="h-full bg-monad-purple/60 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                            <span className="text-xs text-gray-400 font-mono text-right min-w-[70px]">
                              {parseFloat(l.minDepositSol).toFixed(3)} MON
                            </span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColor(l.status)}`}>
                              {l.status}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="px-4 py-2 border-t border-white/5 flex gap-4 text-[10px] text-gray-600">
                      <span>{allLockers.filter(l => l.status === "full").length} full</span>
                      <span>{allLockers.filter(l => l.status === "filling").length} filling</span>
                      <span>{allLockers.filter(l => l.status === "healthy").length} available</span>
                      {allLockers.some(l => l.status === "distressed") && (
                        <span className="text-red-400">{allLockers.filter(l => l.status === "distressed").length} distressed</span>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })()}

        <div className="grid lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7 space-y-6">
            <div className="glass-panel rounded-2xl p-6 sm:p-8 min-h-[500px]">
              {solanaConnected ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-between border-b border-white/10 pb-6">
                    <div>
                      <h2 className="font-display text-xl font-bold text-white">Your Wallet</h2>
                      {availableNfts.length > 1 && !selectedNft ? (
                        <p className="text-sm text-solana-green animate-pulse">Select a key to access its vault</p>
                      ) : (
                        <p className="text-sm text-gray-400">Select an NFT to use as a key</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500 uppercase">Address</p>
                      <p className="font-mono text-sm text-solana-green">{MOCK_WALLET}</p>
                    </div>
                  </div>

                  <NftGrid
                    selectedId={selectedNft}
                    onSelect={handleNftSelect}
                    nfts={availableNfts.map(n => ({
                      id: n.mint,
                      name: n.name,
                      image: n.image,
                      rarity: "Vault Key",
                    }))}
                  />

                  {selectedNft && activeVault && (
                    <div className="mt-8 p-6 rounded-xl bg-white/5 border border-white/10 animate-in fade-in slide-in-from-bottom-4">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-semibold text-white">Active Vault Connection</h4>
                        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-solana-green/20 border border-solana-green/30">
                          <div className="h-2 w-2 rounded-full bg-solana-green animate-pulse" />
                          <span className="text-xs font-bold text-solana-green">Connected</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4 mb-4">
                        <div className="p-3 bg-black/40 rounded-lg border border-white/5">
                          <p className="text-xs text-gray-500 mb-1">Vault Ref</p>
                          <p className="font-mono text-sm text-white">{activeVault.id}</p>
                        </div>
                        <div className="p-3 bg-black/40 rounded-lg border border-white/5">
                          <p className="text-xs text-gray-500 mb-1">Locker Ref</p>
                          <p className="font-mono text-sm text-white">{activeVault.lockerId}</p>
                        </div>
                        <div className="p-3 bg-black/40 rounded-lg border border-white/5">
                          <p className="text-xs text-gray-500 mb-1">Locked Bal</p>
                          <p className="font-mono text-sm text-monad-purple">{activeVault.balance}</p>
                        </div>
                      </div>

                      <div className="space-y-2 text-xs text-gray-400">
                        <li className="flex items-center gap-2">
                          <Key className="h-3 w-3 text-solana-green" />
                          Authenticated via {activeVault.nftName}
                        </li>
                        <li className="flex items-center gap-2">
                          <Shield className="h-3 w-3 text-solana-green" />
                          Full withdrawal rights active
                        </li>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4 opacity-50">
                  <div className="p-4 rounded-full bg-white/5">
                    <Wallet className="h-8 w-8 text-gray-400" />
                  </div>
                  <h3 className="text-xl font-bold text-white">Wallet Not Connected</h3>
                  <p className="text-gray-400 max-w-xs">
                    Connect your Solana wallet to view your NFTs and select a vault key.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-5">
            {!selectedNft ? (
              <div className="glass-panel rounded-2xl p-10 flex flex-col items-center justify-center text-center gap-6 min-h-[260px]">
                <div className="h-14 w-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                  <Key className="h-7 w-7 text-gray-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white mb-2">Present your NFT key to begin</p>
                  <p className="text-xs text-gray-500 max-w-[260px] mx-auto leading-relaxed">
                    Connect your Solana wallet and select an NFT key on the left. Vault controls, circuit breaker, and private explorer unlock once your key is active.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <LockerForm isConnected={monadEnabled ? solanaConnected && evmConnected : solanaConnected} hasNftKey={!!selectedNft} activeVault={activeVault} />
                <SessionPanel vaultId={activeVault?.id ?? ""} nftMint={selectedNft ?? ""} nftName={activeVault?.nftName ?? ""} ownerWallet={MOCK_WALLET} />
                <ConvertPanel vaultId={activeVault?.id ?? ""} vaultBalance={activeVault?.balance ?? "0"} monadConnected={evmConnected} />
                <CircuitBreaker />
                <VaultExplorer />
              </>
            )}

            <div className="mt-6 p-6 rounded-2xl border border-white/5 bg-white/5 backdrop-blur-xs">
              <h3 className="text-sm font-semibold text-white mb-3">How it works</h3>
              <div className="space-y-4 relative">
                <div className="absolute left-2.5 top-2 bottom-2 w-0.5 bg-white/10" />
                {[
                  "Rent a Vault on Solana — pay a one-time fee and receive your NFT key",
                  "Move In on Monad — after receiving your key, initialize your vault slot and become the first signer",
                  "Select your NFT key to unlock vault controls",
                  "Deposit MON, set security rules, or share a proof with Private Explorer",
                ].map((step, i) => (
                  <div key={i} className="relative flex items-start gap-4">
                    <div className="h-5 w-5 rounded-full bg-black border border-white/20 flex items-center justify-center text-[10px] text-white font-bold relative z-10 shrink-0">
                      {i + 1}
                    </div>
                    <p className="text-sm text-gray-400 leading-tight pt-0.5">{step}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>


      {/* Rent a Vault — Solana-side: picks locker tier, pays SOL, gets NFT key */}
      <RentVaultModal
        isOpen={isRentModalOpen}
        onClose={() => setIsRentModalOpen(false)}
        connectedWallet={solanaConnected ? MOCK_WALLET : null}
        onConnectWallet={() => setSolanaConnected(true)}
        onSuccess={() => {
          setIsRentModalOpen(false);
          queryClient.invalidateQueries({ queryKey: ["/api/nfts", MOCK_WALLET] });
        }}
      />

      {/* Claim Vault — Monad-side: transfer_lease with 5/5 multisig */}
      <ClaimVaultModal
        isOpen={isClaimModalOpen}
        onClose={() => { setIsClaimModalOpen(false); setPreSelectedNft(null); }}
        onSuccess={() => { setIsClaimModalOpen(false); setPreSelectedNft(null); }}
        connectedWallet={solanaConnected ? MOCK_WALLET : null}
        preSelectedNft={preSelectedNft}
        onConnectWallet={() => setSolanaConnected(true)}
      />

      <MintNftModal
        isOpen={isMintNftOpen}
        onClose={() => setIsMintNftOpen(false)}
        onSuccess={(nft) => {
          setIsMintNftOpen(false);
          const newNftKey: NftKey = {
            id: nft.id,
            mint: nft.id,
            name: nft.name,
            image: nft.image,
            vaultRef: null,
            lockerRef: null,
            isTicket: false,
            transferLockDays: 0,
            kycLevel: "none",
            eventName: null,
          };
          queryClient.setQueryData(["/api/nfts", MOCK_WALLET], (old: NftKey[] = []) => [newNftKey, ...old]);
          openClaimModal({
            mint: nft.id,
            name: nft.name,
            tokenId: nft.id,
            lockerRef: "LCK-????",
            slotNumber: 0,
          });
        }}
      />

      <div className="fixed bottom-4 right-4 flex items-center gap-2 z-50 bg-black/50 border border-white/10 p-2 rounded-full backdrop-blur-md">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => window.location.href = "/events"}
          className="text-gray-500 hover:text-white"
          title="Event Ticketing"
        >
          <Ticket className="h-4 w-4" />
        </Button>
        <div className="w-px h-4 bg-white/10 mx-1" />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => window.location.href = "/swap"}
          className="text-gray-500 hover:text-white"
          title="Atomic Swap"
        >
          <ArrowLeftRight className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => window.location.href = "/admin"}
          className="text-gray-500 hover:text-white"
          title="Admin Controller"
        >
          <Shield className="h-4 w-4" />
        </Button>
      </div>

      <Footer />
    </div>
  );
}
