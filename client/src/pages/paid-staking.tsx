import { useState, useEffect, useCallback } from "react";
import { Coins, TrendingUp, DollarSign, Clock, CheckCircle2, AlertCircle, Loader2, ArrowDownUp, Flame, BarChart3, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

interface PaidStakingPageProps {
  account: string;
}

interface TokenPrice {
  buyPrice: string;
  sellPrice: string;
  listingPrice: string;
  liquidity: string;
  circulatingSupply: string;
  generatedVolume: string;
}

interface PaidStakingPlan {
  id: number;
  walletAddress: string;
  usdtInvested: string;
  buyPriceAtEntry: string;
  totalTokensMinted: string;
  userTokens: string;
  adminTokens: string;
  dailyRewardUsdt: string;
  totalRewardTokensClaimed: string;
  lastRewardClaimDate: string | null;
  startDate: string;
  endDate: string;
  isActive: boolean;
  unstaked: boolean;
  usdtReturnedOnUnstake: string | null;
}

interface MTokenBalance {
  mainBalance: string;
  rewardBalance: string;
  totalRewardEarned: string;
}

interface TokenTransaction {
  id: number;
  txType: string;
  tokenAmount: string;
  usdtAmount: string | null;
  priceAtTxn: string | null;
  note: string | null;
  createdAt: string;
}

interface OverrideIncome {
  id: number;
  fromWallet: string;
  amountUsdt: string;
  level: number;
  createdAt: string;
}

interface PageData {
  activePlan: PaidStakingPlan | null;
  allPlans: PaidStakingPlan[];
  mTokenBalance: MTokenBalance | null;
  usdtBalance: string;
  currentBuyPrice: string;
  currentSellPrice: string;
  tokenTransactions: TokenTransaction[];
  overrideIncome: OverrideIncome[];
  overrideTotalUsdt: string;
}

export default function PaidStakingPage({ account }: PaidStakingPageProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PageData | null>(null);
  const [price, setPrice] = useState<TokenPrice | null>(null);
  const [stakeAmount, setStakeAmount] = useState("");
  const [staking, setStaking] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimingUsdt, setClaimingUsdt] = useState(false);
  const [unstaking, setUnstaking] = useState(false);
  const [sellingRewards, setSellingRewards] = useState(false);
  const [sellRewardAmount, setSellRewardAmount] = useState("");
  const [sellingMain, setSellingMain] = useState(false);
  const [sellMainAmount, setSellMainAmount] = useState("");

  const loadData = useCallback(async () => {
    try {
      const [pageRes, priceRes] = await Promise.all([
        fetch(`/api/paidstaking/${account.toLowerCase()}`),
        fetch("/api/token/price"),
      ]);
      if (pageRes.ok) setData(await pageRes.json());
      if (priceRes.ok) setPrice(await priceRes.json());
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
      const res = await fetch("/api/paidstaking/stake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: account, usdtAmount: amt.toString() }),
      });
      const result = await res.json();
      if (!res.ok) { toast({ title: "Stake Failed", description: result.message, variant: "destructive" }); return; }
      toast({ title: "Staking Activated!", description: `${parseFloat(result.userTokens).toFixed(2)} M Tokens staked. 0.3% daily rewards start now.` });
      setStakeAmount("");
      await loadData();
    } catch { toast({ title: "Network Error", variant: "destructive" }); }
    finally { setStaking(false); }
  };

  const handleClaimRewards = async () => {
    setClaiming(true);
    try {
      const res = await fetch("/api/paidstaking/claim-rewards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: account }),
      });
      const result = await res.json();
      if (!res.ok) { toast({ title: "Claim Failed", description: result.message, variant: "destructive" }); return; }
      toast({ title: "Rewards Claimed!", description: `${parseFloat(result.rewardTokens).toFixed(4)} M Tokens added to your reward balance (${result.daysRewarded} day${result.daysRewarded > 1 ? "s" : ""}).` });
      await loadData();
    } catch { toast({ title: "Network Error", variant: "destructive" }); }
    finally { setClaiming(false); }
  };

  const handleClaimUsdt = async () => {
    setClaimingUsdt(true);
    try {
      const res = await fetch("/api/paidstaking/claim-usdt-rewards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: account }),
      });
      const result = await res.json();
      if (!res.ok) { toast({ title: "Claim Failed", description: result.message, variant: "destructive" }); return; }
      toast({ title: "USDT Claimed!", description: `$${parseFloat(result.usdtClaimed).toFixed(4)} USDT added to your balance (${result.daysRewarded} day${result.daysRewarded > 1 ? "s" : ""}).` });
      await loadData();
    } catch { toast({ title: "Network Error", variant: "destructive" }); }
    finally { setClaimingUsdt(false); }
  };

  const handleSellRewards = async () => {
    const amt = parseFloat(sellRewardAmount);
    if (isNaN(amt) || amt <= 0) {
      toast({ title: "Invalid Amount", description: "Enter a valid token amount.", variant: "destructive" });
      return;
    }
    setSellingRewards(true);
    try {
      const res = await fetch("/api/paidstaking/sell-rewards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: account, tokenAmount: amt.toString() }),
      });
      const result = await res.json();
      if (!res.ok) { toast({ title: "Sell Failed", description: result.message, variant: "destructive" }); return; }
      toast({ title: "Rewards Sold!", description: `${parseFloat(result.tokensBurned).toFixed(4)} tokens burned → $${parseFloat(result.usdtReceived).toFixed(4)} USDT credited.` });
      setSellRewardAmount("");
      await loadData();
    } catch { toast({ title: "Network Error", variant: "destructive" }); }
    finally { setSellingRewards(false); }
  };

  const handleSellMainTokens = async () => {
    const amt = parseFloat(sellMainAmount);
    if (isNaN(amt) || amt <= 0) {
      toast({ title: "Invalid Amount", description: "Enter a valid token amount.", variant: "destructive" });
      return;
    }
    setSellingMain(true);
    try {
      const res = await fetch("/api/paidstaking/sell-main-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: account, tokenAmount: amt.toString() }),
      });
      const result = await res.json();
      if (!res.ok) { toast({ title: "Sell Failed", description: result.message, variant: "destructive" }); return; }
      toast({ title: "Tokens Sold!", description: `${parseFloat(result.tokensBurned).toFixed(4)} M Tokens burned → $${parseFloat(result.usdtReceived).toFixed(4)} USDT credited to your balance.` });
      setSellMainAmount("");
      await loadData();
    } catch { toast({ title: "Network Error", variant: "destructive" }); }
    finally { setSellingMain(false); }
  };

  const handleUnstake = async () => {
    setUnstaking(true);
    try {
      const res = await fetch("/api/paidstaking/unstake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: account }),
      });
      const result = await res.json();
      if (!res.ok) { toast({ title: "Unstake Failed", description: result.message, variant: "destructive" }); return; }
      toast({ title: "Unstaked!", description: `$${parseFloat(result.usdtReceived).toFixed(2)} USDT credited to your account (tokens burned + 20% bonus).` });
      await loadData();
    } catch { toast({ title: "Network Error", variant: "destructive" }); }
    finally { setUnstaking(false); }
  };

  const buyPrice = parseFloat(data?.currentBuyPrice ?? price?.buyPrice ?? "0.0036");
  const sellPrice = parseFloat(data?.currentSellPrice ?? price?.sellPrice ?? "0.00324");
  const usdtBalance = parseFloat(data?.usdtBalance ?? "0");
  const rewardBalance = parseFloat(data?.mTokenBalance?.rewardBalance ?? "0");
  const mainBalance = parseFloat(data?.mTokenBalance?.mainBalance ?? "0");
  const plan = data?.activePlan ?? null;

  const previewTokens = stakeAmount && buyPrice > 0 ? {
    minted: (parseFloat(stakeAmount) / buyPrice * 0.9).toFixed(2),
    user: (parseFloat(stakeAmount) / buyPrice * 0.7).toFixed(2),
    admin: (parseFloat(stakeAmount) / buyPrice * 0.2).toFixed(2),
    dailyReward: (parseFloat(stakeAmount) * 0.003).toFixed(4),
  } : null;

  const daysLeft = plan ? Math.max(0, Math.ceil((new Date(plan.endDate).getTime() - Date.now()) / 86400000)) : 0;
  const daysElapsed = plan ? Math.floor((Date.now() - new Date(plan.startDate).getTime()) / 86400000) : 0;
  const progressPct = plan ? Math.min(100, (daysElapsed / 300) * 100) : 0;
  const canUnstake = plan && daysLeft === 0 && !plan.unstaked;

  const lastClaimDaysAgo = plan?.lastRewardClaimDate
    ? Math.floor((Date.now() - new Date(plan.lastRewardClaimDate).getTime()) / 86400000)
    : plan ? daysElapsed : 0;
  const pendingRewardUsdt = plan ? lastClaimDaysAgo * parseFloat(plan.dailyRewardUsdt) : 0;
  const pendingRewardTokens = pendingRewardUsdt > 0 && buyPrice > 0 ? (pendingRewardUsdt / buyPrice).toFixed(4) : "0";
  const canClaim = plan && lastClaimDaysAgo >= 1 && plan.isActive && !plan.unstaked;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-xl gradient-icon flex items-center justify-center pulse-glow">
            <Loader2 className="w-6 h-6 animate-spin text-yellow-300" />
          </div>
          <p className="text-sm text-muted-foreground">Loading paid staking...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-5">

      {/* Title */}
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }} data-testid="text-paidstaking-title">
          Paid M Token Staking
        </h1>
        <p className="text-xs text-muted-foreground">Deposit USDT · Earn 0.3% daily · Unstake after 10 months</p>
      </div>

      {/* Token Price Ticker */}
      <div className="glass-card rounded-2xl p-4" data-testid="card-token-price">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-yellow-300" />
            <span className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>M Token Price</span>
          </div>
          <button onClick={loadData} className="text-yellow-300 hover:text-yellow-200 transition-colors" data-testid="button-refresh-price">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Buy Price</p>
            <p className="text-sm font-bold text-emerald-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-buy-price">
              ${buyPrice.toFixed(6)}
            </p>
          </div>
          <div className="text-center p-3 rounded-xl bg-orange-500/5 border border-orange-500/10">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Sell Price</p>
            <p className="text-sm font-bold text-orange-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-sell-price">
              ${sellPrice.toFixed(6)}
            </p>
          </div>
          <div className="text-center p-3 rounded-xl bg-yellow-600/5 border border-yellow-600/10">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Listing</p>
            <p className="text-sm font-bold text-yellow-300" style={{ fontFamily: "var(--font-display)" }}>
              $0.003600
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.05]">
            <span className="text-[10px] text-muted-foreground">Liquidity</span>
            <span className="text-[11px] font-bold text-amber-300">${parseFloat(price?.liquidity ?? "0").toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          </div>
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.05]">
            <span className="text-[10px] text-muted-foreground">Circulating</span>
            <span className="text-[11px] font-bold text-amber-400">{parseFloat(price?.circulatingSupply ?? "0").toLocaleString(undefined, { maximumFractionDigits: 0 })} M</span>
          </div>
        </div>
      </div>

      {/* Balances */}
      <div className="grid grid-cols-3 gap-3">
        <div className="premium-card rounded-xl p-3 text-center" data-testid="card-usdt-balance">
          <DollarSign className="w-4 h-4 mx-auto text-emerald-400 mb-1" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">USDT Balance</p>
          <p className="text-sm font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }} data-testid="text-usdt-balance">
            ${usdtBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className="premium-card rounded-xl p-3 text-center" data-testid="card-main-tokens">
          <Coins className="w-4 h-4 mx-auto text-yellow-300 mb-1" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Staked Tokens</p>
          <p className="text-sm font-bold text-yellow-300" style={{ fontFamily: "var(--font-display)" }} data-testid="text-main-tokens">
            {mainBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className="premium-card rounded-xl p-3 text-center" data-testid="card-reward-tokens">
          <TrendingUp className="w-4 h-4 mx-auto text-amber-400 mb-1" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Rewards</p>
          <p className="text-sm font-bold text-amber-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-reward-tokens">
            {rewardBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })}
          </p>
        </div>
      </div>

      {/* Override / Matching Income Card */}
      {data && parseFloat(data.overrideTotalUsdt ?? "0") > 0 && (
        <div className="glass-card rounded-2xl p-5 space-y-3" data-testid="card-override-income">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}>Override / Matching Income</p>
                <p className="text-[10px] text-muted-foreground">Earned from downlines' paid staking profits</p>
              </div>
            </div>
            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">Auto-Credited</Badge>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/15">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Total Override Earned</p>
              <p className="text-lg font-bold text-amber-400" style={{ fontFamily: "var(--font-display)" }}>
                ${parseFloat(data.overrideTotalUsdt).toFixed(4)} USDT
              </p>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Records</p>
              <p className="text-lg font-bold text-yellow-300" style={{ fontFamily: "var(--font-display)" }}>
                {data.overrideIncome?.length ?? 0} entries
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-emerald-400">Already credited to your USDT balance</p>
              <p className="text-[10px] text-muted-foreground">Override income is automatically added to your virtual USDT balance the moment it's earned — no manual claim needed.</p>
            </div>
          </div>

          {data.overrideIncome && data.overrideIncome.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Recent Entries</p>
              {data.overrideIncome.slice(0, 5).map((row) => (
                <div key={row.id} className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]" data-testid={`row-override-income-${row.id}`}>
                  <div>
                    <p className="text-[10px] font-medium text-amber-300">Level {row.level} override</p>
                    <p className="text-[9px] text-muted-foreground">{row.fromWallet.slice(0, 8)}…{row.fromWallet.slice(-4)} · {new Date(row.createdAt).toLocaleDateString()}</p>
                  </div>
                  <span className="text-xs font-bold text-emerald-400">+${parseFloat(row.amountUsdt).toFixed(4)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Active Plan */}
      {plan && plan.isActive && (
        <div className="glass-card rounded-2xl p-5 space-y-4" data-testid="card-active-plan">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                <Coins className="h-4 w-4 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}>Active Stake</p>
                <p className="text-[10px] text-muted-foreground">${parseFloat(plan.usdtInvested).toLocaleString()} USDT · 10 months</p>
              </div>
            </div>
            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">Active</Badge>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Your Tokens</p>
              <p className="text-sm font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }}>{parseFloat(plan.userTokens).toLocaleString(undefined, { maximumFractionDigits: 2 })} M</p>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Daily Reward</p>
              <p className="text-sm font-bold text-amber-400" style={{ fontFamily: "var(--font-display)" }}>${parseFloat(plan.dailyRewardUsdt).toFixed(4)} USDT</p>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Entry Price</p>
              <p className="text-sm font-bold text-amber-300" style={{ fontFamily: "var(--font-display)" }}>${parseFloat(plan.buyPriceAtEntry).toFixed(6)}</p>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Days Left</p>
              <p className="text-sm font-bold text-yellow-300" style={{ fontFamily: "var(--font-display)" }}>{daysLeft} days</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{daysElapsed} / 300 days elapsed</span>
              <span>{progressPct.toFixed(1)}%</span>
            </div>
            <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-yellow-600 to-amber-400 transition-all duration-500" style={{ width: `${progressPct}%` }} />
            </div>
          </div>

          {/* Pending rewards */}
          {canClaim && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-amber-400">Pending Rewards</p>
                  <p className="text-[10px] text-muted-foreground">~{pendingRewardTokens} M tokens · ${(parseFloat(plan?.dailyRewardUsdt ?? "0") * lastClaimDaysAgo).toFixed(4)} USDT ({lastClaimDaysAgo} day{lastClaimDaysAgo > 1 ? "s" : ""})</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleClaimRewards}
                  disabled={claiming || claimingUsdt}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg glow-button text-white text-xs font-bold transition-all disabled:opacity-50"
                  data-testid="button-claim-rewards"
                >
                  {claiming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  Claim M Tokens
                </button>
                <button
                  onClick={handleClaimUsdt}
                  disabled={claiming || claimingUsdt}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold transition-all hover:bg-emerald-500/30 disabled:opacity-50"
                  data-testid="button-claim-usdt"
                >
                  {claimingUsdt ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <DollarSign className="w-3.5 h-3.5" />}
                  Withdraw USDT
                </button>
              </div>
            </div>
          )}

          {/* Unstake button */}
          {canUnstake && (
            <button
              onClick={handleUnstake}
              disabled={unstaking}
              className="w-full py-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 text-emerald-400 font-bold text-sm transition-all hover:bg-emerald-500/10 flex items-center justify-center gap-2 disabled:opacity-50"
              data-testid="button-unstake"
            >
              {unstaking ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDownUp className="w-4 h-4" />}
              Unstake & Withdraw
            </button>
          )}

          {!canUnstake && daysLeft > 0 && (
            <p className="text-[10px] text-center text-muted-foreground">Unstake available in {daysLeft} days · End date: {new Date(plan.endDate).toLocaleDateString()}</p>
          )}
        </div>
      )}

      {/* Sell Rewards */}
      {rewardBalance > 0 && (
        <div className="glass-card rounded-2xl p-5 space-y-4" data-testid="card-sell-rewards">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-orange-400" />
            <span className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>Sell Reward Tokens</span>
            <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/20 text-[10px]">Burns → Price Rises</Badge>
          </div>
          <p className="text-[10px] text-muted-foreground">Reward tokens are tracked as generated volume. Selling them burns from supply, increasing the M token price.</p>
          <div className="flex gap-2">
            <div className="flex-1 rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2.5">
              <p className="text-[10px] text-muted-foreground mb-1">Amount to Sell</p>
              <input
                type="number"
                value={sellRewardAmount}
                onChange={(e) => setSellRewardAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-transparent text-sm font-bold text-foreground outline-none placeholder:text-muted-foreground/30"
                data-testid="input-sell-reward-amount"
              />
            </div>
            <button
              onClick={() => setSellRewardAmount(rewardBalance.toFixed(8))}
              className="px-2 text-[10px] text-yellow-300 hover:text-yellow-200 font-medium uppercase tracking-wider shrink-0"
              data-testid="button-max-rewards"
            >
              MAX
            </button>
          </div>
          {sellRewardAmount && parseFloat(sellRewardAmount) > 0 && (
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.05] text-xs">
              <span className="text-muted-foreground">You receive</span>
              <span className="font-bold text-emerald-400">${(parseFloat(sellRewardAmount) * sellPrice).toFixed(4)} USDT</span>
            </div>
          )}
          <button
            onClick={handleSellRewards}
            disabled={sellingRewards || !sellRewardAmount || parseFloat(sellRewardAmount) <= 0 || parseFloat(sellRewardAmount) > rewardBalance}
            className="w-full glow-button text-white font-bold py-3 px-6 rounded-xl text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            data-testid="button-sell-rewards"
          >
            {sellingRewards ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flame className="w-4 h-4" />}
            Sell & Burn
          </button>
        </div>
      )}

      {/* Sell Main M-Tokens */}
      {mainBalance > 0 && (
        <div className="glass-card rounded-2xl p-5 space-y-4" data-testid="card-sell-main-tokens">
          <div className="flex items-center gap-2">
            <Coins className="w-4 h-4 text-yellow-300" />
            <span className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>Sell M Tokens</span>
            <Badge className="bg-yellow-600/10 text-yellow-300 border-yellow-600/20 text-[10px]">Main Balance</Badge>
          </div>
          <p className="text-[10px] text-muted-foreground">Convert your M Token main balance to USDT at the current sell price. Tokens are burned from supply.</p>

          <div className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.05] text-xs">
            <span className="text-muted-foreground">Available M Tokens</span>
            <span className="font-bold text-yellow-300">{mainBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })} M</span>
          </div>

          <div className="flex gap-2">
            <div className="flex-1 rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2.5">
              <p className="text-[10px] text-muted-foreground mb-1">Amount to Sell</p>
              <input
                type="number"
                value={sellMainAmount}
                onChange={(e) => setSellMainAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-transparent text-sm font-bold text-foreground outline-none placeholder:text-muted-foreground/30"
                data-testid="input-sell-main-amount"
              />
            </div>
            <button
              onClick={() => setSellMainAmount(mainBalance.toFixed(8))}
              className="px-2 text-[10px] text-yellow-300 hover:text-yellow-200 font-medium uppercase tracking-wider shrink-0"
              data-testid="button-max-main"
            >
              MAX
            </button>
          </div>

          {sellMainAmount && parseFloat(sellMainAmount) > 0 && (
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.05] text-xs">
              <span className="text-muted-foreground">You receive</span>
              <span className="font-bold text-emerald-400">${(parseFloat(sellMainAmount) * sellPrice).toFixed(4)} USDT</span>
            </div>
          )}

          <button
            onClick={handleSellMainTokens}
            disabled={sellingMain || !sellMainAmount || parseFloat(sellMainAmount) <= 0 || parseFloat(sellMainAmount) > mainBalance}
            className="w-full glow-button text-white font-bold py-3 px-6 rounded-xl text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            data-testid="button-sell-main-tokens"
          >
            {sellingMain ? <Loader2 className="w-4 h-4 animate-spin" /> : <Coins className="w-4 h-4" />}
            {sellingMain ? "Processing..." : "Sell M Tokens → USDT"}
          </button>
        </div>
      )}

      {/* New Stake Form — always visible so users can start additional plans */}
      <div className="glass-card rounded-2xl p-5 space-y-4" data-testid="card-new-stake">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-yellow-600/15 flex items-center justify-center">
              <Coins className="h-4 w-4 text-yellow-300" />
            </div>
            <div>
              <p className="text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}>Start Paid Staking</p>
              <p className="text-[10px] text-muted-foreground">0.3% daily rewards on your USDT investment for 10 months</p>
            </div>
          </div>

          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">USDT Amount to Stake</span>
              <button
                onClick={() => setStakeAmount(usdtBalance.toFixed(2))}
                className="text-[10px] text-yellow-300 hover:text-yellow-200 font-medium uppercase tracking-wider"
                data-testid="button-max-stake"
              >
                MAX
              </button>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={stakeAmount}
                onChange={(e) => setStakeAmount(e.target.value)}
                placeholder="0.00"
                className="flex-1 bg-transparent text-xl font-bold text-foreground outline-none placeholder:text-muted-foreground/30"
                style={{ fontFamily: "var(--font-display)" }}
                data-testid="input-stake-amount"
              />
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs font-bold text-emerald-400">USDT</span>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Balance: ${usdtBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
          </div>

          {previewTokens && (
            <div className="space-y-2 p-3 rounded-xl bg-yellow-600/5 border border-yellow-600/15">
              <p className="text-[10px] text-yellow-300 uppercase tracking-wider font-medium">Stake Preview</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Entry price</span><span className="font-medium">${buyPrice.toFixed(6)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Tokens minted</span><span className="font-bold text-yellow-300">{previewTokens.minted} M</span></div>
                <div className="flex justify-between col-span-2 pt-1 border-t border-white/[0.05]">
                  <span className="text-muted-foreground">Daily reward</span>
                  <span className="font-bold text-amber-400">${previewTokens.dailyReward} USDT value/day</span>
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
            {staking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Coins className="w-4 h-4" />}
            {staking ? "Processing..." : "Activate Paid Staking"}
          </button>

          {usdtBalance === 0 && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <p className="text-xs text-amber-400">You need a USDT balance to stake. Contact admin to deposit USDT.</p>
            </div>
          )}
      </div>

      {/* Override Income + Transaction History */}
      {data && (data.overrideIncome?.length > 0 || data.tokenTransactions?.length > 0) && (
        <div className="glass-card rounded-2xl p-5 space-y-3" data-testid="card-transactions">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-amber-300" />
            <p className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>Transaction History</p>
          </div>

          {data.overrideIncome?.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Override / Matching Income · Total: ${parseFloat(data.overrideTotalUsdt ?? "0").toFixed(4)} USDT</p>
              {data.overrideIncome.slice(0, 10).map((row) => (
                <div key={row.id} className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]" data-testid={`row-override-${row.id}`}>
                  <div>
                    <p className="text-[10px] font-medium text-emerald-400">Level {row.level} matching</p>
                    <p className="text-[9px] text-muted-foreground">{row.fromWallet.slice(0, 8)}…{row.fromWallet.slice(-4)} · {new Date(row.createdAt).toLocaleDateString()}</p>
                  </div>
                  <span className="text-xs font-bold text-emerald-400">+${parseFloat(row.amountUsdt).toFixed(4)}</span>
                </div>
              ))}
            </div>
          )}

          {data.tokenTransactions?.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-2">Token Transactions</p>
              {data.tokenTransactions.slice(0, 15).map((tx) => (
                <div key={tx.id} className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]" data-testid={`row-token-tx-${tx.id}`}>
                  <div>
                    <p className="text-[10px] font-medium capitalize text-yellow-200">{tx.txType.replace(/_/g, " ")}</p>
                    <p className="text-[9px] text-muted-foreground">{tx.note ?? ""} · {new Date(tx.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right">
                    {parseFloat(tx.tokenAmount) > 0 && <p className="text-[10px] font-bold text-amber-400">{parseFloat(tx.tokenAmount).toFixed(4)} M</p>}
                    {tx.usdtAmount && parseFloat(tx.usdtAmount) > 0 && <p className="text-[10px] font-bold text-emerald-400">${parseFloat(tx.usdtAmount).toFixed(4)}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="premium-card rounded-2xl p-5 space-y-3">
        <p className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>How Paid Staking Works</p>
        <div className="space-y-2.5">
          {[
            { icon: DollarSign, color: "text-emerald-400", title: "Deposit USDT", desc: "Admin credits USDT to your account. Use it to stake." },
            { icon: Coins, color: "text-yellow-300", title: "90% Tokens Minted", desc: "At current buy price — 70% staked for you, 20% to admin wallet." },
            { icon: TrendingUp, color: "text-amber-400", title: "0.3% Daily Rewards", desc: "Based on your original USDT investment. Claim any time, once per day." },
            { icon: Flame, color: "text-orange-400", title: "Sell Rewards → Price Rises", desc: "Reward tokens burn from supply when sold, raising M token price." },
            { icon: CheckCircle2, color: "text-amber-300", title: "Unstake After 10 Months", desc: "70% tokens sold at sell price + 20% of original USDT returned." },
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
