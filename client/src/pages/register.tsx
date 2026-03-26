import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, LogOut, UserPlus, Wallet, CheckCircle2, ScrollText, X, AlertCircle } from "lucide-react";
import { shortenAddress, getMvaultContract, MVAULT_CONTRACT_ADDRESS } from "@/lib/contract";
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
  register: (sponsor: string, binaryParent: string, placeLeft: boolean) => Promise<void>;
  totalUsers: number;
  disconnect: () => void;
}

interface SponsorInfo {
  address: string;
  isActive: boolean;
  valid: boolean;
  side: "L" | "R";
}

function isValidAddress(val: string) {
  return ethers.isAddress(val);
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

  const [sponsorAddress, setSponsorAddress] = useState(refParam);
  const [binaryParentAddress, setBinaryParentAddress] = useState(parentParam || refParam);
  const placeLeft = sideParam === "left" || sideParam === "1";
  const [selectedSide, setSelectedSide] = useState<boolean>(placeLeft);

  const [sponsorInfo, setSponsorInfo] = useState<SponsorInfo | null>(null);
  const [validating, setValidating] = useState(false);

  const validateSponsor = useCallback(async (addr: string) => {
    if (!isValidAddress(addr)) {
      setSponsorInfo(null);
      return;
    }
    setValidating(true);
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const contract = getMvaultContract(provider);
      const info = await contract.getUserInfo(addr);
      const isReg = info[0];
      const isAct = info[1];
      if (!isReg) {
        setSponsorInfo(null);
      } else {
        setSponsorInfo({ address: addr, isActive: isAct, valid: true, side: selectedSide ? "L" : "R" });
      }
    } catch {
      setSponsorInfo(null);
    }
    setValidating(false);
  }, [selectedSide]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (sponsorAddress.trim()) validateSponsor(sponsorAddress.trim());
      else setSponsorInfo(null);
    }, 600);
    return () => clearTimeout(timer);
  }, [sponsorAddress, validateSponsor]);

  useEffect(() => {
    if (sponsorInfo) {
      setSponsorInfo(prev => prev ? { ...prev, side: selectedSide ? "L" : "R" } : null);
    }
  }, [selectedSide]);

  const handleRegister = async () => {
    if (!agreedToTerms) {
      toast({ title: "Please agree to Terms & Conditions", variant: "destructive" });
      return;
    }

    const sponsor = isFirstUser ? ZERO_ADDRESS : sponsorAddress.trim();
    const binaryParent = binaryParentAddress.trim() || sponsor;

    if (!isFirstUser) {
      if (!isValidAddress(sponsor)) {
        toast({ title: "Invalid sponsor address", description: "Please enter a valid wallet address.", variant: "destructive" });
        return;
      }
      if (!sponsorInfo?.valid) {
        toast({ title: "Sponsor not found", description: "The sponsor address is not registered.", variant: "destructive" });
        return;
      }
    }

    setLoading(true);
    try {
      await register(sponsor, binaryParent || sponsor, selectedSide);
      toast({ title: "Registered!", description: "You are now registered. Please activate your account." });
    } catch (err: any) {
      const msg = err?.reason || err?.shortMessage || err?.message || "Registration failed";
      toast({ title: "Registration Failed", description: msg.slice(0, 150), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-amber-600/4 via-yellow-600/3 to-amber-800/4" />
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-amber-600/[0.06] blur-[180px] pointer-events-none" />

      {showTerms && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-background border border-white/[0.08] rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
              <h2 className="font-bold text-sm" style={{ fontFamily: "var(--font-display)" }}>Terms & Conditions</h2>
              <button onClick={() => setShowTerms(false)} className="text-muted-foreground hover:text-foreground transition-colors" data-testid="button-close-terms">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-4 flex-1">
              <pre className="text-[11px] text-muted-foreground whitespace-pre-wrap leading-relaxed font-sans">{TERMS_AND_CONDITIONS}</pre>
            </div>
            <div className="p-4 border-t border-white/[0.06]">
              <Button
                onClick={() => { setAgreedToTerms(true); setShowTerms(false); }}
                className="w-full glow-button text-white"
                data-testid="button-agree-terms"
              >
                <CheckCircle2 className="w-4 h-4 mr-2" /> I Agree
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="w-full max-w-md relative z-10 space-y-5 slide-in">
        <div className="flex items-center justify-between">
          <Logo size="sm" />
          <button onClick={disconnect} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors" data-testid="button-disconnect">
            <LogOut className="w-3.5 h-3.5" /> Disconnect
          </button>
        </div>

        <div className="premium-card rounded-2xl p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-yellow-400/10 flex items-center justify-center">
              <UserPlus className="h-6 w-6 text-yellow-300" />
            </div>
            <div>
              <h1 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
                <span className="gradient-text">Join M-Vault</span>
              </h1>
              <p className="text-xs text-muted-foreground">Register your wallet to get started</p>
            </div>
          </div>

          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Your Wallet</p>
            <p className="text-xs font-mono text-amber-300/80" data-testid="text-account">{account}</p>
          </div>

          {!isFirstUser && (
            <>
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Sponsor Address *</label>
                <div className="relative">
                  <Input
                    value={sponsorAddress}
                    onChange={(e) => setSponsorAddress(e.target.value)}
                    placeholder="0x... sponsor wallet address"
                    className="bg-white/[0.03] border-white/[0.08] text-sm font-mono pr-8"
                    data-testid="input-sponsor-address"
                    disabled={loading}
                  />
                  {validating && (
                    <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  )}
                </div>
                {sponsorInfo && (
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20" data-testid="card-sponsor-info">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                    <p className="text-xs text-emerald-400">
                      Registered · {sponsorInfo.isActive ? "Active" : "Inactive"} · {shortenAddress(sponsorInfo.address)}
                    </p>
                  </div>
                )}
                {sponsorAddress && isValidAddress(sponsorAddress) && !sponsorInfo && !validating && (
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20">
                    <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                    <p className="text-xs text-red-400">Address not registered in the system</p>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Binary Parent Address <span className="text-muted-foreground/50">(optional, defaults to sponsor)</span>
                </label>
                <Input
                  value={binaryParentAddress}
                  onChange={(e) => setBinaryParentAddress(e.target.value)}
                  placeholder="0x... leave blank to use sponsor"
                  className="bg-white/[0.03] border-white/[0.08] text-sm font-mono"
                  data-testid="input-binary-parent-address"
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Placement Side</label>
                <div className="grid grid-cols-2 gap-2">
                  {[{ label: "Left", value: true }, { label: "Right", value: false }].map(({ label, value }) => (
                    <button
                      key={label}
                      onClick={() => setSelectedSide(value)}
                      className={`py-2.5 rounded-xl text-sm font-semibold transition-all border ${selectedSide === value ? "bg-amber-500/10 border-amber-500/30 text-amber-400" : "bg-white/[0.02] border-white/[0.06] text-muted-foreground hover:border-white/[0.12]"}`}
                      data-testid={`button-place-${label.toLowerCase()}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {isFirstUser && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <Wallet className="h-4 w-4 text-amber-400 shrink-0" />
              <p className="text-xs text-amber-400">You will be registered as the root (first) user.</p>
            </div>
          )}

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setAgreedToTerms(!agreedToTerms)}
              className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0 ${agreedToTerms ? "bg-amber-500/20 border-amber-500/50" : "border-white/[0.12] bg-white/[0.02]"}`}
              data-testid="button-toggle-terms"
            >
              {agreedToTerms && <CheckCircle2 className="w-3 h-3 text-amber-400" />}
            </button>
            <p className="text-xs text-muted-foreground">
              I agree to the{" "}
              <button onClick={() => setShowTerms(true)} className="text-amber-400 hover:text-amber-300 underline" data-testid="button-view-terms">
                Terms & Conditions
              </button>
            </p>
          </div>

          <button
            onClick={handleRegister}
            disabled={loading || (!isFirstUser && !sponsorInfo?.valid) || !agreedToTerms}
            className="w-full glow-button text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="button-register"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            {loading ? "Registering..." : "Register"}
          </button>

          <p className="text-[10px] text-center text-muted-foreground/50">
            Registration is free. You'll activate ($130 USDT) in the next step.
          </p>
        </div>
      </div>
    </div>
  );
}
