import { useState } from "react";
import { Users, GitBranch, Coins, TrendingUp, Layers, Info, ArrowDownLeft, ArrowDownRight, ShieldCheck, Loader2, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatTokenAmount, getMvaultDistributorContract, DISTRIBUTOR_ADDRESS } from "@/lib/contract";
import type { UserInfo, MvtPrice, BinaryPairs } from "@/hooks/use-web3";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ethers } from "ethers";

interface IncomeProps {
  userInfo: UserInfo;
  mvtPrice: MvtPrice;
  binaryPairs: BinaryPairs;
  formatAmount: (val: bigint) => string;
  walletAddress?: string;
}

const LEVEL_RATES: { level: number; pct: string; value: string; dirReq: number }[] = [
  { level: 1,  pct: "20%",  value: "$26.00", dirReq: 0 },
  { level: 2,  pct: "5%",   value: "$6.50",  dirReq: 2 },
  { level: 3,  pct: "2%",   value: "$2.60",  dirReq: 2 },
  { level: 4,  pct: "1%",   value: "$1.30",  dirReq: 2 },
  { level: 5,  pct: "0.5%", value: "$0.65",  dirReq: 5 },
  { level: 6,  pct: "0.5%", value: "$0.65",  dirReq: 5 },
  { level: 7,  pct: "0.3%", value: "$0.39",  dirReq: 5 },
  { level: 8,  pct: "0.3%", value: "$0.39",  dirReq: 5 },
  { level: 9,  pct: "0.2%", value: "$0.26",  dirReq: 5 },
  { level: 10, pct: "0.2%", value: "$0.26",  dirReq: 5 },
];

