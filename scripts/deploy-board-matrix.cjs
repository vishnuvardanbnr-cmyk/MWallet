/**
 * Deploy ONLY the updated MvaultBoardMatrix contract and link it to the live MvaultContract.
 * Preserves all other contracts (MvaultContract, MVT, Staking, View) unchanged.
 */
require("dotenv/config");
const { ethers } = require("ethers");
const fs   = require("fs");
const path = require("path");

const RPC           = "https://node.mymchain.com/api/rpc";
const PK            = process.env.DEPLOYER_PRIVATE_KEY;
const USDT          = "0x7b2ed1be97fa240dbd0328dd307e35e588bcb917";
const MVAULT        = "0x431cc3c846efd494061a3bddd84e6fb60f5204e3";
const OWNER         = "0xF305fEdfFF08ADAA7D2F73cA17F6bA4a3FB79318";
const LIQUIDITY     = OWNER; // 20% liquidity → owner wallet for now
const GAS_PRICE     = 1_000_000_000n; // 1 Gwei
const CHAIN_ID      = 1888n;

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

function encodeArgs(...pairs) {
  const abiCoder = new ethers.AbiCoder();
  const types  = pairs.map(p => p[0]);
  const values = pairs.map(p => p[1]);
  return abiCoder.encode(types, values).slice(2); // remove 0x
}

async function deploy(wallet, label, bytecode, constructorEncoded = "") {
  const data  = bytecode + constructorEncoded;
  const nonce = await freshNonce(wallet);
  const gasEstHex = await rpc("eth_estimateGas", [{
    from: wallet.address, data, nonce: "0x" + nonce.toString(16)
  }]);
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
  const gasEstHex = await rpc("eth_estimateGas", [{
    from: wallet.address, to: contractAddr, data, nonce: "0x" + nonce.toString(16)
  }]);
  const gasLimit = BigInt(gasEstHex) * 12n / 10n;
  console.log(`  [call]   ${label}: nonce=${nonce} gasLimit=${gasLimit}`);
  const tx = { to: contractAddr, data, gasPrice: GAS_PRICE, gasLimit, nonce: BigInt(nonce), chainId: CHAIN_ID, value: 0n };
  const signed = await wallet.signTransaction(tx);
  const hash = await rpc("eth_sendRawTransaction", [signed]);
  console.log(`    txHash: ${hash}`);
  await waitForReceipt(hash, label);
}

async function main() {
  if (!PK) throw new Error("DEPLOYER_PRIVATE_KEY not set");
  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet   = new ethers.Wallet(PK, provider);
  console.log(`\nDeployer: ${wallet.address}`);

  // Load board matrix artifact
  const artifactPath = path.join(__dirname, "../artifacts/contracts/MvaultBoardMatrix.sol/MvaultBoardMatrix.json");
  if (!fs.existsSync(artifactPath)) throw new Error("Run node scripts/compile.cjs first");
  const art  = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const iface = new ethers.Interface(art.abi);

  const mainIface = new ethers.Interface([
    "function setBoardHandler(address _boardHandler) external",
  ]);

  console.log("\n── Deploying new MvaultBoardMatrix ─────────────────────────────────────\n");

  // Deploy board matrix with USDT address
  const boardAddr = await deploy(wallet, "MvaultBoardMatrix", art.bytecode,
    encodeArgs(["address", USDT]));

  console.log("\n── Linking ─────────────────────────────────────────────────────────────\n");

  // BoardMatrix.setMvaultContract → live MvaultContract
  await call(wallet, "BoardMatrix.setMvaultContract", boardAddr, iface, "setMvaultContract", [MVAULT]);

  // BoardMatrix.setLiquidityAddress → owner wallet
  await call(wallet, "BoardMatrix.setLiquidityAddress", boardAddr, iface, "setLiquidityAddress", [LIQUIDITY]);

  // MvaultContract.setBoardHandler → new board matrix
  await call(wallet, "MvaultContract.setBoardHandler", MVAULT, mainIface, "setBoardHandler", [boardAddr]);

  // Verify deployment
  console.log("\n── Verifying ────────────────────────────────────────────────────────────\n");
  const code = await rpc("eth_getCode", [boardAddr, "latest"]);
  const bytes = code.length > 4 ? Math.floor((code.length - 2) / 2) : 0;
  if (bytes < 100) throw new Error("Board matrix contract code is empty — deploy failed!");
  console.log(`  ✓ MvaultBoardMatrix: ${bytes} bytes at ${boardAddr}`);

  // Verify main contract now points to new board handler
  const boardHandlerSlot = await rpc("eth_call", [{
    to: MVAULT,
    data: new ethers.Interface(["function boardHandler() view returns (address)"]).encodeFunctionData("boardHandler", [])
  }, "latest"]);
  const linkedAddr = "0x" + boardHandlerSlot.slice(-40);
  const ok = linkedAddr.toLowerCase() === boardAddr.toLowerCase();
  console.log(`  ${ok ? "✓" : "✗"} MvaultContract.boardHandler → ${linkedAddr}`);

  console.log("\n═══════════════════════════════════════════════════════════════════════");
  console.log(`New board matrix deployed and linked!`);
  console.log(`VITE_BOARD_HANDLER_ADDRESS=${boardAddr}`);
  console.log("═══════════════════════════════════════════════════════════════════════\n");
  console.log("Next steps:");
  console.log("  1. Update VITE_BOARD_HANDLER_ADDRESS in .env (optional — frontend reads boardHandler() dynamically)");
  console.log("  2. From admin panel: use 'Skip Board Entry' for Level 1, indexes 2, 3, 4");
  console.log("     (ghost-activated entries in the old queue were NOT carried over — fresh slate)");
}

main().catch(err => { console.error("❌", err.message || err); process.exit(1); });
