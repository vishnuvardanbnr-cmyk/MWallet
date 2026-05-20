/**
 * Full redeploy script for MvaultContract (placement income update).
 *
 * Steps performed:
 *  1. Deploy new MvaultContract
 *  2. Link MvaultToken → new MvaultContract
 *  3. Set board handler on new MvaultContract
 *  4. Link BoardMatrix → new MvaultContract
 *  5. Link MvaultStaking → new MvaultContract
 *  6. Deploy MvaultView → new MvaultContract
 *
 * Usage:
 *   npx hardhat run scripts/deploy-new-mvault.cjs --network bscTestnet
 */
const { ethers } = require("hardhat");

// ── Unchanged addresses ────────────────────────────────────────────────────
const USDT_ADDR    = "0x0D3E80cBc9DDC0a3Fdee912b99C50cd0b5761eE3";
const MVT_ADDR     = "0x0Fa6a0758E7246310BFbcdA33716ADD2F5013F46";
const BOARD_ADDR   = "0xBe50465bEb3b59aC7E2aA2E062da77CB1653b8aa";
const STAKING_ADDR = "0x8d79C3004e7A1aF8AE4e3C0f9BE21934d7e54dA8";

async function main() {
  const [deployer] = await ethers.getSigners();
  const network    = await ethers.provider.getNetwork();

  console.log("\n══════════════════════════════════════════════════");
  console.log("  MvaultContract Full Redeploy (Placement Income)");
  console.log("  Network:", network.name, "(chainId:", network.chainId.toString() + ")");
  console.log("  Deployer:", deployer.address);
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log("  BNB Balance:", ethers.formatEther(bal), "BNB");
  console.log("══════════════════════════════════════════════════\n");

  // ── 1. Deploy new MvaultContract ─────────────────────────────────────────
  console.log("[1/6] Deploying MvaultContract...");
  const MvaultFactory = await ethers.getContractFactory("MvaultContract");
  const mvault = await MvaultFactory.deploy(USDT_ADDR, MVT_ADDR);
  await mvault.waitForDeployment();
  const MVAULT_NEW = await mvault.getAddress();
  console.log("  ✓ MvaultContract:", MVAULT_NEW);

  // ── 2. Link MvaultToken → new MvaultContract ──────────────────────────────
  console.log("\n[2/6] Linking MvaultToken → new MvaultContract...");
  const mvtToken = new ethers.Contract(
    MVT_ADDR,
    ["function setMvaultContract(address) external"],
    deployer
  );
  let tx = await mvtToken.setMvaultContract(MVAULT_NEW);
  await tx.wait();
  console.log("  ✓ MvaultToken linked");

  // ── 3. Set board handler on new MvaultContract ────────────────────────────
  console.log("\n[3/6] Setting board handler on new MvaultContract...");
  const mvaultContract = new ethers.Contract(
    MVAULT_NEW,
    [
      "function setBoardHandler(address) external",
      "function setStakingModule(address) external",
    ],
    deployer
  );
  tx = await mvaultContract.setBoardHandler(BOARD_ADDR);
  await tx.wait();
  console.log("  ✓ Board handler set");

  // ── 4. Link BoardMatrix → new MvaultContract ──────────────────────────────
  console.log("\n[4/6] Linking BoardMatrix → new MvaultContract...");
  const boardMatrix = new ethers.Contract(
    BOARD_ADDR,
    ["function setMvaultContract(address) external"],
    deployer
  );
  tx = await boardMatrix.setMvaultContract(MVAULT_NEW);
  await tx.wait();
  console.log("  ✓ BoardMatrix linked");

  // ── 5. Link MvaultStaking → new MvaultContract ───────────────────────────
  console.log("\n[5/6] Linking MvaultStaking → new MvaultContract...");
  tx = await mvaultContract.setStakingModule(STAKING_ADDR);
  await tx.wait();

  const staking = new ethers.Contract(
    STAKING_ADDR,
    ["function setMvaultMain(address) external"],
    deployer
  );
  tx = await staking.setMvaultMain(MVAULT_NEW);
  await tx.wait();
  console.log("  ✓ MvaultStaking linked");

  // ── 6. Deploy MvaultView ─────────────────────────────────────────────────
  console.log("\n[6/6] Deploying MvaultView → new MvaultContract...");
  const ViewFactory = await ethers.getContractFactory("MvaultView");
  const view = await ViewFactory.deploy(MVAULT_NEW, { gasLimit: 2_000_000 });
  await view.waitForDeployment();
  const VIEW_NEW = await view.getAddress();
  console.log("  ✓ MvaultView:", VIEW_NEW);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════════");
  console.log("  DEPLOYMENT COMPLETE ✓");
  console.log("══════════════════════════════════════════════════");
  console.log("  VITE_MVAULT_CONTRACT_ADDRESS=" + MVAULT_NEW);
  console.log("  VITE_MVT_TOKEN_ADDRESS="       + MVT_ADDR);
  console.log("  VITE_PAYMENT_TOKEN_ADDRESS="   + USDT_ADDR);
  console.log("  VITE_BOARD_HANDLER_ADDRESS="   + BOARD_ADDR);
  console.log("  VITE_MVAULT_VIEW_ADDRESS="     + VIEW_NEW);
  console.log("══════════════════════════════════════════════════");
  console.log("\nBSCScan:");
  console.log("  Contract:", "https://testnet.bscscan.com/address/" + MVAULT_NEW);
  console.log("  View    :", "https://testnet.bscscan.com/address/" + VIEW_NEW);
}

main().catch((err) => {
  console.error("\n❌ Deployment failed:", err.message || err);
  process.exit(1);
});
