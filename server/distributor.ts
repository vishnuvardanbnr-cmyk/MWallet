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

// ─────────────────────────────────────────────────────────────────────────────
// RANK DISTRIBUTION
// ─────────────────────────────────────────────────────────────────────────────

// Rank income % per slot (index = slot 1-5; 0 is unused)
const RANK_PCT = [0n, 10n, 20n, 20n, 20n, 30n];

// M1 on-chain qualification thresholds
const M1_MIN_DIRECTS   = 5n;
const M1_MIN_TEAM_USDT = ethers.parseUnits("2000", 18);
// Higher-rank subtree counts
const M2_MIN_M1 = 2;
const M3_MIN_M2 = 4;
const M4_MIN_M3 = 4;
const M5_MIN_M4 = 4;

const RANK_STRUCT_BATCH = 200;   // getRankBatch per call
const SET_RANKS_BATCH   = 100;   // setUserRanks per tx
const BLOCK_CHUNK       = 2_000; // getLogs block window (public RPC limit)

const MVAULT_RANK_ABI = [
  "function rankPool() view returns (uint256)",
  "function totalUsers() view returns (uint256)",
  "function setUserRanks(address[], uint8[]) external",
  "function applyRankIncome(address[], uint256[], uint256) external",
  "event Activated(address indexed user, uint256 mvtMinted, uint256 grossMvt, uint256 levelAmt, uint256 binaryAmt, uint256 adminAmt)",
];

const MVAULT_VIEW_RANK_ABI = [
  "function getUserSlice(uint256 offset, uint256 limit) view returns (address[])",
  "function getRankBatch(address[] addrs) view returns (tuple(bool isActive, uint8 rank, address sponsor, uint256 directCount, uint256 teamSalesUsdt, uint256 leftSubVolume, uint256 rightSubVolume)[])",
];

type RankEntry = {
  isActive:      boolean;
  rank:          number;   // on-chain rank (may be stale until setUserRanks)
  sponsor:       string;   // lowercase
  directCount:   bigint;
  teamSalesUsdt: bigint;
  leftSubVolume: bigint;
  rightSubVolume:bigint;
};

let isRankRunning = false;

