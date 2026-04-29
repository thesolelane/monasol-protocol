import type { TransactionRequest, TransactionResponse } from "ethers";

export interface SignerProvider {
  getAddress(): Promise<string>;
  signTransaction(tx: TransactionRequest): Promise<string>;
  sendTransaction(tx: TransactionRequest): Promise<TransactionResponse>;
}
