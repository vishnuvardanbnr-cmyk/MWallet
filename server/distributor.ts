/**
 * Merkle-proof Binary & Power-Leg Distributor
 *
 * Flow:
 *   1. Read all users from chain, compute binary + power-leg shares (same math as before)
 *   2. Build a StandardMerkleTree where each leaf encodes:
 *      (cycle, userAddress, binaryShare, powerLegShare, newMatchedVol, newPowerLegPts)
 *   3. Call MvaultDistributor.commitDistribution(root, totalPool) — one tx, locks pool
 *   4. Save all per-user proofs to the DB (users fetch via GET /api/distribution/proof/:address)
 *   5. Users self-claim on-chain with their proof — admin cannot alter payouts after commit
 *
 * Requires env:
 *   DEPLOYER_PRIVATE_KEY              — wallet that is owner of MvaultDistributor
 *   VITE_MVAULT_CONTRACT_ADDRESS      — MvaultContract address
 *   VITE_DISTRIBUTOR_ADDRESS          — MvaultDistributor address
 *   VITE_BSC_NETWORK                  — "mainnet" | "testnet" (default: testnet)
 */

import { ethers } from "ethers";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { log } from "./index";
import { storage } from "./storage";

const MVAULT_CONTRACT_ADDRESS =
  process.env.VITE_MVAULT_CONTRACT_ADDRESS ||
  "0x164E4c01958c623CeF48C7DF8C66deFbB5eB4f57";

const DISTRIBUTOR_ADDRESS =
  process.env.VITE_DISTRIBUTOR_ADDRESS || "";

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

const MVAULT_ABI = [
  "function binaryPool() view returns (uint256)",
  "function totalUsers() view returns (uint256)",
  "function allUsers(uint256) view returns (address)",
  "function users(address) view returns (bool isRegistered, bool isActive, address sponsor, uint256 directCount, address binaryParent, bool placedLeft, address leftChild, address rightChild, uint256 leftSubVolume, uint256 rightSubVolume, uint256 matchedVolume, uint256 mvtBalance, uint256 totalReceived, uint256 totalSold, uint256 incomeLimit, uint256 usdtBalance, uint256 rebirthPool, uint256 totalUsdtEarned, uint256 btcPoolBalance, uint256 totalBtcEarned, uint256 powerLegPoints, uint256 packagePrice, uint256 incomeLimitCap, address mainAccount, uint256 rebirthCount, uint8 rank, uint256 teamSalesUsdt, uint256 joinedAt, string displayName, string email, string phone, string country, bool profileSet)",
];

const DISTRIBUTOR_ABI = [
  "function currentCycle() view returns (uint256)",
  "function commitDistribution(bytes32 root, uint256 totalPool) external",
];

const INTERVAL_MS = parseInt(process.env.DISTRIBUTION_INTERVAL_MS || "") || 24 * 60 * 60 * 1000;
const MIN_POOL_WEI = ethers.parseUnits("1", 18);
let isRunning = false;

