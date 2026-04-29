import { ethers, type TransactionRequest, type TransactionResponse } from "ethers";

export interface SignerProvider {
  getAddress(): Promise<string>;
  signTransaction(tx: TransactionRequest): Promise<string>;
  sendTransaction(tx: TransactionRequest): Promise<TransactionResponse>;
}

function buildEthersSigner(): SignerProvider {
  const rpc = process.env.MONAD_TESTNET_RPC ?? "https://testnet-rpc.monad.xyz";
  const key = process.env.DEPLOYER_PRIVATE_KEY;

  if (!key) {
    throw new Error("DEPLOYER_PRIVATE_KEY is not set");
  }

  const provider = new ethers.JsonRpcProvider(rpc);
  return new ethers.Wallet(key, provider);
}

export const signer: SignerProvider = buildEthersSigner();
