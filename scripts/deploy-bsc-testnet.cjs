/**
 * Deploy all M-Vault contracts to BSC Testnet (chainId 97).
 * Run AFTER: node scripts/compile.cjs
 *
 * BSC Testnet USDT: 0x0D3E80cBc9DDC0a3Fdee912b99C50cd0b5761eE3
 * Get testnet BNB:  https://testnet.binance.org/faucet-smart
 */
require("dotenv/config");
const { ethers } = require("ethers");
const fs   = require("fs");
const path = require("path");

const RPC       = "https://data-seed-prebsc-1-s1.binance.org:8545/";
const CHAIN_ID  = 97n;
const PK        = process.env.DEPLOYER_PRIVATE_KEY;
const USDT      = "0x0D3E80cBc9DDC0a3Fdee912b99C50cd0b5761eE3"; // BSC testnet USDT
const MANAGER   = "0x12Fcf3d1084455d3677a110925D73b01F3846750";
const GAS_PRICE = 10_000_000_000n; // 10 Gwei — BSC testnet standard

function loadArtifact(name) {
  const p = path.join(__dirname, `../artifacts/contracts/${name}.sol/${name}.json`);
  if (!fs.existsSync(p)) throw new Error(`Artifact not found: ${p}\nRun: node scripts/compile.cjs`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

async function waitReceipt(provider, hash, label) {
  process.stdout.write(`    waiting for ${label}...`);
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const r = await provider.getTransactionReceipt(hash);
    if (r) {
      process.stdout.write(` block ${r.blockNumber}\n`);
      if (r.status !== 1) throw new Error(`${label} reverted`);
      return r;
    }
    process.stdout.write(".");
  }
  throw new Error(`${label} timed out`);
}

async function deployContract(wallet, provider, label, artifact, constructorArgs = []) {
  const factory  = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const nonce    = await provider.getTransactionCount(wallet.address, "pending");
  const gasEstimate = await provider.estimateGas({
    from: wallet.address,
    data: factory.interface.encodeDeploy(constructorArgs) + artifact.bytecode.slice(2),
  }).catch(() => 3_000_000n);
  const gasLimit = gasEstimate * 12n / 10n;

  console.log(`  [deploy] ${label}: nonce=${nonce} gasLimit=${gasLimit}`);
  const tx = await factory.deploy(...constructorArgs, {
    gasPrice: GAS_PRICE, gasLimit, nonce,
  });
  console.log(`    txHash: ${tx.deploymentTransaction().hash}`);
  const receipt = await waitReceipt(provider, tx.deploymentTransaction().hash, label);
  const addr = receipt.contractAddress;
  console.log(`  ✓ ${label} → ${addr}`);
  return addr;
}

async function callContract(wallet, provider, label, contractAddr, abi, method, args) {
  const iface    = new ethers.Interface(abi);
  const data     = iface.encodeFunctionData(method, args);
  const nonce    = await provider.getTransactionCount(wallet.address, "pending");
  const gasLimit = 200_000n;

  console.log(`  [call] ${label}: nonce=${nonce}`);
  const tx = await wallet.sendTransaction({
    to: contractAddr, data, gasPrice: GAS_PRICE, gasLimit, nonce,
  });
  console.log(`    txHash: ${tx.hash}`);
  await waitReceipt(provider, tx.hash, label);
  console.log(`  ✓ ${label}`);
}

async function main() {
  if (!PK) { console.error("DEPLOYER_PRIVATE_KEY not set"); process.exit(1); }

  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet   = new ethers.Wallet(PK, provider);
  const network  = await provider.getNetwork();
  const balance  = await provider.getBalance(wallet.address);

  console.log("\n══════════════════════════════════════════════════");
  console.log("  M-Vault — BSC Testnet Deployment");
  console.log(`  Chain ID: ${network.chainId}`);
  console.log(`  Deployer: ${wallet.address}`);
  console.log(`  BNB Balance: ${ethers.formatEther(balance)} BNB`);
  console.log("══════════════════════════════════════════════════\n");

  if (network.chainId !== CHAIN_ID) {
    console.error(`Expected chainId 97, got ${network.chainId}`); process.exit(1);
  }
  if (balance < ethers.parseEther("0.05")) {
    console.error("Need at least 0.05 BNB for deployment gas"); process.exit(1);
  }

  // Load artifacts
  const tokenArt   = loadArtifact("MvaultToken");
  const mainArt    = loadArtifact("MvaultContract");
  const boardArt   = loadArtifact("MvaultBoardMatrix");
  const stakingArt = loadArtifact("MvaultStaking");
  const viewArt    = loadArtifact("MvaultView");

  console.log("Contract sizes:");
  for (const [name, art] of [
    ["MvaultToken", tokenArt], ["MvaultContract", mainArt],
    ["MvaultBoardMatrix", boardArt], ["MvaultStaking", stakingArt], ["MvaultView", viewArt],
  ]) {
    const bytes = (art.deployedBytecode.length - 2) / 2;
    const ok = bytes <= 24576;
    console.log(`  ${ok ? "✓" : "✗"} ${name}: ${bytes} bytes`);
  }
  console.log();

  // ── 1. Deploy MvaultToken ────────────────────────────────────────────────
  console.log("[1/5] Deploying MvaultToken...");
  const tokenAddr = await deployContract(wallet, provider, "MvaultToken", tokenArt, [USDT]);

  // ── 2. Deploy MvaultContract ─────────────────────────────────────────────
  console.log("\n[2/5] Deploying MvaultContract...");
  const mainAddr = await deployContract(wallet, provider, "MvaultContract", mainArt, [USDT, tokenAddr]);

  // ── 3. Deploy MvaultBoardMatrix ──────────────────────────────────────────
  console.log("\n[3/5] Deploying MvaultBoardMatrix...");
  const boardAddr = await deployContract(wallet, provider, "MvaultBoardMatrix", boardArt, [USDT]);

  // ── 4. Deploy MvaultStaking ──────────────────────────────────────────────
  console.log("\n[4/5] Deploying MvaultStaking...");
  const stakingAddr = await deployContract(wallet, provider, "MvaultStaking", stakingArt,
    [wallet.address, mainAddr, USDT, tokenAddr]);

  // ── 5. Deploy MvaultView ─────────────────────────────────────────────────
  console.log("\n[5/5] Deploying MvaultView...");
  const viewAddr = await deployContract(wallet, provider, "MvaultView", viewArt, [mainAddr]);

  // ── Link contracts ────────────────────────────────────────────────────────
  console.log("\n── Linking contracts ────────────────────────────────────────────────────\n");
  await callContract(wallet, provider, "Token→setMvaultContract",  tokenAddr,  tokenArt.abi,  "setMvaultContract", [mainAddr]);
  await callContract(wallet, provider, "Token→setStakingModule",   tokenAddr,  tokenArt.abi,  "setStakingModule",  [stakingAddr]);
  await callContract(wallet, provider, "Main→setBoardHandler",     mainAddr,   mainArt.abi,   "setBoardHandler",   [boardAddr]);
  await callContract(wallet, provider, "Main→setStakingModule",    mainAddr,   mainArt.abi,   "setStakingModule",  [stakingAddr]);
  await callContract(wallet, provider, "Board→setMvaultContract",  boardAddr,  boardArt.abi,  "setMvaultContract", [mainAddr]);
  await callContract(wallet, provider, "Board→setLiquidityAddr",   boardAddr,  boardArt.abi,  "setLiquidityAddress", [wallet.address]);
  await callContract(wallet, provider, "Main→setManager",          mainAddr,   mainArt.abi,   "setManager",        [MANAGER]);

  // ── Summary ───────────────────────────────────────────────────────────────
  const finalBal = await provider.getBalance(wallet.address);
  console.log("\n══════════════════════════════════════════════════");
  console.log("  DEPLOYMENT COMPLETE");
  console.log(`  Remaining BNB: ${ethers.formatEther(finalBal)}`);
  console.log("══════════════════════════════════════════════════");
  console.log("\n── Add these to your .env / Replit secrets ─────────────────────────────\n");
  console.log(`VITE_MVAULT_CONTRACT_ADDRESS=${mainAddr}`);
  console.log(`VITE_MVT_TOKEN_ADDRESS=${tokenAddr}`);
  console.log(`VITE_BOARD_HANDLER_ADDRESS=${boardAddr}`);
  console.log(`VITE_MVAULT_STAKING_ADDRESS=${stakingAddr}`);
  console.log(`VITE_MVAULT_VIEW_ADDRESS=${viewAddr}`);
  console.log(`VITE_PAYMENT_TOKEN_ADDRESS=${USDT}`);
  console.log(`VITE_BSC_NETWORK=testnet`);
  console.log("\n── BSCScan (Testnet) ────────────────────────────────────────────────────\n");
  console.log(`  Token:    https://testnet.bscscan.com/address/${tokenAddr}`);
  console.log(`  Main:     https://testnet.bscscan.com/address/${mainAddr}`);
  console.log(`  Board:    https://testnet.bscscan.com/address/${boardAddr}`);
  console.log(`  Staking:  https://testnet.bscscan.com/address/${stakingAddr}`);
  console.log(`  View:     https://testnet.bscscan.com/address/${viewAddr}`);
}

main().catch(err => { console.error("\n❌", err.message || err); process.exit(1); });
