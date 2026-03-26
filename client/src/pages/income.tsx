import { Users, GitBranch, Coins, TrendingUp, Layers, Info, ArrowDownLeft, ArrowDownRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatTokenAmount } from "@/lib/contract";
import type { UserInfo, MvtPrice, BinaryPairs } from "@/hooks/use-web3";
import { useLocation } from "wouter";

interface IncomeProps {
  userInfo: UserInfo;
  mvtPrice: MvtPrice;
  binaryPairs: BinaryPairs;
  formatAmount: (val: bigint) => string;
}

const LEVEL_RATES: { level: number; pct: string; value: string; dirReq: number }[] = [
  { level: 1,  pct: "20%",  value: "$26.00", dirReq: 2 },
  { level: 2,  pct: "5%",   value: "$6.50",  dirReq: 2 },
  { level: 3,  pct: "2%",   value: "$2.60",  dirReq: 2 },
  { level: 4,  pct: "1%",   value: "$1.30",  dirReq: 2 },
  { level: 5,  pct: "0.5%", value: "$0.65",  dirReq: 5 },
  { level: 6,  pct: "0.5%", value: "$0.65",  dirReq: 5 },
  { level: 7,  pct: "0.3%", value: "$0.39",  dirReq: 5 },
  { level: 8,  pct: "0.3%", value: "$0.39",  dirReq: 5 },
  { level: 9,  pct: "0.2%", value: "$0.26",  dirReq: 5 },
  { level: 10, pct: "0.2%", value: "$0.26",  dirReq: 5 },
];

