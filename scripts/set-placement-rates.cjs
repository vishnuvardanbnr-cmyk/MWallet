const { ethers } = require("hardhat");

const MVAULT = "0x02C090edDcDb8fDE8fD72CF271ab5Bf7E2f65D72";

// L1=5% L2-3=2% L4=1% L5-12=0.5% L13-20=0.4% L21-28=0.3% L29-30=0.2%
const RATES = [
  500, 200, 200, 100,
  50, 50, 50, 50, 50, 50, 50, 50,
  40, 40, 40, 40, 40, 40, 40, 40,
  30, 30, 30, 30, 30, 30, 30, 30,
  20, 20
];

async function main() {
  const total = RATES.reduce((a, b) => a + b, 0);
  console.log(`Rates: ${RATES.length} levels | Total: ${total}bp = ${total/100}% of grossMvt`);
  if (RATES.length !== 30) throw new Error("Must be exactly 30 rates");
  if (total !== 2000) throw new Error(`Must sum to 2000bp, got ${total}`);

  const [deployer] = await ethers.getSigners();
  console.log("Caller:", deployer.address);

  const abi = ["function setPlacementRates(uint256[30] calldata _rates) external"];
  const mvault = new ethers.Contract(MVAULT, abi, deployer);

  console.log("Sending setPlacementRates tx...");
  const tx = await mvault.setPlacementRates(RATES);
  console.log("tx hash:", tx.hash);
  await tx.wait();
  console.log("✓ Placement rates updated on-chain");
}

main().catch(e => { console.error("❌", e.message); process.exit(1); });
