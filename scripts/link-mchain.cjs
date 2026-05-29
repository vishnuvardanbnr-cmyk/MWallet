/**
 * Finish linking MChain contracts.
 * Queries nonce fresh before every tx to handle MChain's nonce behaviour.
 */
require("dotenv/config");
const { ethers } = require("ethers");
const fs   = require("fs");
const path = require("path");

const RPC            = "https://node.mymchain.com/api/rpc";
const PRIVATE_KEY    = process.env.DEPLOYER_PRIVATE_KEY;
const MANAGER_WALLET = "0x12Fcf3d1084455d3677a110925D73b01F3846750";
const GAS_PRICE      = 1_000_000_000n;
const GAS_LIMIT      = 200_000n;
const CHAIN_ID       = 1888n;

const TOKEN_ADDR    = "0xF7417D167b4CD52a025d59cE1C1B560ea692Aee5";
const CONTRACT_ADDR = "0x9e71d588e0E5eAa51f7489B47F4cC1BB48e4383a";
const BOARD_ADDR    = "0xaa7E340b633a90FA36e981cA10d0D7059Be9520b";
const STAKING_ADDR  = "0xB345a75d05f654E3109F59b08Af0C3410f8730Fe";

function loadAbi(name) {
  const p = path.join(__dirname, `../artifacts/contracts/${name}.sol/${name}.json`);
  return JSON.parse(fs.readFileSync(p, "utf8")).abi;
}

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

async function waitForReceipt(txHash, label) {
  console.log(`    waiting for receipt...`);
  for (let i = 0; i < 80; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const receipt = await rpc("eth_getTransactionReceipt", [txHash]);
    if (receipt) {
      if (receipt.status === "0x1") { console.log(`    included in block ${parseInt(receipt.blockNumber,16)}`); return receipt; }
      throw new Error(`${label} reverted (status 0x0)`);
    }
  }
  throw new Error(`${label} timed out`);
}

async function send(label, contractAddr, iface, method, args, wallet) {
  // Always query nonce fresh — MChain may skip nonces on some internal txs
  const nonceHex = await rpc("eth_getTransactionCount", [wallet.address, "pending"]);
  const nonce = parseInt(nonceHex, 16);
  console.log(`  → ${label} (nonce ${nonce})`);

  const data = iface.encodeFunctionData(method, args);
  const tx = { to: contractAddr, data, gasPrice: GAS_PRICE, gasLimit: GAS_LIMIT, nonce: BigInt(nonce), chainId: CHAIN_ID, value: 0n };
  const signed = await wallet.signTransaction(tx);
  const hash = await rpc("eth_sendRawTransaction", [signed]);
  console.log(`    txHash: ${hash}`);
  await waitForReceipt(hash, label);
  console.log(`  ✓ ${label}`);
}

async function isAlreadySet(contractAddr, iface, viewMethod, args, expectedAddr) {
  try {
    const data = iface.encodeFunctionData(viewMethod, args);
    const result = await rpc("eth_call", [{ to: contractAddr, data }, "latest"]);
    const decoded = iface.decodeFunctionResult(viewMethod, result);
    return decoded[0].toLowerCase() === expectedAddr.toLowerCase();
  } catch { return false; }
}