function mvtFmt(val: bigint) {
  return parseFloat(formatTokenAmount(val, 18)).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function usdFmt(mvt: bigint, price: bigint) {
  if (price === 0n) return "—";
  const mvtNum = parseFloat(formatTokenAmount(mvt, 18));
  const priceNum = parseFloat(formatTokenAmount(price, 18));
  return `$${(mvtNum * priceNum).toFixed(2)}`;
}

export default function IncomePage({ userInfo, mvtPrice, binaryPairs, formatAmount }: IncomeProps) {
  const [, setLocation] = useLocation();

  const directCount = Number(userInfo.directCount);
  const leftCount = Number(userInfo.leftSubUsers);
  const rightCount = Number(userInfo.rightSubUsers);
  const currentPairs = Number(binaryPairs.currentPairs);
  const newPairs = Number(binaryPairs.newPairs);
  const matchedPairs = Number(userInfo.matchedPairs);
  const sellPriceNum = parseFloat(formatTokenAmount(mvtPrice.sellPrice, 18));

  const totalReceivedMvt = parseFloat(formatTokenAmount(userInfo.totalReceived, 18));
  const mvtBalanceMvt = parseFloat(formatTokenAmount(userInfo.mvtBalance, 18));
  const incomeUsed = 390 - parseFloat(formatTokenAmount(userInfo.incomeLimit, 18));
  const incomeProgress = Math.min(100, (incomeUsed / 390) * 100);

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
        <div className="glass-card rounded-2xl p-4" data-testid="card-power-leg">
          <GitBranch className="h-4 w-4 text-blue-400 mb-2" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Power Leg Pts</p>
          <p className="text-lg font-bold text-blue-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-power-leg">
            {Number(userInfo.powerLegPoints)}
          </p>
        </div>
      </div>

      {/* Income Limit Progress */}
      <div className="glass-card rounded-2xl p-5 slide-in" style={{ animationDelay: "0.07s" }} data-testid="card-income-limit">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}>
            <span className="gradient-text">Income Limit ($390 Max)</span>
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
            <span>$390 cap (3× activation)</span>
          </div>
        </div>
        <div className="mt-3 flex items-start gap-2 p-2.5 rounded-xl bg-amber-500/[0.06] border border-amber-500/10">
          <Info className="h-3.5 w-3.5 text-amber-400/70 shrink-0 mt-0.5" />
          <p className="text-[10px] text-muted-foreground">When your income limit reaches $0, all MVT sell proceeds go to your rebirth pool. Trigger rebirth to reset your limit to $390.</p>
        </div>
      </div>

      {/* Binary Income */}
      <div className="glass-card rounded-2xl p-5 slide-in" style={{ animationDelay: "0.08s" }} data-testid="card-binary-income">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}>
            <span className="gradient-text">Binary Network</span>
          </h2>
          <button onClick={() => setLocation("/binary")} className="text-[10px] text-amber-400 hover:text-amber-300">
            Details →
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="text-center p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
            <ArrowDownLeft className="h-4 w-4 text-blue-400 mx-auto mb-1.5" />
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Left Team</p>
            <p className="text-xl font-bold text-blue-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-left-team">{leftCount}</p>
          </div>
          <div className="text-center p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
            <GitBranch className="h-4 w-4 text-emerald-400 mx-auto mb-1.5" />
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Matched</p>
            <p className="text-xl font-bold text-emerald-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-matched-pairs">{matchedPairs}</p>
          </div>
          <div className="text-center p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
            <ArrowDownRight className="h-4 w-4 text-purple-400 mx-auto mb-1.5" />
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Right Team</p>
            <p className="text-xl font-bold text-purple-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-right-team">{rightCount}</p>
          </div>
        </div>

        {newPairs > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <p className="text-xs text-emerald-400 font-medium">{newPairs} new pair{newPairs !== 1 ? "s" : ""} pending — admin distributes binary income per cycle</p>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
          <div className="text-center">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Binary Pool (30%)</p>
            <p className="text-xs font-medium">Of every $130 activation</p>
          </div>
          <div className="text-center">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Power Leg (30%)</p>
            <p className="text-xs font-medium">{Number(userInfo.powerLegPoints)} pts = {Number(userInfo.powerLegPoints) / 10} new pairs</p>
          </div>
        </div>
      </div>

      {/* Level Income Structure */}
      <div className="glass-card rounded-2xl overflow-hidden slide-in" style={{ animationDelay: "0.09s" }} data-testid="card-level-structure">
        <div className="p-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
              <Users className="h-4.5 w-4.5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}>
                <span className="gradient-text">Level Income Structure</span>
              </h2>
              <p className="text-[10px] text-muted-foreground">30% of each $130 activation distributed over 10 levels</p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[9px] border-amber-500/30 text-amber-400">
              You have {directCount} direct{directCount !== 1 ? "s" : ""}
            </Badge>
            <Badge variant="outline" className={`text-[9px] ${directCount >= 2 ? "border-emerald-500/30 text-emerald-400" : "border-muted-foreground/30 text-muted-foreground"}`}>
              L1–L4: {directCount >= 2 ? "✓ Qualified" : `Need ${2 - directCount} more`}
            </Badge>
            <Badge variant="outline" className={`text-[9px] ${directCount >= 5 ? "border-emerald-500/30 text-emerald-400" : "border-muted-foreground/30 text-muted-foreground"}`}>
              L5–L10: {directCount >= 5 ? "✓ Qualified" : `Need ${5 - directCount} more`}
            </Badge>
          </div>
        </div>
        <div className="divide-y divide-white/[0.04]">
          {LEVEL_RATES.map(({ level, pct, value, dirReq }) => {
            const qualified = directCount >= dirReq;
            return (
              <div key={level} className="flex items-center justify-between px-5 py-2.5" data-testid={`row-level-${level}`}>
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-white/[0.04] flex items-center justify-center">
                    <span className="text-[11px] font-bold text-muted-foreground">L{level}</span>
                  </div>
                  <div>
                    <p className="text-xs font-semibold">{pct} of gross MVT <span className="text-muted-foreground font-normal">≈ {value}</span></p>
                    <p className="text-[10px] text-muted-foreground">{dirReq} direct{dirReq !== 1 ? "s" : ""} required</p>
                  </div>
                </div>
                <Badge variant="outline" className={`text-[9px] ${qualified ? "border-emerald-500/30 text-emerald-400" : "border-muted-foreground/20 text-muted-foreground/50"}`}>
                  {qualified ? "Qualified" : "Locked"}
                </Badge>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
