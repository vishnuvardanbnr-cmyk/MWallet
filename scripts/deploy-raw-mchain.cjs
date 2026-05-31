/**
 * Full MChain deployment using raw JSON-RPC.
 * Queries nonce fresh before every tx — MChain skips nonces on internal txs
 * so sequential nonces from hardhat/ethers go stale.
 */
require("dotenv/config");
const { ethers } = require("ethers");
const fs   = require("fs");
const path = require("path");

const RPC         = "https://node.mymchain.com/api/rpc";
const PK          = process.env.DEPLOYER_PRIVATE_KEY;
const USDT        = "0xab8c6267dcca9e70b625014c8f77eee9728e14c3";
const MANAGER     = "0x12Fcf3d1084455d3677a110925D73b01F3846750";
const GAS_PRICE   = 1_000_000_000n;  // 1 Gwei
const CHAIN_ID    = 1888n;
const GAS_BUFFER  = 12n / 10n;       // ×1.2

async function rpc(method, params = []) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`RPC [${method}]: ${json.error.message}`);
  return json.result;
}

async function waitForReceipt(hash, label) {
  process.stdout.write(`    waiting for ${label}...`);
  for (let i = 0; i < 80; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const r = await rpc("eth_getTransactionReceipt", [hash]);
    if (r) {
      process.stdout.write(` block ${parseInt(r.blockNumber, 16)}\n`);
      if (r.status !== "0x1") throw new Error(`${label} reverted (status 0x0)`);
      return r;
    }
    process.stdout.write(".");
  }
  throw new Error(`${label} timed out`);
}

async function freshNonce(wallet) {
  const h = await rpc("eth_getTransactionCount", [wallet.address, "pending"]);
  return parseInt(h, 16);
}

async function deploy(wallet, label, bytecode, constructorArgs = []) {
  const abiCoder = new ethers.AbiCoder();
  let data = bytecode;
  if (constructorArgs.length > 0) {
    // figure out types from the args themselves — we pass pre-encoded strings
    data = bytecode + constructorArgs;
  }

  const nonce = await freshNonce(wallet);
  const gasEstHex = await rpc("eth_estimateGas", [{ from: wallet.address, data, nonce: "0x" + nonce.toString(16) }]);
  const gasLimit = BigInt(gasEstHex) * 12n / 10n;

  console.log(`  [deploy] ${label}: nonce=${nonce} gasLimit=${gasLimit}`);

  const tx = { to: null, data, gasPrice: GAS_PRICE, gasLimit, nonce: BigInt(nonce), chainId: CHAIN_ID, value: 0n };
  const signed = await wallet.signTransaction(tx);
  const hash = await rpc("eth_sendRawTransaction", [signed]);
  console.log(`    txHash: ${hash}`);

  const receipt = await waitForReceipt(hash, label);
  const addr = receipt.contractAddress;
  if (!addr) throw new Error(`${label}: no contractAddress in receipt`);
  console.log(`  ✓ ${label} → ${addr}`);
  return addr;
}

async function call(wallet, label, contractAddr, iface, method, args) {
  const nonce = await freshNonce(wallet);
  const data  = iface.encodeFunctionData(method, args);
  const gasEstHex = await rpc("eth_estimateGas", [{ from: wallet.address, to: contractAddr, data, nonce: "0x" + nonce.toString(16) }]);
  const gasLimit  = BigInt(gasEstHex) * 12n / 10n;

  console.log(`  [call] ${label}: nonce=${nonce} gasLimit=${gasLimit}`);

  const tx = { to: contractAddr, data, gasPrice: GAS_PRICE, gasLimit, nonce: BigInt(nonce), chainId: CHAIN_ID, value: 0n };
  const signed = await wallet.signTransaction(tx);
  const hash   = await rpc("eth_sendRawTransaction", [signed]);
  console.log(`    txHash: ${hash}`);
  await waitForReceipt(hash, label);
  console.log(`  ✓ ${label}`);
}

