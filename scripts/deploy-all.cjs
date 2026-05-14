/**
 * Full M-Vault deployment — BSC Testnet
 *
 * Deploys all 5 contracts, wires them together, sets manager + distributor,
 * then transfers ownership to the admin wallet.
 *
 * After this script the state is:
 *   owner   = ADMIN_WALLET (0x04E8...) — full control
 *   manager = DEPLOYER wallet          — can call setDistributor, run distributions
 *   distributor = MvaultDistributor    — wired and ready
 *
 * Usage:
 *   node scripts/deploy-all.cjs
 *
 * Requires env:
 *   DEPLOYER_PRIVATE_KEY   — wallet that deploys + becomes manager
 *   VITE_BSC_NETWORK       — "mainnet" | "testnet" (default: testnet)
 */

require("dotenv/config");
const { ethers } = require("ethers");
const fs   = require("fs");
const path = require("path");

const ADMIN_WALLET  = "0x04E8c5B49dE683c5B44eF1269Bd5ee4f338868C4";
const USDT_TESTNET  = "0x0D3E80cBc9DDC0a3Fdee912b99C50cd0b5761eE3";
const USDT_MAINNET  = "0x55d398326f99059fF775485246999027B3197955";

const isMainnet = process.env.VITE_BSC_NETWORK === "mainnet";
const RPC = isMainnet
  ? "https://bsc-rpc.publicnode.com"
  : "https://bsc-testnet-rpc.publicnode.com";
const USDT = isMainnet ? USDT_MAINNET : USDT_TESTNET;

const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
if (!PRIVATE_KEY) { console.error("DEPLOYER_PRIVATE_KEY not set"); process.exit(1); }

