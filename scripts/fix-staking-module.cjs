/**
 * Fix staking module: redeploy MvaultStaking with correct MVT token address.
 *
 * Root cause: the deployed staking module at 0xA1A9569... was constructed
 * with an old/wrong mvaultToken address (0xf7417d...). Since mvaultToken is
 * immutable there is no setter — we must redeploy and re-link.
 *
 * Steps:
 *   1. Deploy new MvaultStaking (owner=deployer, correct mvaultToken)
 *   2. MvaultContract.setStakingModule(newStaking)
 *   3. MvaultToken.setStakingModule(newStaking)
 *
 * Usage (on VPS where DEPLOYER_PRIVATE_KEY is set in .env):
 *   npx hardhat run scripts/fix-staking-module.cjs --network mchain
 */

const { ethers } = require("hardhat");

const MAIN_CONTRACT  = "0x60c5bd746f6245ecE5daC006082a7bd13f521aF8";
const MVT_TOKEN      = "0x183a4A6b843ce85D1e363D7a1820f404fccDD726";
const USDT           = "0xab8c6267dcca9e70b625014c8f77eee9728e14c3";

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log("═══════════════════════════════════════════════════");
  console.log("  Fix: Redeploy MvaultStaking (correct mvaultToken)");
  console.log("  Network:", network.name, "(chainId:", network.chainId.toString() + ")");
  console.log("  Deployer:", deployer.address);
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log("  Balance:", ethers.formatEther(bal), "MCC");
  console.log("═══════════════════════════════════════════════════\n");

  // ── 1. Deploy new MvaultStaking ─────────────────────────────────────────
  console.log("[1/3] Deploying new MvaultStaking...");
  console.log("  owner:      ", deployer.address);
  console.log("  mvaultMain: ", MAIN_CONTRACT);
  console.log("  usdt:       ", USDT);
  console.log("  mvaultToken:", MVT_TOKEN);

  const StakingFactory = await ethers.getContractFactory("MvaultStaking");
  const newStaking = await StakingFactory.deploy(
    deployer.address,
    MAIN_CONTRACT,
    USDT,
    MVT_TOKEN
  );
  await newStaking.waitForDeployment();
  const newStakingAddr = await newStaking.getAddress();
  console.log("  ✓ New MvaultStaking:", newStakingAddr);

  // ── 2. Link: MvaultContract.setStakingModule ─────────────────────────────
  console.log("\n[2/3] Linking MvaultContract.setStakingModule...");
  const mainAbi = [
    "function setStakingModule(address _staking) external",
    "function stakingModule() view returns (address)",
  ];
  const mainContract = new ethers.Contract(MAIN_CONTRACT, mainAbi, deployer);
  const tx1 = await mainContract.setStakingModule(newStakingAddr, { gasLimit: 100_000 });
  await tx1.wait();
  const verifyMain = await mainContract.stakingModule();
  console.log("  ✓ MvaultContract.stakingModule:", verifyMain);

  // ── 3. Link: MvaultToken.setStakingModule ────────────────────────────────
  console.log("\n[3/3] Linking MvaultToken.setStakingModule...");
  const tokenAbi = [
    "function setStakingModule(address _staking) external",
    "function stakingModule() view returns (address)",
  ];
  const mvtToken = new ethers.Contract(MVT_TOKEN, tokenAbi, deployer);
  const tx2 = await mvtToken.setStakingModule(newStakingAddr, { gasLimit: 100_000 });
  await tx2.wait();
  const verifyToken = await mvtToken.stakingModule();
  console.log("  ✓ MvaultToken.stakingModule:", verifyToken);

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  DONE — update your .env:");
  console.log(`  VITE_MVAULT_STAKING_ADDRESS=${newStakingAddr}`);
  console.log("═══════════════════════════════════════════════════\n");
}

main().catch(e => { console.error(e); process.exit(1); });
