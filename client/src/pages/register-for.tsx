import { useState, useCallback } from "react";
import {
  UserPlus, DollarSign, Loader2, CheckCircle, AlertCircle,
  Info, ArrowLeft, ArrowRight, ChevronRight, Shield, Wallet2
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { formatTokenAmount } from "@/lib/contract";
import { ethers } from "ethers";

const PACKAGE_PRICE_USDT = 130;

interface Props {
  account: string;
  registerAndActivateFor?: (newUser: string, binaryParent: string, placeLeft: boolean) => Promise<void>;
  virtualUsdtBalance?: bigint;
  tokenDecimals?: number;
}

function shortenAddr(addr: string) {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function RegisterForPage({
  account, registerAndActivateFor, virtualUsdtBalance, tokenDecimals = 18,
}: Props) {
  const { toast } = useToast();
  const [newUser, setNewUser]           = useState("");
  const [binaryParent, setBinaryParent] = useState("");
  const [placeLeft, setPlaceLeft]       = useState(true);
  const [processing, setProcessing]     = useState(false);
  const [success, setSuccess]           = useState<string | null>(null);

  const virtualBal = virtualUsdtBalance
    ? parseFloat(formatTokenAmount(virtualUsdtBalance, tokenDecimals))
    : 0;
  const hasFunds = virtualBal >= PACKAGE_PRICE_USDT;

  const isValidAddr = (addr: string) => {
    try { ethers.getAddress(addr); return true; } catch { return false; }
  };

  const newUserValid = isValidAddr(newUser) && newUser.toLowerCase() !== account.toLowerCase();

  const handleSubmit = async () => {
    if (!registerAndActivateFor) return;
    if (!newUserValid) {
      toast({ title: "Invalid Address", description: "Enter a valid wallet address that isn't your own.", variant: "destructive" });
      return;
    }
    if (!hasFunds) {
      toast({ title: "Insufficient Balance", description: `Need at least $${PACKAGE_PRICE_USDT} in your in-app balance.`, variant: "destructive" });
      return;
    }
    setProcessing(true);
    try {
      const parent = binaryParent && isValidAddr(binaryParent) ? binaryParent : ethers.ZeroAddress;
      await registerAndActivateFor(newUser, parent, placeLeft);
      setSuccess(newUser);
      setNewUser("");
      setBinaryParent("");
      setPlaceLeft(true);
      toast({
        title: "Registration Successful!",
        description: `${shortenAddr(newUser)} is now registered & activated under you.`,
      });
    } catch (e: any) {
      const raw = e?.message ?? "Transaction failed";
      const msg = raw.replace(/^execution reverted: /, "").replace(/\(.*\)/, "").trim();
      toast({ title: "Registration Failed", description: msg, variant: "destructive" });
    } finally { setProcessing(false); }
  };

  const breakdown = [
    { label: "Level income → your 10 uplines (15%)", pct: 15, color: "text-emerald-400" },
    { label: "Binary pool (30%)",                     pct: 30, color: "text-blue-400"   },
    { label: "Admin pool (30%)",                      pct: 30, color: "text-violet-400" },
    { label: "Token liquidity — buys MVT (25%)",      pct: 25, color: "text-yellow-300" },
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
            <p className="text-sm text-muted-foreground">Use your in-app balance to register &amp; activate another wallet</p>
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
            <p className="text-xs text-muted-foreground font-mono mt-0.5">{success}</p>
            <p className="text-xs text-muted-foreground mt-1">This wallet is now registered and active. You are their direct sponsor.</p>
          </div>
        </div>
      )}

      {/* Balance card */}
      <div className="glass-card rounded-2xl p-4 slide-in" style={{ animationDelay: "0.05s" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <Wallet2 className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Your In-App Balance</p>
              <p className="text-lg font-bold text-emerald-400" style={{ fontFamily: "var(--font-display)" }}
                data-testid="text-virtual-balance">
                ${virtualBal.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT
              </p>
              <p className="text-[10px] text-muted-foreground/60">Earned income sitting inside the contract</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Cost</p>
            <p className="text-base font-bold text-amber-400">${PACKAGE_PRICE_USDT}</p>
            {!hasFunds && (
              <Badge className="mt-1 text-[10px] bg-red-500/10 text-red-400 border-red-500/20">Insufficient</Badge>
            )}
            {hasFunds && (
              <Badge className="mt-1 text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Sufficient</Badge>
            )}
          </div>
        </div>

        {/* Balance progress bar */}
        <div className="mt-3 space-y-1">
          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${hasFunds
                ? "bg-gradient-to-r from-emerald-600 to-emerald-400"
                : "bg-gradient-to-r from-red-600 to-orange-400"}`}
              style={{ width: `${Math.min(100, (virtualBal / PACKAGE_PRICE_USDT) * 100)}%` }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground/60 text-right">
            ${virtualBal.toFixed(2)} / ${PACKAGE_PRICE_USDT} required
          </p>
        </div>
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
            <UserPlus className="h-4 w-4 text-muted-foreground/60 shrink-0" />
            <input
              type="text"
              value={newUser}
              onChange={e => setNewUser(e.target.value.trim())}
              placeholder="0x… wallet to register"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/30 font-mono"
              data-testid="input-new-user-address"
            />
            {newUser && isValidAddr(newUser) && newUser.toLowerCase() !== account.toLowerCase() && (
              <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
            )}
            {newUser && (!isValidAddr(newUser) || newUser.toLowerCase() === account.toLowerCase()) && (
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
            )}
          </div>
          {newUser && !isValidAddr(newUser) && (
            <p className="text-[11px] text-red-400 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> Invalid wallet address
            </p>
          )}
          {newUser && isValidAddr(newUser) && newUser.toLowerCase() === account.toLowerCase() && (
            <p className="text-[11px] text-orange-400 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> Cannot register your own address
            </p>
          )}
        </div>

        {/* Binary parent (optional) */}
        <div className="space-y-1.5">
          <label className="text-[11px] text-muted-foreground uppercase tracking-wider">
            Binary Parent <span className="text-muted-foreground/40">(optional — defaults to you)</span>
          </label>
          <div className="flex items-center gap-2 rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2.5">
            <Shield className="h-4 w-4 text-muted-foreground/60 shrink-0" />
            <input
              type="text"
              value={binaryParent}
              onChange={e => setBinaryParent(e.target.value.trim())}
              placeholder={`Default: you (${shortenAddr(account)})`}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/30 font-mono"
              data-testid="input-binary-parent"
            />
            {binaryParent && isValidAddr(binaryParent) && (
              <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
            )}
          </div>
          <p className="text-[10px] text-muted-foreground/50">
            Where in the binary tree to place the new user. Leave blank to place directly under you.
          </p>
        </div>

        {/* Placement toggle */}
        <div className="space-y-2">
          <label className="text-[11px] text-muted-foreground uppercase tracking-wider">Binary Placement</label>
          <div className="flex gap-2">
            {[
              { val: true,  label: "Left Leg",  icon: ArrowLeft,  active: "from-blue-600/20 to-cyan-600/20 text-blue-300 border-blue-500/30" },
              { val: false, label: "Right Leg", icon: ArrowRight, active: "from-violet-600/20 to-purple-600/20 text-violet-300 border-violet-500/30" },
            ].map(({ val, label, icon: Icon, active }) => (
              <button key={label} onClick={() => setPlaceLeft(val)}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all ${
                  placeLeft === val
                    ? `bg-gradient-to-r ${active} border`
                    : "bg-white/[0.02] border border-white/[0.05] text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`button-place-${val ? "left" : "right"}`}>
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Summary card */}
        {newUserValid && (
          <div className="p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/15 text-[11px] space-y-1.5"
            data-testid="card-sponsor-info">
            <p className="text-[10px] font-semibold text-emerald-300 uppercase tracking-wider mb-2">Registration Summary</p>
            <div className="flex justify-between">
              <span className="text-muted-foreground">New user</span>
              <span className="font-mono text-emerald-300">{shortenAddr(newUser)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sponsor (you)</span>
              <span className="font-mono text-emerald-300">{shortenAddr(account)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Binary parent</span>
              <span className="font-mono text-muted-foreground">
                {binaryParent && isValidAddr(binaryParent) ? shortenAddr(binaryParent) : `${shortenAddr(account)} (you)`}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Placement</span>
              <span className={`font-semibold ${placeLeft ? "text-blue-400" : "text-violet-400"}`}>
                {placeLeft ? "← Left" : "Right →"}
              </span>
            </div>
            <div className="flex justify-between items-center font-semibold border-t border-white/[0.06] pt-1.5 mt-1">
              <span className="text-muted-foreground">Deducted from your balance</span>
              <span className="text-amber-400">$130 USDT</span>
            </div>
          </div>
        )}

        {/* Submit button — no approval step needed */}
        <button
          onClick={handleSubmit}
          disabled={processing || !newUserValid || !hasFunds}
          className="w-full py-3.5 px-6 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 glow-button text-white"
          data-testid="button-register-for"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          {processing ? "Registering…" : "Register & Activate — $130 from Balance"}
        </button>

        {!hasFunds && (
          <p className="text-[11px] text-red-400 flex items-center gap-1 justify-center -mt-2">
            <AlertCircle className="h-3 w-3" />
            Need at least $130 in your in-app balance. Earn income first or sell MVT tokens.
          </p>
        )}
      </div>

      {/* Breakdown */}
      <div className="glass-card rounded-2xl p-5 slide-in" style={{ animationDelay: "0.12s" }}>
        <div className="flex items-center gap-2 mb-4">
          <DollarSign className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>How $130 is Distributed</span>
        </div>
        <div className="space-y-2.5">
          {breakdown.map((item, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <span className={`text-[11px] text-muted-foreground flex-1`}>{item.label}</span>
              <span className={`text-xs font-bold shrink-0 ${item.color}`}>
                ${(PACKAGE_PRICE_USDT * item.pct / 100).toFixed(2)}
              </span>
            </div>
          ))}
          <div className="h-px bg-white/[0.06] my-1" />
          <div className="flex items-center justify-between font-semibold">
            <span className="text-xs">Total</span>
            <span className="text-sm text-amber-400">$130.00</span>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="glass-card rounded-2xl p-5 slide-in" style={{ animationDelay: "0.15s" }}>
        <div className="flex items-center gap-2 mb-3">
          <Info className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>Notes</span>
        </div>
        <ul className="space-y-2 text-[11px] text-muted-foreground leading-relaxed">
          <li className="flex items-start gap-2">
            <ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-400" />
            <span>Payment is taken from your <strong className="text-foreground/80">in-app USDT balance</strong> — no external wallet transaction or approval needed.</span>
          </li>
          <li className="flex items-start gap-2">
            <ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-400" />
            <span><strong className="text-foreground/80">You become the direct sponsor</strong> — all level income from this user's activity flows to you first.</span>
          </li>
          <li className="flex items-start gap-2">
            <ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-400" />
            <span>Use this to register <strong className="text-foreground/80">sub-accounts</strong> or to onboard a recruit and pay their entry for them.</span>
          </li>
          <li className="flex items-start gap-2">
            <ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-400" />
            <span>Ensure the chosen binary <strong className="text-foreground/80">position is free</strong> — if it's occupied the transaction will fail.</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
