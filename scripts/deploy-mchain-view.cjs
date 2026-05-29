/**
 * Deploy MvaultView on MChain (Chain ID 1888).
 * Uses raw JSON-RPC to avoid ethers.js bech32 miner address parsing issue.
 */
require("dotenv/config");
const { ethers } = require("ethers");
const fs   = require("fs");
const path = require("path");

const RPC            = "https://node.mymchain.com/api/rpc";
const PRIVATE_KEY    = process.env.DEPLOYER_PRIVATE_KEY;
const MVAULT_ADDR    = "0x9e71d588e0E5eAa51f7489B47F4cC1BB48e4383a";
const GAS_PRICE      = 1_000_000_000n;
const CHAIN_ID       = 1888n;

async function rpc(method, params = []) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`RPC error [${method}]: ${json.error.message}`);
  return json.result;
}

async function waitForReceipt(txHash) {
  for (let i = 0; i < 80; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const receipt = await rpc("eth_getTransactionReceipt", [txHash]);
    if (receipt) {
      if (receipt.status === "0x1") return receipt;
      throw new Error("MvaultView deploy reverted");
    }
  }
  throw new Error("Timed out waiting for MvaultView deploy receipt");
}

async function main() {
  if (!PRIVATE_KEY) { console.error("DEPLOYER_PRIVATE_KEY not set"); process.exit(1); }

  const artifactPath = path.join(__dirname, "../artifacts/contracts/MvaultView.sol/MvaultView.json");
  if (!fs.existsSync(artifactPath)) {
    console.error("Artifact not found. Run: npx hardhat compile"); process.exit(1);
  }
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  const wallet = new ethers.Wallet(PRIVATE_KEY);
  const balHex  = await rpc("eth_getBalance",          [wallet.address, "latest"]);
  const nonceHex = await rpc("eth_getTransactionCount", [wallet.address, "latest"]);
  const nonce = parseInt(nonceHex, 16);

  console.log(`\nNetwork : MChain (1888)`);
  console.log(`Deployer: ${wallet.address}`);
  console.log(`MvaultContract: ${MVAULT_ADDR}`);
  console.log(`Balance : ${ethers.formatEther(BigInt(balHex))} MxC`);

  const byteLen = (artifact.deployedBytecode.length - 2) / 2;
  console.log(`\nMvaultView bytecode: ${byteLen} bytes (limit: 24 576)`);

  // Encode constructor args (MvaultContract address)
  const abiCoder = new ethers.AbiCoder();
  const constructorArgs = abiCoder.encode(["address"], [MVAULT_ADDR]).slice(2);
  const deployData = artifact.bytecode + constructorArgs;

  // Estimate gas
  const gasEstHex = await rpc("eth_estimateGas", [{ from: wallet.address, data: deployData }]);
  const gasLimit = BigInt(gasEstHex) * 12n / 10n; // 20% buffer

  console.log(`Gas estimate: ${parseInt(gasEstHex, 16).toLocaleString()} (using ${gasLimit.toLocaleString()} with buffer)`);
  console.log(`\nDeploying MvaultView…`);

  const tx = {
    to: null,
    data: deployData,
    gasPrice: GAS_PRICE,
    gasLimit,
    nonce: BigInt(nonce),
    chainId: CHAIN_ID,
    value: 0n,
  };
  const signed = await wallet.signTransaction(tx);
  const hash = await rpc("eth_sendRawTransaction", [signed]);
  console.log(`  tx hash : ${hash}`);

  const receipt = await waitForReceipt(hash);
  const addr = receipt.contractAddress;
  console.log(`\n✓ MvaultView deployed at: ${addr}`);
  console.log(`  Block: ${parseInt(receipt.blockNumber, 16)}`);

  // Smoke test
  console.log("\n── Smoke test ──");
  try {
    const iface = new ethers.Interface(artifact.abi);
    const callData = iface.encodeFunctionData("getAllUsersCount", []);
    const result = await rpc("eth_call", [{ to: addr, data: callData }, "latest"]);
    const [count] = iface.decodeFunctionResult("getAllUsersCount", result);
    console.log(`  getAllUsersCount() = ${count}`);
  } catch (e) { console.warn("  Smoke-test warning:", e.message); }

  console.log("\n── Add to VPS environment ──");
  console.log(`VITE_MVAULT_VIEW_ADDRESS=${addr}`);

  const finalBalHex = await rpc("eth_getBalance", [wallet.address, "latest"]);
  console.log(`\nRemaining balance: ${ethers.formatEther(BigInt(finalBalHex))} MxC`);
}

main().catch(err => { console.error("❌", err.message || err); process.exit(1); });
