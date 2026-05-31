/**
 * Distributor — rank eligibility check only.
 * Placement income and rank income are fully on-chain.
 * This module handles off-chain rank qualification (M1-M5) and calls
 * setUserRanks() via the owner/deployer wallet when users qualify.
 */

import { log } from "./index";
import { storage } from "./storage";

const MCHAIN_RPC = "https://node.mymchain.com/api/rpc";
const SLICE_SIZE  = 50;
const BATCH_SIZE  = 50;

const VIEW_ABI = [
  "function getAllUsersCount() view returns (uint256)",
  "function getUserSlice(uint256 offset, uint256 limit) view returns (address[])",
  "function getRankBatch(address[] calldata addrs) view returns (tuple(bool isActive, uint8 rank, address sponsor, uint256 directCount, uint256 teamSalesUsdt, uint256 leftSubVolume, uint256 rightSubVolume)[])",
];

const MAIN_ABI = [
  "function setUserRanks(address[] calldata addrs, uint8[] calldata ranks_) external",
];

interface RankEntry {
  isActive: boolean;
  rank: number;
  sponsor: string;
  directCount: bigint;
  teamSalesUsdt: bigint;
  leftSubVolume: bigint;
  rightSubVolume: bigint;
}

let rankCheckRunning = false;

export async function runRankCheck(): Promise<void> {
  if (rankCheckRunning) {
    log("runRankCheck already running — skipping", "rank");
    return;
  }
  rankCheckRunning = true;

  try {
    const { ethers } = await import("ethers");

    // Hardcoded MChain contract addresses — NOT read from env vars.
    // PM2 may cache a stale VITE_MVAULT_VIEW_ADDRESS pointing at the old VIEW
    // contract, so we bypass env entirely for these two immutable addresses.
    const MAIN = "0x60c5bd746f6245ecE5daC006082a7bd13f521aF8";
    const VIEW = "0x1324CE45d2c043760bEe056c534c94386B1BEFEE";
    const DEPLOYER_PK = process.env.DEPLOYER_PRIVATE_KEY;

    if (!DEPLOYER_PK) {
      log("runRankCheck: missing DEPLOYER_PRIVATE_KEY", "rank");
      return;
    }

    const provider     = new ethers.JsonRpcProvider(MCHAIN_RPC);
    const viewContract = new ethers.Contract(VIEW, VIEW_ABI, provider);

    // ── 1. Get total users ──────────────────────────────────────────────────
    const totalUsers = Number(await viewContract.getAllUsersCount());
    if (totalUsers === 0) { log("runRankCheck: no users", "rank"); return; }
    log(`runRankCheck: scanning ${totalUsers} users`, "rank");

    // ── 2. Get all addresses ────────────────────────────────────────────────
    const allAddrs: string[] = [];
    for (let offset = 0; offset < totalUsers; offset += SLICE_SIZE) {
      const slice: string[] = await viewContract.getUserSlice(offset, Math.min(SLICE_SIZE, totalUsers - offset));
      for (const a of slice) {
        if (a && a !== ethers.ZeroAddress) allAddrs.push(a.toLowerCase());
      }
    }
    log(`runRankCheck: got ${allAddrs.length} addresses`, "rank");

    // ── 3. Batch-read rank data from MvaultView ─────────────────────────────
    const dataMap = new Map<string, RankEntry>();
    for (let i = 0; i < allAddrs.length; i += BATCH_SIZE) {
      const batch   = allAddrs.slice(i, i + BATCH_SIZE);
      const entries = await viewContract.getRankBatch(batch);
      for (let j = 0; j < batch.length; j++) {
        const e = entries[j];
        dataMap.set(batch[j], {
          isActive:      Boolean(e.isActive),
          rank:          Number(e.rank),
          sponsor:       (e.sponsor as string).toLowerCase(),
          directCount:   BigInt(e.directCount),
          teamSalesUsdt: BigInt(e.teamSalesUsdt),
          leftSubVolume: BigInt(e.leftSubVolume),
          rightSubVolume:BigInt(e.rightSubVolume),
        });
      }
    }

    // ── 4. Build sponsor → children map ────────────────────────────────────
    const childrenMap = new Map<string, string[]>();
    for (const [addr, entry] of dataMap) {
      const sp = entry.sponsor;
      if (sp && sp !== ethers.ZeroAddress.toLowerCase()) {
        if (!childrenMap.has(sp)) childrenMap.set(sp, []);
        childrenMap.get(sp)!.push(addr);
      }
    }

    // ── 5. Compute downline rank counts for every user ──────────────────────
    const rankCountsMap = new Map<string, { m1: number; m2: number; m3: number; m4: number }>();

    for (const addr of allAddrs) {
      let m1 = 0, m2 = 0, m3 = 0, m4 = 0;
      const queue: string[] = [...(childrenMap.get(addr) ?? [])];
      const visited = new Set<string>();
      while (queue.length > 0) {
        const cur = queue.shift()!;
        if (visited.has(cur)) continue;
        visited.add(cur);
        const e = dataMap.get(cur);
        if (e) {
          if (e.rank >= 1) m1++;
          if (e.rank >= 2) m2++;
          if (e.rank >= 3) m3++;
          if (e.rank >= 4) m4++;
        }
        for (const child of (childrenMap.get(cur) ?? [])) queue.push(child);
      }
      rankCountsMap.set(addr, { m1, m2, m3, m4 });
    }

    // ── 6. Eligibility: determine promotions ────────────────────────────────
    // M1: 5+ directs, 2000+ USDT team sales, both sub-volumes > 0
    // M2: 2+ M1 downlines
    // M3: 4+ M2 downlines
    // M4: 4+ M3 downlines
    // M5: 4+ M4 downlines
    const M1_MIN_DIRECTS    = 5n;
    const M1_MIN_TEAM_USDT  = ethers.parseUnits("2000", 18);
    const MIN_DOWNLINES     = [0, 0, 2, 4, 4, 4]; // index = target rank

    const toPromote: { addr: string; newRank: number }[] = [];

    for (const [addr, entry] of dataMap) {
      if (!entry.isActive) continue;
      const cur = entry.rank;
      if (cur >= 5) continue;

      const counts = rankCountsMap.get(addr) ?? { m1: 0, m2: 0, m3: 0, m4: 0 };
      let target = cur;

      if (cur === 0) {
        if (
          entry.directCount   >= M1_MIN_DIRECTS  &&
          entry.teamSalesUsdt >= M1_MIN_TEAM_USDT
        ) target = 1;
      } else if (cur === 1 && counts.m1 >= MIN_DOWNLINES[2]) { target = 2; }
      else if   (cur === 2 && counts.m2 >= MIN_DOWNLINES[3]) { target = 3; }
      else if   (cur === 3 && counts.m3 >= MIN_DOWNLINES[4]) { target = 4; }
      else if   (cur === 4 && counts.m4 >= MIN_DOWNLINES[5]) { target = 5; }

      if (target > cur) toPromote.push({ addr, newRank: target });
    }

    log(`runRankCheck: ${toPromote.length} promotions, updating KV cache`, "rank");

    // ── 7. Persist downline rank counts to KV cache ─────────────────────────
    const now = Date.now();
    const kvWrites: Promise<void>[] = [];
    for (const [addr, counts] of rankCountsMap) {
      kvWrites.push(storage.setKv(`rankCounts:${addr}`, JSON.stringify({ ...counts, updatedAt: now })));
    }
    kvWrites.push(storage.setKv("rankCountsUpdatedAt", String(now)));
    await Promise.all(kvWrites);

    // ── 8. Send setUserRanks tx (MChain raw tx) ─────────────────────────────
    if (toPromote.length > 0) {
      const wallet = new ethers.Wallet(DEPLOYER_PK);
      const iface  = new ethers.Interface(MAIN_ABI);
      const data   = iface.encodeFunctionData("setUserRanks", [
        toPromote.map(x => x.addr),
        toPromote.map(x => x.newRank),
      ]);

      const nonce    = await provider.getTransactionCount(wallet.address);
      const signedTx = await wallet.signTransaction({
        to:       MAIN,
        data,
        gasLimit: 500_000n,
        gasPrice: 1_000_000_000n,
        nonce,
        chainId:  1888n,
        value:    0n,
      });

      try {
        const txHash = await provider.send("eth_sendRawTransaction", [signedTx]);
        log(`runRankCheck: setUserRanks sent — ${txHash} (${toPromote.length} users)`, "rank");
        toPromote.forEach(({ addr, newRank }) =>
          log(`  promoted ${addr} → M${newRank}`, "rank")
        );
      } catch (e: any) {
        log(`runRankCheck: setUserRanks failed — ${e?.message}`, "rank");
      }
    }

    log("runRankCheck: done", "rank");
  } catch (e: any) {
    log(`runRankCheck error: ${e?.message ?? String(e)}`, "rank");
  } finally {
    rankCheckRunning = false;
  }
}

export async function runDistribution(): Promise<void> { return; }
export async function runRankDistribution(): Promise<void> { return; }
export async function startRankEventListener(): Promise<void> { return; }
export function startDistributor(): void {
  log("Placement income is on-chain — distributor passive. Rank check available via /api/rank/claim.", "distributor");
}
