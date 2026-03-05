import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Loader2, ArrowLeft, Coins, CheckCircle, AlertCircle, Clock, Download, ChevronLeft, ChevronRight, Timer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const CLAIMS_PER_PAGE = 10;

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
}

export default function StakingPage({ account }: StakingPageProps) {
  const [, navigate] = useLocation();
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

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [activeRes, plansRes, walletRes] = await Promise.all([
        fetch(`/api/staking/${account.toLowerCase()}/active`),
        fetch(`/api/staking/${account.toLowerCase()}`),
        fetch(`/api/mwallet/${account.toLowerCase()}`),
      ]);
      const activeData = activeRes.ok ? await activeRes.json() : null;
      const plansData = plansRes.ok ? await plansRes.json() : [];
      const walletData = walletRes.ok ? await walletRes.json() : null;
      setActivePlan(activeData || null);
      setAllPlans(Array.isArray(plansData) ? plansData : []);
      setMwallet(walletData || { balance: "0", totalClaimed: "0" });
    } catch {
      setActivePlan(null);
    } finally {
      setLoading(false);
    }
  }, [account]);

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
        <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
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
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-500/20 via-purple-500/20 to-cyan-500/20 flex items-center justify-center">
            <Coins className="h-6 w-6 text-purple-400" />
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
            <Coins className="h-3.5 w-3.5 text-purple-400" />
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">M Coin Balance</p>
          </div>
          <p className="text-xl font-bold text-purple-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-mwallet-balance">
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
            <Clock className="h-3.5 w-3.5 text-cyan-400" />
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
              <Badge variant="outline" className="border-purple-500/30 text-purple-400">
                10% Return
              </Badge>
            </div>
          </div>

          <div className="space-y-3 mb-5">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground">Tokens Claimed</p>
                <p className="text-2xl font-bold text-purple-400" style={{ fontFamily: "var(--font-display)" }}>
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
                className="h-full rounded-full bg-gradient-to-r from-amber-500 via-purple-500 to-cyan-500 transition-all duration-500"
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
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Activation Fee</p>
              <p className="text-sm font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }}>
                ${parseFloat(plan.activationFee).toLocaleString()}
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
            <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
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
                  <Clock className="h-4 w-4 text-purple-400" />
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
    </div>
  );
}
