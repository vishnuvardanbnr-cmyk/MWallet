import { useState, useEffect, useCallback } from "react";
import {
  Coins, Lock, Unlock, DollarSign, Loader2, TrendingUp,
  Info, CheckCircle, AlertCircle, RefreshCw, Zap, Shield,
  ArrowRight, Clock, Ban, ChevronDown, ChevronUp, ExternalLink
} from "lucide-react";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { getMvaultContract, getTokenContract, getMvtTokenContract, getDirectProvider, MVAULT_CONTRACT_ADDRESS, formatTokenAmount, decodeContractError } from "@/lib/contract";
import { ethers } from "ethers";

interface StakePosition {
  index: number;
  mvtAmount: bigint;
  usdtInvested: bigint;
  stakedAt: number;
  lockedSince: number;
}

interface Props {
  account: string;
  stakeUsdt?: (usdtAmount: string, isLocked: boolean, useContractBalance?: boolean) => Promise<void>;
  unstakePosition?: (stakeIndex: number) => Promise<void>;
  convertStakeToLocked?: (stakeIndex: number) => Promise<void>;
  getActiveStakesOnChain?: (user: string) => Promise<StakePosition[]>;
  approveToken?: () => Promise<void>;
  tokenDecimals?: number;
}

const STAKE_LEVEL_RATES    = [10, 5, 2, 1, 0.5, 0.5, 0.3, 0.3, 0.2, 0.2];
const STAKE_USER_PCT       = 70;
const STAKE_ADMIN_PCT      = 10;
const LOCK_DURATION_S      = 300 * 24 * 60 * 60;
const FLEX_CAP_MULT        = 2;
const LOCKED_FEE_RATES     = [5, 2, 1, 1, 1];

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
  const [, setLocation] = useLocation();
  const [pageError, setPageError]             = useState<string | null>(null);
  const [activeTab, setActiveTab]             = useState<"flexible" | "locked">("flexible");
  const [stakeSource, setStakeSource]         = useState<"wallet" | "balance">("wallet");
  const [usdtInput, setUsdtInput]             = useState("");
  const [staking, setStaking]                 = useState(false);
  const [approvingUsdt, setApprovingUsdt]     = useState(false);
  const [unstakingIndex, setUnstakingIndex]   = useState<number | null>(null);
  const [convertingIndex, setConvertingIndex] = useState<number | null>(null);
  const [positions, setPositions]             = useState<StakePosition[]>([]);
  const [loadingPos, setLoadingPos]           = useState(false);
  const [usdtAllowance, setUsdtAllowance]     = useState<bigint>(0n);
  const [walletUsdt, setWalletUsdt]           = useState<bigint>(0n);
  const [contractUsdt, setContractUsdt]       = useState<bigint>(0n);
  const [expandedIndex, setExpandedIndex]     = useState<number | null>(null);
  const [buyPrice,  setBuyPrice]  = useState(0);
  const [sellPrice, setSellPrice] = useState(0);

  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const mvtToken = getMvtTokenContract(getDirectProvider());
        const bp = await mvtToken.getBuyPrice();
        const sp = await mvtToken.getSellPrice();
        setBuyPrice(parseFloat(ethers.formatUnits(bp, 18)));
        setSellPrice(parseFloat(ethers.formatUnits(sp, 18)));
      } catch {}
    };
    fetchPrice();
    const interval = setInterval(fetchPrice, 30000);
    return () => clearInterval(interval);
  }, [account]);

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
      if (!(window as any).ethereum) { setPageError(null); return; }
      // Use direct provider — wallet's eth_call returns 0x on MChain
      const direct = getDirectProvider();
      const usdt = getTokenContract(direct);
      const mvault = getMvaultContract(direct);
      const [allow, bal, info] = await Promise.all([
        usdt.allowance(account, MVAULT_CONTRACT_ADDRESS),
        usdt.balanceOf(account),
        mvault.users(account),
      ]);
      setUsdtAllowance(allow as bigint);
      setWalletUsdt(bal as bigint);
      setContractUsdt(info.usdtBalance as bigint);
      setPageError(null);
    } catch (e: any) {
      console.error("loadWalletData error:", e);
    }
  }, [account]);

  useEffect(() => { loadPositions(); loadWalletData(); }, [loadPositions, loadWalletData]);

  const usdtAmt      = parseFloat(usdtInput) || 0;
  const walletBal    = parseFloat(formatTokenAmount(walletUsdt, tokenDecimals));
  const contractBal  = parseFloat(formatTokenAmount(contractUsdt, tokenDecimals));
  const activeBal    = stakeSource === "balance" ? contractBal : walletBal;
  const grossMvt     = buyPrice > 0 ? (usdtAmt / buyPrice) * 0.9 : 0;
  const levelIncomes = STAKE_LEVEL_RATES.map(r => (grossMvt * r) / 100);
  const totalLevPct  = STAKE_LEVEL_RATES.reduce((a, b) => a + b, 0);
  const userMvt      = grossMvt * STAKE_USER_PCT / 100;
  const adminMvt     = grossMvt * STAKE_ADMIN_PCT / 100;
  const estMvt       = userMvt;
  const amountBn      = usdtAmt > 0 ? (() => { try { return ethers.parseUnits(usdtInput || "0", 18); } catch { return 0n; } })() : 0n;
  const needsApproval = stakeSource === "wallet" && usdtAllowance < amountBn;
  const totStakedMvt  = positions.reduce((s, p) => s + parseFloat(formatTokenAmount(p.mvtAmount,    tokenDecimals)), 0);
  const totStakedUsdt = positions.reduce((s, p) => s + parseFloat(formatTokenAmount(p.usdtInvested, tokenDecimals)), 0);

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
    if (usdtAmt < 50)            { toast({ title: "Min $50 USDT", variant: "destructive" }); return; }
    if (usdtAmt > activeBal)     { toast({ title: "Insufficient Balance", variant: "destructive" }); return; }
    const useContractBalance = stakeSource === "balance";
    setStaking(true);
    try {
      await stakeUsdt(usdtInput, activeTab === "locked", useContractBalance);
      toast({ title: "Staked!", description: `$${fmt(usdtAmt)} USDT → ~${fmt(estMvt)} MWT (${activeTab})` });
      setUsdtInput("");
      await loadPositions();
      await loadWalletData();
    } catch (e: any) {
      toast({ title: "Stake Failed", description: decodeContractError(e), variant: "destructive" });
    } finally { setStaking(false); }
  };

  const handleUnstake = async (pos: StakePosition) => {
    if (!unstakePosition) return;
    setUnstakingIndex(pos.index);
    const preview = getUnstakePreview(pos);
    const userUsdt = preview.userUsdt;
    try {
      await unstakePosition(pos.index);
      toast({
        title: "Unstaked Successfully!",
        description: `~$${userUsdt.toFixed(2)} USDT credited to your Wallet balance — go to Wallet page to withdraw.`,
      });
      await loadPositions(); await loadWalletData();
    } catch (e: any) {
      toast({ title: "Unstake Failed", description: decodeContractError(e), variant: "destructive" });
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
      toast({ title: "Conversion Failed", description: decodeContractError(e), variant: "destructive" });
    } finally { setConvertingIndex(null); }
  };

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-2xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 slide-in">
        <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-amber-500/20 to-yellow-400/20 flex items-center justify-center shrink-0">
          <Coins className="h-5 w-5 text-yellow-300" />
        </div>
        <div>
          <h1 className="text-xl font-bold gradient-text leading-tight" style={{ fontFamily: "var(--font-display)" }}
            data-testid="text-staking-title">MWT Staking</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Invest USDT · Buy MWT · Earn sponsor income</p>
        </div>
      </div>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 slide-in" style={{ animationDelay: "0.05s" }}>
        {[
          { icon: <DollarSign className="h-3.5 w-3.5 text-emerald-400" />, label: "Wallet USDT",    value: `$${fmt(walletBal)}`,       color: "text-emerald-400",  testid: "text-wallet-usdt" },
          { icon: <Shield      className="h-3.5 w-3.5 text-cyan-400"    />, label: "M-Vault Balance", value: `$${fmt(contractBal)}`,   color: "text-cyan-400",     testid: "text-contract-usdt" },
          { icon: <Coins       className="h-3.5 w-3.5 text-yellow-300"  />, label: "Staked MWT",    value: `${fmt(totStakedMvt)} M`,   color: "text-yellow-300",   testid: "text-staked-mvt" },
          { icon: <TrendingUp  className="h-3.5 w-3.5 text-amber-400"   />, label: "Positions",     value: `${positions.length}`,      color: "text-amber-400",    testid: "text-position-count" },
        ].map((s, i) => (
          <div key={i} className="glass-card rounded-xl p-3.5">
            <div className="flex items-center gap-2 mb-2">
              {s.icon}
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider leading-none">{s.label}</p>
            </div>
            <p className={`text-base font-bold leading-none ${s.color}`} style={{ fontFamily: "var(--font-display)" }}
              data-testid={s.testid}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ── Token Price ── */}
      <div className="glass-card rounded-2xl p-4 slide-in" style={{ animationDelay: "0.07s" }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-3.5 w-3.5 text-yellow-300" />
            <span className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>M Token Price</span>
          </div>
          <button onClick={loadWalletData}
            className="h-7 w-7 rounded-lg bg-white/[0.03] hover:bg-white/[0.07] flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-refresh">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/15">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Buy Price</p>
            <p className="text-lg font-bold text-emerald-400 leading-none" style={{ fontFamily: "var(--font-display)" }}
              data-testid="text-buy-price">${buyPrice.toFixed(6)}</p>
          </div>
          <div className="flex flex-col gap-1 p-3 rounded-xl bg-orange-500/5 border border-orange-500/15">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Sell Price</p>
            <p className="text-lg font-bold text-orange-400 leading-none" style={{ fontFamily: "var(--font-display)" }}
              data-testid="text-sell-price">${sellPrice.toFixed(6)}</p>
          </div>
        </div>
      </div>

      {/* ── Staking Form ── */}
      <div className="glass-card rounded-2xl overflow-hidden slide-in" style={{ animationDelay: "0.1s" }}>

        {/* Type Tabs */}
        <div className="p-4 pb-3 border-b border-white/[0.05]">
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
                data-testid={`tab-${tab}`}>
                {tab === "flexible" ? <Zap className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                {tab === "flexible" ? "Flexible" : "Locked (10mo)"}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 space-y-4">

          {/* Info Banner */}
          <div className={`rounded-xl border px-3.5 py-3 text-[11px] leading-relaxed space-y-1.5 ${
            activeTab === "flexible"
              ? "bg-amber-500/5 border-amber-500/15 text-amber-300/80"
              : "bg-violet-500/5 border-violet-500/15 text-violet-300/80"
          }`}>
            {activeTab === "flexible" ? (
              <>
                <p><strong className="text-amber-300">Flexible Staking:</strong> Unstake anytime, no lock.</p>
                <p>• On unstake: 5% MWT → direct sponsor; 95% sold for USDT.</p>
                <p className="font-semibold text-amber-400">• 2× sell cap: max USDT = 2× your invested amount. Excess → admin.</p>
                <p className="text-emerald-400/80">• USDT proceeds credited to your Wallet balance — withdraw from the Wallet page.</p>
              </>
            ) : (
              <>
                <p><strong className="text-violet-300">Locked Staking:</strong> 10-month lock. Unstake after 300 days.</p>
                <p>• On unstake: 5%/2%/1%/1%/1% MWT → 5 sponsor levels; 90% sold for USDT.</p>
                <p className="font-semibold text-violet-400">• No sell cap: receive full sell value of your tokens.</p>
                <p className="text-emerald-400/80">• USDT proceeds credited to your Wallet balance — withdraw from the Wallet page.</p>
              </>
            )}
          </div>

          {/* Funding Source */}
          <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Fund from</p>
            <div className="flex rounded-xl bg-white/[0.03] p-1 gap-1">
              <button
                onClick={() => setStakeSource("wallet")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                  stakeSource === "wallet"
                    ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid="tab-source-wallet">
                <DollarSign className="h-3.5 w-3.5" />
                <span>Wallet USDT</span>
                <span className="text-[10px] opacity-60">${fmt(walletBal)}</span>
              </button>
              <button
                onClick={() => setStakeSource("balance")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                  stakeSource === "balance"
                    ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/20"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid="tab-source-balance">
                <Shield className="h-3.5 w-3.5" />
                <span>M-Vault Balance</span>
                <span className="text-[10px] opacity-60">${fmt(contractBal)}</span>
              </button>
            </div>
            {stakeSource === "balance" && (
              <p className="text-[10px] text-cyan-400/80 flex items-center gap-1.5 pl-1">
                <CheckCircle className="h-3 w-3 shrink-0" />
                No wallet approval needed — uses your in-contract USDT
              </p>
            )}
          </div>

          {/* USDT Input */}
          <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Amount to Stake (USDT)</p>
            <div className="flex items-center gap-2 rounded-xl bg-white/[0.03] border border-white/[0.07] px-3.5 py-3 focus-within:border-yellow-500/30 transition-colors">
              <DollarSign className="h-4 w-4 text-emerald-400 shrink-0" />
              <input
                type="number" min="50" step="1"
                value={usdtInput} onChange={e => setUsdtInput(e.target.value)}
                placeholder="Minimum $50"
                className="flex-1 bg-transparent text-sm font-bold outline-none placeholder:text-muted-foreground/30 min-w-0"
                data-testid="input-usdt-amount"
              />
              <button
                onClick={() => setUsdtInput(Math.floor(activeBal).toString())}
                className="text-[10px] text-yellow-300 font-bold uppercase px-2.5 py-1 rounded-lg bg-yellow-600/10 hover:bg-yellow-600/20 transition-colors shrink-0"
                data-testid="button-max-stake">
                MAX
              </button>
            </div>
            {usdtAmt > 0 && usdtAmt < 50 && (
              <p className="text-[11px] text-red-400 flex items-center gap-1.5 pl-1">
                <AlertCircle className="h-3 w-3 shrink-0" /> Minimum stake is $50 USDT
              </p>
            )}
          </div>

          {/* Distribution Preview */}
          {usdtAmt >= 50 && (
            <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] overflow-hidden"
              data-testid="card-stake-preview">
              <div className="px-4 py-2.5 border-b border-white/[0.05] bg-white/[0.01]">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">MWT Distribution Breakdown</p>
              </div>
              <div className="px-4 py-3 space-y-2">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Level Income → 10 Uplines</p>
                {STAKE_LEVEL_RATES.map((rate, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">Level {i + 1} <span className="opacity-60">({rate}%)</span></span>
                    <span className="text-[11px] font-semibold text-emerald-400">~{fmt(levelIncomes[i], 4)} MWT</span>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-1 border-t border-white/[0.05]">
                  <span className="text-[11px] text-muted-foreground">Level total <span className="opacity-60">({totalLevPct}%)</span></span>
                  <span className="text-[11px] font-bold text-emerald-400">~{fmt(grossMvt * totalLevPct / 100, 4)} MWT</span>
                </div>
              </div>
              <div className="px-4 py-3 space-y-2 border-t border-white/[0.05] bg-white/[0.01]">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">Admin pool <span className="opacity-60">(10%)</span></span>
                  <span className="text-[11px] font-semibold text-red-400/70">~{fmt(adminMvt, 4)} MWT</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-yellow-300">You receive <span className="font-normal opacity-70">(70%)</span></span>
                  <span className="text-[11px] font-bold text-yellow-300">~{fmt(estMvt, 4)} MWT</span>
                </div>
                {activeTab === "flexible" && (
                  <div className="flex items-center justify-between pt-1 border-t border-white/[0.05]">
                    <span className="text-[11px] text-amber-400/80">Max sell cap (2×)</span>
                    <span className="text-[11px] font-bold text-amber-400">${fmt(usdtAmt * 2, 2)} USDT</span>
                  </div>
                )}
                {activeTab === "locked" && (
                  <div className="flex items-center justify-between pt-1 border-t border-white/[0.05]">
                    <span className="text-[11px] text-violet-400/80">Unlocks after</span>
                    <span className="text-[11px] font-bold text-violet-400">300 days</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action Button */}
          {needsApproval && usdtAmt >= 50 ? (
            <button onClick={handleApprove} disabled={approvingUsdt}
              className="w-full py-3.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 bg-blue-500/15 border border-blue-500/25 text-blue-300 hover:bg-blue-500/20"
              data-testid="button-approve-usdt">
              {approvingUsdt ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              {approvingUsdt ? "Approving…" : "Approve USDT First"}
            </button>
          ) : (
            <button onClick={handleStake} disabled={staking || usdtAmt < 50 || usdtAmt > activeBal}
              className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 ${
                activeTab === "flexible"
                  ? "glow-button text-white"
                  : "bg-gradient-to-r from-violet-600/80 to-purple-600/80 hover:from-violet-500/80 hover:to-purple-500/80 text-white border border-violet-500/30"
              }`}
              data-testid="button-stake" style={{ fontFamily: "var(--font-display)" }}>
              {staking ? <Loader2 className="h-4 w-4 animate-spin" /> : activeTab === "flexible" ? <Zap className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              {staking ? "Staking…" : `Stake $${usdtAmt > 0 ? fmt(usdtAmt) : "—"} · ${activeTab === "flexible" ? "Flexible" : "Locked 10mo"}`}
            </button>
          )}

        </div>
      </div>

      {/* ── Active Positions ── */}
      <div className="glass-card rounded-2xl overflow-hidden slide-in" style={{ animationDelay: "0.15s" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-yellow-600/15 flex items-center justify-center shrink-0">
              <Lock className="h-4 w-4 text-yellow-300" />
            </div>
            <div>
              <h2 className="text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}>Active Positions</h2>
              <p className="text-[10px] text-muted-foreground mt-0.5">{positions.length} stake{positions.length !== 1 ? "s" : ""} · ${fmt(totStakedUsdt)} total invested</p>
            </div>
          </div>
          <button onClick={loadPositions}
            className="h-7 w-7 rounded-lg bg-white/[0.03] hover:bg-white/[0.07] flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-refresh-positions">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        {loadingPos ? (
          <div className="flex items-center justify-center py-14">
            <Loader2 className="h-6 w-6 animate-spin text-yellow-300" />
          </div>
        ) : positions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 gap-2">
            <div className="h-12 w-12 rounded-xl bg-white/[0.03] flex items-center justify-center">
              <Coins className="h-6 w-6 text-muted-foreground/20" />
            </div>
            <p className="text-sm text-muted-foreground" data-testid="text-no-positions">No active positions</p>
            <p className="text-xs text-muted-foreground/50">Stake USDT above to get started</p>
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
              const gainPct   = invested > 0 ? ((curVal / invested) - 1) * 100 : 0;

              return (
                <div key={pos.index} className="p-5" data-testid={`card-position-${pos.index}`}>

                  {/* Position Header */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
                        flex ? "bg-amber-500/15" : "bg-violet-500/15"
                      }`}>
                        {flex ? <Zap className="h-4 w-4 text-amber-300" /> : <Lock className="h-4 w-4 text-violet-300" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}
                            data-testid={`text-mvt-${pos.index}`}>{fmt(mvtAmt, 2)} MWT</span>
                          <Badge className={`text-[10px] px-1.5 ${flex
                            ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
                            : "bg-violet-500/10 text-violet-300 border-violet-500/20"}`}>
                            {flex ? "Flexible" : "Locked"}
                          </Badge>
                          {!flex && unlocked && (
                            <Badge className="text-[10px] px-1.5 bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                              Unlocked
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          ${fmt(invested)} invested · {fmtDate(pos.stakedAt)}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setExpandedIndex(expanded ? null : pos.index)}
                      className="h-7 w-7 rounded-lg bg-white/[0.03] hover:bg-white/[0.07] flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0"
                      data-testid={`button-expand-${pos.index}`}>
                      {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>

                  {/* Key Metrics */}
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <div className="flex flex-col gap-1 p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wide leading-none">Current Value</p>
                      <p className="text-xs font-bold text-yellow-300 leading-none mt-1">${fmt(curVal, 2)}</p>
                    </div>
                    {flex ? (
                      <div className="flex flex-col gap-1 p-3 rounded-xl bg-amber-500/5 border border-amber-500/15">
                        <p className="text-[9px] text-amber-400/70 uppercase tracking-wide leading-none">Max Receive</p>
                        <p className="text-xs font-bold text-amber-400 leading-none mt-1">${fmt(cap)}</p>
                      </div>
                    ) : (
                      <div className={`flex flex-col gap-1 p-3 rounded-xl ${unlocked
                        ? "bg-emerald-500/5 border border-emerald-500/15"
                        : "bg-violet-500/5 border border-violet-500/15"}`}>
                        <p className={`text-[9px] uppercase tracking-wide leading-none ${unlocked ? "text-emerald-400/70" : "text-violet-400/70"}`}>
                          {unlocked ? "Status" : "Days Left"}
                        </p>
                        <p className={`text-xs font-bold leading-none mt-1 ${unlocked ? "text-emerald-400" : "text-violet-400"}`}>
                          {unlocked ? "Ready" : `${daysLeft}d`}
                        </p>
                      </div>
                    )}
                    <div className="flex flex-col gap-1 p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wide leading-none">Gain</p>
                      <p className={`text-xs font-bold leading-none mt-1 ${gainPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {gainPct >= 0 ? "+" : ""}{fmt(gainPct, 1)}%
                      </p>
                    </div>
                  </div>

                  {/* Lock Progress Bar */}
                  {!flex && (
                    <div className="space-y-1.5 mb-4">
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

                  {/* Flexible Cap Progress */}
                  {flex && (
                    <div className="space-y-1.5 mb-4">
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

                  {/* Expanded Unstake Breakdown */}
                  {expanded && (
                    <div className={`rounded-xl border overflow-hidden mb-4 ${
                      flex ? "border-amber-500/20" : "border-violet-500/20"
                    }`}>
                      <div className={`px-4 py-2.5 border-b ${flex ? "border-amber-500/20 bg-amber-500/5" : "border-violet-500/20 bg-violet-500/5"}`}>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Unstake Breakdown</p>
                      </div>
                      <div className={`px-4 py-3 space-y-2 ${flex ? "bg-amber-500/[0.02]" : "bg-violet-500/[0.02]"}`}>
                        {preview.type === "flexible" ? (
                          <>
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] text-muted-foreground">Direct sponsor (5%)</span>
                              <span className="text-[11px] font-semibold text-amber-300">{fmt(preview.sponsorMvt, 2)} MWT</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] text-muted-foreground">Your tokens sold (95%)</span>
                              <span className="text-[11px] font-semibold">{fmt(preview.toSell, 2)} MWT</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] text-muted-foreground">Gross USDT from sell</span>
                              <span className="text-[11px] font-semibold">${fmt(preview.grossUsdt, 2)}</span>
                            </div>
                            {preview.adminCut > 0 && (
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] text-orange-400/80">Admin cut (above 2× cap)</span>
                                <span className="text-[11px] font-semibold text-orange-400">−${fmt(preview.adminCut, 2)}</span>
                              </div>
                            )}
                            {curVal > cap && (
                              <p className="text-[10px] text-orange-400/80 pt-0.5">
                                ⚠ Value exceeds 2× cap. Convert to Locked to remove limit.
                              </p>
                            )}
                          </>
                        ) : (
                          <>
                            {LOCKED_FEE_RATES.map((r, i) => (
                              <div key={i} className="flex items-center justify-between">
                                <span className="text-[11px] text-muted-foreground">L{i + 1} upline ({r}%)</span>
                                <span className="text-[11px] font-semibold text-violet-300">{fmt(preview.distrib[i], 2)} MWT</span>
                              </div>
                            ))}
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] text-muted-foreground">Your tokens sold (90%)</span>
                              <span className="text-[11px] font-semibold">{fmt(preview.toSell, 2)} MWT</span>
                            </div>
                          </>
                        )}
                      </div>
                      <div className="flex items-center justify-between px-4 py-3 bg-emerald-500/10 border-t border-emerald-500/20">
                        <div>
                          <p className="text-[10px] text-muted-foreground">You receive (credited to Wallet balance)</p>
                          <p className="text-base font-bold text-emerald-400 mt-0.5" style={{ fontFamily: "var(--font-display)" }}>
                            ~${fmt(preview.userUsdt, 2)} USDT
                          </p>
                        </div>
                        <button
                          onClick={() => setLocation("/wallet")}
                          className="flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors shrink-0"
                          data-testid="button-go-wallet-from-staking">
                          Wallet <ExternalLink className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    {flex && (
                      <button
                        onClick={() => handleConvert(pos)}
                        disabled={isConverting}
                        className="flex-1 py-2.5 px-3 rounded-xl font-semibold text-xs transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 bg-violet-500/10 border border-violet-500/20 text-violet-300 hover:bg-violet-500/15"
                        data-testid={`button-convert-${pos.index}`}>
                        {isConverting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
                        {isConverting ? "Converting…" : "→ Lock (10mo)"}
                      </button>
                    )}
                    {!unlocked ? (
                      <div
                        className="flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 bg-white/[0.02] border border-white/[0.05] text-muted-foreground cursor-not-allowed select-none"
                        data-testid={`text-locked-until-${pos.index}`}>
                        <Clock className="h-3.5 w-3.5" />
                        Locked {daysLeft}d more
                      </div>
                    ) : (
                      <button
                        onClick={() => handleUnstake(pos)}
                        disabled={isUnstaking}
                        className="flex-1 py-2.5 px-3 rounded-xl font-semibold text-xs transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.07] text-foreground"
                        data-testid={`button-unstake-${pos.index}`}>
                        {isUnstaking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlock className="h-3.5 w-3.5" />}
                        {isUnstaking ? "Unstaking…" : "Unstake"}
                      </button>
                    )}
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── How Staking Works ── */}
      <div className="glass-card rounded-2xl overflow-hidden slide-in" style={{ animationDelay: "0.2s" }}>
        <div className="flex items-center gap-2 px-5 py-4 border-b border-white/[0.05]">
          <Info className="h-3.5 w-3.5 text-blue-400 shrink-0" />
          <span className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>How Staking Works</span>
        </div>

        <div className="p-5 space-y-4">
          {/* On Stake table */}
          <div className="rounded-xl bg-white/[0.02] border border-white/[0.05] overflow-hidden">
            <div className="px-4 py-2.5 bg-white/[0.02] border-b border-white/[0.04]">
              <p className="text-[11px] font-semibold text-foreground">On Stake (both types)</p>
            </div>
            <div className="px-4 py-3 space-y-2">
              {STAKE_LEVEL_RATES.map((r: number, i: number) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">L{i + 1} upline gets</span>
                  <span className="text-[11px] font-semibold text-emerald-400">{r}% USDT immediately</span>
                </div>
              ))}
              <div className="flex items-center justify-between pt-2 border-t border-white/[0.04]">
                <span className="text-[11px] font-semibold">Remaining (85%)</span>
                <span className="text-[11px] font-semibold text-yellow-300">buys MWT tokens</span>
              </div>
            </div>
          </div>

          {/* Unstake types */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-amber-500/5 border border-amber-500/15 overflow-hidden">
              <div className="px-3.5 py-2.5 border-b border-amber-500/15 bg-amber-500/5">
                <p className="text-[11px] font-semibold text-amber-300">Flexible Unstake</p>
              </div>
              <div className="px-3.5 py-3 space-y-1.5 text-[11px] text-muted-foreground">
                <p>5% MWT → sponsor</p>
                <p>95% sold for USDT</p>
                <p className="text-amber-400 font-semibold">2× cap on proceeds</p>
              </div>
            </div>
            <div className="rounded-xl bg-violet-500/5 border border-violet-500/15 overflow-hidden">
              <div className="px-3.5 py-2.5 border-b border-violet-500/15 bg-violet-500/5">
                <p className="text-[11px] font-semibold text-violet-300">Locked Unstake</p>
              </div>
              <div className="px-3.5 py-3 space-y-1.5 text-[11px] text-muted-foreground">
                <p>10% split to 5 levels</p>
                <p>90% sold for USDT</p>
                <p className="text-violet-400 font-semibold">No cap — full value</p>
              </div>
            </div>
          </div>

          {/* Footer note */}
          <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/15">
            <ExternalLink className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-emerald-400/80 leading-relaxed">
              <strong className="text-emerald-400">Unstake proceeds</strong> are credited to your contract USDT balance (visible on the Wallet page). From there you can withdraw to your MetaMask wallet anytime.
            </p>
          </div>
        </div>
      </div>

    </div>
  );
}