function mvtFmt(val: bigint) {
  return parseFloat(formatTokenAmount(val, 18)).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function usdFmt(mvt: bigint, price: bigint) {
  if (price === 0n) return "—";
  const mvtNum  = parseFloat(formatTokenAmount(mvt, 18));
  const priceNum = parseFloat(formatTokenAmount(price, 18));
  return `$${(mvtNum * priceNum).toFixed(2)}`;
}

interface CycleEntry {
  cycle: number;
  binaryShare: string;
  powerLegShare: string;
  newMatchedVol: string;
  newPowerLegPts: string;
  proof: string[];
  totalMvt: string;
}

interface ProofsResp {
  cycles: CycleEntry[];
  totalMvt: string;
}

export default function IncomePage({ userInfo, mvtPrice, binaryPairs, formatAmount, walletAddress }: IncomeProps) {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  // Claim state
  const [claiming, setClaiming]       = useState(false);
  const [claimedCycles, setClaimedCycles] = useState<Set<number>>(new Set());
  const [claimErr, setClaimErr]       = useState<string | null>(null);
  const [showCycles, setShowCycles]   = useState(false);

  const directCount  = Number(userInfo.directCount);
  const leftCount    = Number(userInfo.leftSubUsers);
  const rightCount   = Number(userInfo.rightSubUsers);
  const newPairs     = Number(binaryPairs.newPairs);
  const matchedPairs = Number(userInfo.matchedPairs);

  const incomeLimitCapNum = parseFloat(formatTokenAmount(userInfo.incomeLimitCap, 18));
  const incomeCap     = incomeLimitCapNum > 0 ? incomeLimitCapNum : 390;
  const incomeUsed    = incomeCap - parseFloat(formatTokenAmount(userInfo.incomeLimit, 18));
  const incomeProgress = Math.min(100, (incomeUsed / incomeCap) * 100);

  // ── Fetch all Merkle proofs for this wallet ───────────────────────────────
  const { data: proofsData, isLoading: proofLoading } = useQuery<ProofsResp>({
    queryKey: ["/api/distribution/proofs", walletAddress],
    enabled:  !!walletAddress && !!DISTRIBUTOR_ADDRESS,
    refetchInterval: 60_000,
  });

  // Filter out already claimed cycles (tracked locally after claim)
  const pendingCycles = (proofsData?.cycles ?? []).filter(c => !claimedCycles.has(c.cycle));
  const totalPendingMvt = pendingCycles.reduce((sum, c) => sum + BigInt(c.totalMvt), 0n);
  const hasPending = pendingCycles.length > 0 && totalPendingMvt > 0n;

  // ── Claim All — single batchClaim tx, one MetaMask popup ─────────────────
  async function handleClaimAll() {
    if (!pendingCycles.length || !walletAddress) return;
    setClaimErr(null);
    setClaiming(true);
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer   = await provider.getSigner();
      const dist     = getMvaultDistributorContract(signer);

      // Sort ascending so newMatchedVol / newPowerLegPts are applied in order
      const sorted = [...pendingCycles].sort((a, b) => a.cycle - b.cycle);

      const gasLimit = 150_000 + 120_000 * sorted.length;

      const tx = await dist.batchClaim(
        sorted.map(c => BigInt(c.cycle)),
        sorted.map(c => BigInt(c.binaryShare)),
        sorted.map(c => BigInt(c.powerLegShare)),
        sorted.map(c => BigInt(c.newMatchedVol)),
        sorted.map(c => BigInt(c.newPowerLegPts)),
        sorted.map(c => c.proof),
        { gasLimit },
      );
      await tx.wait();

      setClaimedCycles(new Set(sorted.map(c => c.cycle)));
      qc.invalidateQueries({ queryKey: ["/api/distribution/proofs", walletAddress] });
    } catch (err: any) {
      const msg = err?.shortMessage || err?.reason || err?.message || "Claim failed";
      setClaimErr(msg.slice(0, 120));
    } finally {
      setClaiming(false);
    }
  }

  const allClaimed = pendingCycles.length === 0 && claimedCycles.size > 0;

  return (
    <div className="p-4 sm:p-6 space-y-6 relative z-10">
      <div className="slide-in">
        <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
          <span className="gradient-text">Income</span>
        </h1>
        <p className="text-sm text-muted-foreground">Level income, binary pairs, and rebirth pool</p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 slide-in" style={{ animationDelay: "0.05s" }}>
        <div className="glass-card rounded-2xl p-4" data-testid="card-total-mvt-earned">
          <Coins className="h-4 w-4 text-yellow-300 mb-2" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Total Earned</p>
          <p className="text-lg font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }} data-testid="text-total-received">
            {mvtFmt(userInfo.totalReceived)} MVT
          </p>
          {mvtPrice.sellPrice > 0n && (
            <p className="text-[10px] text-muted-foreground">≈ {usdFmt(userInfo.totalReceived, mvtPrice.sellPrice)}</p>
          )}
        </div>
        <div className="glass-card rounded-2xl p-4" data-testid="card-mvt-balance">
          <TrendingUp className="h-4 w-4 text-amber-400 mb-2" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">MVT Balance</p>
          <p className="text-lg font-bold text-amber-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-mvt-balance">
            {mvtFmt(userInfo.mvtBalance)} MVT
          </p>
          <button onClick={() => setLocation("/sell-tokens")} className="text-[10px] text-amber-400 hover:text-amber-300 mt-1">
            Sell →
          </button>
        </div>
        <div className="glass-card rounded-2xl p-4" data-testid="card-rebirth-pool">
          <Layers className="h-4 w-4 text-purple-400 mb-2" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Rebirth Pool</p>
          <p className="text-lg font-bold text-purple-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-rebirth-pool">
            ${parseFloat(formatTokenAmount(userInfo.rebirthPool, 18)).toFixed(2)}
          </p>
        </div>
        <div className="glass-card rounded-2xl p-4" data-testid="card-power-leg">
          <GitBranch className="h-4 w-4 text-blue-400 mb-2" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Power Leg Pts</p>
          <p className="text-lg font-bold text-blue-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-power-leg">
            {Number(userInfo.powerLegPoints)}
          </p>
        </div>
      </div>

      {/* Income Limit Progress */}
      <div className="glass-card rounded-2xl p-5 slide-in" style={{ animationDelay: "0.07s" }} data-testid="card-income-limit">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}>
            <span className="gradient-text">Income Limit (${incomeCap.toFixed(2)} Max)</span>
          </h2>
          <Badge variant="outline" className="text-[9px] border-amber-500/30 text-amber-400">
            ${parseFloat(formatTokenAmount(userInfo.incomeLimit, 18)).toFixed(2)} remaining
          </Badge>
        </div>
        <div className="space-y-2">
          <div className="h-3 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-400 transition-all"
              style={{ width: `${incomeProgress}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>${incomeUsed.toFixed(2)} USDT received</span>
            <span>${incomeCap.toFixed(2)} cap (3× activation)</span>
          </div>
        </div>
        <div className="mt-3 flex items-start gap-2 p-2.5 rounded-xl bg-amber-500/[0.06] border border-amber-500/10">
          <Info className="h-3.5 w-3.5 text-amber-400/70 shrink-0 mt-0.5" />
          <p className="text-[10px] text-muted-foreground">When your income limit reaches $0, all MVT sell proceeds go to your rebirth pool. Trigger rebirth to reset your limit to ${incomeCap.toFixed(2)}.</p>
        </div>
      </div>

      {/* ── Merkle Claim Card ─────────────────────────────────────────────────── */}
      {DISTRIBUTOR_ADDRESS && walletAddress && (
        <div className="glass-card rounded-2xl p-5 slide-in" style={{ animationDelay: "0.075s" }} data-testid="card-distribution-claim">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="h-9 w-9 rounded-xl bg-emerald-500/15 flex items-center justify-center">
              <ShieldCheck className="h-4.5 w-4.5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}>
                <span className="gradient-text">Binary Distribution Claim</span>
              </h2>
              <p className="text-[10px] text-muted-foreground">Trustless Merkle-proof — claim any time, no expiry</p>
            </div>
          </div>

          {proofLoading ? (
            <div className="flex items-center gap-2 py-3 text-muted-foreground text-xs">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking for pending distributions…
            </div>
          ) : allClaimed ? (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <p className="text-xs text-emerald-400 font-medium">All cycles claimed — MVT credited to your account</p>
            </div>
          ) : hasPending ? (
            <div className="space-y-3">
              {/* Summary row */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/15">
                <div>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Total Claimable</p>
                  <p className="text-base font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }} data-testid="text-total-claimable">
                    {parseFloat(formatTokenAmount(totalPendingMvt, 18)).toFixed(4)} MVT
                  </p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">
                    {pendingCycles.length} cycle{pendingCycles.length !== 1 ? "s" : ""} — claim any time
                  </p>
                </div>
                <Button
                  onClick={handleClaimAll}
                  disabled={claiming}
                  data-testid="button-claim-all"
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-4"
                >
                  {claiming
                    ? <><Loader2 className="h-3 w-3 animate-spin mr-1.5" />Claiming…</>
                    : pendingCycles.length > 1 ? `Claim All (${pendingCycles.length})` : "Claim MVT"}
                </Button>
              </div>

              {/* Per-cycle breakdown toggle */}
              {pendingCycles.length > 1 && (
                <button
                  onClick={() => setShowCycles(v => !v)}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="button-toggle-cycles"
                >
                  {showCycles ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  {showCycles ? "Hide" : "Show"} cycle breakdown
                </button>
              )}

              {(showCycles || pendingCycles.length === 1) && (
                <div className="space-y-2">
                  {pendingCycles.map(c => {
                    const isClaimed = claimedCycles.has(c.cycle);
                    return (
                      <div
                        key={c.cycle}
                        className={`flex items-center justify-between px-3 py-2.5 rounded-xl border ${
                          isClaimed
                            ? "bg-emerald-500/5 border-emerald-500/15"
                            : "bg-white/[0.02] border-white/[0.06]"
                        }`}
                        data-testid={`row-cycle-${c.cycle}`}
                      >
                        <div>
                          <p className="text-xs font-semibold">Cycle #{c.cycle}</p>
                          <p className="text-[10px] text-muted-foreground">
                            Binary: {parseFloat(formatTokenAmount(BigInt(c.binaryShare), 18)).toFixed(4)} MVT
                            &nbsp;·&nbsp;
                            Power: {parseFloat(formatTokenAmount(BigInt(c.powerLegShare), 18)).toFixed(4)} MVT
                          </p>
                        </div>
                        {isClaimed
                          ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                          : (
                            <Badge variant="outline" className="text-[9px] border-amber-500/30 text-amber-400">
                              {parseFloat(formatTokenAmount(BigInt(c.totalMvt), 18)).toFixed(4)} MVT
                            </Badge>
                          )
                        }
                      </div>
                    );
                  })}
                </div>
              )}

              {claimErr && (
                <div className="flex items-start gap-2 p-2.5 rounded-xl bg-red-500/[0.06] border border-red-500/15">
                  <Info className="h-3.5 w-3.5 text-red-400/70 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-red-400">{claimErr}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="py-3 text-center">
              <p className="text-xs text-muted-foreground">No pending distributions for your wallet</p>
              <p className="text-[10px] text-muted-foreground/60 mt-1">Distribution runs every 24 hours — claim any time after it runs</p>
            </div>
          )}
        </div>
      )}

      {/* Binary Income */}
      <div className="glass-card rounded-2xl p-5 slide-in" style={{ animationDelay: "0.08s" }} data-testid="card-binary-income">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}>
            <span className="gradient-text">Binary Network</span>
          </h2>
          <button onClick={() => setLocation("/binary")} className="text-[10px] text-amber-400 hover:text-amber-300">
            Details →
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="text-center p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
            <ArrowDownLeft className="h-4 w-4 text-blue-400 mx-auto mb-1.5" />
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Left Team</p>
            <p className="text-xl font-bold text-blue-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-left-team">{leftCount}</p>
          </div>
          <div className="text-center p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
            <GitBranch className="h-4 w-4 text-emerald-400 mx-auto mb-1.5" />
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Matched</p>
            <p className="text-xl font-bold text-emerald-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-matched-pairs">{matchedPairs}</p>
          </div>
          <div className="text-center p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
            <ArrowDownRight className="h-4 w-4 text-purple-400 mx-auto mb-1.5" />
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Right Team</p>
            <p className="text-xl font-bold text-purple-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-right-team">{rightCount}</p>
          </div>
        </div>

        {newPairs > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <p className="text-xs text-emerald-400 font-medium">{newPairs} new pair{newPairs !== 1 ? "s" : ""} pending — claim your income above after the next daily cycle</p>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
          <div className="text-center">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Binary Pool (70%)</p>
            <p className="text-xs font-medium">Split by new pairs each cycle</p>
          </div>
          <div className="text-center">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Power Leg (30%)</p>
            <p className="text-xs font-medium">{Number(userInfo.powerLegPoints)} pts accumulated</p>
          </div>
        </div>
      </div>

      {/* Level Income Structure */}
      <div className="glass-card rounded-2xl overflow-hidden slide-in" style={{ animationDelay: "0.09s" }} data-testid="card-level-structure">
        <div className="p-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
              <Users className="h-4.5 w-4.5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}>
                <span className="gradient-text">Level Income Structure</span>
              </h2>
              <p className="text-[10px] text-muted-foreground">30% of each $130 activation distributed over 10 levels</p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[9px] border-amber-500/30 text-amber-400">
              You have {directCount} direct{directCount !== 1 ? "s" : ""}
            </Badge>
            <Badge variant="outline" className={`text-[9px] ${directCount >= 2 ? "border-emerald-500/30 text-emerald-400" : "border-muted-foreground/30 text-muted-foreground"}`}>
              L1–L4: {directCount >= 2 ? "✓ Qualified" : `Need ${2 - directCount} more`}
            </Badge>
            <Badge variant="outline" className={`text-[9px] ${directCount >= 5 ? "border-emerald-500/30 text-emerald-400" : "border-muted-foreground/30 text-muted-foreground"}`}>
              L5–L10: {directCount >= 5 ? "✓ Qualified" : `Need ${5 - directCount} more`}
            </Badge>
          </div>
        </div>
        <div className="divide-y divide-white/[0.04]">
          {LEVEL_RATES.map(({ level, pct, value, dirReq }) => {
            const qualified = directCount >= dirReq;
            const noReq = dirReq === 0;
            return (
              <div key={level} className="flex items-center justify-between px-5 py-2.5" data-testid={`row-level-${level}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${noReq ? "bg-emerald-500/10" : "bg-white/[0.04]"}`}>
                    <span className={`text-[11px] font-bold ${noReq ? "text-emerald-400" : "text-muted-foreground"}`}>L{level}</span>
                  </div>
                  <div>
                    <p className="text-xs font-semibold">{pct} of gross MVT <span className="text-muted-foreground font-normal">≈ {value}</span></p>
                    <p className="text-[10px] text-muted-foreground">
                      {noReq ? "No requirement — always paid to active sponsor" : `${dirReq} direct${dirReq !== 1 ? "s" : ""} required`}
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className={`text-[9px] ${noReq || qualified ? "border-emerald-500/30 text-emerald-400" : "border-muted-foreground/20 text-muted-foreground/50"}`}>
                  {noReq ? "Always Open" : qualified ? "Qualified" : "Locked"}
                </Badge>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
