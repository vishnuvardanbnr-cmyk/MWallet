const { ethers } = require("ethers");
const RPC = "https://node.mymchain.com/api/rpc";
const MVAULT  = "0xbade927063dd8539e287f2533e8f99ed0ba90ad9";
const MVT     = "0x899dea1532a780a6e78a60f9a765ac4592484c32";
const BOARD   = "0x8339fd14a09be1834f9357d8180fcdb8772ba536";
const STAKING = "0x38983e73b0686bf7fb89b431555319f476dd3c9f";
const NEW_OWNER = "0xF305fEdfFF08ADAA7D2F73cA17F6bA4a3FB79318";
const GAS_PRICE = 1_000_000_000n;
const CHAIN_ID  = 1888n;

const provider = new ethers.JsonRpcProvider(RPC);
const wallet   = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);

async function sendTx(to, data, label) {
  const nonce = parseInt(await provider.send("eth_getTransactionCount", [wallet.address, "latest"]), 16);
  const gasEst = await provider.send("eth_estimateGas", [{ from: wallet.address, to, data, nonce: "0x" + nonce.toString(16) }]);
  const gasLimit = BigInt(gasEst) * 12n / 10n;
  const signed = await wallet.signTransaction({ to, data, gasPrice: GAS_PRICE, gasLimit, nonce: BigInt(nonce), chainId: CHAIN_ID, value: 0n });
  const hash = await provider.send("eth_sendRawTransaction", [signed]);
  console.log(`  [${label}] tx: ${hash}`);
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const r = await provider.send("eth_getTransactionReceipt", [hash]);
    if (r) { console.log(`  [${label}] ${r.status === "0x1" ? "✓ OK" : "✗ FAILED"}`); return; }
  }
  console.log(`  [${label}] timeout`);
}

async function main() {
  console.log("Deployer:", wallet.address);
  const iface = new ethers.Interface(["function transferOwnership(address)"]);
  const data  = iface.encodeFunctionData("transferOwnership", [NEW_OWNER]);
  const contracts = [[MVAULT,"MvaultContract"],[MVT,"MvaultToken"],[BOARD,"BoardMatrix"],[STAKING,"MvaultStaking"]];
  for (const [addr, label] of contracts) await sendTx(addr, data, label);

  console.log("\n── Verifying owner ──");
  const ownerAbi = new ethers.Interface(["function owner() view returns (address)"]);
  for (const [addr, label] of contracts) {
    const o = await new ethers.Contract(addr, ownerAbi, provider).owner();
    console.log(`${label}: ${o} ${o.toLowerCase()===NEW_OWNER.toLowerCase()?"✓":"✗"}`);
  }
}
main().catch(console.error);