function loadArtifact(name) {
  const p = path.join(__dirname, `../artifacts/contracts/${name}.sol/${name}.json`);
  if (!fs.existsSync(p)) {
    console.error(`Artifact not found: ${p}\nRun: npx hardhat compile`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

async function deploy(factory, ...args) {
  const contract = await factory.deploy(...args, { gasLimit: 8_000_000 });
  await contract.waitForDeployment();
  return contract;
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const signer   = new ethers.Wallet(PRIVATE_KEY, provider);
  const deployer = signer.address;

  console.log("══════════════════════════════════════════════════");
  console.log("  M-Vault Full Deployment");
  console.log(`  Network  : ${isMainnet ? "BSC Mainnet" : "BSC Testnet"}`);
  console.log(`  Deployer : ${deployer}  (becomes manager)`);
  console.log(`  Owner    : ${ADMIN_WALLET}  (ownership transferred at end)`);
  console.log("══════════════════════════════════════════════════\n");

  const bal = await provider.getBalance(deployer);
  console.log(`  BNB balance: ${ethers.formatEther(bal)} BNB\n`);

  // ── 1. MvaultToken ──────────────────────────────────────────────────────────
  console.log("[1/7] Deploying MvaultToken…");
  const tokenArt = loadArtifact("MvaultToken");
  const tokenFactory = new ethers.ContractFactory(tokenArt.abi, tokenArt.bytecode, signer);
  const mvaultToken = await deploy(tokenFactory, USDT);
  const tokenAddress = await mvaultToken.getAddress();
  console.log(`  ✓ MvaultToken: ${tokenAddress}`);

  // ── 2. MvaultContract ───────────────────────────────────────────────────────
  console.log("\n[2/7] Deploying MvaultContract…");
  const contractArt = loadArtifact("MvaultContract");
  const contractFactory = new ethers.ContractFactory(contractArt.abi, contractArt.bytecode, signer);
  const mvaultContract = await deploy(contractFactory, USDT, tokenAddress);
  const contractAddress = await mvaultContract.getAddress();
  console.log(`  ✓ MvaultContract: ${contractAddress}`);

  // ── 3. MvaultBoardMatrix ────────────────────────────────────────────────────
  console.log("\n[3/7] Deploying MvaultBoardMatrix…");
  const boardArt = loadArtifact("MvaultBoardMatrix");
  const boardFactory = new ethers.ContractFactory(boardArt.abi, boardArt.bytecode, signer);
  const boardMatrix = await deploy(boardFactory, USDT);
  const boardAddress = await boardMatrix.getAddress();
  console.log(`  ✓ MvaultBoardMatrix: ${boardAddress}`);

  // ── 4. MvaultView ───────────────────────────────────────────────────────────
  console.log("\n[4/7] Deploying MvaultView…");
  const viewArt = loadArtifact("MvaultView");
  const viewFactory = new ethers.ContractFactory(viewArt.abi, viewArt.bytecode, signer);
  const mvaultView = await deploy(viewFactory, contractAddress);
  const viewAddress = await mvaultView.getAddress();
  console.log(`  ✓ MvaultView: ${viewAddress}`);

  // ── 5. MvaultDistributor ────────────────────────────────────────────────────
  console.log("\n[5/7] Deploying MvaultDistributor…");
  const distArt = loadArtifact("MvaultDistributor");
  const distFactory = new ethers.ContractFactory(distArt.abi, distArt.bytecode, signer);
  const mvaultDist = await deploy(distFactory, contractAddress);
  const distAddress = await mvaultDist.getAddress();
  console.log(`  ✓ MvaultDistributor: ${distAddress}`);

  // ── 6. Wire everything up ───────────────────────────────────────────────────
  console.log("\n[6/7] Wiring contracts…");

  let tx;

  tx = await mvaultToken.setMvaultContract(contractAddress, { gasLimit: 100_000 });
  await tx.wait();
  console.log("  ✓ MvaultToken → MvaultContract linked");

  tx = await mvaultContract.setBoardHandler(boardAddress, { gasLimit: 100_000 });
  await tx.wait();
  console.log("  ✓ MvaultContract boardHandler set");

  tx = await boardMatrix.setMvaultContract(contractAddress, { gasLimit: 100_000 });
  await tx.wait();
  console.log("  ✓ BoardMatrix → MvaultContract linked");

  tx = await boardMatrix.setLiquidityAddress(ADMIN_WALLET, { gasLimit: 100_000 });
  await tx.wait();
  tx = await boardMatrix.setSystemAddress(ADMIN_WALLET, { gasLimit: 100_000 });
  await tx.wait();
  console.log("  ✓ BoardMatrix liquidity + system address set");

  // Set manager BEFORE transferring ownership (deployer is still owner here)
  tx = await mvaultContract.setManager(deployer, { gasLimit: 100_000 });
  await tx.wait();
  console.log(`  ✓ MvaultContract manager set to deployer (${deployer})`);

  // Wire distributor — deployer is still owner at this point
  tx = await mvaultContract.setDistributor(distAddress, { gasLimit: 100_000 });
  await tx.wait();
  console.log(`  ✓ MvaultContract distributor set to MvaultDistributor (${distAddress})`);

  // ── 7. Transfer ownership → ADMIN_WALLET ───────────────────────────────────
  console.log(`\n[7/7] Transferring ownership to admin wallet (${ADMIN_WALLET})…`);

  tx = await mvaultToken.transferOwnership(ADMIN_WALLET, { gasLimit: 100_000 });
  await tx.wait();
  console.log("  ✓ MvaultToken ownership transferred");

  tx = await mvaultContract.transferOwnership(ADMIN_WALLET, { gasLimit: 100_000 });
  await tx.wait();
  console.log("  ✓ MvaultContract ownership transferred");

  tx = await boardMatrix.transferOwnership(ADMIN_WALLET, { gasLimit: 100_000 });
  await tx.wait();
  console.log("  ✓ BoardMatrix ownership transferred");

  // MvaultDistributor owner stays as deployer (it only calls commitDistribution)
  console.log(`  ✓ MvaultDistributor owner remains: ${deployer}`);

  // ── Verify final state ──────────────────────────────────────────────────────
  console.log("\n── Verification ──");
  const [owner, manager, distributorSet] = await Promise.all([
    mvaultContract.owner(),
    mvaultContract.manager(),
    mvaultContract.distributor(),
  ]);
  console.log(`  owner()      = ${owner}`);
  console.log(`  manager()    = ${manager}`);
  console.log(`  distributor()= ${distributorSet}`);

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════════");
  console.log("  DEPLOYMENT COMPLETE ✓");
  console.log("══════════════════════════════════════════════════");
  console.log(`VITE_MVAULT_CONTRACT_ADDRESS=${contractAddress}`);
  console.log(`VITE_MVT_TOKEN_ADDRESS=${tokenAddress}`);
  console.log(`VITE_BOARD_HANDLER_ADDRESS=${boardAddress}`);
  console.log(`VITE_MVAULT_VIEW_ADDRESS=${viewAddress}`);
  console.log(`VITE_DISTRIBUTOR_ADDRESS=${distAddress}`);
  console.log(`VITE_PAYMENT_TOKEN_ADDRESS=${USDT}`);
  console.log("══════════════════════════════════════════════════");

  console.log("\nBSCScan links:");
  const base = isMainnet ? "https://bscscan.com" : "https://testnet.bscscan.com";
  console.log(`  Token       : ${base}/address/${tokenAddress}`);
  console.log(`  Contract    : ${base}/address/${contractAddress}`);
  console.log(`  Board       : ${base}/address/${boardAddress}`);
  console.log(`  View        : ${base}/address/${viewAddress}`);
  console.log(`  Distributor : ${base}/address/${distAddress}`);
}

main().catch(err => {
  console.error("\nDeployment failed:", err.shortMessage || err.message || err);
  process.exit(1);
});
