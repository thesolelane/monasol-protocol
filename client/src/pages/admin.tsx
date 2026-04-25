import { useState } from "react";
import { DeployLockerModal } from "@/components/DeployLockerModal";
import { Shield, Server, Activity, Users, Settings, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function AdminDashboard() {
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);

  return (
    <div className="min-h-screen w-full relative overflow-hidden bg-black text-white p-4 sm:p-8">
      <div className="fixed inset-0 z-0 bg-linear-to-br from-monad-purple/10 via-black to-solana-green/5 pointer-events-none" />
      
      <div className="relative z-10 max-w-6xl mx-auto">
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
                NexusBridge <span className="text-gray-500">Admin</span>
              </h1>
              <p className="text-gray-400 mt-2">Platform control center and deployment management.</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {/* Quick Stats */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-6 backdrop-blur-sm">
            <div className="flex items-center gap-3 mb-4 text-gray-400">
              <Server className="h-5 w-5" />
              <h3 className="font-semibold">Active Lockers</h3>
            </div>
            <p className="text-3xl font-mono text-white">24</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-6 backdrop-blur-sm">
            <div className="flex items-center gap-3 mb-4 text-gray-400">
              <Users className="h-5 w-5" />
              <h3 className="font-semibold">Total Users</h3>
            </div>
            <p className="text-3xl font-mono text-white">1,284</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-6 backdrop-blur-sm">
            <div className="flex items-center gap-3 mb-4 text-gray-400">
              <Activity className="h-5 w-5" />
              <h3 className="font-semibold">System Health</h3>
            </div>
            <p className="text-3xl font-mono text-green-400">100%</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white/5 border border-monad-purple/30 rounded-xl p-8 relative overflow-hidden backdrop-blur-sm">
            <div className="absolute top-0 right-0 w-32 h-32 bg-monad-purple/10 rounded-bl-full -z-10" />
            <h2 className="text-xl font-bold mb-2">Deploy New Locker</h2>
            <p className="text-gray-400 mb-6 text-sm">
              Deploy isolated Vyper smart contracts on Monad to hold user vaults. This action requires multi-sig approval in production.
            </p>
            <Button 
              onClick={() => setIsDeployModalOpen(true)}
              className="bg-monad-purple hover:bg-monad-purple/90 text-black font-bold"
            >
              <Server className="h-4 w-4 mr-2" />
              Deploy Locker Contract
            </Button>
          </div>
          
          <div className="bg-white/5 border border-white/10 rounded-xl p-8 opacity-50 backdrop-blur-sm">
            <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Global Protocol Settings
            </h2>
            <p className="text-gray-400 mb-6 text-sm">
              Manage platform fees, global circuit breakers, and supported assets.
            </p>
            <Button variant="outline" disabled className="border-white/10">
              Coming Soon
            </Button>
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