import { useState } from "react";
import { Users, GitBranch, Coins, TrendingUp, Layers, Info, ArrowDownLeft, ArrowDownRight, CheckCircle2, ChevronDown, ChevronUp, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatTokenAmount } from "@/lib/contract";
import type { UserInfo, MvtPrice, BinaryPairs } from "@/hooks/use-web3";
import { useLocation } from "wouter";

interface IncomeProps {
  userInfo: UserInfo;
  mvtPrice: MvtPrice;
  binaryPairs: BinaryPairs;
  formatAmount: (val: bigint) => string;
  walletAddress?: string;
}

function fmtVol(wei: bigint): string {
  const val = Number(wei) / 1e18;
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  return val.toFixed(2);
}


function mvtFmt(val: bigint) {
  return parseFloat(formatTokenAmount(val, 18)).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function usdFmt(mvt: bigint, price: bigint) {
  if (price === 0n) return "—";
  const mvtNum  = parseFloat(formatTokenAmount(mvt, 18));
  const priceNum = parseFloat(formatTokenAmount(price, 18));
  return `$${(mvtNum * priceNum).toFixed(2)}`;
}

// 30 placement levels — exact rates as set on-chain via setPlacementRates
// L1=5% L2-3=2% L4=1% L5-12=0.5% L13-20=0.4% L21-28=0.3% L29-30=0.2%  (total 20% of grossMvt)
// Qualification: ceil(level/3) directs required (refsPerGroup=1)
const RAW_RATES = [500,200,200,100,50,50,50,50,50,50,50,50,40,40,40,40,40,40,40,40,30,30,30,30,30,30,30,30,20,20];
const PLACEMENT_RATES: { level: number; pct: string; dirReq: number }[] = RAW_RATES.map((bp, i) => ({
  level: i + 1,
  pct: `${(bp / 100).toFixed(bp % 100 === 0 ? 0 : 1)}%`,
  dirReq: Math.ceil((i + 1) / 3),
}));

export default function IncomePage({ userInfo, mvtPrice, binaryPairs, formatAmount, walletAddress }: IncomeProps) {
  const [, setLocation] = useLocation();
  const [showAllLevels, setShowAllLevels] = useState(false);

  const directCount = Number(userInfo.directCount);
  const leftVol     = binaryPairs.currentPairs;   // leftSubVolume
  const rightVol    = binaryPairs.newPairs;        // rightSubVolume

  const incomeLimitCapNum = parseFloat(formatTokenAmount(userInfo.incomeLimitCap, 18));
  const incomeCap     = incomeLimitCapNum > 0 ? incomeLimitCapNum : 390;
  const incomeUsed    = incomeCap - parseFloat(formatTokenAmount(userInfo.incomeLimit, 18));
  const incomeProgress = Math.min(100, (incomeUsed / incomeCap) * 100);

  // How many placement levels are currently qualified
  const qualifiedLevels = PLACEMENT_RATES.filter(r => directCount >= r.dirReq).length;

  return (
    <div className="p-4 sm:p-6 space-y-6 relative z-10">
      <div className="slide-in">
        <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
          <span className="gradient-text">Income</span>
        </h1>
        <p className="text-sm text-muted-foreground">Level income, binary pairs, and rebirth pool</p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 slide-in" style={{ animationDelay: "0.05s" }}>
        <div className="glass-card rounded-2xl p-4" data-testid="card-total-mvt-earned">
          <Coins className="h-4 w-4 text-yellow-300 mb-2" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Total Earned</p>
          <p className="text-lg font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }} data-testid="text-total-received">
            {mvtFmt(userInfo.totalReceived)} MVT
          </p>
          {mvtPrice.sellPrice > 0n && (
            <p className="text-[10px] text-muted-foreground">≈ {usdFmt(userInfo.totalReceived, mvtPrice.sellPrice)}</p>
          )}
        </div>
        <div className="glass-card rounded-2xl p-4" data-testid="card-mvt-balance">
          <TrendingUp className="h-4 w-4 text-amber-400 mb-2" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">MVT Balance</p>
          <p className="text-lg font-bold text-amber-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-mvt-balance">
            {mvtFmt(userInfo.mvtBalance)} MVT
          </p>
          <button onClick={() => setLocation("/sell-tokens")} className="text-[10px] text-amber-400 hover:text-amber-300 mt-1">
            Sell →
          </button>
        </div>
        <div className="glass-card rounded-2xl p-4" data-testid="card-rebirth-pool">
          <Layers className="h-4 w-4 text-purple-400 mb-2" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Rebirth Pool</p>
          <p className="text-lg font-bold text-purple-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-rebirth-pool">
            ${parseFloat(formatTokenAmount(userInfo.rebirthPool, 18)).toFixed(2)}
          </p>
        </div>
        <div className="glass-card rounded-2xl p-4" data-testid="card-qualified-levels">
          <GitBranch className="h-4 w-4 text-blue-400 mb-2" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Placement Levels</p>
          <p className="text-lg font-bold text-blue-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-qualified-levels">
            {qualifiedLevels}<span className="text-sm font-normal text-muted-foreground">/30</span>
          </p>
        </div>
      </div>

      {/* Income Limit Progress */}
      <div className="glass-card rounded-2xl p-5 slide-in" style={{ animationDelay: "0.07s" }} data-testid="card-income-limit">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}>
            <span className="gradient-text">Income Limit (${incomeCap.toFixed(2)} Max)</span>
          </h2>
          <Badge variant="outline" className="text-[9px] border-amber-500/30 text-amber-400">
            ${parseFloat(formatTokenAmount(userInfo.incomeLimit, 18)).toFixed(2)} remaining
          </Badge>
        </div>
        <div className="space-y-2">
          <div className="h-3 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-400 transition-all"
              style={{ width: `${incomeProgress}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>${incomeUsed.toFixed(2)} USDT received</span>
            <span>${incomeCap.toFixed(2)} cap (3× activation)</span>
          </div>
        </div>
        <div className="mt-3 flex items-start gap-2 p-2.5 rounded-xl bg-amber-500/[0.06] border border-amber-500/10">
          <Info className="h-3.5 w-3.5 text-amber-400/70 shrink-0 mt-0.5" />
          <p className="text-[10px] text-muted-foreground">When your income limit reaches $0, all MVT sell proceeds go to your rebirth pool. Trigger rebirth to reset your limit to ${incomeCap.toFixed(2)}.</p>
        </div>
      </div>

      {/* Placement Income Info */}
      <div className="glass-card rounded-2xl p-5 slide-in" style={{ animationDelay: "0.075s" }} data-testid="card-placement-income">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="h-9 w-9 rounded-xl bg-emerald-500/15 flex items-center justify-center">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}>
              <span className="gradient-text">Placement Income</span>
            </h2>
            <p className="text-[10px] text-muted-foreground">Paid instantly on-chain each time someone activates in your binary upline</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="text-center p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
            <ArrowDownLeft className="h-4 w-4 text-blue-400 mx-auto mb-1.5" />
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Left Team</p>
            <p className="text-xl font-bold text-blue-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-left-team">
              {fmtVol(userInfo.leftSubUsers)}
            </p>
          </div>
          <div className="text-center p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
            <GitBranch className="h-4 w-4 text-emerald-400 mx-auto mb-1.5" />
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Qualified Levels</p>
            <p className="text-xl font-bold text-emerald-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-qualified-levels-2">
              {qualifiedLevels}/30
            </p>
          </div>
          <div className="text-center p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
            <ArrowDownRight className="h-4 w-4 text-purple-400 mx-auto mb-1.5" />
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Right Team</p>
            <p className="text-xl font-bold text-purple-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-right-team">
              {fmtVol(userInfo.rightSubUsers)}
            </p>
          </div>
        </div>
        <div className="flex items-start gap-2 p-2.5 rounded-xl bg-emerald-500/[0.05] border border-emerald-500/10">
          <Info className="h-3.5 w-3.5 text-emerald-400/70 shrink-0 mt-0.5" />
          <p className="text-[10px] text-muted-foreground">
            20% of each activation's gross MVT is split across 30 binary placement levels — paid instantly to each qualified upline. No distribution cycle needed.
          </p>
        </div>
        <button onClick={() => setLocation("/binary")} className="mt-3 text-[10px] text-amber-400 hover:text-amber-300">
          View binary tree details →
        </button>
      </div>

      {/* Placement Income Structure — 30 levels */}
      <div className="glass-card rounded-2xl overflow-hidden slide-in" style={{ animationDelay: "0.09s" }} data-testid="card-placement-structure">
        <div className="p-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
              <Users className="h-4.5 w-4.5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}>
                <span className="gradient-text">Placement Income — 30 Binary Levels</span>
              </h2>
              <p className="text-[10px] text-muted-foreground">20% of each activation distributed across your binary upline — paid instantly</p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[9px] border-amber-500/30 text-amber-400">
              You have {directCount} direct{directCount !== 1 ? "s" : ""}
            </Badge>
            <Badge variant="outline" className={`text-[9px] ${qualifiedLevels >= 3 ? "border-emerald-500/30 text-emerald-400" : "border-muted-foreground/30 text-muted-foreground"}`}>
              L1–L3: {qualifiedLevels >= 3 ? "✓ Qualified" : `Need ${1 - directCount > 0 ? `${1 - directCount} more direct` : "1 direct"}`}
            </Badge>
            <Badge variant="outline" className={`text-[9px] ${qualifiedLevels >= 30 ? "border-emerald-500/30 text-emerald-400" : "border-muted-foreground/30 text-muted-foreground"}`}>
              {qualifiedLevels}/30 levels open
            </Badge>
          </div>
        </div>
        <div className="divide-y divide-white/[0.04]">
          {(showAllLevels ? PLACEMENT_RATES : PLACEMENT_RATES.slice(0, 6)).map(({ level, pct, dirReq }) => {
            const qualified = directCount >= dirReq;
            return (
              <div key={level} className="flex items-center justify-between px-5 py-2.5" data-testid={`row-placement-${level}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${qualified ? "bg-emerald-500/10" : "bg-white/[0.04]"}`}>
                    <span className={`text-[11px] font-bold ${qualified ? "text-emerald-400" : "text-muted-foreground"}`}>L{level}</span>
                  </div>
                  <div>
                    <p className="text-xs font-semibold">{pct} of gross MVT</p>
                    <p className="text-[10px] text-muted-foreground">
                      {dirReq} direct referral{dirReq !== 1 ? "s" : ""} required
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className={`text-[9px] ${qualified ? "border-emerald-500/30 text-emerald-400" : "border-muted-foreground/20 text-muted-foreground/50"}`}>
                  {qualified ? "Qualified" : "Locked"}
                </Badge>
              </div>
            );
          })}
        </div>
        <div className="p-3 border-t border-white/[0.06] text-center">
          <button
            onClick={() => setShowAllLevels(v => !v)}
            className="flex items-center gap-1 text-[10px] text-amber-400 hover:text-amber-300 transition-colors mx-auto"
            data-testid="button-toggle-all-levels"
          >
            {showAllLevels ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showAllLevels ? "Show fewer levels" : "Show all 30 levels"}
          </button>
        </div>
      </div>
    </div>
  );
}
