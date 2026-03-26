import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Loader2, LogOut, Wallet, Zap, CheckCircle, AlertCircle, RefreshCw, ArrowRight, Shield, TrendingUp, Users } from "lucide-react";
import { shortenAddress, getTokenContract, MVAULT_CONTRACT_ADDRESS, TOKEN_ADDRESS, formatTokenAmount } from "@/lib/contract";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
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
  if (err?.reason === "AlreadyActive") return "This account is already active.";
  if (err?.reason === "NotRegistered") return "Wallet not registered. Please register first.";
  if (msg.includes("transfer amount exceeds balance") || msg.includes("exceeds balance")) return "Insufficient USDT balance in your wallet.";
  if (msg.includes("transfer amount exceeds allowance") || msg.includes("exceeds allowance")) return "USDT approval missing. Please approve first.";
  if (msg.includes("user rejected") || msg.includes("User rejected") || err?.code === 4001) return "Transaction rejected in MetaMask.";
  if (err?.reason) return err.reason;
  return msg.slice(0, 120) || "Transaction failed. Please try again.";
}

export default function ActivatePage({ account, approveToken, activatePackage, fetchUserData, disconnect }: ActivatePageProps) {
  const { toast } = useToast();
  const [approved, setApproved] = useState(false);
  const [approving, setApproving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [usdtBalance, setUsdtBalance] = useState<bigint | null>(null);
  const [allowance, setAllowance] = useState<bigint>(0n);
  const [refreshing, setRefreshing] = useState(false);

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
      if (allow >= PACKAGE_PRICE) setApproved(true);
    } catch (e) {
      console.error("fetchBalances error:", e);
    }
  };

  useEffect(() => { fetchBalances(); }, [account]);

  const handleApprove = async () => {
    setApproving(true);
    try {
      await approveToken("130");
      setApproved(true);
      toast({ title: "Approved!", description: "USDT approved. You can now activate." });
      await fetchBalances();
    } catch (err: any) {
      toast({ title: "Approval Failed", description: parseContractError(err), variant: "destructive" });
    } finally {
      setApproving(false);
    }
  };

  const handleActivate = async () => {
    setActivating(true);
    try {
      await activatePackage();
      toast({ title: "Activated!", description: "Your M-Vault account is now active." });
      await fetchUserData();
    } catch (err: any) {
      toast({ title: "Activation Failed", description: parseContractError(err), variant: "destructive" });
    } finally {
      setActivating(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchBalances();
    setRefreshing(false);
  };

  const balanceNum = usdtBalance !== null ? parseFloat(formatTokenAmount(usdtBalance, 18)) : null;
  const hasSufficientBalance = usdtBalance !== null && usdtBalance >= PACKAGE_PRICE;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-amber-600/4 via-yellow-600/3 to-amber-800/4" />
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-amber-600/[0.06] blur-[180px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[400px] h-[400px] rounded-full bg-yellow-600/[0.04] blur-[150px] pointer-events-none" />

      <div className="w-full max-w-md relative z-10 space-y-6 slide-in">
        <div className="flex items-center justify-between">
          <Logo size="sm" />
          <button onClick={disconnect} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors" data-testid="button-disconnect">
            <LogOut className="w-3.5 h-3.5" /> Disconnect
          </button>
        </div>

        <div className="premium-card rounded-2xl p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-yellow-400/10 flex items-center justify-center">
              <Zap className="h-6 w-6 text-yellow-300" />
            </div>
            <div>
              <h1 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
                <span className="gradient-text">Activate Your Account</span>
              </h1>
              <p className="text-xs text-muted-foreground">One-time $130 USDT activation to start earning</p>
            </div>
          </div>

          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Package Price</span>
              <span className="font-bold text-yellow-300" data-testid="text-package-price">$130 USDT</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Max Earnings</span>
              <span className="font-bold text-emerald-400">$390 USDT (3×)</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Your Balance</span>
              {usdtBalance === null ? (
                <span className="text-muted-foreground text-xs">Loading...</span>
              ) : (
                <span className={`font-bold ${hasSufficientBalance ? "text-emerald-400" : "text-red-400"}`} data-testid="text-usdt-balance">
                  {balanceNum?.toFixed(2)} USDT
                </span>
              )}
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Wallet</span>
              <span className="font-mono text-xs text-amber-300/80" data-testid="text-wallet-account">{shortenAddress(account)}</span>
            </div>
          </div>

          {!hasSufficientBalance && usdtBalance !== null && (
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
              <p className="text-xs text-red-400">Insufficient USDT balance. You need at least $130 USDT to activate.</p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: TrendingUp, title: "40% Level", desc: "Up to 15 levels" },
              { icon: Users, title: "30% Binary", desc: "Matched pairs" },
              { icon: Shield, title: "30% Reserve", desc: "Ecosystem fund" },
            ].map((item) => (
              <div key={item.title} className="rounded-xl bg-white/[0.02] border border-white/[0.05] p-3 text-center">
                <item.icon className="h-4 w-4 mx-auto text-yellow-300 mb-1.5" />
                <p className="text-[10px] font-bold text-foreground">{item.title}</p>
                <p className="text-[9px] text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {!approved ? (
              <button
                onClick={handleApprove}
                disabled={approving || !hasSufficientBalance}
                className="flex-1 glow-button text-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="button-approve-token"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                {approving ? "Approving..." : "1. Approve USDT"}
              </button>
            ) : (
              <div className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle className="h-4 w-4 text-emerald-400" />
                <span className="text-sm font-semibold text-emerald-400">USDT Approved</span>
              </div>
            )}

            <button
              onClick={handleActivate}
              disabled={activating || !approved || !hasSufficientBalance}
              className="flex-1 glow-button text-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="button-activate-package"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {activating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {activating ? "Activating..." : "2. Activate"}
            </button>
          </div>

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground py-2 transition-colors"
            data-testid="button-refresh-balance"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
            Refresh balance
          </button>
        </div>
      </div>
    </div>
  );
}
