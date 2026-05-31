import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, LogOut, Zap, CheckCircle2, AlertCircle,
  RefreshCw, ArrowRight, Shield, TrendingUp, Users, Wallet, Coins, Star,
} from "lucide-react";
import { shortenAddress, getTokenContract, MVAULT_CONTRACT_ADDRESS, formatTokenAmount } from "@/lib/contract";
import { Logo } from "@/components/logo";
import { ethers } from "ethers";

interface ActivatePageProps {
  account: string;
  approveToken: (amount?: string) => Promise<void>;
  activatePackage: (pkg?: number) => Promise<void>;
  activateFromBalance: (pkg?: number) => Promise<void>;
  fetchUserData: () => Promise<void>;
  disconnect: () => void;
  virtualUsdtBalance?: bigint;
}

function parseContractError(err: any): string {
  const msg: string = err?.shortMessage || err?.message || "";
  if (err?.reason === "AlreadyActive")    return "This account is already active.";
  if (err?.reason === "NotRegistered")    return "Wallet not registered. Please register first.";
  if (msg.includes("exceeds balance"))    return "Insufficient USDT balance in your wallet.";
  if (msg.includes("exceeds allowance"))  return "USDT approval missing. Please approve first.";
  if (msg.includes("user rejected") || err?.code === 4001) return "Transaction rejected.";
  if (err?.reason) return err.reason;
  return msg.slice(0, 120) || "Transaction failed. Please try again.";
}

const PACKAGES = [
  {
    pkg: 1,
    label: "Starter",
    price: 55,
    cap: 165,
    color: "amber",
    icon: Star,
    desc: "Entry-level package · Earn up to $165 (3×)",
    distribution: [
      { label: "Level Income", pct: 40, color: "text-amber-300", bar: "bg-amber-400", bg: "bg-amber-400/10", border: "border-amber-400/20" },
      { label: "Binary Pool",  pct: 30, color: "text-blue-300",  bar: "bg-blue-500",  bg: "bg-blue-500/10",  border: "border-blue-500/20"  },
      { label: "Reserve",      pct: 30, color: "text-violet-300",bar: "bg-violet-500",bg: "bg-violet-500/10",border: "border-violet-500/20" },
    ],
  },
  {
    pkg: 2,
    label: "Pro",
    price: 130,
    cap: 390,
    color: "yellow",
    icon: Zap,
    desc: "Full package · Earn up to $390 (3×)",
    distribution: [
      { label: "Level Income", pct: 40, color: "text-amber-300", bar: "bg-amber-400", bg: "bg-amber-400/10", border: "border-amber-400/20" },
      { label: "Binary Pool",  pct: 30, color: "text-blue-300",  bar: "bg-blue-500",  bg: "bg-blue-500/10",  border: "border-blue-500/20"  },
      { label: "Reserve",      pct: 30, color: "text-violet-300",bar: "bg-violet-500",bg: "bg-violet-500/10",border: "border-violet-500/20" },
    ],
  },
];

