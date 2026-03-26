import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, LogOut, UserPlus, Wallet, CheckCircle2, X,
  AlertCircle, Shield, ArrowRight, Users,
} from "lucide-react";
import { shortenAddress, getMvaultContract, MVAULT_CONTRACT_ADDRESS, decodeContractError } from "@/lib/contract";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { ethers } from "ethers";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const TERMS_AND_CONDITIONS = `M VAULT MEMBER DISCLAIMER & AGREEMENT

By accessing, registering, or using the M Vault platform, devices, blockchain services, or ecosystem products, you acknowledge and agree to the following terms:

1. SELF-CUSTODY RESPONSIBILITY
M Vault is a self-custodial hardware wallet system. You are solely responsible for safeguarding your private keys, protecting your recovery phrase, and securing your device and login credentials. M Vault does not store, access, or control user private keys.

2. NO FINANCIAL ADVICE
M Vault, M Chain, and M Coin do not provide financial, investment, or legal advice. All participation, staking, validator activity, and token usage is voluntary and conducted at your own risk.

3. RISK DISCLOSURE
Cryptocurrency markets are volatile and involve risk, including market price fluctuations, regulatory changes, network disruptions, and smart contract risks. Users acknowledge potential financial loss.

4. VALIDATOR & REWARD PARTICIPATION
Validator participation and BTC reward distribution (if applicable) are performance-based, depend on network conditions and treasury allocation, are not guaranteed income, and may vary over time. Participation does not represent traditional mining, securities, or guaranteed returns.

5. TOKEN & ECOSYSTEM USE
M Coin is a utility token designed for ecosystem participation and membership usage. It does not represent equity ownership, company shares, dividend rights, or guaranteed profit instruments.

6. DEVICE USAGE & WARRANTY
Hardware devices are subject to proper usage guidelines, standard warranty limitations, and security best practices. Users are responsible for device protection and safe handling.

7. REGULATORY COMPLIANCE
Users agree to comply with all applicable laws and regulations within their jurisdiction. M Vault reserves the right to restrict access where required by regulatory authorities.

8. LIMITATION OF LIABILITY
M Vault shall not be liable for loss of private keys, unauthorized access due to user negligence, market losses, or external hacking incidents beyond platform control.

ACCEPTANCE
By clicking "I Agree" or registering, you confirm that you understand the risks, accept full responsibility for your assets, and agree to the M Vault Terms & Conditions.`;

interface RegisterPageProps {
  account: string;
  register: (sponsor: string, binaryParent: string, placeLeft: boolean) => Promise<void>;
  totalUsers: number;
  disconnect: () => void;
}

