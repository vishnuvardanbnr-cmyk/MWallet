import { useState, useCallback, useEffect } from "react";
import { DollarSign, TrendingUp, TrendingDown, Coins, RefreshCw, Copy, User, Users, Wallet, ArrowRight, GitBranch, Zap, Shield, Bitcoin, RotateCcw, Info, ChevronRight, Check, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatTokenAmount, shortenAddress, getMvaultContract } from "@/lib/contract";
import type { UserInfo, MvtPrice, BinaryPairs, ProfileOnChain } from "@/hooks/use-web3";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { ethers } from "ethers";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

interface DashboardProps {
  userInfo: UserInfo;
  mvtPrice: MvtPrice;
  binaryPairs: BinaryPairs;
  formatAmount: (val: bigint) => string;
  account: string;
  profileOnChain: ProfileOnChain | null;
  sellMvt: (amount: string) => Promise<void>;
  withdrawFunds: (amount: string) => Promise<void>;
  withdrawBtcPool: (amount: string) => Promise<void>;
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
  profileOnChain, sellMvt, withdrawFunds, withdrawBtcPool, rebirth, fetchUserData, approveToken,
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
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        const contract = getMvaultContract(provider);
        const filter = contract.filters.Reborn(account);
        let events: any[];
        try {
          events = await contract.queryFilter(filter, 0);
        } catch {
          const current = await provider.getBlockNumber();
          events = await contract.queryFilter(filter, Math.max(0, current - 100000));
        }
        if (!events.length) { setSubAccounts([]); return; }

