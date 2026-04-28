import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

// EntryPoint v0.7 — confirmed live on Monad testnet
export const ENTRYPOINT_V07 = "0x0000000071727De22E5E9d8BAF0edAc6f37da032";

// Monad testnet chain ID
const MONAD_CHAIN_ID = 10143;

const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: false,
      evmVersion: "cancun",
    },
  },
  networks: {
    // Local Hardhat node — used for all tests
    hardhat: {
      chainId: 31337,
    },
    // Monad testnet
    monad_testnet: {
      url: process.env.MONAD_TESTNET_RPC ?? "https://testnet-rpc.monad.xyz",
      chainId: MONAD_CHAIN_ID,
      accounts: DEPLOYER_KEY ? [DEPLOYER_KEY] : [],
      gasPrice: "auto",
    },
  },
  paths: {
    sources:   "./contracts",
    tests:     "./test",
    cache:     "./cache",
    artifacts: "./artifacts-out",
  },
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
  },
};

export default config;
