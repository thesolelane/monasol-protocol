import { ethers, network } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("─────────────────────────────────────────────");
  console.log("MonaSol Protocol — Contract Deployment");
  console.log("─────────────────────────────────────────────");
  console.log(`Network:  ${network.name} (chainId: ${(await ethers.provider.getNetwork()).chainId})`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);
  console.log("─────────────────────────────────────────────\n");

  // ── OracleVerifier ───────────────────────────────────────────────────────
  // The oracle signer is the off-chain service that attests Solana NFT
  // ownership. In production use a dedicated hot wallet, not the deployer.
  const oracleSigner = process.env.ORACLE_SIGNER_ADDRESS ?? deployer.address;

  console.log(`Oracle signer: ${oracleSigner}`);
  console.log("Deploying OracleVerifier...");

  const OracleVerifier = await ethers.getContractFactory("OracleVerifier");
  const oracleVerifier = await OracleVerifier.deploy(
    deployer.address,  // owner
    oracleSigner       // initial approved signer
  );
  await oracleVerifier.waitForDeployment();
  const oracleVerifierAddress = await oracleVerifier.getAddress();
  console.log(`✓ OracleVerifier deployed: ${oracleVerifierAddress}\n`);

  // ── ZKVerifier (stub) ────────────────────────────────────────────────────
  console.log("Deploying ZKVerifier (stub)...");

  const ZKVerifier = await ethers.getContractFactory("ZKVerifier");
  const zkVerifier = await ZKVerifier.deploy(deployer.address);
  await zkVerifier.waitForDeployment();
  const zkVerifierAddress = await zkVerifier.getAddress();
  console.log(`✓ ZKVerifier (stub) deployed: ${zkVerifierAddress}\n`);

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log("─────────────────────────────────────────────");
  console.log("Deployment complete");
  console.log("─────────────────────────────────────────────");
  console.log(`OracleVerifier : ${oracleVerifierAddress}`);
  console.log(`ZKVerifier     : ${zkVerifierAddress}`);
  console.log("─────────────────────────────────────────────");
  console.log("\nNext steps:");
  console.log("  1. Set ORACLE_SIGNER_ADDRESS to your oracle hot wallet before mainnet.");
  console.log("  2. Transfer OracleVerifier ownership to a multisig after deployment.");
  console.log("  3. Point Locker contracts at OracleVerifier address.");
  console.log("  4. ZKVerifier address is reserved — activate once light client ships.\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
