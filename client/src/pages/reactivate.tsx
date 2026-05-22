import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Zap, CheckCircle2, AlertCircle,
  RefreshCw, ArrowRight, Shield, Coins, Star, Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { shortenAddress, getTokenContract, MVAULT_CONTRACT_ADDRESS, formatTokenAmount } from "@/lib/contract";
import { ethers } from "ethers";
import type { UserInfo } from "@/hooks/use-web3";

interface ReactivatePageProps {
  account: string;
  userInfo: UserInfo;
  tokenDecimals: number;
  reactivateWithWallet: (pkg: number) => Promise<void>;
  reactivateFromIncomeWallet: (pkg: number) => Promise<void>;
  fetchUserData: () => Promise<void>;
}

const PACKAGES = [
  { pkg: 1, label: "Starter", price: 55, cap: 165, color: "amber", icon: Star },
  { pkg: 2, label: "Pro",     price: 130, cap: 390, color: "yellow", icon: Zap  },
];

function parseReactivateError(err: any): string {
  const reason = err?.reason ?? "";
  if (reason === "IncomeNotExhausted")      return "Your income limit is not yet exhausted.";
  if (reason === "CannotDowngradePackage")  return "Cannot downgrade from Pro to Starter.";
  if (reason === "InsufficientUsdtBalance") return "Your income wallet balance is insufficient.";
  if (reason === "NotActive")               return "Account is not active.";
  if (err?.code === 4001 || String(err?.message).includes("user rejected")) return "Transaction rejected.";
  if (String(err?.message).includes("exceeds allowance")) return "USDT approval failed. Please try again.";
  if (reason) return reason;
  return (err?.shortMessage ?? err?.message ?? "Transaction failed").slice(0, 120);
}

