const { ethers } = require("hardhat");

// ── BSC Testnet Addresses ──────────────────────────────────────────────────
const USDT_TESTNET        = "0x0D3E80cBc9DDC0a3Fdee912b99C50cd0b5761eE3";
const TOKEN_DECIMALS      = 18;
const ADMIN_WALLET        = "0x127323b3053a901620f8d461c88fc6a7d9c7de2e";
const FEE_RECIPIENT       = ADMIN_WALLET;
const ADMIN_BINARY_WALLET = ADMIN_WALLET;

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  console.log("\n══════════════════════════════════════════════════");
  console.log("  M-Vault Contract Deployment");
  console.log("  Network:", network.name, "(chainId:", network.chainId.toString() + ")");
  console.log("  Deployer:", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("  Balance:", ethers.formatEther(balance), "BNB");
  console.log("══════════════════════════════════════════════════\n");

  if (balance < ethers.parseEther("0.02")) {
    throw new Error("Insufficient BNB — need at least 0.02 BNB testnet for gas");
  }

  // ── 1. Deploy MLMContract ─────────────────────────────────────────────────
  console.log("[1/2] Deploying MLMContract...");
  const MLMFactory = await ethers.getContractFactory("MLMContract");
  const mlm = await MLMFactory.deploy(
    USDT_TESTNET,
    TOKEN_DECIMALS,
    FEE_RECIPIENT,
    ADMIN_BINARY_WALLET
  );
  await mlm.waitForDeployment();
  const mlmAddress = await mlm.getAddress();
  console.log("      ✓ MLMContract:", mlmAddress);

  // ── 2. Deploy BoardMatrixHandler ──────────────────────────────────────────
  console.log("[2/2] Deploying BoardMatrixHandler...");
  const BoardFactory = await ethers.getContractFactory("BoardMatrixHandler");
  const board = await BoardFactory.deploy(USDT_TESTNET, TOKEN_DECIMALS);
  await board.waitForDeployment();
  const boardAddress = await board.getAddress();
  console.log("      ✓ BoardMatrixHandler:", boardAddress);

  // ── 3. Post-deploy config on BoardMatrixHandler ───────────────────────────
  console.log("\n[+] Configuring BoardMatrixHandler...");
  const tx1 = await board.setMLMContract(mlmAddress);
  await tx1.wait();
  console.log("      ✓ setMLMContract →", mlmAddress);

  const tx2 = await board.setSystemAddress(ADMIN_WALLET);
  await tx2.wait();
  console.log("      ✓ setSystemAddress →", ADMIN_WALLET);

  const tx3 = await board.setCoinLiquidityAddress(ADMIN_WALLET);
  await tx3.wait();
  console.log("      ✓ setCoinLiquidityAddress →", ADMIN_WALLET);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════════");
  console.log("  ✅ DEPLOYMENT COMPLETE");
  console.log("══════════════════════════════════════════════════");
  console.log("  MLMContract:       ", mlmAddress);
  console.log("  BoardMatrixHandler:", boardAddress);
  console.log("  Payment Token:     ", USDT_TESTNET);
  console.log("══════════════════════════════════════════════════");
  console.log("\n📋 Add these to VPS /opt/mvault/.env:\n");
  console.log(`VITE_CONTRACT_ADDRESS=${mlmAddress}`);
  console.log(`VITE_BOARD_HANDLER_ADDRESS=${boardAddress}`);
  console.log(`VITE_PAYMENT_TOKEN_ADDRESS=${USDT_TESTNET}`);
  console.log(`VITE_BSC_NETWORK=testnet`);
  console.log();
}

main().catch((err) => {
  console.error("\n❌ Deployment failed:", err.message);
  process.exit(1);
});
