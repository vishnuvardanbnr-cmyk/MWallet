import { useState, useEffect, useCallback } from "react";
import { DollarSign, TrendingUp, ArrowDownToLine, Coins, Zap, Shield, Copy, ChevronRight, User, Users, Wallet, CheckCircle, AlertCircle, Loader2, Clock, Timer, Star, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PACKAGE_NAMES, PACKAGE_PRICES_USD, STATUS_NAMES, formatTokenAmount } from "@/lib/contract";

import type { UserInfo, IncomeInfo, BinaryInfo } from "@/hooks/use-web3";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

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

interface ProfileOnChain {
  displayName: string;
  email: string;
  phone: string;
  country: string;
  profileSet: boolean;
}

interface ContractTx {
  type: string;
  amount: bigint;
  detail: string;
  timestamp: number;
  isIncome: boolean;
}

interface DashboardProps {
  userInfo: UserInfo;
  incomeInfo: IncomeInfo;
  binaryInfo: BinaryInfo;
  btcPoolBalance: bigint;
  formatAmount: (val: bigint) => string;
  account: string;
  profileOnChain: ProfileOnChain | null;
  getTransactionsFromContract: (offset: number, limit: number) => Promise<{ transactions: ContractTx[]; total: number }>;
  approveToken: (amount: string) => Promise<void>;
  reactivatePackage: (pkg: number) => Promise<void>;
  repurchase: () => Promise<void>;
  tokenDecimals: number;
}

