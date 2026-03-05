const hre = require("hardhat");

const USDT_TESTNET   = "0x0D3E80cBc9DDC0a3Fdee912b99C50cd0b5761eE3";
const ADMIN_WALLET   = "0x127323b3053a901620f8d461c88fc6a7d9c7de2e";
const MLM_ADDRESS    = "0x4EdDD28d52901898133dB5643e9137dcDa31AD52";
const TOKEN_DECIMALS = 18;

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("BNB balance:", hre.ethers.formatEther(balance));

  console.log("\nDeploying BoardMatrixHandler with deposit vault...");
  const Board = await hre.ethers.getContractFactory("BoardMatrixHandler");
  const board = await Board.deploy(USDT_TESTNET, TOKEN_DECIMALS);
  await board.waitForDeployment();
  const boardAddr = await board.getAddress();
  console.log("BoardMatrixHandler deployed:", boardAddr);

  console.log("\nConfiguring BoardMatrixHandler...");
  await (await board.setMLMContract(MLM_ADDRESS)).wait();
  console.log("  setMLMContract done");
  await (await board.setSystemAddress(ADMIN_WALLET)).wait();
  console.log("  setSystemAddress done");
  await (await board.setCoinLiquidityAddress(ADMIN_WALLET)).wait();
  console.log("  setCoinLiquidityAddress done");

  console.log("\nLinking MLMContract -> new BoardMatrixHandler...");
  const MLM = await hre.ethers.getContractAt("MLMContract", MLM_ADDRESS);
  await (await MLM.setBoardMatrix(boardAddr)).wait();
  console.log("  setBoardMatrix done");

  console.log("\n=== DEPLOYMENT COMPLETE ===");
  console.log("NEW_BOARD_HANDLER_ADDRESS=" + boardAddr);
  console.log("MLM_ADDRESS=" + MLM_ADDRESS);
}

main().catch((err) => { console.error(err); process.exit(1); });
