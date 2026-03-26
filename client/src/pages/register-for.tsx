import { useState, useCallback } from "react";
import {
  UserPlus, DollarSign, Loader2, CheckCircle, AlertCircle,
  Info, ArrowLeft, ArrowRight, ToggleLeft, ToggleRight,
  Wallet, Users, ChevronRight, Shield
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { MVAULT_CONTRACT_ADDRESS, getTokenContract, formatTokenAmount } from "@/lib/contract";
import { ethers } from "ethers";
import { Link } from "wouter";

const PACKAGE_PRICE_USDT = 130;

interface Props {
  account: string;
  registerAndActivateFor?: (newUser: string, binaryParent: string, placeLeft: boolean) => Promise<void>;
  approveToken?: () => Promise<void>;
  walletUsdtBalance?: bigint;
  tokenDecimals?: number;
}

function shortenAddr(addr: string) {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function RegisterForPage({
  account, registerAndActivateFor, approveToken, walletUsdtBalance, tokenDecimals = 18,
}: Props) {
  const { toast } = useToast();
  const [newUser, setNewUser]             = useState("");
  const [binaryParent, setBinaryParent]   = useState("");
  const [placeLeft, setPlaceLeft]         = useState(true);
  const [processing, setProcessing]       = useState(false);
  const [approvingUsdt, setApprovingUsdt] = useState(false);
  const [allowance, setAllowance]         = useState<bigint>(0n);
  const [loadingAllowance, setLoadingAllowance] = useState(false);
  const [success, setSuccess]             = useState<string | null>(null);

  const packageBn = ethers.parseUnits(PACKAGE_PRICE_USDT.toString(), tokenDecimals);
  const needsApproval = allowance < packageBn;
  const walletBal = walletUsdtBalance ? parseFloat(formatTokenAmount(walletUsdtBalance, tokenDecimals)) : 0;
  const hasFunds  = walletBal >= PACKAGE_PRICE_USDT;

  const isValidAddr = (addr: string) => {
    try { ethers.getAddress(addr); return true; } catch { return false; }
  };

  const loadAllowance = useCallback(async () => {
    if (!account) return;
    setLoadingAllowance(true);
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const usdt = getTokenContract(provider);
      const val = await usdt.allowance(account, MVAULT_CONTRACT_ADDRESS);
      setAllowance(val as bigint);
    } catch {}
    finally { setLoadingAllowance(false); }
  }, [account]);

  // Load allowance once on mount
  useState(() => { loadAllowance(); });

  const handleApprove = async () => {
    if (!approveToken) return;
    setApprovingUsdt(true);
    try {
      await approveToken();
      await loadAllowance();
      toast({ title: "USDT Approved", description: "You can now register users." });
    } catch (e: any) {
      toast({ title: "Approval Failed", description: e?.message ?? "Please try again.", variant: "destructive" });
    } finally { setApprovingUsdt(false); }
  };

  const handleSubmit = async () => {
    if (!registerAndActivateFor) return;
    if (!isValidAddr(newUser)) {
      toast({ title: "Invalid Address", description: "Please enter a valid wallet address.", variant: "destructive" });
      return;
    }
    if (newUser.toLowerCase() === account.toLowerCase()) {
      toast({ title: "Cannot register yourself", variant: "destructive" });
      return;
    }
    if (!hasFunds) {
      toast({ title: "Insufficient Balance", description: `Need $${PACKAGE_PRICE_USDT} USDT in your wallet.`, variant: "destructive" });
      return;
    }

    setProcessing(true);
    try {
      await registerAndActivateFor(newUser, binaryParent || ethers.ZeroAddress, placeLeft);
      setSuccess(newUser);
      setNewUser("");
      setBinaryParent("");
      setPlaceLeft(true);
      await loadAllowance();
      toast({
        title: "Registration Successful!",
        description: `${shortenAddr(newUser)} is now registered & activated under you.`,
      });
    } catch (e: any) {
      const msg = (e?.message ?? "Transaction failed").replace(/^execution reverted: /, "");
      toast({ title: "Registration Failed", description: msg, variant: "destructive" });
    } finally { setProcessing(false); }
  };

  // Breakdown percentages
  const breakdown = [
    { label: "Level income (15% → your 10 uplines)", pct: 15, color: "text-emerald-400", bg: "bg-emerald-500/10" },
    { label: "Binary pool (30%)",                     pct: 30, color: "text-blue-400",    bg: "bg-blue-500/10"   },
    { label: "Admin pool (30%)",                      pct: 30, color: "text-violet-400",  bg: "bg-violet-500/10" },
    { label: "Token liquidity (25% → MVT tokens)",    pct: 25, color: "text-yellow-300",  bg: "bg-yellow-500/10" },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-xl mx-auto">

      {/* Header */}
      <div className="slide-in">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-500/20 via-teal-500/20 to-cyan-400/20 flex items-center justify-center">
            <UserPlus className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }}
              data-testid="text-register-for-title">Register &amp; Activate</h1>
            <p className="text-sm text-muted-foreground">Pay for another user's registration · You become their sponsor</p>
          </div>
        </div>
      </div>

      {/* Success banner */}
      {success && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-start gap-3 slide-in"
          data-testid="banner-success">
          <CheckCircle className="h-5 w-5 text-emerald-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-300">Registration Successful!</p>
            <p className="text-xs text-emerald-400/80 mt-0.5 font-mono">{success}</p>
            <p className="text-xs text-muted-foreground mt-1">This wallet is now registered and active. You are their direct sponsor.</p>
          </div>
        </div>
      )}

      {/* Wallet balance check */}
      <div className="glass-card rounded-2xl p-4 flex items-center justify-between slide-in" style={{ animationDelay: "0.05s" }}>
        <div className="flex items-center gap-3">
          <Wallet className="h-5 w-5 text-emerald-400" />
          <div>
            <p className="text-xs text-muted-foreground">Your Wallet USDT</p>
            <p className="text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}
              data-testid="text-wallet-balance">${walletBal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Cost to Register</p>
          <p className="text-sm font-bold text-amber-400">${PACKAGE_PRICE_USDT} USDT</p>
        </div>
        {!hasFunds && (
          <Badge className="ml-2 bg-red-500/10 text-red-400 border-red-500/20">Insufficient</Badge>
        )}
      </div>

      {/* Main form */}
      <div className="glass-card rounded-2xl p-5 space-y-5 slide-in" style={{ animationDelay: "0.08s" }}>

        {/* New user address */}
        <div className="space-y-1.5">
          <label className="text-[11px] text-muted-foreground uppercase tracking-wider">
            New User Wallet Address <span className="text-red-400">*</span>
          </label>
          <div className={`flex items-center gap-2 rounded-xl bg-white/[0.03] border px-3 py-2.5 transition-colors ${
            newUser && !isValidAddr(newUser) ? "border-red-500/40" : "border-white/[0.06]"
          }`}>
            <Users className="h-4 w-4 text-muted-foreground/60 shrink-0" />
            <input
              type="text"
              value={newUser}
              onChange={e => setNewUser(e.target.value.trim())}
              placeholder="0x… wallet address to register"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/30 font-mono"
              data-testid="input-new-user-address"
            />
            {newUser && isValidAddr(newUser) && (
              <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
            )}
            {newUser && !isValidAddr(newUser) && (
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
            )}
          </div>
          {newUser && !isValidAddr(newUser) && (
            <p className="text-[11px] text-red-400 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> Invalid wallet address
            </p>
          )}
          {newUser.toLowerCase() === account.toLowerCase() && isValidAddr(newUser) && (
            <p className="text-[11px] text-orange-400 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> Cannot register your own address
            </p>
          )}
        </div>

        {/* Binary parent (optional) */}
        <div className="space-y-1.5">
          <label className="text-[11px] text-muted-foreground uppercase tracking-wider">
            Binary Parent Address <span className="text-muted-foreground/50">(optional — defaults to your address)</span>
          </label>
          <div className="flex items-center gap-2 rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2.5">
            <Shield className="h-4 w-4 text-muted-foreground/60 shrink-0" />
            <input
              type="text"
              value={binaryParent}
              onChange={e => setBinaryParent(e.target.value.trim())}
              placeholder={`Default: ${shortenAddr(account)} (you)`}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/30 font-mono"
              data-testid="input-binary-parent"
            />
            {binaryParent && isValidAddr(binaryParent) && (
              <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
            )}
          </div>
          <p className="text-[10px] text-muted-foreground/60">
            The binary parent is where the new user will be placed in the team tree. Leave blank to place under you.
          </p>
        </div>

        {/* Placement toggle */}
        <div className="space-y-2">
          <label className="text-[11px] text-muted-foreground uppercase tracking-wider">Binary Placement</label>
          <div className="flex gap-2">
            <button
              onClick={() => setPlaceLeft(true)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all ${
                placeLeft
                  ? "bg-gradient-to-r from-blue-600/20 to-cyan-600/20 text-blue-300 border border-blue-500/30"
                  : "bg-white/[0.02] border border-white/[0.05] text-muted-foreground hover:text-foreground"
              }`}
              data-testid="button-place-left"
            >
              <ArrowLeft className="h-4 w-4" />
              Left Leg
            </button>
            <button
              onClick={() => setPlaceLeft(false)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all ${
                !placeLeft
                  ? "bg-gradient-to-r from-violet-600/20 to-purple-600/20 text-violet-300 border border-violet-500/30"
                  : "bg-white/[0.02] border border-white/[0.05] text-muted-foreground hover:text-foreground"
              }`}
              data-testid="button-place-right"
            >
              Right Leg
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Sponsorship info */}
        {isValidAddr(newUser) && newUser.toLowerCase() !== account.toLowerCase() && (
          <div className="p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/15 text-[11px] space-y-1"
            data-testid="card-sponsor-info">
            <p className="font-semibold text-emerald-300 mb-1.5">Registration Summary</p>
            <div className="flex justify-between">
              <span className="text-muted-foreground">New user</span>
              <span className="font-mono text-emerald-300">{shortenAddr(newUser)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Direct sponsor (you)</span>
              <span className="font-mono text-emerald-300">{shortenAddr(account)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Binary parent</span>
              <span className="font-mono text-muted-foreground">
                {binaryParent && isValidAddr(binaryParent) ? shortenAddr(binaryParent) : shortenAddr(account) + " (you)"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Placement</span>
              <span className={`font-semibold ${placeLeft ? "text-blue-400" : "text-violet-400"}`}>
                {placeLeft ? "← Left Leg" : "Right Leg →"}
              </span>
            </div>
            <div className="flex justify-between font-semibold border-t border-white/[0.06] pt-1.5 mt-1">
              <span className="text-muted-foreground">You pay</span>
              <span className="text-amber-400">$130 USDT</span>
            </div>
          </div>
        )}

        {/* Approve or Submit */}
        <div className="space-y-2">
          {needsApproval ? (
            <button onClick={handleApprove} disabled={approvingUsdt || loadingAllowance}
              className="w-full py-3.5 px-6 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 bg-blue-500/20 border border-blue-500/30 text-blue-300 hover:bg-blue-500/25"
              data-testid="button-approve-usdt">
              {approvingUsdt ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              {approvingUsdt ? "Approving USDT…" : "Step 1: Approve $130 USDT"}
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={processing || !isValidAddr(newUser) || newUser.toLowerCase() === account.toLowerCase() || !hasFunds}
              className="w-full py-3.5 px-6 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 glow-button text-white"
              data-testid="button-register-for"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              {processing ? "Processing…" : "Register & Activate Now"}
            </button>
          )}

          {!hasFunds && (
            <p className="text-[11px] text-red-400 flex items-center gap-1 justify-center">
              <AlertCircle className="h-3 w-3" />
              Insufficient wallet USDT — need at least $130
            </p>
          )}
        </div>
      </div>

      {/* Cost breakdown */}
      <div className="glass-card rounded-2xl p-5 slide-in" style={{ animationDelay: "0.12s" }}>
        <div className="flex items-center gap-2 mb-4">
          <Info className="h-4 w-4 text-blue-400" />
          <span className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>How the $130 is Used</span>
        </div>
        <div className="space-y-2">
          {breakdown.map((item, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-1">
                <div className={`w-1.5 h-1.5 rounded-full ${item.bg} border border-current ${item.color}`} />
                <span className="text-[11px] text-muted-foreground">{item.label}</span>
              </div>
              <div className="text-right shrink-0">
                <span className={`text-xs font-bold ${item.color}`}>
                  ${(PACKAGE_PRICE_USDT * item.pct / 100).toFixed(2)}
                </span>
                <span className="text-[10px] text-muted-foreground/50 ml-1">({item.pct}%)</span>
              </div>
            </div>
          ))}
          <div className="h-px bg-white/[0.06] my-1" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">Total</span>
            <span className="text-sm font-bold text-amber-400">$130.00 USDT</span>
          </div>
        </div>
      </div>

      {/* Info callout */}
      <div className="glass-card rounded-2xl p-5 space-y-3 slide-in" style={{ animationDelay: "0.15s" }}>
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>Important Notes</span>
        </div>
        <ul className="space-y-2 text-[11px] text-muted-foreground leading-relaxed">
          <li className="flex items-start gap-2">
            <ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-400" />
            <span><strong className="text-foreground/80">You are the direct sponsor</strong> — all future income from this user's activity flows up through you first.</span>
          </li>
          <li className="flex items-start gap-2">
            <ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-400" />
            <span>The new user's wallet must not already be registered in the system.</span>
          </li>
          <li className="flex items-start gap-2">
            <ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-400" />
            <span>This is useful for <strong className="text-foreground/80">sub-accounts</strong> or when onboarding a recruit and paying their entry on their behalf.</span>
          </li>
          <li className="flex items-start gap-2">
            <ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-400" />
            <span>You must be registered and active yourself before using this feature.</span>
          </li>
          <li className="flex items-start gap-2">
            <ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-400" />
            <span>Make sure the <strong className="text-foreground/80">binary position is free</strong> on the chosen parent. If it is already occupied, the transaction will fail.</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
