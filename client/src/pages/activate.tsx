import { useState, useRef, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Loader2, LogOut, Wallet, Zap, Star, Crown, Shield, Award, Check, Info, ArrowLeft, Rocket, TrendingUp } from "lucide-react";
import { PACKAGE_NAMES, PACKAGE_PRICES_USD, shortenAddress, getContract, formatTokenAmount } from "@/lib/contract";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { ethers } from "ethers";

interface ActivatePageProps {
  account: string;
  approveToken: (amount: string) => Promise<void>;
  activatePackage: (pkg: number) => Promise<void>;
  fetchUserData: () => Promise<void>;
  disconnect: () => void;
}

const PACKAGE_ICONS = [Zap, Zap, Star, Crown, Shield, Award];
const ICON_COLORS = [
  "",
  "from-cyan-400 to-blue-500",
  "from-slate-300 to-slate-500",
  "from-amber-400 to-orange-500",
  "from-amber-300 to-yellow-400",
  "from-purple-400 to-pink-500",
];
const CARD_BORDERS = [
  "",
  "border-cyan-500/20 hover:border-cyan-500/40",
  "border-slate-400/20 hover:border-slate-400/40",
  "border-amber-500/20 hover:border-amber-500/40",
  "border-yellow-400/20 hover:border-yellow-400/40",
  "border-purple-500/20 hover:border-purple-500/40",
];

