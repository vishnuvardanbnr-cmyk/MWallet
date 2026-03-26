import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Coins, TrendingUp, DollarSign, Clock, CheckCircle2, AlertCircle, Loader2, ArrowDownUp, Flame, BarChart3, RefreshCw, Lock, Unlock, ShoppingBag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";

interface PaidStakingPageProps {
  account: string;
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
  startDate: string;
  endDate: string;
  isActive: boolean;
  unstaked: boolean;
  usdtReturnedOnUnstake: string | null;
}

interface MTokenPurchaseBatch {
  id: number;
  walletAddress: string;
  tokenAmount: string;
  tokensRemaining: string;
  entryPrice: string;
  batchType: string;
  stakingPlanId: number | null;
  purchasedAt: string;
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

interface PageData {
  activePlan: PaidStakingPlan | null;
  allPlans: PaidStakingPlan[];
  mTokenBalance: MTokenBalance | null;
  usdtBalance: string;
  currentBuyPrice: string;
  currentSellPrice: string;
  tokenTransactions: TokenTransaction[];
  overrideTotalUsdt: string;
  freeBatches: MTokenPurchaseBatch[];
  stakedBatch: MTokenPurchaseBatch | null;
}

interface TokenPrice {
  buyPrice: string;
  sellPrice: string;
  liquidity: string;
  circulatingSupply: string;
}

export default function PaidStakingPage({ account }: PaidStakingPageProps) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [stakeAmount, setStakeAmount] = useState("");
  const [buyHoldAmount, setBuyHoldAmount] = useState("");
  const [sellStakedAmount, setSellStakedAmount] = useState("");
  const [sellMainAmount, setSellMainAmount] = useState("");

  const { data, isLoading, refetch } = useQuery<PageData>({
    queryKey: ["/api/paidstaking", account],
    queryFn: () => fetch(`/api/paidstaking/${account.toLowerCase()}`).then(r => r.json()),
  });

  const { data: price } = useQuery<TokenPrice>({
    queryKey: ["/api/token/price"],
  });

  const invalidate = () => { qc.invalidateQueries({ queryKey: ["/api/paidstaking", account] }); qc.invalidateQueries({ queryKey: ["/api/token/price"] }); };

  const stakeMut = useMutation({
    mutationFn: (usdtAmount: string) => apiRequest("POST", "/api/paidstaking/stake", { walletAddress: account, usdtAmount }),
    onSuccess: (r: any) => {
      toast({ title: "Staking Activated!", description: `${parseFloat(r.userTokens).toFixed(2)} M-Tokens locked for 10 months. 4x sell cap = $${parseFloat(r.capPrice).toFixed(6)}/token` });
      setStakeAmount("");
      invalidate();
    },
    onError: (e: any) => toast({ title: "Stake Failed", description: e.message, variant: "destructive" }),
  });

  const buyHoldMut = useMutation({
    mutationFn: (usdtAmount: string) => apiRequest("POST", "/api/paidstaking/buy-hold", { walletAddress: account, usdtAmount }),
    onSuccess: (r: any) => {
      toast({ title: "Tokens Purchased!", description: `${parseFloat(r.tokens).toFixed(2)} M-Tokens added to your balance. 2x sell cap = $${parseFloat(r.capPrice).toFixed(6)}/token` });
      setBuyHoldAmount("");
      invalidate();
    },
    onError: (e: any) => toast({ title: "Purchase Failed", description: e.message, variant: "destructive" }),
  });

  const sellStakedMut = useMutation({
    mutationFn: ({ planId, tokenAmount }: { planId: number; tokenAmount: string }) =>
      apiRequest("POST", "/api/paidstaking/sell-staked", { walletAddress: account, planId, tokenAmount }),
    onSuccess: (r: any) => {
      toast({ title: "Staked Tokens Sold!", description: `Received $${parseFloat(r.usdtReceived).toFixed(4)} USDT. Effective price: $${parseFloat(r.effectivePrice).toFixed(8)}/token.${parseFloat(r.companyRetains) > 0 ? ` Company retained: $${parseFloat(r.companyRetains).toFixed(4)} (above 4x cap).` : ""}` });
      setSellStakedAmount("");
      invalidate();
    },
    onError: (e: any) => toast({ title: "Sell Failed", description: e.message, variant: "destructive" }),
  });

