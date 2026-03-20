import { useState, useRef, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Loader2, LogOut, Wallet, Zap, Star, Crown, Shield, Award, Gem, Check, Info, ArrowLeft, Rocket, TrendingUp, AlertTriangle, RefreshCw } from "lucide-react";
import { PACKAGE_NAMES, PACKAGE_PRICES_USD, shortenAddress, getContract, formatTokenAmount, getTokenContract, CONTRACT_ADDRESS } from "@/lib/contract";
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

const PACKAGE_ICONS = [Zap, Zap, Star, Crown, Shield, Award, Gem];
const ICON_COLORS = [
  "",
  "from-cyan-400 to-blue-500",
  "from-slate-300 to-slate-500",
  "from-amber-400 to-orange-500",
  "from-amber-300 to-yellow-400",
  "from-amber-500 to-yellow-400",
  "from-rose-400 to-amber-400",
];
const CARD_BORDERS = [
  "",
  "border-amber-600/20 hover:border-cyan-500/40",
  "border-slate-400/20 hover:border-slate-400/40",
  "border-amber-500/20 hover:border-amber-500/40",
  "border-yellow-400/20 hover:border-yellow-400/40",
  "border-yellow-600/20 hover:border-yellow-600/40",
  "border-rose-400/20 hover:border-rose-400/40",
];

function parseContractError(err: any): string {
  const reason = err?.reason;
  if (reason === "UH") return "You already have this package or a higher one. Select a higher package.";
  if (reason === "NR") return "Wallet not registered. Please register first.";
  if (reason === "IP") return "Invalid package selected.";
  if (reason === "CD") return "Cannot downgrade your package.";
  const msg: string = err?.shortMessage || err?.message || "";
  if (msg.includes("transfer amount exceeds balance") || msg.includes("exceeds balance")) return "Insufficient USDT balance in your wallet.";
  if (msg.includes("transfer amount exceeds allowance") || msg.includes("exceeds allowance")) return "USDT approval missing or insufficient. Please try again.";
  if (msg.includes("user rejected") || msg.includes("User rejected") || err?.code === 4001) return "Transaction rejected in MetaMask.";
  if (msg.includes("missing revert data")) return "Transaction would fail on-chain. Check your USDT balance and try again.";
  if (reason) return reason;
  return msg.slice(0, 120) || "Transaction failed. Please try again.";
}

