const { ethers } = require("hardhat");

const MVAULT_ADDRESS = "0x62BF7ab4A0D3f7698314e7FC13307C93C58C975B";

const ABI = [
  "function getPoolBalances() view returns (uint256 binary, uint256 reserve, uint256 admin)",
  "function getAllUsersCount() view returns (uint256)",
  "function distributeBinaryIncome(uint256 offset, uint256 limit) external",
  "function distributePowerLeg(uint256 offset, uint256 limit) external",
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const contract = new ethers.Contract(MVAULT_ADDRESS, ABI, deployer);

  const [binary, reserve, admin] = await contract.getPoolBalances();
  const totalUsers = await contract.getAllUsersCount();

  console.log("\n── Pool State ─────────────────────────────────");
  console.log("  Binary Pool:       $" + ethers.formatEther(binary));
  console.log("  PowerLeg Reserve:  $" + ethers.formatEther(reserve));
  console.log("  Admin Pool:        $" + ethers.formatEther(admin));
  console.log("  Total Users:       " + totalUsers.toString());
  console.log("────────────────────────────────────────────────\n");

  const limit = Number(totalUsers) > 0 ? Number(totalUsers) : 1000;

  if (binary > 0n) {
    console.log("[Step 1] Distributing Binary Income...");
    const tx1 = await contract.distributeBinaryIncome(0, limit);
    console.log("  tx:", tx1.hash);
    await tx1.wait();
    console.log("  ✓ Binary income distributed\n");
  } else {
    console.log("[Step 1] Skipped — Binary Pool is empty\n");
  }

  const [, reserve2] = await contract.getPoolBalances();

  if (reserve2 > 0n) {
    console.log("[Step 2] Distributing Power Leg...");
    const tx2 = await contract.distributePowerLeg(0, limit);
    console.log("  tx:", tx2.hash);
    await tx2.wait();
    console.log("  ✓ Power leg distributed\n");
  } else {
    console.log("[Step 2] Skipped — Power Leg Reserve is empty\n");
  }

  const [b2, r2, a2] = await contract.getPoolBalances();
  console.log("── Final Pool State ────────────────────────────");
  console.log("  Binary Pool:       $" + ethers.formatEther(b2));
  console.log("  PowerLeg Reserve:  $" + ethers.formatEther(r2));
  console.log("  Admin Pool:        $" + ethers.formatEther(a2));
  console.log("────────────────────────────────────────────────");
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("❌ Failed:", err.shortMessage || err.reason || err.message || err);
  process.exit(1);
});
