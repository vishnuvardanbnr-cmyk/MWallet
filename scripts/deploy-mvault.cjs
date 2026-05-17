const { ethers } = require("hardhat");

const USDT_TESTNET   = "0x0D3E80cBc9DDC0a3Fdee912b99C50cd0b5761eE3";
const MANAGER_WALLET = "0x12Fcf3d1084455d3677a110925D73b01F3846750";

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log("\n══════════════════════════════════════════════════");
  console.log("  M-Vault Full Deployment (deployer keeps ownership)");
  console.log("  Network:", network.name, "(chainId:", network.chainId.toString() + ")");
  console.log("  Deployer:", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("  BNB Balance:", ethers.formatEther(balance), "BNB");
  console.log("══════════════════════════════════════════════════\n");

  // ── 1. Deploy MvaultToken ────────────────────────────────────────────────
  console.log("[1/6] Deploying MvaultToken...");
  const TokenFactory = await ethers.getContractFactory("MvaultToken");
  const mvaultToken = await TokenFactory.deploy(USDT_TESTNET);
  await mvaultToken.waitForDeployment();
  const tokenAddress = await mvaultToken.getAddress();
  console.log("  ✓ MvaultToken deployed:", tokenAddress);

  // ── 2. Deploy MvaultContract ─────────────────────────────────────────────
  console.log("\n[2/6] Deploying MvaultContract...");
  const ContractFactory = await ethers.getContractFactory("MvaultContract");
  const mvaultContract = await ContractFactory.deploy(USDT_TESTNET, tokenAddress);
  await mvaultContract.waitForDeployment();
  const contractAddress = await mvaultContract.getAddress();
  console.log("  ✓ MvaultContract deployed:", contractAddress);

  // ── 3. Deploy MvaultBoardMatrix ──────────────────────────────────────────
  console.log("\n[3/6] Deploying MvaultBoardMatrix...");
  const BoardFactory = await ethers.getContractFactory("MvaultBoardMatrix");
  const boardMatrix = await BoardFactory.deploy(USDT_TESTNET);
  await boardMatrix.waitForDeployment();
  const boardAddress = await boardMatrix.getAddress();
  console.log("  ✓ MvaultBoardMatrix deployed:", boardAddress);

  // ── 4. Deploy MvaultStaking (deployer = owner) ───────────────────────────
  console.log("\n[4/6] Deploying MvaultStaking...");
  const StakingFactory = await ethers.getContractFactory("MvaultStaking");
  const mvaultStaking = await StakingFactory.deploy(
    deployer.address,   // owner = deployer (keeps full control)
    contractAddress,
    USDT_TESTNET,
    tokenAddress
  );
  await mvaultStaking.waitForDeployment();
  const stakingAddress = await mvaultStaking.getAddress();
  console.log("  ✓ MvaultStaking deployed:", stakingAddress);

  // ── 5. Link all contracts ────────────────────────────────────────────────
  console.log("\n[5/6] Linking contracts...");
  let tx;

  tx = await mvaultToken.setMvaultContract(contractAddress);
  await tx.wait();
  console.log("  ✓ MvaultToken linked to MvaultContract");

  tx = await mvaultToken.setStakingModule(stakingAddress);
  await tx.wait();
  console.log("  ✓ MvaultToken staking module set");

  tx = await mvaultContract.setBoardHandler(boardAddress);
  await tx.wait();
  console.log("  ✓ MvaultContract board handler set");

  tx = await mvaultContract.setStakingModule(stakingAddress);
  await tx.wait();
  console.log("  ✓ MvaultContract staking module set");

  tx = await boardMatrix.setMvaultContract(contractAddress);
  await tx.wait();
  console.log("  ✓ MvaultBoardMatrix linked to MvaultContract");

  // ── 6. Set liquidity, system addresses & manager ─────────────────────────
  console.log("\n[6/6] Setting liquidity, system addresses & manager...");
  tx = await boardMatrix.setLiquidityAddress(deployer.address);
  await tx.wait();
  tx = await boardMatrix.setSystemAddress(deployer.address);
  await tx.wait();
  console.log("  ✓ Liquidity + system address set to deployer");

  tx = await mvaultContract.setManager(MANAGER_WALLET);
  await tx.wait();
  console.log("  ✓ MvaultContract manager set to:", MANAGER_WALLET);

  // NOTE: Ownership intentionally NOT transferred — deployer retains ownership
  // of all contracts so admin functions can be called via DEPLOYER_PRIVATE_KEY.

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════════");
  console.log("  DEPLOYMENT COMPLETE — owner:", deployer.address);
  console.log("══════════════════════════════════════════════════");
  console.log("  VITE_MVAULT_CONTRACT_ADDRESS=" + contractAddress);
  console.log("  VITE_MVT_TOKEN_ADDRESS=" + tokenAddress);
  console.log("  VITE_BOARD_MATRIX_ADDRESS=" + boardAddress);
  console.log("  VITE_MVAULT_STAKING_ADDRESS=" + stakingAddress);
  console.log("══════════════════════════════════════════════════\n");

  console.log("BSCScan links:");
  console.log("  Token:    https://testnet.bscscan.com/address/" + tokenAddress);
  console.log("  Contract: https://testnet.bscscan.com/address/" + contractAddress);
  console.log("  Board:    https://testnet.bscscan.com/address/" + boardAddress);
  console.log("  Staking:  https://testnet.bscscan.com/address/" + stakingAddress);

  return { contractAddress, tokenAddress, boardAddress, stakingAddress };
}

main().catch((err) => {
  console.error("\n❌ Deployment failed:", err.message || err);
  process.exit(1);
});