function StatCard({ label, value, icon: Icon, iconColor, accentGlow, delay, borderColor }: {
  label: string; value: string; icon: any; iconColor: string; accentGlow: string; delay: string; borderColor?: string;
}) {
  return (
    <div className={`stat-card rounded-2xl p-5 slide-in ${borderColor || ''}`} style={{ animationDelay: delay }} data-testid={`card-stat-${label.toLowerCase().replace(/\s/g, '-')}`}>
      <div className="flex items-center justify-between mb-3">
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${accentGlow}`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
        <div className={`glow-dot ${iconColor}`} />
      </div>
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
        <span className="gradient-text">${value}</span>
      </p>
    </div>
  );
}

const TOKEN_PRICE = 0.0036;
const STAKING_PLANS = [
  { months: 10, multiplier: 0.1, returnLabel: "10% Return" },
];

interface StakingActivePlan {
  planMonths: number;
  totalTokens: string;
  claimedTokens: string;
  dailyTokens: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export default function Dashboard({ userInfo, incomeInfo, binaryInfo, btcPoolBalance, formatAmount, account, profileOnChain, getTransactionsFromContract, approveToken, reactivatePackage, repurchase, tokenDecimals }: DashboardProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [stakingPlan, setStakingPlan] = useState<StakingActivePlan | null>(null);
  const [selectedMonths, setSelectedMonths] = useState<number | null>(10);
  const [stakingActivating, setStakingActivating] = useState(false);
  const [stakingResult, setStakingResult] = useState<{ success: boolean; message: string } | null>(null);
  const [flushoutCountdown, setFlushoutCountdown] = useState<{ hours: number; minutes: number; seconds: number } | null>(null);
  const [flushoutLoaded, setFlushoutLoaded] = useState(false);
  const [reactivating, setReactivating] = useState(false);
  const [selectedReactivatePkg, setSelectedReactivatePkg] = useState<number>(userInfo.userPackage || 1);

  const packagePrice = PACKAGE_PRICES_USD[userInfo.userPackage] || 0;

  const fetchStaking = useCallback(async () => {
    try {
      const res = await fetch(`/api/staking/${account.toLowerCase()}/active`);
      const data = await res.json();
      if (data && data.isActive) setStakingPlan(data);
    } catch {}
  }, [account]);

  useEffect(() => { fetchStaking(); }, [fetchStaking]);

  const activateStaking = async () => {
    if (!selectedMonths) return;
    setStakingActivating(true);
    setStakingResult(null);
    try {
      const res = await fetch("/api/staking/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: account,
          planMonths: selectedMonths.toString(),
          packageLevel: userInfo.userPackage,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStakingResult({ success: false, message: data.message });
      } else {
        setStakingResult({ success: true, message: "Staking plan activated successfully!" });
        fetchStaking();
      }
    } catch {
      setStakingResult({ success: false, message: "Network error" });
    } finally {
      setStakingActivating(false);
    }
  };

  const stakingPlansComputed = STAKING_PLANS.map((p) => {
    const totalUsd = packagePrice * p.multiplier;
    const totalTokens = totalUsd / TOKEN_PRICE;
    const totalDays = p.months * 30;
    const dailyTokens = totalTokens / totalDays;
    return { ...p, totalTokens, dailyTokens };
  });

  const stakingProgress = stakingPlan ? (() => {
    const total = parseFloat(stakingPlan.totalTokens);
    const claimed = parseFloat(stakingPlan.claimedTokens);
    const now = new Date();
    const end = new Date(stakingPlan.endDate);
    const daysLeft = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    return { earned: claimed, total, daysLeft };
  })() : null;

  const hitMaxIncome = incomeInfo.maxIncome > BigInt(0) && incomeInfo.totalEarnings >= incomeInfo.maxIncome;

  useEffect(() => {
    if (!hitMaxIncome || flushoutLoaded) return;
    getTransactionsFromContract(0, 100).then(result => {
      const reactivations = result.transactions.filter(tx => tx.type === "Reactivation");
      if (reactivations.length > 0) {
        const latest = reactivations.reduce((a, b) => a.timestamp > b.timestamp ? a : b);
        const flushTime = latest.timestamp * 1000;
        const endTime = flushTime + 48 * 60 * 60 * 1000;
        const updateCountdown = () => {
          const diff = endTime - Date.now();
          if (diff <= 0) {
            setFlushoutCountdown(null);
            return;
          }
          const hours = Math.floor(diff / (1000 * 60 * 60));
          const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((diff % (1000 * 60)) / 1000);
          setFlushoutCountdown({ hours, minutes, seconds });
        };
        updateCountdown();
        const interval = setInterval(updateCountdown, 1000);
        setFlushoutLoaded(true);
        return () => clearInterval(interval);
      }
      setFlushoutLoaded(true);
    });
  }, [hitMaxIncome, flushoutLoaded, getTransactionsFromContract]);

  const packageIndex = userInfo.userPackage;
  const packageName = PACKAGE_NAMES[packageIndex] || "Unknown";
  const statusLabel = STATUS_NAMES[userInfo.status] || "Unknown";
  const isActive = userInfo.status === 1;
  const leftUSDT = binaryInfo ? parseFloat(formatTokenAmount(binaryInfo.leftBusiness, tokenDecimals)) : 0;
  const rightUSDT = binaryInfo ? parseFloat(formatTokenAmount(binaryInfo.rightBusiness, tokenDecimals)) : 0;
  const minLeg = Math.min(leftUSDT, rightUSDT);
  const currentRankIndex = STAR_RANKS.reduce((best, r, i) => (minLeg >= r.totalQual / 2 ? i : best), -1);
  const starRank = currentRankIndex >= 0 ? STAR_RANKS[currentRankIndex] : null;
  const remaining = incomeInfo.totalEarnings > incomeInfo.totalWithdrawn
    ? incomeInfo.totalEarnings - incomeInfo.totalWithdrawn : BigInt(0);

  const btcPoolFormatted = formatAmount(btcPoolBalance);
  const btcPoolNum = parseFloat(btcPoolFormatted.replace(/,/g, ''));
  const btcPoolPercent = Math.min((btcPoolNum / 50) * 100, 100);

  const copyUserId = () => {
    navigator.clipboard.writeText(userInfo.userId.toString());
    toast({ title: "Copied!", description: "User ID copied to clipboard." });
  };

  const shortenAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  return (
    <div className="p-4 sm:p-6 space-y-5 relative z-10">
      <div className="relative rounded-2xl overflow-hidden slide-in" data-testid="card-welcome-banner">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-600/8 via-transparent to-yellow-600/8" />
        <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-amber-500/8 to-transparent rounded-full blur-2xl" />
        <div className="earnings-card rounded-2xl overflow-hidden">
          <div className="relative p-6 pb-5">
            <div className="flex items-center gap-4 mb-1">
              <div className="relative">
                <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-amber-500 via-yellow-500 to-amber-400 flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/25">
                  <User className="h-7 w-7 text-white" />
                </div>
                {isActive && <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 border-2 border-[#0a0e1a] flex items-center justify-center"><Zap className="h-2.5 w-2.5 text-white" /></div>}
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-xl sm:text-2xl font-bold truncate" data-testid="text-dashboard-title" style={{ fontFamily: 'var(--font-display)' }}>
                  <span className="gradient-text">
                    {profileOnChain?.displayName || "M-Vault User"}
                  </span>
                </h1>
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  <Badge variant={isActive ? "default" : "destructive"} className="text-[10px]" data-testid="badge-status">
                    {statusLabel}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] border-yellow-600/30 bg-yellow-600/5" data-testid="badge-package">
                    {packageName}
                  </Badge>
                  {starRank && (
                    <Badge variant="outline" className="text-[10px] border-amber-500/40 bg-amber-500/10 text-amber-400 flex items-center gap-1" data-testid="badge-star-rank">
                      <Star className="h-2.5 w-2.5" /> {starRank.title} Achiever
                    </Badge>
                  )}
                </div>
              </div>
              <button
                onClick={() => setLocation("/profile")}
                className="text-[11px] text-yellow-300 flex items-center gap-1 shrink-0 px-3 py-1.5 rounded-lg bg-yellow-600/10 border border-yellow-600/20 transition-all hover:bg-yellow-600/15"
                data-testid="link-edit-profile"
              >
                Edit <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </div>

          <div className="border-t border-white/[0.06] bg-white/[0.02]">
            <div className="grid grid-cols-3 divide-x divide-white/[0.06]">
              <div className="p-4 cursor-pointer transition-colors hover:bg-white/[0.02]" onClick={copyUserId} data-testid="button-copy-user-id">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Shield className="h-3 w-3 text-yellow-300" />
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">User ID</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-bold gradient-text truncate" style={{ fontFamily: 'var(--font-display)' }}>{userInfo.userId.toString()}</p>
                  <Copy className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                </div>
              </div>

              <div className="p-4" data-testid="text-profile-wallet">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Wallet className="h-3 w-3 text-amber-300" />
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Wallet</p>
                </div>
                <p className="text-sm font-medium font-mono truncate text-amber-200/80">{shortenAddress(account)}</p>
              </div>

              <div className="p-4" data-testid="text-profile-package">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <DollarSign className="h-3 w-3 text-amber-400" />
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Invested</p>
                </div>
                <p className="text-sm font-bold gradient-text-gold" style={{ fontFamily: 'var(--font-display)' }}>${packagePrice.toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Wallet Balance" value={formatAmount(userInfo.walletBalance)} icon={DollarSign} iconColor="text-amber-400" accentGlow="bg-amber-500/15" delay="0.05s" />
        <StatCard label="Total Earnings" value={formatAmount(incomeInfo.totalEarnings)} icon={TrendingUp} iconColor="text-yellow-300" accentGlow="bg-yellow-600/15" delay="0.1s" />
        <StatCard label="Total Withdrawn" value={formatAmount(incomeInfo.totalWithdrawn)} icon={ArrowDownToLine} iconColor="text-amber-300" accentGlow="bg-amber-600/15" delay="0.15s" />
        <StatCard label="Direct Refs" value={Number(userInfo.directReferralCount).toString()} icon={Users} iconColor="text-emerald-400" accentGlow="bg-emerald-500/15" delay="0.2s" />
      </div>

      {starRank && (
        <div className="glass-card rounded-2xl p-5 slide-in relative overflow-hidden" style={{ animationDelay: '0.22s' }} data-testid="card-star-rank">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/8 via-transparent to-yellow-600/5 pointer-events-none" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
                <Trophy className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">M Plan Star Rank</p>
                <p className="text-xl font-bold text-amber-400 flex items-center gap-1.5" style={{ fontFamily: 'var(--font-display)' }}>
                  <Star className="h-4 w-4" /> {starRank.title} Achiever
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Allocation Reward</p>
              <p className="text-lg font-bold text-emerald-400" style={{ fontFamily: 'var(--font-display)' }}>
                ${starRank.allocation.toLocaleString()}
              </p>
              <p className="text-[10px] text-muted-foreground">USDT staking reward</p>
            </div>
          </div>
          <div className="relative mt-3 pt-3 border-t border-white/[0.06] flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">Left Team: <span className="text-amber-300 font-medium">${leftUSDT.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
            <span className="text-muted-foreground">Smaller Leg: <span className="text-amber-400 font-medium">${minLeg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
            <span className="text-muted-foreground">Right Team: <span className="text-amber-300 font-medium">${rightUSDT.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
          </div>
        </div>
      )}

      {incomeInfo.maxIncome > BigInt(0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 slide-in" style={{ animationDelay: '0.22s' }}>
          <div className="glass-card rounded-2xl p-5" data-testid="card-max-income-progress">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 rounded-lg bg-yellow-600/15 flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-yellow-300" />
              </div>
              <div>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Max Income Limit</p>
              </div>
            </div>
            <div className="w-full h-3 rounded-full bg-white/[0.06] overflow-hidden mb-2">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${Math.min(100, Number((incomeInfo.totalEarnings * BigInt(100)) / incomeInfo.maxIncome))}%`,
                  background: 'linear-gradient(90deg, #a07820, #d4af37, #f0c040)',
                }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Earned: <span className="text-yellow-300 font-medium">${formatAmount(incomeInfo.totalEarnings)}</span></span>
              <span className="text-muted-foreground">Max: <span className="text-foreground font-medium">${formatAmount(incomeInfo.maxIncome)}</span></span>
            </div>
            {(() => {
              const remainingMax = incomeInfo.maxIncome > incomeInfo.totalEarnings ? incomeInfo.maxIncome - incomeInfo.totalEarnings : BigInt(0);
              return (
                <p className="text-[10px] text-muted-foreground mt-1">Remaining: <span className="text-emerald-400 font-medium">${formatAmount(remainingMax)}</span></p>
              );
            })()}
          </div>

          <div className="glass-card rounded-2xl p-5" data-testid="card-daily-cap-progress">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
                <Timer className="h-4 w-4 text-amber-400" />
              </div>
              <div>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Daily Binary Cap</p>
              </div>
            </div>
            <div className="w-full h-3 rounded-full bg-white/[0.06] overflow-hidden mb-2">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${binaryInfo?.dailyCap > BigInt(0) ? Math.min(100, Number((binaryInfo.todayBinaryIncome * BigInt(100)) / binaryInfo.dailyCap)) : 0}%`,
                  background: 'linear-gradient(90deg, #f59e0b, #ef4444)',
                }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Today: <span className="text-amber-400 font-medium">${formatAmount(binaryInfo?.todayBinaryIncome ?? BigInt(0))}</span></span>
              <span className="text-muted-foreground">Cap: <span className="text-foreground font-medium">${formatAmount(binaryInfo?.dailyCap ?? BigInt(0))}</span></span>
            </div>
            {(() => {
              const cap = binaryInfo?.dailyCap ?? BigInt(0);
              const today = binaryInfo?.todayBinaryIncome ?? BigInt(0);
              const remainingCap = cap > today ? cap - today : BigInt(0);
              return (
                <p className="text-[10px] text-muted-foreground mt-1">Remaining: <span className="text-emerald-400 font-medium">${formatAmount(remainingCap)}</span></p>
              );
            })()}
          </div>
        </div>
      )}

      {hitMaxIncome && flushoutCountdown && (
        <div className="earnings-card rounded-2xl overflow-hidden slide-in" style={{ animationDelay: '0.22s' }} data-testid="card-flushout-countdown">
          <div className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-red-500/15 flex items-center justify-center">
                <AlertCircle className="h-5 w-5 text-red-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-red-400" style={{ fontFamily: 'var(--font-display)' }}>Max Income Reached</p>
                <p className="text-[10px] text-muted-foreground">Your incomes have been flushed. Reactivation window countdown:</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                <p className="text-2xl font-bold text-red-400" style={{ fontFamily: 'var(--font-display)' }}>{String(flushoutCountdown.hours).padStart(2, '0')}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Hours</p>
              </div>
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                <p className="text-2xl font-bold text-red-400" style={{ fontFamily: 'var(--font-display)' }}>{String(flushoutCountdown.minutes).padStart(2, '0')}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Minutes</p>
              </div>
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                <p className="text-2xl font-bold text-red-400" style={{ fontFamily: 'var(--font-display)' }}>{String(flushoutCountdown.seconds).padStart(2, '0')}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Seconds</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {(userInfo.status === 2 || userInfo.status === 0) && userInfo.userPackage > 0 && (
        <div className="earnings-card rounded-2xl overflow-hidden slide-in" style={{ animationDelay: '0.23s' }} data-testid="card-reactivation">
          <div className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${userInfo.status === 2 ? "bg-amber-500/15" : "bg-red-500/15"}`}>
                <AlertCircle className={`h-5 w-5 ${userInfo.status === 2 ? "text-amber-400" : "text-red-400"}`} />
              </div>
              <div>
                <p className={`text-sm font-bold ${userInfo.status === 2 ? "text-amber-400" : "text-red-400"}`} style={{ fontFamily: 'var(--font-display)' }}>
                  {userInfo.status === 2 ? "Grace Period" : "Account Inactive"}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {userInfo.status === 2
                    ? "Your account is in grace period. Reactivate or upgrade to restore full earning."
                    : "Your account is inactive. Reactivate to resume earning."}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Select Package</p>
                <div className="grid grid-cols-5 gap-2">
                  {[1, 2, 3, 4, 5].filter(p => p >= userInfo.userPackage).map((pkg) => (
                    <button
                      key={pkg}
                      onClick={() => setSelectedReactivatePkg(pkg)}
                      disabled={reactivating}
                      className={`p-2 rounded-lg text-center transition-all text-[11px] font-medium ${
                        selectedReactivatePkg === pkg
                          ? "bg-yellow-600/20 border border-yellow-600/40 text-yellow-300"
                          : "bg-white/[0.03] border border-white/[0.06] text-muted-foreground hover:bg-white/[0.06]"
                      }`}
                      data-testid={`button-reactivate-pkg-${pkg}`}
                    >
                      <div style={{ fontFamily: 'var(--font-display)' }}>{PACKAGE_NAMES[pkg]}</div>
                      <div className="text-[9px] mt-0.5">${PACKAGE_PRICES_USD[pkg]}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  onClick={async () => {
                    setReactivating(true);
                    try {
                      await approveToken(PACKAGE_PRICES_USD[selectedReactivatePkg].toString());
                      await reactivatePackage(selectedReactivatePkg);
                      toast({ title: selectedReactivatePkg > userInfo.userPackage ? "Upgraded & Reactivated" : "Reactivated", description: selectedReactivatePkg > userInfo.userPackage ? `Package upgraded to ${PACKAGE_NAMES[selectedReactivatePkg]}.` : "Your account has been reactivated." });
                    } catch (err: any) {
                      toast({ title: "Failed", description: err?.reason || err?.message || "Transaction failed.", variant: "destructive" });
                    } finally {
                      setReactivating(false);
                    }
                  }}
                  disabled={reactivating}
                  className="flex-1 glow-button text-white font-bold py-3 px-4 rounded-xl text-xs transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  data-testid="button-reactivate"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {reactivating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                  {reactivating ? "Processing..." : selectedReactivatePkg > userInfo.userPackage ? `Upgrade to ${PACKAGE_NAMES[selectedReactivatePkg]} - $${PACKAGE_PRICES_USD[selectedReactivatePkg]}` : `Reactivate - $${PACKAGE_PRICES_USD[selectedReactivatePkg]}`}
                </button>
                {userInfo.tempWalletBalance > BigInt(0) && (
                  <button
                    onClick={async () => {
                      setReactivating(true);
                      try {
                        await repurchase();
                        toast({ title: "Repurchased", description: "Account reactivated using internal balance." });
                      } catch (err: any) {
                        toast({ title: "Failed", description: err?.reason || err?.message || "Transaction failed.", variant: "destructive" });
                      } finally {
                        setReactivating(false);
                      }
                    }}
                    disabled={reactivating}
                    className="flex-1 py-2.5 px-4 rounded-xl text-xs font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2 bg-white/[0.05] border border-white/[0.1] text-muted-foreground hover:bg-white/[0.08]"
                    data-testid="button-repurchase"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    {reactivating ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    Repurchase (use internal balance: ${formatAmount(userInfo.tempWalletBalance)})
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 glass-card rounded-2xl p-6 slide-in" style={{ animationDelay: '0.25s' }} data-testid="card-package-info">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                <span className="gradient-text">Package & Earnings</span>
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">Your package and earnings overview</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Package Value</p>
              <p className="text-lg font-bold gradient-text" style={{ fontFamily: 'var(--font-display)' }}>${packagePrice.toLocaleString()}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Total Earned</p>
              <p className="text-lg font-bold gradient-text" style={{ fontFamily: 'var(--font-display)' }} data-testid="text-earned-amount">
                ${formatAmount(incomeInfo.totalEarnings)}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Total Withdrawn</p>
              <p className="text-lg font-bold text-emerald-400" style={{ fontFamily: 'var(--font-display)' }} data-testid="text-withdrawn-amount">
                ${formatAmount(incomeInfo.totalWithdrawn)}
              </p>
            </div>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-6 slide-in" style={{ animationDelay: '0.3s' }} data-testid="card-btc-pool-preview">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)' }}>
              <span className="gradient-text">BTC Pool</span>
            </h2>
            <div className="h-9 w-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
              <Coins className="h-4 w-4 text-amber-400" />
            </div>
          </div>
          <div className="flex flex-col items-center py-2">
            <div className="relative w-28 h-28 mb-3">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(168,85,247,0.1)" strokeWidth="8" />
                <circle
                  cx="50" cy="50" r="42" fill="none"
                  stroke="url(#poolGradient)" strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={`${btcPoolPercent * 2.64} ${264 - btcPoolPercent * 2.64}`}
                />
                <defs>
                  <linearGradient id="poolGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#f59e0b" />
                    <stop offset="50%" stopColor="#d4af37" />
                    <stop offset="100%" stopColor="#c9a227" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-bold gradient-text" style={{ fontFamily: 'var(--font-display)' }} data-testid="text-btc-pool-amount">${btcPoolFormatted}</span>
                <span className="text-[10px] text-muted-foreground">of $50</span>
              </div>
            </div>
            <button
              onClick={() => setLocation("/board")}
              className="text-xs text-yellow-300 flex items-center gap-1"
              data-testid="link-view-pool"
            >
              View Board Pool <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      {stakingPlan && stakingProgress ? (
        <div className="glass-card rounded-2xl p-6 slide-in" style={{ animationDelay: '0.35s' }} data-testid="card-staking-active">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-amber-500/20 via-yellow-500/20 to-amber-400/20 flex items-center justify-center">
                <Coins className="h-5 w-5 text-yellow-300" />
              </div>
              <div>
                <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                  <span className="gradient-text">M Coin Staking</span>
                </h2>
                <p className="text-xs text-muted-foreground">{stakingPlan.planMonths}-month plan active</p>
              </div>
            </div>
            <button
              onClick={() => setLocation("/staking")}
              className="text-[11px] text-yellow-300 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-yellow-600/10 border border-yellow-600/15"
              data-testid="link-staking-details"
            >
              View Details <ChevronRight className="h-3 w-3" />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
              <div className="flex items-center gap-1.5 mb-1">
                <CheckCircle className="h-3 w-3 text-emerald-400" />
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Earned</p>
              </div>
              <p className="text-sm font-bold text-emerald-400" style={{ fontFamily: 'var(--font-display)' }} data-testid="text-staking-earned">
                {Math.floor(stakingProgress.earned).toLocaleString()}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
              <div className="flex items-center gap-1.5 mb-1">
                <Coins className="h-3 w-3 text-amber-400" />
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total</p>
              </div>
              <p className="text-sm font-medium text-muted-foreground" data-testid="text-staking-max">
                {Math.floor(stakingProgress.total).toLocaleString()}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
              <div className="flex items-center gap-1.5 mb-1">
                <Timer className="h-3 w-3 text-yellow-300" />
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Daily</p>
              </div>
              <p className="text-sm font-bold text-yellow-300" style={{ fontFamily: 'var(--font-display)' }}>
                {parseFloat(stakingPlan.dailyTokens).toFixed(2)}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
              <div className="flex items-center gap-1.5 mb-1">
                <Clock className="h-3 w-3 text-amber-300" />
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Days Left</p>
              </div>
              <p className="text-sm font-bold text-amber-300" style={{ fontFamily: 'var(--font-display)' }}>
                {stakingProgress.daysLeft}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="glass-card rounded-2xl p-6 slide-in" style={{ animationDelay: '0.35s' }} data-testid="card-staking-select">
          <div className="flex items-center gap-3 mb-5">
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-amber-500/20 via-yellow-500/20 to-amber-400/20 flex items-center justify-center">
              <Coins className="h-5 w-5 text-yellow-300" />
            </div>
            <div>
              <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                <span className="gradient-text">Free M Coin Staking</span>
              </h2>
              <p className="text-xs text-muted-foreground">Earn M Coin daily with a 10-month staking plan</p>
            </div>
          </div>

          {stakingPlansComputed.length > 0 && (() => {
            const plan = stakingPlansComputed[0];
            return (
              <div className="p-4 rounded-xl border-2 border-yellow-600/40 bg-yellow-600/5 mb-4" data-testid="card-staking-plan-15">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-yellow-300" />
                    <span className="font-bold text-sm" style={{ fontFamily: 'var(--font-display)' }}>10 Months</span>
                  </div>
                  <Badge className="bg-yellow-600/20 text-yellow-300 border-yellow-600/30">10% Return</Badge>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Tokens</p>
                    <p className="text-sm font-bold gradient-text" style={{ fontFamily: 'var(--font-display)' }}>{Math.floor(plan.totalTokens).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Daily</p>
                    <p className="text-sm font-bold text-emerald-400" style={{ fontFamily: 'var(--font-display)' }}>{plan.dailyTokens.toFixed(2)}</p>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                  <CheckCircle className="h-3.5 w-3.5 text-yellow-300" />
                  <span className="text-[11px] text-yellow-300 font-medium">300 days · Token price $0.0036</span>
                </div>
              </div>
            );
          })()}

          {stakingResult && (
            <div className={`flex items-center gap-2.5 p-3 rounded-xl border mb-3 ${stakingResult.success ? "bg-emerald-500/10 border-emerald-500/20" : "bg-red-500/10 border-red-500/20"}`} data-testid="text-staking-activate-result">
              {stakingResult.success ? <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" /> : <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />}
              <p className={`text-sm font-medium ${stakingResult.success ? "text-emerald-400" : "text-red-400"}`}>{stakingResult.message}</p>
            </div>
          )}

          <button
            onClick={activateStaking}
            disabled={stakingActivating}
            className="w-full glow-button text-white font-bold py-3.5 px-6 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            data-testid="button-activate-staking"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {stakingActivating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />}
            {stakingActivating ? "Activating..." : "Activate Staking Plan"}
          </button>

          {stakingResult?.success && (
            <button
              onClick={() => setLocation("/staking")}
              className="w-full mt-3 glow-button text-white font-bold py-3.5 px-6 rounded-xl transition-all flex items-center justify-center gap-2"
              data-testid="button-view-staking"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              <Coins className="h-4 w-4" /> View Staking Details
            </button>
          )}
        </div>
      )}

    </div>
  );
}
