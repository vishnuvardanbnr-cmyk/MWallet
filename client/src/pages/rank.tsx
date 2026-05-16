import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Award, Star, Zap, TrendingUp, Users, ChevronRight, CheckCircle2, Lock, Info, XCircle, Loader2, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import type { UserInfo } from "@/hooks/use-web3";
import { ethers } from "ethers";

interface RankPageProps {
  userInfo: UserInfo;
  account: string;
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
    slotLabel: null,
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
    incomePercent: 1,
    slotLabel: "Slot 1 · 1% per activation",
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
    incomePercent: 2,
    slotLabel: "Slot 2 · 2% per activation",
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
    incomePercent: 2,
    slotLabel: "Slot 3 · 2% per activation",
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
    incomePercent: 2,
    slotLabel: "Slot 4 · 2% per activation",
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
    incomePercent: 3,
    slotLabel: "Slot 5 · 3% per activation",
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

const M1_MIN_DIRECTS   = 5n;
const M1_MIN_TEAM_USDT = ethers.parseUnits("2000", 18);

export default function RankPage({ userInfo, account }: RankPageProps) {
  const [, setLocation] = useLocation();
  const [claimResult, setClaimResult] = useState<{
    upgraded: boolean;
    oldRank: number;
    newRank: number;
    message: string;
  } | null>(null);

  const currentRank = Math.max(0, Math.min(userInfo.rank ?? 0, RANKS.length - 1));
  const rankInfo    = RANKS[currentRank];
  const nextRank    = RANKS[currentRank + 1] ?? null;
  const RankIcon    = rankInfo.icon;

  const directCount  = userInfo.directCount  ?? 0n;
  const teamSalesWei = userInfo.teamSalesUsdt ?? 0n;
  const leftVol      = userInfo.leftSubUsers  ?? 0n;
  const rightVol     = userInfo.rightSubUsers ?? 0n;
  const teamSalesNum = Number(teamSalesWei / 10n ** 16n) / 100;

  const m1DirectOk = directCount >= M1_MIN_DIRECTS;
  const m1SalesOk  = teamSalesWei >= M1_MIN_TEAM_USDT;
  const m1LegsOk   = leftVol > 0n && rightVol > 0n;
  const m1LocalEligible = m1DirectOk && m1SalesOk && m1LegsOk;

  const m1DirectProgress = Math.min(100, (Number(directCount) / 5) * 100);
  const m1SalesProgress  = Math.min(100, (teamSalesNum / 2000) * 100);

  const canClaim = userInfo.isActive && currentRank < 5;

  const claimMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/rank/claim", { address: account }).then(r => r.json()),
    onSuccess: (data) => {
      setClaimResult(data);
    },
    onError: (err: any) => {
      setClaimResult({
        upgraded: false,
        oldRank: currentRank,
        newRank: currentRank,
        message: err?.message || "Rank check failed — please try again",
      });
    },
  });

  function CriterionRow({ ok, label, value }: { ok: boolean; label: string; value: string }) {
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {ok
            ? <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            : <XCircle className="h-4 w-4 text-rose-400/70 shrink-0" />
          }
          <span className="text-[12px] text-muted-foreground">{label}</span>
        </div>
        <span className={`text-[12px] font-semibold ${ok ? "text-emerald-400" : "text-rose-400"}`}>{value}</span>
      </div>
    );
  }

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
          <div className="space-y-2 text-[11px] text-muted-foreground leading-relaxed">
            <p>
              <span className="text-amber-300 font-semibold">Rank income is paid directly from each activation</span> — based on your position in the sponsor tree, not the binary tree.
            </p>
            <p>
              Each activation has <span className="text-white font-semibold">5 rank slots</span> (1% + 2% + 2% + 2% + 3% = 10% of the activation fee). Going up the sponsor chain from the new member, the system finds the first person at each rank and pays them their slot.
            </p>
            <p>
              <span className="text-amber-300 font-semibold">Compression rule:</span> if an M2 (or higher) is the closest ranked person above an activation and there is no M1 between them, that M2 also collects the M1 slot.
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
              <p className="text-[10px] text-muted-foreground mt-0.5">per activation</p>
              <p className="text-[9px] text-muted-foreground/60 mt-0.5">(+ unfilled lower slots)</p>
            </div>
          )}
        </div>

        {/* M1 criteria checklist — always show when rank < 1 */}
        {currentRank === 0 && (
          <div className="mt-6 space-y-3 pt-4 border-t border-white/[0.06]">
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Progress toward M1</p>

            {/* Checklist */}
            <div className="space-y-2.5 mb-3">
              <CriterionRow
                ok={m1DirectOk}
                label="Direct sponsors (min 5)"
                value={`${Number(directCount)} / 5`}
              />
              <CriterionRow
                ok={m1SalesOk}
                label="Team sales (min $2,000)"
                value={`${usdFmt(teamSalesNum)} / $2,000`}
              />
              <CriterionRow
                ok={m1LegsOk}
                label="Both legs active"
                value={m1LegsOk ? "Yes" : "No"}
              />
            </div>

            {/* Progress bars */}
            <div className="space-y-2">
              <div>
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-muted-foreground">Direct Sponsors</span>
                  <span className={m1DirectOk ? "text-emerald-400" : "text-amber-400"} data-testid="text-direct-progress">{Number(directCount)} / 5</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-700 ${m1DirectOk ? "bg-emerald-400" : "bg-amber-400"}`} style={{ width: `${Math.max(2, m1DirectProgress)}%` }} data-testid="bar-direct-progress" />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-muted-foreground">Team Sales</span>
                  <span className={m1SalesOk ? "text-emerald-400" : "text-amber-400"} data-testid="text-sales-progress">{usdFmt(teamSalesNum)} / $2,000</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-700 ${m1SalesOk ? "bg-emerald-400" : "bg-amber-400"}`} style={{ width: `${Math.max(2, m1SalesProgress)}%` }} data-testid="bar-sales-progress" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Next rank requirement (M2-M5) */}
        {nextRank && currentRank > 0 && nextRank.qualification?.type === "downline" && (
          <div className="mt-5 pt-4 border-t border-white/[0.06]">
            <p className="text-[11px] text-muted-foreground mb-3">
              To reach <span className={`font-semibold ${nextRank.color}`}>{nextRank.name}</span>: qualify{" "}
              <span className="font-semibold text-white">{nextRank.qualification.downlineCount} {nextRank.qualification.downlineRank}</span> members in your downline
            </p>
          </div>
        )}
      </div>

      {/* Eligibility Claim Card */}
      {canClaim && (
        <div className="glass-card rounded-2xl p-5 border border-violet-500/20 slide-in" style={{ animationDelay: "0.03s" }} data-testid="card-rank-claim">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-9 w-9 rounded-xl bg-violet-500/15 flex items-center justify-center">
              <ShieldCheck className="h-4 w-4 text-violet-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-violet-300" style={{ fontFamily: "var(--font-display)" }}>
                {currentRank === 0 ? "Claim M1 Rank" : `Claim ${nextRank?.name ?? "Next"} Rank`}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {currentRank === 0
                  ? m1LocalEligible
                    ? "All M1 criteria met — request your rank on-chain"
                    : "Complete M1 requirements, then request verification"
                  : "Request a downline rank count check on-chain"
                }
              </p>
            </div>
          </div>

          {/* Result banner */}
          {claimResult && !claimMutation.isPending && (
            <div className={`mb-4 p-3 rounded-xl border text-[12px] font-medium ${
              claimResult.upgraded
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                : "bg-white/[0.04] border-white/[0.08] text-muted-foreground"
            }`} data-testid="text-claim-result">
              {claimResult.upgraded && (
                <CheckCircle2 className="inline h-4 w-4 mr-1.5 mb-0.5 text-emerald-400" />
              )}
              {claimResult.message}
            </div>
          )}

          <button
            onClick={() => {
              setClaimResult(null);
              claimMutation.mutate();
            }}
            disabled={claimMutation.isPending}
            data-testid="button-claim-rank"
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-semibold transition-all
              ${claimMutation.isPending
                ? "bg-white/[0.04] border-white/[0.08] text-muted-foreground cursor-not-allowed"
                : currentRank === 0 && m1LocalEligible
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/15"
                  : "bg-violet-500/10 border-violet-500/20 text-violet-400 hover:bg-violet-500/15"
              }`}
          >
            {claimMutation.isPending
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Verifying on-chain…</>
              : currentRank === 0 && m1LocalEligible
                ? <><ShieldCheck className="h-4 w-4" /> Claim M1 Rank Now</>
                : <><ShieldCheck className="h-4 w-4" /> Check Eligibility & Claim Rank</>
            }
          </button>

          <p className="mt-2 text-center text-[10px] text-muted-foreground/50">
            The server will verify your full downline and set your rank on-chain immediately if eligible.
          </p>
        </div>
      )}

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
            const isAchieved    = idx <= currentRank;
            const isNext        = idx === currentRank + 1;

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
                    <>
                      <p className={`text-sm font-bold ${isAchieved ? r.color : "text-muted-foreground/50"}`}>
                        {r.incomePercent}%
                      </p>
                      <p className="text-[9px] text-muted-foreground/50">slot {r.level}</p>
                    </>
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
        <div className="mt-4 pt-4 border-t border-white/[0.06] space-y-1.5">
          <p className="text-[10px] text-muted-foreground">% shown = your slot's share of each activation fee (M1=1%, M2=2%, M3=2%, M4=2%, M5=3%)</p>
          <p className="text-[10px] text-muted-foreground/60">Higher ranks also collect any unfilled lower slots — compression sends unclaimed slots up the chain</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 slide-in" style={{ animationDelay: "0.06s" }}>
        <div className="glass-card rounded-xl p-4 text-center" data-testid="card-direct-sponsors">
          <Users className="h-5 w-5 mx-auto text-amber-400 mb-2" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Direct Sponsors</p>
          <p className="text-lg font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }} data-testid="text-direct-count">
            {Number(directCount)}
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
