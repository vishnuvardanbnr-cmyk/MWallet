import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, LogOut, UserPlus, Wallet, CheckCircle2, ScrollText, X } from "lucide-react";
import { shortenAddress, CONTRACT_ADDRESS, MLM_ABI } from "@/lib/contract";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { ethers } from "ethers";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const TERMS_AND_CONDITIONS = `🔐 M VAULT MEMBER DISCLAIMER & AGREEMENT

By accessing, registering, or using the M Vault platform, devices, blockchain services, or ecosystem products, you acknowledge and agree to the following terms:

1️⃣ Self-Custody Responsibility
M Vault is a self-custodial hardware wallet system.
You are solely responsible for:

Safeguarding your private keys
Protecting your recovery phrase
Securing your device and login credentials
M Vault does not store, access, or control user private keys.

2️⃣ No Financial Advice
M Vault, M Chain, and M Coin do not provide financial, investment, or legal advice.
All participation, staking, validator activity, and token usage is voluntary and conducted at your own risk.

3️⃣ Risk Disclosure
Cryptocurrency markets are volatile and involve risk, including but not limited to:

Market price fluctuations
Regulatory changes
Network disruptions
Smart contract risks
Users acknowledge potential financial loss.

4️⃣ Validator & Reward Participation
Validator participation and BTC reward distribution (if applicable):

Are performance-based
Depend on network conditions and treasury allocation
Are not guaranteed income
May vary over time
Participation does not represent traditional mining, securities, or guaranteed returns.

5️⃣ Token & Ecosystem Use
M Coin is a utility token designed for ecosystem participation and membership usage.
It does not represent:

Equity ownership
Company shares
Dividend rights
Guaranteed profit instruments

6️⃣ Device Usage & Warranty
Hardware devices are subject to:

Proper usage guidelines
Standard warranty limitations
Security best practices
Users are responsible for device protection and safe handling.

7️⃣ Regulatory Compliance
Users agree to comply with all applicable laws and regulations within their jurisdiction.

M Vault reserves the right to restrict access where required by regulatory authorities.

8️⃣ Limitation of Liability
M Vault shall not be liable for:

Loss of private keys
Unauthorized access due to user negligence
Market losses
External hacking incidents beyond platform control

✅ Acceptance
By clicking "I Agree" or logging in, you confirm that:

✔ You understand the risks
✔ You accept full responsibility for your assets
✔ You agree to the M Vault Terms & Conditions`;

interface RegisterPageProps {
  account: string;
  register: (sponsorId: string, binaryParentId: string, placeLeft: boolean) => Promise<void>;
  totalUsers: number;
  disconnect: () => void;
}

interface SponsorInfo {
  address: string;
  displayName: string;
  valid: boolean;
  side: "L" | "R";
}

