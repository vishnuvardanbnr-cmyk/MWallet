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

interface PageData {
  activePlan: PaidStakingPlan | null;
  allPlans: PaidStakingPlan[];
  mTokenBalance: MTokenBalance | null;
  usdtBalance: string;
  currentBuyPrice: string;
  currentSellPrice: string;
}

export default function PaidStakingPage({ account }: PaidStakingPageProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PageData | null>(null);
  const [price, setPrice] = useState<TokenPrice | null>(null);
  const [stakeAmount, setStakeAmount] = useState("");
  const [staking, setStaking] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [unstaking, setUnstaking] = useState(false);
  const [sellingRewards, setSellingRewards] = useState(false);
  const [sellRewardAmount, setSellRewardAmount] = useState("");

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

  const buyPrice = parseFloat(data?.currentBuyPrice ?? price?.buyPrice ?? "0.036");
  const sellPrice = parseFloat(data?.currentSellPrice ?? price?.sellPrice ?? "0.0324");
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
            <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
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
            <BarChart3 className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>M Token Price</span>
          </div>
          <button onClick={loadData} className="text-purple-400 hover:text-purple-300 transition-colors" data-testid="button-refresh-price">
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
          <div className="text-center p-3 rounded-xl bg-purple-500/5 border border-purple-500/10">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Listing</p>
            <p className="text-sm font-bold text-purple-400" style={{ fontFamily: "var(--font-display)" }}>
              $0.036000
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.05]">
            <span className="text-[10px] text-muted-foreground">Liquidity</span>
            <span className="text-[11px] font-bold text-cyan-400">${parseFloat(price?.liquidity ?? "0").toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
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
          <Coins className="w-4 h-4 mx-auto text-purple-400 mb-1" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Staked Tokens</p>
          <p className="text-sm font-bold text-purple-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-main-tokens">
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
              <p className="text-sm font-bold text-cyan-400" style={{ fontFamily: "var(--font-display)" }}>${parseFloat(plan.buyPriceAtEntry).toFixed(6)}</p>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Days Left</p>
              <p className="text-sm font-bold text-purple-400" style={{ fontFamily: "var(--font-display)" }}>{daysLeft} days</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{daysElapsed} / 300 days elapsed</span>
              <span>{progressPct.toFixed(1)}%</span>
            </div>
            <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-cyan-500 transition-all duration-500" style={{ width: `${progressPct}%` }} />
            </div>
          </div>

          {/* Pending rewards */}
          {canClaim && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <div>
                <p className="text-xs font-medium text-amber-400">Pending Rewards</p>
                <p className="text-[10px] text-muted-foreground">~{pendingRewardTokens} M tokens ({lastClaimDaysAgo} day{lastClaimDaysAgo > 1 ? "s" : ""})</p>
              </div>
              <button
                onClick={handleClaimRewards}
                disabled={claiming}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg glow-button text-white text-xs font-bold transition-all disabled:opacity-50"
                data-testid="button-claim-rewards"
              >
                {claiming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Claim
              </button>
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
              className="px-2 text-[10px] text-purple-400 hover:text-purple-300 font-medium uppercase tracking-wider shrink-0"
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

      {/* New Stake Form (only if no active plan) */}
      {!plan && (
        <div className="glass-card rounded-2xl p-5 space-y-4" data-testid="card-new-stake">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-purple-500/15 flex items-center justify-center">
              <Coins className="h-4 w-4 text-purple-400" />
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
                className="text-[10px] text-purple-400 hover:text-purple-300 font-medium uppercase tracking-wider"
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
            <div className="space-y-2 p-3 rounded-xl bg-purple-500/5 border border-purple-500/15">
              <p className="text-[10px] text-purple-400 uppercase tracking-wider font-medium">Stake Preview</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Entry price</span><span className="font-medium">${buyPrice.toFixed(6)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Tokens minted</span><span className="font-bold text-purple-400">{previewTokens.minted} M</span></div>
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
      )}

      {/* How It Works */}
      <div className="premium-card rounded-2xl p-5 space-y-3">
        <p className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>How Paid Staking Works</p>
        <div className="space-y-2.5">
          {[
            { icon: DollarSign, color: "text-emerald-400", title: "Deposit USDT", desc: "Admin credits USDT to your account. Use it to stake." },
            { icon: Coins, color: "text-purple-400", title: "90% Tokens Minted", desc: "At current buy price — 70% staked for you, 20% to admin wallet." },
            { icon: TrendingUp, color: "text-amber-400", title: "0.3% Daily Rewards", desc: "Based on your original USDT investment. Claim any time, once per day." },
            { icon: Flame, color: "text-orange-400", title: "Sell Rewards → Price Rises", desc: "Reward tokens burn from supply when sold, raising M token price." },
            { icon: CheckCircle2, color: "text-cyan-400", title: "Unstake After 10 Months", desc: "70% tokens sold at sell price + 20% of original USDT returned." },
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
