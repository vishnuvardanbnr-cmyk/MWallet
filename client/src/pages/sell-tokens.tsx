import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Coins, DollarSign, ArrowDownUp, Loader2, TrendingDown, RefreshCw, Flame, CheckCircle2, ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";

interface SellTokensPageProps {
  account: string;
}

interface MTokenPurchaseBatch {
  id: number;
  tokenAmount: string;
  tokensRemaining: string;
  entryPrice: string;
  batchType: string;
  purchasedAt: string;
}

interface PageData {
  mTokenBalance: { mainBalance: string; rewardBalance: string } | null;
  usdtBalance: string;
  currentSellPrice: string;
  currentBuyPrice: string;
  freeBatches: MTokenPurchaseBatch[];
}

interface TokenPrice {
  buyPrice: string;
  sellPrice: string;
  liquidity: string;
  circulatingSupply: string;
}

export default function SellTokensPage({ account }: SellTokensPageProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [sellMainAmount, setSellMainAmount] = useState("");

  const { data, isLoading, refetch } = useQuery<PageData>({
    queryKey: ["/api/paidstaking", account],
    queryFn: () => fetch(`/api/paidstaking/${account.toLowerCase()}`).then(r => r.json()),
  });

  const { data: price } = useQuery<TokenPrice>({
    queryKey: ["/api/token/price"],
  });

  const sellMut = useMutation({
    mutationFn: (tokenAmount: string) =>
      apiRequest("POST", "/api/paidstaking/sell-main-tokens", { walletAddress: account, tokenAmount }),
    onSuccess: (r: any) => {
      const retained = parseFloat(r.companyRetains ?? "0");
      toast({
        title: "Tokens Sold!",
        description: `${parseFloat(r.tokensBurned).toFixed(4)} M-Tokens burned → $${parseFloat(r.usdtReceived).toFixed(4)} USDT credited.${retained > 0.0001 ? ` Company retained $${retained.toFixed(4)} (above 2x cap).` : ""}`,
      });
      setSellMainAmount("");
      qc.invalidateQueries({ queryKey: ["/api/paidstaking", account] });
      qc.invalidateQueries({ queryKey: ["/api/token/price"] });
    },
    onError: (e: any) => toast({ title: "Sell Failed", description: e.message, variant: "destructive" }),
  });

  const sellPrice = parseFloat(data?.currentSellPrice ?? price?.sellPrice ?? "0");
  const buyPrice = parseFloat(data?.currentBuyPrice ?? price?.buyPrice ?? "0");
  const mainBalance = parseFloat(data?.mTokenBalance?.mainBalance ?? "0");
  const freeBatches = data?.freeBatches ?? [];

  // Calculate effective receive for a given sell amount using FIFO + 2x cap
  function estimateSell(tokens: number): { usdtOut: number; companyRetains: number } {
    let remaining = tokens;
    let usdtOut = 0;
    let companyRetains = 0;
    for (const b of freeBatches) {
      if (remaining <= 0) break;
      const cap2x = parseFloat(b.entryPrice) * 2;
      const eff = Math.min(sellPrice, cap2x);
      const fromThis = Math.min(remaining, parseFloat(b.tokensRemaining));
      usdtOut += fromThis * eff;
      companyRetains += fromThis * Math.max(0, sellPrice - cap2x);
      remaining -= fromThis;
    }
    // Any remaining beyond tracked batches: sell at current price
    if (remaining > 0) {
      usdtOut += remaining * sellPrice;
    }
    return { usdtOut, companyRetains };
  }

  const sellAmt = parseFloat(sellMainAmount) || 0;
  const preview = sellAmt > 0 ? estimateSell(sellAmt) : null;

  if (isLoading) {
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
        <p className="text-sm text-muted-foreground">Held tokens sell at up to 2x your entry price per batch (FIFO)</p>
        <button
          onClick={() => refetch()}
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
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Held Balance</p>
          <p className="text-sm font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }} data-testid="text-main-balance">
            {mainBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })} M
          </p>
        </div>
        <div className="premium-card rounded-xl p-3 text-center" data-testid="card-batches-count">
          <DollarSign className="w-4 h-4 mx-auto text-orange-400 mb-1" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Batches</p>
          <p className="text-sm font-bold text-orange-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-batches-count">
            {freeBatches.length}
          </p>
        </div>
      </div>

      {/* 2x cap info banner */}
      <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
        <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Each batch of held tokens can only be sold at up to <span className="text-foreground font-medium">2× its purchase price</span>. Amounts above the 2x cap stay in the company liquidity pool. Tokens are sold <span className="text-foreground font-medium">FIFO</span> (oldest first).
        </p>
      </div>

      {/* Purchase Batches FIFO list */}
      {freeBatches.length > 0 && (
        <div className="glass-card rounded-2xl p-4 space-y-3" data-testid="card-batches">
          <div className="flex items-center gap-2">
            <Coins className="w-4 h-4 text-amber-300" />
            <p className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>Your Purchase Batches</p>
            <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[10px]">FIFO Order</Badge>
          </div>
          <div className="space-y-2">
            {freeBatches.map((b, i) => {
              const cap2x = parseFloat(b.entryPrice) * 2;
              const remaining = parseFloat(b.tokensRemaining);
              const eff = Math.min(sellPrice, cap2x);
              const maxValue = remaining * cap2x;
              const curValue = remaining * eff;
              return (
                <div key={b.id} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]" data-testid={`row-batch-${b.id}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-md bg-amber-500/10 flex items-center justify-center">
                        <span className="text-[10px] font-bold text-amber-400">{i + 1}</span>
                      </div>
                      <div>
                        <p className="text-xs font-medium">Entry: ${parseFloat(b.entryPrice).toFixed(6)}</p>
                        <p className="text-[9px] text-muted-foreground">{new Date(b.purchasedAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-amber-400">{remaining.toFixed(2)} M remaining</p>
                      <p className="text-[9px] text-emerald-400">≈ ${curValue.toFixed(4)} USDT now</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/[0.04]">
                    <div className="text-center">
                      <p className="text-[9px] text-muted-foreground mb-0.5">2x Cap</p>
                      <p className="text-[10px] font-bold text-emerald-400">${cap2x.toFixed(6)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] text-muted-foreground mb-0.5">Sell Price</p>
                      <p className="text-[10px] font-bold text-orange-400">${sellPrice.toFixed(6)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] text-muted-foreground mb-0.5">Max Value</p>
                      <p className="text-[10px] font-bold text-amber-300">${maxValue.toFixed(4)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sell Form */}
      <div className="glass-card rounded-2xl p-5 space-y-4" data-testid="card-sell-main">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-yellow-600/15 flex items-center justify-center">
            <Flame className="h-4 w-4 text-yellow-300" />
          </div>
          <div>
            <p className="text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}>Sell M-Tokens → USDT</p>
            <p className="text-[10px] text-muted-foreground">FIFO · 2x cap per batch · Burns from circulating supply</p>
          </div>
          <Badge className="ml-auto bg-yellow-600/10 text-yellow-300 border-yellow-600/20 text-[10px]">
            {mainBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })} M
          </Badge>
        </div>

        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2.5">
          <p className="text-[10px] text-muted-foreground mb-1">Amount to Sell</p>
          <div className="flex items-center gap-2">
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
              disabled={sellMut.isPending}
            />
            <button
              onClick={() => setSellMainAmount(mainBalance.toFixed(4))}
              className="text-[10px] text-yellow-300 hover:text-yellow-200 font-semibold uppercase tracking-wider px-2 py-1 rounded-md bg-yellow-600/10 hover:bg-yellow-600/15 transition-colors shrink-0"
              data-testid="button-max-main"
            >
              MAX
            </button>
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-yellow-600/10 border border-yellow-600/20 shrink-0">
              <Coins className="w-3.5 h-3.5 text-yellow-300" />
              <span className="text-xs font-bold text-yellow-300">M</span>
            </div>
          </div>
        </div>

        {preview && preview.usdtOut > 0 && (
          <div className="space-y-1.5 p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">You receive</span>
              <span className="font-bold text-emerald-400" data-testid="text-main-usdt-estimate">
                ${preview.usdtOut.toFixed(4)} USDT
              </span>
            </div>
            {preview.companyRetains > 0.0001 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-orange-400/80">Company retains (above 2x cap)</span>
                <span className="font-bold text-orange-400">${preview.companyRetains.toFixed(4)} USDT</span>
              </div>
            )}
          </div>
        )}

        <button
          onClick={() => sellMut.mutate(sellMainAmount)}
          disabled={sellMut.isPending || !sellMainAmount || sellAmt <= 0 || sellAmt > mainBalance || mainBalance === 0}
          className="w-full glow-button text-white font-bold py-3.5 px-6 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ fontFamily: "var(--font-display)" }}
          data-testid="button-sell-main"
        >
          {sellMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDownUp className="w-4 h-4" />}
          {sellMut.isPending ? "Processing..." : "Sell M-Tokens → USDT"}
        </button>

        {mainBalance === 0 && (
          <p className="text-[10px] text-center text-muted-foreground">
            No held M-Tokens. Purchase via Buy &amp; Hold on the Paid Staking page.
          </p>
        )}
      </div>

      {/* How it works */}
      <div className="premium-card rounded-2xl p-5 space-y-3">
        <h2 className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>How Selling Works</h2>
        <div className="space-y-3">
          {[
            { step: "1", title: "2x Cap Per Batch", desc: "Each purchase batch can only be sold at up to 2× its entry price. Any market price above 2x stays in company liquidity." },
            { step: "2", title: "FIFO Order", desc: "Oldest batches are sold first. Each batch has its own entry price and 2x sell cap." },
            { step: "3", title: "Tokens Are Burned", desc: "Every sold token is permanently removed from circulating supply, increasing the price for all remaining holders." },
            { step: "4", title: "USDT Credited Instantly", desc: "You receive USDT directly to your platform balance, redeemable at any time." },
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
