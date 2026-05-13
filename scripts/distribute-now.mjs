import { ethers } from "ethers";

const ADDR = process.env.VITE_MVAULT_CONTRACT_ADDRESS || "0x164E4c01958c623CeF48C7DF8C66deFbB5eB4f57";
const KEY  = process.env.DEPLOYER_PRIVATE_KEY;

if (!KEY) { console.error("DEPLOYER_PRIVATE_KEY not set"); process.exit(1); }

const ABI = [
  "function distributeBinaryIncome(uint256 offset, uint256 limit) external",
  "function distributePowerLeg(uint256 offset, uint256 limit) external",
  "function getPoolBalances() view returns (uint256 binary, uint256 reserve, uint256 admin)",
  "function getAllUsersCount() view returns (uint256)",
];

const provider = new ethers.JsonRpcProvider("https://bsc-testnet-rpc.publicnode.com");
const signer   = new ethers.Wallet(KEY, provider);
const contract = new ethers.Contract(ADDR, ABI, signer);

const [binary, reserve] = await contract.getPoolBalances();
const totalUsers = Number(await contract.getAllUsersCount());

console.log(`Binary pool   : $${ethers.formatUnits(binary, 18)}`);
console.log(`Power reserve : $${ethers.formatUnits(reserve, 18)}`);
console.log(`Total users   : ${totalUsers}`);

if (binary > 0n) {
  console.log("\nStep 1 — distributeBinaryIncome...");
  const tx1 = await contract.distributeBinaryIncome(0, totalUsers, { gasLimit: 3_000_000 });
  console.log("tx:", tx1.hash);
  await tx1.wait();
  console.log("Step 1 confirmed.");

  const [, res2] = await contract.getPoolBalances();
  if (res2 > 0n) {
    console.log("\nStep 2 — distributePowerLeg...");
    const tx2 = await contract.distributePowerLeg(0, totalUsers, { gasLimit: 3_000_000 });
    console.log("tx:", tx2.hash);
    await tx2.wait();
    console.log("Step 2 confirmed. Done.");
  } else {
    console.log("Power reserve empty after step 1 — done.");
  }
} else if (reserve > 0n) {
  console.log("\nStep 2 only — distributePowerLeg...");
  const tx2 = await contract.distributePowerLeg(0, totalUsers, { gasLimit: 3_000_000 });
  console.log("tx:", tx2.hash);
  await tx2.wait();
  console.log("Step 2 confirmed. Done.");
} else {
  console.log("\nBinary pool is empty — nothing to distribute.");
}