export default function ActivatePage({ account, approveToken, activatePackage, fetchUserData, disconnect }: ActivatePageProps) {
  const { toast } = useToast();
  const [selectedPkg, setSelectedPkg] = useState<number>(1);
  const [approved, setApproved] = useState(false);
  const [approving, setApproving] = useState(false);
  const [activating, setActivating] = useState(false);
  const activateRef = useRef<HTMLDivElement>(null);
  const [maxIncomeLimits, setMaxIncomeLimits] = useState<Record<number, string>>({});
  const [usdtBalance, setUsdtBalance] = useState<bigint | null>(null);
  const [usdtDecimals, setUsdtDecimals] = useState(18);
  const [balanceLoading, setBalanceLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        const contract = getContract(provider);
        const token = getTokenContract(provider);
        const decimals = Number(await contract.tokenDecimals());
        setUsdtDecimals(decimals);
        const bal = await token.balanceOf(account);
        setUsdtBalance(bal);
        const limits: Record<number, string> = {};
        for (let pkg = 1; pkg <= 6; pkg++) {
          const limit = await contract.getMaxIncomeLimit(pkg).catch(() => 0n);
          const formatted = parseFloat(formatTokenAmount(limit, decimals));
          limits[pkg] = `$${formatted.toLocaleString()}`;
        }
        setMaxIncomeLimits(limits);
      } catch (err) {
        console.error("Failed to fetch data:", err);
      } finally {
        setBalanceLoading(false);
      }
    };
    fetchData();
  }, [account]);

  const packagePrice = PACKAGE_PRICES_USD[selectedPkg];
  const priceInUnits = BigInt(packagePrice) * 10n ** BigInt(usdtDecimals);
  const hasEnoughBalance = usdtBalance !== null && usdtBalance >= priceInUnits;
  const usdtBalanceFormatted = usdtBalance !== null ? parseFloat(ethers.formatUnits(usdtBalance, usdtDecimals)).toFixed(2) : null;

  const handleApproveAndActivate = async () => {
    if (!hasEnoughBalance) {
      toast({ title: "Insufficient USDT Balance", description: `You need $${packagePrice} USDT but only have $${usdtBalanceFormatted} USDT in your wallet.`, variant: "destructive" });
      return;
    }
    setApproving(true);
    try {
      await approveToken(PACKAGE_PRICES_USD[selectedPkg].toString());
      setApproved(true);
    } catch (err: any) {
      toast({ title: "Approval Failed", description: parseContractError(err), variant: "destructive" });
      setApproving(false);
      return;
    }
    setApproving(false);
    setActivating(true);
    try {
      await activatePackage(selectedPkg);
      await fetchUserData();
    } catch (err: any) {
      toast({ title: "Activation Failed", description: parseContractError(err), variant: "destructive" });
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
            <Wallet className="h-3.5 w-3.5 text-amber-300" />
            <span className="font-mono text-xs">{shortenAddress(account)}</span>
          </div>
          <Button variant="ghost" size="icon" onClick={disconnect} className="text-muted-foreground hover:text-red-400" data-testid="button-disconnect">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center px-4 pb-6 relative z-10 overflow-y-auto" style={{ scrollBehavior: "smooth" }}>
        <div className="text-center mb-8 mt-4 slide-in">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-600/10 border border-yellow-600/20 mb-4">
            <TrendingUp className="h-3.5 w-3.5 text-yellow-300" />
            <span className="text-[11px] font-medium text-yellow-300" style={{ fontFamily: 'var(--font-display)' }}>Start Earning Today</span>
          </div>
          <h1 className="text-3xl font-bold mb-2" data-testid="text-activate-title" style={{ fontFamily: 'var(--font-display)' }}>
            <span className="gradient-text">Choose Your Package</span>
          </h1>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Select a package that matches your goals. Higher tiers unlock greater daily caps and earning potential.
          </p>
        </div>

        {/* USDT Balance Display */}
        <div className="w-full max-w-lg mb-5 slide-in" style={{ animationDelay: '0.1s' }}>
          {balanceLoading ? (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Checking your USDT balance...</span>
            </div>
          ) : usdtBalance !== null ? (
            <div className={`flex items-center justify-between px-4 py-3 rounded-xl border ${hasEnoughBalance ? "bg-emerald-500/5 border-emerald-500/20" : "bg-red-500/5 border-red-500/20"}`} data-testid="banner-usdt-balance">
              <div className="flex items-center gap-2">
                {hasEnoughBalance ? (
                  <Check className="h-4 w-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                )}
                <div>
                  <div className="text-xs text-muted-foreground">Your USDT Balance</div>
                  <div className={`text-sm font-bold ${hasEnoughBalance ? "text-emerald-400" : "text-red-400"}`} data-testid="text-usdt-balance">
                    ${usdtBalanceFormatted} USDT
                  </div>
                </div>
              </div>
              {!hasEnoughBalance && (
                <div className="text-right">
                  <div className="text-[10px] text-red-400/80">Need ${packagePrice} USDT</div>
                  <div className="text-[10px] text-red-400/60">Top up your wallet first</div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <span className="text-xs text-amber-400">Could not fetch USDT balance</span>
            </div>
          )}
        </div>

        <div className="w-full max-w-lg space-y-3 mb-6">
          {[1, 2, 3, 4, 5, 6].map((pkg) => {
            const Icon = PACKAGE_ICONS[pkg];
            const isSelected = selectedPkg === pkg;
            const pkgPriceUnits = BigInt(PACKAGE_PRICES_USD[pkg]) * 10n ** BigInt(usdtDecimals);
            const affordable = usdtBalance !== null && usdtBalance >= pkgPriceUnits;

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
                  <div className={`text-lg font-bold ${!affordable && usdtBalance !== null ? "text-muted-foreground/60" : "gradient-text"}`} data-testid={`text-package-price-${pkg}`} style={{ fontFamily: 'var(--font-display)' }}>
                    ${PACKAGE_PRICES_USD[pkg].toLocaleString()}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60">USDT</div>
                </div>

                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 ${
                  isSelected
                    ? "bg-gradient-to-br from-amber-400 to-yellow-400 shadow-md shadow-amber-500/30"
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
            <div className="h-8 w-8 rounded-lg bg-amber-600/15 flex items-center justify-center">
              <Info className="h-4 w-4 text-amber-300" />
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
              <span className="text-xs text-muted-foreground">Free M-Token staking with daily token claiming</span>
            </div>
          </div>
        </div>

        {/* Two-step activation indicator */}
        <div className="w-full max-w-lg mb-4 slide-in" style={{ animationDelay: '0.55s' }}>
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <div className="flex items-center gap-3 flex-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${approved || activating ? "bg-emerald-500 text-white" : "bg-amber-500/20 text-amber-300 border border-amber-500/40"}`}>
                {approved || activating ? <Check className="h-3 w-3" /> : "1"}
              </div>
              <span className={`text-xs ${approved || activating ? "text-emerald-400" : "text-muted-foreground"}`}>
                {approving ? "Approving USDT..." : "Approve USDT"}
              </span>
            </div>
            <div className="h-px w-8 bg-white/10" />
            <div className="flex items-center gap-3 flex-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${activating ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse" : "bg-white/[0.05] text-muted-foreground border border-white/[0.1]"}`}>
                {activating ? <Loader2 className="h-3 w-3 animate-spin" /> : "2"}
              </div>
              <span className={`text-xs ${activating ? "text-amber-300" : "text-muted-foreground"}`}>Activate Package</span>
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
            disabled={isLoading || (!hasEnoughBalance && usdtBalance !== null)}
            className="w-full glow-button text-white font-bold py-4 px-6 rounded-xl text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            data-testid="button-activate"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : !hasEnoughBalance && usdtBalance !== null ? (
              <AlertTriangle className="h-5 w-5" />
            ) : (
              <Rocket className="h-5 w-5" />
            )}
            {isLoading ? buttonLabel : (!hasEnoughBalance && usdtBalance !== null) ? `Insufficient Balance (Need $${packagePrice} USDT)` : buttonLabel}
          </button>
          <p className="text-[11px] text-muted-foreground/60 text-center mt-3">
            By activating, you agree to the platform terms and conditions
          </p>
        </div>
      </div>
    </div>
  );
}
