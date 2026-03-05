const hre = require("hardhat");

const MLM_ADDRESS   = "0x4EdDD28d52901898133dB5643e9137dcDa31AD52";
const BOARD_ADDRESS = "0x7ad7bfe3b717fA581e0383F1B2c21ED26A0C5465";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const MLM = await hre.ethers.getContractAt("MLMContract", MLM_ADDRESS);
  console.log("Calling setBoardHandler on MLMContract...");
  const tx = await MLM.setBoardHandler(BOARD_ADDRESS);
  await tx.wait();
  console.log("Done! TX:", tx.hash);
  console.log("MLMContract now linked to BoardMatrixHandler:", BOARD_ADDRESS);
}

main().catch((err) => { console.error(err); process.exit(1); });
