/**
 * fix-staking-link.cjs
 *
 * Links MvaultStaking (0x93Df...) to the new MvaultContract (0xE4EF...).
 *
 * Requires TWO owner-only transactions, both signed by the ADMIN wallet (0x04E8...):
 *   1. MvaultStaking.setMvaultMain(0xE4EF...)   — updates staking module to new main contract
 *   2. MvaultContract.setStakingModule(0x93Df...) — registers staking module on new main contract
 *
 * Usage:
 *   ADMIN_PRIVATE_KEY=<admin_key_for_0x04E8...> node scripts/fix-staking-link.cjs
 *
 * If you don't have the admin key available as an env var, use BSCScan instead:
 *   Step A — https://testnet.bscscan.com/address/0x93Df0F185d4cDa43cA86d59D8EA9d02eECfdf36d#writeContract
 *            Connect admin wallet (0x04E8...) → call setMvaultMain → 0xE4EF243b488dc6257A8d44cD43003EF5c0CfDb04
 *   Step B — https://testnet.bscscan.com/address/0xE4EF243b488dc6257A8d44cD43003EF5c0CfDb04#writeContract
 *            Connect admin wallet (0x04E8...) → call setStakingModule → 0x93Df0F185d4cDa43cA86d59D8EA9d02eECfdf36d
 */

const { ethers } = require("ethers");

const RPC     = "https://bsc-testnet-rpc.publicnode.com";
const MVAULT  = "0xE4EF243b488dc6257A8d44cD43003EF5c0CfDb04";
const STAKING = "0x93Df0F185d4cDa43cA86d59D8EA9d02eECfdf36d";
const ADMIN_WALLET = "0x04E8c5B49dE683c5B44eF1269Bd5ee4f338868C4";

const ADMIN_PK = process.env.ADMIN_PRIVATE_KEY || "";

const STAKING_ABI = [
  "function setMvaultMain(address _main) external",
  "function mvaultMain() view returns (address)",
  "function owner() view returns (address)",
];
const MVAULT_ABI = [
  "function setStakingModule(address _staking) external",
  "function stakingModule() view returns (address)",
  "function owner() view returns (address)",
];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);

  // Verify current state
  const stakingC_ro = new ethers.Contract(STAKING, STAKING_ABI, provider);
  const mvaultC_ro  = new ethers.Contract(MVAULT,  MVAULT_ABI,  provider);
  const [stakingOwner, mvaultOwner, curMain, curStaking] = await Promise.all([
    stakingC_ro.owner(),
    mvaultC_ro.owner(),
    stakingC_ro.mvaultMain(),
    mvaultC_ro.stakingModule(),
  ]);

  console.log("=== Current On-Chain State ===");
  console.log("  MvaultStaking owner  :", stakingOwner);
  console.log("  MvaultContract owner :", mvaultOwner);
  console.log("  MvaultStaking.mvaultMain  :", curMain);
  console.log("  MvaultContract.stakingModule:", curStaking);
  console.log("");

  if (curMain.toLowerCase() === MVAULT.toLowerCase() && curStaking.toLowerCase() === STAKING.toLowerCase()) {
    console.log("✓ Already fully linked — nothing to do.");
    return;
  }

  if (!ADMIN_PK) {
    console.error("ERROR: ADMIN_PRIVATE_KEY not set.");
    console.error("The admin wallet", ADMIN_WALLET, "must sign both transactions.");
    console.error("");
    console.error("Manual BSCScan fix:");
    console.error("  Step A: https://testnet.bscscan.com/address/" + STAKING + "#writeContract");
    console.error("    → setMvaultMain(" + MVAULT + ")");
    console.error("  Step B: https://testnet.bscscan.com/address/" + MVAULT + "#writeContract");
    console.error("    → setStakingModule(" + STAKING + ")");
    process.exit(1);
  }

  const wallet = new ethers.Wallet(ADMIN_PK, provider);
  console.log("Signer:", wallet.address);

  if (wallet.address.toLowerCase() !== ADMIN_WALLET.toLowerCase()) {
    console.error("ERROR: ADMIN_PRIVATE_KEY resolves to", wallet.address);
    console.error("Expected admin wallet:", ADMIN_WALLET);
    console.error("");
    console.error("The key provided is NOT the admin wallet. Both contracts are owned by", ADMIN_WALLET);
    console.error("Please use BSCScan with MetaMask connected to the admin wallet:");
    console.error("  Step A: https://testnet.bscscan.com/address/" + STAKING + "#writeContract");
    console.error("    → setMvaultMain(" + MVAULT + ")");
    console.error("  Step B: https://testnet.bscscan.com/address/" + MVAULT + "#writeContract");
    console.error("    → setStakingModule(" + STAKING + ")");
    process.exit(1);
  }

  const stakingC = new ethers.Contract(STAKING, STAKING_ABI, wallet);
  const mvaultC  = new ethers.Contract(MVAULT,  MVAULT_ABI,  wallet);

  // Step 1: point staking module at new main contract
  if (curMain.toLowerCase() !== MVAULT.toLowerCase()) {
    console.log("Step 1: setMvaultMain on staking module...");
    const tx1 = await stakingC.setMvaultMain(MVAULT, { gasLimit: 100_000 });
    console.log("  tx:", tx1.hash);
    await tx1.wait();
    const newMain = await stakingC.mvaultMain();
    console.log("  ✓ mvaultMain is now:", newMain);
  } else {
    console.log("Step 1: skipped — mvaultMain already correct.");
  }

  // Step 2: register staking module on new main contract
  if (curStaking.toLowerCase() !== STAKING.toLowerCase()) {
    console.log("Step 2: setStakingModule on new MvaultContract...");
    const tx2 = await mvaultC.setStakingModule(STAKING, { gasLimit: 100_000 });
    console.log("  tx:", tx2.hash);
    await tx2.wait();
    const newStaking = await mvaultC.stakingModule();
    console.log("  ✓ stakingModule is now:", newStaking);
  } else {
    console.log("Step 2: skipped — stakingModule already correct.");
  }

  console.log("\n✓ Staking fully linked. Users can now stake.");
}

main().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