export default function ActivatePage({ account, approveToken, activatePackage, fetchUserData, disconnect }: ActivatePageProps) {
  const { toast } = useToast();
  const [selectedPkg, setSelectedPkg] = useState<number>(1);
  const [approved, setApproved] = useState(false);
  const [approving, setApproving] = useState(false);
  const [activating, setActivating] = useState(false);
  const activateRef = useRef<HTMLDivElement>(null);
  const [maxIncomeLimits, setMaxIncomeLimits] = useState<Record<number, string>>({});

  useEffect(() => {
    const fetchMaxIncomeLimits = async () => {
      try {
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        const contract = getContract(provider);
        const decimals = Number(await contract.tokenDecimals());
        const limits: Record<number, string> = {};
        for (let pkg = 1; pkg <= 5; pkg++) {
          const limit = await contract.getMaxIncomeLimit(pkg);
          const formatted = parseFloat(formatTokenAmount(limit, decimals));
          limits[pkg] = `$${formatted.toLocaleString()}`;
        }
        setMaxIncomeLimits(limits);
      } catch (err) {
        console.error("Failed to fetch max income limits:", err);
      }
    };
    fetchMaxIncomeLimits();
  }, []);

  const handleApproveAndActivate = async () => {
    setApproving(true);
    try {
      await approveToken(PACKAGE_PRICES_USD[selectedPkg].toString());
      setApproved(true);
    } catch (err: any) {
      toast({ title: "Approval Failed", description: err?.reason || err?.message || "Failed to approve.", variant: "destructive" });
      setApproving(false);
      return;
    }
    setApproving(false);
    setActivating(true);
    try {
      await activatePackage(selectedPkg);
      await fetchUserData();
    } catch (err: any) {
      toast({ title: "Activation Failed", description: err?.reason || err?.message || "Failed to activate.", variant: "destructive" });
    } finally {
      setActivating(false);
    }
  };

  const isLoading = approving || activating;
  const buttonLabel = approving ? "Approving USDT..." : activating ? "Activating Package..." : `Activate Now - $${PACKAGE_PRICES_USD[selectedPkg].toLocaleString()} USDT`;

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden" data-testid="page-activate">
      <div className="absolute top-[-20%] left-1/4 w-[600px] h-[600px] rounded-full bg-purple-600/[0.06] blur-[180px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-1/4 w-[500px] h-[500px] rounded-full bg-cyan-500/[0.05] blur-[150px] pointer-events-none" />
      <div className="absolute top-[30%] right-[-10%] w-[400px] h-[400px] rounded-full bg-amber-500/[0.04] blur-[120px] pointer-events-none" />

      <header className="flex items-center justify-between p-4 md:px-6 relative z-20">
        <Logo size="sm" />
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground/80 rounded-xl px-3 py-1.5 bg-white/[0.03] border border-white/[0.06]" data-testid="text-wallet-address">
            <Wallet className="h-3.5 w-3.5 text-cyan-400" />
            <span className="font-mono text-xs">{shortenAddress(account)}</span>
          </div>
          <Button variant="ghost" size="icon" onClick={disconnect} className="text-muted-foreground hover:text-red-400" data-testid="button-disconnect">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center px-4 pb-6 relative z-10 overflow-y-auto" style={{ scrollBehavior: "smooth" }}>
        <div className="text-center mb-8 mt-4 slide-in">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 mb-4">
            <TrendingUp className="h-3.5 w-3.5 text-purple-400" />
            <span className="text-[11px] font-medium text-purple-400" style={{ fontFamily: 'var(--font-display)' }}>Start Earning Today</span>
          </div>
          <h1 className="text-3xl font-bold mb-2" data-testid="text-activate-title" style={{ fontFamily: 'var(--font-display)' }}>
            <span className="gradient-text">Choose Your Package</span>
          </h1>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Select a package that matches your goals. Higher tiers unlock greater daily caps and earning potential.
          </p>
        </div>

        <div className="w-full max-w-lg space-y-3 mb-6">
          {[1, 2, 3, 4, 5].map((pkg) => {
            const Icon = PACKAGE_ICONS[pkg];
            const isSelected = selectedPkg === pkg;

            return (
              <button
                key={pkg}
                onClick={() => { setSelectedPkg(pkg); setApproved(false); setTimeout(() => activateRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 150); }}
                disabled={isLoading}
                className={`w-full flex items-center gap-4 p-4 rounded-xl transition-all duration-300 text-left slide-in border ${
                  isSelected
                    ? `neon-border bg-white/[0.06] ${CARD_BORDERS[pkg]}`
                    : `bg-white/[0.03] ${CARD_BORDERS[pkg]}`
                }`}
                style={{ animationDelay: `${pkg * 0.08}s` }}
                data-testid={`card-package-${pkg}`}
              >
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${ICON_COLORS[pkg]} flex items-center justify-center shrink-0 shadow-lg`}>
                  <Icon className="h-5 w-5 text-white drop-shadow" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-foreground" data-testid={`text-package-name-${pkg}`} style={{ fontFamily: 'var(--font-display)' }}>
                    {PACKAGE_NAMES[pkg]}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Max Earn: {maxIncomeLimits[pkg] || "..."} USDT
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-lg font-bold gradient-text" data-testid={`text-package-price-${pkg}`} style={{ fontFamily: 'var(--font-display)' }}>
                    ${PACKAGE_PRICES_USD[pkg].toLocaleString()}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60">USDT</div>
                </div>

                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 ${
                  isSelected
                    ? "bg-gradient-to-br from-amber-400 to-purple-500 shadow-md shadow-purple-500/30"
                    : "border border-white/[0.1]"
                }`}>
                  {isSelected && <Check className="h-3 w-3 text-white" />}
                </div>
              </button>
            );
          })}
        </div>

        <div className="w-full max-w-lg premium-card rounded-xl p-5 mb-6 slide-in" style={{ animationDelay: '0.5s' }}>
          <div className="flex items-center gap-2 mb-4">
            <div className="h-8 w-8 rounded-lg bg-cyan-500/15 flex items-center justify-center">
              <Info className="h-4 w-4 text-cyan-400" />
            </div>
            <span className="text-sm font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
              <span className="gradient-text">What You Get</span>
            </span>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
                <Check className="h-3 w-3 text-emerald-400" />
              </div>
              <span className="text-xs text-muted-foreground">Direct sponsor income, binary matching & level overrides</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
                <Check className="h-3 w-3 text-emerald-400" />
              </div>
              <span className="text-xs text-muted-foreground">Withdrawal matching income from your downline</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
                <Check className="h-3 w-3 text-emerald-400" />
              </div>
              <span className="text-xs text-muted-foreground">Access to the 10-tier Global BTC Reward Pool</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
                <Check className="h-3 w-3 text-emerald-400" />
              </div>
              <span className="text-xs text-muted-foreground">Free M Coin staking with daily token claiming</span>
            </div>
          </div>
        </div>

        <div className="w-full max-w-lg earnings-card rounded-xl p-5 mb-4 slide-in" style={{ animationDelay: '0.6s' }}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Selected Package</div>
              <div className="font-bold text-lg text-foreground" style={{ fontFamily: 'var(--font-display)' }}>
                <span className="gradient-text">{PACKAGE_NAMES[selectedPkg]}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Activation Fee</div>
              <div className="font-bold text-2xl gradient-text" style={{ fontFamily: 'var(--font-display)' }}>
                ${PACKAGE_PRICES_USD[selectedPkg].toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        <div ref={activateRef} className="w-full max-w-lg slide-in" style={{ animationDelay: '0.7s' }}>
          <button
            onClick={handleApproveAndActivate}
            disabled={isLoading}
            className="w-full glow-button text-white font-bold py-4 px-6 rounded-xl text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            data-testid="button-activate"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Rocket className="h-5 w-5" />
            )}
            {buttonLabel}
          </button>
          <p className="text-[11px] text-muted-foreground/60 text-center mt-3">
            By activating, you agree to the platform terms and conditions
          </p>
        </div>
      </div>
    </div>
  );
}
