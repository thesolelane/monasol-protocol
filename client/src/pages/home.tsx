import { useState } from "react";
import { WalletConnect } from "@/components/WalletConnect";
import { NftGrid } from "@/components/NftGrid";
import { LockerForm } from "@/components/LockerForm";
import { VaultExplorer } from "@/components/VaultExplorer";
import { StatsCard } from "@/components/StatsCard";
import { Shield, Coins, Activity, Zap, Wallet } from "lucide-react";
import background from "@assets/generated_images/abstract_dark_futuristic_blockchain_network_background_with_purple_and_green_neon_accents.png";

export default function Home() {
  const [evmConnected, setEvmConnected] = useState(false);
  const [solanaConnected, setSolanaConnected] = useState(false);
  const [selectedNft, setSelectedNft] = useState<string | null>(null);

  const allConnected = evmConnected && solanaConnected;

  return (
    <div className="min-h-screen w-full relative overflow-hidden">
      {/* Background Image Layer */}
      <div
        className="fixed inset-0 z-0 opacity-40 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${background})` }}
      />

      {/* Overlay Gradient */}
      <div className="fixed inset-0 z-0 bg-linear-to-b from-background/80 via-background/90 to-background pointer-events-none" />

      <div className="relative z-10 container mx-auto px-4 py-8 sm:py-12 max-w-6xl">
        {/* Header */}
        <header className="mb-12 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 bg-linear-to-br from-monad-purple to-solana-green rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(130,71,229,0.5)]">
                <Zap className="h-6 w-6 text-white fill-white" />
              </div>
              <h1 className="font-display text-3xl sm:text-4xl font-bold text-white tracking-tight">
                Nexus<span className="text-gray-500">Bridge</span>
              </h1>
            </div>
            <p className="text-gray-400 max-w-md">
              Secure cross-chain vault system. Lock Monad assets, control them with Solana NFTs.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
            <WalletConnect
              type="evm"
              isConnected={evmConnected}
              onConnect={() => setEvmConnected(!evmConnected)}
            />
            <WalletConnect
              type="solana"
              isConnected={solanaConnected}
              onConnect={() => setSolanaConnected(!solanaConnected)}
            />
          </div>
        </header>

        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          <StatsCard
            label="Total Value Locked"
            value="$4.2M"
            icon={Coins}
            color="purple"
            trend="+12% this week"
          />
          <StatsCard
            label="Active Vaults"
            value="1,284 / 1,500"
            icon={Shield}
            color="green"
            trend="85% Minted"
          />
          <StatsCard
            label="Security Status"
            value="User-Controlled"
            icon={Activity}
            color="blue"
            trend="Circuit Breakers Active"
          />
        </div>

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-12 gap-8">
          {/* Left Column: NFT Selector */}
          <div className="lg:col-span-7 space-y-6">
            <div className="glass-panel rounded-2xl p-6 sm:p-8 min-h-[500px]">
              {solanaConnected ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-between border-b border-white/10 pb-6">
                    <div>
                      <h2 className="font-display text-xl font-bold text-white">Your Wallet</h2>
                      <p className="text-sm text-gray-400">Select an NFT to use as a key</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500 uppercase">Address</p>
                      <p className="font-mono text-sm text-solana-green">8xR...3kL</p>
                    </div>
                  </div>

                  <NftGrid selectedId={selectedNft} onSelect={setSelectedNft} />

                  {selectedNft && (
                    <div className="mt-8 p-4 rounded-xl bg-white/5 border border-white/10">
                      <h4 className="text-sm font-semibold text-white mb-2">Key Permissions</h4>
                      <ul className="space-y-2 text-xs text-gray-400">
                        <li className="flex items-center gap-2">
                          <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                          Can unlock connected vault
                        </li>
                        <li className="flex items-center gap-2">
                          <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                          Transferable rights enabled
                        </li>
                        <li className="flex items-center gap-2">
                          <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                          Yield generation active
                        </li>
                      </ul>
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

          {/* Right Column: Locker Controls & Explorer */}
          <div className="lg:col-span-5">
            <LockerForm isConnected={allConnected} hasNftKey={!!selectedNft} />
            <VaultExplorer />

            <div className="mt-6 p-6 rounded-2xl border border-white/5 bg-white/5 backdrop-blur-xs">
              <h3 className="text-sm font-semibold text-white mb-3">How it works</h3>
              <div className="space-y-4 relative">
                <div className="absolute left-2.5 top-2 bottom-2 w-0.5 bg-white/10" />

                {[
                  "Connect Monad (Vault) & Solana (Key) wallets",
                  "Select a Solana NFT to act as the key",
                  "Deposit tokens into the EVM Vault",
                  "Unlock anytime by proving NFT ownership",
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
    </div>
  );
}
