const hre = require("hardhat");

const USDT_TESTNET        = "0x0D3E80cBc9DDC0a3Fdee912b99C50cd0b5761eE3";
const ADMIN_WALLET        = "0x127323b3053a901620f8d461c88fc6a7d9c7de2e";
const TOKEN_DECIMALS      = 18;
const EXISTING_BOARD_ADDR = "0xAFDf34f6e2FBa1D1E9b1E4e180821b463c3cB72D";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Deployer:", deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "BNB");

  console.log("\n[1/1] Deploying MLMContract (with STARTER package)...");
  const MLMFactory = await hre.ethers.getContractFactory("MLMContract");
  const mlm = await MLMFactory.deploy(USDT_TESTNET, TOKEN_DECIMALS, ADMIN_WALLET, ADMIN_WALLET);
  await mlm.waitForDeployment();
  const mlmAddr = await mlm.getAddress();
  console.log("      ✓ MLMContract:", mlmAddr);

  console.log("\n[+] Linking contracts...");
  await (await mlm.setBoardHandler(EXISTING_BOARD_ADDR)).wait();
  console.log("      ✓ MLMContract.setBoardHandler →", EXISTING_BOARD_ADDR);

  const board = await hre.ethers.getContractAt("BoardMatrixHandler", EXISTING_BOARD_ADDR);
  await (await board.setMLMContract(mlmAddr)).wait();
  console.log("      ✓ BoardMatrixHandler.setMLMContract →", mlmAddr);

  console.log("\n══════════════════════════════════════════");
  console.log("  ✅ DONE — New MLMContract with STARTER");
  console.log("══════════════════════════════════════════");
  console.log("  MLMContract:", mlmAddr);
  console.log("  BoardHandler (unchanged):", EXISTING_BOARD_ADDR);
  console.log("\nVITE_CONTRACT_ADDRESS=" + mlmAddr);
}

main().catch((err) => { console.error(err); process.exit(1); });
