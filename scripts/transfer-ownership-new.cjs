/**
 * Transfer ownership of all newly deployed contracts to the real owner wallet.
 * Deployer → 0xF305fEdfFF08ADAA7D2F73cA17F6bA4a3FB79318
 */
require("dotenv/config");
const { ethers } = require("ethers");

const RPC      = "https://node.mymchain.com/api/rpc";
const PK       = process.env.DEPLOYER_PRIVATE_KEY;
const NEW_OWNER = "0xF305fEdfFF08ADAA7D2F73cA17F6bA4a3FB79318";
const GAS_PRICE = 1_000_000_000n;
const CHAIN_ID  = 1888n;

const CONTRACTS = {
  MvaultContract: "0xbae14a18af7a70280e97e040963477f7d3c6130e",
  MVTToken:       "0x21897fbdc48468f55c9bb7fd9ea5f8e0083adc00",
  BoardMatrix:    "0xa775d77b21915f32c7240cf613c51349e71f2c11",
  MvaultStaking:  "0xfc2c10c5f2f5c2d66c35d5659aed37e6b9e7bebf",
};

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
      if (r.status !== "0x1") throw new Error(`${label} reverted`);
      return r;
    }
    process.stdout.write(".");
  }
  throw new Error(`${label} timed out`);
}

async function freshNonce(addr) {
  return parseInt(await rpc("eth_getTransactionCount", [addr, "pending"]), 16);
}

const iface = new ethers.Interface(["function transferOwnership(address newOwner) external"]);

async function main() {
  if (!PK) throw new Error("DEPLOYER_PRIVATE_KEY not set");
  const wallet = new ethers.Wallet(PK);
  console.log(`\nDeployer: ${wallet.address}`);
  console.log(`New owner: ${NEW_OWNER}\n`);

  for (const [name, addr] of Object.entries(CONTRACTS)) {
    try {
      const nonce = await freshNonce(wallet.address);
      const data  = iface.encodeFunctionData("transferOwnership", [NEW_OWNER]);
      const gasEstHex = await rpc("eth_estimateGas", [{
        from: wallet.address, to: addr, data, nonce: "0x" + nonce.toString(16),
      }]);
      const gasLimit = BigInt(gasEstHex) * 12n / 10n;

      console.log(`  [transferOwnership] ${name}: nonce=${nonce} gasLimit=${gasLimit}`);
      const tx = { to: addr, data, gasPrice: GAS_PRICE, gasLimit, nonce: BigInt(nonce), chainId: CHAIN_ID, value: 0n };
      const signed = await wallet.signTransaction(tx);
      const hash = await rpc("eth_sendRawTransaction", [signed]);
      console.log(`    txHash: ${hash}`);
      await waitForReceipt(hash, `${name}.transferOwnership`);
      console.log(`  ✓ ${name} owner → ${NEW_OWNER}\n`);
    } catch (e) {
      console.error(`  ✗ ${name}: ${e.message}\n`);
    }
  }

  // Verify
  console.log("── Verifying ownership ─────────────────────────────────\n");
  const ownerIface = new ethers.Interface(["function owner() view returns (address)"]);
  for (const [name, addr] of Object.entries(CONTRACTS)) {
    try {
      const data = ownerIface.encodeFunctionData("owner", []);
      const result = await rpc("eth_call", [{ to: addr, data }, "latest"]);
      const owner = ownerIface.decodeFunctionResult("owner", result)[0];
      const ok = owner.toLowerCase() === NEW_OWNER.toLowerCase();
      console.log(`  ${ok ? "✓" : "✗"} ${name}: owner = ${owner}`);
    } catch (e) {
      console.log(`  ? ${name}: ${e.message}`);
    }
  }
  console.log("\nDone.\n");
}

main().catch(err => { console.error("❌", err.message); process.exit(1); });