function loadArtifact(name) {
  const p = path.join(__dirname, `../artifacts/contracts/${name}.sol/${name}.json`);
  if (!fs.existsSync(p)) throw new Error(`Artifact not found: ${p}. Run: npx hardhat compile`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function encodeArgs(...types_values) {
  // pairs: [type, value]
  const types  = types_values.map(t => t[0]);
  const values = types_values.map(t => t[1]);
  return new ethers.AbiCoder().encode(types, values).slice(2); // remove 0x
}

async function main() {
  if (!PK) { console.error("DEPLOYER_PRIVATE_KEY not set"); process.exit(1); }
  const wallet = new ethers.Wallet(PK);

  const balHex = await rpc("eth_getBalance", [wallet.address, "latest"]);
  console.log(`\nDeployer: ${wallet.address}`);
  console.log(`Balance:  ${ethers.formatEther(BigInt(balHex))} MxC`);
  console.log(`Network:  MChain (1888)\n`);

  // ── Load artifacts ────────────────────────────────────────────────────────
  const tokenArt   = loadArtifact("MvaultToken");
  const mainArt    = loadArtifact("MvaultContract");
  const boardArt   = loadArtifact("MvaultBoardMatrix");
  const stakingArt = loadArtifact("MvaultStaking");

  const tokenIface   = new ethers.Interface(tokenArt.abi);
  const mainIface    = new ethers.Interface(mainArt.abi);
  const boardIface   = new ethers.Interface(boardArt.abi);

  // Log contract sizes
  for (const [name, art] of [["MvaultToken", tokenArt], ["MvaultContract", mainArt], ["MvaultBoardMatrix", boardArt], ["MvaultStaking", stakingArt]]) {
    const bytes = (art.deployedBytecode.length - 2) / 2;
    console.log(`${name}: ${bytes} bytes (limit: 24,576)`);
  }
  console.log();

  // ── 1. Deploy MvaultToken(USDT) ──────────────────────────────────────────
  const tokenAddr = await deploy(wallet, "MvaultToken", tokenArt.bytecode, encodeArgs(["address", USDT]));

  // ── 2. Deploy MvaultContract(USDT, token) ────────────────────────────────
  const mainAddr = await deploy(wallet, "MvaultContract", mainArt.bytecode, encodeArgs(["address", USDT], ["address", tokenAddr]));

  // ── 3. Deploy MvaultBoardMatrix(USDT) ────────────────────────────────────
  const boardAddr = await deploy(wallet, "MvaultBoardMatrix", boardArt.bytecode, encodeArgs(["address", USDT]));

  // ── 4. Deploy MvaultStaking(owner, mvaultContract, usdt, mvtToken) ───────
  const stakingAddr = await deploy(wallet, "MvaultStaking", stakingArt.bytecode,
    encodeArgs(["address", wallet.address], ["address", mainAddr], ["address", USDT], ["address", tokenAddr]));

  console.log("\n── Linking contracts ──────────────────────────────────────────────────\n");

  // MvaultToken → MvaultContract
  await call(wallet, "MvaultToken.setMvaultContract",   tokenAddr,  tokenIface, "setMvaultContract", [mainAddr]);
  // MvaultToken → StakingModule
  await call(wallet, "MvaultToken.setStakingModule",    tokenAddr,  tokenIface, "setStakingModule",  [stakingAddr]);
  // MvaultContract → BoardHandler
  await call(wallet, "MvaultContract.setBoardHandler",  mainAddr,   mainIface,  "setBoardHandler",   [boardAddr]);
  // MvaultContract → StakingModule
  await call(wallet, "MvaultContract.setStakingModule", mainAddr,   mainIface,  "setStakingModule",  [stakingAddr]);
  // BoardMatrix → MvaultContract
  await call(wallet, "BoardMatrix.setMvaultContract",   boardAddr,  boardIface, "setMvaultContract", [mainAddr]);
  // BoardMatrix liquidity + system address
  await call(wallet, "BoardMatrix.setLiquidityAddr",    boardAddr,  boardIface, "setLiquidityAddress",[wallet.address]);
  await call(wallet, "BoardMatrix.setSystemAddr",       boardAddr,  boardIface, "setSystemAddress",  [wallet.address]);
  // MvaultContract → Manager
  await call(wallet, "MvaultContract.setManager",       mainAddr,   mainIface,  "setManager",        [MANAGER]);

  // ── Verify ──────────────────────────────────────────────────────────────────
  console.log("\n── Verifying eth_getCode ───────────────────────────────────────────────\n");
  for (const [label, addr] of [["MvaultToken", tokenAddr], ["MvaultContract", mainAddr], ["MvaultBoardMatrix", boardAddr], ["MvaultStaking", stakingAddr]]) {
    const code = await rpc("eth_getCode", [addr, "latest"]);
    console.log(`  ${label}: ${code.length > 4 ? "✓ bytecode exists" : "✗ EMPTY"} (${addr})`);
  }

  const finalBal = await rpc("eth_getBalance", [wallet.address, "latest"]);
  console.log(`\n── New Contract Addresses ────────────────────────────────────────────────\n`);
  console.log(`VITE_MVAULT_CONTRACT_ADDRESS=${mainAddr}`);
  console.log(`VITE_MVT_TOKEN_ADDRESS=${tokenAddr}`);
  console.log(`VITE_BOARD_HANDLER_ADDRESS=${boardAddr}`);
  console.log(`VITE_MVAULT_STAKING_ADDRESS=${stakingAddr}`);
  console.log(`VITE_PAYMENT_TOKEN_ADDRESS=${USDT}`);
  console.log(`\nRemaining balance: ${ethers.formatEther(BigInt(finalBal))} MxC`);
}

main().catch(err => { console.error("❌", err.message || err); process.exit(1); });
