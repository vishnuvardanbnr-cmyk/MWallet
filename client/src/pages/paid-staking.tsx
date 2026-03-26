import { useState, useEffect, useCallback } from "react";
import {
  Coins, Lock, Unlock, DollarSign, Loader2, TrendingUp,
  Info, CheckCircle, AlertCircle, RefreshCw, ArrowLeft, Zap, Shield
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { getMvaultContract, getTokenContract, MVAULT_CONTRACT_ADDRESS, formatTokenAmount } from "@/lib/contract";
import { ethers } from "ethers";
import { useQuery } from "@tanstack/react-query";

interface TokenPrice {
  buyPrice: string;
  sellPrice: string;
}

interface StakePosition {
  index: number;
  mvtAmount: bigint;
  usdtInvested: bigint;
  stakedAt: number;
  isLocked: boolean;
}

interface Props {
  account: string;
  stakeUsdt?: (usdtAmount: string, isLocked: boolean) => Promise<void>;
  unstakePosition?: (stakeIndex: number) => Promise<void>;
  getActiveStakesOnChain?: (user: string) => Promise<StakePosition[]>;
  approveToken?: () => Promise<void>;
  tokenDecimals?: number;
}

const LEVEL_RATES = [10, 2, 1, 1, 1];
const FLEXIBLE_UNSTAKE_FEE = 5;
const LOCKED_UNSTAKE_LEVELS = [5, 2, 1, 1, 1];

function fmt(n: number, d = 2) {
  return n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
}

function fmtDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });
}

