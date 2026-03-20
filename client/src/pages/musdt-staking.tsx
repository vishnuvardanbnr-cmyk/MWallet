import { useState, useEffect, useCallback } from "react";
import { DollarSign, TrendingUp, Clock, CheckCircle2, AlertCircle, Loader2, ArrowDownUp, Shield, Users, RefreshCw, Star, Trophy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import type { BinaryInfo, UserInfo } from "@/hooks/use-web3";

const STAR_RANKS = [
  { rank: 1,  title: "Star 1",  totalQual: 5_000,       allocation: 250 },
  { rank: 2,  title: "Star 2",  totalQual: 20_000,      allocation: 1_000 },
  { rank: 3,  title: "Star 3",  totalQual: 60_000,      allocation: 3_000 },
  { rank: 4,  title: "Star 4",  totalQual: 200_000,     allocation: 10_000 },
  { rank: 5,  title: "Star 5",  totalQual: 600_000,     allocation: 30_000 },
  { rank: 6,  title: "Star 6",  totalQual: 2_000_000,   allocation: 100_000 },
  { rank: 7,  title: "Star 7",  totalQual: 6_000_000,   allocation: 300_000 },
  { rank: 8,  title: "Star 8",  totalQual: 20_000_000,  allocation: 1_000_000 },
  { rank: 9,  title: "Star 9",  totalQual: 60_000_000,  allocation: 3_000_000 },
  { rank: 10, title: "Star 10", totalQual: 100_000_000, allocation: 5_000_000 },
];

interface MusdtStakingPageProps {
  account: string;
  binaryInfo?: BinaryInfo | null;
  userInfo?: UserInfo | null;
}

interface MusdtPlan {
  id: number;
  walletAddress: string;
  usdtInvested: string;
  dailyRewardUsdt: string;
  totalWithdrawn: string;
  overrideReceived: string;
  personalCap: string;
  totalCap: string;
  lastWithdrawDate: string | null;
  startDate: string;
  minEndDate: string;
  isActive: boolean;
  closedAt: string | null;
}

interface OverrideEntry {
  id: number;
  fromWallet: string;
  amountUsdt: string;
  level: number;
  createdAt: string;
}

interface PageData {
  activePlans: MusdtPlan[];
  closedPlans: MusdtPlan[];
  overrideIncome: OverrideEntry[];
  overrideTotalUsdt: string;
  usdtBalance: string;
}

const OVERRIDE_LEVELS = [
  { level: 1,  rate: "20%",  requiredPkg: "Starter",         pkgId: 1 },
  { level: 2,  rate: "10%",  requiredPkg: "Basic",           pkgId: 2 },
  { level: 3,  rate: "5%",   requiredPkg: "Pro",             pkgId: 3 },
  { level: 4,  rate: "3%",   requiredPkg: "Elite",           pkgId: 4 },
  { level: 5,  rate: "2%",   requiredPkg: "Stockiest",       pkgId: 5 },
  { level: 6,  rate: "1%",   requiredPkg: "Stockiest",       pkgId: 5 },
  { level: 7,  rate: "1%",   requiredPkg: "Super Stockiest", pkgId: 6 },
  { level: 8,  rate: "1%",   requiredPkg: "Super Stockiest", pkgId: 6 },
  { level: 9,  rate: "0.5%", requiredPkg: "Super Stockiest", pkgId: 6 },
  { level: 10, rate: "0.5%", requiredPkg: "Super Stockiest", pkgId: 6 },
];

export default function MusdtStakingPage({ account, binaryInfo, userInfo }: MusdtStakingPageProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PageData | null>(null);
  const [stakeAmount, setStakeAmount] = useState("");
  const [staking, setStaking] = useState(false);
  const [withdrawingPlanId, setWithdrawingPlanId] = useState<number | null>(null);
  const [showOverrideTable, setShowOverrideTable] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch(`/api/musdt-staking/${account.toLowerCase()}`);
      if (res.ok) setData(await res.json());
    } catch {}
    setLoading(false);
  }, [account]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleStake = async () => {
    const amt = parseFloat(stakeAmount);
    if (isNaN(amt) || amt <= 0) {
      toast({ title: "Invalid Amount", description: "Enter a valid USDT amount.", variant: "destructive" });
      return;
    }
    setStaking(true);
    try {
      const res = await fetch("/api/musdt-staking/stake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: account, usdtAmount: amt.toString() }),
      });
      const result = await res.json();
      if (!res.ok) { toast({ title: "Stake Failed", description: result.message, variant: "destructive" }); return; }
      toast({ title: "MUSDT Staking Activated!", description: `$${amt.toFixed(2)} USDT staked. Earning $${parseFloat(result.dailyRewardUsdt).toFixed(4)}/day. Cap: $${parseFloat(result.personalCap).toFixed(2)} personal / $${parseFloat(result.totalCap).toFixed(2)} total.` });
      setStakeAmount("");
      await loadData();
    } catch { toast({ title: "Network Error", variant: "destructive" }); }
    finally { setStaking(false); }
  };

  const handleWithdraw = async (planId: number) => {
    setWithdrawingPlanId(planId);
    try {
      const res = await fetch("/api/musdt-staking/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: account, planId }),
      });
      const result = await res.json();
      if (!res.ok) { toast({ title: "Withdrawal Failed", description: result.message, variant: "destructive" }); return; }
      toast({ title: "Withdrawal Successful!", description: `$${parseFloat(result.withdrawn).toFixed(4)} USDT credited to your balance.` });
      await loadData();
    } catch { toast({ title: "Network Error", variant: "destructive" }); }
    finally { setWithdrawingPlanId(null); }
  };

  const activePlans = data?.activePlans ?? [];
  const closedPlans = data?.closedPlans ?? [];
  const usdtBalance = parseFloat(data?.usdtBalance ?? "0");
  const overrideTotal = parseFloat(data?.overrideTotalUsdt ?? "0");

  const previewPersonalCap = stakeAmount ? parseFloat(stakeAmount) * 2 : null;
  const previewTotalCap = stakeAmount ? parseFloat(stakeAmount) * 3.5 : null;
  const previewDailyReward = stakeAmount ? parseFloat(stakeAmount) * 0.003 : null;

  // Star rank calculation (based on smaller binary leg in USD)
  const DECIMALS = 1_000_000_000_000_000_000n;
  const leftUSDT = binaryInfo ? Number(binaryInfo.leftBusiness / DECIMALS) : 0;
  const rightUSDT = binaryInfo ? Number(binaryInfo.rightBusiness / DECIMALS) : 0;
  const minLeg = Math.min(leftUSDT, rightUSDT);
  const starRankIndex = STAR_RANKS.reduce((best, r, i) => (minLeg >= r.totalQual / 2 ? i : best), -1);
  const starRank = starRankIndex >= 0 ? STAR_RANKS[starRankIndex] : null;
  const nextRank = starRankIndex < STAR_RANKS.length - 1 ? STAR_RANKS[starRankIndex + 1] : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-xl gradient-icon flex items-center justify-center pulse-glow">
            <Loader2 className="w-6 h-6 animate-spin text-yellow-300" />
          </div>
          <p className="text-sm text-muted-foreground">Loading MUSDT staking...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-5">

      {/* Title */}
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }} data-testid="text-musdt-title">
          MUSDT Staking
        </h1>
        <p className="text-xs text-muted-foreground">0.3% Daily · 666+ Days · 2x Personal · 3.5x Total with Team</p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="premium-card rounded-xl p-3 text-center" data-testid="card-usdt-balance">
          <DollarSign className="w-4 h-4 mx-auto text-emerald-400 mb-1" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">USDT Balance</p>
          <p className="text-sm font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }}>
            ${usdtBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className="premium-card rounded-xl p-3 text-center">
          <TrendingUp className="w-4 h-4 mx-auto text-amber-400 mb-1" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Daily Rate</p>
          <p className="text-sm font-bold text-amber-400" style={{ fontFamily: "var(--font-display)" }}>0.3%</p>
        </div>
        <div className="premium-card rounded-xl p-3 text-center">
          <Shield className="w-4 h-4 mx-auto text-yellow-300 mb-1" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Total Cap</p>
          <p className="text-sm font-bold text-yellow-300" style={{ fontFamily: "var(--font-display)" }}>3.5x</p>
        </div>
      </div>

      {/* Star Rank Achiever Reward */}
      {binaryInfo && (
        <div className="glass-card rounded-2xl p-5 relative overflow-hidden" data-testid="card-star-rank-musdt">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/8 via-transparent to-yellow-600/5 pointer-events-none" />
          <div className="relative flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
              <Trophy className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">Rank Achiever Rewards</p>
              <p className="text-sm font-bold text-amber-400" style={{ fontFamily: "var(--font-display)" }}>MUSDT Star Rewards</p>
            </div>
            {starRank && (
              <Badge className="ml-auto bg-amber-500/10 text-amber-400 border-amber-500/25 text-[10px] flex items-center gap-1">
                <Star className="w-2.5 h-2.5" /> {starRank.title}
              </Badge>
            )}
          </div>

          {starRank ? (
            <div className="relative space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-amber-500/8 border border-amber-500/20">
                <div>
                  <p className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                    <Star className="w-3.5 h-3.5" /> {starRank.title} Achiever
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">USDT reward allocation unlocked</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-emerald-400" style={{ fontFamily: "var(--font-display)" }}>
                    ${starRank.allocation.toLocaleString()}
                  </p>
                  <p className="text-[10px] text-muted-foreground">USDT</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <div className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.05] text-center">
                  <p className="text-muted-foreground mb-0.5">Left Leg</p>
                  <p className="font-bold text-amber-300">${leftUSDT.toLocaleString()}</p>
                </div>
                <div className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.05] text-center">
                  <p className="text-muted-foreground mb-0.5">Smaller Leg</p>
                  <p className="font-bold text-amber-400">${minLeg.toLocaleString()}</p>
                </div>
                <div className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.05] text-center">
                  <p className="text-muted-foreground mb-0.5">Right Leg</p>
                  <p className="font-bold text-amber-300">${rightUSDT.toLocaleString()}</p>
                </div>
              </div>

              {nextRank && (
                <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.05]">
                  <p className="text-[10px] text-muted-foreground">Next: <span className="text-amber-400 font-medium">{nextRank.title}</span> — smaller leg needs <span className="text-foreground font-medium">${(nextRank.totalQual / 2).toLocaleString()} USDT</span> · Reward: <span className="text-emerald-400 font-medium">${nextRank.allocation.toLocaleString()} USDT</span></p>
                </div>
              )}
            </div>
          ) : (
            <div className="relative space-y-3">
              <p className="text-xs text-muted-foreground">Build your binary team to unlock USDT allocation rewards. The smaller binary leg determines your rank.</p>
              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <div className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.05] text-center">
                  <p className="text-muted-foreground mb-0.5">Left Leg</p>
                  <p className="font-bold text-amber-300">${leftUSDT.toLocaleString()}</p>
                </div>
                <div className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.05] text-center">
                  <p className="text-muted-foreground mb-0.5">Smaller Leg</p>
                  <p className="font-bold text-amber-400">${minLeg.toLocaleString()}</p>
                </div>
                <div className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.05] text-center">
                  <p className="text-muted-foreground mb-0.5">Right Leg</p>
                  <p className="font-bold text-amber-300">${rightUSDT.toLocaleString()}</p>
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.05]">
                <p className="text-[10px] text-muted-foreground">Star 1 requires smaller leg ≥ <span className="text-amber-400 font-medium">$2,500 USDT</span> · Reward: <span className="text-emerald-400 font-medium">$250 USDT</span></p>
              </div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {STAR_RANKS.map((r) => (
                  <div key={r.rank} className="flex items-center justify-between text-[10px] px-2 py-1.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                    <span className="flex items-center gap-1 text-muted-foreground"><Star className="w-2.5 h-2.5 text-amber-500/50" /> {r.title}</span>
                    <span className="text-muted-foreground">Leg ≥ ${(r.totalQual / 2).toLocaleString()}</span>
                    <span className="text-emerald-400 font-medium">${r.allocation.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Active Plans */}
      {activePlans.length > 0 && (
        <div className="space-y-4">
          {activePlans.map((plan) => {
            const invested = parseFloat(plan.usdtInvested);
            const dailyReward = parseFloat(plan.dailyRewardUsdt);
            const totalWithdrawn = parseFloat(plan.totalWithdrawn);
            const overrideReceived = parseFloat(plan.overrideReceived);
            const personalCap = parseFloat(plan.personalCap);
            const totalCap = parseFloat(plan.totalCap);
            const daysElapsed = Math.floor((Date.now() - new Date(plan.startDate).getTime()) / 86400000);
            const daysToMinEnd = Math.max(0, Math.ceil((new Date(plan.minEndDate).getTime() - Date.now()) / 86400000));
            const progressPct = Math.min(100, (daysElapsed / 666) * 100);
            const totalEarned = daysElapsed * dailyReward;
            const pendingPersonal = Math.max(0, Math.min(totalEarned - totalWithdrawn, personalCap - totalWithdrawn));
            const personalProgress = personalCap > 0 ? Math.min(100, (totalWithdrawn / personalCap) * 100) : 0;
            const totalProgress = totalCap > 0 ? Math.min(100, ((totalWithdrawn + overrideReceived) / totalCap) * 100) : 0;
            const canWithdraw = pendingPersonal >= 10;
            const isWithdrawing = withdrawingPlanId === plan.id;

            return (
              <div key={plan.id} className="glass-card rounded-2xl p-5 space-y-4" data-testid={`card-active-plan-${plan.id}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-9 w-9 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                      <DollarSign className="h-4 w-4 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}>Active MUSDT Stake</p>
                      <p className="text-[10px] text-muted-foreground">${invested.toLocaleString()} USDT · started {new Date(plan.startDate).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">Active</Badge>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Daily Reward</p>
                    <p className="text-sm font-bold text-amber-400" style={{ fontFamily: "var(--font-display)" }}>${dailyReward.toFixed(4)} USDT</p>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Days Elapsed</p>
                    <p className="text-sm font-bold text-yellow-300" style={{ fontFamily: "var(--font-display)" }}>{daysElapsed} / 666 min</p>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Personal Cap</p>
                    <p className="text-sm font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }}>${personalCap.toFixed(2)} (2x)</p>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Total Cap</p>
                    <p className="text-sm font-bold text-amber-300" style={{ fontFamily: "var(--font-display)" }}>${totalCap.toFixed(2)} (3.5x)</p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>Minimum duration: {daysElapsed} / 666 days</span>
                    <span>{progressPct.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-yellow-600 to-amber-400 transition-all duration-500" style={{ width: `${progressPct}%` }} />
                  </div>
                  {daysToMinEnd > 0 && (
                    <p className="text-[10px] text-muted-foreground text-center">Minimum duration ends in {daysToMinEnd} days</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>Personal earnings: ${totalWithdrawn.toFixed(2)} / ${personalCap.toFixed(2)}</span>
                    <span>{personalProgress.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-500" style={{ width: `${personalProgress}%` }} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>Total (personal + override): ${(totalWithdrawn + overrideReceived).toFixed(2)} / ${totalCap.toFixed(2)}</span>
                    <span>{totalProgress.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-amber-600 to-yellow-400 transition-all duration-500" style={{ width: `${totalProgress}%` }} />
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-amber-400">Pending Personal Rewards</p>
                      <p className="text-[10px] text-muted-foreground">${pendingPersonal.toFixed(4)} USDT available · Min $10 to withdraw</p>
                    </div>
                    <span className="text-lg font-bold text-amber-400" style={{ fontFamily: "var(--font-display)" }}>
                      ${pendingPersonal.toFixed(2)}
                    </span>
                  </div>
                  <button
                    onClick={() => handleWithdraw(plan.id)}
                    disabled={!canWithdraw || isWithdrawing}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg glow-button text-white text-sm font-bold transition-all disabled:opacity-50"
                    data-testid={`button-withdraw-${plan.id}`}
                  >
                    {isWithdrawing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDownUp className="w-4 h-4" />}
                    {isWithdrawing ? "Processing..." : `Withdraw $${pendingPersonal.toFixed(2)} USDT`}
                  </button>
                  {!canWithdraw && pendingPersonal < 10 && dailyReward > 0 && (
                    <p className="text-[10px] text-center text-muted-foreground">
                      Need ${(10 - pendingPersonal).toFixed(2)} more · ~{Math.ceil((10 - pendingPersonal) / dailyReward)} days away
                    </p>
                  )}
                </div>

                {overrideReceived > 0 && (
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-purple-400" />
                      <div>
                        <p className="text-xs font-medium text-purple-300">Team Override Received</p>
                        <p className="text-[9px] text-muted-foreground">Auto-credited to USDT balance · cap ${(totalCap - personalCap).toFixed(2)}</p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-purple-300">${overrideReceived.toFixed(4)}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Closed Plan History */}
      {closedPlans.length > 0 && (
        <div className="glass-card rounded-2xl p-5 space-y-3">
          <p className="text-sm font-semibold text-muted-foreground" style={{ fontFamily: "var(--font-display)" }}>Previous Plans</p>
          {closedPlans.map((p) => (
            <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
              <div>
                <p className="text-xs font-medium">${parseFloat(p.usdtInvested).toFixed(2)} invested</p>
                <p className="text-[10px] text-muted-foreground">{new Date(p.startDate).toLocaleDateString()} — {p.closedAt ? new Date(p.closedAt).toLocaleDateString() : "closed"}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-emerald-400">${parseFloat(p.totalWithdrawn).toFixed(2)} withdrawn</p>
                <Badge className="text-[10px] bg-white/5 text-muted-foreground border-white/10">Closed</Badge>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Override Income Card — always visible */}
      <div className="glass-card rounded-2xl overflow-hidden" data-testid="card-override-income">
        <div className="p-5 border-b border-white/[0.06]">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-purple-500/15 flex items-center justify-center">
                <Users className="h-4 w-4 text-purple-400" />
              </div>
              <div>
                <p className="text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}>Team Override Income</p>
                <p className="text-[10px] text-muted-foreground">10-level deep commission on downline MUSDT staking</p>
              </div>
            </div>
            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">Auto-Credited</Badge>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Total + Balance Highlight */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-xl bg-purple-500/8 border border-purple-500/20 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Total Override Earned</p>
              <p className="text-2xl font-bold text-purple-300" style={{ fontFamily: "var(--font-display)" }} data-testid="text-override-total">
                ${overrideTotal.toFixed(4)}
              </p>
              <p className="text-[10px] text-purple-400 mt-0.5">{data?.overrideIncome?.length ?? 0} transactions</p>
            </div>
            <div className="p-4 rounded-xl bg-emerald-500/8 border border-emerald-500/20 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">In Your USDT Balance</p>
              <p className="text-2xl font-bold text-emerald-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-override-in-balance">
                ${usdtBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })}
              </p>
              <p className="text-[10px] text-emerald-500 mt-0.5">Available to use</p>
            </div>
          </div>

          {/* Status banner */}
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Override income is <span className="text-foreground font-medium">automatically credited</span> to your USDT balance daily as your downline stakes. Levels you can earn from depend on your <span className="text-foreground font-medium">package rank</span> — higher packages unlock deeper levels.
            </p>
          </div>

          {/* Level Rate Table */}
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Level Commission Rates</p>
            <div className="space-y-1">
              {OVERRIDE_LEVELS.map((lvl) => {
                const earned = data?.overrideIncome
                  ?.filter((r) => r.level === lvl.level)
                  .reduce((s, r) => s + parseFloat(r.amountUsdt), 0) ?? 0;
                const pkgColors: Record<number, string> = {
                  1: "text-slate-400 bg-slate-500/10 border-slate-500/20",
                  2: "text-blue-400 bg-blue-500/10 border-blue-500/20",
                  3: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
                  4: "text-amber-400 bg-amber-500/10 border-amber-500/20",
                  5: "text-orange-400 bg-orange-500/10 border-orange-500/20",
                  6: "text-purple-300 bg-purple-500/10 border-purple-500/20",
                };
                return (
                  <div key={lvl.level} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04]" data-testid={`row-override-level-${lvl.level}`}>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="w-6 h-6 rounded-md bg-purple-500/15 flex items-center justify-center text-[9px] font-bold text-purple-300 shrink-0">L{lvl.level}</span>
                      <span className="text-sm font-bold text-foreground">{lvl.rate}</span>
                      <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded border ${pkgColors[lvl.pkgId]} shrink-0`}>
                        {lvl.requiredPkg}+
                      </span>
                    </div>
                    <span className={`text-[10px] font-bold ml-2 ${earned > 0 ? "text-emerald-400" : "text-muted-foreground/40"}`}>
                      {earned > 0 ? `+$${earned.toFixed(4)}` : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent override entries */}
          {data?.overrideIncome && data.overrideIncome.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Recent Credits</p>
              {data.overrideIncome.slice(0, 6).map((row) => (
                <div key={row.id} className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]" data-testid={`row-override-entry-${row.id}`}>
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-md bg-purple-500/15 flex items-center justify-center text-[9px] font-bold text-purple-300">L{row.level}</span>
                    <div>
                      <p className="text-[10px] font-medium text-purple-300">Level {row.level} override</p>
                      <p className="text-[9px] text-muted-foreground">{row.fromWallet.slice(0, 8)}…{row.fromWallet.slice(-4)} · {new Date(row.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-emerald-400">+${parseFloat(row.amountUsdt).toFixed(6)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4">
              <Users className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">No override income yet</p>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">Earn when your downline starts MUSDT staking</p>
            </div>
          )}
        </div>
      </div>

      {/* Stake Form */}
      <div className="glass-card rounded-2xl p-5 space-y-4" data-testid="card-stake-form">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-yellow-600/15 flex items-center justify-center">
              <DollarSign className="h-4 w-4 text-yellow-300" />
            </div>
            <div>
              <p className="text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}>Start MUSDT Staking</p>
              <p className="text-[10px] text-muted-foreground">0.3%/day · 666 days minimum · 2x personal cap · 3.5x total cap</p>
            </div>
          </div>

          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
            <p className="text-xs text-muted-foreground mb-2">USDT Amount</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={stakeAmount}
                onChange={(e) => setStakeAmount(e.target.value)}
                placeholder="0.00"
                className="min-w-0 flex-1 bg-transparent text-xl font-bold text-foreground outline-none placeholder:text-muted-foreground/30"
                style={{ fontFamily: "var(--font-display)" }}
                data-testid="input-stake-amount"
              />
              <button
                onClick={() => setStakeAmount(usdtBalance.toFixed(2))}
                className="text-[10px] text-yellow-300 hover:text-yellow-200 font-semibold uppercase tracking-wider px-2 py-1 rounded-md bg-yellow-600/10 hover:bg-yellow-600/15 transition-colors shrink-0"
                data-testid="button-max-stake"
              >
                MAX
              </button>
              <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 shrink-0">
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs font-bold text-emerald-400 hidden sm:inline">USDT</span>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">Balance: ${usdtBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
          </div>

          {stakeAmount && previewDailyReward !== null && parseFloat(stakeAmount) > 0 && (
            <div className="space-y-2 p-3 rounded-xl bg-yellow-600/5 border border-yellow-600/15">
              <p className="text-[10px] text-yellow-300 uppercase tracking-wider font-medium">Stake Preview</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Daily reward</span><span className="font-bold text-amber-400">${previewDailyReward.toFixed(4)}/day</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Min duration</span><span className="font-bold text-yellow-300">666 days</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Personal cap (2x)</span><span className="font-bold text-emerald-400">${previewPersonalCap?.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Total cap (3.5x)</span><span className="font-bold text-amber-300">${previewTotalCap?.toFixed(2)}</span></div>
                <div className="flex justify-between col-span-2 pt-1 border-t border-white/[0.05]">
                  <span className="text-muted-foreground">Override income cap (1.5x)</span>
                  <span className="font-bold text-purple-300">${((previewTotalCap ?? 0) - (previewPersonalCap ?? 0)).toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={handleStake}
            disabled={staking || !stakeAmount || parseFloat(stakeAmount) <= 0 || parseFloat(stakeAmount) > usdtBalance}
            className="w-full glow-button text-white font-bold py-3.5 px-6 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ fontFamily: "var(--font-display)" }}
            data-testid="button-stake"
          >
            {staking ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
            {staking ? "Processing..." : "Activate MUSDT Staking"}
          </button>

          {usdtBalance === 0 && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <p className="text-xs text-amber-400">You need a USDT balance to stake. Deposit USDT first.</p>
            </div>
          )}
      </div>

      {/* Override Level Table */}
      <div className="glass-card rounded-2xl p-5 space-y-3">
        <button
          onClick={() => setShowOverrideTable(!showOverrideTable)}
          className="w-full flex items-center justify-between"
          data-testid="button-toggle-override-table"
        >
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>Override Level Structure</span>
          </div>
          <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${showOverrideTable ? "rotate-180" : ""}`} />
        </button>

        {showOverrideTable && (
          <div className="space-y-2">
            <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
              <strong>Qualification:</strong> Your MUSDT stake must be ≥ 50% of the downline's investment to receive override at each level.
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              {OVERRIDE_LEVELS.map((item) => (
                <div key={item.level} className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                  <span className="text-[11px] text-muted-foreground">Level {item.level}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-purple-300">{item.rate} of downline daily reward</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground text-center">Override income caps at 1.5x your invested amount (part of the 3.5x total)</p>
          </div>
        )}
      </div>

      {/* How It Works */}
      <div className="premium-card rounded-2xl p-5 space-y-3">
        <p className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>How MUSDT Staking Works</p>
        <div className="space-y-2.5">
          {[
            { icon: DollarSign, color: "text-emerald-400", title: "Deposit USDT & Stake", desc: "Use your virtual USDT balance to activate a MUSDT staking plan." },
            { icon: TrendingUp, color: "text-amber-400", title: "0.3% Daily Rewards", desc: "Earn 0.3% of your invested USDT every day. Withdraw anytime (min $10)." },
            { icon: Clock, color: "text-yellow-300", title: "666-Day Minimum", desc: "Plan stays active for at least 666 days. At 0.3%/day, that's exactly 2x your investment." },
            { icon: Shield, color: "text-blue-400", title: "2x Personal Cap", desc: "Your personal daily rewards are capped at 2x your investment. After that, only override income flows in." },
            { icon: Users, color: "text-purple-400", title: "Team Override up to 3.5x", desc: "Earn override income from downlines' daily rewards (up to 10 levels). Total cap is 3.5x your stake." },
            { icon: CheckCircle2, color: "text-emerald-400", title: "Auto-Credited Override", desc: "Override income is distributed automatically every day and credited directly to your USDT balance." },
          ].map((item) => (
            <div key={item.title} className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-white/[0.03] border border-white/[0.06] flex items-center justify-center shrink-0">
                <item.icon className={`w-3.5 h-3.5 ${item.color}`} />
              </div>
              <div>
                <p className="text-xs font-medium">{item.title}</p>
                <p className="text-[10px] text-muted-foreground">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