export default function ActivatePage({ account, approveToken, activatePackage, activateFromBalance, fetchUserData, disconnect, virtualUsdtBalance }: ActivatePageProps) {
  const { toast } = useToast();
  const [selectedPkg, setSelectedPkg]   = useState<number | null>(null); // no default — user must choose
  const [approved,   setApproved]       = useState(false);
  const [approving,  setApproving]      = useState(false);
  const [activating, setActivating]     = useState(false);
  const [activatingInternal, setActivatingInternal] = useState(false);
  const [refreshing, setRefreshing]     = useState(false);
  const [usdtBalance, setUsdtBalance]   = useState<bigint | null>(null);
  const [allowance,   setAllowance]     = useState<bigint>(0n);
  const [activeMethod, setActiveMethod] = useState<"wallet" | "internal">("wallet");

  const pkg = selectedPkg !== null ? PACKAGES.find(p => p.pkg === selectedPkg) ?? null : null;
  const PACKAGE_PRICE = pkg ? ethers.parseUnits(pkg.price.toString(), 18) : 0n;

  const virtualBalanceNum = virtualUsdtBalance ? parseFloat(formatTokenAmount(virtualUsdtBalance, 18)) : 0;
  const hasVirtualFunds = pkg !== null && virtualUsdtBalance !== undefined && virtualUsdtBalance >= PACKAGE_PRICE;

  const fetchBalances = async () => {
    if (!pkg) return;
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const token = getTokenContract(provider);
      const [bal, allow] = await Promise.all([
        token.balanceOf(account),
        token.allowance(account, MVAULT_CONTRACT_ADDRESS),
      ]);
      setUsdtBalance(bal);
      setAllowance(allow);
      if ((allow as bigint) >= PACKAGE_PRICE) setApproved(true);
      else setApproved(false);
    } catch {}
  };

  useEffect(() => { fetchBalances(); }, [account, selectedPkg]);

  const balanceNum = usdtBalance !== null ? parseFloat(formatTokenAmount(usdtBalance, 18)) : null;
  const hasFunds   = pkg !== null && usdtBalance !== null && usdtBalance >= PACKAGE_PRICE;
  const step       = approved ? 2 : 1;

  const handleApprove = async () => {
    if (!pkg) return;
    setApproving(true);
    try {
      await approveToken(pkg.price.toString());
      setApproved(true);
      toast({ title: "USDT Approved", description: `You can now activate the ${pkg.label} package.` });
      await fetchBalances();
    } catch (err: any) {
      toast({ title: "Approval Failed", description: parseContractError(err), variant: "destructive" });
    } finally { setApproving(false); }
  };

  const handleActivate = async () => {
    if (!pkg || selectedPkg === null) return;
    setActivating(true);
    try {
      await activatePackage(selectedPkg);
      toast({ title: "Account Activated!", description: `${pkg.label} package activated. Welcome to M-Vault!` });
      await fetchUserData();
    } catch (err: any) {
      toast({ title: "Activation Failed", description: parseContractError(err), variant: "destructive" });
    } finally { setActivating(false); }
  };

  const handleActivateFromBalance = async () => {
    if (!pkg || selectedPkg === null) return;
    setActivatingInternal(true);
    try {
      await activateFromBalance(selectedPkg);
      toast({ title: "Account Activated!", description: `${pkg.label} package activated using your contract balance!` });
      await fetchUserData();
    } catch (err: any) {
      toast({ title: "Activation Failed", description: parseContractError(err), variant: "destructive" });
    } finally { setActivatingInternal(false); }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchBalances();
    setRefreshing(false);
  };

  // Reset approval when package changes
  const handleSelectPackage = (p: number) => {
    setSelectedPkg(p);
    setApproved(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-[-15%] left-[-10%] w-[500px] h-[500px] rounded-full bg-amber-600/[0.07] blur-[200px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[400px] h-[400px] rounded-full bg-yellow-500/[0.05] blur-[180px] pointer-events-none" />

      <div className="w-full max-w-sm relative z-10 space-y-4 slide-in">

        {/* Top bar */}
        <div className="flex items-center justify-between">
          <Logo size="sm" />
          <button onClick={disconnect}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-disconnect">
            <LogOut className="w-3.5 h-3.5" /> Disconnect
          </button>
        </div>

        {/* Package selection */}
        <div className="glass-card rounded-2xl p-4 space-y-3">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Select Package</p>
          <div className="grid grid-cols-2 gap-2">
            {PACKAGES.map(p => {
              const Icon = p.icon;
              const isSelected = selectedPkg === p.pkg;
              return (
                <button
                  key={p.pkg}
                  onClick={() => handleSelectPackage(p.pkg)}
                  data-testid={`button-package-${p.pkg}`}
                  className={`relative rounded-xl p-4 border text-left transition-all ${
                    isSelected
                      ? "bg-amber-500/15 border-amber-500/40"
                      : "bg-white/[0.03] border-white/[0.07] hover:bg-white/[0.06]"
                  }`}
                >
                  {isSelected && (
                    <div className="absolute top-2 right-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-amber-400" />
                    </div>
                  )}
                  <Icon className={`h-5 w-5 mb-2 ${isSelected ? "text-amber-300" : "text-muted-foreground"}`} />
                  <p className={`text-base font-bold ${isSelected ? "text-amber-300" : ""}`} style={{ fontFamily: "var(--font-display)" }}>
                    ${p.price}
                  </p>
                  <p className={`text-[11px] font-semibold ${isSelected ? "text-amber-200" : "text-muted-foreground"}`}>{p.label}</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">Cap: ${p.cap}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Method tabs (show when has virtual funds) */}
        {hasVirtualFunds && (
          <div className="flex gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <button
              onClick={() => setActiveMethod("wallet")}
              className={`flex-1 py-2 rounded-lg text-[11px] font-semibold transition-all ${activeMethod === "wallet" ? "bg-amber-500/20 border border-amber-500/25 text-amber-300" : "text-muted-foreground"}`}
              data-testid="tab-wallet-activation"
            >
              From Wallet USDT
            </button>
            <button
              onClick={() => setActiveMethod("internal")}
              className={`flex-1 py-2 rounded-lg text-[11px] font-semibold transition-all ${activeMethod === "internal" ? "bg-emerald-500/20 border border-emerald-500/25 text-emerald-300" : "text-muted-foreground"}`}
              data-testid="tab-internal-activation"
            >
              From Contract Balance
            </button>
          </div>
        )}

        {/* Internal Activation */}
        {activeMethod === "internal" && hasVirtualFunds && (
          <div className="glass-card rounded-2xl p-6 space-y-5">
            <div className="text-center space-y-2">
              <div className="h-14 w-14 mx-auto rounded-2xl bg-gradient-to-br from-emerald-500/25 to-green-400/10 border border-emerald-400/15 flex items-center justify-center mb-3">
                <Coins className="h-7 w-7 text-emerald-300" />
              </div>
              <h1 className="text-2xl font-bold text-emerald-300" style={{ fontFamily: "var(--font-display)" }}>Internal Activation</h1>
              <p className="text-xs text-muted-foreground">Use your contract USDT balance — {pkg.label} (${pkg.price})</p>
            </div>
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] p-4">
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Coins className="h-3.5 w-3.5" /> Contract USDT Balance
                </span>
                <span className="text-sm font-bold text-emerald-400" style={{ fontFamily: "var(--font-display)" }}>
                  ${virtualBalanceNum.toFixed(2)}
                </span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-700"
                  style={{ width: `${Math.min(100, (virtualBalanceNum / pkg.price) * 100)}%` }}
                />
              </div>
              <p className="text-[10px] text-emerald-400/70 mt-1">Sufficient to activate (${pkg.price} required)</p>
            </div>
            <button
              onClick={handleActivateFromBalance}
              disabled={activatingInternal}
              className="w-full bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2.5 text-sm disabled:opacity-40"
              data-testid="button-activate-from-balance"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {activatingInternal
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Activating…</>
                : <><ArrowRight className="h-4 w-4" /> Activate {pkg.label} Using Contract Balance</>
              }
            </button>
          </div>
        )}

        {/* No package selected — prompt */}
        {!pkg && (
          <div className="glass-card rounded-2xl p-6 text-center space-y-3 border border-amber-500/20" data-testid="card-select-package-prompt">
            <div className="h-12 w-12 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <ArrowRight className="h-6 w-6 text-amber-400" />
            </div>
            <p className="text-sm font-semibold text-amber-300" style={{ fontFamily: "var(--font-display)" }}>Select a package above to continue</p>
            <p className="text-xs text-muted-foreground">Choose Starter ($55) or Pro ($130) to see the approval steps</p>
          </div>
        )}

        {/* Wallet Activation */}
        {pkg && (activeMethod === "wallet" || !hasVirtualFunds) && (
          <div className="glass-card rounded-2xl p-6 space-y-6">
            <div className="text-center space-y-2">
              <div className="h-14 w-14 mx-auto rounded-2xl bg-gradient-to-br from-amber-500/25 to-yellow-400/10 border border-amber-400/15 flex items-center justify-center mb-3">
                <Zap className="h-7 w-7 text-yellow-300" />
              </div>
              <h1 className="text-2xl font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }}
                data-testid="text-page-title">Activate Account</h1>
              <p className="text-xs text-muted-foreground">{pkg.label} package · ${pkg.price} USDT · Earn up to ${pkg.cap} (3×)</p>
            </div>

            {/* Balance row */}
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Wallet className="h-3.5 w-3.5" /> Your Wallet USDT Balance
                </span>
                {usdtBalance === null ? (
                  <span className="text-xs text-muted-foreground animate-pulse">Loading…</span>
                ) : (
                  <span className={`text-sm font-bold ${hasFunds ? "text-emerald-400" : "text-red-400"}`}
                    data-testid="text-usdt-balance" style={{ fontFamily: "var(--font-display)" }}>
                    ${balanceNum?.toFixed(2)}
                  </span>
                )}
              </div>
              {usdtBalance !== null && (
                <>
                  <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${hasFunds
                        ? "bg-gradient-to-r from-emerald-600 to-emerald-400"
                        : "bg-gradient-to-r from-red-600 to-orange-400"}`}
                      style={{ width: `${Math.min(100, (balanceNum ?? 0) / pkg.price * 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-muted-foreground/60">
                      {hasFunds ? "Sufficient to activate" : `Need $${Math.max(0, pkg.price - (balanceNum ?? 0)).toFixed(2)} more`}
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground/50">
                      {shortenAddress(account)}
                    </span>
                  </div>
                </>
              )}
            </div>

            {!hasFunds && usdtBalance !== null && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-500/8 border border-red-500/15">
                <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-xs text-red-400/90 leading-relaxed">
                  You need at least <strong>${pkg.price} USDT</strong> in your wallet to activate. Please top up and refresh.
                </p>
              </div>
            )}

            {/* Step indicator */}
            <div className="flex items-center gap-3">
              <div className={`flex-1 h-px ${step >= 1 ? "bg-amber-400/40" : "bg-white/[0.06]"}`} />
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all ${
                approved
                  ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
                  : "bg-amber-500/10 border-amber-500/25 text-amber-300"
              }`}>
                {approved
                  ? <><CheckCircle2 className="h-3.5 w-3.5" /> Approved</>
                  : <><span className="h-3.5 w-3.5 rounded-full bg-amber-400/20 border border-amber-400/40 flex items-center justify-center text-[9px]">1</span> Approve first</>
                }
              </div>
              <div className={`flex-1 h-px ${step >= 2 ? "bg-amber-400/40" : "bg-white/[0.06]"}`} />
            </div>

            {/* Action buttons */}
            <div className="space-y-2.5">
              {!approved ? (
                <button
                  onClick={handleApprove}
                  disabled={approving || !hasFunds}
                  className="w-full glow-button text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2.5 disabled:opacity-40 disabled:cursor-not-allowed text-sm"
                  data-testid="button-approve-token"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {approving
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Approving USDT…</>
                    : <><CheckCircle2 className="h-4 w-4" /> Step 1 — Approve ${pkg.price} USDT</>
                  }
                </button>
              ) : (
                <div className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-emerald-500/8 border border-emerald-500/20 text-sm font-semibold text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" /> USDT Approved
                </div>
              )}

              <button
                onClick={handleActivate}
                disabled={activating || !approved || !hasFunds}
                className={`w-full font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed ${
                  approved
                    ? "glow-button text-white"
                    : "bg-white/[0.03] border border-white/[0.07] text-muted-foreground"
                }`}
                data-testid="button-activate-package"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {activating
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Activating…</>
                  : <><ArrowRight className="h-4 w-4" /> Step 2 — Activate {pkg.label} (${pkg.price})</>
                }
              </button>
            </div>

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
        )}


      </div>
    </div>
  );
}