        const results: SubAccountInfo[] = [];
        for (let i = 0; i < events.length; i++) {
          const subAddr: string = events[i].args?.[1];
          if (!subAddr) continue;
          try {
            const info = await contract.getUserInfo(subAddr);
            results.push({
              address: subAddr,
              mvtBalance: info[10],
              usdtBalance: info[14],
              incomeLimit: info[13],
              rebirthCount: info[20],
              isActive: info[1],
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

  const buyPriceNum = parseFloat(formatTokenAmount(mvtPrice.buyPrice, 18));
  const sellPriceNum = parseFloat(formatTokenAmount(mvtPrice.sellPrice, 18));

  const mvtBalanceNum = parseFloat(formatTokenAmount(userInfo.mvtBalance, 18));
  const usdtBalanceNum = parseFloat(formatTokenAmount(userInfo.usdtBalance, 18));
  const incomeLimitNum = parseFloat(formatTokenAmount(userInfo.incomeLimit, 18));
  const rebirthPoolNum = parseFloat(formatTokenAmount(userInfo.rebirthPool, 18));
  const btcPoolNum = parseFloat(formatTokenAmount(userInfo.btcPoolBalance, 18));
  const totalReceivedNum = parseFloat(formatTokenAmount(userInfo.totalReceived, 18));

  const estimatedSellValue = sellPriceNum > 0 ? mvtBalanceNum * sellPriceNum * 0.9 : 0;
  const incomeUsed = 390 - incomeLimitNum;
  const incomeProgress = Math.min(100, (incomeUsed / 390) * 100);

  const leftCount = Number(userInfo.leftSubUsers);
  const rightCount = Number(userInfo.rightSubUsers);
  const currentPairs = Number(binaryPairs.currentPairs);
  const newPairs = Number(binaryPairs.newPairs);

  const isSubAccount = userInfo.mainAccount !== ZERO_ADDRESS;

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
          <button onClick={() => fetchUserData()} className="p-2 rounded-lg hover:bg-white/[0.04] text-muted-foreground hover:text-foreground transition-all" data-testid="button-refresh-dashboard">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        {isSubAccount && (
          <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <Info className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <p className="text-xs text-amber-400">Sub-account of {shortenAddress(userInfo.mainAccount)}</p>
          </div>
        )}
      </div>

      {/* MVT Price Banner */}
      <div className="grid grid-cols-3 gap-3 slide-in" style={{ animationDelay: "0.02s" }}>
        <div className="glass-card rounded-xl p-3 text-center" data-testid="card-buy-price">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">MVT Buy Price</p>
          <p className="text-sm font-bold text-amber-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-buy-price">
            ${buyPriceNum > 0 ? buyPriceNum.toFixed(6) : "—"}
          </p>
        </div>
        <div className="glass-card rounded-xl p-3 text-center" data-testid="card-sell-price">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">MVT Sell Price</p>
          <p className="text-sm font-bold text-emerald-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-sell-price">
            ${sellPriceNum > 0 ? sellPriceNum.toFixed(6) : "—"}
          </p>
        </div>
        <div className="glass-card rounded-xl p-3 text-center" data-testid="card-total-received">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Total Earned</p>
          <p className="text-sm font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }} data-testid="text-total-received">
            {mvtFmt(userInfo.totalReceived)} MVT
          </p>
        </div>
      </div>

      {/* Main Balances */}
      <div className="grid grid-cols-2 gap-4 slide-in" style={{ animationDelay: "0.04s" }}>
        {/* MVT Balance */}
        <div className="stat-card rounded-2xl p-5 col-span-2 sm:col-span-1" data-testid="card-stat-mvt-balance">
          <div className="flex items-start justify-between mb-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
              <Coins className="h-5 w-5 text-yellow-300" />
            </div>
            <Badge variant="outline" className="text-[9px] border-amber-500/30 text-amber-400">Virtual MVT</Badge>
          </div>
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">MVT Balance</p>
          <p className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }} data-testid="text-mvt-balance">
            <span className="gradient-text">{mvtFmt(userInfo.mvtBalance)}</span>
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">≈ ${estimatedSellValue.toFixed(2)} USDT at sell price</p>
          <button
            onClick={() => setLocation("/sell-tokens")}
            className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs font-semibold text-amber-400 hover:bg-amber-500/15 transition-all"
            data-testid="button-sell-mvt"
          >
            <TrendingDown className="h-3.5 w-3.5" /> Sell MVT
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
            <p className="text-[10px] text-muted-foreground">${incomeUsed.toFixed(2)} / $390 used</p>
          </div>
        </div>

        {/* BTC Pool */}
        <div className="glass-card rounded-2xl p-4" data-testid="card-btc-pool">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-8 w-8 rounded-lg bg-orange-500/15 flex items-center justify-center">
              <Bitcoin className="h-4 w-4 text-orange-400" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">BTC Pool</p>
              <p className="text-sm font-bold" style={{ fontFamily: "var(--font-display)" }} data-testid="text-btc-pool">
                ${btcPoolNum.toFixed(2)}
              </p>
            </div>
          </div>
          <button
            onClick={() => setLocation("/swap")}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl bg-orange-500/10 border border-orange-500/20 text-[10px] font-semibold text-orange-400 hover:bg-orange-500/15 transition-all"
            data-testid="button-btc-swap"
          >
            Swap to BTC <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Rebirth Pool */}
      {rebirthPoolNum > 0 && (
        <div className="glass-card rounded-2xl p-4 slide-in" style={{ animationDelay: "0.07s" }} data-testid="card-rebirth-pool">
          <div className="flex items-center justify-between">
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
            {rebirthPoolNum >= 130 && (
              <Badge variant="outline" className="text-[9px] border-purple-500/30 text-purple-400 animate-pulse">
                Rebirth Ready!
              </Badge>
            )}
          </div>
          {rebirthPoolNum < 130 && (
            <p className="text-[10px] text-muted-foreground mt-2">
              ${(130 - rebirthPoolNum).toFixed(2)} more needed to trigger rebirth ($130 required)
            </p>
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
                    <p className="text-[9px] text-muted-foreground mb-0.5">MVT</p>
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

      {/* Binary Tree Summary */}
      <div className="glass-card rounded-2xl p-5 slide-in" style={{ animationDelay: "0.08s" }} data-testid="card-binary-summary">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-blue-500/15 flex items-center justify-center">
              <GitBranch className="h-4.5 w-4.5 text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}>Binary Network</p>
              <p className="text-[10px] text-muted-foreground">{leftCount + rightCount} total team members</p>
            </div>
          </div>
          <button onClick={() => setLocation("/binary")} className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-1" data-testid="link-binary-details">
            Details <ChevronRight className="h-3 w-3" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]" data-testid="card-left-team">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Left Team</p>
            <p className="text-lg font-bold text-blue-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-left-count">{leftCount}</p>
          </div>
          <div className="text-center p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Matched</p>
            <p className="text-lg font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }} data-testid="text-matched-pairs">{Number(userInfo.matchedPairs)}</p>
          </div>
          <div className="text-center p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]" data-testid="card-right-team">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Right Team</p>
            <p className="text-lg font-bold text-purple-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-right-count">{rightCount}</p>
          </div>
        </div>

        {newPairs > 0 && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <Zap className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            <p className="text-xs text-emerald-400">{newPairs} new pair{newPairs !== 1 ? "s" : ""} pending binary distribution</p>
          </div>
        )}
      </div>

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
        <div className="glass-card rounded-xl p-3 text-center" data-testid="card-power-leg">
          <TrendingUp className="h-4 w-4 mx-auto text-yellow-300 mb-1.5" />
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Power Leg Pts</p>
          <p className="text-base font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }} data-testid="text-power-leg-points">{Number(userInfo.powerLegPoints)}</p>
        </div>
      </div>

      {/* Binary Tree Visual */}
      <div className="glass-card rounded-2xl p-5 slide-in" style={{ animationDelay: "0.10s" }} data-testid="card-binary-tree">
        <h2 className="text-sm font-bold mb-4" style={{ fontFamily: "var(--font-display)" }}>
          <span className="gradient-text">My Binary Position</span>
        </h2>
        <div className="flex flex-col items-center gap-3">
          {/* Me */}
          <div className="rounded-xl px-5 py-3 bg-gradient-to-br from-amber-500/20 to-yellow-400/10 border border-amber-500/30 text-center" data-testid="card-self-node">
            <div className="h-8 w-8 mx-auto rounded-lg bg-amber-500/20 flex items-center justify-center mb-1.5">
              <User className="h-4 w-4 text-yellow-300" />
            </div>
            <p className="text-xs font-semibold text-yellow-300">You</p>
            <p className="text-[9px] font-mono text-muted-foreground">{shortenAddress(account)}</p>
          </div>
          {/* Children */}
          <div className="grid grid-cols-2 gap-4 w-full max-w-xs">
            {[
              { label: "Left", address: userInfo.leftChild, count: leftCount, color: "border-blue-500/30 text-blue-400 bg-blue-500/10" },
              { label: "Right", address: userInfo.rightChild, count: rightCount, color: "border-purple-500/30 text-purple-400 bg-purple-500/10" },
            ].map(({ label, address, count, color }) => {
              const isEmpty = !address || address === ZERO_ADDRESS;
              return (
                <div
                  key={label}
                  className={`rounded-xl p-3 text-center border ${isEmpty ? "border-dashed border-white/[0.08] bg-white/[0.02]" : color}`}
                  data-testid={`card-${label.toLowerCase()}-child`}
                >
                  <div className="h-7 w-7 mx-auto rounded-lg flex items-center justify-center mb-1.5 bg-white/[0.05]">
                    <User className={`h-3.5 w-3.5 ${isEmpty ? "text-muted-foreground/30" : color.split(" ")[1]}`} />
                  </div>
                  <p className="text-[10px] text-muted-foreground">{label}</p>
                  {isEmpty ? (
                    <p className="text-[9px] text-muted-foreground/40 mt-0.5">Empty</p>
                  ) : (
                    <>
                      <p className="text-[9px] font-mono mt-0.5" data-testid={`text-${label.toLowerCase()}-address`}>{shortenAddress(address)}</p>
                      <p className="text-[9px] text-muted-foreground">{count} members</p>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

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