  const sellMainMut = useMutation({
    mutationFn: (tokenAmount: string) => apiRequest("POST", "/api/paidstaking/sell-main-tokens", { walletAddress: account, tokenAmount }),
    onSuccess: (r: any) => {
      toast({ title: "Tokens Sold!", description: `${parseFloat(r.tokensBurned).toFixed(4)} M-Tokens burned → $${parseFloat(r.usdtReceived).toFixed(4)} USDT credited.${parseFloat(r.companyRetains) > 0 ? ` Company retained: $${parseFloat(r.companyRetains).toFixed(4)} (above 2x cap).` : ""}` });
      setSellMainAmount("");
      invalidate();
    },
    onError: (e: any) => toast({ title: "Sell Failed", description: e.message, variant: "destructive" }),
  });

  const buyPrice = parseFloat(data?.currentBuyPrice ?? price?.buyPrice ?? "0.0036");
  const sellPrice = parseFloat(data?.currentSellPrice ?? price?.sellPrice ?? "0.00324");
  const usdtBalance = parseFloat(data?.usdtBalance ?? "0");
  const mainBalance = parseFloat(data?.mTokenBalance?.mainBalance ?? "0");
  const plan = data?.activePlan ?? null;
  const stakedBatch = data?.stakedBatch ?? null;
  const freeBatches = data?.freeBatches ?? [];

  const daysLeft = plan ? Math.max(0, Math.ceil((new Date(plan.endDate).getTime() - Date.now()) / 86400000)) : 0;
  const daysElapsed = plan ? Math.floor((Date.now() - new Date(plan.startDate).getTime()) / 86400000) : 0;
  const progressPct = plan ? Math.min(100, (daysElapsed / 300) * 100) : 0;
  const canSellStaked = plan && daysLeft === 0 && stakedBatch && parseFloat(stakedBatch.tokensRemaining) > 0;
  const stakedTokensRemaining = stakedBatch ? parseFloat(stakedBatch.tokensRemaining) : 0;
  const capPriceStaked = stakedBatch ? parseFloat(stakedBatch.entryPrice) * 4 : 0;
  const effectiveSellPriceStaked = Math.min(sellPrice, capPriceStaked);

  const stakePreview = stakeAmount && buyPrice > 0 ? {
    user: (parseFloat(stakeAmount) / buyPrice * 0.7).toFixed(2),
    admin: (parseFloat(stakeAmount) / buyPrice * 0.2).toFixed(2),
    cap4x: (buyPrice * 4).toFixed(6),
    maxReturn: (parseFloat(stakeAmount) / buyPrice * 0.7 * buyPrice * 4).toFixed(2),
  } : null;

  const buyHoldPreview = buyHoldAmount && buyPrice > 0 ? {
    tokens: (parseFloat(buyHoldAmount) / buyPrice).toFixed(2),
    cap2x: (buyPrice * 2).toFixed(6),
    maxReturn: (parseFloat(buyHoldAmount) / buyPrice * buyPrice * 2).toFixed(2),
  } : null;

