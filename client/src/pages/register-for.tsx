import { useState, useCallback, useEffect } from "react";
import {
  UserPlus, DollarSign, Loader2, CheckCircle2, AlertCircle,
  ArrowLeft, ArrowRight, Shield, Wallet, ChevronDown, ChevronUp,
  Users, Zap, Info
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatTokenAmount } from "@/lib/contract";
import { ethers } from "ethers";

const PACKAGE_PRICE = 130;

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

function isAddr(addr: string) {
  try { ethers.getAddress(addr); return true; } catch { return false; }
}

const DISTRIBUTION = [
  { label: "Level Income",  sublabel: "Paid to your 10 uplines", pct: 15, color: "bg-emerald-500", text: "text-emerald-400" },
  { label: "Binary Pool",   sublabel: "Team bonus pool",         pct: 30, color: "bg-blue-500",    text: "text-blue-400"   },
  { label: "Admin Pool",    sublabel: "Platform operations",     pct: 30, color: "bg-violet-500",  text: "text-violet-400" },
  { label: "Token Buy",     sublabel: "Buys MVT for new user",   pct: 25, color: "bg-amber-400",   text: "text-amber-300"  },
];

export default function RegisterForPage({
  account, registerAndActivateFor, virtualUsdtBalance, tokenDecimals = 18,
}: Props) {
  const { toast } = useToast();

  const [newUser, setNewUser]               = useState("");
  const [binaryParent, setBinaryParent]     = useState("");
  const [placeLeft, setPlaceLeft]           = useState(true);
  const [showAdvanced, setShowAdvanced]     = useState(false);
  const [showConfirm, setShowConfirm]       = useState(false);
  const [processing, setProcessing]         = useState(false);
  const [lastSuccess, setLastSuccess]       = useState<string | null>(null);

  const virtualBal = virtualUsdtBalance
    ? parseFloat(formatTokenAmount(virtualUsdtBalance, tokenDecimals))
    : 0;
  const hasFunds    = virtualBal >= PACKAGE_PRICE;
  const addrValid   = isAddr(newUser) && newUser.toLowerCase() !== account.toLowerCase();
  const parentValid = binaryParent === "" || isAddr(binaryParent);
  const canSubmit   = addrValid && parentValid && hasFunds;

  const effectiveParent = binaryParent && isAddr(binaryParent) ? binaryParent : account;

  const handleSubmit = async () => {
    if (!registerAndActivateFor || !canSubmit) return;
    setProcessing(true);
    setShowConfirm(false);
    try {
      const parent = binaryParent && isAddr(binaryParent) ? binaryParent : ethers.ZeroAddress;
      await registerAndActivateFor(newUser, parent, placeLeft);
      setLastSuccess(newUser);
      setNewUser("");
      setBinaryParent("");
      setPlaceLeft(true);
      toast({ title: "Registration Successful!", description: `${shortenAddr(newUser)} is now active. You are their direct sponsor.` });
    } catch (e: any) {
      const msg = (e?.message ?? "Transaction failed")
        .replace(/^execution reverted: /, "")
        .replace(/\s*\(.*\)\s*$/, "")
        .trim();
      toast({ title: "Registration Failed", description: msg, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-xl mx-auto space-y-6">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="slide-in">
        <h1 className="text-2xl font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }}
          data-testid="text-page-title">Register &amp; Activate</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Onboard a new wallet using your in-app balance — you become their direct sponsor
        </p>
      </div>

      {/* ── Success notice ───────────────────────────────────────────────── */}
      {lastSuccess && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-emerald-500/8 border border-emerald-500/20 slide-in"
          data-testid="banner-success">
          <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-emerald-300">Registration complete</p>
            <p className="text-xs font-mono text-muted-foreground mt-0.5">{lastSuccess}</p>
            <p className="text-xs text-muted-foreground mt-1">
              This wallet is registered, activated, and linked to you as sponsor.
            </p>
          </div>
        </div>
      )}

      {/* ── Stats row ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 slide-in" style={{ animationDelay: "0.04s" }}>
        <div className="glass-card rounded-2xl p-4" data-testid="card-virtual-balance">
          <Wallet className="h-4 w-4 text-emerald-400 mb-2" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">In-App Balance</p>
          <p className="text-base font-bold text-emerald-400" style={{ fontFamily: "var(--font-display)" }}
            data-testid="text-virtual-balance">${virtualBal.toFixed(2)}</p>
        </div>
        <div className="glass-card rounded-2xl p-4">
          <DollarSign className="h-4 w-4 text-amber-400 mb-2" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Cost</p>
          <p className="text-base font-bold text-amber-400" style={{ fontFamily: "var(--font-display)" }}>$130.00</p>
        </div>
        <div className="glass-card rounded-2xl p-4">
          <Shield className="h-4 w-4 mb-2 text-muted-foreground" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Status</p>
          {hasFunds
            ? <Badge className="text-[10px] bg-emerald-500/12 text-emerald-400 border-emerald-500/20 px-2">Funded</Badge>
            : <Badge className="text-[10px] bg-red-500/12 text-red-400 border-red-500/20 px-2">Low Balance</Badge>
          }
        </div>
      </div>

      {/* ── Form card ────────────────────────────────────────────────────── */}
      <div className="glass-card rounded-2xl p-5 space-y-5 slide-in" style={{ animationDelay: "0.08s" }}>

        {/* New user address */}
        <div className="space-y-2">
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            New User Wallet <span className="text-red-400/80">*</span>
          </label>
          <div className={`flex items-center gap-3 rounded-xl px-4 py-3 bg-white/[0.03] border transition-colors ${
            newUser && !isAddr(newUser) ? "border-red-500/40"
            : newUser && addrValid    ? "border-emerald-500/30"
            : "border-white/[0.07]"
          }`}>
            <Users className="h-4 w-4 text-muted-foreground/50 shrink-0" />
            <input
              type="text"
              value={newUser}
              onChange={e => setNewUser(e.target.value.trim())}
              placeholder="0x…  wallet address to register"
              className="flex-1 bg-transparent text-sm font-mono outline-none placeholder:text-muted-foreground/25"
              data-testid="input-new-user-address"
            />
            {newUser && addrValid && <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />}
            {newUser && !isAddr(newUser) && <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />}
          </div>
          {newUser && !isAddr(newUser) && (
            <p className="text-[11px] text-red-400 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> Not a valid wallet address
            </p>
          )}
          {newUser && isAddr(newUser) && !addrValid && (
            <p className="text-[11px] text-orange-400 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> Cannot register your own address
            </p>
          )}
        </div>

        {/* Placement toggle */}
        <div className="space-y-2">
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Binary Placement
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setPlaceLeft(true)}
              className={`flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all ${
                placeLeft
                  ? "bg-blue-500/10 border border-blue-500/30 text-blue-300"
                  : "bg-white/[0.02] border border-white/[0.06] text-muted-foreground hover:text-foreground"
              }`}
              data-testid="button-place-left"
            >
              <ArrowLeft className="h-4 w-4" /> Left Leg
            </button>
            <button
              onClick={() => setPlaceLeft(false)}
              className={`flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all ${
                !placeLeft
                  ? "bg-violet-500/10 border border-violet-500/30 text-violet-300"
                  : "bg-white/[0.02] border border-white/[0.06] text-muted-foreground hover:text-foreground"
              }`}
              data-testid="button-place-right"
            >
              Right Leg <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Advanced — binary parent */}
        <div className="border-t border-white/[0.05] pt-4">
          <button
            onClick={() => setShowAdvanced(v => !v)}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
            data-testid="button-toggle-advanced"
          >
            {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            Advanced: custom binary parent
            {!showAdvanced && <span className="ml-auto text-muted-foreground/40">defaults to you</span>}
          </button>
          {showAdvanced && (
            <div className="mt-3 space-y-2">
              <label className="text-[11px] text-muted-foreground uppercase tracking-wider">Binary Parent Address</label>
              <div className="flex items-center gap-3 rounded-xl px-4 py-3 bg-white/[0.03] border border-white/[0.07]">
                <Shield className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                <input
                  type="text"
                  value={binaryParent}
                  onChange={e => setBinaryParent(e.target.value.trim())}
                  placeholder={`Default: you (${shortenAddr(account)})`}
                  className="flex-1 bg-transparent text-sm font-mono outline-none placeholder:text-muted-foreground/25"
                  data-testid="input-binary-parent"
                />
                {binaryParent && isAddr(binaryParent) && <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />}
              </div>
              <p className="text-[10px] text-muted-foreground/50">
                Where in the binary tree to place the new user. Leave blank to place under you.
              </p>
            </div>
          )}
        </div>

        {/* Summary panel — shown once address is valid */}
        {addrValid && (
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] divide-y divide-white/[0.05]"
            data-testid="card-summary">
            <div className="px-4 py-3 flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">New user</span>
              <span className="text-xs font-mono font-semibold">{shortenAddr(newUser)}</span>
            </div>
            <div className="px-4 py-3 flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">Sponsor (you)</span>
              <span className="text-xs font-mono text-emerald-400">{shortenAddr(account)}</span>
            </div>
            <div className="px-4 py-3 flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">Binary parent</span>
              <span className="text-xs font-mono text-muted-foreground">{shortenAddr(effectiveParent)}</span>
            </div>
            <div className="px-4 py-3 flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">Placement</span>
              <Badge className={`text-[10px] ${placeLeft
                ? "bg-blue-500/10 text-blue-300 border-blue-500/20"
                : "bg-violet-500/10 text-violet-300 border-violet-500/20"}`}>
                {placeLeft ? "← Left" : "Right →"}
              </Badge>
            </div>
            <div className="px-4 py-3 flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">Deducted from your balance</span>
              <span className="text-sm font-bold text-amber-400" style={{ fontFamily: "var(--font-display)" }}>$130.00</span>
            </div>
          </div>
        )}

        {/* CTA */}
        <button
          onClick={() => setShowConfirm(true)}
          disabled={!canSubmit || processing}
          className="w-full py-3.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-40 glow-button text-white"
          data-testid="button-register-for"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          {processing ? "Processing transaction…" : "Register & Activate — $130"}
        </button>

        {!hasFunds && (
          <p className="text-[11px] text-center text-red-400 -mt-2">
            Need at least $130 in your in-app balance — earn income or sell MVT first
          </p>
        )}
      </div>

      {/* ── Distribution visual ──────────────────────────────────────────── */}
      <div className="glass-card rounded-2xl p-5 slide-in" style={{ animationDelay: "0.12s" }}>
        <div className="flex items-center gap-2 mb-4">
          <Zap className="h-4 w-4 text-amber-400" />
          <h2 className="text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}>How $130 is Distributed</h2>
        </div>

        {/* Stacked bar */}
        <div className="flex h-3 rounded-full overflow-hidden mb-4 gap-0.5">
          {DISTRIBUTION.map(d => (
            <div key={d.label} className={`${d.color} opacity-80`} style={{ width: `${d.pct}%` }} />
          ))}
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          {DISTRIBUTION.map(d => (
            <div key={d.label} className="flex items-center gap-2.5">
              <div className={`w-2 h-2 rounded-full ${d.color} shrink-0`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate">{d.label}</p>
                <p className="text-[10px] text-muted-foreground truncate">{d.sublabel}</p>
              </div>
              <div className="text-right shrink-0">
                <p className={`text-xs font-bold ${d.text}`}>{d.pct}%</p>
                <p className="text-[10px] text-muted-foreground">${(PACKAGE_PRICE * d.pct / 100).toFixed(2)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <div className="glass-card rounded-2xl p-5 slide-in" style={{ animationDelay: "0.16s" }}>
        <div className="flex items-center gap-2 mb-4">
          <Info className="h-4 w-4 text-blue-400" />
          <h2 className="text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}>How It Works</h2>
        </div>
        <ol className="space-y-3">
          {[
            { num: "1", text: "$130 is deducted from your in-app earned balance — no wallet approval needed." },
            { num: "2", text: "The new wallet is registered and activated in one transaction." },
            { num: "3", text: "You become their direct sponsor — their level income flows up through you first." },
            { num: "4", text: "Ensure the chosen binary position is free, otherwise the transaction will revert." },
          ].map(step => (
            <li key={step.num} className="flex items-start gap-3">
              <span className="flex-shrink-0 h-5 w-5 rounded-full bg-white/[0.06] border border-white/[0.1] flex items-center justify-center text-[10px] font-bold text-muted-foreground mt-0.5">
                {step.num}
              </span>
              <p className="text-[12px] text-muted-foreground leading-relaxed">{step.text}</p>
            </li>
          ))}
        </ol>
      </div>

      {/* ── Confirm Dialog ───────────────────────────────────────────────── */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="gradient-text" style={{ fontFamily: "var(--font-display)" }}>
              Confirm Registration
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            <p className="text-sm text-muted-foreground">
              You are about to register and activate the following wallet with <strong className="text-foreground">$130 USDT</strong> from your in-app balance.
            </p>

            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] divide-y divide-white/[0.05] text-sm">
              <div className="px-4 py-3 flex justify-between">
                <span className="text-muted-foreground text-xs">New wallet</span>
                <span className="font-mono font-semibold text-xs">{shortenAddr(newUser)}</span>
              </div>
              <div className="px-4 py-3 flex justify-between">
                <span className="text-muted-foreground text-xs">Your balance after</span>
                <span className="font-semibold text-xs text-emerald-400">${Math.max(0, virtualBal - PACKAGE_PRICE).toFixed(2)} USDT</span>
              </div>
              <div className="px-4 py-3 flex justify-between">
                <span className="text-muted-foreground text-xs">Placement</span>
                <span className="font-semibold text-xs">{placeLeft ? "← Left" : "Right →"}</span>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.07] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold glow-button text-white transition-all"
                data-testid="button-confirm-register"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Confirm — $130
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
