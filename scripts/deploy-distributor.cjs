/**
 * Deploy MvaultDistributor and wire it up to MvaultContract.
 *
 * Usage:
 *   node scripts/deploy-distributor.cjs
 *
 * Requires env:
 *   DEPLOYER_PRIVATE_KEY
 *   VITE_MVAULT_CONTRACT_ADDRESS    (defaults to testnet address in replit.md)
 *   VITE_BSC_NETWORK                (default: testnet)
 */

require("dotenv/config");
const { ethers } = require("ethers");
const fs  = require("fs");
const path = require("path");

const MVAULT_ADDRESS =
  process.env.VITE_MVAULT_CONTRACT_ADDRESS ||
  "0x164E4c01958c623CeF48C7DF8C66deFbB5eB4f57";

const isMainnet = process.env.VITE_BSC_NETWORK === "mainnet";
const RPC = isMainnet
  ? "https://bsc-rpc.publicnode.com"
  : "https://bsc-testnet-rpc.publicnode.com";

const MVAULT_ABI = [
  "function setDistributor(address _distributor) external",
  "function distributor() view returns (address)",
];

async function main() {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) throw new Error("DEPLOYER_PRIVATE_KEY not set");

  const provider = new ethers.JsonRpcProvider(RPC);
  const signer   = new ethers.Wallet(privateKey, provider);
  console.log("Deployer:", signer.address);

  // Load compiled artifact
  const artifactPath = path.join(__dirname, "../artifacts/contracts/MvaultDistributor.sol/MvaultDistributor.json");
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Artifact not found at ${artifactPath}\nRun: npx hardhat compile`);
  }
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  console.log(`Deploying MvaultDistributor (mvault=${MVAULT_ADDRESS})…`);
  const factory    = new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer);
  const distributor = await factory.deploy(MVAULT_ADDRESS);
  await distributor.waitForDeployment();
  const distributorAddress = await distributor.getAddress();
  console.log(`MvaultDistributor deployed: ${distributorAddress}`);

  // Wire up: call setDistributor on MvaultContract
  console.log("Calling MvaultContract.setDistributor…");
  const mvault = new ethers.Contract(MVAULT_ADDRESS, MVAULT_ABI, signer);
  const tx = await mvault.setDistributor(distributorAddress, { gasLimit: 100_000 });
  await tx.wait();
  console.log("setDistributor confirmed:", tx.hash);

  // Verify
  const registered = await mvault.distributor();
  console.log("MvaultContract.distributor() =", registered);
  if (registered.toLowerCase() !== distributorAddress.toLowerCase()) {
    throw new Error("Distributor address mismatch — check transaction");
  }

  console.log("\n✓ Deployment complete");
  console.log(`VITE_DISTRIBUTOR_ADDRESS=${distributorAddress}`);
  console.log("\nAdd VITE_DISTRIBUTOR_ADDRESS to your .env and VPS environment.");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
