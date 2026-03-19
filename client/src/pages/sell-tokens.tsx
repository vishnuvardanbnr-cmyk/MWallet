import { useState, useEffect, useCallback } from "react";
import { Coins, DollarSign, ArrowDownUp, Loader2, TrendingDown, RefreshCw, Flame, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

interface SellTokensPageProps {
  account: string;
}

interface TokenPrice {
  buyPrice: string;
  sellPrice: string;
  listingPrice: string;
  liquidity: string;
  circulatingSupply: string;
}

interface MTokenBalance {
  mainBalance: string;
  rewardBalance: string;
  totalRewardEarned: string;
}

interface PageData {
  mTokenBalance: MTokenBalance | null;
  usdtBalance: string;
  currentSellPrice: string;
  currentBuyPrice: string;
}

interface TxResult {
  usdtReceived: string;
  tokensBurned: string;
  sellPriceUsed: string;
}

export default function SellTokensPage({ account }: SellTokensPageProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PageData | null>(null);
  const [price, setPrice] = useState<TokenPrice | null>(null);

  const [sellMainAmount, setSellMainAmount] = useState("");
  const [sellingMain, setSellingMain] = useState(false);
  const [mainResult, setMainResult] = useState<TxResult | null>(null);

  const [sellRewardAmount, setSellRewardAmount] = useState("");
  const [sellingRewards, setSellingRewards] = useState(false);
  const [rewardResult, setRewardResult] = useState<TxResult | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
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

  const sellPrice = parseFloat(data?.currentSellPrice ?? price?.sellPrice ?? "0");
  const buyPrice = parseFloat(data?.currentBuyPrice ?? price?.buyPrice ?? "0");
  const mainBalance = parseFloat(data?.mTokenBalance?.mainBalance ?? "0");
  const rewardBalance = parseFloat(data?.mTokenBalance?.rewardBalance ?? "0");

  const handleSellMain = async () => {
    const tokens = parseFloat(sellMainAmount);
    if (isNaN(tokens) || tokens <= 0) {
      toast({ title: "Invalid Amount", description: "Enter a valid token amount.", variant: "destructive" });
      return;
    }
    if (tokens > mainBalance) {
      toast({ title: "Insufficient Balance", description: "Amount exceeds your M-Token balance.", variant: "destructive" });
      return;
    }
    setSellingMain(true);
    setMainResult(null);
    try {
      const res = await fetch("/api/paidstaking/sell-main-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: account, tokenAmount: tokens.toString() }),
      });
      const result = await res.json();
      if (!res.ok) {
        toast({ title: "Sell Failed", description: result.message, variant: "destructive" });
        return;
      }
      setMainResult(result);
      setSellMainAmount("");
      toast({ title: "Sold!", description: `${parseFloat(result.tokensBurned).toFixed(4)} M-Tokens → $${parseFloat(result.usdtReceived).toFixed(4)} USDT` });
      await loadData();
    } catch {
      toast({ title: "Network Error", variant: "destructive" });
    } finally {
      setSellingMain(false);
    }
  };

  const handleSellRewards = async () => {
    const tokens = parseFloat(sellRewardAmount);
    if (isNaN(tokens) || tokens <= 0) {
      toast({ title: "Invalid Amount", description: "Enter a valid token amount.", variant: "destructive" });
      return;
    }
    if (tokens > rewardBalance) {
      toast({ title: "Insufficient Balance", description: "Amount exceeds your reward token balance.", variant: "destructive" });
      return;
    }
    setSellingRewards(true);
    setRewardResult(null);
    try {
      const res = await fetch("/api/paidstaking/sell-rewards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: account, tokenAmount: tokens.toString() }),
      });
      const result = await res.json();
      if (!res.ok) {
        toast({ title: "Sell Failed", description: result.message, variant: "destructive" });
        return;
      }
      setRewardResult(result);
      setSellRewardAmount("");
      toast({ title: "Sold!", description: `${parseFloat(result.tokensBurned).toFixed(4)} reward tokens → $${parseFloat(result.usdtReceived).toFixed(4)} USDT` });
      await loadData();
    } catch {
      toast({ title: "Network Error", variant: "destructive" });
    } finally {
      setSellingRewards(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-xl gradient-icon flex items-center justify-center pulse-glow">
            <Loader2 className="w-6 h-6 animate-spin text-yellow-300" />
          </div>
          <p className="text-sm text-muted-foreground">Loading token data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }} data-testid="text-sell-title">
          Sell M-Tokens
        </h1>
        <p className="text-sm text-muted-foreground">Convert M-Tokens back to USDT at the current sell price</p>
        <button
          onClick={loadData}
          className="inline-flex items-center gap-1.5 text-xs text-yellow-300 hover:text-yellow-200 transition-colors"
          data-testid="button-refresh"
        >
          <RefreshCw className="w-3 h-3" />
          Refresh
        </button>
      </div>

      {/* Price & Balance Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="premium-card rounded-xl p-3 text-center" data-testid="card-sell-price">
          <TrendingDown className="w-4 h-4 mx-auto text-emerald-400 mb-1" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Sell Price</p>
          <p className="text-sm font-bold text-emerald-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-sell-price">
            ${sellPrice.toFixed(6)}
          </p>
        </div>
        <div className="premium-card rounded-xl p-3 text-center" data-testid="card-buy-price">
          <ArrowDownUp className="w-4 h-4 mx-auto text-amber-400 mb-1" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Buy Price</p>
          <p className="text-sm font-bold text-amber-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-buy-price">
            ${buyPrice.toFixed(6)}
          </p>
        </div>
        <div className="premium-card rounded-xl p-3 text-center" data-testid="card-main-balance">
          <Coins className="w-4 h-4 mx-auto text-yellow-300 mb-1" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">M-Token Balance</p>
          <p className="text-sm font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }} data-testid="text-main-balance">
            {mainBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })}
          </p>
        </div>
        <div className="premium-card rounded-xl p-3 text-center" data-testid="card-reward-balance">
          <Flame className="w-4 h-4 mx-auto text-orange-400 mb-1" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Reward Tokens</p>
          <p className="text-sm font-bold text-orange-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-reward-balance">
            {rewardBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })}
          </p>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
        <Flame className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Selling M-Tokens <span className="text-foreground font-medium">burns them from the circulating supply</span>, which increases the token price. Sell price is 90% of the current buy price.
        </p>
      </div>

      {/* Sell Main M-Tokens */}
      <div className="glass-card rounded-2xl p-5 space-y-4" data-testid="card-sell-main">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-yellow-600/15 flex items-center justify-center">
            <Coins className="h-4 w-4 text-yellow-300" />
          </div>
          <div>
            <p className="text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}>Sell M-Tokens → USDT</p>
            <p className="text-[10px] text-muted-foreground">Your main M-Token wallet balance</p>
          </div>
          <Badge className="ml-auto bg-yellow-600/10 text-yellow-300 border-yellow-600/20 text-[10px]">
            {mainBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })} available
          </Badge>
        </div>

        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Amount to sell</span>
            <button
              onClick={() => setSellMainAmount(mainBalance.toFixed(4))}
              className="text-[10px] text-yellow-300 hover:text-yellow-200 font-medium uppercase tracking-wider"
              data-testid="button-max-main"
            >
              MAX
            </button>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={sellMainAmount}
              onChange={(e) => setSellMainAmount(e.target.value)}
              placeholder="0.0000"
              min={0}
              max={mainBalance}
              className="flex-1 bg-transparent text-xl font-bold text-foreground outline-none placeholder:text-muted-foreground/30"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid="input-sell-main-amount"
              disabled={sellingMain}
            />
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-yellow-600/10 border border-yellow-600/20">
              <Coins className="w-3.5 h-3.5 text-yellow-300" />
              <span className="text-sm font-bold text-yellow-300">M-Token</span>
            </div>
          </div>
          {parseFloat(sellMainAmount) > 0 && (
            <div className="flex items-center justify-between pt-1 border-t border-white/[0.04]">
              <span className="text-xs text-muted-foreground">You receive</span>
              <span className="text-sm font-bold text-emerald-400" data-testid="text-main-usdt-estimate">
                ≈ ${(parseFloat(sellMainAmount) * sellPrice).toFixed(4)} USDT
              </span>
            </div>
          )}
        </div>

        {mainResult && (
          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20" data-testid="result-main-sell">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <p className="text-xs text-emerald-400">
              Sold {parseFloat(mainResult.tokensBurned).toFixed(4)} M-Tokens → <span className="font-bold">${parseFloat(mainResult.usdtReceived).toFixed(4)} USDT</span> at ${parseFloat(mainResult.sellPriceUsed).toFixed(6)}/token
            </p>
          </div>
        )}

        <button
          onClick={handleSellMain}
          disabled={sellingMain || !sellMainAmount || parseFloat(sellMainAmount) <= 0 || parseFloat(sellMainAmount) > mainBalance || mainBalance === 0}
          className="w-full glow-button text-white font-bold py-3.5 px-6 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ fontFamily: "var(--font-display)" }}
          data-testid="button-sell-main"
        >
          {sellingMain ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDownUp className="w-4 h-4" />}
          {sellingMain ? "Processing..." : "Sell M-Tokens → USDT"}
        </button>
      </div>

      {/* Sell Reward Tokens */}
      <div className="glass-card rounded-2xl p-5 space-y-4" data-testid="card-sell-rewards">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-orange-500/15 flex items-center justify-center">
            <Flame className="h-4 w-4 text-orange-400" />
          </div>
          <div>
            <p className="text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}>Sell Reward Tokens → USDT</p>
            <p className="text-[10px] text-muted-foreground">Reward tokens earned from paid staking (generated volume)</p>
          </div>
          <Badge className="ml-auto bg-orange-500/10 text-orange-400 border-orange-500/20 text-[10px]">
            {rewardBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })} available
          </Badge>
        </div>

        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Amount to sell</span>
            <button
              onClick={() => setSellRewardAmount(rewardBalance.toFixed(4))}
              className="text-[10px] text-yellow-300 hover:text-yellow-200 font-medium uppercase tracking-wider"
              data-testid="button-max-rewards"
            >
              MAX
            </button>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={sellRewardAmount}
              onChange={(e) => setSellRewardAmount(e.target.value)}
              placeholder="0.0000"
              min={0}
              max={rewardBalance}
              className="flex-1 bg-transparent text-xl font-bold text-foreground outline-none placeholder:text-muted-foreground/30"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid="input-sell-reward-amount"
              disabled={sellingRewards}
            />
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20">
              <Flame className="w-3.5 h-3.5 text-orange-400" />
              <span className="text-sm font-bold text-orange-400">Reward</span>
            </div>
          </div>
          {parseFloat(sellRewardAmount) > 0 && (
            <div className="flex items-center justify-between pt-1 border-t border-white/[0.04]">
              <span className="text-xs text-muted-foreground">You receive</span>
              <span className="text-sm font-bold text-emerald-400" data-testid="text-reward-usdt-estimate">
                ≈ ${(parseFloat(sellRewardAmount) * sellPrice).toFixed(4)} USDT
              </span>
            </div>
          )}
        </div>

        {rewardResult && (
          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20" data-testid="result-reward-sell">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <p className="text-xs text-emerald-400">
              Sold {parseFloat(rewardResult.tokensBurned).toFixed(4)} reward tokens → <span className="font-bold">${parseFloat(rewardResult.usdtReceived).toFixed(4)} USDT</span> at ${parseFloat(rewardResult.sellPriceUsed).toFixed(6)}/token
            </p>
          </div>
        )}

        <button
          onClick={handleSellRewards}
          disabled={sellingRewards || !sellRewardAmount || parseFloat(sellRewardAmount) <= 0 || parseFloat(sellRewardAmount) > rewardBalance || rewardBalance === 0}
          className="w-full glow-button text-white font-bold py-3.5 px-6 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ fontFamily: "var(--font-display)" }}
          data-testid="button-sell-rewards"
        >
          {sellingRewards ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flame className="w-4 h-4" />}
          {sellingRewards ? "Processing..." : "Sell Reward Tokens → USDT"}
        </button>
      </div>

      {/* How it works */}
      <div className="premium-card rounded-2xl p-5 space-y-3">
        <h2 className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>How It Works</h2>
        <div className="space-y-3">
          {[
            { step: "1", title: "Choose your token type", desc: "Main M-Tokens (from M-Wallet) or Reward Tokens (earned from Paid Staking)" },
            { step: "2", title: "Tokens are burned", desc: "Sold tokens are permanently removed from the circulating supply, raising the price for everyone" },
            { step: "3", title: "USDT credited to balance", desc: "You receive USDT at the current sell price (90% of buy price) added to your platform balance" },
          ].map((item) => (
            <div key={item.step} className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-yellow-600/20 to-amber-400/10 border border-white/[0.08] flex items-center justify-center shrink-0">
                <span className="text-xs font-bold gradient-text">{item.step}</span>
              </div>
              <div>
                <p className="text-xs font-medium text-foreground">{item.title}</p>
                <p className="text-[10px] text-muted-foreground">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
