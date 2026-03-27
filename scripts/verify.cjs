// verify.cjs — Verify all 3 MVault contracts on BSCScan testnet
const { run } = require("hardhat");

const USDT_TESTNET     = "0x0D3E80cBc9DDC0a3Fdee912b99C50cd0b5761eE3";
const MVT_TOKEN        = "0x50984Ea16b3F79bB9B280a1ddEd624080F146Ad4";
const MVAULT_CONTRACT  = "0x08d7e03c29623d3eEcc2D53cF6D4A1edf7E5F57c";
const BOARD_HANDLER    = "0x9dBE6Ee45d93d223AAF515c76dB74FA63f48b474";

async function verify(address, constructorArguments, label) {
  console.log(`\nVerifying ${label} (${address})...`);
  try {
    await run("verify:verify", { address, constructorArguments });
    console.log(`✓ ${label} verified`);
  } catch (e) {
    if (e.message?.toLowerCase().includes("already verified")) {
      console.log(`✓ ${label} already verified`);
    } else {
      console.error(`✗ ${label} failed:`, e.message);
    }
  }
}

async function main() {
  // MvaultToken: constructor(address _usdt)
  await verify(MVT_TOKEN, [USDT_TESTNET], "MvaultToken");

  // MvaultContract: constructor(address _usdt, address _mvaultToken)
  await verify(MVAULT_CONTRACT, [USDT_TESTNET, MVT_TOKEN], "MvaultContract");

  // MvaultBoardMatrix: constructor(address _usdt)
  await verify(BOARD_HANDLER, [USDT_TESTNET], "MvaultBoardMatrix");

  console.log("\n✓ All done. Check https://testnet.bscscan.com");
}

main().catch((e) => { console.error(e); process.exit(1); });
