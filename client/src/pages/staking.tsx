import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Loader2, ArrowLeft, Coins, CheckCircle, AlertCircle, Clock, Download, ChevronLeft, ChevronRight, Timer, Star, Trophy, TrendingUp, ChevronDown, ChevronUp, Gift } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatTokenAmount } from "@/lib/contract";
import type { BinaryInfo } from "@/hooks/use-web3";
import { useToast } from "@/hooks/use-toast";

const CLAIMS_PER_PAGE = 10;

const STAR_RANKS = [
  { rank: 1, title: "Star 1", totalQual: 5_000,       stakingPct: 5,  allocation: 250 },
  { rank: 2, title: "Star 2", totalQual: 20_000,      stakingPct: 5,  allocation: 1_000 },
  { rank: 3, title: "Star 3", totalQual: 50_000,      stakingPct: 5,  allocation: 2_500 },
  { rank: 4, title: "Star 4", totalQual: 100_000,     stakingPct: 8,  allocation: 8_000 },
  { rank: 5, title: "Star 5", totalQual: 500_000,     stakingPct: 8,  allocation: 40_000 },
  { rank: 6, title: "Star 6", totalQual: 1_000_000,   stakingPct: 8,  allocation: 80_000 },
  { rank: 7, title: "Star 7", totalQual: 5_000_000,   stakingPct: 8,  allocation: 400_000 },
  { rank: 8, title: "Star 8", totalQual: 10_000_000,  stakingPct: 10, allocation: 1_000_000 },
  { rank: 9, title: "Star 9", totalQual: 50_000_000,  stakingPct: 10, allocation: 5_000_000 },
  { rank: 10, title: "Star 10", totalQual: 100_000_000, stakingPct: 10, allocation: 10_000_000 },
];

function formatUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toLocaleString()}M`;
  if (n >= 1_000) return `$${(n / 1_000).toLocaleString()}K`;
  return `$${n.toLocaleString()}`;
}

interface StakingPlan {
  id: number;
  walletAddress: string;
  planMonths: number;
  activationFee: string;
  totalTokens: string;
  dailyTokens: string;
  claimedTokens: string;
  lastClaimDate: string | null;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

interface MwalletBalance {
  balance: string;
  totalClaimed: string;
}

interface StakingClaim {
  id: number;
  walletAddress: string;
  planId: number;
  amount: string;
  daysCount: number;
  claimedAt: string;
}

interface ClaimResult {
  success: boolean;
  message: string;
}

interface StakingPageProps {
  account: string;
  binaryInfo?: BinaryInfo | null;
  tokenDecimals?: number;
}

export default function StakingPage({ account, binaryInfo, tokenDecimals = 18 }: StakingPageProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [activePlan, setActivePlan] = useState<StakingPlan | null>(null);
  const [allPlans, setAllPlans] = useState<StakingPlan[]>([]);
  const [mwallet, setMwallet] = useState<MwalletBalance>({ balance: "0", totalClaimed: "0" });
  const [claims, setClaims] = useState<StakingClaim[]>([]);
  const [claimsTotal, setClaimsTotal] = useState(0);
  const [claimsPage, setClaimsPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimResult, setClaimResult] = useState<ClaimResult | null>(null);
  const [showRankTable, setShowRankTable] = useState(false);
  const [claimedRanks, setClaimedRanks] = useState<Set<number>>(new Set());
  const [claimingRank, setClaimingRank] = useState<number | null>(null);

  const leftUSDT = binaryInfo ? parseFloat(formatTokenAmount(binaryInfo.leftBusiness, tokenDecimals)) : 0;
  const rightUSDT = binaryInfo ? parseFloat(formatTokenAmount(binaryInfo.rightBusiness, tokenDecimals)) : 0;
  const minLeg = Math.min(leftUSDT, rightUSDT);

  const currentRankIndex = STAR_RANKS.reduce((best, r, i) => (minLeg >= r.totalQual / 2 ? i : best), -1);
  const currentRank = currentRankIndex >= 0 ? STAR_RANKS[currentRankIndex] : null;
  const nextRank = STAR_RANKS[currentRankIndex + 1] ?? null;

  const nextTarget = nextRank ? nextRank.totalQual / 2 : null;
  const progressPct = nextTarget ? Math.min(100, (minLeg / nextTarget) * 100) : 100;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [activeRes, plansRes, walletRes, leadershipRes] = await Promise.all([
        fetch(`/api/staking/${account.toLowerCase()}/active`),
        fetch(`/api/staking/${account.toLowerCase()}`),
        fetch(`/api/mwallet/${account.toLowerCase()}`),
        fetch(`/api/leadership/${account.toLowerCase()}`),
      ]);
      const activeData = activeRes.ok ? await activeRes.json() : null;
      const plansData = plansRes.ok ? await plansRes.json() : [];
      const walletData = walletRes.ok ? await walletRes.json() : null;
      const leadershipData = leadershipRes.ok ? await leadershipRes.json() : [];
      setActivePlan(activeData || null);
      setAllPlans(Array.isArray(plansData) ? plansData : []);
      setMwallet(walletData || { balance: "0", totalClaimed: "0" });
      if (Array.isArray(leadershipData)) {
        setClaimedRanks(new Set(leadershipData.map((r: { starRank: number }) => r.starRank)));
      }
    } catch {
      setActivePlan(null);
    } finally {
      setLoading(false);
    }
  }, [account]);

  const handleClaimRank = async (rank: number, allocation: number) => {
    setClaimingRank(rank);
    try {
      const res = await fetch("/api/leadership/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: account,
          starRank: rank,
          leftBusiness: leftUSDT.toFixed(4),
          rightBusiness: rightUSDT.toFixed(4),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Claim Failed", description: data.message, variant: "destructive" });
      } else {
        toast({ title: "Reward Claimed!", description: data.message });
        setClaimedRanks(prev => new Set([...prev, rank]));
      }
    } catch {
      toast({ title: "Network Error", description: "Could not claim reward, please try again.", variant: "destructive" });
    } finally {
      setClaimingRank(null);
    }
  };

  const fetchClaims = useCallback(async (page: number) => {
    setClaimsLoading(true);
    try {
      const res = await fetch(`/api/staking/${account.toLowerCase()}/claims?page=${page}&limit=${CLAIMS_PER_PAGE}`);
      if (!res.ok) { setClaims([]); setClaimsTotal(0); return; }
      const data = await res.json();
      setClaims(data.claims || []);
      setClaimsTotal(data.total || 0);
      setClaimsPage(page);
    } catch {
      setClaims([]);
    } finally {
      setClaimsLoading(false);
    }
  }, [account]);

  useEffect(() => {
    fetchData();
    fetchClaims(1);
  }, [fetchData, fetchClaims]);

  const handleClaim = async () => {
    setClaiming(true);
    setClaimResult(null);
    try {
      const res = await fetch("/api/staking/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: account }),
      });
      const data = await res.json();
      if (!res.ok) {
        setClaimResult({ success: false, message: data.message });
        return;
      }
      setClaimResult({
        success: true,
        message: `Claimed ${parseFloat(data.claimed).toFixed(2)} M Coin (${data.days} day${data.days > 1 ? "s" : ""})`,
      });
      fetchData();
      fetchClaims(1);
    } catch {
      setClaimResult({ success: false, message: "Network error. Please try again." });
    } finally {
      setClaiming(false);
    }
  };

  const getProgress = () => {
    if (!activePlan) return null;
    const total = parseFloat(activePlan.totalTokens);
    const claimed = parseFloat(activePlan.claimedTokens);
    const percent = total > 0 ? (claimed / total) * 100 : 0;
    const now = new Date();
    const start = new Date(activePlan.startDate);
    const end = new Date(activePlan.endDate);
    const daysLeft = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const elapsedDays = totalDays - daysLeft;
    const dailyRate = parseFloat(activePlan.dailyTokens);
    const earnedSoFar = Math.floor((Math.min(now.getTime(), end.getTime()) - start.getTime()) / (1000 * 60 * 60 * 24));
    const maxEarned = Math.min(earnedSoFar * dailyRate, total);
    const claimable = Math.max(0, maxEarned - claimed);
    return { percent: Math.min(percent, 100), daysLeft, totalDays, elapsedDays, claimed, total, claimable, remaining: total - claimed };
  };

  const progress = getProgress();
  const totalPages = Math.max(1, Math.ceil(claimsTotal / CLAIMS_PER_PAGE));

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) + " " +
      date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  };

  const shortDate = (d: string) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-yellow-300" />
      </div>
    );
  }

  const plan = activePlan || (allPlans.length > 0 ? allPlans[0] : null);

  return (
    <div className="p-4 sm:p-6 space-y-6 relative z-10">
      <div className="slide-in">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground mb-3"
          data-testid="button-back-dashboard"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
        </button>
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-500/20 via-yellow-500/20 to-amber-400/20 flex items-center justify-center">
            <Coins className="h-6 w-6 text-yellow-300" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-staking-details-title" style={{ fontFamily: "var(--font-display)" }}>
              <span className="gradient-text">M Coin Staking</span>
            </h1>
            <p className="text-sm text-muted-foreground">Track your staking progress and claim history</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 slide-in" style={{ animationDelay: "0.05s" }}>
        <div className="glass-card rounded-2xl p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Coins className="h-3.5 w-3.5 text-yellow-300" />
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">M Coin Balance</p>
          </div>
          <p className="text-xl font-bold text-yellow-300" style={{ fontFamily: "var(--font-display)" }} data-testid="text-mwallet-balance">
            {parseFloat(mwallet.balance).toFixed(2)}
          </p>
        </div>
        <div className="glass-card rounded-2xl p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Claimed</p>
          </div>
          <p className="text-xl font-bold text-emerald-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-total-claimed">
            {parseFloat(mwallet.totalClaimed).toFixed(2)}
          </p>
        </div>
        <div className="glass-card rounded-2xl p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Timer className="h-3.5 w-3.5 text-amber-400" />
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Daily Rate</p>
          </div>
          <p className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }} data-testid="text-daily-rate">
            {plan ? parseFloat(plan.dailyTokens).toFixed(2) : "0.00"}
          </p>
        </div>
        <div className="glass-card rounded-2xl p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Clock className="h-3.5 w-3.5 text-amber-300" />
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Plan Duration</p>
          </div>
          <p className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }} data-testid="text-plan-duration">
            {plan ? `${plan.planMonths}M` : "N/A"}
          </p>
        </div>
      </div>

      {plan && progress && (
        <div className="glass-card rounded-2xl p-6 slide-in" style={{ animationDelay: "0.1s" }} data-testid="card-staking-progress-detail">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <h2 className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>
              <span className="gradient-text">Staking Progress</span>
            </h2>
            <div className="flex items-center gap-2">
              {plan.isActive ? (
                <Badge variant="outline" className="border-emerald-500/30 text-emerald-400">Active</Badge>
              ) : (
                <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground">Completed</Badge>
              )}
              <Badge variant="outline" className="border-yellow-600/30 text-yellow-300">
                10% Return
              </Badge>
            </div>
          </div>

          <div className="space-y-3 mb-5">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground">Tokens Claimed</p>
                <p className="text-2xl font-bold text-yellow-300" style={{ fontFamily: "var(--font-display)" }}>
                  {progress.claimed.toFixed(2)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Total Tokens</p>
                <p className="text-lg font-medium text-muted-foreground" style={{ fontFamily: "var(--font-display)" }}>
                  {progress.total.toLocaleString()}
                </p>
              </div>
            </div>
            <div className="h-3 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-400 transition-all duration-500"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">{progress.percent.toFixed(1)}% of total claimed</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" /> {progress.daysLeft} days remaining
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Total Tokens</p>
              <p className="text-sm font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }}>
                {parseFloat(plan.totalTokens).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Remaining</p>
              <p className="text-sm font-bold text-amber-400" style={{ fontFamily: "var(--font-display)" }}>
                {progress.remaining.toFixed(2)}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Start Date</p>
              <p className="text-sm font-medium">{shortDate(plan.startDate)}</p>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">End Date</p>
              <p className="text-sm font-medium">{shortDate(plan.endDate)}</p>
            </div>
          </div>

          {plan.isActive && (
            <div className="space-y-3">
              {progress.claimable > 0.001 ? (
                <button
                  onClick={handleClaim}
                  disabled={claiming}
                  className="w-full glow-button text-white font-bold py-3.5 px-6 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  data-testid="button-claim-tokens"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {claiming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  {claiming ? "Claiming..." : `Claim ${progress.claimable.toFixed(2)} Tokens`}
                </button>
              ) : (
                <div className="w-full py-3.5 px-6 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center text-sm text-muted-foreground" data-testid="text-no-claimable">
                  No tokens available to claim right now
                </div>
              )}
              {claimResult && (
                <div className={`flex items-center gap-2.5 p-3.5 rounded-xl border ${claimResult.success ? "bg-emerald-500/10 border-emerald-500/20" : "bg-red-500/10 border-red-500/20"}`} data-testid="text-claim-result">
                  {claimResult.success ? <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" /> : <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />}
                  <p className={`text-sm font-medium ${claimResult.success ? "text-emerald-400" : "text-red-400"}`}>{claimResult.message}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="glass-card rounded-2xl slide-in" style={{ animationDelay: "0.15s" }} data-testid="card-claim-history">
        <div className="flex items-center justify-between gap-3 p-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
              <Download className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}>
                <span className="gradient-text">Claim History</span>
              </h2>
              <p className="text-[10px] text-muted-foreground">{claimsTotal} total claim{claimsTotal !== 1 ? "s" : ""}</p>
            </div>
          </div>
        </div>

        {claimsLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-yellow-300" />
          </div>
        ) : claims.length > 0 ? (
          <div className="divide-y divide-white/[0.04]">
            {claims.map((claim, idx) => {
              const rowIdx = (claimsPage - 1) * CLAIMS_PER_PAGE + idx;
              return (
                <div key={claim.id} className="flex items-center justify-between px-5 py-3.5" data-testid={`row-claim-${rowIdx}`}>
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                      <Download className="h-4 w-4 text-emerald-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium" data-testid={`text-claim-amount-${rowIdx}`}>
                          +{parseFloat(claim.amount).toFixed(2)} tokens
                        </span>
                        <Badge variant="outline" className="text-[10px] border-emerald-500/20 text-emerald-400">
                          {claim.daysCount} day{claim.daysCount !== 1 ? "s" : ""}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5" data-testid={`text-claim-date-${rowIdx}`}>
                        {formatDate(claim.claimedAt)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-sm text-emerald-400" style={{ fontFamily: "var(--font-display)" }}>
                      +{parseFloat(claim.amount).toFixed(2)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-10">
            <div className="h-12 w-12 mx-auto rounded-xl bg-white/[0.03] flex items-center justify-center mb-3">
              <Download className="h-6 w-6 text-muted-foreground/30" />
            </div>
            <p className="text-sm text-muted-foreground" data-testid="text-no-claims">No claims yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Your claim history will appear here once you start claiming tokens</p>
          </div>
        )}

        {!claimsLoading && claimsTotal > CLAIMS_PER_PAGE && (
          <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-white/[0.06]">
            <p className="text-[11px] text-muted-foreground">
              Showing {(claimsPage - 1) * CLAIMS_PER_PAGE + 1}-{Math.min(claimsPage * CLAIMS_PER_PAGE, claimsTotal)} of {claimsTotal}
            </p>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" onClick={() => fetchClaims(claimsPage - 1)} disabled={claimsPage <= 1} data-testid="button-claims-prev">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => Math.abs(p - claimsPage) <= 2 || p === 1 || p === totalPages)
                .map((p, idx, arr) => {
                  const showEllipsis = idx > 0 && p - arr[idx - 1] > 1;
                  return (
                    <span key={p}>
                      {showEllipsis && <span className="text-xs text-muted-foreground px-1">...</span>}
                      <Button size="icon" variant={p === claimsPage ? "default" : "ghost"} onClick={() => fetchClaims(p)} data-testid={`button-claims-page-${p}`}>
                        {p}
                      </Button>
                    </span>
                  );
                })}
              <Button size="icon" variant="ghost" onClick={() => fetchClaims(claimsPage + 1)} disabled={claimsPage >= totalPages} data-testid="button-claims-next">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {allPlans.length > 1 && (
        <div className="glass-card rounded-2xl p-5 slide-in" style={{ animationDelay: "0.2s" }} data-testid="card-plan-history">
          <h2 className="text-sm font-bold mb-4" style={{ fontFamily: "var(--font-display)" }}>
            <span className="gradient-text">Plan History</span>
          </h2>
          <div className="space-y-2">
            {allPlans.map((p) => (
              <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]" data-testid={`row-plan-${p.id}`}>
                <div className="flex items-center gap-3">
                  <Clock className="h-4 w-4 text-yellow-300" />
                  <div>
                    <p className="text-sm font-medium">{p.planMonths}-month plan</p>
                    <p className="text-[11px] text-muted-foreground">{shortDate(p.startDate)} - {shortDate(p.endDate)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}>
                    {parseFloat(p.claimedTokens).toFixed(2)} / {parseFloat(p.totalTokens).toLocaleString()}
                  </span>
                  {p.isActive ? (
                    <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400">Active</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] border-muted-foreground/30">Ended</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── M Plan STAR Ranking ───────────────────────────────────────────── */}
      <div className="glass-card rounded-2xl p-5 slide-in" style={{ animationDelay: "0.25s" }} data-testid="card-leadership-ranking">
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500/25 via-yellow-500/20 to-orange-500/15 flex items-center justify-center">
              <Star className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}>
                <span className="gradient-text">M Plan STAR Ranking</span>
              </h2>
              <p className="text-[10px] text-muted-foreground">Min 50/50 on each leg to qualify for each rank</p>
            </div>
          </div>
          {currentRank && (
            <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[11px] font-bold shrink-0">
              <Star className="h-3 w-3 mr-1" />{currentRank.title}
            </Badge>
          )}
        </div>

        {/* Current rank & progress */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Left Leg Volume</p>
            <p className="text-sm font-bold text-amber-300" style={{ fontFamily: "var(--font-display)" }} data-testid="text-left-leg">{formatUSD(leftUSDT)}</p>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Right Leg Volume</p>
            <p className="text-sm font-bold text-yellow-300" style={{ fontFamily: "var(--font-display)" }} data-testid="text-right-leg">{formatUSD(rightUSDT)}</p>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Current Rank</p>
            <p className="text-sm font-bold text-amber-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-current-rank">
              {currentRank ? currentRank.title : "Unranked"}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Staking Allocation</p>
            <p className="text-sm font-bold text-emerald-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-allocation">
              {currentRank ? formatUSD(currentRank.allocation) : "$0"}
            </p>
          </div>
        </div>

        {/* Next rank progress bar */}
        {nextRank && (
          <div className="mb-5 p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-yellow-300" />
                <span className="text-xs font-semibold" style={{ fontFamily: "var(--font-display)" }}>Progress to {nextRank.title}</span>
              </div>
              <span className="text-[11px] text-muted-foreground">{progressPct.toFixed(1)}%</span>
            </div>
            <div className="h-2.5 rounded-full bg-white/[0.06] overflow-hidden mb-2">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-500 via-yellow-400 to-orange-400 transition-all duration-700"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Weaker leg: {formatUSD(minLeg)}</span>
              <span>Need each side: {formatUSD(nextRank.totalQual / 2)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-[10px]">
              <span className="text-muted-foreground">Remaining on weaker leg</span>
              <span className="text-amber-400 font-semibold">{formatUSD(Math.max(0, nextRank.totalQual / 2 - minLeg))}</span>
            </div>
          </div>
        )}

        {currentRank && !nextRank && (
          <div className="mb-5 flex items-center gap-2.5 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <Trophy className="h-4 w-4 text-amber-400 shrink-0" />
            <p className="text-sm font-semibold text-amber-400">Maximum rank achieved — Star 10!</p>
          </div>
        )}

        {/* Claimable rewards list */}
        {STAR_RANKS.filter(r => {
          const qualified = minLeg >= r.totalQual / 2;
          const notClaimed = !claimedRanks.has(r.rank);
          return qualified && notClaimed;
        }).length > 0 && (
          <div className="mb-5 space-y-2" data-testid="section-claimable-rewards">
            <p className="text-[10px] text-amber-400 uppercase tracking-wider font-semibold flex items-center gap-1.5">
              <Gift className="h-3 w-3" /> Unclaimed Rewards
            </p>
            {STAR_RANKS.filter(r => minLeg >= r.totalQual / 2 && !claimedRanks.has(r.rank)).map(r => (
              <div key={r.rank} className="flex items-center justify-between p-3 rounded-xl bg-amber-500/10 border border-amber-500/25" data-testid={`card-claimable-${r.rank}`}>
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-amber-400" />
                  <div>
                    <p className="text-sm font-bold text-amber-400" style={{ fontFamily: "var(--font-display)" }}>{r.title}</p>
                    <p className="text-[10px] text-muted-foreground">Staking allocation reward</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-emerald-400" style={{ fontFamily: "var(--font-display)" }}>{formatUSD(r.allocation)}</span>
                  <button
                    onClick={() => handleClaimRank(r.rank, r.allocation)}
                    disabled={claimingRank === r.rank}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg glow-button text-white text-xs font-bold transition-all disabled:opacity-50"
                    data-testid={`button-claim-rank-${r.rank}`}
                  >
                    {claimingRank === r.rank ? <Loader2 className="h-3 w-3 animate-spin" /> : <Gift className="h-3 w-3" />}
                    Auto-Stake
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Toggle full ranking table */}
        <button
          onClick={() => setShowRankTable(!showRankTable)}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-white/[0.07] bg-white/[0.02] text-xs text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-all"
          data-testid="button-toggle-rank-table"
        >
          {showRankTable ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {showRankTable ? "Hide" : "View"} Full Ranking Table
        </button>

        {showRankTable && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs" data-testid="table-star-ranks">
              <thead>
                <tr className="border-b border-white/[0.07]">
                  <th className="text-left py-2 pr-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Rank</th>
                  <th className="text-right py-2 pr-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Each Side</th>
                  <th className="text-right py-2 pr-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">%</th>
                  <th className="text-right py-2 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Reward</th>
                </tr>
              </thead>
              <tbody>
                {STAR_RANKS.map((r) => {
                  const isAchieved = minLeg >= r.totalQual / 2;
                  const isCurrent = currentRank?.rank === r.rank;
                  const isNext = nextRank?.rank === r.rank;
                  const isClaimed = claimedRanks.has(r.rank);
                  const isClaimable = isAchieved && !isClaimed;
                  return (
                    <tr
                      key={r.rank}
                      className={`border-b border-white/[0.04] transition-colors ${isCurrent ? "bg-amber-500/10" : isNext ? "bg-yellow-600/5" : ""}`}
                      data-testid={`row-rank-${r.rank}`}
                    >
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-1.5">
                          <Star className={`h-3 w-3 shrink-0 ${isAchieved ? "text-amber-400" : "text-muted-foreground/30"}`} />
                          <span className={`font-semibold ${isCurrent ? "text-amber-400" : isAchieved ? "text-foreground" : "text-muted-foreground"}`} style={{ fontFamily: "var(--font-display)" }}>{r.title}</span>
                          {isCurrent && <Badge className="text-[9px] bg-amber-500/15 text-amber-400 border-amber-500/25 ml-1 py-0">YOU</Badge>}
                          {isNext && <Badge className="text-[9px] bg-yellow-600/10 text-yellow-300 border-yellow-600/20 ml-1 py-0">NEXT</Badge>}
                        </div>
                      </td>
                      <td className={`py-2.5 pr-3 text-right ${isAchieved ? "text-amber-300" : "text-muted-foreground"}`}>{formatUSD(r.totalQual / 2)}</td>
                      <td className={`py-2.5 pr-3 text-right font-medium ${isAchieved ? "text-emerald-400" : "text-muted-foreground"}`}>{r.stakingPct}%</td>
                      <td className="py-2 text-right">
                        {isClaimed ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
                            <CheckCircle className="h-3 w-3" /> Staked
                          </span>
                        ) : isClaimable ? (
                          <button
                            onClick={() => handleClaimRank(r.rank, r.allocation)}
                            disabled={claimingRank === r.rank}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/15 text-amber-400 text-[10px] font-bold border border-amber-500/25 hover:bg-amber-500/25 transition-all disabled:opacity-50"
                            data-testid={`button-table-claim-${r.rank}`}
                          >
                            {claimingRank === r.rank ? <Loader2 className="h-3 w-3 animate-spin" /> : <Gift className="h-3 w-3" />}
                            Auto-Stake
                          </button>
                        ) : (
                          <span className={`font-bold text-[11px] ${isAchieved ? "text-emerald-400" : "text-muted-foreground"}`} style={{ fontFamily: "var(--font-display)" }}>{formatUSD(r.allocation)}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