export default function RegisterPage({ account, register, totalUsers, disconnect }: RegisterPageProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  const urlParams = new URLSearchParams(window.location.search);
  const refParam = urlParams.get("ref") || "";
  const sideParam = urlParams.get("side") || "left";
  const parentParam = urlParams.get("parent") || "";

  const isFirstUser = totalUsers === 0;

  const [sponsorId, setSponsorId] = useState(refParam);
  const placeLeft = sideParam === "left" || sideParam === "1";
  const isDeepPlacement = !!parentParam;
  const [sponsorInfo, setSponsorInfo] = useState<SponsorInfo | null>(null);
  const [validating, setValidating] = useState(false);

  const validateSponsor = useCallback(async (id: string) => {
    if (!id.trim() || isNaN(Number(id))) {
      setSponsorInfo(null);
      return;
    }
    setValidating(true);
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, MLM_ABI, provider);
      const addr = await contract.userIdToAddress(id);
      if (addr === ZERO_ADDRESS) {
        setSponsorInfo(null);
        setValidating(false);
        return;
      }
      const userInfo = await contract.getUserInfo(addr);
      const profile = await contract.getProfile(addr);
      const displayName = profile[4] && profile[0] ? profile[0] : shortenAddress(addr);
      setSponsorInfo({
        address: addr,
        displayName,
        valid: true,
        side: placeLeft ? "L" : "R",
      });
    } catch {
      setSponsorInfo(null);
    }
    setValidating(false);
  }, [placeLeft]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (sponsorId.trim()) validateSponsor(sponsorId);
      else setSponsorInfo(null);
    }, 500);
    return () => clearTimeout(timer);
  }, [sponsorId, validateSponsor]);

  useEffect(() => {
    if (sponsorInfo) {
      setSponsorInfo(prev => prev ? { ...prev, side: placeLeft ? "L" : "R" } : null);
    }
  }, [placeLeft]);

  const handleSubmit = async () => {
    if (!agreedToTerms) {
      toast({ title: "Terms Required", description: "Please agree to the Terms & Conditions before registering.", variant: "destructive" });
      return;
    }
    if (!isFirstUser) {
      if (!sponsorId.trim()) {
        toast({ title: "Validation Error", description: "Sponsor ID is required.", variant: "destructive" });
        return;
      }
      if (isNaN(Number(sponsorId))) {
        toast({ title: "Validation Error", description: "Sponsor ID must be a numeric value.", variant: "destructive" });
        return;
      }
      if (!sponsorInfo?.valid) {
        toast({ title: "Validation Error", description: "Invalid Sponsor ID. Please check and try again.", variant: "destructive" });
        return;
      }
    }

    setLoading(true);
    try {
      const binaryParentId = (!isFirstUser && isDeepPlacement && parentParam) ? parentParam : (isFirstUser ? "0" : sponsorId);
      await register(isFirstUser ? "0" : sponsorId, binaryParentId, placeLeft);
      toast({ title: "Registration Successful", description: "Welcome to M-Vault!" });
    } catch (err: any) {
      toast({ title: "Registration Failed", description: err?.reason || err?.message || "Transaction failed.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" data-testid="page-register">
      <div className="absolute top-20 -left-40 w-80 h-80 rounded-full bg-amber-500/8 blur-[100px]" />
      <div className="absolute bottom-20 -right-40 w-80 h-80 rounded-full bg-cyan-500/8 blur-[100px]" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-yellow-600/5 blur-[120px]" />

      <div className="absolute top-4 right-4 flex items-center gap-2 z-20">
        <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="text-wallet-address">
          <Wallet className="h-4 w-4" />
          {shortenAddress(account)}
        </div>
        <Button variant="ghost" size="icon" onClick={disconnect} data-testid="button-disconnect">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>

      <div className="w-full max-w-md relative z-10 slide-in">
        <div className="glass-card rounded-2xl p-8 space-y-6">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 mx-auto rounded-2xl gradient-icon flex items-center justify-center pulse-glow">
              <UserPlus className="h-8 w-8 text-yellow-300" />
            </div>
            <h1 className="text-2xl font-bold gradient-text" data-testid="text-register-title" style={{ fontFamily: 'var(--font-display)' }}>Join M-Vault</h1>
            <p className="text-sm text-muted-foreground" data-testid="text-register-description">Register your wallet to start earning</p>
          </div>

          {isFirstUser ? (
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 text-center">
              <p className="text-sm font-medium text-amber-400" data-testid="text-first-user">You are the first user. No referral code needed.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Sponsor ID</label>
                <div className="relative">
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="Enter sponsor's user ID"
                    value={sponsorId}
                    onChange={(e) => setSponsorId(e.target.value)}
                    disabled={loading}
                    className={`bg-white/[0.03] border-yellow-600/20 pr-10 ${sponsorInfo?.valid ? "border-emerald-500/40" : ""}`}
                    data-testid="input-sponsor-id"
                  />
                  {validating && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  {!validating && sponsorInfo?.valid && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    </div>
                  )}
                </div>
                {sponsorInfo?.valid && (
                  <div className="flex items-center justify-between px-1">
                    <p className="text-xs text-emerald-400 font-medium" data-testid="text-sponsor-name">{sponsorInfo.displayName}</p>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-600/15 text-yellow-300" data-testid="text-sponsor-side">
                      {sponsorInfo.side}
                    </span>
                  </div>
                )}
                {sponsorId.trim() && !validating && !sponsorInfo?.valid && (
                  <p className="text-xs text-red-400 px-1">Invalid Sponsor ID</p>
                )}
              </div>

              {isDeepPlacement && (
                <div className="rounded-xl bg-purple-500/10 border border-purple-500/20 p-3 flex items-start gap-2" data-testid="banner-deep-placement">
                  <svg className="h-4 w-4 mt-0.5 shrink-0 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  <div>
                    <p className="text-xs font-medium text-purple-400">Deep Placement Active</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      You will be placed under node <span className="font-bold text-purple-300">ID #{parentParam}</span> on the <span className="font-bold text-purple-300">{placeLeft ? "Left" : "Right"}</span> side.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={() => setAgreedToTerms(!agreedToTerms)}
              className={`mt-0.5 h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                agreedToTerms
                  ? "bg-purple-500 border-purple-500"
                  : "border-white/20 bg-white/[0.03] hover:border-purple-500/50"
              }`}
              data-testid="checkbox-terms"
            >
              {agreedToTerms && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
            </button>
            <p className="text-xs text-muted-foreground leading-relaxed">
              I agree to the{" "}
              <button
                type="button"
                onClick={() => setShowTerms(true)}
                className="text-yellow-300 hover:text-yellow-200 underline underline-offset-2 font-medium transition-colors"
                data-testid="link-terms"
              >
                Terms & Conditions
              </button>
            </p>
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading || (!isFirstUser && !sponsorInfo?.valid) || !agreedToTerms}
            className="w-full glow-button text-white font-bold py-3.5 px-6 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            data-testid="button-register"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? "Registering..." : "Register"}
          </button>
        </div>
      </div>

      {showTerms && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" data-testid="modal-terms">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowTerms(false)} />
          <div className="relative w-full max-w-lg max-h-[80vh] glass-card rounded-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-white/[0.08]">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-yellow-600/15 flex items-center justify-center">
                  <ScrollText className="h-4 w-4 text-yellow-300" />
                </div>
                <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                  <span className="gradient-text">Terms & Conditions</span>
                </h2>
              </div>
              <button
                onClick={() => setShowTerms(false)}
                className="h-8 w-8 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] flex items-center justify-center transition-colors"
                data-testid="button-close-terms"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <div className="prose prose-invert prose-sm max-w-none">
                {TERMS_AND_CONDITIONS.split('\n').map((line, i) => {
                  const trimmed = line.trim();
                  if (!trimmed) return <div key={i} className="h-3" />;
                  if (trimmed.startsWith('🔐') || trimmed.startsWith('✅')) {
                    return <h3 key={i} className="text-sm font-bold gradient-text mt-4 mb-1" style={{ fontFamily: 'var(--font-display)' }}>{trimmed}</h3>;
                  }
                  if (/^[0-9️⃣]+/.test(trimmed)) {
                    return <h3 key={i} className="text-sm font-bold text-amber-400 mt-4 mb-1" style={{ fontFamily: 'var(--font-display)' }}>{trimmed}</h3>;
                  }
                  if (trimmed.startsWith('✔')) {
                    return <p key={i} className="text-xs text-emerald-400 py-0.5">{trimmed}</p>;
                  }
                  return <p key={i} className="text-xs text-muted-foreground py-0.5">{trimmed}</p>;
                })}
              </div>
            </div>
            <div className="p-5 border-t border-white/[0.08]">
              <button
                onClick={() => { setAgreedToTerms(true); setShowTerms(false); }}
                className="w-full glow-button text-white font-bold py-3 px-6 rounded-xl transition-all flex items-center justify-center gap-2"
                data-testid="button-agree-terms"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                <CheckCircle2 className="h-4 w-4" />
                I Agree
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
