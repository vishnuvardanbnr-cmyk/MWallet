const { ethers } = require("hardhat");

const USDT_TESTNET    = "0x0D3E80cBc9DDC0a3Fdee912b99C50cd0b5761eE3";
const MVT_TOKEN_ADDR  = "0xCc5F1359901657E5D362d11b1AbB0e9498883f7c"; // newly deployed, unlinked

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log("\n══════════════════════════════════════════════════");
  console.log("  MvaultContract Only Deployment (with profile)");
  console.log("  Network:", network.name, "(chainId:", network.chainId.toString() + ")");
  console.log("  Deployer:", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("  BNB Balance:", ethers.formatEther(balance), "BNB");
  console.log("  Using MVT Token:", MVT_TOKEN_ADDR);
  console.log("══════════════════════════════════════════════════\n");

  console.log("[1/2] Deploying MvaultContract...");
  const ContractFactory = await ethers.getContractFactory("MvaultContract");
  const mvaultContract = await ContractFactory.deploy(USDT_TESTNET, MVT_TOKEN_ADDR);
  await mvaultContract.waitForDeployment();
  const contractAddress = await mvaultContract.getAddress();
  console.log("  ✓ MvaultContract deployed:", contractAddress);

  console.log("\n[2/2] Linking MvaultToken → MvaultContract...");
  const MVT_ABI = ["function setMvaultContract(address) external"];
  const mvtToken = new ethers.Contract(MVT_TOKEN_ADDR, MVT_ABI, deployer);
  const tx = await mvtToken.setMvaultContract(contractAddress);
  await tx.wait();
  console.log("  ✓ MvaultToken linked to new MvaultContract");

  console.log("\n══════════════════════════════════════════════════");
  console.log("  DEPLOYMENT COMPLETE");
  console.log("══════════════════════════════════════════════════");
  console.log("  VITE_MVT_TOKEN_ADDRESS=" + MVT_TOKEN_ADDR);
  console.log("  VITE_MVAULT_CONTRACT_ADDRESS=" + contractAddress);
  console.log("══════════════════════════════════════════════════");
  console.log("\nBSCScan:");
  console.log("  Token:    https://testnet.bscscan.com/address/" + MVT_TOKEN_ADDR);
  console.log("  Contract: https://testnet.bscscan.com/address/" + contractAddress);
}

main().catch((err) => {
  console.error("\n❌ Deployment failed:", err.message || err);
  process.exit(1);
});