async function main() {
  if (!PRIVATE_KEY) { console.error("DEPLOYER_PRIVATE_KEY not set"); process.exit(1); }
  const wallet = new ethers.Wallet(PRIVATE_KEY);

  const balHex = await rpc("eth_getBalance", [wallet.address, "latest"]);
  const nonceHex = await rpc("eth_getTransactionCount", [wallet.address, "latest"]);
  console.log(`\nDeployer: ${wallet.address}`);
  console.log(`Balance:  ${ethers.formatEther(BigInt(balHex))} MxC`);
  console.log(`Nonce:    ${parseInt(nonceHex, 16)}\n`);

  const tokenIface  = new ethers.Interface(loadAbi("MvaultToken"));
  const mvaultIface = new ethers.Interface(loadAbi("MvaultContract"));
  const boardIface  = new ethers.Interface(loadAbi("MvaultBoardMatrix"));

  // Check which steps are already done and skip them
  const steps = [
    {
      label: "MvaultToken.setStakingModule",
      check: () => isAlreadySet(TOKEN_ADDR, tokenIface, "stakingModule", [], STAKING_ADDR),
      run:   () => send("MvaultToken.setStakingModule",        TOKEN_ADDR,    tokenIface,  "setStakingModule",    [STAKING_ADDR],   wallet),
    },
    {
      label: "MvaultContract.setBoardHandler",
      check: () => isAlreadySet(CONTRACT_ADDR, mvaultIface, "boardHandler", [], BOARD_ADDR),
      run:   () => send("MvaultContract.setBoardHandler",      CONTRACT_ADDR, mvaultIface, "setBoardHandler",     [BOARD_ADDR],     wallet),
    },
    {
      label: "MvaultContract.setStakingModule",
      check: () => isAlreadySet(CONTRACT_ADDR, mvaultIface, "stakingModule", [], STAKING_ADDR),
      run:   () => send("MvaultContract.setStakingModule",     CONTRACT_ADDR, mvaultIface, "setStakingModule",    [STAKING_ADDR],   wallet),
    },
    {
      label: "MvaultBoardMatrix.setMvaultContract",
      check: () => isAlreadySet(BOARD_ADDR, boardIface, "mvaultContract", [], CONTRACT_ADDR),
      run:   () => send("MvaultBoardMatrix.setMvaultContract", BOARD_ADDR,    boardIface,  "setMvaultContract",   [CONTRACT_ADDR],  wallet),
    },
    {
      label: "MvaultBoardMatrix.setLiquidityAddr",
      check: () => isAlreadySet(BOARD_ADDR, boardIface, "liquidityAddress", [], wallet.address),
      run:   () => send("MvaultBoardMatrix.setLiquidityAddr",  BOARD_ADDR,    boardIface,  "setLiquidityAddress", [wallet.address], wallet),
    },
    {
      label: "MvaultBoardMatrix.setSystemAddr",
      check: () => isAlreadySet(BOARD_ADDR, boardIface, "systemAddress", [], wallet.address),
      run:   () => send("MvaultBoardMatrix.setSystemAddr",     BOARD_ADDR,    boardIface,  "setSystemAddress",    [wallet.address], wallet),
    },
    {
      label: "MvaultContract.setManager",
      check: () => isAlreadySet(CONTRACT_ADDR, mvaultIface, "manager", [], MANAGER_WALLET),
      run:   () => send("MvaultContract.setManager",           CONTRACT_ADDR, mvaultIface, "setManager",          [MANAGER_WALLET], wallet),
    },
  ];

  for (const step of steps) {
    const done = await step.check();
    if (done) { console.log(`  ✓ ${step.label} (already set — skipping)`); continue; }
    await step.run();
  }

  const finalBalHex = await rpc("eth_getBalance", [wallet.address, "latest"]);
  console.log(`\n✅ All contracts linked and configured!`);
  console.log(`Remaining balance: ${ethers.formatEther(BigInt(finalBalHex))} MxC\n`);
  console.log(`── Contract addresses (MChain 1888) ──`);
  console.log(`VITE_MVAULT_CONTRACT_ADDRESS=${CONTRACT_ADDR}`);
  console.log(`VITE_MVT_TOKEN_ADDRESS=${TOKEN_ADDR}`);
  console.log(`VITE_BOARD_HANDLER_ADDRESS=${BOARD_ADDR}`);
  console.log(`VITE_MVAULT_STAKING_ADDRESS=${STAKING_ADDR}`);
  console.log(`VITE_PAYMENT_TOKEN_ADDRESS=0xab8c6267dcca9e70b625014c8f77eee9728e14c3`);
}

main().catch(err => { console.error("❌", err.message || err); process.exit(1); });
