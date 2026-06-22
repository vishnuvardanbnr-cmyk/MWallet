/**
 * admin-set-manager-owner.cjs
 * 1. setManager(NEW_MANAGER) on MvaultContract
 * 2. transferOwnership(NEW_OWNER) on all 4 contracts
 * Uses raw JSON-RPC — hardhat fails on MChain (nonce skipping).
 */
require("dotenv/config");
const { ethers } = require("ethers");

const RPC        = "https://node.mymchain.com/api/rpc";
const PK         = process.env.DEPLOYER_PRIVATE_KEY;
const CHAIN_ID   = 1888n;
const GAS_PRICE  = 1_000_000_000n; // 1 Gwei

const NEW_MANAGER = "0xE2f35216f03c05e67205085BEa3763Ef9F238B70";
const NEW_OWNER   = "0xF305fEdfFF08ADAA7D2F73cA17F6bA4a3FB79318";

const CONTRACTS = {
  MvaultContract: "0x431cc3c846efd494061a3bddd84e6fb60f5204e3",
  MvaultToken:    "0xc7d9029a92998b1386365229f603a7aecb5fecdc",
  BoardMatrix:    "0x5b3b5780758f6b6667e349b7c10a5d70b0c75a9d",
  MvaultStaking:  "0x9f0b122f26599db85ef1a5e97dcd25e0a02a8cda",
};

const IFACE = new ethers.Interface([
  "function setManager(address _manager) external",
  "function transferOwnership(address newOwner) external",
  "function owner() view returns (address)",
  "function manager() view returns (address)",
]);

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
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const r = await rpc("eth_getTransactionReceipt", [hash]);
    if (r) {
      process.stdout.write(` block ${parseInt(r.blockNumber, 16)}\n`);
      if (r.status !== "0x1") throw new Error(`${label} REVERTED`);
      return r;
    }
    process.stdout.write(".");
  }
  throw new Error(`${label} timed out`);
}

async function sendTx(wallet, to, data, label) {
  const nonceHex = await rpc("eth_getTransactionCount", [wallet.address, "pending"]);
  const nonce = parseInt(nonceHex, 16);
  const gasEstHex = await rpc("eth_estimateGas", [{ from: wallet.address, to, data }]).catch(() => "0x" + (200000).toString(16));
  const gasLimit = BigInt(gasEstHex) * 13n / 10n;

  const tx = { to, data, nonce, gasLimit, gasPrice: GAS_PRICE, chainId: CHAIN_ID, value: 0n };
  const signed = await wallet.signTransaction(tx);
  const hash = await rpc("eth_sendRawTransaction", [signed]);
  console.log(`    TX: ${hash}`);
  await waitForReceipt(hash, label);
  return hash;
}

async function call(to, data) {
  return rpc("eth_call", [{ to, data }, "latest"]);
}

async function main() {
  if (!PK) { console.error("❌ DEPLOYER_PRIVATE_KEY not set"); process.exit(1); }
  const wallet = new ethers.Wallet(PK);
  console.log(`\nDeployer: ${wallet.address}`);
  console.log(`New manager: ${NEW_MANAGER}`);
  console.log(`New owner:   ${NEW_OWNER}\n`);

  // ── 1. setManager on MvaultContract ────────────────────────────────────────
  console.log("── Step 1: setManager on MvaultContract ──");
  try {
    const currentMgr = IFACE.decodeFunctionResult("manager", await call(CONTRACTS.MvaultContract, IFACE.encodeFunctionData("manager")))[0];
    console.log(`  Current manager: ${currentMgr}`);
    if (currentMgr.toLowerCase() === NEW_MANAGER.toLowerCase()) {
      console.log("  ✓ Already set — skipping");
    } else {
      await sendTx(wallet, CONTRACTS.MvaultContract, IFACE.encodeFunctionData("setManager", [NEW_MANAGER]), "setManager");
      console.log(`  ✓ Manager set to ${NEW_MANAGER}`);
    }
  } catch (e) {
    console.error(`  ✗ setManager failed: ${e.message}`);
  }

  // ── 2. transferOwnership on all contracts ──────────────────────────────────
  console.log("\n── Step 2: transferOwnership on all contracts ──");
  for (const [name, addr] of Object.entries(CONTRACTS)) {
    console.log(`\n  ${name} (${addr})`);
    try {
      const currentOwner = IFACE.decodeFunctionResult("owner", await call(addr, IFACE.encodeFunctionData("owner")))[0];
      console.log(`    Current owner: ${currentOwner}`);
      if (currentOwner.toLowerCase() === NEW_OWNER.toLowerCase()) {
        console.log("    ✓ Already owned by new owner — skipping");
        continue;
      }
      if (currentOwner.toLowerCase() !== wallet.address.toLowerCase()) {
        console.log(`    ✗ Deployer is NOT current owner (${currentOwner}) — cannot transfer`);
        continue;
      }
      await sendTx(wallet, addr, IFACE.encodeFunctionData("transferOwnership", [NEW_OWNER]), `transferOwnership(${name})`);
      console.log(`    ✓ Ownership transferred to ${NEW_OWNER}`);
    } catch (e) {
      console.error(`    ✗ Failed: ${e.message}`);
    }
  }

  // ── 3. Verify ──────────────────────────────────────────────────────────────
  console.log("\n── Verification ──");
  for (const [name, addr] of Object.entries(CONTRACTS)) {
    try {
      const owner = IFACE.decodeFunctionResult("owner", await call(addr, IFACE.encodeFunctionData("owner")))[0];
      const ok = owner.toLowerCase() === NEW_OWNER.toLowerCase() ? "✓" : "✗";
      console.log(`  ${ok} ${name}: owner = ${owner}`);
    } catch {
      console.log(`  ? ${name}: could not read owner`);
    }
  }
  try {
    const mgr = IFACE.decodeFunctionResult("manager", await call(CONTRACTS.MvaultContract, IFACE.encodeFunctionData("manager")))[0];
    const ok = mgr.toLowerCase() === NEW_MANAGER.toLowerCase() ? "✓" : "✗";
    console.log(`  ${ok} MvaultContract: manager = ${mgr}`);
  } catch {}

  console.log("\n✓ Done.\n");
}

main().catch(e => { console.error(e); process.exit(1); });
