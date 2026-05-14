/**
 * Deploy MvaultView.sol
 *
 * MvaultView is a read-only helper contract that re-exposes view functions
 * that were removed from MvaultContract to stay under the EIP-170 24 576-byte
 * deployment limit.  It holds no funds and writes no state.
 *
 * Usage:
 *   node scripts/deploy-mvault-view.cjs
 *
 * Env required:
 *   DEPLOYER_PRIVATE_KEY          — admin wallet
 *   VITE_MVAULT_CONTRACT_ADDRESS  — the live MvaultContract address
 *   VITE_BSC_NETWORK              — "mainnet" | "testnet"  (default: testnet)
 */

require("dotenv/config");
const { ethers } = require("ethers");
const fs  = require("fs");
const path = require("path");

// ── Config ───────────────────────────────────────────────────────────────────
const MVAULT_ADDRESS = process.env.VITE_MVAULT_CONTRACT_ADDRESS
  || "0x164E4c01958c623CeF48C7DF8C66deFbB5eB4f57";

const isMainnet = process.env.VITE_BSC_NETWORK === "mainnet";
const RPC = isMainnet
  ? "https://bsc-rpc.publicnode.com"
  : "https://bsc-testnet-rpc.publicnode.com";

const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
if (!PRIVATE_KEY) { console.error("DEPLOYER_PRIVATE_KEY not set"); process.exit(1); }

// ── Load artifact ─────────────────────────────────────────────────────────────
const artifactPath = path.join(
  __dirname, "..", "artifacts", "contracts", "MvaultView.sol", "MvaultView.json"
);
if (!fs.existsSync(artifactPath)) {
  console.error("Artifact not found. Run: npx hardhat compile");
  process.exit(1);
}
const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

// ── Deploy ────────────────────────────────────────────────────────────────────
async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const signer   = new ethers.Wallet(PRIVATE_KEY, provider);
  const deployer = await signer.getAddress();

  console.log(`Network : ${isMainnet ? "BSC Mainnet" : "BSC Testnet"}`);
  console.log(`Deployer: ${deployer}`);
  console.log(`MvaultContract: ${MVAULT_ADDRESS}`);

  const balance = await provider.getBalance(deployer);
  console.log(`Balance : ${ethers.formatEther(balance)} BNB`);

  const byteLen = (artifact.deployedBytecode.length - 2) / 2;
  console.log(`\nMvaultView bytecode: ${byteLen} bytes (limit: 24 576)`);

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer);
  console.log("\nDeploying MvaultView…");

  const contract = await factory.deploy(MVAULT_ADDRESS, { gasLimit: 2_000_000 });
  console.log(`  tx hash : ${contract.deploymentTransaction()?.hash}`);

  const receipt = await contract.waitForDeployment();
  const addr    = await contract.getAddress();

  console.log(`\n✓ MvaultView deployed at: ${addr}`);
  console.log(`  Block: ${receipt.deploymentTransaction()?.blockNumber ?? "pending"}`);

  console.log("\n── Add to your .env / VPS environment ──");
  console.log(`VITE_MVAULT_VIEW_ADDRESS=${addr}`);

  // Quick smoke-test — call a few view functions
  console.log("\n── Smoke test ──");
  try {
    const view = new ethers.Contract(addr, artifact.abi, provider);
    const count = await view.getAllUsersCount();
    console.log(`  getAllUsersCount() = ${count}`);
    const [binary, reserve, admin] = await view.getPoolBalances();
    console.log(`  getPoolBalances()  = binary:${ethers.formatUnits(binary,18)} reserve:${ethers.formatUnits(reserve,18)} admin:${ethers.formatUnits(admin,18)}`);
    const pkg = await view.PACKAGE_PRICE();
    console.log(`  PACKAGE_PRICE()    = ${ethers.formatUnits(pkg,18)} USDT`);
    const lim = await view.INCOME_LIMIT();
    console.log(`  INCOME_LIMIT()     = ${ethers.formatUnits(lim,18)} USDT`);
    const lock = await view.getLockDuration();
    console.log(`  getLockDuration()  = ${Number(lock) / 86400} days`);
  } catch (e) {
    console.warn("  Smoke-test warning:", e.shortMessage || e.message);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