interface SponsorInfo {
  address: string;
  displayName: string;
  isActive: boolean;
  valid: boolean;
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
    if (!isValidAddress(addr)) { setSponsorInfo(null); return; }
    setValidating(true);
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const contract = getMvaultContract(provider);
      const info = await contract.getUserInfo(addr);
      const isReg = info[0];
      const isAct = info[1];
      const dname = info.displayName || "";
      if (!isReg) { setSponsorInfo(null); }
      else { setSponsorInfo({ address: addr, displayName: dname, isActive: isAct, valid: true }); }
    } catch { setSponsorInfo(null); }
    setValidating(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (sponsorAddress.trim()) validateSponsor(sponsorAddress.trim());
      else setSponsorInfo(null);
    }, 600);
    return () => clearTimeout(timer);
  }, [sponsorAddress, validateSponsor]);

  const handleRegister = async () => {
    if (!agreedToTerms) {
      toast({ title: "Please agree to Terms & Conditions", variant: "destructive" }); return;
    }
    const sponsor = isFirstUser ? ZERO_ADDRESS : sponsorAddress.trim();
    const binaryParent = binaryParentAddress.trim() || sponsor;
    if (!isFirstUser) {
      if (!isValidAddress(sponsor)) {
        toast({ title: "Invalid sponsor address", description: "Please enter a valid wallet address.", variant: "destructive" }); return;
      }
      if (!sponsorInfo?.valid) {
        toast({ title: "Sponsor not found", description: "The sponsor address is not registered.", variant: "destructive" }); return;
      }
    }
    setLoading(true);
    try {
      await register(sponsor, binaryParent || sponsor, selectedSide);
      toast({ title: "Registered!", description: "You are now registered. Please activate your account." });
    } catch (err: any) {
      toast({ title: "Registration Failed", description: decodeContractError(err), variant: "destructive" });
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background glows */}
      <div className="absolute top-[-15%] right-[-10%] w-[600px] h-[600px] rounded-full bg-amber-500/[0.05] blur-[200px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-15%] w-[500px] h-[500px] rounded-full bg-yellow-600/[0.04] blur-[180px] pointer-events-none" />

      {/* Terms Modal */}
      {showTerms && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-md">
          <div className="glass-card w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl flex flex-col max-h-[90vh] sm:max-h-[80vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
                  <Shield className="h-4 w-4 text-amber-400" />
                </div>
                <h2 className="font-bold text-sm" style={{ fontFamily: "var(--font-display)" }}>Terms & Conditions</h2>
              </div>
              <button onClick={() => setShowTerms(false)} className="h-8 w-8 rounded-lg bg-white/[0.04] flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors" data-testid="button-close-terms">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-5 flex-1 space-y-4">
              {TERMS_AND_CONDITIONS.split("\n\n").map((section, i) => {
                const lines = section.split("\n");
                const isHeading = /^\d+\./.test(lines[0]) || lines[0] === "ACCEPTANCE";
                return (
                  <div key={i}>
                    {isHeading ? (
                      <>
                        <p className="text-[11px] font-semibold text-amber-400/80 mb-1 uppercase tracking-wider">{lines[0]}</p>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">{lines.slice(1).join(" ")}</p>
                      </>
                    ) : (
                      <p className="text-[11px] text-muted-foreground leading-relaxed">{section}</p>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="px-5 py-4 border-t border-white/[0.06] shrink-0">
              <button
                onClick={() => { setAgreedToTerms(true); setShowTerms(false); }}
                className="w-full glow-button text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2"
                data-testid="button-agree-terms"
                style={{ fontFamily: "var(--font-display)" }}
              >
                <CheckCircle2 className="w-4 h-4" /> I Agree to These Terms
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="w-full max-w-md relative z-10 space-y-4 slide-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Logo size="sm" />
          <button onClick={disconnect} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.05]" data-testid="button-disconnect">
            <LogOut className="w-3.5 h-3.5" /> Disconnect
          </button>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center gap-3 px-1">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
              <span className="text-[10px] font-bold text-amber-400">1</span>
            </div>
            <span className="text-xs font-semibold text-amber-400">Register</span>
          </div>
          <div className="flex-1 h-px bg-white/[0.06]" />
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
              <span className="text-[10px] font-bold text-muted-foreground">2</span>
            </div>
            <span className="text-xs text-muted-foreground">Activate</span>
          </div>
          <div className="flex-1 h-px bg-white/[0.06]" />
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
              <span className="text-[10px] font-bold text-muted-foreground">3</span>
            </div>
            <span className="text-xs text-muted-foreground">Earn</span>
          </div>
        </div>

        {/* Main Card */}
        <div className="glass-card rounded-2xl overflow-hidden">
          {/* Card Header */}
          <div className="px-6 pt-6 pb-5 border-b border-white/[0.05]">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-amber-500/25 to-yellow-400/10 border border-amber-500/20 flex items-center justify-center">
                <UserPlus className="h-7 w-7 text-amber-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
                  <span className="gradient-text">Join M-Vault</span>
                </h1>
                <p className="text-xs text-muted-foreground mt-0.5">Register your wallet to get started</p>
              </div>
            </div>
          </div>

          <div className="px-6 py-5 space-y-5">
            {/* Stats row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.05] px-3.5 py-3">
                <div className="flex items-center gap-2 mb-0.5">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Members</span>
                </div>
                <p className="text-base font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }}>{totalUsers.toLocaleString()}</p>
              </div>
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.05] px-3.5 py-3">
                <div className="flex items-center gap-2 mb-0.5">
                  <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Your Wallet</span>
                </div>
                <p className="text-xs font-mono text-amber-300/80 truncate" data-testid="text-account">{shortenAddress(account)}</p>
              </div>
            </div>

            {isFirstUser ? (
              <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl bg-amber-500/8 border border-amber-500/20">
                <div className="h-8 w-8 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0 mt-0.5">
                  <Shield className="h-4 w-4 text-amber-400" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-amber-300">Root Account</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">You'll be registered as the first member of the network.</p>
                </div>
              </div>
            ) : (
              <>
                {/* Sponsor Field */}
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Sponsor Address <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <Input
                      value={sponsorAddress}
                      onChange={(e) => setSponsorAddress(e.target.value)}
                      placeholder="0x... sponsor wallet address"
                      className="bg-white/[0.03] border-white/[0.08] text-sm font-mono pr-10 focus:border-amber-500/30 transition-colors"
                      data-testid="input-sponsor-address"
                      disabled={loading}
                    />
                    <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                      {validating && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                      {!validating && sponsorInfo?.valid && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
                      {!validating && sponsorAddress && isValidAddress(sponsorAddress) && !sponsorInfo && <AlertCircle className="h-3.5 w-3.5 text-red-400" />}
                    </div>
                  </div>
                  {sponsorInfo && (
                    <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-emerald-500/8 border border-emerald-500/20" data-testid="card-sponsor-info">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-emerald-400 font-semibold truncate">
                          {sponsorInfo.displayName || shortenAddress(sponsorInfo.address)}
                        </p>
                        <p className="text-[10px] text-emerald-400/60">{sponsorInfo.isActive ? "Active member" : "Registered · Inactive"}</p>
                      </div>
                    </div>
                  )}
                  {sponsorAddress && isValidAddress(sponsorAddress) && !sponsorInfo && !validating && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/8 border border-red-500/20">
                      <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                      <p className="text-xs text-red-400">Address not registered in M-Vault</p>
                    </div>
                  )}
                </div>

              </>
            )}

            {/* Terms Checkbox */}
            <div className="flex items-center gap-3 px-1">
              <button
                onClick={() => setAgreedToTerms(!agreedToTerms)}
                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0 ${
                  agreedToTerms ? "bg-amber-500/20 border-amber-500/50" : "border-white/[0.15] bg-white/[0.02] hover:border-white/[0.25]"
                }`}
                data-testid="button-toggle-terms"
              >
                {agreedToTerms && <CheckCircle2 className="w-3 h-3 text-amber-400" />}
              </button>
              <p className="text-xs text-muted-foreground leading-relaxed">
                I have read and agree to the{" "}
                <button
                  onClick={() => setShowTerms(true)}
                  className="text-amber-400 hover:text-amber-300 underline underline-offset-2 transition-colors"
                  data-testid="button-view-terms"
                >
                  Terms & Conditions
                </button>
              </p>
            </div>

            {/* Register Button */}
            <button
              onClick={handleRegister}
              disabled={loading || (!isFirstUser && !sponsorInfo?.valid) || !agreedToTerms}
              className="w-full glow-button text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              data-testid="button-register"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Registering...</>
              ) : (
                <><UserPlus className="h-4 w-4" /> Register Now <ArrowRight className="h-4 w-4" /></>
              )}
            </button>
          </div>

          {/* Footer */}
          <div className="px-6 pb-5 flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground/50">Registration is free</p>
            <p className="text-[10px] text-muted-foreground/50">Activation costs $130 USDT</p>
          </div>
        </div>
      </div>
    </div>
  );
}
