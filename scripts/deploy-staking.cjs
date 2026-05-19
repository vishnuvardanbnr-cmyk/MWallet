/**
 * deploy-staking.cjs
 * Redeploys MvaultStaking with the updated distribution (70% user / 10% admin / 20% levels)
 * then re-links it to the live MvaultContract.
 *
 * Usage:
 *   npx hardhat run scripts/deploy-staking.cjs --network bscTestnet
 */
const { ethers } = require("hardhat");

const USDT_TESTNET   = "0x0D3E80cBc9DDC0a3Fdee912b99C50cd0b5761eE3";
const MVT_TOKEN_ADDR = "0x0Fa6a0758E7246310BFbcdA33716ADD2F5013F46";
const MVAULT_ADDR    = "0x0842dEF1b1799dbF0588832ecfe7df5D47bF133f";

async function main() {
  const [deployer] = await ethers.getSigners();
  const network    = await ethers.provider.getNetwork();

  console.log("\n══════════════════════════════════════════════════");
  console.log("  MvaultStaking Redeploy (updated distribution)");
  console.log("  Network :", network.name, "(chainId:", network.chainId.toString() + ")");
  console.log("  Deployer:", deployer.address);
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log("  BNB Bal :", ethers.formatEther(bal), "BNB");
  console.log("══════════════════════════════════════════════════\n");

  // ── 1. Deploy MvaultStaking ──────────────────────────────────────────────
  console.log("[1/3] Deploying MvaultStaking...");
  const StakingFactory = await ethers.getContractFactory("MvaultStaking");
  const staking = await StakingFactory.deploy(
    deployer.address,  // owner
    MVAULT_ADDR,       // mvaultMain
    USDT_TESTNET,      // usdt
    MVT_TOKEN_ADDR,    // mvaultToken
  );
  await staking.waitForDeployment();
  const STAKING_ADDR = await staking.getAddress();
  console.log("  ✓ MvaultStaking deployed:", STAKING_ADDR);

  // ── 2. Link: MvaultContract.setStakingModule(newStaking) ────────────────
  console.log("\n[2/3] Linking: MvaultContract → new staking...");
  const MVAULT_ABI = ["function setStakingModule(address) external", "function stakingModule() view returns (address)"];
  const mvault = new ethers.Contract(MVAULT_ADDR, MVAULT_ABI, deployer);
  const tx1 = await mvault.setStakingModule(STAKING_ADDR, { gasLimit: 100_000 });
  console.log("  tx:", tx1.hash);
  await tx1.wait();
  const linked = await mvault.stakingModule();
  console.log("  ✓ stakingModule is now:", linked);

  // ── 3. Verify both sides ─────────────────────────────────────────────────
  console.log("\n[3/3] Verifying...");
  const STAKING_ABI = ["function mvaultMain() view returns (address)"];
  const stakingC = new ethers.Contract(STAKING_ADDR, STAKING_ABI, deployer);
  const mvaultMain = await stakingC.mvaultMain();
  console.log("  MvaultStaking.mvaultMain   :", mvaultMain);
  console.log("  MvaultContract.stakingModule:", linked);
  const ok = mvaultMain.toLowerCase() === MVAULT_ADDR.toLowerCase() &&
             linked.toLowerCase()    === STAKING_ADDR.toLowerCase();
  console.log("  Link status:", ok ? "✓ FULLY LINKED" : "✗ MISMATCH — check manually");

  console.log("\n══════════════════════════════════════════════════");
  console.log("  DEPLOY COMPLETE ✓");
  console.log("══════════════════════════════════════════════════");
  console.log("  VITE_STAKING_ADDRESS=" + STAKING_ADDR);
  console.log("  Update replit.md + update-vps.sh with this address");
  console.log("══════════════════════════════════════════════════\n");
}

main().catch(err => {
  console.error("\n❌ Failed:", err.message || err);
  process.exit(1);
});
