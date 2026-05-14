/**
 * Merkle-proof Binary & Power-Leg Distributor  —  Scale-hardened
 *
 * Performance targets at 1 000 000 members:
 *   • Address reads:   2 000 calls  × 500 addrs  via MvaultView.getUserSlice()
 *   • Struct reads:    5 000 calls  × 200 addrs  via MvaultView.getDistributorBatch()
 *                      (returns only 5 fields, ~40× less data than full users() struct)
 *   • DB writes:       bulk INSERT  in chunks of 500 rows — ~1 min vs 30 min sequential
 *   • Merkle build:    ~400 MB RAM for 1M leaves — within Node.js limits
 *   • On-chain commit: single tx regardless of user count
 *
 * Requires env:
 *   DEPLOYER_PRIVATE_KEY
 *   VITE_MVAULT_CONTRACT_ADDRESS
 *   VITE_MVAULT_VIEW_ADDRESS          — needed for efficient batch reads
 *   VITE_DISTRIBUTOR_ADDRESS
 *   VITE_BSC_NETWORK                  — "mainnet" | "testnet" (default: testnet)
 */

import { ethers } from "ethers";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { log } from "./index";
import { storage } from "./storage";

// ── Config ────────────────────────────────────────────────────────────────────
const MVAULT_CONTRACT_ADDRESS =
  process.env.VITE_MVAULT_CONTRACT_ADDRESS ||
  "0x164E4c01958c623CeF48C7DF8C66deFbB5eB4f57";

const MVAULT_VIEW_ADDRESS = process.env.VITE_MVAULT_VIEW_ADDRESS || "";
const DISTRIBUTOR_ADDRESS = process.env.VITE_DISTRIBUTOR_ADDRESS || "";

const RPC_TESTNET = [
  "https://bsc-testnet-rpc.publicnode.com",
  "https://data-seed-prebsc-1-s1.binance.org:8545/",
];
const RPC_MAINNET = [
  "https://bsc-rpc.publicnode.com",
  "https://bsc-dataseed1.binance.org/",
  "https://bsc-dataseed2.binance.org/",
];

const isMainnet  = process.env.VITE_BSC_NETWORK === "mainnet";
const RPC_LIST   = isMainnet ? RPC_MAINNET : RPC_TESTNET;
const INTERVAL_MS = parseInt(process.env.DISTRIBUTION_INTERVAL_MS || "") || 24 * 60 * 60 * 1000;
const MIN_POOL_WEI = ethers.parseUnits("1", 18);

// Read batch sizes — tuned for public RPC nodes
const ADDR_BATCH   = 500;   // getUserSlice: 500 addrs per call  → 2 000 calls/1M users
const STRUCT_BATCH = 200;   // getDistributorBatch: 200 per call → 5 000 calls/1M users
const DB_CHUNK     = 500;   // rows per bulk INSERT

let isRunning = false;

// ── ABIs ──────────────────────────────────────────────────────────────────────
const MVAULT_ABI = [
  "function binaryPool() view returns (uint256)",
  "function totalUsers() view returns (uint256)",
  "function allUsers(uint256) view returns (address)",
  // Fallback (used only if MvaultView not deployed)
  "function users(address) view returns (bool isRegistered, bool isActive, address sponsor, uint256 directCount, address binaryParent, bool placedLeft, address leftChild, address rightChild, uint256 leftSubVolume, uint256 rightSubVolume, uint256 matchedVolume, uint256 mvtBalance, uint256 totalReceived, uint256 totalSold, uint256 incomeLimit, uint256 usdtBalance, uint256 rebirthPool, uint256 totalUsdtEarned, uint256 btcPoolBalance, uint256 totalBtcEarned, uint256 powerLegPoints, uint256 packagePrice, uint256 incomeLimitCap, address mainAccount, uint256 rebirthCount, uint8 rank, uint256 teamSalesUsdt, uint256 joinedAt, string displayName, string email, string phone, string country, bool profileSet)",
];

const MVAULT_VIEW_ABI = [
  "function getUserSlice(uint256 offset, uint256 limit) view returns (address[])",
  "function getDistributorBatch(address[] addrs) view returns (bool[] isActive, uint256[] leftSubVolume, uint256[] rightSubVolume, uint256[] matchedVolume, uint256[] powerLegPoints)",
];

