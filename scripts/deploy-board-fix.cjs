const hre = require("hardhat");

const USDT_TESTNET   = "0x0D3E80cBc9DDC0a3Fdee912b99C50cd0b5761eE3";
const ADMIN_WALLET   = "0x127323b3053a901620f8d461c88fc6a7d9c7de2e";
const MLM_ADDRESS    = "0x284dcb5C8F2407c135713a093A4fB42Ef2b1bCBF";
const TOKEN_DECIMALS = 18;

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Deployer:", deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "BNB");

  const gwei1 = hre.ethers.parseUnits("1", "gwei");

  console.log("\nDeploying BoardMatrixHandler...");
  const Board = await hre.ethers.getContractFactory("BoardMatrixHandler");
  const board = await Board.deploy(USDT_TESTNET, TOKEN_DECIMALS, { gasPrice: gwei1, gasLimit: 4000000 });
  await board.waitForDeployment();
  const boardAddr = await board.getAddress();
  console.log("BoardMatrixHandler:", boardAddr);

  console.log("Configuring board...");
  await (await board.setMLMContract(MLM_ADDRESS, { gasPrice: gwei1 })).wait();
  console.log("  setMLMContract done");
  await (await board.setSystemAddress(ADMIN_WALLET, { gasPrice: gwei1 })).wait();
  console.log("  setSystemAddress done");
  await (await board.setCoinLiquidityAddress(ADMIN_WALLET, { gasPrice: gwei1 })).wait();
  console.log("  setCoinLiquidityAddress done");

  console.log("Linking MLMContract → new board...");
  const mlm = await hre.ethers.getContractAt("MLMContract", MLM_ADDRESS);
  await (await mlm.setBoardHandler(boardAddr, { gasPrice: gwei1 })).wait();
  console.log("  setBoardHandler done");

  console.log("\nBOARD_ADDRESS=" + boardAddr);
}

main().catch((err) => { console.error(err); process.exit(1); });
