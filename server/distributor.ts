/**
 * Binary & Power Leg Auto-Distributor (off-chain computation)
 *
 * New contract uses applyBinaryDistribution / applyPowerLegDistribution which
 * require the admin to pre-compute shares off-chain, then submit them in a
 * single transaction.
 *
 * Step 1: Read all users from chain, compute binary shares, call applyBinaryDistribution
 * Step 2: Read power leg points from chain, compute shares, call applyPowerLegDistribution
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
  // Public state getters
  "function binaryPool() view returns (uint256)",
  "function reservePool() view returns (uint256)",
  "function adminPool() view returns (uint256)",
  "function totalUsers() view returns (uint256)",
  "function allUsers(uint256) view returns (address)",
  // Full user struct
  "function users(address) view returns (bool isRegistered, bool isActive, address sponsor, uint256 directCount, address binaryParent, bool placedLeft, address leftChild, address rightChild, uint256 leftSubVolume, uint256 rightSubVolume, uint256 matchedVolume, uint256 mvtBalance, uint256 totalReceived, uint256 totalSold, uint256 incomeLimit, uint256 usdtBalance, uint256 rebirthPool, uint256 totalUsdtEarned, uint256 btcPoolBalance, uint256 totalBtcEarned, uint256 powerLegPoints, uint256 packagePrice, uint256 incomeLimitCap, address mainAccount, uint256 rebirthCount, uint8 rank, uint256 teamSalesUsdt, uint256 joinedAt, string displayName, string email, string phone, string country, bool profileSet)",
  // Distribution functions (new API)
  "function applyBinaryDistribution(address[] users_arr, uint256[] shares, uint256[] powerLegPts, uint256[] newMatchedVols) external",
  "function applyPowerLegDistribution(address[] users_arr, uint256[] shares, uint256 adminLeftover) external",
];

// How often to attempt distribution (default: every 24 hours)
const INTERVAL_MS = parseInt(process.env.DISTRIBUTION_INTERVAL_MS || "") || 24 * 60 * 60 * 1000;

// Minimum binary pool (in MVT wei) required before distributing
const MIN_POOL_WEI = ethers.parseUnits("1", 18);

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

    // ── Read pool state ────────────────────────────────────────────────────────
    const [binaryPool, totalUsersN] = await Promise.all([
      contract.binaryPool() as Promise<bigint>,
      contract.totalUsers() as Promise<bigint>,
    ]);
    const totalUsers = Number(totalUsersN);

    log(
      `Pool state — Binary: ${ethers.formatUnits(binaryPool, 18)} MVT, Users: ${totalUsers}`,
      "distributor"
    );

    if (totalUsers === 0) {
      log("No users — skipping distribution", "distributor");
      return;
    }

    if (binaryPool < MIN_POOL_WEI) {
      log(`Binary pool too small (${ethers.formatUnits(binaryPool, 18)}) — skipping this cycle`, "distributor");
      return;
    }

    // ── Read all user addresses ────────────────────────────────────────────────
    log(`Reading ${totalUsers} user addresses…`, "distributor");
    const ADDR_BATCH = 50;
    const userAddresses: string[] = [];
    for (let i = 0; i < totalUsers; i += ADDR_BATCH) {
      const batch = await Promise.all(
        Array.from({ length: Math.min(ADDR_BATCH, totalUsers - i) }, (_, k) =>
          contract.allUsers(i + k) as Promise<string>
        )
      );
      userAddresses.push(...batch);
    }

    // ── Read all user structs ──────────────────────────────────────────────────
    log(`Reading ${userAddresses.length} user structs…`, "distributor");
    const STRUCT_BATCH = 20;
    type UserData = {
      addr: string;
      isActive: boolean;
      leftSubVolume: bigint;
      rightSubVolume: bigint;
      matchedVolume: bigint;
      powerLegPoints: bigint;
      incomeLimit: bigint;
    };
    const userData: UserData[] = [];
    for (let i = 0; i < userAddresses.length; i += STRUCT_BATCH) {
      const slice = userAddresses.slice(i, i + STRUCT_BATCH);
      const infos = await Promise.all(slice.map(a => contract.users(a)));
      for (let j = 0; j < slice.length; j++) {
        const u = infos[j];
        userData.push({
          addr:           slice[j],
          isActive:       u.isActive,
          leftSubVolume:  u.leftSubVolume  as bigint,
          rightSubVolume: u.rightSubVolume as bigint,
          matchedVolume:  u.matchedVolume  as bigint,
          powerLegPoints: u.powerLegPoints as bigint,
          incomeLimit:    u.incomeLimit    as bigint,
        });
      }
    }

    // ── STEP 1: Compute binary distribution ───────────────────────────────────
    const binary70 = (binaryPool * 70n) / 100n;

    type BinaryEntry = {
      addr: string;
      newPairs: bigint;       // new matched volume this cycle
      powerLegPts: bigint;    // unmatched excess on stronger leg
      newMatchedVol: bigint;  // updated watermark = min(left, right)
    };

    const eligible: BinaryEntry[] = [];
    let totalNewPairs = 0n;

    for (const u of userData) {
      if (!u.isActive) continue;
      const minSide = u.leftSubVolume < u.rightSubVolume ? u.leftSubVolume : u.rightSubVolume;
      const maxSide = u.leftSubVolume > u.rightSubVolume ? u.leftSubVolume : u.rightSubVolume;
      const newPairs = minSide > u.matchedVolume ? minSide - u.matchedVolume : 0n;
      if (newPairs === 0n) continue;
      const newMatchedVol = minSide;                   // advance watermark to min(left,right)
      const powerLegPts   = maxSide - newMatchedVol;   // excess on stronger side
      eligible.push({ addr: u.addr, newPairs, powerLegPts, newMatchedVol });
      totalNewPairs += newPairs;
    }

    if (eligible.length === 0 || totalNewPairs === 0n) {
      log("No eligible binary pairs this cycle — skipping", "distributor");
      return;
    }

    log(`Computing shares for ${eligible.length} users (${ethers.formatUnits(totalNewPairs, 18)} total new pairs)`, "distributor");

    const binaryUsers:       string[]  = [];
    const binaryShares:      bigint[]  = [];
    const binaryPowerLegPts: bigint[]  = [];
    const binaryMatchedVols: bigint[]  = [];

    for (const e of eligible) {
      const share = (e.newPairs * binary70) / totalNewPairs;
      if (share === 0n) continue;
      binaryUsers.push(e.addr);
      binaryShares.push(share);
      binaryPowerLegPts.push(e.powerLegPts);
      binaryMatchedVols.push(e.newMatchedVol);
    }

    if (binaryUsers.length === 0) {
      log("All computed shares are zero — skipping", "distributor");
      return;
    }

    log(`Step 1 — applyBinaryDistribution for ${binaryUsers.length} users (pool: ${ethers.formatUnits(binaryPool, 18)} MVT)`, "distributor");
    const tx1 = await contract.applyBinaryDistribution(
      binaryUsers, binaryShares, binaryPowerLegPts, binaryMatchedVols,
      { gasLimit: 5_000_000 }
    );
    log(`Step 1 tx sent: ${tx1.hash}`, "distributor");
    const receipt1 = await tx1.wait();
    log(`Step 1 confirmed in block ${receipt1?.blockNumber}`, "distributor");

    // ── STEP 2: Compute power leg distribution ─────────────────────────────────
    // Read updated power leg points after step 1
    const powerLeg30 = binaryPool - binary70;
    log(`Step 2 — computing power leg distribution (reserve: ${ethers.formatUnits(powerLeg30, 18)} MVT)`, "distributor");

    // Re-read updated powerLegPoints from chain after step 1
    const updatedInfos = await Promise.all(binaryUsers.map(a => contract.users(a)));
    const powerLegEligible: { addr: string; pts: bigint }[] = [];
    let totalPts = 0n;
    for (let i = 0; i < binaryUsers.length; i++) {
      const pts = updatedInfos[i].powerLegPoints as bigint;
      if (pts > 0n) {
        powerLegEligible.push({ addr: binaryUsers[i], pts });
        totalPts += pts;
      }
    }

    const plUsers:  string[] = [];
    const plShares: bigint[] = [];
    let distributedPl = 0n;

    if (totalPts > 0n && powerLegEligible.length > 0) {
      for (const e of powerLegEligible) {
        const share = (e.pts * powerLeg30) / totalPts;
        if (share === 0n) continue;
        plUsers.push(e.addr);
        plShares.push(share);
        distributedPl += share;
      }
    }

    const adminLeftover = powerLeg30 - distributedPl;
    log(`Step 2 — applyPowerLegDistribution for ${plUsers.length} users, adminLeftover: ${ethers.formatUnits(adminLeftover, 18)} MVT`, "distributor");

    const tx2 = await contract.applyPowerLegDistribution(
      plUsers, plShares, adminLeftover,
      { gasLimit: 3_000_000 }
    );
    log(`Step 2 tx sent: ${tx2.hash}`, "distributor");
    const receipt2 = await tx2.wait();
    log(`Step 2 confirmed in block ${receipt2?.blockNumber}`, "distributor");
    log("Distribution cycle complete ✓", "distributor");

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
    setInterval(runDistribution, INTERVAL_MS);
  }, STARTUP_DELAY);
}
