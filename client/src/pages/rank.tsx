import { useLocation } from "wouter";
import { Award, Star, Zap, TrendingUp, Users, ChevronRight, CheckCircle2, Lock, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { UserInfo } from "@/hooks/use-web3";

interface RankPageProps {
  userInfo: UserInfo;
}

export const RANKS = [
  {
    level: 0,
    name: "Unranked",
    short: "—",
    color: "text-slate-400",
    bg: "bg-slate-400/10",
    border: "border-slate-400/20",
    bar: "bg-slate-400",
    incomePercent: null,
    qualification: null,
    icon: Users,
    desc: "Complete qualification to earn rank income",
  },
  {
    level: 1,
    name: "M1",
    short: "M1",
    color: "text-amber-400",
    bg: "bg-amber-400/10",
    border: "border-amber-400/20",
    bar: "bg-amber-400",
    incomePercent: 10,
    qualification: { type: "direct", directSponsors: 5, teamSalesUsd: 2000, minLegs: 2, downlineRank: null, downlineCount: 0 },
    icon: Award,
    desc: "5 direct sponsors · $2,000 team sales (2 legs)",
  },
  {
    level: 2,
    name: "M2",
    short: "M2",
    color: "text-cyan-400",
    bg: "bg-cyan-400/10",
    border: "border-cyan-400/20",
    bar: "bg-cyan-400",
    incomePercent: 20,
    qualification: { type: "downline", directSponsors: 0, teamSalesUsd: 0, minLegs: 0, downlineRank: "M1", downlineCount: 2 },
    icon: Zap,
    desc: "2 M1 qualifiers in your downline",
  },
  {
    level: 3,
    name: "M3",
    short: "M3",
    color: "text-violet-400",
    bg: "bg-violet-400/10",
    border: "border-violet-400/20",
    bar: "bg-violet-400",
    incomePercent: 20,
    qualification: { type: "downline", directSponsors: 0, teamSalesUsd: 0, minLegs: 0, downlineRank: "M2", downlineCount: 4 },
    icon: Star,
    desc: "4 M2 qualifiers in your downline",
  },
  {
    level: 4,
    name: "M4",
    short: "M4",
    color: "text-emerald-400",
    bg: "bg-emerald-400/10",
    border: "border-emerald-400/20",
    bar: "bg-emerald-400",
    incomePercent: 20,
    qualification: { type: "downline", directSponsors: 0, teamSalesUsd: 0, minLegs: 0, downlineRank: "M3", downlineCount: 4 },
    icon: TrendingUp,
    desc: "4 M3 qualifiers in your downline",
  },
  {
    level: 5,
    name: "M5",
    short: "M5",
    color: "text-amber-300",
    bg: "bg-amber-300/10",
    border: "border-amber-300/20",
    bar: "bg-amber-300",
    incomePercent: 30,
    qualification: { type: "downline", directSponsors: 0, teamSalesUsd: 0, minLegs: 0, downlineRank: "M4", downlineCount: 4 },
    icon: Star,
    desc: "4 M4 qualifiers in your downline",
  },
];

export function getRankInfo(rank: number) {
  return RANKS[Math.max(0, Math.min(rank, RANKS.length - 1))];
}

function usdFmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toLocaleString()}`;
}

export default function RankPage({ userInfo }: RankPageProps) {
  const [, setLocation] = useLocation();

  const currentRank = Math.max(0, Math.min(userInfo.rank ?? 0, RANKS.length - 1));
  const rankInfo = RANKS[currentRank];
  const nextRank = RANKS[currentRank + 1] ?? null;
  const RankIcon = rankInfo.icon;

  const directCount = Number(userInfo.directCount ?? 0n);
  const teamSalesNum = Number((userInfo.teamSalesUsdt ?? 0n) / 10n ** 16n) / 100;

  const m1DirectProgress = Math.min(100, (directCount / 5) * 100);
  const m1SalesProgress = Math.min(100, (teamSalesNum / 2000) * 100);

  return (
    <div className="p-4 sm:p-6 space-y-6 relative z-10">

      {/* Header */}
      <div className="slide-in">
        <h1 className="text-2xl font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }} data-testid="text-rank-title">
          Rank & Progression
        </h1>
        <p className="text-muted-foreground text-sm">Earn rank income on every activation in your sponsor downline</p>
      </div>

      {/* How it works banner */}
      <div className="glass-card rounded-2xl p-4 border border-amber-500/20 slide-in" style={{ animationDelay: "0.01s" }} data-testid="card-rank-info">
        <div className="flex gap-3">
          <div className="h-8 w-8 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0 mt-0.5">
            <Info className="h-4 w-4 text-amber-400" />
          </div>
          <div className="space-y-1.5 text-[11px] text-muted-foreground leading-relaxed">
            <p>
              <span className="text-amber-300 font-semibold">Rank income is based on sponsor/level placement</span> — not the binary tree.
            </p>
            <p>
              When an account activates under you, you earn a percentage of the activation fee based on your rank. If someone between you and that activation reaches the same rank as you, they receive that income instead.
            </p>
          </div>
        </div>
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
          {rankInfo.incomePercent !== null && (
            <div className={`text-center px-4 py-3 rounded-xl ${rankInfo.bg} border ${rankInfo.border}`} data-testid="card-income-percent">
              <p className={`text-2xl font-bold ${rankInfo.color}`} style={{ fontFamily: "var(--font-display)" }}>
                {rankInfo.incomePercent}%
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">on activations</p>
            </div>
          )}
        </div>

        {/* M1 progress (only show if unranked or M1) */}
        {currentRank === 0 && (
          <div className="mt-6 space-y-3 pt-4 border-t border-white/[0.06]">
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Progress toward M1</p>
            <div className="space-y-2.5">
              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-muted-foreground">Direct Sponsors</span>
                  <span className="text-amber-400" data-testid="text-direct-progress">{directCount} / 5</span>
                </div>
                <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full rounded-full bg-amber-400 transition-all duration-700" style={{ width: `${Math.max(2, m1DirectProgress)}%` }} data-testid="bar-direct-progress" />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-muted-foreground">Team Sales (2+ legs)</span>
                  <span className="text-amber-400" data-testid="text-sales-progress">{usdFmt(teamSalesNum)} / $2,000</span>
                </div>
                <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full rounded-full bg-amber-400 transition-all duration-700" style={{ width: `${Math.max(2, m1SalesProgress)}%` }} data-testid="bar-sales-progress" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Next rank requirement (M2-M5) */}
        {nextRank && currentRank > 0 && nextRank.qualification?.type === "downline" && (
          <div className="mt-5 pt-4 border-t border-white/[0.06]">
            <p className="text-[11px] text-muted-foreground mb-2">
              To reach <span className={`font-semibold ${nextRank.color}`}>{nextRank.name}</span>: qualify{" "}
              <span className="font-semibold text-white">{nextRank.qualification.downlineCount} {nextRank.qualification.downlineRank}</span> members in your downline
            </p>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground/70">
              <Info className="h-3 w-3 shrink-0" />
              Downline rank counts are verified on-chain at distribution time
            </div>
          </div>
        )}
      </div>

      {/* Rank Ladder */}
      <div className="glass-card rounded-2xl p-6 slide-in" style={{ animationDelay: "0.04s" }} data-testid="card-rank-ladder">
        <div className="flex items-center gap-3 mb-5">
          <div className="h-9 w-9 rounded-xl gradient-icon flex items-center justify-center">
            <Award className="h-4 w-4 text-yellow-300" />
          </div>
          <div>
            <h2 className="text-base font-bold" style={{ fontFamily: "var(--font-display)" }}>Rank Ladder</h2>
            <p className="text-[11px] text-muted-foreground">Sponsor/level tree placement · not binary</p>
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
                    : isNext
                    ? "bg-white/[0.02] border-dashed border-white/[0.08]"
                    : "bg-transparent border-transparent opacity-40"
                }`}
                data-testid={`card-rank-${idx}`}
              >
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${isAchieved ? r.bg : "bg-white/[0.04]"}`}>
                  {isAchieved
                    ? <Icon className={`h-4 w-4 ${r.color}`} />
                    : <Lock className="h-4 w-4 text-muted-foreground/30" />
                  }
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`text-sm font-bold ${isAchieved ? r.color : "text-muted-foreground"}`} style={{ fontFamily: "var(--font-display)" }}>
                      {r.name}
                    </p>
                    {isCurrentRank && (
                      <Badge variant="outline" className={`text-[9px] ${r.border} ${r.color}`}>Current</Badge>
                    )}
                    {isNext && (
                      <Badge variant="outline" className="text-[9px] border-amber-500/30 text-amber-400">Next</Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">{r.desc}</p>
                </div>

                <div className="text-right shrink-0 flex flex-col items-end gap-1">
                  {r.incomePercent !== null ? (
                    <p className={`text-sm font-bold ${isAchieved ? r.color : "text-muted-foreground/50"}`}>
                      {r.incomePercent}%
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground/40">—</p>
                  )}
                  {isAchieved && idx > 0 && <CheckCircle2 className={`h-3.5 w-3.5 ${r.color}`} />}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-4 pt-4 border-t border-white/[0.06] flex items-center gap-4 flex-wrap">
          <p className="text-[10px] text-muted-foreground">Income % = share of activation fee you receive from each activation in your sponsor downline</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 slide-in" style={{ animationDelay: "0.06s" }}>
        <div className="glass-card rounded-xl p-4 text-center" data-testid="card-direct-sponsors">
          <Users className="h-5 w-5 mx-auto text-amber-400 mb-2" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Direct Sponsors</p>
          <p className="text-lg font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }} data-testid="text-direct-count">
            {directCount}
          </p>
          <p className="text-[10px] text-muted-foreground">of 5 needed for M1</p>
        </div>
        <div className="glass-card rounded-xl p-4 text-center" data-testid="card-team-sales">
          <TrendingUp className="h-5 w-5 mx-auto text-cyan-400 mb-2" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Team Sales</p>
          <p className="text-lg font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }} data-testid="text-team-sales">
            {usdFmt(teamSalesNum)}
          </p>
          <p className="text-[10px] text-muted-foreground">$2,000 needed for M1</p>
        </div>
      </div>

      {/* CTA */}
      <div className="glass-card rounded-2xl p-5 border border-amber-500/20 slide-in" style={{ animationDelay: "0.08s" }} data-testid="card-rank-cta">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-9 w-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
            <Users className="h-4 w-4 text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-amber-300" style={{ fontFamily: "var(--font-display)" }}>Grow Your Team</p>
            <p className="text-[11px] text-muted-foreground">More sponsors & activations = higher rank income</p>
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
