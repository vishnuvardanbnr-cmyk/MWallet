import { GitBranch, ArrowLeft, Users, CheckCircle2, XCircle, TrendingUp, Network, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { ethers } from "ethers";
import type { UserInfo, MvtPrice, BinaryPairs } from "@/hooks/use-web3";

// Placement rates per level (in basis points, same as contract)
const PLACEMENT_RATES_BPS = [
  500,  // L1  = 5%
  200, 200,  // L2-3 = 2%
  100,  // L4  = 1%
  50, 50, 50, 50, 50, 50, 50, 50,  // L5-12 = 0.5%
  40, 40, 40, 40, 40, 40, 40, 40,  // L13-20 = 0.4%
  30, 30, 30, 30, 30, 30, 30, 30,  // L21-28 = 0.3%
  20, 20,  // L29-30 = 0.2%
];

function requiredDirects(level: number): number {
  return Math.ceil(level / 3);
}

function fmtMvt(wei: bigint): string {
  const val = parseFloat(ethers.formatUnits(wei, 18));
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(2)}M MVT`;
  if (val >= 1_000)     return `${(val / 1_000).toFixed(1)}K MVT`;
  return `${val.toFixed(2)} MVT`;
}

function shortenAddr(addr: string): string {
  if (!addr || addr === "0x0000000000000000000000000000000000000000") return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

interface BinaryDetailsProps {
  userInfo: UserInfo;
  mvtPrice: MvtPrice;
  binaryPairs: BinaryPairs;
  formatAmount: (val: bigint) => string;
}

export default function BinaryDetails({ userInfo }: BinaryDetailsProps) {
  const [, navigate] = useLocation();

  const directs = Number(userInfo.directCount);
  const qualifiedLevels = PLACEMENT_RATES_BPS.filter((_, i) => directs >= requiredDirects(i + 1)).length;
  const nextUnlock = PLACEMENT_RATES_BPS.findIndex((_, i) => directs < requiredDirects(i + 1));
  const nextRequiredDirects = nextUnlock >= 0 ? requiredDirects(nextUnlock + 1) : null;
  const leftVol = userInfo.leftSubUsers ?? 0n;
  const rightVol = userInfo.rightSubUsers ?? 0n;
  const hasLeft  = userInfo.leftChild  && userInfo.leftChild  !== "0x0000000000000000000000000000000000000000";
  const hasRight = userInfo.rightChild && userInfo.rightChild !== "0x0000000000000000000000000000000000000000";

  return (
    <div className="p-4 sm:p-6 space-y-6 relative z-10">
      {/* Header */}
      <div className="flex items-center gap-3 slide-in">
        <button
          onClick={() => navigate("/")}
          className="p-2 rounded-lg hover:bg-white/[0.04] text-muted-foreground hover:text-foreground transition-all"
          data-testid="button-back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
            <span className="gradient-text">Placement Income</span>
          </h1>
          <p className="text-sm text-muted-foreground">Your 30-level binary placement performance</p>
        </div>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-3 gap-3 slide-in" style={{ animationDelay: "0.04s" }}>
        <div className="glass-card rounded-2xl p-4 text-center" data-testid="card-direct-refs">
          <Users className="h-5 w-5 mx-auto text-emerald-400 mb-2" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Direct Refs</p>
          <p className="text-2xl font-bold text-emerald-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-direct-count">{directs}</p>
          <p className="text-[10px] text-muted-foreground">referrals</p>
        </div>
        <div className="glass-card rounded-2xl p-4 text-center" data-testid="card-qualified-levels">
          <CheckCircle2 className="h-5 w-5 mx-auto text-cyan-400 mb-2" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Qualified</p>
          <p className="text-2xl font-bold text-cyan-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-qualified-levels">{qualifiedLevels}<span className="text-sm text-muted-foreground">/30</span></p>
          <p className="text-[10px] text-muted-foreground">levels</p>
        </div>
        <div className="glass-card rounded-2xl p-4 text-center" data-testid="card-binary-side">
          <GitBranch className="h-5 w-5 mx-auto text-violet-400 mb-2" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">My Side</p>
          <p className="text-2xl font-bold text-violet-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-binary-side">
            {userInfo.placedLeft ? "L" : "R"}
          </p>
          <p className="text-[10px] text-muted-foreground">{userInfo.placedLeft ? "left leg" : "right leg"}</p>
        </div>
      </div>

      {/* Next unlock hint */}
      {nextRequiredDirects && (
        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-500/[0.06] border border-amber-500/10 slide-in" style={{ animationDelay: "0.05s" }} data-testid="card-next-unlock">
          <TrendingUp className="h-4 w-4 text-amber-400 shrink-0" />
          <p className="text-xs text-muted-foreground">
            <span className="text-amber-400 font-medium">{nextRequiredDirects - directs} more direct{nextRequiredDirects - directs !== 1 ? "s" : ""}</span> to unlock level {nextUnlock + 1} placement income
          </p>
        </div>
      )}
      {qualifiedLevels === 30 && (
        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/10 slide-in" style={{ animationDelay: "0.05s" }}>
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <p className="text-xs text-emerald-400 font-medium">You qualify for all 30 placement levels!</p>
        </div>
      )}

      {/* Level Qualification Table */}
      <div className="glass-card rounded-2xl p-5 slide-in" style={{ animationDelay: "0.06s" }} data-testid="card-level-table">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="h-9 w-9 rounded-xl bg-cyan-500/15 flex items-center justify-center">
            <Layers className="h-4 w-4 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}>Level Qualification</h2>
            <p className="text-[10px] text-muted-foreground">You need ceil(level÷3) direct referrals per level</p>
          </div>
        </div>

        <div className="space-y-1.5">
          {PLACEMENT_RATES_BPS.map((bps, i) => {
            const lvl = i + 1;
            const need = requiredDirects(lvl);
            const qualified = directs >= need;
            const rate = (bps / 100).toFixed(1);
            return (
              <div
                key={lvl}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${qualified ? "bg-cyan-500/[0.06] border border-cyan-500/10" : "bg-white/[0.015] border border-white/[0.04]"}`}
                data-testid={`row-level-${lvl}`}
              >
                <span className={`text-[10px] font-mono w-6 shrink-0 ${qualified ? "text-cyan-400" : "text-muted-foreground"}`}>L{lvl}</span>
                <div className="flex-1 flex items-center gap-1.5">
                  <span className={`text-[11px] font-bold ${qualified ? "text-cyan-300" : "text-muted-foreground"}`}>{rate}%</span>
                  <span className="text-[9px] text-muted-foreground">of grossMVT</span>
                </div>
                <span className="text-[9px] text-muted-foreground mr-1">{need} direct{need !== 1 ? "s" : ""}</span>
                {qualified
                  ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  : <XCircle    className="h-3.5 w-3.5 text-red-400/50 shrink-0" />
                }
              </div>
            );
          })}
        </div>

        <div className="mt-3 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
          <p className="text-[10px] text-muted-foreground">
            Total qualified: <span className="text-cyan-400 font-medium">{qualifiedLevels}/30 levels</span> — capturing{" "}
            <span className="text-cyan-400 font-medium">
              {(PLACEMENT_RATES_BPS.filter((_, i) => directs >= requiredDirects(i + 1)).reduce((s, b) => s + b, 0) / 100).toFixed(1)}%
            </span>{" "}
            of the 20% placement pool
          </p>
        </div>
      </div>


      {/* How Placement Income Works */}
      <div className="premium-card rounded-2xl p-5 slide-in" style={{ animationDelay: "0.08s" }}>
        <h2 className="text-sm font-bold mb-4" style={{ fontFamily: "var(--font-display)" }}>
          <span className="gradient-text">How Placement Income Works</span>
        </h2>
        <div className="space-y-3">
          {[
            { icon: Users,        title: "20% of Each Activation",      desc: "When anyone activates anywhere below you in the binary tree, 20% of their gross MVT is split across their 30 binary uplines — you included.",                        color: "text-amber-400 bg-amber-500/10" },
            { icon: GitBranch,    title: "30 Levels Deep",               desc: "Level 1 earns 5%, levels 2–3 earn 2%, level 4 earns 1%, levels 5–12 earn 0.5%, and rates taper down to 0.2% at levels 29–30.",                                      color: "text-cyan-400 bg-cyan-500/10" },
            { icon: CheckCircle2, title: "Direct Referral Qualification", desc: "You need ⌈level÷3⌉ direct referrals to earn from that level. No directs = only level 0 qualifies. Each 3 new directs unlock 3 more levels.",                      color: "text-emerald-400 bg-emerald-500/10" },
            { icon: TrendingUp,   title: "Instant & On-Chain",           desc: "Income is credited directly to your MVT balance inside the same activation transaction. No claim button, no off-chain step — it just arrives.",                       color: "text-violet-400 bg-violet-500/10" },
          ].map(({ icon: Icon, title, desc, color }) => (
            <div key={title} className="flex items-start gap-3">
              <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center shrink-0`}>
                <Icon className={`h-4 w-4 ${color.split(" ")[0]}`} />
              </div>
              <div>
                <p className="text-xs font-medium text-foreground">{title}</p>
                <p className="text-[10px] text-muted-foreground">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
