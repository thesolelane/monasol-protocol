# NexusBridge: Cross-Chain Token Locker

NexusBridge is a concept for an EVM (Monad) token locker system where access is controlled by Solana NFTs. It enforces a strict limit of 1500 unique locker IDs.

This repository currently contains the **frontend interactive mockup** designed to showcase the cross-chain UX flow.

## Features (Mockup)

- **Dual-Chain Wallet Simulation:** UI components for connecting both EVM and Solana wallets simultaneously.
- **NFT Access Control UI:** Select a Solana NFT to act as the cryptographic "key" to your Monad locker.
- **Limited Supply Lockers:** The system enforces a maximum of 1,500 unique locker vaults.
- **Cyberpunk Aesthetic:** Dark mode interface with Monad purple and Solana green accents, featuring glassmorphism and subtle animations.

## Tech Stack

- React 18
- Vite
- Tailwind CSS v4
- Framer Motion (Animations)
- Lucide React (Icons)
- Radix UI (Headless primitives)

## Getting Started

To run the development server locally:

```bash
npm install
npm run dev:client
```

The application will start on port 5000 (or the next available port).

## Project Structure

- `client/src/pages/home.tsx`: Main dashboard assembly.
- `client/src/components/WalletConnect.tsx`: Dual wallet connection interface.
- `client/src/components/LockerForm.tsx`: The primary interface for locking/unlocking assets, displaying the unique locker ID badge.
- `client/src/components/NftGrid.tsx`: Visual selection of the Solana NFT key.
- `client/src/index.css`: Tailwind configuration and global design system variables.

## Future Development (Smart Contracts)

The backend infrastructure and smart contracts are required to make this mockup fully functional. The intended architecture includes:

1.  **Monad (EVM) Smart Contract:** A vault contract that holds the deposited tokens.
2.  **Solana Verification:** An oracle or relayer mechanism to verify ownership of the specific Solana NFT collection on the Solana blockchain.
3.  **Cross-Chain Messaging:** A protocol to relay the Solana NFT ownership proof to the Monad smart contract to authorize withdrawals.
