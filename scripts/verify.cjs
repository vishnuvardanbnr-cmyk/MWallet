const { run } = require("hardhat");

const MLM_ADDRESS   = "0x648Ad48639382136c877FfCe966c2b7bf68b0E88";
const BOARD_ADDRESS = "0xD307FB39d7d42B59AC46e28D71ef72019E9D5e38";
const USDT_TESTNET  = "0x0D3E80cBc9DDC0a3Fdee912b99C50cd0b5761eE3";
const TOKEN_DECIMALS = 18;
const ADMIN_WALLET  = "0x04e8c5b49de683c5b44ef1269bd5ee4f338868c4";

async function main() {
  console.log("Verifying MLMContract...");
  await run("verify:verify", {
    address: MLM_ADDRESS,
    constructorArguments: [USDT_TESTNET, TOKEN_DECIMALS, ADMIN_WALLET, ADMIN_WALLET],
  });
  console.log("✓ MLMContract verified");

  console.log("Verifying BoardMatrixHandler...");
  await run("verify:verify", {
    address: BOARD_ADDRESS,
    constructorArguments: [USDT_TESTNET, TOKEN_DECIMALS],
  });
  console.log("✓ BoardMatrixHandler verified");
}

main().catch((err) => { console.error(err); process.exit(1); });