  if (isLoading) {
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
          M-Token Staking
        </h1>
        <p className="text-xs text-muted-foreground">Lock USDT · Get M-Tokens · Sell at up to 4x your entry price</p>
      </div>

      {/* Token Price Ticker */}
      <div className="glass-card rounded-2xl p-4" data-testid="card-token-price">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-yellow-300" />
            <span className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>M Token Price</span>
          </div>
          <button onClick={() => refetch()} className="text-yellow-300 hover:text-yellow-200 transition-colors" data-testid="button-refresh-price">
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
        <div className="premium-card rounded-xl p-3 text-center" data-testid="card-locked-tokens">
          <Lock className="w-4 h-4 mx-auto text-yellow-300 mb-1" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Locked (4x)</p>
          <p className="text-sm font-bold text-yellow-300" style={{ fontFamily: "var(--font-display)" }} data-testid="text-locked-tokens">
            {stakedTokensRemaining.toLocaleString(undefined, { maximumFractionDigits: 2 })} M
          </p>
        </div>
        <div className="premium-card rounded-xl p-3 text-center" data-testid="card-free-tokens">
          <Coins className="w-4 h-4 mx-auto text-amber-400 mb-1" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Held (2x)</p>
          <p className="text-sm font-bold text-amber-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-free-tokens">
            {mainBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })} M
          </p>
        </div>
      </div>

      {/* Active Staking Plan */}
      {plan && plan.isActive && (
        <div className="glass-card rounded-2xl p-5 space-y-4" data-testid="card-active-plan">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-xl bg-yellow-600/15 flex items-center justify-center">
                <Lock className="h-4 w-4 text-yellow-300" />
              </div>
              <div>
                <p className="text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}>Active Staking Plan</p>
                <p className="text-[10px] text-muted-foreground">${parseFloat(plan.usdtInvested).toLocaleString()} USDT staked · 10-month lock</p>
              </div>
            </div>
            <Badge className="bg-yellow-600/10 text-yellow-300 border-yellow-600/20 text-[10px]">Locked</Badge>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Locked Tokens</p>
              <p className="text-sm font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }} data-testid="text-locked-amount">
                {stakedTokensRemaining.toLocaleString(undefined, { maximumFractionDigits: 2 })} M
              </p>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Days Left</p>
              <p className="text-sm font-bold text-yellow-300" style={{ fontFamily: "var(--font-display)" }} data-testid="text-days-left">
                {daysLeft > 0 ? `${daysLeft} days` : "Unlocked!"}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Entry Price</p>
              <p className="text-sm font-bold text-amber-300" style={{ fontFamily: "var(--font-display)" }}>
                ${parseFloat(plan.buyPriceAtEntry).toFixed(6)}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/15">
              <p className="text-[10px] text-emerald-400/80 uppercase tracking-wider mb-1">4x Cap Price</p>
              <p className="text-sm font-bold text-emerald-400" style={{ fontFamily: "var(--font-display)" }}>
                ${capPriceStaked.toFixed(6)}
              </p>
            </div>
          </div>

          {/* Lock period progress */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{daysElapsed} / 300 days elapsed</span>
              <span>{progressPct.toFixed(1)}%</span>
            </div>
            <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-yellow-600 to-amber-400 transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* Potential return summary */}
          {stakedTokensRemaining > 0 && (
            <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/15 space-y-1.5">
              <p className="text-[10px] text-amber-400 uppercase tracking-wider font-medium">Potential Return at 4x Cap</p>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{stakedTokensRemaining.toFixed(2)} tokens × ${capPriceStaked.toFixed(6)}</span>
                <span className="font-bold text-amber-400">${(stakedTokensRemaining * capPriceStaked).toFixed(2)} USDT</span>
              </div>
              {sellPrice < capPriceStaked && (
                <div className="flex items-center justify-between text-xs pt-1 border-t border-white/[0.05]">
                  <span className="text-muted-foreground">At current sell price (${sellPrice.toFixed(6)})</span>
                  <span className="font-bold text-orange-400">${(stakedTokensRemaining * sellPrice).toFixed(2)} USDT</span>
                </div>
              )}
            </div>
          )}

          {/* Sell staked tokens — available after lock ends */}
          {canSellStaked && (
            <div className="space-y-3 pt-1">
              <div className="flex items-center gap-2">
                <Unlock className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-semibold text-emerald-400">Sell Staked Tokens</span>
                <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">Unlocked</Badge>
              </div>
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2.5">
                <p className="text-[10px] text-muted-foreground mb-1">Amount to Sell</p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={sellStakedAmount}
                    onChange={(e) => setSellStakedAmount(e.target.value)}
                    placeholder="0.00"
                    className="flex-1 bg-transparent text-sm font-bold text-foreground outline-none placeholder:text-muted-foreground/30"
                    data-testid="input-sell-staked-amount"
                  />
                  <button
                    onClick={() => setSellStakedAmount(stakedTokensRemaining.toFixed(8))}
                    className="text-[10px] text-yellow-300 hover:text-yellow-200 font-semibold uppercase tracking-wider px-2 py-1 rounded-md bg-yellow-600/10 hover:bg-yellow-600/15 transition-colors shrink-0"
                    data-testid="button-max-sell-staked"
                  >
                    MAX
                  </button>
                  <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-yellow-600/10 border border-yellow-600/20 shrink-0">
                    <span className="text-xs font-bold text-yellow-300">M</span>
                  </div>
                </div>
              </div>
              {sellStakedAmount && parseFloat(sellStakedAmount) > 0 && (
                <div className="space-y-1.5 p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Effective price (min of sell vs 4x cap)</span>
                    <span className="font-medium">${effectiveSellPriceStaked.toFixed(8)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">You receive</span>
                    <span className="font-bold text-emerald-400">${(parseFloat(sellStakedAmount) * effectiveSellPriceStaked).toFixed(4)} USDT</span>
                  </div>
                  {sellPrice > capPriceStaked && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-orange-400/80">Company retains (above 4x cap)</span>
                      <span className="font-bold text-orange-400">${(parseFloat(sellStakedAmount) * (sellPrice - capPriceStaked)).toFixed(4)} USDT</span>
                    </div>
                  )}
                </div>
              )}
              <button
                onClick={() => plan && sellStakedMut.mutate({ planId: plan.id, tokenAmount: sellStakedAmount })}
                disabled={sellStakedMut.isPending || !sellStakedAmount || parseFloat(sellStakedAmount) <= 0 || parseFloat(sellStakedAmount) > stakedTokensRemaining}
                className="w-full glow-button text-white font-bold py-3 px-6 rounded-xl text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                data-testid="button-sell-staked"
              >
                {sellStakedMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />}
                {sellStakedMut.isPending ? "Processing..." : "Sell Staked Tokens"}
              </button>
            </div>
          )}

          {daysLeft > 0 && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
              <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <p className="text-[10px] text-muted-foreground">
                Tokens unlock on {new Date(plan.endDate).toLocaleDateString()} ({daysLeft} days remaining). You can sell after the lock period ends.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Sell Held M-Tokens (mainBalance / free batches with 2x cap) */}
      {mainBalance > 0 && (
        <div className="glass-card rounded-2xl p-5 space-y-4" data-testid="card-sell-main-tokens">
          <div className="flex items-center gap-2">
            <Coins className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>Sell Held M-Tokens</span>
            <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[10px]">2x Cap</Badge>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Sell freely held M-Tokens (Buy &amp; Hold). FIFO order. Each batch capped at 2x its entry price — excess stays in company liquidity.
          </p>

          {freeBatches.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Your Batches (FIFO)</p>
              {freeBatches.slice(0, 5).map((b) => {
                const cap2x = parseFloat(b.entryPrice) * 2;
                const rem = parseFloat(b.tokensRemaining);
                return (
                  <div key={b.id} className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]" data-testid={`row-batch-${b.id}`}>
                    <div>
                      <p className="text-[10px] font-medium">Entry: ${parseFloat(b.entryPrice).toFixed(6)}</p>
                      <p className="text-[9px] text-muted-foreground">Cap: ${cap2x.toFixed(6)} · {new Date(b.purchasedAt).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-amber-400">{rem.toFixed(2)} M</p>
                      <p className="text-[9px] text-muted-foreground">≈ ${(rem * Math.min(sellPrice, cap2x)).toFixed(4)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2.5">
            <p className="text-[10px] text-muted-foreground mb-1">Amount to Sell</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={sellMainAmount}
                onChange={(e) => setSellMainAmount(e.target.value)}
                placeholder="0.00"
                className="flex-1 bg-transparent text-sm font-bold text-foreground outline-none placeholder:text-muted-foreground/30"
                data-testid="input-sell-main-amount"
              />
              <button
                onClick={() => setSellMainAmount(mainBalance.toFixed(8))}
                className="text-[10px] text-yellow-300 hover:text-yellow-200 font-semibold uppercase tracking-wider px-2 py-1 rounded-md bg-yellow-600/10 hover:bg-yellow-600/15 transition-colors shrink-0"
                data-testid="button-max-main"
              >
                MAX
              </button>
              <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 shrink-0">
                <span className="text-xs font-bold text-amber-400">M</span>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">Balance: {mainBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })} M</p>
          </div>

          <button
            onClick={() => sellMainMut.mutate(sellMainAmount)}
            disabled={sellMainMut.isPending || !sellMainAmount || parseFloat(sellMainAmount) <= 0 || parseFloat(sellMainAmount) > mainBalance}
            className="w-full glow-button text-white font-bold py-3 px-6 rounded-xl text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            data-testid="button-sell-main-tokens"
          >
            {sellMainMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flame className="w-4 h-4" />}
            {sellMainMut.isPending ? "Processing..." : "Sell & Burn → USDT"}
          </button>
        </div>
      )}

      {/* Start Paid Staking */}
      {!plan && (
        <div className="glass-card rounded-2xl p-5 space-y-4" data-testid="card-new-stake">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-yellow-600/15 flex items-center justify-center">
              <Lock className="h-4 w-4 text-yellow-300" />
            </div>
            <div>
              <p className="text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}>Start Paid Staking</p>
              <p className="text-[10px] text-muted-foreground">Lock USDT for 10 months · 70% of tokens go to you · sell at up to 4x entry price</p>
            </div>
          </div>

          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
            <p className="text-xs text-muted-foreground mb-2">USDT Amount to Stake</p>
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

          {stakePreview && (
            <div className="space-y-2 p-3 rounded-xl bg-yellow-600/5 border border-yellow-600/15">
              <p className="text-[10px] text-yellow-300 uppercase tracking-wider font-medium">Stake Preview</p>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Entry buy price</span>
                  <span className="font-medium">${buyPrice.toFixed(6)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tokens locked for you (70%)</span>
                  <span className="font-bold text-yellow-300">{stakePreview.user} M</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Admin tokens (20%)</span>
                  <span className="text-muted-foreground">{stakePreview.admin} M</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-white/[0.05]">
                  <span className="text-muted-foreground">4x sell cap price</span>
                  <span className="font-bold text-emerald-400">${stakePreview.cap4x}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Max return at 4x cap</span>
                  <span className="font-bold text-amber-400">${stakePreview.maxReturn} USDT</span>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={() => stakeMut.mutate(stakeAmount)}
            disabled={stakeMut.isPending || !stakeAmount || parseFloat(stakeAmount) <= 0 || parseFloat(stakeAmount) > usdtBalance}
            className="w-full glow-button text-white font-bold py-3.5 px-6 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ fontFamily: "var(--font-display)" }}
            data-testid="button-stake"
          >
            {stakeMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            {stakeMut.isPending ? "Processing..." : "Activate Paid Staking"}
          </button>

          {usdtBalance === 0 && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <p className="text-xs text-amber-400">You need a USDT balance to stake. Contact admin to deposit USDT.</p>
            </div>
          )}
        </div>
      )}

      {/* Buy & Hold (no lock, 2x cap) */}
      <div className="glass-card rounded-2xl p-5 space-y-4" data-testid="card-buy-hold">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
            <ShoppingBag className="h-4 w-4 text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}>Buy &amp; Hold M-Tokens</p>
            <p className="text-[10px] text-muted-foreground">No lock period · tokens go straight to your balance · sell at up to 2x entry price</p>
          </div>
        </div>

        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
          <p className="text-xs text-muted-foreground mb-2">USDT Amount</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={buyHoldAmount}
              onChange={(e) => setBuyHoldAmount(e.target.value)}
              placeholder="0.00"
              className="min-w-0 flex-1 bg-transparent text-xl font-bold text-foreground outline-none placeholder:text-muted-foreground/30"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid="input-buy-hold-amount"
            />
            <button
              onClick={() => setBuyHoldAmount(usdtBalance.toFixed(2))}
              className="text-[10px] text-yellow-300 hover:text-yellow-200 font-semibold uppercase tracking-wider px-2 py-1 rounded-md bg-yellow-600/10 hover:bg-yellow-600/15 transition-colors shrink-0"
              data-testid="button-max-buy-hold"
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

        {buyHoldPreview && (
          <div className="space-y-2 p-3 rounded-xl bg-amber-500/5 border border-amber-500/15">
            <p className="text-[10px] text-amber-400 uppercase tracking-wider font-medium">Buy Preview</p>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tokens you receive (100%)</span>
                <span className="font-bold text-amber-400">{buyHoldPreview.tokens} M</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">2x sell cap price</span>
                <span className="font-bold text-emerald-400">${buyHoldPreview.cap2x}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-white/[0.05]">
                <span className="text-muted-foreground">Max return at 2x cap</span>
                <span className="font-bold text-amber-300">${buyHoldPreview.maxReturn} USDT</span>
              </div>
            </div>
          </div>
        )}

        <button
          onClick={() => buyHoldMut.mutate(buyHoldAmount)}
          disabled={buyHoldMut.isPending || !buyHoldAmount || parseFloat(buyHoldAmount) <= 0 || parseFloat(buyHoldAmount) > usdtBalance}
          className="w-full py-3.5 px-6 rounded-xl border border-amber-500/30 bg-amber-500/5 text-amber-400 font-bold text-sm transition-all hover:bg-amber-500/10 flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ fontFamily: "var(--font-display)" }}
          data-testid="button-buy-hold"
        >
          {buyHoldMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingBag className="w-4 h-4" />}
          {buyHoldMut.isPending ? "Processing..." : "Buy & Hold M-Tokens"}
        </button>
      </div>

      {/* Transaction History */}
      {data && data.tokenTransactions?.length > 0 && (
        <div className="glass-card rounded-2xl p-5 space-y-3" data-testid="card-transactions">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-amber-300" />
            <p className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>Transaction History</p>
          </div>
          <div className="space-y-1.5">
            {data.tokenTransactions.slice(0, 15).map((tx) => (
              <div key={tx.id} className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]" data-testid={`row-token-tx-${tx.id}`}>
                <div>
                  <p className="text-[10px] font-medium capitalize text-yellow-200">{tx.txType.replace(/_/g, " ")}</p>
                  <p className="text-[9px] text-muted-foreground">{new Date(tx.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="text-right">
                  {parseFloat(tx.tokenAmount) > 0 && <p className="text-[10px] font-bold text-amber-400">{parseFloat(tx.tokenAmount).toFixed(4)} M</p>}
                  {tx.usdtAmount && parseFloat(tx.usdtAmount) > 0 && <p className="text-[10px] font-bold text-emerald-400">${parseFloat(tx.usdtAmount).toFixed(4)}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* How It Works */}
      <div className="premium-card rounded-2xl p-5 space-y-3">
        <p className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>How It Works</p>
        <div className="space-y-2.5">
          {[
            { icon: DollarSign, color: "text-emerald-400", title: "Admin Deposits USDT", desc: "Contact admin to have USDT credited to your account." },
            { icon: Lock, color: "text-yellow-300", title: "Stake: 10-Month Lock, 4x Cap", desc: "70% of tokens are locked in your plan for 10 months. After unlock, sell at up to 4x your entry price. Excess above 4x stays in company liquidity." },
            { icon: ShoppingBag, color: "text-amber-400", title: "Buy & Hold: No Lock, 2x Cap", desc: "100% of tokens go directly to your balance immediately. Sell at any time at up to 2x your entry price." },
            { icon: TrendingUp, color: "text-orange-400", title: "Price Appreciation Only", desc: "No daily rewards. M-Token price grows as more USDT enters the liquidity pool from staking and buys." },
            { icon: Flame, color: "text-red-400", title: "Burns Reduce Supply", desc: "Every token sold is burned from circulating supply, increasing the price per remaining token." },
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