export default function PaidStakingPage({
  account,
  stakeUsdt,
  unstakePosition,
  getActiveStakesOnChain,
  approveToken,
  tokenDecimals = 18,
}: Props) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"flexible" | "locked">("flexible");
  const [usdtInput, setUsdtInput] = useState("");
  const [staking, setStaking] = useState(false);
  const [approvingUsdt, setApprovingUsdt] = useState(false);
  const [unstakingIndex, setUnstakingIndex] = useState<number | null>(null);
  const [positions, setPositions] = useState<StakePosition[]>([]);
  const [loadingPositions, setLoadingPositions] = useState(false);
  const [usdtAllowance, setUsdtAllowance] = useState<bigint>(0n);
  const [walletUsdtBalance, setWalletUsdtBalance] = useState<bigint>(0n);

  const { data: price } = useQuery<TokenPrice>({
    queryKey: ["/api/token/price"],
    refetchInterval: 30000,
  });

  const buyPrice = parseFloat(price?.buyPrice ?? "0.0036");
  const sellPrice = parseFloat(price?.sellPrice ?? "0.00324");

  const loadPositions = useCallback(async () => {
    if (!getActiveStakesOnChain || !account) return;
    setLoadingPositions(true);
    try {
      const pos = await getActiveStakesOnChain(account);
      setPositions(pos);
    } catch {
      setPositions([]);
    } finally {
      setLoadingPositions(false);
    }
  }, [getActiveStakesOnChain, account]);

  const loadWalletData = useCallback(async () => {
    if (!account) return;
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const usdt = getTokenContract(provider);
      const [allowance, bal] = await Promise.all([
        usdt.allowance(account, MVAULT_CONTRACT_ADDRESS),
        usdt.balanceOf(account),
      ]);
      setUsdtAllowance(allowance as bigint);
      setWalletUsdtBalance(bal as bigint);
    } catch {}
  }, [account]);

  useEffect(() => {
    loadPositions();
    loadWalletData();
  }, [loadPositions, loadWalletData]);

  const usdtAmt = parseFloat(usdtInput) || 0;
  const levelIncome = LEVEL_RATES.map(r => (usdtAmt * r) / 100);
  const totalLevelPct = LEVEL_RATES.reduce((a, b) => a + b, 0);
  const forTokens = usdtAmt * (1 - totalLevelPct / 100);
  const estimatedMvt = buyPrice > 0 ? forTokens / buyPrice : 0;

  const amountBn = usdtAmt > 0 ? ethers.parseUnits(usdtInput || "0", 18) : 0n;
  const needsApproval = usdtAllowance < amountBn;
  const walletBalNum = parseFloat(formatTokenAmount(walletUsdtBalance, tokenDecimals));

  const handleApprove = async () => {
    if (!approveToken) return;
    setApprovingUsdt(true);
    try {
      await approveToken();
      await loadWalletData();
      toast({ title: "USDT Approved", description: "You can now stake USDT." });
    } catch (e: any) {
      toast({ title: "Approval Failed", description: e?.message ?? "Please try again.", variant: "destructive" });
    } finally {
      setApprovingUsdt(false);
    }
  };

  const handleStake = async () => {
    if (!stakeUsdt) return;
    if (usdtAmt < 50) {
      toast({ title: "Minimum $50", description: "Please enter at least $50 USDT.", variant: "destructive" });
      return;
    }
    if (usdtAmt > walletBalNum) {
      toast({ title: "Insufficient Balance", description: "You don't have enough USDT in your wallet.", variant: "destructive" });
      return;
    }
    setStaking(true);
    try {
      await stakeUsdt(usdtInput, activeTab === "locked");
      toast({
        title: "Staked Successfully!",
        description: `$${fmt(usdtAmt)} USDT staked as ${activeTab} position. ~${fmt(estimatedMvt)} MVT locked.`,
      });
      setUsdtInput("");
      await loadPositions();
      await loadWalletData();
    } catch (e: any) {
      toast({ title: "Stake Failed", description: e?.message ?? "Transaction failed.", variant: "destructive" });
    } finally {
      setStaking(false);
    }
  };

  const handleUnstake = async (pos: StakePosition) => {
    if (!unstakePosition) return;
    setUnstakingIndex(pos.index);
    try {
      await unstakePosition(pos.index);
      toast({ title: "Unstaked Successfully!", description: "Your USDT has been sent to your wallet." });
      await loadPositions();
      await loadWalletData();
    } catch (e: any) {
      toast({ title: "Unstake Failed", description: e?.message ?? "Transaction failed.", variant: "destructive" });
    } finally {
      setUnstakingIndex(null);
    }
  };

  const getUnstakePreview = (pos: StakePosition) => {
    const totalMvt = parseFloat(formatTokenAmount(pos.mvtAmount, tokenDecimals));
    if (pos.isLocked) {
      const distrib = LOCKED_UNSTAKE_LEVELS.map(r => (totalMvt * r) / 100);
      const totalDistribPct = LOCKED_UNSTAKE_LEVELS.reduce((a, b) => a + b, 0);
      const toSell = totalMvt * (1 - totalDistribPct / 100);
      const usdtOut = toSell * sellPrice;
      return { distrib, toSell, usdtOut, totalDistribPct };
    } else {
      const sponsorTokens = (totalMvt * FLEXIBLE_UNSTAKE_FEE) / 100;
      const toSell = totalMvt - sponsorTokens;
      const usdtOut = toSell * sellPrice;
      return { sponsorTokens, toSell, usdtOut };
    }
  };

  const totalStakedMvt = positions.reduce((sum, p) => sum + parseFloat(formatTokenAmount(p.mvtAmount, tokenDecimals)), 0);
  const totalStakedUsdt = positions.reduce((sum, p) => sum + parseFloat(formatTokenAmount(p.usdtInvested, tokenDecimals)), 0);

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
              data-testid="text-staking-title">
              MVT Staking
            </h1>
            <p className="text-sm text-muted-foreground">Invest USDT · Buy MVT · Earn level income</p>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-3 slide-in" style={{ animationDelay: "0.05s" }}>
        <div className="glass-card rounded-xl p-3 text-center">
          <DollarSign className="h-4 w-4 mx-auto text-emerald-400 mb-1" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Wallet USDT</p>
          <p className="text-sm font-bold text-emerald-400" style={{ fontFamily: "var(--font-display)" }}
            data-testid="text-wallet-usdt">
            ${fmt(walletBalNum)}
          </p>
        </div>
        <div className="glass-card rounded-xl p-3 text-center">
          <Coins className="h-4 w-4 mx-auto text-yellow-300 mb-1" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Staked MVT</p>
          <p className="text-sm font-bold text-yellow-300" style={{ fontFamily: "var(--font-display)" }}
            data-testid="text-staked-mvt">
            {fmt(totalStakedMvt)} M
          </p>
        </div>
        <div className="glass-card rounded-xl p-3 text-center">
          <TrendingUp className="h-4 w-4 mx-auto text-amber-400 mb-1" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Total Invested</p>
          <p className="text-sm font-bold text-amber-400" style={{ fontFamily: "var(--font-display)" }}
            data-testid="text-total-invested">
            ${fmt(totalStakedUsdt)}
          </p>
        </div>
      </div>

      {/* Token Price */}
      <div className="glass-card rounded-2xl p-4 slide-in" style={{ animationDelay: "0.07s" }}
        data-testid="card-token-price">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-yellow-300" />
            <span className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>M Token Price</span>
          </div>
          <button onClick={() => loadWalletData()} className="text-yellow-300 hover:text-yellow-200 transition-colors"
            data-testid="button-refresh">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
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
      <div className="glass-card rounded-2xl p-5 space-y-5 slide-in" style={{ animationDelay: "0.1s" }}
        data-testid="card-stake-form">

        {/* Tabs */}
        <div className="flex rounded-xl bg-white/[0.03] p-1 gap-1">
          <button
            onClick={() => setActiveTab("flexible")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === "flexible"
                ? "bg-gradient-to-r from-amber-500/20 to-yellow-500/20 text-yellow-300 border border-yellow-500/20"
                : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid="tab-flexible"
          >
            <Zap className="h-4 w-4" />
            Flexible
          </button>
          <button
            onClick={() => setActiveTab("locked")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === "locked"
                ? "bg-gradient-to-r from-violet-500/20 to-purple-500/20 text-violet-300 border border-violet-500/20"
                : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid="tab-locked"
          >
            <Shield className="h-4 w-4" />
            Locked
          </button>
        </div>

        {/* Info banner */}
        <div className={`p-3 rounded-xl border text-[11px] leading-relaxed ${
          activeTab === "flexible"
            ? "bg-amber-500/5 border-amber-500/15 text-amber-300/80"
            : "bg-violet-500/5 border-violet-500/15 text-violet-300/80"
        }`}>
          {activeTab === "flexible" ? (
            <span><strong>Flexible Staking:</strong> Unstake anytime. On unstake: 5% of your MVT tokens go to your direct sponsor. The remaining 95% is sold for USDT and sent to your wallet.</span>
          ) : (
            <span><strong>Locked Staking:</strong> Unstake anytime. On unstake: 10% of your MVT tokens are distributed across 5 sponsor levels (5%+2%+1%+1%+1%). The remaining 90% is sold for USDT and sent to your wallet.</span>
          )}
        </div>

        {/* USDT Input */}
        <div className="space-y-1.5">
          <label className="text-[11px] text-muted-foreground uppercase tracking-wider">Amount to Stake (USDT)</label>
          <div className="flex items-center gap-2 rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2.5">
            <DollarSign className="h-4 w-4 text-emerald-400 shrink-0" />
            <input
              type="number"
              min="50"
              step="1"
              value={usdtInput}
              onChange={e => setUsdtInput(e.target.value)}
              placeholder="Minimum $50"
              className="flex-1 bg-transparent text-sm font-bold outline-none placeholder:text-muted-foreground/30"
              data-testid="input-usdt-amount"
            />
            <button
              onClick={() => setUsdtInput(Math.floor(walletBalNum).toString())}
              className="text-[10px] text-yellow-300 font-semibold uppercase tracking-wider px-2 py-1 rounded-md bg-yellow-600/10 hover:bg-yellow-600/15 transition-colors shrink-0"
              data-testid="button-max-stake"
            >
              MAX
            </button>
          </div>
          {usdtAmt > 0 && usdtAmt < 50 && (
            <p className="text-[11px] text-red-400 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> Minimum stake is $50 USDT
            </p>
          )}
        </div>

        {/* Preview breakdown */}
        {usdtAmt >= 50 && (
          <div className="space-y-3 p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]"
            data-testid="card-stake-preview">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Breakdown Preview</p>

            <div className="space-y-1.5">
              <p className="text-[10px] text-muted-foreground mb-1.5">Level Income (paid instantly in USDT to uplines)</p>
              {LEVEL_RATES.map((rate, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">L{i + 1} Upline ({rate}%)</span>
                  <span className="font-medium text-emerald-400">${fmt(levelIncome[i], 4)} USDT</span>
                </div>
              ))}
              <div className="h-px bg-white/[0.06] my-1.5" />
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-muted-foreground">Total Level Income</span>
                <span className="text-emerald-400">${fmt(usdtAmt * totalLevelPct / 100, 4)} USDT ({totalLevelPct}%)</span>
              </div>
            </div>

            <div className="h-px bg-white/[0.06]" />

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">For Token Purchase (85%)</span>
                <span className="font-medium">${fmt(forTokens, 4)} USDT</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Estimated MVT at ${buyPrice.toFixed(6)}</span>
                <span className="font-bold text-yellow-300">~{fmt(estimatedMvt, 2)} MVT</span>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-2.5">
          {needsApproval && usdtAmt >= 50 ? (
            <button
              onClick={handleApprove}
              disabled={approvingUsdt}
              className="w-full py-3.5 px-6 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 bg-blue-500/20 border border-blue-500/30 text-blue-300 hover:bg-blue-500/25"
              data-testid="button-approve-usdt"
            >
              {approvingUsdt ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              {approvingUsdt ? "Approving USDT..." : "Approve USDT First"}
            </button>
          ) : (
            <button
              onClick={handleStake}
              disabled={staking || usdtAmt < 50 || usdtAmt > walletBalNum}
              className={`w-full py-3.5 px-6 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 ${
                activeTab === "flexible"
                  ? "glow-button text-white"
                  : "bg-gradient-to-r from-violet-600/80 to-purple-600/80 hover:from-violet-500/80 hover:to-purple-500/80 text-white border border-violet-500/30"
              }`}
              data-testid="button-stake"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {staking ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Staking...</>
              ) : (
                <>{activeTab === "flexible" ? <Zap className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                  Stake ${usdtAmt > 0 ? fmt(usdtAmt) : "—"} USDT ({activeTab === "flexible" ? "Flexible" : "Locked"})</>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Active Positions */}
      <div className="glass-card rounded-2xl slide-in" style={{ animationDelay: "0.15s" }}
        data-testid="card-positions">
        <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-yellow-600/15 flex items-center justify-center">
              <Lock className="h-5 w-5 text-yellow-300" />
            </div>
            <div>
              <h2 className="text-sm font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }}>
                Active Stakes
              </h2>
              <p className="text-[10px] text-muted-foreground">{positions.length} position{positions.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
          <button
            onClick={loadPositions}
            className="text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-refresh-positions"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        {loadingPositions ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-yellow-300" />
          </div>
        ) : positions.length === 0 ? (
          <div className="text-center py-12">
            <div className="h-12 w-12 mx-auto rounded-xl bg-white/[0.03] flex items-center justify-center mb-3">
              <Coins className="h-6 w-6 text-muted-foreground/30" />
            </div>
            <p className="text-sm text-muted-foreground" data-testid="text-no-positions">No active stake positions</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Stake USDT above to get started</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {positions.map((pos) => {
              const mvtAmt = parseFloat(formatTokenAmount(pos.mvtAmount, tokenDecimals));
              const usdtInv = parseFloat(formatTokenAmount(pos.usdtInvested, tokenDecimals));
              const preview = getUnstakePreview(pos);
              const isUnstaking = unstakingIndex === pos.index;

              return (
                <div key={pos.index} className="p-5 space-y-4" data-testid={`card-position-${pos.index}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
                        pos.isLocked ? "bg-violet-500/15" : "bg-amber-500/15"
                      }`}>
                        {pos.isLocked ? (
                          <Lock className="h-4 w-4 text-violet-300" />
                        ) : (
                          <Zap className="h-4 w-4 text-amber-300" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}
                            data-testid={`text-mvt-amount-${pos.index}`}>
                            {fmt(mvtAmt, 2)} MVT
                          </span>
                          <Badge className={`text-[10px] ${
                            pos.isLocked
                              ? "bg-violet-500/10 text-violet-300 border-violet-500/20"
                              : "bg-amber-500/10 text-amber-300 border-amber-500/20"
                          }`}>
                            {pos.isLocked ? "Locked" : "Flexible"}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          ${fmt(usdtInv, 2)} invested · {fmtDate(pos.stakedAt)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Unstake preview */}
                  <div className={`p-3 rounded-xl border text-[11px] space-y-1.5 ${
                    pos.isLocked
                      ? "bg-violet-500/5 border-violet-500/15"
                      : "bg-amber-500/5 border-amber-500/15"
                  }`}>
                    <p className="text-muted-foreground font-medium uppercase tracking-wider text-[10px] mb-2">
                      Unstake Preview
                    </p>
                    {pos.isLocked ? (
                      <>
                        {LOCKED_UNSTAKE_LEVELS.map((r, i) => (
                          <div key={i} className="flex items-center justify-between">
                            <span className="text-muted-foreground">L{i + 1} Upline ({r}%)</span>
                            <span className="font-medium text-violet-300">{fmt((preview as any).distrib[i], 2)} MVT</span>
                          </div>
                        ))}
                        <div className="h-px bg-white/[0.06] my-1" />
                        <div className="flex items-center justify-between font-semibold">
                          <span className="text-muted-foreground">You receive (90% sold)</span>
                          <span className="text-emerald-400">~${fmt((preview as any).usdtOut, 4)} USDT</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Sponsor (5%)</span>
                          <span className="font-medium text-amber-300">{fmt((preview as any).sponsorTokens, 2)} MVT</span>
                        </div>
                        <div className="h-px bg-white/[0.06] my-1" />
                        <div className="flex items-center justify-between font-semibold">
                          <span className="text-muted-foreground">You receive (95% sold)</span>
                          <span className="text-emerald-400">~${fmt((preview as any).usdtOut, 4)} USDT</span>
                        </div>
                      </>
                    )}
                  </div>

                  <button
                    onClick={() => handleUnstake(pos)}
                    disabled={isUnstaking}
                    className="w-full py-2.5 px-4 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.07] text-foreground"
                    data-testid={`button-unstake-${pos.index}`}
                  >
                    {isUnstaking ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Unstaking...</>
                    ) : (
                      <><Unlock className="h-4 w-4" /> Unstake Position</>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Level Income Info */}
      <div className="glass-card rounded-2xl p-5 slide-in" style={{ animationDelay: "0.2s" }}
        data-testid="card-level-income-info">
        <div className="flex items-center gap-2 mb-4">
          <Info className="h-4 w-4 text-blue-400" />
          <span className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>Level Income on Stake</span>
        </div>
        <div className="space-y-2">
          {LEVEL_RATES.map((rate, i) => (
            <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04]"
              data-testid={`row-level-rate-${i}`}>
              <div className="flex items-center gap-2.5">
                <div className="h-6 w-6 rounded-md bg-emerald-500/10 flex items-center justify-center">
                  <span className="text-[10px] font-bold text-emerald-400">L{i + 1}</span>
                </div>
                <span className="text-xs text-muted-foreground">Level {i + 1} Upline</span>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold text-emerald-400">{rate}% USDT</span>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/10 mt-1">
            <span className="text-xs font-semibold text-muted-foreground">Total distributed</span>
            <span className="text-xs font-bold text-emerald-400">{totalLevelPct}% of stake</span>
          </div>
        </div>
      </div>
    </div>
  );
}