export default function ReactivatePage({
  account, userInfo, tokenDecimals,
  reactivateWithWallet, reactivateFromIncomeWallet, fetchUserData,
}: ReactivatePageProps) {
  const { toast } = useToast();

  const pkgPriceNum = parseFloat(formatTokenAmount(userInfo.packagePrice ?? 0n, tokenDecimals));
  const isPro = pkgPriceNum >= 130;

  const defaultPkg = isPro ? 2 : 1;
  const [selectedPkg, setSelectedPkg] = useState<number>(defaultPkg);
  const [activeMethod, setActiveMethod] = useState<"income" | "wallet">("income");

  const [processing, setProcessing] = useState(false);
  const [walletUsdtBal, setWalletUsdtBal] = useState<bigint | null>(null);
  const [refreshing, setRefreshing]       = useState(false);

  const pkg = PACKAGES.find(p => p.pkg === selectedPkg)!;
  const priceWei = ethers.parseUnits(pkg.price.toString(), 18);

  const incomeWalletBal    = userInfo.usdtBalance ?? 0n;
  const incomeBalNum       = parseFloat(formatTokenAmount(incomeWalletBal, tokenDecimals));
  const hasIncomeFunds     = incomeWalletBal >= priceWei;

  const walletBalNum = walletUsdtBal !== null ? parseFloat(formatTokenAmount(walletUsdtBal, tokenDecimals)) : null;
  const hasWalletFunds = walletUsdtBal !== null && walletUsdtBal >= priceWei;

  const fetchWalletBalance = async () => {
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const token = getTokenContract(provider);
      const bal = await token.balanceOf(account);
      setWalletUsdtBal(bal);
    } catch {}
  };

  useEffect(() => { fetchWalletBalance(); }, [account, selectedPkg]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchWalletBalance();
    setRefreshing(false);
  };

  const handleReactivate = async () => {
    setProcessing(true);
    try {
      if (activeMethod === "income") {
        await reactivateFromIncomeWallet(selectedPkg);
      } else {
        await reactivateWithWallet(selectedPkg);
      }
      toast({
        title: "Reactivated!",
        description: `${pkg.label} package reactivated. Your income limit is reset to $${pkg.cap}.`,
      });
      await fetchUserData();
    } catch (err: any) {
      toast({ title: "Reactivation Failed", description: parseReactivateError(err), variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  const canProceed = activeMethod === "income" ? hasIncomeFunds : hasWalletFunds;

  return (
    <div className="p-4 sm:p-6 max-w-sm mx-auto space-y-4">

      <div className="absolute top-[-15%] left-[-10%] w-[500px] h-[500px] rounded-full bg-amber-600/[0.07] blur-[200px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[400px] h-[400px] rounded-full bg-yellow-500/[0.05] blur-[180px] pointer-events-none" />

      <div className="relative z-10 slide-in">
        <div className="flex items-center gap-2.5 mb-1">
          <Zap className="h-5 w-5 text-amber-400" />
          <h1 className="text-2xl font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }}
            data-testid="text-page-title">Reactivate Account</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Your income limit is exhausted. Reactivate to start earning again.
        </p>
      </div>

      {/* Package selection */}
      <div className="glass-card rounded-2xl p-4 space-y-3 slide-in relative z-10" style={{ animationDelay: "0.02s" }}>
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Choose Package</p>
        <div className="grid grid-cols-2 gap-2">
          {PACKAGES.map(p => {
            const Icon = p.icon;
            const isSelected = selectedPkg === p.pkg;
            const isDisabled = isPro && p.pkg === 1;
            return (
              <button
                key={p.pkg}
                onClick={() => !isDisabled && setSelectedPkg(p.pkg)}
                disabled={isDisabled}
                data-testid={`button-package-${p.pkg}`}
                className={`relative rounded-xl p-4 border text-left transition-all ${
                  isDisabled
                    ? "opacity-40 cursor-not-allowed bg-white/[0.02] border-white/[0.05]"
                    : isSelected
                      ? "bg-amber-500/15 border-amber-500/40"
                      : "bg-white/[0.03] border-white/[0.07] hover:bg-white/[0.06]"
                }`}
              >
                {isSelected && !isDisabled && (
                  <div className="absolute top-2 right-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-amber-400" />
                  </div>
                )}
                <Icon className={`h-5 w-5 mb-2 ${isSelected && !isDisabled ? "text-amber-300" : "text-muted-foreground"}`} />
                <p className={`text-base font-bold ${isSelected && !isDisabled ? "text-amber-300" : ""}`}
                  style={{ fontFamily: "var(--font-display)" }}>
                  ${p.price}
                </p>
                <p className={`text-[11px] font-semibold ${isSelected && !isDisabled ? "text-amber-200" : "text-muted-foreground"}`}>
                  {p.label}
                </p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">Cap: ${p.cap}</p>
                {isDisabled && (
                  <p className="text-[9px] text-red-400/70 mt-1">Cannot downgrade</p>
                )}
              </button>
            );
          })}
        </div>
        {selectedPkg === 2 && !isPro && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/8 border border-amber-500/20">
            <Zap className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <p className="text-[11px] text-amber-300">Upgrading to Pro unlocks rebirth and a $390 cap.</p>
          </div>
        )}
      </div>

      {/* Payment method tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06] slide-in relative z-10" style={{ animationDelay: "0.04s" }}>
        <button
          onClick={() => setActiveMethod("income")}
          className={`flex-1 py-2 rounded-lg text-[11px] font-semibold transition-all ${activeMethod === "income"
            ? "bg-emerald-500/20 border border-emerald-500/25 text-emerald-300"
            : "text-muted-foreground hover:text-foreground"}`}
          data-testid="tab-income-wallet"
        >
          From Income Wallet
        </button>
        <button
          onClick={() => setActiveMethod("wallet")}
          className={`flex-1 py-2 rounded-lg text-[11px] font-semibold transition-all ${activeMethod === "wallet"
            ? "bg-amber-500/20 border border-amber-500/25 text-amber-300"
            : "text-muted-foreground hover:text-foreground"}`}
          data-testid="tab-metamask-wallet"
        >
          From MetaMask
        </button>
      </div>

      {/* Income wallet panel */}
      {activeMethod === "income" && (
        <div className="glass-card rounded-2xl p-5 space-y-4 slide-in relative z-10" style={{ animationDelay: "0.06s" }}>
          <div className="flex items-center gap-2 mb-1">
            <Coins className="h-4 w-4 text-emerald-400" />
            <p className="text-sm font-semibold text-emerald-300">Income Wallet</p>
            <Badge className="ml-auto text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">No approval needed</Badge>
          </div>

          <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] p-4 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Available balance</span>
              <span className={`text-sm font-bold ${hasIncomeFunds ? "text-emerald-400" : "text-red-400"}`}
                data-testid="text-income-wallet-balance"
                style={{ fontFamily: "var(--font-display)" }}>
                ${incomeBalNum.toFixed(2)}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${hasIncomeFunds
                  ? "bg-gradient-to-r from-emerald-600 to-emerald-400"
                  : "bg-gradient-to-r from-red-600 to-orange-400"}`}
                style={{ width: `${Math.min(100, (incomeBalNum / pkg.price) * 100)}%` }}
              />
            </div>
            <div className="flex justify-between">
              <span className="text-[10px] text-muted-foreground/60">
                {hasIncomeFunds ? `Sufficient (need $${pkg.price})` : `Need $${Math.max(0, pkg.price - incomeBalNum).toFixed(2)} more`}
              </span>
              <span className="text-[10px] text-muted-foreground/50">${pkg.price} required</span>
            </div>
          </div>

          {!hasIncomeFunds && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/8 border border-amber-500/15">
              <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-300/90 leading-relaxed">
                Not enough in your income wallet. Earn more or use MetaMask wallet instead.
              </p>
            </div>
          )}

          <button
            onClick={handleReactivate}
            disabled={!hasIncomeFunds || processing}
            className="w-full glow-button text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid="button-reactivate-income"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {processing
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
              : <><Coins className="h-4 w-4" /> Reactivate {pkg.label} — ${pkg.price} from Income</>
            }
          </button>
        </div>
      )}

      {/* MetaMask wallet panel */}
      {activeMethod === "wallet" && (
        <div className="glass-card rounded-2xl p-5 space-y-4 slide-in relative z-10" style={{ animationDelay: "0.06s" }}>
          <div className="flex items-center gap-2 mb-1">
            <Wallet className="h-4 w-4 text-amber-400" />
            <p className="text-sm font-semibold text-amber-300">MetaMask Wallet</p>
            <Badge className="ml-auto text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/20">Approve + Pay</Badge>
          </div>

          <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] p-4 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Wallet className="h-3 w-3" /> Wallet USDT balance
              </span>
              {walletUsdtBal === null ? (
                <span className="text-xs text-muted-foreground animate-pulse">Loading…</span>
              ) : (
                <span className={`text-sm font-bold ${hasWalletFunds ? "text-emerald-400" : "text-red-400"}`}
                  data-testid="text-wallet-usdt-balance"
                  style={{ fontFamily: "var(--font-display)" }}>
                  ${walletBalNum?.toFixed(2)}
                </span>
              )}
            </div>
            {walletUsdtBal !== null && (
              <>
                <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${hasWalletFunds
                      ? "bg-gradient-to-r from-emerald-600 to-emerald-400"
                      : "bg-gradient-to-r from-red-600 to-orange-400"}`}
                    style={{ width: `${Math.min(100, ((walletBalNum ?? 0) / pkg.price) * 100)}%` }}
                  />
                </div>
                <div className="flex justify-between">
                  <span className="text-[10px] text-muted-foreground/60">
                    {hasWalletFunds
                      ? `Sufficient (need $${pkg.price})`
                      : `Need $${Math.max(0, pkg.price - (walletBalNum ?? 0)).toFixed(2)} more`}
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground/50">{shortenAddress(account)}</span>
                </div>
              </>
            )}
          </div>

          {!hasWalletFunds && walletUsdtBal !== null && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-500/8 border border-red-500/15">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-400/90 leading-relaxed">
                You need at least <strong>${pkg.price} USDT</strong> in your MetaMask wallet. Please top up and refresh.
              </p>
            </div>
          )}

          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <Shield className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
              MetaMask will prompt for USDT approval first, then the reactivation transaction.
            </p>
          </div>

          <div className="space-y-2">
            <button
              onClick={handleReactivate}
              disabled={!hasWalletFunds || processing}
              className="w-full glow-button text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              data-testid="button-reactivate-wallet"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {processing
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
                : <><ArrowRight className="h-4 w-4" /> Approve & Reactivate {pkg.label} (${pkg.price})</>
              }
            </button>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="w-full flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground/60 hover:text-muted-foreground py-1 transition-colors"
              data-testid="button-refresh-balance"
            >
              <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
              Refresh balance
            </button>
          </div>
        </div>
      )}

      {/* Summary row */}
      <div className="glass-card rounded-2xl p-4 slide-in relative z-10" style={{ animationDelay: "0.08s" }}>
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">After Reactivation</p>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-[10px] text-muted-foreground/60 mb-1">New Income Limit</p>
            <p className="text-sm font-bold text-emerald-400" style={{ fontFamily: "var(--font-display)" }}>${pkg.cap}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground/60 mb-1">Package</p>
            <p className="text-sm font-bold text-amber-400" style={{ fontFamily: "var(--font-display)" }}>{pkg.label}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground/60 mb-1">Cost</p>
            <p className="text-sm font-bold text-foreground" style={{ fontFamily: "var(--font-display)" }}>${pkg.price}</p>
          </div>
        </div>
      </div>

    </div>
  );
}
