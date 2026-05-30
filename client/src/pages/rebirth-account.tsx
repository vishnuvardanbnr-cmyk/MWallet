import { useState } from "react";
import {
  RotateCcw, Loader2, CheckCircle2, AlertCircle,
  ArrowLeft, ArrowRight, Shield, Wallet, Info, Sparkles
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatTokenAmount } from "@/lib/contract";
import { ethers } from "ethers";

const PACKAGE_PRICE = 130;

interface Props {
  account: string;
  rebirth: (subAccount: string, placeLeft: boolean) => Promise<void>;
  rebirthPool?: bigint;
  packagePrice?: bigint;
  incomeLimit?: bigint;
  incomeLimitCap?: bigint;
  tokenDecimals?: number;
}

function shortenAddr(addr: string) {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function isAddr(addr: string) {
  try { ethers.getAddress(addr); return true; } catch { return false; }
}

export default function RebirthAccountPage({
  account, rebirth, rebirthPool, packagePrice, incomeLimit, incomeLimitCap, tokenDecimals = 18,
}: Props) {
  const { toast } = useToast();

  const [subAccount, setSubAccount]   = useState("");
  const [placeLeft, setPlaceLeft]     = useState(true);
  const [showConfirm, setShowConfirm] = useState(false);
  const [processing, setProcessing]   = useState(false);
  const [lastSuccess, setLastSuccess] = useState<string | null>(null);

  const PRO_PRICE = 130n * 10n ** 18n;
  const poolBal     = rebirthPool   ? parseFloat(formatTokenAmount(rebirthPool,   tokenDecimals)) : 0;
  const limitLeft   = incomeLimit   ? parseFloat(formatTokenAmount(incomeLimit,   tokenDecimals)) : -1;
  const limitCap    = incomeLimitCap? parseFloat(formatTokenAmount(incomeLimitCap,tokenDecimals)) : 0;
  const isPro       = !packagePrice || packagePrice >= PRO_PRICE; // default to PRO assumption until loaded
  const limitFull   = limitLeft < 0 || limitLeft >= limitCap * 0.99; // income limit still full
  const hasFunds    = poolBal >= PACKAGE_PRICE;
  const addrValid   = isAddr(subAccount) && subAccount.toLowerCase() !== account.toLowerCase();
  const canSubmit   = addrValid && hasFunds && isPro;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setProcessing(true);
    setShowConfirm(false);
    try {
      await rebirth(subAccount, placeLeft);
      setLastSuccess(subAccount);
      setSubAccount("");
      setPlaceLeft(true);
      toast({ title: "Rebirth Successful!", description: `Sub-account ${shortenAddr(subAccount)} is registered and activated. Your income limit is reset to $390.` });
    } catch (e: any) {
      const msg = (e?.message ?? "Transaction failed")
        .replace(/^execution reverted: /, "")
        .replace(/\s*\(.*\)\s*$/, "")
        .trim();
      toast({ title: "Rebirth Failed", description: msg, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  const remaining = Math.max(0, poolBal - PACKAGE_PRICE);

  return (
    <div className="p-4 sm:p-6 max-w-xl mx-auto space-y-6">

      {/* Header */}
      <div className="slide-in">
        <div className="flex items-center gap-2.5 mb-1">
          <RotateCcw className="h-5 w-5 text-purple-400" />
          <h1 className="text-2xl font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }}
            data-testid="text-page-title">Create Rebirth Account</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Use your rebirth pool to activate a new sub-account — resets your income limit to $390
        </p>
      </div>

      {/* Success banner */}
      {lastSuccess && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-emerald-500/8 border border-emerald-500/20 slide-in"
          data-testid="banner-success">
          <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-emerald-300">Rebirth complete</p>
            <p className="text-xs font-mono text-muted-foreground mt-0.5">{lastSuccess}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Sub-account is registered, activated, and placed in your binary tree. Your income limit reset to $390.
            </p>
          </div>
        </div>
      )}

      {/* Balance cards */}
      <div className="grid grid-cols-3 gap-3 slide-in" style={{ animationDelay: "0.04s" }}>
        <div className="glass-card rounded-2xl p-4" data-testid="card-rebirth-balance">
          <Wallet className="h-4 w-4 text-purple-400 mb-2" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Rebirth Pool</p>
          <p className="text-base font-bold text-purple-400" style={{ fontFamily: "var(--font-display)" }}
            data-testid="text-rebirth-pool-balance">${poolBal.toFixed(2)}</p>
        </div>
        <div className="glass-card rounded-2xl p-4">
          <Sparkles className="h-4 w-4 text-amber-400 mb-2" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Cost</p>
          <p className="text-base font-bold text-amber-400" style={{ fontFamily: "var(--font-display)" }}>$130.00</p>
        </div>
        <div className="glass-card rounded-2xl p-4">
          <Shield className="h-4 w-4 mb-2 text-muted-foreground" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Status</p>
          {hasFunds
            ? <Badge className="text-[10px] bg-emerald-500/12 text-emerald-400 border-emerald-500/20 px-2">Ready</Badge>
            : <Badge className="text-[10px] bg-red-500/12 text-red-400 border-red-500/20 px-2">Need More</Badge>
          }
        </div>
      </div>

      {/* Not PRO package */}
      {packagePrice !== undefined && !isPro && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-500/8 border border-red-500/20 slide-in">
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-xs font-semibold text-red-300">STARTER package — rebirth not available</p>
            <p className="text-xs text-red-300/80">
              Only PRO accounts ($130 activation) can create sub-accounts. Your current package is STARTER ($55).
            </p>
          </div>
        </div>
      )}

      {/* Not enough funds — show why */}
      {isPro && !hasFunds && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/8 border border-amber-500/20 slide-in">
          <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-xs font-semibold text-amber-300">
              Rebirth pool has <strong>${poolBal.toFixed(2)}</strong> — need $130
            </p>
            {limitFull ? (
              <p className="text-xs text-amber-300/80">
                Your income limit is still open (${limitLeft >= 0 ? limitLeft.toFixed(0) : '—'} / ${limitCap.toFixed(0)} remaining).
                Sell MVT to earn USDT — once your limit hits $0, any further MVT sells automatically fill the rebirth pool.
              </p>
            ) : (
              <p className="text-xs text-amber-300/80">
                Your income limit is nearly exhausted — keep selling MVT and the excess will flow into this rebirth pool automatically.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Form */}
      <div className="glass-card rounded-2xl p-5 space-y-5 slide-in" style={{ animationDelay: "0.08s" }}>

        {/* Sub-account address */}
        <div className="space-y-2">
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            New Sub-Account Wallet <span className="text-red-400/80">*</span>
          </label>
          <div className={`flex items-center gap-3 rounded-xl px-4 py-3 bg-white/[0.03] border transition-colors ${
            subAccount && !isAddr(subAccount) ? "border-red-500/40"
            : subAccount && addrValid         ? "border-emerald-500/30"
            : "border-white/[0.07]"
          }`}>
            <RotateCcw className="h-4 w-4 text-muted-foreground/50 shrink-0" />
            <input
              type="text"
              value={subAccount}
              onChange={e => setSubAccount(e.target.value.trim())}
              placeholder="0x…  new wallet address for sub-account"
              className="flex-1 bg-transparent text-sm font-mono outline-none placeholder:text-muted-foreground/25"
              data-testid="input-subaccount-address"
            />
            {subAccount && addrValid && <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />}
            {subAccount && !isAddr(subAccount) && <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />}
          </div>
          {subAccount && !isAddr(subAccount) && (
            <p className="text-[11px] text-red-400 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> Not a valid wallet address
            </p>
          )}
          {subAccount && isAddr(subAccount) && !addrValid && (
            <p className="text-[11px] text-orange-400 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> Cannot use your own address as sub-account
            </p>
          )}
        </div>

        {/* Binary placement */}
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
          <p className="text-[10px] text-muted-foreground/60">
            Sub-account is placed under your account on the chosen side.
          </p>
        </div>

        {/* Summary */}
        {addrValid && (
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] divide-y divide-white/[0.05]"
            data-testid="card-summary">
            <div className="px-4 py-3 flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">Sub-account</span>
              <span className="text-xs font-mono font-semibold">{shortenAddr(subAccount)}</span>
            </div>
            <div className="px-4 py-3 flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">Sponsor (you)</span>
              <span className="text-xs font-mono text-emerald-400">{shortenAddr(account)}</span>
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
              <span className="text-[11px] text-muted-foreground">Deducted from rebirth pool</span>
              <span className="text-sm font-bold text-amber-400" style={{ fontFamily: "var(--font-display)" }}>$130.00</span>
            </div>
            {remaining > 0 && (
              <div className="px-4 py-3 flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">Remaining credited to wallet</span>
                <span className="text-sm font-bold text-purple-400" style={{ fontFamily: "var(--font-display)" }}>${remaining.toFixed(2)}</span>
              </div>
            )}
          </div>
        )}

        {/* CTA */}
        <button
          onClick={() => setShowConfirm(true)}
          disabled={!canSubmit || processing}
          className="w-full py-3.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-40 glow-button text-white"
          data-testid="button-rebirth"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          {processing ? "Processing…" : "Create Sub-Account — $130 from Rebirth Pool"}
        </button>

        {!hasFunds && (
          <p className="text-[11px] text-center text-red-400 -mt-2">
            Need at least $130 in your rebirth pool — keep selling MVT to fill it
          </p>
        )}
      </div>

      {/* How it works */}
      <div className="glass-card rounded-2xl p-5 slide-in" style={{ animationDelay: "0.12s" }}>
        <div className="flex items-center gap-2 mb-4">
          <Info className="h-4 w-4 text-blue-400" />
          <h2 className="text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}>What Happens</h2>
        </div>
        <ol className="space-y-3">
          {[
            { num: "1", text: "$130 is deducted from your rebirth pool — no wallet approval needed." },
            { num: "2", text: "Your income limit resets to $390 so you can earn again." },
            { num: "3", text: "Any remaining rebirth pool balance is credited to your main wallet (through your new income limit)." },
            { num: "4", text: "The new sub-account is registered and activated in one transaction — ready to use immediately." },
          ].map(step => (
            <li key={step.num} className="flex items-start gap-3">
              <span className="flex-shrink-0 h-5 w-5 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-[10px] font-bold text-purple-400 mt-0.5">
                {step.num}
              </span>
              <p className="text-[12px] text-muted-foreground leading-relaxed">{step.text}</p>
            </li>
          ))}
        </ol>
      </div>

      {/* Confirm dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="gradient-text" style={{ fontFamily: "var(--font-display)" }}>
              Confirm Rebirth
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <p className="text-sm text-muted-foreground">
              Creating a sub-account using <strong className="text-foreground">$130</strong> from your rebirth pool. Your income limit will reset to $390.
            </p>
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] divide-y divide-white/[0.05] text-sm">
              <div className="px-4 py-3 flex justify-between">
                <span className="text-muted-foreground text-xs">Sub-account wallet</span>
                <span className="font-mono font-semibold text-xs">{shortenAddr(subAccount)}</span>
              </div>
              <div className="px-4 py-3 flex justify-between">
                <span className="text-muted-foreground text-xs">Rebirth pool after</span>
                <span className="font-semibold text-xs text-purple-400">${remaining.toFixed(2)}</span>
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
                data-testid="button-confirm-rebirth"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Confirm Rebirth
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
