const hre = require("hardhat");

const USDT_TESTNET   = "0x0D3E80cBc9DDC0a3Fdee912b99C50cd0b5761eE3";
const ADMIN_WALLET   = "0x127323b3053a901620f8d461c88fc6a7d9c7de2e";
const MLM_ADDRESS    = "0xcC2c4171B84D60403fEE997523C030Eb6f6459b8";
const TOKEN_DECIMALS = 18;

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const Board = await hre.ethers.getContractFactory("BoardMatrixHandler");
  const board = await Board.deploy(USDT_TESTNET, TOKEN_DECIMALS);
  await board.waitForDeployment();
  const boardAddr = await board.getAddress();
  console.log("BoardMatrixHandler deployed:", boardAddr);

  console.log("Configuring BoardMatrixHandler...");
  await (await board.setMLMContract(MLM_ADDRESS)).wait();
  await (await board.setSystemAddress(ADMIN_WALLET)).wait();
  await (await board.setCoinLiquidityAddress(ADMIN_WALLET)).wait();
  console.log("Configuration done");

  console.log("Linking MLMContract → new BoardMatrixHandler...");
  const MLM = await hre.ethers.getContractAt("MLMContract", MLM_ADDRESS);
  await (await MLM.setBoardMatrix(boardAddr)).wait();
  console.log("Linked.");

  console.log("\n=== NEW BOARD ADDRESS ===");
  console.log("BOARD_MATRIX_ADDRESS=" + boardAddr);
}

main().catch((err) => { console.error(err); process.exit(1); });
