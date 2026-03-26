const { ethers } = require("hardhat");

const MVAULT_CONTRACT = "0x061A05290a668D30b8Ab5A52d8b2Ca115a3121FE";

const ABI = [
  "function getPoolBalances() view returns (uint256 binary, uint256 reserve, uint256 admin)",
  "function getAllUsersCount() view returns (uint256)",
  "function distributeBinaryIncome(uint256 offset, uint256 limit) external",
  "function distributePowerLeg(uint256 offset, uint256 limit) external",
];

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log("\n══════════════════════════════════════════════");
  console.log("  M-Vault Binary Distribution");
  console.log("  Network:", network.name, "(chainId:", network.chainId.toString() + ")");
  console.log("  Deployer:", deployer.address);
  const bnbBal = await ethers.provider.getBalance(deployer.address);
  console.log("  BNB Balance:", ethers.formatEther(bnbBal), "BNB");
  console.log("══════════════════════════════════════════════\n");

  const contract = new ethers.Contract(MVAULT_CONTRACT, ABI, deployer);

  // ── Read current state ──────────────────────────────────────────────
  const [binaryPool, reservePool, adminPool] = await contract.getPoolBalances();
  const totalUsers = await contract.getAllUsersCount();

  console.log("Pool Balances:");
  console.log("  Binary Pool :", ethers.formatUnits(binaryPool, 18), "MVT");
  console.log("  Reserve Pool:", ethers.formatUnits(reservePool, 18), "MVT");
  console.log("  Admin Pool  :", ethers.formatUnits(adminPool, 18), "MVT");
  console.log("  Total Users :", totalUsers.toString());

  if (binaryPool === 0n) {
    console.log("\n⚠  Binary pool is empty — nothing to distribute.");
    return;
  }

  const BATCH = 100n; // process up to 100 users per tx (gas safe)
  const count = totalUsers;

  // ── Step 1: distributeBinaryIncome ─────────────────────────────────
  console.log("\n[Step 1] distributeBinaryIncome — distributing 70% pair income + assigning powerLeg points");

  let offset = 0n;
  while (offset < count) {
    const limit = offset + BATCH > count ? count - offset : BATCH;
    console.log(`  → offset=${offset} limit=${limit}`);
    const tx = await contract.distributeBinaryIncome(offset, limit);
    const receipt = await tx.wait();
    console.log("    ✓ tx:", receipt.hash, "  gas used:", receipt.gasUsed.toString());
    offset += BATCH;
    // only one batch needed for Step 1 (contract resets binaryPool and sets _binaryDistributed=true on first call)
    // subsequent offsets in same cycle would revert, so break after first batch
    break;
  }

  // ── Step 2: distributePowerLeg ──────────────────────────────────────
  console.log("\n[Step 2] distributePowerLeg — distributing 30% power-leg reserve + resetting points");

  offset = 0n;
  while (offset < count) {
    const limit = offset + BATCH > count ? count - offset : BATCH;
    console.log(`  → offset=${offset} limit=${limit}`);
    const tx = await contract.distributePowerLeg(offset, limit);
    const receipt = await tx.wait();
    console.log("    ✓ tx:", receipt.hash, "  gas used:", receipt.gasUsed.toString());
    offset += BATCH;
    // distributePowerLeg resets _binaryDistributed=false and clears _powerLeg30Reserve on first full pass
    break;
  }

  console.log("\n✅ Binary distribution complete!");

  // ── Confirm updated pools ───────────────────────────────────────────
  const [bp2, rp2, ap2] = await contract.getPoolBalances();
  console.log("\nUpdated Pool Balances:");
  console.log("  Binary Pool :", ethers.formatUnits(bp2, 18), "MVT");
  console.log("  Reserve Pool:", ethers.formatUnits(rp2, 18), "MVT");
  console.log("  Admin Pool  :", ethers.formatUnits(ap2, 18), "MVT");
}

main().catch((e) => { console.error(e); process.exit(1); });
