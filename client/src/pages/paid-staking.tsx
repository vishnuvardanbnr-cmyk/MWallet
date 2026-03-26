import { useState, useEffect, useCallback } from "react";
import {
  Coins, Lock, Unlock, DollarSign, Loader2, TrendingUp,
  Info, CheckCircle, AlertCircle, RefreshCw, Zap, Shield,
  ArrowRight, Clock, Ban, ChevronDown, ChevronUp
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { getMvaultContract, getTokenContract, MVAULT_CONTRACT_ADDRESS, formatTokenAmount } from "@/lib/contract";
import { ethers } from "ethers";
import { useQuery } from "@tanstack/react-query";

interface TokenPrice { buyPrice: string; sellPrice: string; }

interface StakePosition {
  index: number;
  mvtAmount: bigint;
  usdtInvested: bigint;
  stakedAt: number;
  lockedSince: number; // 0 = flexible; >0 = timestamp lock started
}

interface Props {
  account: string;
  stakeUsdt?: (usdtAmount: string, isLocked: boolean) => Promise<void>;
  unstakePosition?: (stakeIndex: number) => Promise<void>;
  convertStakeToLocked?: (stakeIndex: number) => Promise<void>;
  getActiveStakesOnChain?: (user: string) => Promise<StakePosition[]>;
  approveToken?: () => Promise<void>;
  tokenDecimals?: number;
}

const LEVEL_RATES      = [10, 2, 1, 1, 1];
const LOCK_DURATION_S  = 300 * 24 * 60 * 60; // 300 days in seconds
const FLEX_CAP_MULT    = 2;
const LOCKED_FEE_RATES = [5, 2, 1, 1, 1];

function fmt(n: number, d = 2) {
  return n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
}
function fmtDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
function daysFrom(ts: number): number {
  return Math.ceil((ts * 1000 - Date.now()) / (1000 * 60 * 60 * 24));
}

export default function PaidStakingPage({
  account, stakeUsdt, unstakePosition, convertStakeToLocked,
  getActiveStakesOnChain, approveToken, tokenDecimals = 18,
}: Props) {
  const { toast } = useToast();
  const [activeTab, setActiveTab]         = useState<"flexible" | "locked">("flexible");
  const [usdtInput, setUsdtInput]         = useState("");
  const [staking, setStaking]             = useState(false);
  const [approvingUsdt, setApprovingUsdt] = useState(false);
  const [unstakingIndex, setUnstakingIndex]   = useState<number | null>(null);
  const [convertingIndex, setConvertingIndex] = useState<number | null>(null);
  const [positions, setPositions]         = useState<StakePosition[]>([]);
  const [loadingPos, setLoadingPos]       = useState(false);
  const [usdtAllowance, setUsdtAllowance] = useState<bigint>(0n);
  const [walletUsdt, setWalletUsdt]       = useState<bigint>(0n);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const { data: price } = useQuery<TokenPrice>({
    queryKey: ["/api/token/price"],
    refetchInterval: 30000,
  });
  const buyPrice  = parseFloat(price?.buyPrice  ?? "0.0036");
  const sellPrice = parseFloat(price?.sellPrice ?? "0.00324");

  const loadPositions = useCallback(async () => {
    if (!getActiveStakesOnChain || !account) return;
    setLoadingPos(true);
    try {
      setPositions(await getActiveStakesOnChain(account));
    } catch { setPositions([]); }
    finally { setLoadingPos(false); }
  }, [getActiveStakesOnChain, account]);

  const loadWalletData = useCallback(async () => {
    if (!account) return;
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const usdt = getTokenContract(provider);
      const [allow, bal] = await Promise.all([
        usdt.allowance(account, MVAULT_CONTRACT_ADDRESS),
        usdt.balanceOf(account),
      ]);
      setUsdtAllowance(allow as bigint);
      setWalletUsdt(bal as bigint);
    } catch {}
  }, [account]);

  useEffect(() => { loadPositions(); loadWalletData(); }, [loadPositions, loadWalletData]);

  // ── Derived values ──────────────────────────────────────────────────────────
  const usdtAmt      = parseFloat(usdtInput) || 0;
  const levelIncomes = LEVEL_RATES.map(r => (usdtAmt * r) / 100);
  const totalLevPct  = LEVEL_RATES.reduce((a, b) => a + b, 0); // 15%
  const forTokens    = usdtAmt * (1 - totalLevPct / 100);      // 85%
  const estMvt       = buyPrice > 0 ? forTokens / buyPrice : 0;
  const amountBn     = usdtAmt > 0 ? (() => { try { return ethers.parseUnits(usdtInput || "0", 18); } catch { return 0n; } })() : 0n;
  const needsApproval = usdtAllowance < amountBn;
  const walletBal    = parseFloat(formatTokenAmount(walletUsdt, tokenDecimals));

  const totStakedMvt  = positions.reduce((s, p) => s + parseFloat(formatTokenAmount(p.mvtAmount,    tokenDecimals)), 0);
  const totStakedUsdt = positions.reduce((s, p) => s + parseFloat(formatTokenAmount(p.usdtInvested, tokenDecimals)), 0);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function isFlexible(pos: StakePosition) { return pos.lockedSince === 0; }
  function isUnlocked(pos: StakePosition) {
    if (isFlexible(pos)) return true;
    return Date.now() / 1000 >= pos.lockedSince + LOCK_DURATION_S;
  }
  function unlocksAt(pos: StakePosition): number {
    return (pos.lockedSince + LOCK_DURATION_S) * 1000;
  }
  function capUsdt(pos: StakePosition): number {
    return parseFloat(formatTokenAmount(pos.usdtInvested, tokenDecimals)) * FLEX_CAP_MULT;
  }

  function getUnstakePreview(pos: StakePosition) {
    const totalMvt = parseFloat(formatTokenAmount(pos.mvtAmount, tokenDecimals));
    if (isFlexible(pos)) {
      const sponsorMvt = (totalMvt * 5) / 100;
      const toSell     = totalMvt - sponsorMvt;
      const grossUsdt  = toSell * sellPrice;
      const cap        = capUsdt(pos);
      const userUsdt   = Math.min(grossUsdt, cap);
      const adminCut   = Math.max(0, grossUsdt - cap);
      return { type: "flexible" as const, sponsorMvt, toSell, grossUsdt, userUsdt, adminCut, cap };
    } else {
      const distrib = LOCKED_FEE_RATES.map(r => (totalMvt * r) / 100);
      const totalDistrib = distrib.reduce((a, b) => a + b, 0);
      const toSell   = totalMvt - totalDistrib;
      const userUsdt = toSell * sellPrice;
      return { type: "locked" as const, distrib, toSell, userUsdt };
    }
  }

  // ── Actions ─────────────────────────────────────────────────────────────────
  const handleApprove = async () => {
    if (!approveToken) return;
    setApprovingUsdt(true);
    try {
      await approveToken();
      await loadWalletData();
      toast({ title: "USDT Approved", description: "You can now stake USDT." });
    } catch (e: any) {
      toast({ title: "Approval Failed", description: e?.message ?? "Please try again.", variant: "destructive" });
    } finally { setApprovingUsdt(false); }
  };

  const handleStake = async () => {
    if (!stakeUsdt) return;
    if (usdtAmt < 50)         { toast({ title: "Min $50 USDT", variant: "destructive" }); return; }
    if (usdtAmt > walletBal)  { toast({ title: "Insufficient Balance", variant: "destructive" }); return; }
    setStaking(true);
    try {
      await stakeUsdt(usdtInput, activeTab === "locked");
      toast({ title: "Staked!", description: `$${fmt(usdtAmt)} USDT → ~${fmt(estMvt)} MVT (${activeTab})` });
      setUsdtInput("");
      await loadPositions();
      await loadWalletData();
    } catch (e: any) {
      toast({ title: "Stake Failed", description: e?.message ?? "Transaction failed.", variant: "destructive" });
    } finally { setStaking(false); }
  };

  const handleUnstake = async (pos: StakePosition) => {
    if (!unstakePosition) return;
    setUnstakingIndex(pos.index);
    try {
      await unstakePosition(pos.index);
      toast({ title: "Unstaked!", description: "USDT has been sent to your wallet." });
      await loadPositions(); await loadWalletData();
    } catch (e: any) {
      toast({ title: "Unstake Failed", description: e?.message ?? "Transaction failed.", variant: "destructive" });
    } finally { setUnstakingIndex(null); }
  };

  const handleConvert = async (pos: StakePosition) => {
    if (!convertStakeToLocked) return;
    setConvertingIndex(pos.index);
    try {
      await convertStakeToLocked(pos.index);
      toast({ title: "Converted to Locked!", description: "10-month lock started. No 2× cap applies anymore." });
      await loadPositions();
    } catch (e: any) {
      toast({ title: "Conversion Failed", description: e?.message ?? "Transaction failed.", variant: "destructive" });
    } finally { setConvertingIndex(null); }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-2xl mx-auto">

      {/* Header */}
      <div className="slide-in">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-500/20 via-yellow-500/20 to-amber-400/20 flex items-center justify-center">
            <Coins className="h-6 w-6 text-yellow-300" />
          </div>
          <div>
            <h1 className="text-2xl font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }}
              data-testid="text-staking-title">MVT Staking</h1>
            <p className="text-sm text-muted-foreground">Invest USDT · Buy MVT · Earn sponsor income</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 slide-in" style={{ animationDelay: "0.05s" }}>
        <div className="glass-card rounded-xl p-3 text-center">
          <DollarSign className="h-4 w-4 mx-auto text-emerald-400 mb-1" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Wallet USDT</p>
          <p className="text-sm font-bold text-emerald-400" style={{ fontFamily: "var(--font-display)" }}
            data-testid="text-wallet-usdt">${fmt(walletBal)}</p>
        </div>
        <div className="glass-card rounded-xl p-3 text-center">
          <Coins className="h-4 w-4 mx-auto text-yellow-300 mb-1" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Staked MVT</p>
          <p className="text-sm font-bold text-yellow-300" style={{ fontFamily: "var(--font-display)" }}
            data-testid="text-staked-mvt">{fmt(totStakedMvt)} M</p>
        </div>
        <div className="glass-card rounded-xl p-3 text-center">
          <TrendingUp className="h-4 w-4 mx-auto text-amber-400 mb-1" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Positions</p>
          <p className="text-sm font-bold text-amber-400" style={{ fontFamily: "var(--font-display)" }}
            data-testid="text-position-count">{positions.length}</p>
        </div>
      </div>

      {/* Token Price */}
      <div className="glass-card rounded-2xl p-4 slide-in" style={{ animationDelay: "0.07s" }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-yellow-300" />
            <span className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>M Token Price</span>
          </div>
          <button onClick={loadWalletData} className="text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-refresh"><RefreshCw className="h-3.5 w-3.5" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Buy Price</p>
            <p className="text-sm font-bold text-emerald-400" style={{ fontFamily: "var(--font-display)" }}
              data-testid="text-buy-price">${buyPrice.toFixed(6)}</p>
          </div>
          <div className="text-center p-3 rounded-xl bg-orange-500/5 border border-orange-500/10">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Sell Price</p>
            <p className="text-sm font-bold text-orange-400" style={{ fontFamily: "var(--font-display)" }}
              data-testid="text-sell-price">${sellPrice.toFixed(6)}</p>
          </div>
        </div>
      </div>

      {/* Staking Form */}
      <div className="glass-card rounded-2xl p-5 space-y-5 slide-in" style={{ animationDelay: "0.1s" }}>

        {/* Tabs */}
        <div className="flex rounded-xl bg-white/[0.03] p-1 gap-1">
          {(["flexible", "locked"] as const).map(tab => (
            <button key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                activeTab === tab
                  ? tab === "flexible"
                    ? "bg-gradient-to-r from-amber-500/20 to-yellow-500/20 text-yellow-300 border border-yellow-500/20"
                    : "bg-gradient-to-r from-violet-500/20 to-purple-500/20 text-violet-300 border border-violet-500/20"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`tab-${tab}`}
            >
              {tab === "flexible" ? <Zap className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              {tab === "flexible" ? "Flexible" : "Locked (10mo)"}
            </button>
          ))}
        </div>

        {/* Info banner */}
        <div className={`p-3.5 rounded-xl border text-[11px] leading-relaxed space-y-1.5 ${
          activeTab === "flexible"
            ? "bg-amber-500/5 border-amber-500/15 text-amber-300/80"
            : "bg-violet-500/5 border-violet-500/15 text-violet-300/80"
        }`}>
          {activeTab === "flexible" ? (
            <>
              <p><strong className="text-amber-300">Flexible Staking:</strong> Unstake anytime, no lock.</p>
              <p>• On unstake: 5% MVT → direct sponsor; 95% sold for USDT.</p>
              <p className="font-semibold text-amber-400">• 2× sell cap: max USDT = 2× your invested amount. Excess → admin.</p>
            </>
          ) : (
            <>
              <p><strong className="text-violet-300">Locked Staking:</strong> 10-month lock. Unstake after 300 days.</p>
              <p>• On unstake: 5%/2%/1%/1%/1% MVT → 5 sponsor levels; 90% sold for USDT.</p>
              <p className="font-semibold text-violet-400">• No sell cap: receive full sell value of your tokens.</p>
            </>
          )}
        </div>

        {/* USDT Input */}
        <div className="space-y-1.5">
          <label className="text-[11px] text-muted-foreground uppercase tracking-wider">Amount to Stake (USDT)</label>
          <div className="flex items-center gap-2 rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2.5">
            <DollarSign className="h-4 w-4 text-emerald-400 shrink-0" />
            <input
              type="number" min="50" step="1"
              value={usdtInput} onChange={e => setUsdtInput(e.target.value)}
              placeholder="Minimum $50"
              className="flex-1 bg-transparent text-sm font-bold outline-none placeholder:text-muted-foreground/30"
              data-testid="input-usdt-amount"
            />
            <button onClick={() => setUsdtInput(Math.floor(walletBal).toString())}
              className="text-[10px] text-yellow-300 font-semibold uppercase px-2 py-1 rounded-md bg-yellow-600/10 hover:bg-yellow-600/15 transition-colors shrink-0"
              data-testid="button-max-stake">MAX</button>
          </div>
          {usdtAmt > 0 && usdtAmt < 50 && (
            <p className="text-[11px] text-red-400 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> Minimum stake is $50 USDT
            </p>
          )}
        </div>

        {/* Breakdown preview */}
        {usdtAmt >= 50 && (
          <div className="space-y-3 p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]"
            data-testid="card-stake-preview">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Breakdown</p>

            <div className="space-y-1.5">
              <p className="text-[10px] text-muted-foreground mb-1.5">Level Income (paid now in USDT to uplines)</p>
              {LEVEL_RATES.map((rate, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">L{i + 1} ({rate}%)</span>
                  <span className="font-medium text-emerald-400">${fmt(levelIncomes[i], 4)}</span>
                </div>
              ))}
              <div className="h-px bg-white/[0.06] my-1" />
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-muted-foreground">Level total</span>
                <span className="text-emerald-400">${fmt(usdtAmt * totalLevPct / 100, 4)} ({totalLevPct}%)</span>
              </div>
            </div>
            <div className="h-px bg-white/[0.06]" />
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">For token purchase (85%)</span>
                <span className="font-medium">${fmt(forTokens, 4)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Estimated MVT @ ${buyPrice.toFixed(6)}</span>
                <span className="font-bold text-yellow-300">~{fmt(estMvt, 2)} MVT</span>
              </div>
              {activeTab === "flexible" && (
                <div className="flex justify-between text-xs">
                  <span className="text-amber-400/80">Max sell cap (2×)</span>
                  <span className="font-bold text-amber-400">${fmt(usdtAmt * 2, 2)} USDT</span>
                </div>
              )}
              {activeTab === "locked" && (
                <div className="flex justify-between text-xs">
                  <span className="text-violet-400/80">Unlocks after</span>
                  <span className="font-bold text-violet-400">300 days</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Action */}
        {needsApproval && usdtAmt >= 50 ? (
          <button onClick={handleApprove} disabled={approvingUsdt}
            className="w-full py-3.5 px-6 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 bg-blue-500/20 border border-blue-500/30 text-blue-300 hover:bg-blue-500/25"
            data-testid="button-approve-usdt">
            {approvingUsdt ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
            {approvingUsdt ? "Approving..." : "Approve USDT First"}
          </button>
        ) : (
          <button onClick={handleStake} disabled={staking || usdtAmt < 50 || usdtAmt > walletBal}
            className={`w-full py-3.5 px-6 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 ${
              activeTab === "flexible"
                ? "glow-button text-white"
                : "bg-gradient-to-r from-violet-600/80 to-purple-600/80 hover:from-violet-500/80 hover:to-purple-500/80 text-white border border-violet-500/30"
            }`}
            data-testid="button-stake" style={{ fontFamily: "var(--font-display)" }}>
            {staking ? <Loader2 className="h-4 w-4 animate-spin" /> : activeTab === "flexible" ? <Zap className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            {staking ? "Staking..." : `Stake $${usdtAmt > 0 ? fmt(usdtAmt) : "—"} · ${activeTab === "flexible" ? "Flexible" : "Locked 10mo"}`}
          </button>
        )}
      </div>

      {/* Active Positions */}
      <div className="glass-card rounded-2xl slide-in" style={{ animationDelay: "0.15s" }}>
        <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-yellow-600/15 flex items-center justify-center">
              <Lock className="h-5 w-5 text-yellow-300" />
            </div>
            <div>
              <h2 className="text-sm font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }}>Active Positions</h2>
              <p className="text-[10px] text-muted-foreground">{positions.length} stake{positions.length !== 1 ? "s" : ""} · ${fmt(totStakedUsdt)} total invested</p>
            </div>
          </div>
          <button onClick={loadPositions} className="text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-refresh-positions"><RefreshCw className="h-3.5 w-3.5" /></button>
        </div>

        {loadingPos ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-yellow-300" />
          </div>
        ) : positions.length === 0 ? (
          <div className="text-center py-12">
            <div className="h-12 w-12 mx-auto rounded-xl bg-white/[0.03] flex items-center justify-center mb-3">
              <Coins className="h-6 w-6 text-muted-foreground/30" />
            </div>
            <p className="text-sm text-muted-foreground" data-testid="text-no-positions">No active positions</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Stake USDT above to get started</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {positions.map(pos => {
              const flex      = isFlexible(pos);
              const unlocked  = isUnlocked(pos);
              const mvtAmt    = parseFloat(formatTokenAmount(pos.mvtAmount,    tokenDecimals));
              const invested  = parseFloat(formatTokenAmount(pos.usdtInvested, tokenDecimals));
              const cap       = capUsdt(pos);
              const curVal    = mvtAmt * sellPrice;
              const preview   = getUnstakePreview(pos);
              const daysLeft  = flex ? 0 : daysFrom(unlocksAt(pos) / 1000);
              const isUnstaking  = unstakingIndex  === pos.index;
              const isConverting = convertingIndex === pos.index;
              const expanded  = expandedIndex === pos.index;

              return (
                <div key={pos.index} className="p-5 space-y-4" data-testid={`card-position-${pos.index}`}>

                  {/* Position header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
                        flex ? "bg-amber-500/15" : "bg-violet-500/15"
                      }`}>
                        {flex ? <Zap className="h-4 w-4 text-amber-300" /> : <Lock className="h-4 w-4 text-violet-300" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}
                            data-testid={`text-mvt-${pos.index}`}>{fmt(mvtAmt, 2)} MVT</span>
                          <Badge className={`text-[10px] ${flex
                            ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
                            : "bg-violet-500/10 text-violet-300 border-violet-500/20"}`}>
                            {flex ? "Flexible" : "Locked"}
                          </Badge>
                          {!flex && unlocked && (
                            <Badge className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Unlocked</Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          ${fmt(invested)} invested · {fmtDate(pos.stakedAt)}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setExpandedIndex(expanded ? null : pos.index)}
                      className="text-muted-foreground hover:text-foreground transition-colors shrink-0 p-1"
                      data-testid={`button-expand-${pos.index}`}
                    >
                      {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>

                  {/* Key metrics */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04] text-center">
                      <p className="text-[9px] text-muted-foreground uppercase mb-0.5">Current Value</p>
                      <p className="text-xs font-bold text-yellow-300">${fmt(curVal, 2)}</p>
                    </div>
                    {flex ? (
                      <div className="p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/15 text-center">
                        <p className="text-[9px] text-amber-400/70 uppercase mb-0.5">Max Receive</p>
                        <p className="text-xs font-bold text-amber-400">${fmt(cap)}</p>
                      </div>
                    ) : (
                      <div className={`p-2.5 rounded-lg text-center ${unlocked
                        ? "bg-emerald-500/5 border border-emerald-500/15"
                        : "bg-violet-500/5 border border-violet-500/15"}`}>
                        <p className={`text-[9px] uppercase mb-0.5 ${unlocked ? "text-emerald-400/70" : "text-violet-400/70"}`}>
                          {unlocked ? "Status" : "Days Left"}
                        </p>
                        <p className={`text-xs font-bold ${unlocked ? "text-emerald-400" : "text-violet-400"}`}>
                          {unlocked ? "Ready" : `${daysLeft}d`}
                        </p>
                      </div>
                    )}
                    <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04] text-center">
                      <p className="text-[9px] text-muted-foreground uppercase mb-0.5">Gain</p>
                      <p className={`text-xs font-bold ${curVal >= invested ? "text-emerald-400" : "text-red-400"}`}>
                        {curVal >= invested ? "+" : ""}{fmt(((curVal / invested) - 1) * 100, 1)}%
                      </p>
                    </div>
                  </div>

                  {/* Lock progress bar for locked positions */}
                  {!flex && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Lock started {fmtDate(pos.lockedSince)}</span>
                        <span>{unlocked ? "Unlocked!" : `Unlocks ${fmtDate(unlocksAt(pos) / 1000)}`}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${unlocked
                            ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
                            : "bg-gradient-to-r from-violet-600 to-purple-500"}`}
                          style={{ width: `${Math.min(100, ((Date.now() / 1000 - pos.lockedSince) / LOCK_DURATION_S) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Flexible 2x cap progress */}
                  {flex && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Cap utilisation</span>
                        <span>{fmt(Math.min(curVal / cap * 100, 100), 1)}% of ${fmt(cap)} max</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${curVal >= cap
                            ? "bg-gradient-to-r from-red-500 to-orange-400"
                            : "bg-gradient-to-r from-amber-600 to-yellow-400"}`}
                          style={{ width: `${Math.min(100, (curVal / cap) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Expanded unstake preview */}
                  {expanded && (
                    <div className={`p-3.5 rounded-xl border space-y-1.5 text-[11px] ${
                      flex ? "bg-amber-500/5 border-amber-500/15" : "bg-violet-500/5 border-violet-500/15"
                    }`}>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">Unstake Preview</p>
                      {preview.type === "flexible" ? (
                        <>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Sponsor (5%)</span>
                            <span className="text-amber-300">{fmt(preview.sponsorMvt, 2)} MVT</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Tokens sold (95%)</span>
                            <span className="font-medium">{fmt(preview.toSell, 2)} MVT</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Gross USDT</span>
                            <span>${fmt(preview.grossUsdt, 4)}</span>
                          </div>
                          {preview.adminCut > 0 && (
                            <div className="flex justify-between text-orange-400/80">
                              <span>Admin cut (above 2× cap)</span>
                              <span>-${fmt(preview.adminCut, 4)}</span>
                            </div>
                          )}
                          <div className="h-px bg-white/[0.06] my-1" />
                          <div className="flex justify-between font-semibold">
                            <span className="text-muted-foreground">You receive</span>
                            <span className="text-emerald-400">~${fmt(preview.userUsdt, 4)} USDT</span>
                          </div>
                          {curVal > cap && (
                            <p className="text-[10px] text-orange-400/80 mt-1">
                              ⚠ Current value exceeds 2× cap. Convert to Locked to remove cap limit.
                            </p>
                          )}
                        </>
                      ) : (
                        <>
                          {LOCKED_FEE_RATES.map((r, i) => (
                            <div key={i} className="flex justify-between">
                              <span className="text-muted-foreground">L{i + 1} upline ({r}%)</span>
                              <span className="text-violet-300">{fmt(preview.distrib[i], 2)} MVT</span>
                            </div>
                          ))}
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Tokens sold (90%)</span>
                            <span className="font-medium">{fmt(preview.toSell, 2)} MVT</span>
                          </div>
                          <div className="h-px bg-white/[0.06] my-1" />
                          <div className="flex justify-between font-semibold">
                            <span className="text-muted-foreground">You receive (full value)</span>
                            <span className="text-emerald-400">~${fmt(preview.userUsdt, 4)} USDT</span>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2">
                    {/* Convert to Locked (only for flexible) */}
                    {flex && (
                      <button
                        onClick={() => handleConvert(pos)}
                        disabled={isConverting}
                        className="flex-1 py-2.5 px-3 rounded-xl font-semibold text-xs transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 bg-violet-500/10 border border-violet-500/20 text-violet-300 hover:bg-violet-500/15"
                        data-testid={`button-convert-${pos.index}`}
                      >
                        {isConverting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
                        {isConverting ? "Converting..." : "→ Lock (10mo)"}
                      </button>
                    )}

                    {/* Unstake button */}
                    {!unlocked ? (
                      <div className="flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 bg-white/[0.02] border border-white/[0.05] text-muted-foreground cursor-not-allowed"
                        data-testid={`text-locked-until-${pos.index}`}>
                        <Clock className="h-3.5 w-3.5" />
                        Locked {daysLeft}d more
                      </div>
                    ) : (
                      <button
                        onClick={() => handleUnstake(pos)}
                        disabled={isUnstaking}
                        className="flex-1 py-2.5 px-3 rounded-xl font-semibold text-xs transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.07] text-foreground"
                        data-testid={`button-unstake-${pos.index}`}
                      >
                        {isUnstaking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlock className="h-3.5 w-3.5" />}
                        {isUnstaking ? "Unstaking..." : "Unstake"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Level Income Info Card */}
      <div className="glass-card rounded-2xl p-5 slide-in" style={{ animationDelay: "0.2s" }}>
        <div className="flex items-center gap-2 mb-4">
          <Info className="h-4 w-4 text-blue-400" />
          <span className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>How Staking Works</span>
        </div>
        <div className="space-y-3 text-[11px] text-muted-foreground">
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] space-y-1">
            <p className="text-xs font-semibold text-foreground mb-1.5">On Stake (both types)</p>
            {LEVEL_RATES.map((r, i) => (
              <div key={i} className="flex justify-between">
                <span>L{i + 1} upline gets</span>
                <span className="font-medium text-emerald-400">{r}% USDT immediately</span>
              </div>
            ))}
            <div className="flex justify-between font-semibold border-t border-white/[0.04] pt-1 mt-1">
              <span>Remaining (85%)</span><span className="text-yellow-300">buys MVT tokens</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/15 space-y-1">
              <p className="text-xs font-semibold text-amber-300 mb-1">Flexible Unstake</p>
              <p>5% MVT → sponsor</p>
              <p>95% sold for USDT</p>
              <p className="text-amber-400 font-medium">2× cap on proceeds</p>
            </div>
            <div className="p-3 rounded-xl bg-violet-500/5 border border-violet-500/15 space-y-1">
              <p className="text-xs font-semibold text-violet-300 mb-1">Locked Unstake</p>
              <p>10% distributed to 5 levels</p>
              <p>90% sold for USDT</p>
              <p className="text-violet-400 font-medium">No cap — full value</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
