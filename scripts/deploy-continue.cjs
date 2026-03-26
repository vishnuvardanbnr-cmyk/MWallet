/**
 * Continuation deploy script — runs from step 3.
 * MvaultToken and MvaultContract were already deployed; this deploys
 * the BoardMatrix and links all three contracts together.
 *
 * Usage:
 *   npx hardhat run scripts/deploy-continue.cjs --network bscTestnet
 */
const { ethers } = require("hardhat");

// ── Already-deployed addresses from step 1+2 ─────────────────────────────
const USDT_TESTNET      = "0x0D3E80cBc9DDC0a3Fdee912b99C50cd0b5761eE3";
const MVT_TOKEN_ADDR    = "0xa986C2aa3FC2A799856CdC8CC08d0bB1CfE523b1";
const MVAULT_ADDR       = "0x39479f495c83E9FC0FB6206ADe884b3eCAEFAFf3";

async function main() {
  const [deployer] = await ethers.getSigners();
  const network    = await ethers.provider.getNetwork();

  console.log("\n══════════════════════════════════════════════════");
  console.log("  M-Vault Continuation Deploy (Step 3 onwards)");
  console.log("  Network:", network.name, "(chainId:", network.chainId.toString() + ")");
  console.log("  Deployer:", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("  BNB Balance:", ethers.formatEther(balance), "BNB");
  console.log("══════════════════════════════════════════════════\n");
  console.log("  Using MvaultToken:    ", MVT_TOKEN_ADDR);
  console.log("  Using MvaultContract: ", MVAULT_ADDR);
  console.log("");

  // ── 3. Deploy MvaultBoardMatrix ──────────────────────────────────────────
  console.log("[3/5] Deploying MvaultBoardMatrix...");
  const BoardFactory = await ethers.getContractFactory("MvaultBoardMatrix");
  const boardMatrix  = await BoardFactory.deploy(USDT_TESTNET);
  await boardMatrix.waitForDeployment();
  const boardAddress = await boardMatrix.getAddress();
  console.log("  ✓ MvaultBoardMatrix deployed:", boardAddress);

  // ── 4. Link all three contracts ──────────────────────────────────────────
  console.log("\n[4/5] Linking contracts...");
  const TOKEN_ABI    = ["function setMvaultContract(address) external"];
  const MAIN_ABI     = ["function setBoardHandler(address) external"];
  const BOARD_ABI    = ["function setMvaultContract(address) external",
                        "function setLiquidityAddress(address) external",
                        "function setSystemAddress(address) external"];

  const mvaultToken    = new ethers.Contract(MVT_TOKEN_ADDR, TOKEN_ABI, deployer);
  const mvaultContract = new ethers.Contract(MVAULT_ADDR,   MAIN_ABI,  deployer);

  let tx;
  tx = await mvaultToken.setMvaultContract(MVAULT_ADDR);
  await tx.wait();
  console.log("  ✓ MvaultToken linked to MvaultContract");

  tx = await mvaultContract.setBoardHandler(boardAddress);
  await tx.wait();
  console.log("  ✓ MvaultContract board handler set");

  tx = await boardMatrix.setMvaultContract(MVAULT_ADDR);
  await tx.wait();
  console.log("  ✓ MvaultBoardMatrix linked to MvaultContract");

  // ── 5. Set liquidity/system address ─────────────────────────────────────
  console.log("\n[5/5] Setting liquidity & system addresses...");
  tx = await boardMatrix.setLiquidityAddress(deployer.address);
  await tx.wait();
  tx = await boardMatrix.setSystemAddress(deployer.address);
  await tx.wait();
  console.log("  ✓ Liquidity & system addresses set");

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════════");
  console.log("  DEPLOYMENT COMPLETE ✓");
  console.log("══════════════════════════════════════════════════");
  console.log("  VITE_MVT_TOKEN_ADDRESS=" + MVT_TOKEN_ADDR);
  console.log("  VITE_MVAULT_CONTRACT_ADDRESS=" + MVAULT_ADDR);
  console.log("  VITE_BOARD_HANDLER_ADDRESS=" + boardAddress);
  console.log("══════════════════════════════════════════════════\n");
  console.log("BSCScan links:");
  console.log("  Token:   https://testnet.bscscan.com/address/" + MVT_TOKEN_ADDR);
  console.log("  Contract:https://testnet.bscscan.com/address/" + MVAULT_ADDR);
  console.log("  Board:   https://testnet.bscscan.com/address/" + boardAddress);
}

main().catch((err) => {
  console.error("\n❌ Deployment failed:", err.message || err);
  process.exit(1);
});