export async function runRankDistribution(): Promise<void> {
  if (isRankRunning) {
    log("Rank distribution already in progress — skipping", "rank-dist");
    return;
  }

  const managerKey = process.env.DEPLOYER_PRIVATE_KEY;
  const adminKey   = process.env.ADMIN_PRIVATE_KEY;

  if (!managerKey) {
    log("DEPLOYER_PRIVATE_KEY not set — skipping rank distribution", "rank-dist");
    return;
  }
  if (!adminKey) {
    log("ADMIN_PRIVATE_KEY not set — skipping rank distribution (needed for applyRankIncome)", "rank-dist");
    return;
  }
  if (!MVAULT_VIEW_ADDRESS) {
    log("VITE_MVAULT_VIEW_ADDRESS not set — skipping rank distribution", "rank-dist");
    return;
  }

  isRankRunning = true;
  const t0 = Date.now();
  log("Starting rank distribution cycle…", "rank-dist");

  try {
    const provider      = getProvider();
    const managerSigner = new ethers.Wallet(managerKey, provider);
    const adminSigner   = new ethers.Wallet(adminKey,   provider);

    const mvault        = new ethers.Contract(MVAULT_CONTRACT_ADDRESS, MVAULT_RANK_ABI, provider);
    const mvaultMgr     = new ethers.Contract(MVAULT_CONTRACT_ADDRESS, MVAULT_RANK_ABI, managerSigner);
    const mvaultAdmin   = new ethers.Contract(MVAULT_CONTRACT_ADDRESS, MVAULT_RANK_ABI, adminSigner);
    const mvView        = new ethers.Contract(MVAULT_VIEW_ADDRESS, MVAULT_VIEW_RANK_ABI, provider);

    // ── 1. Check rankPool ────────────────────────────────────────────────────
    const [rankPool, totalUsersN] = await Promise.all([
      withRetry(() => mvault.rankPool()    as Promise<bigint>),
      withRetry(() => mvault.totalUsers()  as Promise<bigint>),
    ]);
    const totalUsers = Number(totalUsersN);
    log(`RankPool: ${ethers.formatUnits(rankPool, 18)} MVT | Users: ${totalUsers}`, "rank-dist");

    // ── 2. Load all addresses ────────────────────────────────────────────────
    const userAddresses: string[] = [];
    for (let i = 0; i < totalUsers; i += ADDR_BATCH) {
      const slice = await withRetry(() =>
        mvView.getUserSlice(i, ADDR_BATCH) as Promise<string[]>
      );
      userAddresses.push(...slice);
    }

    // ── 3. Load rank data ────────────────────────────────────────────────────
    log(`Loading rank data (batch ${RANK_STRUCT_BATCH})…`, "rank-dist");
    const rankMap = new Map<string, RankEntry>();

    for (let i = 0; i < userAddresses.length; i += RANK_STRUCT_BATCH) {
      const batch   = userAddresses.slice(i, i + RANK_STRUCT_BATCH);
      const results = await withRetry(() =>
        mvView.getRankBatch(batch) as Promise<any[]>
      );
      for (let j = 0; j < batch.length; j++) {
        const r   = results[j];
        const sp  = (r.sponsor as string).toLowerCase();
        if (sp === ethers.ZeroAddress.toLowerCase() && !r.isActive) continue; // unregistered
        rankMap.set(batch[j].toLowerCase(), {
          isActive:      r.isActive,
          rank:          Number(r.rank),
          sponsor:       sp,
          directCount:   r.directCount   as bigint,
          teamSalesUsdt: r.teamSalesUsdt as bigint,
          leftSubVolume: r.leftSubVolume  as bigint,
          rightSubVolume:r.rightSubVolume as bigint,
        });
      }
    }
    log(`Rank data loaded: ${rankMap.size} users`, "rank-dist");

    // ── 4. Build sponsor→children map ────────────────────────────────────────
    const children = new Map<string, string[]>();
    for (const [addr, u] of rankMap) {
      const sp = u.sponsor;
      if (sp && sp !== ethers.ZeroAddress.toLowerCase()) {
        if (!children.has(sp)) children.set(sp, []);
        children.get(sp)!.push(addr);
      }
    }

    // ── 5. Evaluate ranks in 5 passes ────────────────────────────────────────
    const computedRank = new Map<string, number>(); // addr → evaluated rank

    // Pass 1: M1 (on-chain criteria only)
    for (const [addr, u] of rankMap) {
      if (!u.isActive) { computedRank.set(addr, 0); continue; }
      const isM1 =
        u.directCount   >= M1_MIN_DIRECTS   &&
        u.teamSalesUsdt >= M1_MIN_TEAM_USDT &&
        u.leftSubVolume  > 0n               &&
        u.rightSubVolume > 0n;
      computedRank.set(addr, isM1 ? 1 : 0);
    }

    // Helper: count downline members with computedRank >= minRank
    function countSubtree(root: string, minRank: number, seen = new Set<string>()): number {
      if (seen.has(root)) return 0;
      seen.add(root);
      let count = 0;
      for (const child of (children.get(root) ?? [])) {
        if ((computedRank.get(child) ?? 0) >= minRank) count++;
        count += countSubtree(child, minRank, seen);
      }
      return count;
    }

    // Passes 2-5: M2→M5
    const higherPassConfig = [
      { target: 2, minSubRank: 1, minCount: M2_MIN_M1 },
      { target: 3, minSubRank: 2, minCount: M3_MIN_M2 },
      { target: 4, minSubRank: 3, minCount: M4_MIN_M3 },
      { target: 5, minSubRank: 4, minCount: M5_MIN_M4 },
    ];
    for (const { target, minSubRank, minCount } of higherPassConfig) {
      for (const [addr, u] of rankMap) {
        if (!u.isActive || (computedRank.get(addr) ?? 0) < target - 1) continue;
        const cnt = countSubtree(addr, minSubRank);
        if (cnt >= minCount) computedRank.set(addr, target);
      }
    }

    // ── 6. Apply rank changes on-chain ───────────────────────────────────────
    const toUpdate: Array<{ addr: string; newRank: number }> = [];
    for (const [addr, u] of rankMap) {
      const computed = computedRank.get(addr) ?? 0;
      if (computed !== u.rank) toUpdate.push({ addr, newRank: computed });
    }

    if (toUpdate.length > 0) {
      log(`Updating ${toUpdate.length} user ranks on-chain…`, "rank-dist");
      for (let i = 0; i < toUpdate.length; i += SET_RANKS_BATCH) {
        const chunk = toUpdate.slice(i, i + SET_RANKS_BATCH);
        const tx = await withRetry(() =>
          mvaultMgr.setUserRanks(
            chunk.map(c => c.addr),
            chunk.map(c => c.newRank),
            { gasLimit: 500_000 }
          ) as Promise<any>
        );
        await tx.wait();
        log(`  Batch ${Math.floor(i / SET_RANKS_BATCH) + 1}: ${chunk.length} ranks updated`, "rank-dist");
        // Update local map so income step uses fresh ranks
        for (const c of chunk) {
          const u = rankMap.get(c.addr);
          if (u) u.rank = c.newRank;
        }
      }
    } else {
      log("No rank changes this cycle", "rank-dist");
    }

    // ── 7. Skip income if pool is empty ──────────────────────────────────────
    if (rankPool === 0n) {
      log("RankPool is zero — rank updates done, no income to distribute", "rank-dist");
      return;
    }

    // ── 8. Read Activated events since last distribution ─────────────────────
    const lastBlockStr = await storage.getKv("lastRankDistributionBlock");
    const lastBlock    = lastBlockStr ? Number(lastBlockStr) : 0;
    const currentBlock = await provider.getBlockNumber();

    log(`Reading Activated events block ${lastBlock + 1} → ${currentBlock}…`, "rank-dist");

    const activatedSig = "Activated(address,uint256,uint256,uint256,uint256,uint256)";
    const topic0       = ethers.id(activatedSig);
    const activations: Array<{ user: string; grossMvt: bigint }> = [];

    const iface = new ethers.Interface(MVAULT_RANK_ABI);
    for (let from = lastBlock + 1; from <= currentBlock; from += BLOCK_CHUNK) {
      const to   = Math.min(from + BLOCK_CHUNK - 1, currentBlock);
      const logs = await withRetry(() =>
        provider.getLogs({ address: MVAULT_CONTRACT_ADDRESS, topics: [topic0], fromBlock: from, toBlock: to })
      );
      for (const l of logs) {
        const parsed = iface.parseLog(l);
        if (!parsed) continue;
        activations.push({ user: (parsed.args[0] as string).toLowerCase(), grossMvt: parsed.args[2] as bigint });
      }
    }
    log(`Found ${activations.length} activations since block ${lastBlock}`, "rank-dist");

    if (activations.length === 0) {
      log("No new activations — skipping rank income step", "rank-dist");
      await storage.setKv("lastRankDistributionBlock", String(currentBlock));
      return;
    }

    // ── 9. Compute per-address shares ────────────────────────────────────────
    // For each activation, walk up sponsor chain filling 5 rank slots.
    // Slot N is filled by the FIRST upline with rank >= N.
    // A person with rank R fills all unfilled slots 1…R simultaneously.
    const sharesMap    = new Map<string, bigint>();
    let   totalComputed = 0n;
    let   adminLeftover = 0n;

    for (const { user, grossMvt } of activations) {
      const rankAmt  = (grossMvt * 10n) / 100n;
      const filled   = [false, false, false, false, false, false]; // index 1-5
      let   remaining = rankAmt;
      let   cur       = rankMap.get(user)?.sponsor ?? null;

      while (cur && cur !== ethers.ZeroAddress.toLowerCase() && remaining > 0n) {
        const u = rankMap.get(cur);
        if (u && u.rank > 0) {
          for (let slot = 1; slot <= u.rank && slot <= 5; slot++) {
            if (!filled[slot]) {
              const share = (rankAmt * RANK_PCT[slot]) / 100n;
              sharesMap.set(cur, (sharesMap.get(cur) ?? 0n) + share);
              totalComputed += share;
              remaining     -= share;
              filled[slot]   = true;
            }
          }
        }
        cur = u?.sponsor ?? null;
        if (filled[1] && filled[2] && filled[3] && filled[4] && filled[5]) break;
      }

      // Unfilled slots → admin
      adminLeftover += remaining;
    }

    if (sharesMap.size === 0 || totalComputed === 0n) {
      log("No rank income recipients computed — leftover goes to admin", "rank-dist");
      // Still call applyRankIncome to drain the pool and credit admin
      const tx = await withRetry(() =>
        mvaultAdmin.applyRankIncome([], [], rankPool, { gasLimit: 200_000 }) as Promise<any>
      );
      await tx.wait();
      await storage.setKv("lastRankDistributionBlock", String(currentBlock));
      return;
    }

    // ── 10. Scale raw shares to fit actual rankPool ───────────────────────────
    // totalComputed + adminLeftover should ≈ total rankAmt from events.
    // rankPool may differ slightly (e.g. activations before genesis block).
    // Scale so sum(shares) + adminLeftover_actual = rankPool.
    const rawTotal       = totalComputed + adminLeftover;
    const recipients: string[]  = [];
    const scaledShares: bigint[] = [];
    let   sumScaled = 0n;

    for (const [addr, raw] of sharesMap) {
      // Scale: scaled = raw * rankPool / rawTotal
      const scaled = rawTotal > 0n ? (raw * rankPool) / rawTotal : 0n;
      if (scaled === 0n) continue;
      recipients.push(addr);
      scaledShares.push(scaled);
      sumScaled += scaled;
    }

    const leftoverActual = rankPool > sumScaled ? rankPool - sumScaled : 0n;
    log(
      `Distributing ${ethers.formatUnits(sumScaled, 18)} MVT to ${recipients.length} recipients` +
      ` | admin leftover ${ethers.formatUnits(leftoverActual, 18)} MVT`,
      "rank-dist"
    );

    // ── 11. Call applyRankIncome (onlyOwner) ─────────────────────────────────
    const tx = await withRetry(() =>
      mvaultAdmin.applyRankIncome(recipients, scaledShares, leftoverActual, { gasLimit: 1_000_000 }) as Promise<any>
    );
    log(`applyRankIncome tx: ${tx.hash}`, "rank-dist");
    const receipt = await tx.wait();
    log(`Confirmed block ${receipt?.blockNumber}`, "rank-dist");

    await storage.setKv("lastRankDistributionBlock", String(currentBlock));

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    log(`Rank distribution complete ✓ | ${recipients.length} recipients | ${elapsed}s`, "rank-dist");

  } catch (err: any) {
    const msg = err?.shortMessage || err?.reason || err?.message || String(err);
    log(`Rank distribution error: ${msg}`, "rank-dist");
  } finally {
    isRankRunning = false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// INSTANT RANK CHECK  (rank evaluation + setUserRanks only, no income step)
// Called immediately whenever a new Activated event is detected.
// ─────────────────────────────────────────────────────────────────────────────

let isRankCheckRunning = false;

export async function runRankCheck(): Promise<void> {
  if (isRankCheckRunning) {
    log("Rank check already in progress — skipping", "rank-check");
    return;
  }
  const managerKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!managerKey) {
    log("DEPLOYER_PRIVATE_KEY not set — skipping rank check", "rank-check");
    return;
  }
  if (!MVAULT_VIEW_ADDRESS) {
    log("VITE_MVAULT_VIEW_ADDRESS not set — skipping rank check", "rank-check");
    return;
  }

  isRankCheckRunning = true;
  const t0 = Date.now();
  log("Instant rank check starting…", "rank-check");

  try {
    const provider      = getProvider();
    const managerSigner = new ethers.Wallet(managerKey, provider);
    const mvault        = new ethers.Contract(MVAULT_CONTRACT_ADDRESS, MVAULT_RANK_ABI, provider);
    const mvaultMgr     = new ethers.Contract(MVAULT_CONTRACT_ADDRESS, MVAULT_RANK_ABI, managerSigner);
    const mvView        = new ethers.Contract(MVAULT_VIEW_ADDRESS, MVAULT_VIEW_RANK_ABI, provider);

    // 1. Total users
    const totalUsersN = await withRetry(() => mvault.totalUsers() as Promise<bigint>);
    const totalUsers  = Number(totalUsersN);
    log(`Checking ranks for ${totalUsers} users…`, "rank-check");

    // 2. Load all addresses
    const userAddresses: string[] = [];
    for (let i = 0; i < totalUsers; i += ADDR_BATCH) {
      const slice = await withRetry(() => mvView.getUserSlice(i, ADDR_BATCH) as Promise<string[]>);
      userAddresses.push(...slice);
    }

    // 3. Load rank data for all users
    const rankMap = new Map<string, RankEntry>();
    for (let i = 0; i < userAddresses.length; i += RANK_STRUCT_BATCH) {
      const batch   = userAddresses.slice(i, i + RANK_STRUCT_BATCH);
      const results = await withRetry(() => mvView.getRankBatch(batch) as Promise<any[]>);
      for (let j = 0; j < batch.length; j++) {
        const r  = results[j];
        const sp = (r.sponsor as string).toLowerCase();
        if (sp === ethers.ZeroAddress.toLowerCase() && !r.isActive) continue;
        rankMap.set(batch[j].toLowerCase(), {
          isActive:       r.isActive,
          rank:           Number(r.rank),
          sponsor:        sp,
          directCount:    r.directCount    as bigint,
          teamSalesUsdt:  r.teamSalesUsdt  as bigint,
          leftSubVolume:  r.leftSubVolume  as bigint,
          rightSubVolume: r.rightSubVolume as bigint,
        });
      }
    }

    // 4. Build sponsor → children map
    const children = new Map<string, string[]>();
    for (const [addr, u] of rankMap) {
      const sp = u.sponsor;
      if (sp && sp !== ethers.ZeroAddress.toLowerCase()) {
        if (!children.has(sp)) children.set(sp, []);
        children.get(sp)!.push(addr);
      }
    }

    // 5. Evaluate ranks — 5 passes (identical logic to runRankDistribution)
    const computedRank = new Map<string, number>();

    // Pass 1: M1
    for (const [addr, u] of rankMap) {
      if (!u.isActive) { computedRank.set(addr, 0); continue; }
      const isM1 =
        u.directCount   >= M1_MIN_DIRECTS   &&
        u.teamSalesUsdt >= M1_MIN_TEAM_USDT &&
        u.leftSubVolume  > 0n               &&
        u.rightSubVolume > 0n;
      computedRank.set(addr, isM1 ? 1 : 0);
    }

    function countSubtreeCheck(root: string, minRank: number, seen = new Set<string>()): number {
      if (seen.has(root)) return 0;
      seen.add(root);
      let count = 0;
      for (const child of (children.get(root) ?? [])) {
        if ((computedRank.get(child) ?? 0) >= minRank) count++;
        count += countSubtreeCheck(child, minRank, seen);
      }
      return count;
    }

    // Passes 2-5: M2→M5
    const higherPassConfig = [
      { target: 2, minSubRank: 1, minCount: M2_MIN_M1 },
      { target: 3, minSubRank: 2, minCount: M3_MIN_M2 },
      { target: 4, minSubRank: 3, minCount: M4_MIN_M3 },
      { target: 5, minSubRank: 4, minCount: M5_MIN_M4 },
    ];
    for (const { target, minSubRank, minCount } of higherPassConfig) {
      for (const [addr, u] of rankMap) {
        if (!u.isActive || (computedRank.get(addr) ?? 0) < target - 1) continue;
        const cnt = countSubtreeCheck(addr, minSubRank);
        if (cnt >= minCount) computedRank.set(addr, target);
      }
    }

    // 6. Apply rank changes on-chain
    const toUpdate: Array<{ addr: string; newRank: number }> = [];
    for (const [addr, u] of rankMap) {
      const computed = computedRank.get(addr) ?? 0;
      if (computed !== u.rank) toUpdate.push({ addr, newRank: computed });
    }

    if (toUpdate.length > 0) {
      log(`Instant rank update: ${toUpdate.length} users changed`, "rank-check");
      for (let i = 0; i < toUpdate.length; i += SET_RANKS_BATCH) {
        const chunk = toUpdate.slice(i, i + SET_RANKS_BATCH);
        const tx = await withRetry(() =>
          mvaultMgr.setUserRanks(
            chunk.map(c => c.addr),
            chunk.map(c => c.newRank),
            { gasLimit: 500_000 }
          ) as Promise<any>
        );
        await tx.wait();
        log(`  Batch ${Math.floor(i / SET_RANKS_BATCH) + 1}: ${chunk.length} ranks set on-chain`, "rank-check");
      }
    } else {
      log("No rank changes detected", "rank-check");
    }

    log(`Instant rank check done ✓ | ${((Date.now() - t0) / 1000).toFixed(1)}s`, "rank-check");
  } catch (err: any) {
    const msg = err?.shortMessage || err?.reason || err?.message || String(err);
    log(`Rank check error: ${msg}`, "rank-check");
  } finally {
    isRankCheckRunning = false;
  }
}

// ── Event listener: polls every 30 s for new Activated events ────────────────
// Debounces 10 s so rapid activations trigger only one rank check run.

let _rankCheckTimer: ReturnType<typeof setTimeout> | null = null;
let _lastListenerBlock = 0;

function scheduleRankCheck() {
  if (_rankCheckTimer) return; // already scheduled
  _rankCheckTimer = setTimeout(async () => {
    _rankCheckTimer = null;
    await runRankCheck();
  }, 10_000); // 10-second debounce
}

export async function startRankEventListener(): Promise<void> {
  const managerKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!managerKey || !MVAULT_VIEW_ADDRESS) {
    log("Rank event listener disabled (missing keys/view address)", "rank-check");
    return;
  }

  log("Rank event listener started — polling every 30 s", "rank-check");

  const POLL_INTERVAL = 30_000; // 30 seconds
  const topic0 = ethers.id("Activated(address,uint256,uint256,uint256,uint256,uint256)");

  async function poll() {
    try {
      const provider    = getProvider();
      const currentBlock = await provider.getBlockNumber();

      if (_lastListenerBlock === 0) {
        // First run: set baseline to current block (don't re-scan history)
        _lastListenerBlock = currentBlock;
        return;
      }

      if (currentBlock <= _lastListenerBlock) return;

      const fromBlock = _lastListenerBlock + 1;
      const toBlock   = Math.min(fromBlock + BLOCK_CHUNK - 1, currentBlock);

      const logs = await provider.getLogs({
        address:   MVAULT_CONTRACT_ADDRESS,
        topics:    [topic0],
        fromBlock,
        toBlock,
      });

      _lastListenerBlock = toBlock;

      if (logs.length > 0) {
        log(`Event listener: ${logs.length} activation(s) detected — scheduling rank check`, "rank-check");
        scheduleRankCheck();
      }
    } catch (err: any) {
      const msg = err?.shortMessage || err?.message || String(err);
      log(`Rank event listener poll error: ${msg}`, "rank-check");
    }
  }

  // Run once immediately to set baseline block, then poll on interval
  await poll();
  setInterval(poll, POLL_INTERVAL);
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

  // Rank distribution runs on the same interval, offset by 2 minutes
  const RANK_STARTUP_DELAY = STARTUP_DELAY + 2 * 60 * 1000;
  setTimeout(() => {
    runRankDistribution();
    setInterval(runRankDistribution, INTERVAL_MS);
  }, RANK_STARTUP_DELAY);

  log("Rank auto-distributor scheduled (offset 2 min after binary)", "rank-dist");

  // Instant rank listener is available via startRankEventListener() if needed,
  // but primary rank claim flow is user-triggered via POST /api/rank/claim.
}
