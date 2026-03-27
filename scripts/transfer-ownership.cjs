// transfer-ownership.cjs — Transfer ownership of all 3 MVault contracts
const { ethers } = require("hardhat");
require("dotenv").config();

const NEW_OWNER        = "0x04E8c5B49dE683c5B44eF1269Bd5ee4f338868C4";
const MVAULT_CONTRACT  = "0x08d7e03c29623d3eEcc2D53cF6D4A1edf7E5F57c";
const MVT_TOKEN        = "0x50984Ea16b3F79bB9B280a1ddEd624080F146Ad4";
const BOARD_HANDLER    = "0x9dBE6Ee45d93d223AAF515c76dB74FA63f48b474";

const OWNABLE_ABI = [
  "function owner() view returns (address)",
  "function transferOwnership(address newOwner) external",
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`\nCalling from: ${deployer.address}`);
  console.log(`New owner:    ${NEW_OWNER}\n`);

  const contracts = [
    { name: "MvaultContract",  address: MVAULT_CONTRACT },
    { name: "MvaultToken",     address: MVT_TOKEN },
    { name: "MvaultBoard",     address: BOARD_HANDLER },
  ];

  for (const { name, address } of contracts) {
    const c = new ethers.Contract(address, OWNABLE_ABI, deployer);
    const current = await c.owner();
    console.log(`${name} (${address})`);
    console.log(`  Current owner: ${current}`);

    if (current.toLowerCase() === NEW_OWNER.toLowerCase()) {
      console.log(`  ✓ Already owned by new owner — skipping\n`);
      continue;
    }

    if (current.toLowerCase() !== deployer.address.toLowerCase()) {
      console.log(`  ✗ Deployer is NOT the current owner — cannot transfer\n`);
      continue;
    }

    console.log(`  Sending transferOwnership...`);
    const tx = await c.transferOwnership(NEW_OWNER);
    console.log(`  TX: ${tx.hash}`);
    await tx.wait();
    console.log(`  ✓ Ownership transferred\n`);
  }

  console.log("Done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
