const { ethers } = require("hardhat");

const USDT_TESTNET = "0x0D3E80cBc9DDC0a3Fdee912b99C50cd0b5761eE3";

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log("\n══════════════════════════════════════════════════");
  console.log("  M-Vault New Contract Deployment");
  console.log("  Network:", network.name, "(chainId:", network.chainId.toString() + ")");
  console.log("  Deployer:", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("  BNB Balance:", ethers.formatEther(balance), "BNB");
  console.log("══════════════════════════════════════════════════\n");

  // ── 1. Deploy MvaultToken ────────────────────────────────────────────────
  console.log("[1/3] Deploying MvaultToken...");
  const TokenFactory = await ethers.getContractFactory("MvaultToken");
  const mvaultToken = await TokenFactory.deploy(USDT_TESTNET);
  await mvaultToken.waitForDeployment();
  const tokenAddress = await mvaultToken.getAddress();
  console.log("  ✓ MvaultToken deployed:", tokenAddress);

  // ── 2. Deploy MvaultContract ─────────────────────────────────────────────
  console.log("\n[2/3] Deploying MvaultContract...");
  const ContractFactory = await ethers.getContractFactory("MvaultContract");
  const mvaultContract = await ContractFactory.deploy(USDT_TESTNET, tokenAddress);
  await mvaultContract.waitForDeployment();
  const contractAddress = await mvaultContract.getAddress();
  console.log("  ✓ MvaultContract deployed:", contractAddress);

  // ── 3. Link MvaultToken → MvaultContract ─────────────────────────────────
  console.log("\n[3/3] Linking MvaultToken to MvaultContract...");
  const tx = await mvaultToken.setMvaultContract(contractAddress);
  await tx.wait();
  console.log("  ✓ MvaultToken linked to MvaultContract");

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════════");
  console.log("  DEPLOYMENT COMPLETE");
  console.log("══════════════════════════════════════════════════");
  console.log("  VITE_MVT_TOKEN_ADDRESS=" + tokenAddress);
  console.log("  VITE_MVAULT_CONTRACT_ADDRESS=" + contractAddress);
  console.log("══════════════════════════════════════════════════\n");

  // Verify on explorer
  console.log("BSCScan links:");
  console.log("  Token:    https://testnet.bscscan.com/address/" + tokenAddress);
  console.log("  Contract: https://testnet.bscscan.com/address/" + contractAddress);
}

main().catch((err) => {
  console.error("\n❌ Deployment failed:", err.message || err);
  process.exit(1);
});
