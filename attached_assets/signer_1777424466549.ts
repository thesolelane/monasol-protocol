import { ethers, TransactionRequest, TransactionResponse } from "ethers";

/**
 * Minimal signer interface — swap the concrete impl for KMS/HSM without
 * touching any route code.
 */
export interface SignerProvider {
  getAddress(): Promise<string>;
  sendTransaction(tx: TransactionRequest): Promise<TransactionResponse>;
}

/**
 * Raw ethers Wallet implementation.
 * Reads DEPLOYER_PRIVATE_KEY from env at construction time so the singleton
 * in monad.ts is the only place that touches process.env.
 */
export class EthersWalletSigner implements SignerProvider {
  private readonly wallet: ethers.Wallet;

  constructor(privateKey: string, provider: ethers.JsonRpcProvider) {
    this.wallet = new ethers.Wallet(privateKey, provider);
  }

  getAddress(): Promise<string> {
    return this.wallet.getAddress();
  }

  sendTransaction(tx: TransactionRequest): Promise<TransactionResponse> {
    return this.wallet.sendTransaction(tx);
  }

  /** Expose the raw wallet when contract factories need .connect(signer) */
  asEthersSigner(): ethers.Wallet {
    return this.wallet;
  }
}
