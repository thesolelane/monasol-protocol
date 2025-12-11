import { motion } from "framer-motion";
import { Check } from "lucide-react";

interface Nft {
  id: string;
  name: string;
  image: string;
  rarity: string;
}

const MOCK_NFTS: Nft[] = [
  { id: "1", name: "Monad Nomads #442", image: "https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?w=400&h=400&fit=crop", rarity: "Legendary" },
  { id: "2", name: "Solana Apes #881", image: "https://images.unsplash.com/photo-1634986666676-ec8fd927c23d?w=400&h=400&fit=crop", rarity: "Common" },
  { id: "3", name: "Cyber Samurai #009", image: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&h=400&fit=crop", rarity: "Rare" },
  { id: "4", name: "Pixel Punk #102", image: "https://images.unsplash.com/photo-1614812513172-567d2fe96a75?w=400&h=400&fit=crop", rarity: "Epic" },
];

interface NftGridProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function NftGrid({ selectedId, onSelect }: NftGridProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold text-white">Select Key NFT</h3>
        <span className="text-xs text-solana-green font-medium bg-solana-green/10 px-2 py-1 rounded-full border border-solana-green/20">
          Solana Network
        </span>
      </div>
      
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {MOCK_NFTS.map((nft) => {
          const isSelected = selectedId === nft.id;
          return (
            <motion.div
              key={nft.id}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onSelect(nft.id)}
              className={`relative cursor-pointer overflow-hidden rounded-xl border-2 transition-all duration-300 ${
                isSelected 
                  ? "border-solana-green shadow-[0_0_20px_-5px_rgba(20,241,149,0.5)]" 
                  : "border-white/10 opacity-70 hover:border-white/30 hover:opacity-100"
              }`}
            >
              <div className="aspect-square w-full">
                <img src={nft.image} alt={nft.name} className="h-full w-full object-cover" />
              </div>
              
              <div className="absolute inset-0 bg-linear-to-t from-black/80 to-transparent p-3 flex flex-col justify-end">
                <p className="font-display text-xs font-bold text-white truncate">{nft.name}</p>
                <p className="text-[10px] text-gray-400">{nft.rarity}</p>
              </div>

              {isSelected && (
                <div className="absolute top-2 right-2 bg-solana-green text-black rounded-full p-1">
                  <Check className="h-3 w-3" />
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}