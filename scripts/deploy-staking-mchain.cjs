/**
 * Deploy MvaultStaking on MChain and link it to main + MVT token.
 * MChain uses nonce+1 for CREATE address derivation, so we MUST
 * read contractAddress from the deployment receipt — not getAddress().
 *
 * Usage:
 *   node scripts/deploy-staking-mchain.cjs
 */
const { ethers } = require("ethers");
const fs = require("fs");

const RPC           = "https://node.mymchain.com/api/rpc";
const MAIN_CONTRACT = "0x60c5bd746f6245ecE5daC006082a7bd13f521aF8";
const MVT_TOKEN     = "0x183a4A6b843ce85D1e363D7a1820f404fccDD726";
const USDT          = "0xab8c6267dcca9e70b625014c8f77eee9728e14c3";
const GAS_PRICE     = 1_000_000_000n;
const DEPLOY_GAS    = 8_000_000n;
const CALL_GAS      = 100_000n;
const CHAIN_ID      = 1888n;

async function waitReceipt(provider, txHash, label) {
  process.stdout.write(`  waiting for ${label} (${txHash.slice(0, 12)}...)  `);
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const r = await provider.send("eth_getTransactionReceipt", [txHash]);
    if (r) {
      console.log(r.status === "0x1" ? "✓" : "✗ FAILED");
      return r;
    }
    process.stdout.write(".");
  }
  throw new Error(`${label}: receipt not found after 3 min`);
}

