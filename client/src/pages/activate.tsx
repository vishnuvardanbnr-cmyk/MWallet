import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, LogOut, Zap, CheckCircle2, AlertCircle,
  RefreshCw, ArrowRight, Shield, TrendingUp, Users, Wallet,
} from "lucide-react";
import { shortenAddress, getTokenContract, MVAULT_CONTRACT_ADDRESS, formatTokenAmount } from "@/lib/contract";
import { Logo } from "@/components/logo";
import { Badge } from "@/components/ui/badge";
import { ethers } from "ethers";

interface ActivatePageProps {
  account: string;
  approveToken: (amount?: string) => Promise<void>;
  activatePackage: (pkg?: number) => Promise<void>;
  fetchUserData: () => Promise<void>;
  disconnect: () => void;
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

const DISTRIBUTION = [
  { icon: TrendingUp, label: "Level Income", sub: "Up to 15 sponsor levels", pct: 40, color: "text-amber-300",  bar: "bg-amber-400",   bg: "bg-amber-400/10",  border: "border-amber-400/20" },
  { icon: Users,      label: "Binary Pool",  sub: "Matched pair rewards",    pct: 30, color: "text-blue-300",   bar: "bg-blue-500",    bg: "bg-blue-500/10",   border: "border-blue-500/20"  },
  { icon: Shield,     label: "Reserve",      sub: "Ecosystem growth fund",   pct: 30, color: "text-violet-300", bar: "bg-violet-500",  bg: "bg-violet-500/10", border: "border-violet-500/20" },
];

export default function ActivatePage({ account, approveToken, activatePackage, fetchUserData, disconnect }: ActivatePageProps) {
  const { toast } = useToast();
  const [approved,   setApproved]   = useState(false);
  const [approving,  setApproving]  = useState(false);
  const [activating, setActivating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [usdtBalance, setUsdtBalance] = useState<bigint | null>(null);
  const [allowance,   setAllowance]   = useState<bigint>(0n);

  const PACKAGE_PRICE = ethers.parseUnits("130", 18);

  const fetchBalances = async () => {
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
    } catch {}
  };

  useEffect(() => { fetchBalances(); }, [account]);

  const balanceNum = usdtBalance !== null ? parseFloat(formatTokenAmount(usdtBalance, 18)) : null;
  const hasFunds   = usdtBalance !== null && usdtBalance >= PACKAGE_PRICE;
  const step       = approved ? 2 : 1;

  const handleApprove = async () => {
    setApproving(true);
    try {
      await approveToken("130");
      setApproved(true);
      toast({ title: "USDT Approved", description: "You can now activate your account." });
      await fetchBalances();
    } catch (err: any) {
      toast({ title: "Approval Failed", description: parseContractError(err), variant: "destructive" });
    } finally { setApproving(false); }
  };

  const handleActivate = async () => {
    setActivating(true);
    try {
      await activatePackage();
      toast({ title: "Account Activated!", description: "Welcome to M-Vault. Start earning now." });
      await fetchUserData();
    } catch (err: any) {
      toast({ title: "Activation Failed", description: parseContractError(err), variant: "destructive" });
    } finally { setActivating(false); }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchBalances();
    setRefreshing(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background glow */}
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

        {/* Hero card */}
        <div className="glass-card rounded-2xl p-6 space-y-6">

          {/* Header */}
          <div className="text-center space-y-2">
            <div className="h-14 w-14 mx-auto rounded-2xl bg-gradient-to-br from-amber-500/25 to-yellow-400/10 border border-amber-400/15 flex items-center justify-center mb-3">
              <Zap className="h-7 w-7 text-yellow-300" />
            </div>
            <h1 className="text-2xl font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }}
              data-testid="text-page-title">Activate Account</h1>
            <p className="text-xs text-muted-foreground">One-time $130 USDT · Earn up to $390 (3×)</p>
          </div>

          {/* Balance row */}
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Wallet className="h-3.5 w-3.5" /> Your USDT Balance
              </span>
              {usdtBalance === null ? (
                <span className="text-xs text-muted-foreground animate-pulse">Loading…</span>
              ) : (
                <span className={`text-sm font-bold ${hasFunds ? "text-emerald-400" : "text-red-400"}`}
                  data-testid="text-usdt-balance" style={{ fontFamily: "var(--font-display)" }}>
                  ${balanceNum?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
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
                    style={{ width: `${Math.min(100, (balanceNum ?? 0) / 130 * 100)}%` }}
                  />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-muted-foreground/60">
                    {hasFunds ? "Sufficient to activate" : `Need $${Math.max(0, 130 - (balanceNum ?? 0)).toFixed(2)} more`}
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground/50">
                    {shortenAddress(account)}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Low balance warning */}
          {!hasFunds && usdtBalance !== null && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-500/8 border border-red-500/15">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-400/90 leading-relaxed">
                You need at least <strong>$130 USDT</strong> in your wallet to activate. Please top up and refresh.
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
            {/* Step 1 — Approve */}
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
                  : <><CheckCircle2 className="h-4 w-4" /> Step 1 — Approve $130 USDT</>
                }
              </button>
            ) : (
              <div className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-emerald-500/8 border border-emerald-500/20 text-sm font-semibold text-emerald-400">
                <CheckCircle2 className="h-4 w-4" /> USDT Approved
              </div>
            )}

            {/* Step 2 — Activate */}
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
                : <><ArrowRight className="h-4 w-4" /> Step 2 — Activate Account</>
              }
            </button>
          </div>

          {/* Refresh */}
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

        {/* Distribution card */}
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            How $130 Activation is Split
          </p>

          {/* Visual bar */}
          <div className="flex h-2.5 rounded-full overflow-hidden gap-0.5">
            {DISTRIBUTION.map(d => (
              <div key={d.label} className={`${d.bar} opacity-75`} style={{ width: `${d.pct}%` }} />
            ))}
          </div>

          <div className="space-y-2.5">
            {DISTRIBUTION.map(d => (
              <div key={d.label} className={`flex items-center gap-3 p-2.5 rounded-xl ${d.bg} border ${d.border}`}>
                <d.icon className={`h-4 w-4 ${d.color} shrink-0`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold">{d.label}</p>
                  <p className="text-[10px] text-muted-foreground">{d.sub}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-bold ${d.color}`} style={{ fontFamily: "var(--font-display)" }}>
                    {d.pct}%
                  </p>
                  <p className="text-[10px] text-muted-foreground">${130 * d.pct / 100}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
