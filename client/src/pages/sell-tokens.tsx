import { useState } from "react";
import { Coins, DollarSign, ArrowDownUp, Loader2, TrendingDown, Flame, Info, Bitcoin, Shield, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { formatTokenAmount } from "@/lib/contract";
import type { UserInfo, MvtPrice } from "@/hooks/use-web3";

interface SellTokensPageProps {
  account: string;
  userInfo: UserInfo;
  mvtPrice: MvtPrice;
  formatAmount: (val: bigint) => string;
  sellMvt: (amount: string) => Promise<void>;
  approveToken: (amount?: string) => Promise<void>;
  fetchUserData: () => Promise<void>;
  contractMvtBalance: bigint;
}

export default function SellTokensPage({ account, userInfo, mvtPrice, formatAmount, sellMvt, approveToken, fetchUserData, contractMvtBalance }: SellTokensPageProps) {
  const { toast } = useToast();
  const [sellAmount, setSellAmount] = useState("");
  const [selling, setSelling] = useState(false);

  const mvtBalance    = parseFloat(formatTokenAmount(userInfo.mvtBalance, 18));
  const contractMvt   = parseFloat(formatTokenAmount(contractMvtBalance, 18));
  const sellPrice     = parseFloat(formatTokenAmount(mvtPrice.sellPrice, 18));
  const buyPrice      = parseFloat(formatTokenAmount(mvtPrice.buyPrice, 18));
  const incomeLimit   = parseFloat(formatTokenAmount(userInfo.incomeLimit, 18));

  // Sellable is capped by what the contract actually holds (real ERC20 tokens)
  const sellableMvt = Math.min(mvtBalance, contractMvt);
  const hasPendingMvt = mvtBalance > contractMvt + 0.0001;

  const sellAmt = parseFloat(sellAmount) || 0;

  function estimateSell(tokens: number) {
    if (tokens <= 0 || sellPrice <= 0) return { grossUsdt: 0, btcDeduction: 0, netUsdt: 0 };
    const grossUsdt    = tokens * sellPrice;
    const btcDeduction = grossUsdt * 0.1;
    const netUsdt      = grossUsdt * 0.9;
    return { grossUsdt, btcDeduction, netUsdt };
  }

  const preview = sellAmt > 0 ? estimateSell(sellAmt) : null;

  const handleSell = async () => {
    if (!sellAmount || sellAmt <= 0) return;
    if (sellAmt > mvtBalance) {
      toast({ title: "Exceeds balance", description: `You only have ${mvtBalance.toFixed(2)} MWT`, variant: "destructive" });
      return;
    }
    if (sellAmt > contractMvt && contractMvt > 0) {
      toast({ title: "Exceeds sellable amount", description: `Only ${sellableMvt.toFixed(2)} MWT is currently backed and sellable`, variant: "destructive" });
      return;
    }
    setSelling(true);
    try {
      await sellMvt(sellAmount);
      toast({
        title: "MWT Sold!",
        description: `${sellAmt.toFixed(2)} MWT sold. USDT credited to your balance.`,
      });
      setSellAmount("");
      await fetchUserData();
    } catch (err: any) {
      const msg = err?.reason || err?.shortMessage || err?.message || "Sell failed";
      toast({ title: "Sell Failed", description: msg.slice(0, 150), variant: "destructive" });
    } finally {
      setSelling(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-6">
      <div className="text-center space-y-1.5">
        <h1 className="text-2xl font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }} data-testid="text-sell-title">
          Sell MWT Tokens
        </h1>
        <p className="text-sm text-muted-foreground">Convert your virtual MWT balance to USDT</p>
      </div>

      {/* Price & Balance Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="premium-card rounded-xl p-3 text-center" data-testid="card-sell-price">
          <TrendingDown className="w-4 h-4 mx-auto text-emerald-400 mb-1" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Sell Price</p>
          <p className="text-sm font-bold text-emerald-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-sell-price">
            ${sellPrice > 0 ? sellPrice.toFixed(6) : "—"}
          </p>
        </div>
        <div className="premium-card rounded-xl p-3 text-center" data-testid="card-buy-price">
          <ArrowDownUp className="w-4 h-4 mx-auto text-amber-400 mb-1" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Buy Price</p>
          <p className="text-sm font-bold text-amber-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-buy-price">
            ${buyPrice > 0 ? buyPrice.toFixed(6) : "—"}
          </p>
        </div>
        <div className="premium-card rounded-xl p-3 text-center" data-testid="card-mvt-balance">
          <Coins className="w-4 h-4 mx-auto text-yellow-300 mb-1" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">MWT Balance</p>
          <p className="text-sm font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }} data-testid="text-mvt-balance">
            {mvtBalance.toFixed(2)}
          </p>
        </div>
        <div className="premium-card rounded-xl p-3 text-center" data-testid="card-sellable">
          <Shield className="w-4 h-4 mx-auto text-emerald-400 mb-1" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Sellable Now</p>
          <p className="text-sm font-bold text-emerald-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-sellable-balance">
            {sellableMvt.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Pending MWT warning */}
      {hasPendingMvt && (
        <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-orange-500/10 border border-orange-500/20">
          <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
          <div className="text-[11px] text-muted-foreground leading-relaxed space-y-1">
            <p><span className="text-orange-400 font-medium">Some MWT is pending:</span> {(mvtBalance - contractMvt).toFixed(2)} MWT from level/binary income is credited virtually but not yet backed by contract tokens.</p>
            <p>You can sell up to <span className="text-foreground font-medium">{sellableMvt.toFixed(2)} MWT</span> right now. Pending MWT becomes sellable as more users activate.</p>
          </div>
        </div>
      )}

      {/* How it works */}
      <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
        <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-[11px] text-muted-foreground leading-relaxed space-y-1">
          <p><span className="text-foreground font-medium">Sell routing:</span> 10% of sale value → your USDT pool.</p>
          <p>Remaining 90% fills your income limit first → any excess goes to rebirth pool.</p>
          <p>Income limit remaining: <span className="text-amber-400 font-medium">${incomeLimit.toFixed(2)}</span></p>
        </div>
      </div>

      {/* Sell Form */}
      <div className="glass-card rounded-2xl p-5 space-y-4" data-testid="card-sell-form">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-yellow-600/15 flex items-center justify-center">
            <Flame className="h-4 w-4 text-yellow-300" />
          </div>
          <div>
            <p className="text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}>Burn MWT → USDT</p>
            <p className="text-[10px] text-muted-foreground">Virtual MWT → USDT balance in contract → withdraw anytime</p>
          </div>
          <Badge className="ml-auto bg-yellow-600/10 text-yellow-300 border-yellow-600/20 text-[10px]">
            {sellableMvt.toFixed(2)} MWT available
          </Badge>
        </div>

        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2.5">
          <p className="text-[10px] text-muted-foreground mb-1">Amount to Sell (MWT)</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={sellAmount}
              onChange={(e) => setSellAmount(e.target.value)}
              placeholder="0.00"
              min={0}
              max={sellableMvt}
              className="flex-1 bg-transparent text-xl font-bold text-foreground outline-none placeholder:text-muted-foreground/30"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid="input-sell-amount"
              disabled={selling}
            />
            <button
              onClick={() => setSellAmount(sellableMvt > 0 ? sellableMvt.toFixed(4) : "0")}
              className="text-[10px] text-yellow-300 hover:text-yellow-200 font-semibold uppercase tracking-wider px-2 py-1 rounded-md bg-yellow-600/10 hover:bg-yellow-600/15 transition-colors shrink-0"
              data-testid="button-sell-max"
            >
              MAX
            </button>
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-yellow-600/10 border border-yellow-600/20 shrink-0">
              <Coins className="w-3.5 h-3.5 text-yellow-300" />
              <span className="text-xs font-bold text-yellow-300">MWT</span>
            </div>
          </div>
        </div>

        {/* Preview */}
        {preview && preview.grossUsdt > 0 && (
          <div className="space-y-2 p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Total USDT (at sell price)</span>
              <span className="font-medium">${preview.grossUsdt.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1 text-orange-400/80"><Bitcoin className="h-3 w-3" /> USDT pool (10%)</span>
              <span className="font-bold text-orange-400">−${preview.btcDeduction.toFixed(2)}</span>
            </div>
            <div className="h-px bg-white/[0.06]" />
            <div className="flex items-center justify-between text-xs">
              <span className="text-emerald-400 font-medium">You receive (USDT balance)</span>
              <span className="font-bold text-emerald-400">+${preview.netUsdt.toFixed(2)}</span>
            </div>
            <p className="text-[10px] text-muted-foreground/60">Contract routes 90% through your income limit automatically</p>
          </div>
        )}

        <button
          onClick={handleSell}
          disabled={selling || !sellAmount || sellAmt <= 0 || sellAmt > mvtBalance || sellableMvt === 0}
          className="w-full glow-button text-white font-bold py-3.5 px-6 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ fontFamily: "var(--font-display)" }}
          data-testid="button-sell-mvt"
        >
          {selling ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingDown className="w-4 h-4" />}
          {selling ? "Processing..." : "Sell MWT → USDT"}
        </button>

        {sellableMvt === 0 && (
          <p className="text-[10px] text-center text-muted-foreground">
            {mvtBalance > 0
              ? "Your MWT is pending — no backed tokens available to sell yet."
              : "No MWT balance. Earn MWT by referring users (level income) or from binary distribution."}
          </p>
        )}
      </div>

      {/* Steps */}
      <div className="premium-card rounded-2xl p-5 space-y-3">
        <h2 className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>How Selling Works</h2>
        <div className="space-y-3">
          {[
            { step: "1", title: "Burn MWT Tokens", desc: "Your virtual MWT balance is burned via the bonding curve using the contract's real token pool." },
            { step: "2", title: "10% to USDT Pool", desc: "10% of USDT proceeds go to your personal USDT pool — used exclusively to fund your board pool entries." },
            { step: "3", title: "90% to Your USDT Balance", desc: "Net USDT fills your $390 income limit → credited to USDT balance. Excess goes to rebirth pool." },
            { step: "4", title: "Withdraw Anytime", desc: "Pull your USDT balance to your wallet from the Wallet page whenever you're ready." },
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
