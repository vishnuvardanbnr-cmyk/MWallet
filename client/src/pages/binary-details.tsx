import { GitBranch, ArrowLeft, ArrowDownLeft, ArrowDownRight, Users, Zap, TrendingUp, Info, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { ethers } from "ethers";
import { formatTokenAmount } from "@/lib/contract";
import type { UserInfo, MvtPrice, BinaryPairs } from "@/hooks/use-web3";

function fmtVol(wei: bigint): string {
  const val = parseFloat(ethers.formatUnits(wei, 18));
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(2)}`;
}

interface BinaryDetailsProps {
  userInfo: UserInfo;
  mvtPrice: MvtPrice;
  binaryPairs: BinaryPairs;
  formatAmount: (val: bigint) => string;
}

export default function BinaryDetails({ userInfo, mvtPrice, binaryPairs, formatAmount }: BinaryDetailsProps) {
  const [, navigate] = useLocation();

  const leftVol = userInfo.leftSubUsers;
  const rightVol = userInfo.rightSubUsers;
  const leftSubVol = fmtVol(binaryPairs.currentPairs);   // leftSubVolume in MVT wei
  const rightSubVol = fmtVol(binaryPairs.newPairs);       // rightSubVolume in MVT wei
  const rebirthCount = Number(userInfo.rebirthCount);

  const stronger = leftVol >= rightVol ? "left" : "right";
  const weaker = leftVol >= rightVol ? "right" : "left";
  const strongDisplay = fmtVol(stronger === "left" ? leftVol : rightVol);
  const weakDisplay = fmtVol(weaker === "left" ? leftVol : rightVol);

  return (
    <div className="p-4 sm:p-6 space-y-6 relative z-10">
      <div className="flex items-center gap-3 slide-in">
        <button onClick={() => navigate("/")} className="p-2 rounded-lg hover:bg-white/[0.04] text-muted-foreground hover:text-foreground transition-all" data-testid="button-back">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
            <span className="gradient-text">Binary Details</span>
          </h1>
          <p className="text-sm text-muted-foreground">Your binary network performance</p>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 slide-in" style={{ animationDelay: "0.04s" }}>
        <div className="glass-card rounded-2xl p-4 text-center" data-testid="card-left-team">
          <ArrowDownLeft className="h-5 w-5 mx-auto text-blue-400 mb-2" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Left Team</p>
          <p className="text-2xl font-bold text-blue-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-left-count">{fmtVol(leftVol)}</p>
          <p className="text-[10px] text-muted-foreground">USDT vol</p>
        </div>
        <div className="glass-card rounded-2xl p-4 text-center" data-testid="card-direct-count">
          <GitBranch className="h-5 w-5 mx-auto text-emerald-400 mb-2" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Direct Refs</p>
          <p className="text-2xl font-bold text-emerald-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-direct-count">{Number(userInfo.directCount)}</p>
          <p className="text-[10px] text-muted-foreground">direct referrals</p>
        </div>
        <div className="glass-card rounded-2xl p-4 text-center col-span-2 sm:col-span-1" data-testid="card-right-team">
          <ArrowDownRight className="h-5 w-5 mx-auto text-purple-400 mb-2" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Right Team</p>
          <p className="text-2xl font-bold text-purple-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-right-count">{fmtVol(rightVol)}</p>
          <p className="text-[10px] text-muted-foreground">USDT vol</p>
        </div>
      </div>

      {/* Placement volumes */}
      <div className="glass-card rounded-2xl p-5 slide-in" style={{ animationDelay: "0.05s" }} data-testid="card-placement-volumes">
        <h2 className="text-sm font-bold mb-3" style={{ fontFamily: "var(--font-display)" }}>
          <span className="gradient-text">Cumulative Placement Volumes</span>
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] text-center" data-testid="card-left-vol">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Left Sub-Volume</p>
            <p className="text-xl font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }} data-testid="text-left-vol">{leftSubVol}</p>
            <p className="text-[10px] text-muted-foreground">MVT in left tree</p>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] text-center" data-testid="card-right-vol">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Right Sub-Volume</p>
            <p className="text-xl font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }} data-testid="text-right-vol">{rightSubVol}</p>
            <p className="text-[10px] text-muted-foreground">MVT in right tree</p>
          </div>
        </div>
        <div className="mt-3 flex items-start gap-2 p-2.5 rounded-xl bg-amber-500/[0.05] border border-amber-500/10">
          <Info className="h-3.5 w-3.5 text-amber-400/70 shrink-0 mt-0.5" />
          <p className="text-[10px] text-muted-foreground">Placement income (20% of grossMvt) is distributed across 30 binary levels instantly when each new user activates in your network.</p>
        </div>
      </div>

      {/* Sub-volumes */}
      <div className="glass-card rounded-2xl p-5 slide-in" style={{ animationDelay: "0.06s" }} data-testid="card-sub-volumes">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="h-9 w-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
            <Zap className="h-4 w-4 text-amber-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}>Tree Volumes (MVT)</h2>
            <p className="text-[10px] text-muted-foreground">Cumulative MVT volume flowing through each leg</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
            <p className="text-[10px] text-muted-foreground mb-1">Left Sub-Volume</p>
            <p className="text-lg font-bold text-blue-400">{leftSubVol}</p>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
            <p className="text-[10px] text-muted-foreground mb-1">Right Sub-Volume</p>
            <p className="text-lg font-bold text-purple-400">{rightSubVol}</p>
          </div>
        </div>
        <div className="mt-3 p-3 rounded-xl bg-amber-500/[0.06] border border-amber-500/10">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Sub-volumes accumulate as users activate under each leg. These values are used to determine which arm is stronger for placement tracking.
          </p>
        </div>
      </div>

      {/* Rebirth info */}
      <div className="glass-card rounded-2xl p-5 slide-in" style={{ animationDelay: "0.07s" }} data-testid="card-rebirth-info">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="h-9 w-9 rounded-xl bg-purple-500/15 flex items-center justify-center">
            <RotateCcw className="h-4 w-4 text-purple-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}>Rebirth Counter</h2>
            <p className="text-[10px] text-muted-foreground">Each rebirth resets income limit to $390</p>
          </div>
          <Badge variant="outline" className="ml-auto text-[9px] border-purple-500/30 text-purple-400">
            {rebirthCount} rebirth{rebirthCount !== 1 ? "s" : ""}
          </Badge>
        </div>
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Rebirth Pool: <span className="text-purple-400 font-medium">${parseFloat(formatTokenAmount(userInfo.rebirthPool, 18)).toFixed(2)} USDT</span>.
            When pool reaches $130, the admin can trigger rebirth — creating a sub-account for you in the binary tree.
            Your income limit resets to $390 and you start earning again.
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
            { icon: Users, title: "20% of Activation", desc: "20% of each activation's gross MVT is split across 30 binary upline levels — paid instantly at activation time.", color: "text-amber-400 bg-amber-500/10" },
            { icon: GitBranch, title: "30 Levels Deep", desc: "Each level receives a share of the 20% pool. Levels 1–3 get 2%, levels 4–6 get 1%, and rates taper down to level 30.", color: "text-blue-400 bg-blue-500/10" },
            { icon: Zap, title: "Direct Referral Qualification", desc: "You need ceil(level/3) direct referrals to earn from that level. Level 1–3 needs 1 direct, 4–6 needs 2, etc.", color: "text-yellow-300 bg-yellow-600/10" },
            { icon: TrendingUp, title: "Instant & On-Chain", desc: "No off-chain distributor or claim needed. Income is credited directly to your MVT balance inside the same transaction.", color: "text-emerald-400 bg-emerald-500/10" },
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
