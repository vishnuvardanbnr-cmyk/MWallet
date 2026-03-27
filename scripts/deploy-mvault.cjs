const { ethers } = require("hardhat");

const USDT_TESTNET   = "0x0D3E80cBc9DDC0a3Fdee912b99C50cd0b5761eE3";
const ADMIN_WALLET   = "0x04E8c5B49dE683c5B44eF1269Bd5ee4f338868C4";

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log("\n══════════════════════════════════════════════════");
  console.log("  M-Vault Full Deployment (with Board Matrix)");
  console.log("  Network:", network.name, "(chainId:", network.chainId.toString() + ")");
  console.log("  Deployer:", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("  BNB Balance:", ethers.formatEther(balance), "BNB");
  console.log("══════════════════════════════════════════════════\n");

  // ── 1. Deploy MvaultToken ────────────────────────────────────────────────
  console.log("[1/5] Deploying MvaultToken...");
  const TokenFactory = await ethers.getContractFactory("MvaultToken");
  const mvaultToken = await TokenFactory.deploy(USDT_TESTNET);
  await mvaultToken.waitForDeployment();
  const tokenAddress = await mvaultToken.getAddress();
  console.log("  ✓ MvaultToken deployed:", tokenAddress);

  // ── 2. Deploy MvaultContract ─────────────────────────────────────────────
  console.log("\n[2/5] Deploying MvaultContract...");
  const ContractFactory = await ethers.getContractFactory("MvaultContract");
  const mvaultContract = await ContractFactory.deploy(USDT_TESTNET, tokenAddress);
  await mvaultContract.waitForDeployment();
  const contractAddress = await mvaultContract.getAddress();
  console.log("  ✓ MvaultContract deployed:", contractAddress);

  // ── 3. Deploy MvaultBoardMatrix ──────────────────────────────────────────
  console.log("\n[3/5] Deploying MvaultBoardMatrix...");
  const BoardFactory = await ethers.getContractFactory("MvaultBoardMatrix");
  const boardMatrix = await BoardFactory.deploy(USDT_TESTNET);
  await boardMatrix.waitForDeployment();
  const boardAddress = await boardMatrix.getAddress();
  console.log("  ✓ MvaultBoardMatrix deployed:", boardAddress);

  // ── 4. Link MvaultToken → MvaultContract ─────────────────────────────────
  console.log("\n[4/5] Linking contracts...");
  let tx;

  tx = await mvaultToken.setMvaultContract(contractAddress);
  await tx.wait();
  console.log("  ✓ MvaultToken linked to MvaultContract");

  tx = await mvaultContract.setBoardHandler(boardAddress);
  await tx.wait();
  console.log("  ✓ MvaultContract board handler set");

  tx = await boardMatrix.setMvaultContract(contractAddress);
  await tx.wait();
  console.log("  ✓ MvaultBoardMatrix linked to MvaultContract");

  // ── 5. Set liquidity/system address + transfer ownership ──────────────────
  console.log("\n[5/6] Setting liquidity & system addresses...");
  tx = await boardMatrix.setLiquidityAddress(ADMIN_WALLET);
  await tx.wait();
  tx = await boardMatrix.setSystemAddress(ADMIN_WALLET);
  await tx.wait();
  console.log("  ✓ Liquidity + system address set to admin wallet");

  console.log("\n[6/6] Transferring ownership to admin wallet:", ADMIN_WALLET);
  tx = await mvaultToken.transferOwnership(ADMIN_WALLET);
  await tx.wait();
  console.log("  ✓ MvaultToken ownership transferred");

  tx = await mvaultContract.transferOwnership(ADMIN_WALLET);
  await tx.wait();
  console.log("  ✓ MvaultContract ownership transferred");

  tx = await boardMatrix.transferOwnership(ADMIN_WALLET);
  await tx.wait();
  console.log("  ✓ MvaultBoardMatrix ownership transferred");

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════════");
  console.log("  DEPLOYMENT COMPLETE");
  console.log("══════════════════════════════════════════════════");
  console.log("  VITE_MVAULT_CONTRACT_ADDRESS=" + contractAddress);
  console.log("  VITE_MVT_TOKEN_ADDRESS=" + tokenAddress);
  console.log("  VITE_BOARD_MATRIX_ADDRESS=" + boardAddress);
  console.log("══════════════════════════════════════════════════\n");

  console.log("BSCScan links:");
  console.log("  Token:    https://testnet.bscscan.com/address/" + tokenAddress);
  console.log("  Contract: https://testnet.bscscan.com/address/" + contractAddress);
  console.log("  Board:    https://testnet.bscscan.com/address/" + boardAddress);

  // Return addresses for verification step
  return { contractAddress, tokenAddress, boardAddress };
}

main().catch((err) => {
  console.error("\n❌ Deployment failed:", err.message || err);
  process.exit(1);
});
