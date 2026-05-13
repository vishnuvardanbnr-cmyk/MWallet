/**
 * Binary & Power Leg Auto-Distributor
 *
 * Runs on a schedule on the backend server.
 * Step 1: distributeBinaryIncome(0, totalUsers)  — every INTERVAL_MS
 * Step 2: distributePowerLeg(0, totalUsers)       — immediately after Step 1
 *
 * Requires env:
 *   DEPLOYER_PRIVATE_KEY   — wallet that is the contract owner/admin
 *   VITE_MVAULT_CONTRACT_ADDRESS (optional override, falls back to hardcoded)
 *   VITE_BSC_NETWORK       — "mainnet" | "testnet" (default: testnet)
 */

import { ethers } from "ethers";
import { log } from "./index";

const MVAULT_CONTRACT_ADDRESS =
  process.env.VITE_MVAULT_CONTRACT_ADDRESS ||
  "0x164E4c01958c623CeF48C7DF8C66deFbB5eB4f57";

const RPC_TESTNET = [
  "https://bsc-testnet-rpc.publicnode.com",
  "https://data-seed-prebsc-1-s1.binance.org:8545/",
];
const RPC_MAINNET = [
  "https://bsc-rpc.publicnode.com",
  "https://bsc-dataseed1.binance.org/",
];

const isMainnet = process.env.VITE_BSC_NETWORK === "mainnet";
const RPC_LIST  = isMainnet ? RPC_MAINNET : RPC_TESTNET;

const DISTRIBUTION_ABI = [
  "function distributeBinaryIncome(uint256 offset, uint256 limit) external",
  "function distributePowerLeg(uint256 offset, uint256 limit) external",
  "function getPoolBalances() view returns (uint256 binary, uint256 reserve, uint256 admin)",
  "function getAllUsersCount() view returns (uint256)",
];

// How often to attempt distribution (default: every 24 hours)
const INTERVAL_MS = parseInt(process.env.DISTRIBUTION_INTERVAL_MS || "") || 24 * 60 * 60 * 1000;

// Minimum binary pool (in USDT wei) required before distributing — avoids wasted gas on empty pool
const MIN_POOL_WEI = ethers.parseUnits("1", 18); // $1 minimum

let isRunning = false;

function getProvider(): ethers.JsonRpcProvider {
  for (const rpc of RPC_LIST) {
    try {
      return new ethers.JsonRpcProvider(rpc);
    } catch {
      continue;
    }
  }
  return new ethers.JsonRpcProvider(RPC_LIST[0]);
}

export async function runDistribution(): Promise<void> {
  if (isRunning) {
    log("Distribution already in progress — skipping this cycle", "distributor");
    return;
  }

  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    log("DEPLOYER_PRIVATE_KEY not set — skipping distribution", "distributor");
    return;
  }

  isRunning = true;
  log("Starting binary & power leg distribution cycle…", "distributor");

  try {
    const provider = getProvider();
    const signer   = new ethers.Wallet(privateKey, provider);
    const contract = new ethers.Contract(MVAULT_CONTRACT_ADDRESS, DISTRIBUTION_ABI, signer);

    // Read pool state
    const [binaryPool, powerLegReserve] = await contract.getPoolBalances() as [bigint, bigint, bigint];
    const totalUsers = Number(await contract.getAllUsersCount());

    log(
      `Pool state — Binary: ${ethers.formatUnits(binaryPool, 18)} USDT, ` +
      `PowerLegReserve: ${ethers.formatUnits(powerLegReserve, 18)} USDT, ` +
      `Users: ${totalUsers}`,
      "distributor"
    );

    if (totalUsers === 0) {
      log("No users — skipping distribution", "distributor");
      return;
    }

    // ── STEP 1: Distribute Binary Income ──────────────────────────────────────
    if (binaryPool >= MIN_POOL_WEI) {
      log(`Running Step 1 — distributeBinaryIncome (pool: $${ethers.formatUnits(binaryPool, 18)})`, "distributor");
      const tx1 = await contract.distributeBinaryIncome(0, totalUsers, { gasLimit: 3_000_000 });
      log(`Step 1 tx sent: ${tx1.hash}`, "distributor");
      const receipt1 = await tx1.wait();
      log(`Step 1 confirmed in block ${receipt1?.blockNumber}`, "distributor");
    } else if (powerLegReserve >= MIN_POOL_WEI) {
      // Binary already distributed this cycle (reserve is set), skip to step 2
      log("Binary already distributed — jumping straight to Step 2", "distributor");
    } else {
      log(`Binary pool too small ($${ethers.formatUnits(binaryPool, 18)}) — skipping this cycle`, "distributor");
      return;
    }

    // ── STEP 2: Distribute Power Leg ──────────────────────────────────────────
    // Re-read reserve after step 1
    const [, reserveAfterStep1] = await contract.getPoolBalances() as [bigint, bigint, bigint];

    if (reserveAfterStep1 >= MIN_POOL_WEI) {
      log(`Running Step 2 — distributePowerLeg (reserve: $${ethers.formatUnits(reserveAfterStep1, 18)})`, "distributor");
      const tx2 = await contract.distributePowerLeg(0, totalUsers, { gasLimit: 3_000_000 });
      log(`Step 2 tx sent: ${tx2.hash}`, "distributor");
      const receipt2 = await tx2.wait();
      log(`Step 2 confirmed in block ${receipt2?.blockNumber}`, "distributor");
      log("Distribution cycle complete ✓", "distributor");
    } else {
      log("Power leg reserve is empty after step 1 — cycle done", "distributor");
    }

  } catch (err: any) {
    const msg = err?.shortMessage || err?.reason || err?.message || String(err);
    log(`Distribution error: ${msg}`, "distributor");
  } finally {
    isRunning = false;
  }
}

export function startDistributor(): void {
  if (!process.env.DEPLOYER_PRIVATE_KEY) {
    log("DEPLOYER_PRIVATE_KEY not set — auto-distributor disabled", "distributor");
    return;
  }

  log(
    `Auto-distributor started — interval: ${INTERVAL_MS / 1000 / 60} minutes (${isMainnet ? "mainnet" : "testnet"})`,
    "distributor"
  );

  // Run once shortly after startup (5 minutes delay to let server settle)
  const STARTUP_DELAY = 5 * 60 * 1000;
  setTimeout(() => {
    runDistribution();
    // Then run on the fixed interval
    setInterval(runDistribution, INTERVAL_MS);
  }, STARTUP_DELAY);
}