async function main() {
  const key = process.env.DEPLOYER_PRIVATE_KEY;
  if (!key) throw new Error("DEPLOYER_PRIVATE_KEY not set");

  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet   = new ethers.Wallet(key, provider);

  const bal = await provider.getBalance(wallet.address);
  console.log("═══════════════════════════════════════════════════");
  console.log("  Deploy MvaultStaking → MChain (nonce+1 address)");
  console.log("  Deployer:", wallet.address);
  console.log("  Balance: ", ethers.formatEther(bal), "MCC");
  console.log("═══════════════════════════════════════════════════\n");

  // Load artifact
  const artifact = JSON.parse(
    fs.readFileSync("artifacts/contracts/MvaultStaking.sol/MvaultStaking.json", "utf8")
  );

  // Build constructor args (owner, mvaultMain, usdt, mvaultToken)
  const iface = new ethers.Interface(artifact.abi);
  const constructorArgs = iface.encodeDeploy([wallet.address, MAIN_CONTRACT, USDT, MVT_TOKEN]).slice(2);
  const initcode = artifact.bytecode + constructorArgs;

  // ── Step 1: Deploy ──────────────────────────────────────────────────────────
  console.log("[1/3] Deploying MvaultStaking...");
  let nonce = await provider.getTransactionCount(wallet.address, "latest");
  console.log("  using nonce:", nonce);

  const deployTx = {
    to: null,
    data: initcode,
    gasLimit: DEPLOY_GAS,
    gasPrice: GAS_PRICE,
    nonce,
    chainId: CHAIN_ID,
    type: 0,
  };
  const signedDeploy = await wallet.signTransaction(deployTx);
  const deployHash   = await provider.send("eth_sendRawTransaction", [signedDeploy]);
  console.log("  tx hash:", deployHash);
  const deployReceipt = await waitReceipt(provider, deployHash, "deploy");

  if (deployReceipt.status !== "0x1") {
    throw new Error("Deploy transaction failed (status=0x0)");
  }

  const newStakingAddr = deployReceipt.contractAddress;
  if (!newStakingAddr) throw new Error("contractAddress missing from receipt");
  console.log("  ✓ MvaultStaking deployed at:", newStakingAddr);

  // Verify code
  const code = await provider.getCode(newStakingAddr);
  console.log("  code bytes:", (code.length - 2) / 2);
  if ((code.length - 2) / 2 < 10) throw new Error("No code at deployed address");

  // Verify immutables
  const checkIface = new ethers.Interface([
    "function usdtToken() view returns (address)",
    "function mvaultToken() view returns (address)",
    "function mvaultMain() view returns (address)",
  ]);
  const callSel = async (sel) =>
    provider.send("eth_call", [{ to: newStakingAddr, data: sel }, "latest"]);

  const usdtRes  = await callSel(checkIface.getFunction("usdtToken").selector);
  const mvtRes   = await callSel(checkIface.getFunction("mvaultToken").selector);
  const mainRes  = await callSel(checkIface.getFunction("mvaultMain").selector);
  const usdtAddr = "0x" + usdtRes.slice(26);
  const mvtAddr  = "0x" + mvtRes.slice(26);
  const mainAddr = "0x" + mainRes.slice(26);

  console.log("  usdtToken:   ", usdtAddr, usdtAddr.toLowerCase() === USDT.toLowerCase() ? "✓" : "✗");
  console.log("  mvaultToken: ", mvtAddr,  mvtAddr.toLowerCase() === MVT_TOKEN.toLowerCase() ? "✓" : "✗");
  console.log("  mvaultMain:  ", mainAddr, mainAddr.toLowerCase() === MAIN_CONTRACT.toLowerCase() ? "✓" : "✗");

  // ── Step 2: MvaultContract.setStakingModule ──────────────────────────────────
  console.log("\n[2/3] MvaultContract.setStakingModule...");
  nonce = await provider.getTransactionCount(wallet.address, "latest");
  const mainIface = new ethers.Interface(["function setStakingModule(address _staking) external"]);
  const mainTx = {
    to: MAIN_CONTRACT,
    data: mainIface.encodeFunctionData("setStakingModule", [newStakingAddr]),
    gasLimit: CALL_GAS,
    gasPrice: GAS_PRICE,
    nonce,
    chainId: CHAIN_ID,
    type: 0,
  };
  const signedMain = await wallet.signTransaction(mainTx);
  const mainHash   = await provider.send("eth_sendRawTransaction", [signedMain]);
  const mainReceipt = await waitReceipt(provider, mainHash, "setStakingModule(main)");
  if (mainReceipt.status !== "0x1") throw new Error("setStakingModule on main failed");

  // Verify
  const mainCheckIface = new ethers.Interface(["function stakingModule() view returns (address)"]);
  const mainVerify = await provider.send("eth_call", [
    { to: MAIN_CONTRACT, data: mainCheckIface.getFunction("stakingModule").selector }, "latest"
  ]);
  console.log("  ✓ MAIN.stakingModule:", "0x" + mainVerify.slice(26));

  // ── Step 3: MvaultToken.setStakingModule ─────────────────────────────────────
  console.log("\n[3/3] MvaultToken.setStakingModule...");
  nonce = await provider.getTransactionCount(wallet.address, "latest");
  const mvtIface = new ethers.Interface(["function setStakingModule(address _staking) external"]);
  const mvtTx = {
    to: MVT_TOKEN,
    data: mvtIface.encodeFunctionData("setStakingModule", [newStakingAddr]),
    gasLimit: CALL_GAS,
    gasPrice: GAS_PRICE,
    nonce,
    chainId: CHAIN_ID,
    type: 0,
  };
  const signedMvt = await wallet.signTransaction(mvtTx);
  const mvtHash   = await provider.send("eth_sendRawTransaction", [signedMvt]);
  const mvtReceipt = await waitReceipt(provider, mvtHash, "setStakingModule(mvt)");
  if (mvtReceipt.status !== "0x1") throw new Error("setStakingModule on MVT failed");

  // Verify
  const mvtCheckIface = new ethers.Interface(["function stakingModule() view returns (address)"]);
  const mvtVerify = await provider.send("eth_call", [
    { to: MVT_TOKEN, data: mvtCheckIface.getFunction("stakingModule").selector }, "latest"
  ]);
  console.log("  ✓ MVT.stakingModule:", "0x" + mvtVerify.slice(26));

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  DONE — update your .env:");
  console.log(`  VITE_MVAULT_STAKING_ADDRESS=${newStakingAddr}`);
  console.log("═══════════════════════════════════════════════════\n");
}

main().catch(e => { console.error("FATAL:", e.message || e); process.exit(1); });
