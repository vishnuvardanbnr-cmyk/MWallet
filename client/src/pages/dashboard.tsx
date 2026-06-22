import { useState, useCallback, useEffect } from "react";
import { DollarSign, TrendingUp, TrendingDown, Coins, RefreshCw, Copy, User, Users, Wallet, Zap, Shield, Bitcoin, RotateCcw, Info, ChevronRight, Check, ExternalLink, Award, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatTokenAmount, shortenAddress, getMvaultContract, getDirectProvider } from "@/lib/contract";
import type { UserInfo, MvtPrice, BinaryPairs, ProfileOnChain } from "@/hooks/use-web3";
import { getRankInfo } from "@/pages/rank";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { ethers } from "ethers";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function fmtVol(wei: bigint): string {
  const val = parseFloat(ethers.formatUnits(wei, 18));
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(2)}`;
}

interface DashboardProps {
  userInfo: UserInfo;
  mvtPrice: MvtPrice;
  binaryPairs: BinaryPairs;
  formatAmount: (val: bigint) => string;
  account: string;
  profileOnChain: ProfileOnChain | null;
  sellMvt: (amount: string) => Promise<void>;
  withdrawFunds: (amount: string) => Promise<void>;
  rebirth: (subAccount: string, placeLeft: boolean) => Promise<void>;
  fetchUserData: () => Promise<void>;
  approveToken: (amount?: string) => Promise<void>;
}

function fmt(val: bigint, dec = 18, digits = 4) {
  return parseFloat(formatTokenAmount(val, dec)).toLocaleString(undefined, { maximumFractionDigits: digits });
}

function usdFmt(val: bigint) {
  return `$${parseFloat(formatTokenAmount(val, 18)).toFixed(2)}`;
}

function mvtFmt(val: bigint) {
  return parseFloat(formatTokenAmount(val, 18)).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function Dashboard({
  userInfo, mvtPrice, binaryPairs, formatAmount, account,
  profileOnChain, sellMvt, withdrawFunds, rebirth, fetchUserData, approveToken,
}: DashboardProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // ── Sub-accounts (rebirth) ────────────────────────────────────────────────
  interface SubAccountInfo {
    address: string;
    mvtBalance: bigint;
    usdtBalance: bigint;
    incomeLimit: bigint;
    rebirthCount: bigint;
    isActive: boolean;
    rebirthIndex: number;
  }
  const [subAccounts, setSubAccounts] = useState<SubAccountInfo[]>([]);
  const [copiedAddr, setCopiedAddr] = useState<string | null>(null);

  const isSubAccount = userInfo.mainAccount !== ZERO_ADDRESS;

  const copyAddr = useCallback((addr: string) => {
    navigator.clipboard.writeText(addr);
    setCopiedAddr(addr);
    toast({ title: "Copied", description: "Address copied to clipboard" });
    setTimeout(() => setCopiedAddr(null), 2000);
  }, [toast]);

  useEffect(() => {
    if (!account || isSubAccount) return;
    (async () => {
      try {
        // Use direct provider (proxy) — MetaMask's eth_getLogs on MChain fails (-32603)
        const provider = getDirectProvider();
        const contract = getMvaultContract(provider);
        const filter = contract.filters.Reborn(account);
        // MChain limits eth_getLogs to 10 000 blocks per request
        const current = await provider.getBlockNumber();
        const fromBlock = Math.max(0, current - 9_000);
        let events: any[];
        try {
          events = await contract.queryFilter(filter, fromBlock, current);
        } catch {
          events = [];
        }
        if (!events.length) { setSubAccounts([]); return; }

        const results: SubAccountInfo[] = [];
        for (let i = 0; i < events.length; i++) {
          const subAddr: string = events[i].args?.[1];
          if (!subAddr) continue;
          try {
            const info = await contract.users(subAddr);
            results.push({
              address: subAddr,
              mvtBalance: info.mvtBalance,
              usdtBalance: info.usdtBalance,
              incomeLimit: info.incomeLimit,
              rebirthCount: info.rebirthCount,
              isActive: info.isActive,
              rebirthIndex: i + 1,
            });
          } catch {
            results.push({ address: subAddr, mvtBalance: 0n, usdtBalance: 0n, incomeLimit: 0n, rebirthCount: 0n, isActive: false, rebirthIndex: i + 1 });
          }
        }
        setSubAccounts(results);
      } catch (e) {
        console.error("fetchSubAccounts error:", e);
      }
    })();
  }, [account, isSubAccount]);

  const rankInfo = getRankInfo(userInfo.rank ?? 0);

  const buyPriceNum = parseFloat(formatTokenAmount(mvtPrice.buyPrice, 18));
  const sellPriceNum = parseFloat(formatTokenAmount(mvtPrice.sellPrice, 18));

  const mvtBalanceNum = parseFloat(formatTokenAmount(userInfo.mvtBalance, 18));
  const usdtBalanceNum = parseFloat(formatTokenAmount(userInfo.usdtBalance, 18));
  const incomeLimitNum = parseFloat(formatTokenAmount(userInfo.incomeLimit, 18));
  const incomeLimitCapNum = parseFloat(formatTokenAmount(userInfo.incomeLimitCap, 18));
  const rebirthPoolNum = parseFloat(formatTokenAmount(userInfo.rebirthPool, 18));
  const btcPoolNum = parseFloat(formatTokenAmount(userInfo.btcPoolBalance, 18));
  const totalReceivedNum = parseFloat(formatTokenAmount(userInfo.totalReceived, 18));
  const pkgPriceNum = parseFloat(formatTokenAmount(userInfo.packagePrice, 18));
  const rebirthThreshold = pkgPriceNum > 0 ? pkgPriceNum : 130;

  const estimatedSellValue = sellPriceNum > 0 ? mvtBalanceNum * sellPriceNum * 0.9 : 0;
  const incomeCap = incomeLimitCapNum > 0 ? incomeLimitCapNum : 390;
  const incomeUsed = incomeCap - incomeLimitNum;
  const incomeProgress = Math.min(100, (incomeUsed / incomeCap) * 100);

  const leftCount = fmtVol(userInfo.leftSubUsers);
  const rightCount = fmtVol(userInfo.rightSubUsers);
  const directCount = Number(userInfo.directCount);
  const currentPairs = fmtVol(binaryPairs.currentPairs);
  const newPairs = fmtVol(binaryPairs.newPairs);

  return (
    <div className="p-4 sm:p-6 space-y-5 relative z-10">

      {/* Header */}
      <div className="slide-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
              <span className="gradient-text">Dashboard</span>
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {profileOnChain?.displayName || shortenAddress(account)} · {isSubAccount ? "Sub-account" : "Main account"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLocation("/rank")}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-all hover:opacity-90 ${rankInfo.bg} ${rankInfo.border} ${rankInfo.color}`}
              data-testid="button-rank-badge"
            >
              <Award className="h-3.5 w-3.5" />
              {rankInfo.name}
            </button>
            <button onClick={() => fetchUserData()} className="p-2 rounded-lg hover:bg-white/[0.04] text-muted-foreground hover:text-foreground transition-all" data-testid="button-refresh-dashboard">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {isSubAccount && (
          <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <Info className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <p className="text-xs text-amber-400">Sub-account of {shortenAddress(userInfo.mainAccount)}</p>
          </div>
        )}
      </div>

      {/* MWT Price Banner */}
      <div className="grid grid-cols-3 gap-3 slide-in" style={{ animationDelay: "0.02s" }}>
        <div className="glass-card rounded-xl p-3 text-center" data-testid="card-buy-price">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">MWT Buy Price</p>
          <p className="text-sm font-bold text-amber-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-buy-price">
            ${buyPriceNum > 0 ? buyPriceNum.toFixed(6) : "—"}
          </p>
        </div>
        <div className="glass-card rounded-xl p-3 text-center" data-testid="card-sell-price">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">MWT Sell Price</p>
          <p className="text-sm font-bold text-emerald-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-sell-price">
            ${sellPriceNum > 0 ? sellPriceNum.toFixed(6) : "—"}
          </p>
        </div>
        <div className="glass-card rounded-xl p-3 text-center" data-testid="card-total-received">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Total Earned</p>
          <p className="text-sm font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }} data-testid="text-total-received">
            {mvtFmt(userInfo.totalReceived)} MWT
          </p>
        </div>
      </div>

      {/* Main Balances */}
      <div className="grid grid-cols-2 gap-4 slide-in" style={{ animationDelay: "0.04s" }}>
        {/* MWT Balance */}
        <div className="stat-card rounded-2xl p-5 col-span-2 sm:col-span-1" data-testid="card-stat-mvt-balance">
          <div className="flex items-start justify-between mb-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
              <Coins className="h-5 w-5 text-yellow-300" />
            </div>
            <Badge variant="outline" className="text-[9px] border-amber-500/30 text-amber-400">Virtual MWT</Badge>
          </div>
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">MWT Balance</p>
          <p className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }} data-testid="text-mvt-balance">
            <span className="gradient-text">{mvtFmt(userInfo.mvtBalance)}</span>
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">≈ ${estimatedSellValue.toFixed(2)} USDT at sell price</p>
          <button
            onClick={() => setLocation("/sell-tokens")}
            className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs font-semibold text-amber-400 hover:bg-amber-500/15 transition-all"
            data-testid="button-sell-mvt"
          >
            <TrendingDown className="h-3.5 w-3.5" /> Sell MWT
          </button>
        </div>

        {/* USDT Balance */}
        <div className="stat-card rounded-2xl p-5 col-span-2 sm:col-span-1" data-testid="card-stat-usdt-balance">
          <div className="flex items-start justify-between mb-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-emerald-400" />
            </div>
            <Badge variant="outline" className="text-[9px] border-emerald-500/30 text-emerald-400">Withdrawable</Badge>
          </div>
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">USDT Balance</p>
          <p className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }} data-testid="text-usdt-balance">
            <span className="gradient-text">${usdtBalanceNum.toFixed(2)}</span>
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Ready to withdraw to wallet</p>
          <button
            onClick={() => setLocation("/wallet")}
            className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/15 transition-all"
            data-testid="button-go-wallet"
          >
            <Wallet className="h-3.5 w-3.5" /> Withdraw
          </button>
        </div>
      </div>

      {/* Income Limit reached → Upgrade/Reactivate CTA */}
      {userInfo.isActive && incomeLimitNum <= 0 && incomeLimitCapNum > 0 && (
        <div className="glass-card rounded-2xl p-4 border border-orange-500/30 slide-in" style={{ animationDelay: "0.05s" }} data-testid="card-income-limit-reached">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-xl bg-orange-500/15 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-4.5 w-4.5 text-orange-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-orange-300" style={{ fontFamily: "var(--font-display)" }}>
                Income Limit Reached
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                You've earned your full ${incomeCap.toFixed(0)} cap. {pkgPriceNum <= 75 ? "Upgrade to Pro ($150) to unlock a $450 cap, or reactivate at $75 to reset your limit." : "Reactivate your $150 package to reset your income limit."}
              </p>
              <button
                onClick={() => setLocation("/reactivate")}
                className="mt-2.5 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-orange-500/15 border border-orange-500/25 text-sm font-semibold text-orange-300 hover:bg-orange-500/20 transition-all"
                data-testid="button-upgrade-reactivate"
              >
                <Zap className="h-4 w-4" />
                {pkgPriceNum <= 55 ? "Upgrade / Reactivate" : "Reactivate Now"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Income Limit & Rebirth Pool */}
      <div className="grid grid-cols-2 gap-4 slide-in" style={{ animationDelay: "0.06s" }}>
        {/* Income Limit */}
        <div className="glass-card rounded-2xl p-4" data-testid="card-income-limit">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-8 w-8 rounded-lg bg-yellow-600/15 flex items-center justify-center">
              <Shield className="h-4 w-4 text-yellow-300" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Income Limit</p>
              <p className="text-sm font-bold" style={{ fontFamily: "var(--font-display)" }} data-testid="text-income-limit">
                ${incomeLimitNum.toFixed(2)} left
              </p>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-400 transition-all"
                style={{ width: `${incomeProgress}%` }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground">${incomeUsed.toFixed(2)} / ${incomeCap.toFixed(2)} used</p>
          </div>
        </div>

        {/* BTC Pool */}
        <div className="glass-card rounded-2xl p-4" data-testid="card-btc-pool">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-8 w-8 rounded-lg bg-orange-500/15 flex items-center justify-center">
              <Bitcoin className="h-4 w-4 text-orange-400" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">USDT Pool</p>
              <p className="text-sm font-bold" style={{ fontFamily: "var(--font-display)" }} data-testid="text-btc-pool">
                ${btcPoolNum.toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Rebirth Pool */}
      {rebirthPoolNum > 0 && (
        <div className="glass-card rounded-2xl p-4 slide-in" style={{ animationDelay: "0.07s" }} data-testid="card-rebirth-pool">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-purple-500/15 flex items-center justify-center">
                <RotateCcw className="h-4 w-4 text-purple-400" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Rebirth Pool</p>
                <p className="text-sm font-bold" style={{ fontFamily: "var(--font-display)" }} data-testid="text-rebirth-pool">
                  ${rebirthPoolNum.toFixed(2)} USDT
                </p>
              </div>
            </div>
            {rebirthPoolNum >= rebirthThreshold && (
              <Badge variant="outline" className="text-[9px] border-purple-500/30 text-purple-400 animate-pulse">
                Ready!
              </Badge>
            )}
          </div>

          {rebirthPoolNum < rebirthThreshold ? (
            <div className="mt-1">
              <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
                <div className="h-full rounded-full bg-purple-500/60 transition-all" style={{ width: `${Math.min(100, (rebirthPoolNum / rebirthThreshold) * 100)}%` }} />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5">
                ${(rebirthThreshold - rebirthPoolNum).toFixed(2)} more needed to trigger rebirth (${rebirthThreshold.toFixed(2)} required)
              </p>
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              <p className="text-[10px] text-purple-300/80">${rebirthThreshold.toFixed(2)} reached — create a new sub-account to continue earning beyond your ${incomeCap.toFixed(2)} limit.</p>
              <button
                onClick={() => setLocation("/rebirth")}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-purple-500/15 border border-purple-500/30 text-sm font-semibold text-purple-300 hover:bg-purple-500/20 transition-all"
                data-testid="button-trigger-rebirth"
              >
                <RotateCcw className="h-4 w-4" /> Create Rebirth Account
              </button>
            </div>
          )}
        </div>
      )}

      {/* My Accounts — sub-account list (main account view) */}
      {!isSubAccount && subAccounts.length > 0 && (
        <div className="glass-card rounded-2xl p-5 slide-in" style={{ animationDelay: "0.075s" }} data-testid="card-my-accounts">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="h-9 w-9 rounded-xl bg-purple-500/15 flex items-center justify-center">
              <RotateCcw className="h-4.5 w-4.5 text-purple-400" />
            </div>
            <div>
              <p className="text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}>My Rebirth Accounts</p>
              <p className="text-[10px] text-muted-foreground">{subAccounts.length} sub-account{subAccounts.length !== 1 ? "s" : ""} — switch wallet in MetaMask to operate</p>
            </div>
          </div>

          <div className="space-y-3">
            {subAccounts.map((sub) => (
              <div key={sub.address} className="rounded-xl border border-purple-500/15 bg-purple-500/[0.04] p-3" data-testid={`card-subaccount-${sub.rebirthIndex}`}>
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-purple-500/20 flex items-center justify-center">
                      <User className="h-3.5 w-3.5 text-purple-400" />
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-purple-300" style={{ fontFamily: "var(--font-display)" }}>
                        Rebirth #{sub.rebirthIndex}
                      </p>
                      <p className="text-[9px] font-mono text-muted-foreground">{shortenAddress(sub.address)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className={`text-[9px] ${sub.isActive ? "border-emerald-500/30 text-emerald-400" : "border-muted/30 text-muted-foreground"}`}>
                      {sub.isActive ? "Active" : "Inactive"}
                    </Badge>
                    <button
                      onClick={() => copyAddr(sub.address)}
                      className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors"
                      title="Copy address"
                      data-testid={`button-copy-subaccount-${sub.rebirthIndex}`}
                    >
                      {copiedAddr === sub.address
                        ? <Check className="h-3.5 w-3.5 text-emerald-400" />
                        : <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                      }
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center rounded-lg bg-white/[0.02] p-2">
                    <p className="text-[9px] text-muted-foreground mb-0.5">MWT</p>
                    <p className="text-[11px] font-bold text-amber-300" style={{ fontFamily: "var(--font-display)" }}>
                      {parseFloat(formatTokenAmount(sub.mvtBalance, 18)).toFixed(1)}
                    </p>
                  </div>
                  <div className="text-center rounded-lg bg-white/[0.02] p-2">
                    <p className="text-[9px] text-muted-foreground mb-0.5">USDT</p>
                    <p className="text-[11px] font-bold text-emerald-400" style={{ fontFamily: "var(--font-display)" }}>
                      ${parseFloat(formatTokenAmount(sub.usdtBalance, 18)).toFixed(2)}
                    </p>
                  </div>
                  <div className="text-center rounded-lg bg-white/[0.02] p-2">
                    <p className="text-[9px] text-muted-foreground mb-0.5">Limit</p>
                    <p className="text-[11px] font-bold text-yellow-300" style={{ fontFamily: "var(--font-display)" }}>
                      ${parseFloat(formatTokenAmount(sub.incomeLimit, 18)).toFixed(0)}
                    </p>
                  </div>
                </div>

                <p className="text-[9px] text-muted-foreground/60 mt-2 text-center">
                  Switch MetaMask to <span className="font-mono text-purple-300/80">{sub.address.slice(0, 10)}…</span> to operate this account
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sub-account banner — "go back to main" */}
      {isSubAccount && (
        <div className="glass-card rounded-2xl p-4 slide-in border border-amber-500/20" style={{ animationDelay: "0.075s" }} data-testid="card-main-account-link">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
              <ExternalLink className="h-4 w-4 text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-amber-300" style={{ fontFamily: "var(--font-display)" }}>Rebirth Sub-Account</p>
              <p className="text-[10px] text-muted-foreground">Main account: <span className="font-mono">{shortenAddress(userInfo.mainAccount)}</span></p>
            </div>
            <button
              onClick={() => copyAddr(userInfo.mainAccount)}
              className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors shrink-0"
              title="Copy main account address"
              data-testid="button-copy-main-account"
            >
              {copiedAddr === userInfo.mainAccount
                ? <Check className="h-3.5 w-3.5 text-emerald-400" />
                : <Copy className="h-3.5 w-3.5 text-muted-foreground" />
              }
            </button>
          </div>
          <p className="text-[9px] text-muted-foreground/60 mt-2">
            To switch back to your main account, change to the main wallet address in MetaMask.
          </p>
        </div>
      )}

      {/* Team Quick Stats */}
      <div className="grid grid-cols-3 gap-3 slide-in" style={{ animationDelay: "0.09s" }}>
        <div className="glass-card rounded-xl p-3 text-center" data-testid="card-direct-count">
          <Users className="h-4 w-4 mx-auto text-amber-400 mb-1.5" />
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Directs</p>
          <p className="text-base font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }} data-testid="text-direct-count">{Number(userInfo.directCount)}</p>
        </div>
        <div className="glass-card rounded-xl p-3 text-center" data-testid="card-rebirth-count">
          <RotateCcw className="h-4 w-4 mx-auto text-purple-400 mb-1.5" />
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Rebirths</p>
          <p className="text-base font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }} data-testid="text-rebirth-count">{Number(userInfo.rebirthCount)}</p>
        </div>
        <div className="glass-card rounded-xl p-3 text-center" data-testid="card-rank">
          <TrendingUp className="h-4 w-4 mx-auto text-yellow-300 mb-1.5" />
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Rank</p>
          <p className="text-base font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }} data-testid="text-rank">{userInfo.rank > 0 ? `M${userInfo.rank}` : "—"}</p>
        </div>
      </div>

      {/* Level Income Qualification Alert — L2-L4 need 2 directs, L5-L10 need 5 */}
      {userInfo.isActive && directCount < 2 && (
        <div className="glass-card rounded-2xl p-4 border border-orange-500/20 slide-in" style={{ animationDelay: "0.10s" }} data-testid="card-income-alert">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-lg bg-orange-500/15 flex items-center justify-center shrink-0">
              <Info className="h-4 w-4 text-orange-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-orange-300" style={{ fontFamily: "var(--font-display)" }}>
                Levels 2–10 Income Locked
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Level 1 income is always paid to you. To unlock <strong className="text-orange-300">levels 2–4</strong> you need{" "}
                <strong className="text-orange-300">{2 - directCount} more direct referral{2 - directCount !== 1 ? "s" : ""}</strong>. Until then, deeper-level income goes to the admin pool.
              </p>
              <button onClick={() => setLocation("/income")} className="mt-2 text-[10px] text-orange-400 hover:text-orange-300 flex items-center gap-1" data-testid="link-income-details">
                See all qualification requirements <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3 slide-in" style={{ animationDelay: "0.11s" }}>
        <button onClick={() => setLocation("/income")} className="glass-card rounded-xl p-4 text-left hover:bg-white/[0.04] transition-all group" data-testid="button-quick-income">
          <TrendingUp className="h-5 w-5 text-amber-400 mb-2 group-hover:scale-110 transition-transform" />
          <p className="text-sm font-semibold">Income</p>
          <p className="text-[10px] text-muted-foreground">Level & binary breakdown</p>
        </button>
        <button onClick={() => setLocation("/team")} className="glass-card rounded-xl p-4 text-left hover:bg-white/[0.04] transition-all group" data-testid="button-quick-team">
          <Users className="h-5 w-5 text-blue-400 mb-2 group-hover:scale-110 transition-transform" />
          <p className="text-sm font-semibold">Team</p>
          <p className="text-[10px] text-muted-foreground">Your referrals & tree</p>
        </button>
      </div>
    </div>
  );
}
