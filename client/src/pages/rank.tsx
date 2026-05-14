import { useLocation } from "wouter";
import { Award, Star, Zap, Shield, TrendingUp, Users, ChevronRight, CheckCircle2, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatTokenAmount } from "@/lib/contract";
import type { UserInfo } from "@/hooks/use-web3";

interface RankPageProps {
  userInfo: UserInfo;
  formatAmount: (val: bigint) => string;
}

export const RANKS = [
  { level: 0, name: "Member",        color: "text-slate-400",   bg: "bg-slate-400/10",   border: "border-slate-400/20",   bar: "bg-slate-400",   threshold: 0,        icon: Users,      desc: "Welcome to M-Vault" },
  { level: 1, name: "Bronze",        color: "text-amber-600",   bg: "bg-amber-600/10",   border: "border-amber-600/20",   bar: "bg-amber-600",   threshold: 500,      icon: Award,      desc: "Building your team" },
  { level: 2, name: "Silver",        color: "text-slate-300",   bg: "bg-slate-300/10",   border: "border-slate-300/20",   bar: "bg-slate-300",   threshold: 2000,     icon: Shield,     desc: "Growing momentum" },
  { level: 3, name: "Gold",          color: "text-yellow-400",  bg: "bg-yellow-400/10",  border: "border-yellow-400/20",  bar: "bg-yellow-400",  threshold: 5000,     icon: Star,       desc: "Solid performer" },
  { level: 4, name: "Platinum",      color: "text-cyan-400",    bg: "bg-cyan-400/10",    border: "border-cyan-400/20",    bar: "bg-cyan-400",    threshold: 15000,    icon: Zap,        desc: "Elite level reached" },
  { level: 5, name: "Diamond",       color: "text-blue-400",    bg: "bg-blue-400/10",    border: "border-blue-400/20",    bar: "bg-blue-400",    threshold: 50000,    icon: Award,      desc: "Top achiever" },
  { level: 6, name: "Double Diamond",color: "text-violet-400",  bg: "bg-violet-400/10",  border: "border-violet-400/20",  bar: "bg-violet-400",  threshold: 150000,   icon: TrendingUp, desc: "Elite performer" },
  { level: 7, name: "Crown Diamond", color: "text-amber-300",   bg: "bg-amber-300/10",   border: "border-amber-300/20",   bar: "bg-amber-300",   threshold: 500000,   icon: Star,       desc: "Pinnacle of excellence" },
];

export function getRankInfo(rank: number) {
  return RANKS[Math.max(0, Math.min(rank, RANKS.length - 1))];
}

function usdFmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toLocaleString()}`;
}

export default function RankPage({ userInfo, formatAmount }: RankPageProps) {
  const [, setLocation] = useLocation();

  const currentRank = Math.max(0, Math.min(userInfo.rank, RANKS.length - 1));
  const rankInfo = RANKS[currentRank];
  const nextRank = RANKS[currentRank + 1];
  const teamSalesNum = parseFloat(formatTokenAmount(userInfo.teamSalesUsdt, 18));

  const progressToNext = nextRank
    ? Math.min(100, ((teamSalesNum - rankInfo.threshold) / (nextRank.threshold - rankInfo.threshold)) * 100)
    : 100;

  const RankIcon = rankInfo.icon;

  return (
    <div className="p-4 sm:p-6 space-y-6 relative z-10">

      {/* Header */}
      <div className="slide-in">
        <h1 className="text-2xl font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }} data-testid="text-rank-title">
          Rank & Progression
        </h1>
        <p className="text-muted-foreground text-sm">Your current level and path to the next rank</p>
      </div>

      {/* Current Rank Card */}
      <div className={`glass-card rounded-2xl p-6 border ${rankInfo.border} slide-in`} style={{ animationDelay: "0.02s" }} data-testid="card-current-rank">
        <div className="flex items-center gap-4">
          <div className={`h-16 w-16 rounded-2xl ${rankInfo.bg} border ${rankInfo.border} flex items-center justify-center`}>
            <RankIcon className={`h-8 w-8 ${rankInfo.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-0.5">Your Current Rank</p>
            <p className={`text-3xl font-bold ${rankInfo.color}`} style={{ fontFamily: "var(--font-display)" }} data-testid="text-current-rank-name">
              {rankInfo.name}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{rankInfo.desc}</p>
          </div>
          <Badge variant="outline" className={`border ${rankInfo.border} ${rankInfo.color} text-sm px-3 py-1`} data-testid="text-rank-level">
            Level {currentRank}
          </Badge>
        </div>

        {/* Progress to next rank */}
        {nextRank ? (
          <div className="mt-6 space-y-2">
            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">Team Sales Progress</span>
              <span className={rankInfo.color} data-testid="text-team-sales">
                {usdFmt(teamSalesNum)} / {usdFmt(nextRank.threshold)}
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className={`h-full rounded-full ${rankInfo.bar} transition-all duration-700`}
                style={{ width: `${Math.max(2, progressToNext)}%` }}
                data-testid="bar-rank-progress"
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              {usdFmt(Math.max(0, nextRank.threshold - teamSalesNum))} more team sales needed to reach {nextRank.name}
            </p>
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-2 text-xs text-amber-300">
            <CheckCircle2 className="h-4 w-4" />
            You've reached the highest rank — Crown Diamond!
          </div>
        )}
      </div>

      {/* All Ranks Ladder */}
      <div className="glass-card rounded-2xl p-6 slide-in" style={{ animationDelay: "0.04s" }} data-testid="card-rank-ladder">
        <div className="flex items-center gap-3 mb-5">
          <div className="h-9 w-9 rounded-xl gradient-icon flex items-center justify-center">
            <Award className="h-4 w-4 text-yellow-300" />
          </div>
          <div>
            <h2 className="text-base font-bold" style={{ fontFamily: "var(--font-display)" }}>Rank Ladder</h2>
            <p className="text-[11px] text-muted-foreground">Based on total team sales (USDT)</p>
          </div>
        </div>

        <div className="space-y-2">
          {RANKS.map((r, idx) => {
            const Icon = r.icon;
            const isCurrentRank = idx === currentRank;
            const isAchieved = idx <= currentRank;
            const isNext = idx === currentRank + 1;

            return (
              <div
                key={r.name}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                  isCurrentRank
                    ? `${r.bg} ${r.border}`
                    : isAchieved
                    ? "bg-white/[0.03] border-white/[0.06]"
                    : "bg-transparent border-transparent opacity-50"
                }`}
                data-testid={`card-rank-${idx}`}
              >
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${isAchieved ? r.bg : "bg-white/[0.04]"}`}>
                  {isAchieved
                    ? <Icon className={`h-4 w-4 ${r.color}`} />
                    : <Lock className="h-4 w-4 text-muted-foreground/40" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-semibold ${isAchieved ? r.color : "text-muted-foreground"}`} style={{ fontFamily: "var(--font-display)" }}>
                      {r.name}
                    </p>
                    {isCurrentRank && (
                      <Badge variant="outline" className={`text-[9px] ${r.border} ${r.color}`}>Current</Badge>
                    )}
                    {isNext && (
                      <Badge variant="outline" className="text-[9px] border-amber-500/30 text-amber-400">Next</Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground">{r.desc}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-xs font-semibold ${isAchieved ? r.color : "text-muted-foreground/50"}`}>
                    {r.threshold === 0 ? "Entry" : usdFmt(r.threshold)}
                  </p>
                  {isAchieved && <CheckCircle2 className={`h-3.5 w-3.5 ml-auto ${r.color}`} />}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Team Stats relevant to rank */}
      <div className="grid grid-cols-2 gap-4 slide-in" style={{ animationDelay: "0.06s" }}>
        <div className="glass-card rounded-xl p-4 text-center" data-testid="card-team-sales-usdt">
          <TrendingUp className="h-5 w-5 mx-auto text-amber-400 mb-2" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Team Sales</p>
          <p className="text-lg font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }} data-testid="text-team-sales-usdt">
            {usdFmt(teamSalesNum)}
          </p>
          <p className="text-[10px] text-muted-foreground">Total USDT</p>
        </div>
        <div className="glass-card rounded-xl p-4 text-center" data-testid="card-rank-level-display">
          <Award className={`h-5 w-5 mx-auto ${rankInfo.color} mb-2`} />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Rank Level</p>
          <p className={`text-lg font-bold ${rankInfo.color}`} style={{ fontFamily: "var(--font-display)" }} data-testid="text-rank-level-number">
            {currentRank} / {RANKS.length - 1}
          </p>
          <p className="text-[10px] text-muted-foreground">Levels achieved</p>
        </div>
      </div>

      {/* CTA to grow team */}
      <div className="glass-card rounded-2xl p-5 border border-amber-500/20 slide-in" style={{ animationDelay: "0.08s" }} data-testid="card-rank-cta">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-9 w-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
            <Users className="h-4 w-4 text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-amber-300" style={{ fontFamily: "var(--font-display)" }}>Grow Your Team</p>
            <p className="text-[11px] text-muted-foreground">Team activations count toward your rank</p>
          </div>
        </div>
        <button
          onClick={() => setLocation("/team")}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-sm font-semibold text-amber-400 hover:bg-amber-500/15 transition-all"
          data-testid="button-go-team"
        >
          View Team <ChevronRight className="h-4 w-4" />
        </button>
      </div>

    </div>
  );
}