const DISTRIBUTOR_ABI = [
  "function currentCycle() view returns (uint256)",
  "function commitDistribution(bytes32 root, uint256 totalPool) external",
];

// ── Provider with fallback ────────────────────────────────────────────────────
function getProvider(): ethers.JsonRpcProvider {
  for (const rpc of RPC_LIST) {
    try { return new ethers.JsonRpcProvider(rpc); } catch { continue; }
  }
  return new ethers.JsonRpcProvider(RPC_LIST[0]);
}

// ── Retry wrapper — handles transient RPC failures mid-run ───────────────────
async function withRetry<T>(fn: () => Promise<T>, retries = 4, delayMs = 1500): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      if (attempt === retries) throw err;
      const wait = delayMs * Math.pow(2, attempt);
      log(`RPC error (attempt ${attempt + 1}/${retries + 1}): ${err?.message?.slice(0, 80)} — retrying in ${wait}ms`, "distributor");
      await new Promise(r => setTimeout(r, wait));
    }
  }
  throw new Error("unreachable");
}

// ── Main distribution run ─────────────────────────────────────────────────────
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
  if (!DISTRIBUTOR_ADDRESS) {
    log("VITE_DISTRIBUTOR_ADDRESS not set — skipping distribution", "distributor");
    return;
  }

  isRunning = true;
  const t0 = Date.now();
  log("Starting Merkle distribution cycle…", "distributor");

  try {
    const provider = getProvider();
    const signer   = new ethers.Wallet(privateKey, provider);
    const mvault   = new ethers.Contract(MVAULT_CONTRACT_ADDRESS, MVAULT_ABI, provider);
    const dist     = new ethers.Contract(DISTRIBUTOR_ADDRESS, DISTRIBUTOR_ABI, signer);
    const mvView   = MVAULT_VIEW_ADDRESS
      ? new ethers.Contract(MVAULT_VIEW_ADDRESS, MVAULT_VIEW_ABI, provider)
      : null;

    if (!mvView) {
      log("WARN: VITE_MVAULT_VIEW_ADDRESS not set — falling back to slow individual reads (not suitable for 1M+ users)", "distributor");
    }

    // ── Read pool + cycle state ──────────────────────────────────────────────
    const [binaryPool, totalUsersN, onChainCycle] = await Promise.all([
      mvault.binaryPool()   as Promise<bigint>,
      mvault.totalUsers()   as Promise<bigint>,
      dist.currentCycle()   as Promise<bigint>,
    ]);
    const totalUsers = Number(totalUsersN);
    const nextCycle  = Number(onChainCycle) + 1;

    log(`Pool: ${ethers.formatUnits(binaryPool, 18)} MVT | Users: ${totalUsers} | Next cycle: ${nextCycle}`, "distributor");

    if (totalUsers === 0 || binaryPool < MIN_POOL_WEI) {
      log("Pool too small or no users — skipping", "distributor");
      return;
    }

    // ── Step 1: Read all user addresses ──────────────────────────────────────
    log(`Reading ${totalUsers} user addresses (batch size ${ADDR_BATCH})…`, "distributor");
    const t1 = Date.now();
    const userAddresses: string[] = [];

    if (mvView) {
      // Fast path: getUserSlice returns 500 addresses per eth_call
      for (let i = 0; i < totalUsers; i += ADDR_BATCH) {
        const slice = await withRetry(() =>
          mvView.getUserSlice(i, ADDR_BATCH) as Promise<string[]>
        );
        userAddresses.push(...slice);
        if (i > 0 && i % 50_000 === 0) {
          log(`  addresses: ${i}/${totalUsers} (${Math.round((Date.now()-t1)/1000)}s)`, "distributor");
        }
      }
    } else {
      // Slow fallback: 50 per batch
      const FALLBACK_BATCH = 50;
      for (let i = 0; i < totalUsers; i += FALLBACK_BATCH) {
        const batch = await withRetry(() =>
          Promise.all(
            Array.from({ length: Math.min(FALLBACK_BATCH, totalUsers - i) }, (_, k) =>
              mvault.allUsers(i + k) as Promise<string>
            )
          )
        );
        userAddresses.push(...batch);
      }
    }

    log(`Addresses loaded: ${userAddresses.length} in ${((Date.now()-t1)/1000).toFixed(1)}s`, "distributor");

    // ── Step 2: Read minimal user data (5 fields only) ────────────────────────
    type UserData = {
      addr: string; isActive: boolean;
      leftSubVolume: bigint; rightSubVolume: bigint;
      matchedVolume: bigint; powerLegPoints: bigint;
    };
    const userData: UserData[] = [];
    const t2 = Date.now();
    log(`Reading user data (batch size ${mvView ? STRUCT_BATCH : 20}, using ${mvView ? "getDistributorBatch" : "users() fallback"})…`, "distributor");

    if (mvView) {
      // Fast path: one call returns 5-field arrays for 200 users (vs 33-field struct each)
      for (let i = 0; i < userAddresses.length; i += STRUCT_BATCH) {
        const batch = userAddresses.slice(i, i + STRUCT_BATCH);
        const [isActive, leftSub, rightSub, matched, powerLeg] = await withRetry(() =>
          mvView.getDistributorBatch(batch) as Promise<[boolean[], bigint[], bigint[], bigint[], bigint[]]>
        );
        for (let j = 0; j < batch.length; j++) {
          userData.push({
            addr:           batch[j],
            isActive:       isActive[j],
            leftSubVolume:  leftSub[j],
            rightSubVolume: rightSub[j],
            matchedVolume:  matched[j],
            powerLegPoints: powerLeg[j],
          });
        }
        if (i > 0 && i % 100_000 === 0) {
          log(`  structs: ${i}/${userAddresses.length} (${Math.round((Date.now()-t2)/1000)}s)`, "distributor");
        }
      }
    } else {
      // Slow fallback: individual users() calls in batches of 20
      const FALLBACK_STRUCT = 20;
      for (let i = 0; i < userAddresses.length; i += FALLBACK_STRUCT) {
        const slice = userAddresses.slice(i, i + FALLBACK_STRUCT);
        const infos = await withRetry(() =>
          Promise.all(slice.map((a: string) => mvault.users(a)))
        );
        for (let j = 0; j < slice.length; j++) {
          const u = infos[j];
          userData.push({
            addr:           slice[j],
            isActive:       u.isActive,
            leftSubVolume:  u.leftSubVolume  as bigint,
            rightSubVolume: u.rightSubVolume as bigint,
            matchedVolume:  u.matchedVolume  as bigint,
            powerLegPoints: u.powerLegPoints as bigint,
          });
        }
      }
    }

    log(`User data loaded: ${userData.length} in ${((Date.now()-t2)/1000).toFixed(1)}s`, "distributor");

    // ── Step 3: Compute binary & power-leg shares ─────────────────────────────
    const binary70   = (binaryPool * 70n) / 100n;
    const powerLeg30 = binaryPool - binary70;

    type Eligible = { addr: string; newPairs: bigint; powerLegPts: bigint; newMatchedVol: bigint };
    const eligible: Eligible[] = [];
    let totalNewPairs = 0n;

    for (const u of userData) {
      if (!u.isActive) continue;
      const minSide  = u.leftSubVolume < u.rightSubVolume ? u.leftSubVolume  : u.rightSubVolume;
      const maxSide  = u.leftSubVolume < u.rightSubVolume ? u.rightSubVolume : u.leftSubVolume;
      const newPairs = minSide > u.matchedVolume ? minSide - u.matchedVolume : 0n;
      if (newPairs === 0n) continue;
      const newMatchedVol = minSide;
      const powerLegPts   = maxSide - newMatchedVol;
      eligible.push({ addr: u.addr, newPairs, powerLegPts, newMatchedVol });
      totalNewPairs += newPairs;
    }

    if (eligible.length === 0 || totalNewPairs === 0n) {
      log("No eligible binary pairs this cycle — skipping", "distributor");
      return;
    }

    log(`Eligible users: ${eligible.length} | New pairs total: ${ethers.formatUnits(totalNewPairs, 18)}`, "distributor");

    // Power-leg totals
    let totalPts = 0n;
    const ptsMap = new Map<string, bigint>();
    for (const e of eligible) {
      if (e.powerLegPts > 0n) {
        ptsMap.set(e.addr, e.powerLegPts);
        totalPts += e.powerLegPts;
      }
    }

    type Entry = { addr: string; binaryShare: bigint; powerLegShare: bigint; newMatchedVol: bigint; newPowerLegPts: bigint };
    const entries: Entry[] = [];
    let totalDistributed = 0n;

    for (const e of eligible) {
      const binaryShare = (e.newPairs * binary70) / totalNewPairs;
      if (binaryShare === 0n) continue;
      const myPts = ptsMap.get(e.addr) ?? 0n;
      const powerLegShare = (totalPts > 0n && myPts > 0n)
        ? (myPts * powerLeg30) / totalPts
        : 0n;
      entries.push({ addr: e.addr, binaryShare, powerLegShare, newMatchedVol: e.newMatchedVol, newPowerLegPts: e.powerLegPts });
      totalDistributed += binaryShare + powerLegShare;
    }

    if (entries.length === 0) {
      log("All computed shares are zero — skipping", "distributor");
      return;
    }

    // ── Step 4: Build Merkle tree ─────────────────────────────────────────────
    log(`Building Merkle tree for ${entries.length} entries…`, "distributor");
    const t4 = Date.now();
    const cycleBig = BigInt(nextCycle);
    const leafValues = entries.map(e => [
      cycleBig, e.addr, e.binaryShare, e.powerLegShare, e.newMatchedVol, e.newPowerLegPts,
    ]);

    const tree = StandardMerkleTree.of(leafValues, [
      "uint256", "address", "uint256", "uint256", "uint256", "uint256"
    ]);

    const root      = tree.root as `0x${string}`;
    const totalPool = totalDistributed;
    log(`Tree built in ${((Date.now()-t4)/1000).toFixed(1)}s | Root: ${root} | Pool: ${ethers.formatUnits(totalPool, 18)} MVT`, "distributor");

    // ── Step 5: Commit on-chain ───────────────────────────────────────────────
    log("Calling commitDistribution…", "distributor");
    const tx = await dist.commitDistribution(root, totalPool, { gasLimit: 300_000 });
    log(`Commit tx: ${tx.hash}`, "distributor");
    const receipt = await tx.wait();
    log(`Confirmed in block ${receipt?.blockNumber} — cycle ${nextCycle} active`, "distributor");

    // ── Step 6: Bulk-save proofs to DB ────────────────────────────────────────
    log(`Saving ${entries.length} proofs to DB (bulk ${DB_CHUNK} per batch)…`, "distributor");
    const t6 = Date.now();
    await storage.saveDistributionCycle(nextCycle, root, totalPool.toString(), tx.hash);

    // Collect all proof rows first (avoid interleaving tree iteration with DB await)
    type ProofRow = {
      cycle: number; walletAddress: string;
      binaryShare: string; powerLegShare: string;
      newMatchedVol: string; newPowerLegPts: string;
      proof: string[];
    };
    const proofRows: ProofRow[] = [];
    for (const [i, leaf] of tree.entries()) {
      const [, addr, binaryShare, powerLegShare, newMatchedVol, newPowerLegPts] =
        leaf as [bigint, string, bigint, bigint, bigint, bigint];
      proofRows.push({
        cycle:          nextCycle,
        walletAddress:  (addr as string).toLowerCase(),
        binaryShare:    binaryShare.toString(),
        powerLegShare:  powerLegShare.toString(),
        newMatchedVol:  newMatchedVol.toString(),
        newPowerLegPts: newPowerLegPts.toString(),
        proof:          tree.getProof(i),
      });
    }

    await storage.saveDistributionProofsBulk(proofRows);
    log(`Proofs saved in ${((Date.now()-t6)/1000).toFixed(1)}s`, "distributor");

    const totalSec = ((Date.now() - t0) / 1000).toFixed(1);
    log(`Distribution cycle ${nextCycle} complete ✓  |  ${entries.length} users claimable  |  Total time: ${totalSec}s`, "distributor");

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
  if (!DISTRIBUTOR_ADDRESS) {
    log("VITE_DISTRIBUTOR_ADDRESS not set — auto-distributor disabled", "distributor");
    return;
  }
  if (!MVAULT_VIEW_ADDRESS) {
    log("WARN: VITE_MVAULT_VIEW_ADDRESS not set — distributor will use slow fallback reads", "distributor");
  }

  log(
    `Merkle auto-distributor started — interval: ${INTERVAL_MS / 1000 / 60} min | ${isMainnet ? "mainnet" : "testnet"}`,
    "distributor"
  );

  const STARTUP_DELAY = 5 * 60 * 1000;
  setTimeout(() => {
    runDistribution();
    setInterval(runDistribution, INTERVAL_MS);
  }, STARTUP_DELAY);
}
