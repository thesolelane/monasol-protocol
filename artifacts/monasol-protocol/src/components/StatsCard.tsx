import { LucideIcon } from "lucide-react";

interface StatsCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  trend?: string;
  color: "purple" | "green" | "blue";
}

export function StatsCard({ label, value, icon: Icon, trend, color }: StatsCardProps) {
  const colorStyles = {
    purple: "text-monad-purple bg-monad-purple/10 border-monad-purple/20",
    green: "text-solana-green bg-solana-green/10 border-solana-green/20",
    blue: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  };

  return (
    <div className="glass-panel p-5 rounded-xl flex items-center gap-4">
      <div className={`p-3 rounded-lg border ${colorStyles[color]}`}>
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p className="text-xs text-gray-400 uppercase tracking-wider font-medium">{label}</p>
        <p className="font-display text-2xl font-bold text-white mt-1">{value}</p>
        {trend && <p className="text-xs text-gray-500 mt-1">{trend}</p>}
      </div>
    </div>
  );
}
