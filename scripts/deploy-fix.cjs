const hre = require("hardhat");

const USDT_TESTNET        = "0x0D3E80cBc9DDC0a3Fdee912b99C50cd0b5761eE3";
const ADMIN_WALLET        = "0x127323b3053a901620f8d461c88fc6a7d9c7de2e";
const TOKEN_DECIMALS      = 18;
const EXISTING_BOARD_ADDR = "0x7ad7bfe3b717fA581e0383F1B2c21ED26A0C5465";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Deployer:", deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "BNB");

  const gwei2 = hre.ethers.parseUnits("2", "gwei");

  console.log("\nDeploying MLMContract...");
  const MLMFactory = await hre.ethers.getContractFactory("MLMContract");
  const mlm = await MLMFactory.deploy(
    USDT_TESTNET, TOKEN_DECIMALS, ADMIN_WALLET, ADMIN_WALLET,
    { gasPrice: gwei2, gasLimit: 9000000 }
  );
  await mlm.waitForDeployment();
  const mlmAddr = await mlm.getAddress();
  console.log("MLMContract:", mlmAddr);

  console.log("Linking board handler...");
  await (await mlm.setBoardHandler(EXISTING_BOARD_ADDR, { gasPrice: gwei2 })).wait();
  console.log("setBoardHandler done");

  const board = await hre.ethers.getContractAt("BoardMatrixHandler", EXISTING_BOARD_ADDR);
  await (await board.setMLMContract(mlmAddr, { gasPrice: gwei2 })).wait();
  console.log("setMLMContract done");

  console.log("\nVITE_CONTRACT_ADDRESS=" + mlmAddr);
}

main().catch((err) => { console.error(err); process.exit(1); });