function getProvider(): ethers.JsonRpcProvider {
  for (const rpc of RPC_LIST) {
    try { return new ethers.JsonRpcProvider(rpc); } catch { continue; }
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

  if (!DISTRIBUTOR_ADDRESS) {
    log("VITE_DISTRIBUTOR_ADDRESS not set — skipping distribution", "distributor");
    return;
  }

  isRunning = true;
  log("Starting Merkle binary & power-leg distribution cycle…", "distributor");

  try {
    const provider = getProvider();
    const signer   = new ethers.Wallet(privateKey, provider);
    const mvault   = new ethers.Contract(MVAULT_CONTRACT_ADDRESS, MVAULT_ABI, signer);
    const dist     = new ethers.Contract(DISTRIBUTOR_ADDRESS, DISTRIBUTOR_ABI, signer);

    // ── Read pool state ────────────────────────────────────────────────────────
    const [binaryPool, totalUsersN, onChainCycle] = await Promise.all([
      mvault.binaryPool()    as Promise<bigint>,
      mvault.totalUsers()    as Promise<bigint>,
      dist.currentCycle()    as Promise<bigint>,
    ]);
    const totalUsers = Number(totalUsersN);
    const nextCycle  = Number(onChainCycle) + 1;

    log(`Pool: ${ethers.formatUnits(binaryPool, 18)} MVT  |  Users: ${totalUsers}  |  Next cycle: ${nextCycle}`, "distributor");

    if (totalUsers === 0 || binaryPool < MIN_POOL_WEI) {
      log("Pool too small or no users — skipping", "distributor");
      return;
    }

    // ── Read all user addresses ────────────────────────────────────────────────
    log(`Reading ${totalUsers} user addresses…`, "distributor");
    const ADDR_BATCH = 50;
    const userAddresses: string[] = [];
    for (let i = 0; i < totalUsers; i += ADDR_BATCH) {
      const batch = await Promise.all(
        Array.from({ length: Math.min(ADDR_BATCH, totalUsers - i) }, (_, k) =>
          mvault.allUsers(i + k) as Promise<string>
        )
      );
      userAddresses.push(...batch);
    }

    // ── Read all user structs ──────────────────────────────────────────────────
    log(`Reading ${userAddresses.length} user structs…`, "distributor");
    const STRUCT_BATCH = 20;
    type UserData = {
      addr: string; isActive: boolean;
      leftSubVolume: bigint; rightSubVolume: bigint;
      matchedVolume: bigint; powerLegPoints: bigint;
    };
    const userData: UserData[] = [];
    for (let i = 0; i < userAddresses.length; i += STRUCT_BATCH) {
      const slice = userAddresses.slice(i, i + STRUCT_BATCH);
      const infos = await Promise.all(slice.map((a: string) => mvault.users(a)));
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

    // ── Compute binary shares (70% of pool) ───────────────────────────────────
    const binary70 = (binaryPool * 70n) / 100n;
    const powerLeg30 = binaryPool - binary70;

    type Entry = {
      addr:          string;
      binaryShare:   bigint;
      powerLegShare: bigint;
      newMatchedVol: bigint;
      newPowerLegPts: bigint;
    };

    // First pass: compute binary shares
    type Eligible = { addr: string; newPairs: bigint; powerLegPts: bigint; newMatchedVol: bigint };
    const eligible: Eligible[] = [];
    let totalNewPairs = 0n;

    for (const u of userData) {
      if (!u.isActive) continue;
      const minSide     = u.leftSubVolume  < u.rightSubVolume ? u.leftSubVolume  : u.rightSubVolume;
      const maxSide     = u.leftSubVolume  > u.rightSubVolume ? u.leftSubVolume  : u.rightSubVolume;
      const newPairs    = minSide > u.matchedVolume ? minSide - u.matchedVolume : 0n;
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

    log(`Computing shares for ${eligible.length} users (${ethers.formatUnits(totalNewPairs, 18)} total new pairs)`, "distributor");

    // Second pass: compute power-leg shares
    let totalPts = 0n;
    const pts: Map<string, bigint> = new Map();
    for (const e of eligible) {
      if (e.powerLegPts > 0n) {
        pts.set(e.addr, e.powerLegPts);
        totalPts += e.powerLegPts;
      }
    }

    // Build final entries with both shares
    const entries: Entry[] = [];
    let totalDistributed = 0n;

    for (const e of eligible) {
      const binaryShare = (e.newPairs * binary70) / totalNewPairs;
      if (binaryShare === 0n) continue;

      const myPts = pts.get(e.addr) ?? 0n;
      const powerLegShare = (totalPts > 0n && myPts > 0n)
        ? (myPts * powerLeg30) / totalPts
        : 0n;

      entries.push({
        addr:           e.addr,
        binaryShare,
        powerLegShare,
        newMatchedVol:  e.newMatchedVol,
        newPowerLegPts: e.powerLegPts,
      });
      totalDistributed += binaryShare + powerLegShare;
    }

    if (entries.length === 0) {
      log("All computed shares are zero — skipping", "distributor");
      return;
    }

    // ── Build Merkle tree ──────────────────────────────────────────────────────
    const cycleBig = BigInt(nextCycle);
    const leafValues = entries.map(e => [
      cycleBig,
      e.addr,
      e.binaryShare,
      e.powerLegShare,
      e.newMatchedVol,
      e.newPowerLegPts,
    ]);

    const tree = StandardMerkleTree.of(leafValues, [
      "uint256", "address", "uint256", "uint256", "uint256", "uint256"
    ]);

    const root      = tree.root as `0x${string}`;
    const totalPool = totalDistributed;

    log(`Merkle root: ${root}  |  Total pool: ${ethers.formatUnits(totalPool, 18)} MVT  |  Entries: ${entries.length}`, "distributor");

    // ── Commit distribution on-chain ───────────────────────────────────────────
    log("Calling commitDistribution…", "distributor");
    const tx = await dist.commitDistribution(root, totalPool, { gasLimit: 300_000 });
    log(`Commit tx sent: ${tx.hash}`, "distributor");
    const receipt = await tx.wait();
    log(`Commit confirmed in block ${receipt?.blockNumber} — cycle ${nextCycle} active`, "distributor");

    // ── Save cycle + proofs to DB ──────────────────────────────────────────────
    await storage.saveDistributionCycle(nextCycle, root, totalPool.toString(), tx.hash);

    log(`Saving ${entries.length} proofs to DB…`, "distributor");
    for (const [i, leaf] of tree.entries()) {
      const proof = tree.getProof(i);
      const [, addr, binaryShare, powerLegShare, newMatchedVol, newPowerLegPts] = leaf as [bigint, string, bigint, bigint, bigint, bigint];
      await storage.saveDistributionProof(
        nextCycle,
        addr as string,
        binaryShare.toString(),
        powerLegShare.toString(),
        newMatchedVol.toString(),
        newPowerLegPts.toString(),
        proof
      );
    }

    // Return any undistributed pool dust (rounding) — handled by commitDistribution
    const adminLeftover = binaryPool - totalPool;
    if (adminLeftover > 0n) {
      log(`Pool dust: ${ethers.formatUnits(adminLeftover, 18)} MVT — returned to adminPool by commitDistribution`, "distributor");
    }

    log(`Distribution cycle ${nextCycle} complete ✓  —  ${entries.length} users can now claim`, "distributor");

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

  log(
    `Merkle auto-distributor started — interval: ${INTERVAL_MS / 1000 / 60} min (${isMainnet ? "mainnet" : "testnet"})`,
    "distributor"
  );

  const STARTUP_DELAY = 5 * 60 * 1000;
  setTimeout(() => {
    runDistribution();
    setInterval(runDistribution, INTERVAL_MS);
  }, STARTUP_DELAY);
}
