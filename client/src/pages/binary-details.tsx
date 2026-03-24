import { GitBranch, ArrowLeft, ArrowDownLeft, ArrowDownRight, Users, Zap, TrendingUp, Info, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { formatTokenAmount } from "@/lib/contract";
import type { UserInfo, MvtPrice, BinaryPairs } from "@/hooks/use-web3";

interface BinaryDetailsProps {
  userInfo: UserInfo;
  mvtPrice: MvtPrice;
  binaryPairs: BinaryPairs;
  formatAmount: (val: bigint) => string;
}

export default function BinaryDetails({ userInfo, mvtPrice, binaryPairs, formatAmount }: BinaryDetailsProps) {
  const [, navigate] = useLocation();

  const leftCount = Number(userInfo.leftSubUsers);
  const rightCount = Number(userInfo.rightSubUsers);
  const matchedPairs = Number(userInfo.matchedPairs);
  const powerLegPts = Number(userInfo.powerLegPoints);
  const currentPairs = Number(binaryPairs.currentPairs);
  const newPairs = Number(binaryPairs.newPairs);
  const rebirthCount = Number(userInfo.rebirthCount);

  const stronger = leftCount >= rightCount ? "left" : "right";
  const weaker = leftCount >= rightCount ? "right" : "left";
  const strongCount = stronger === "left" ? leftCount : rightCount;
  const weakCount = weaker === "left" ? leftCount : rightCount;

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
          <p className="text-2xl font-bold text-blue-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-left-count">{leftCount}</p>
          <p className="text-[10px] text-muted-foreground">members</p>
        </div>
        <div className="glass-card rounded-2xl p-4 text-center" data-testid="card-matched-pairs">
          <GitBranch className="h-5 w-5 mx-auto text-emerald-400 mb-2" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Matched Pairs</p>
          <p className="text-2xl font-bold text-emerald-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-matched-pairs">{matchedPairs}</p>
          <p className="text-[10px] text-muted-foreground">total matched</p>
        </div>
        <div className="glass-card rounded-2xl p-4 text-center col-span-2 sm:col-span-1" data-testid="card-right-team">
          <ArrowDownRight className="h-5 w-5 mx-auto text-purple-400 mb-2" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Right Team</p>
          <p className="text-2xl font-bold text-purple-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-right-count">{rightCount}</p>
          <p className="text-[10px] text-muted-foreground">members</p>
        </div>
      </div>

      {/* Current Cycle */}
      <div className="glass-card rounded-2xl p-5 slide-in" style={{ animationDelay: "0.05s" }} data-testid="card-current-cycle">
        <h2 className="text-sm font-bold mb-3" style={{ fontFamily: "var(--font-display)" }}>
          <span className="gradient-text">Current Distribution Cycle</span>
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] text-center" data-testid="card-current-pairs">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Active Pairs</p>
            <p className="text-xl font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }} data-testid="text-current-pairs">{currentPairs}</p>
            <p className="text-[10px] text-muted-foreground">pairs in pool</p>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] text-center" data-testid="card-new-pairs">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">New Pairs</p>
            <p className="text-xl font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }} data-testid="text-new-pairs">{newPairs}</p>
            <p className="text-[10px] text-muted-foreground">since last distribution</p>
          </div>
        </div>
        {newPairs > 0 && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <p className="text-xs text-emerald-400 font-medium">{newPairs} new pair{newPairs !== 1 ? "s" : ""} pending — waiting for admin distribution cycle</p>
          </div>
        )}
      </div>

      {/* Power Leg */}
      <div className="glass-card rounded-2xl p-5 slide-in" style={{ animationDelay: "0.06s" }} data-testid="card-power-leg">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="h-9 w-9 rounded-xl bg-yellow-600/15 flex items-center justify-center">
            <Zap className="h-4 w-4 text-yellow-300" />
          </div>
          <div>
            <h2 className="text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}>Power Leg</h2>
            <p className="text-[10px] text-muted-foreground">Stronger arm contributes to power leg</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
            <p className="text-[10px] text-muted-foreground mb-1 capitalize">{stronger} (power leg)</p>
            <p className="text-lg font-bold text-yellow-300">{strongCount} members</p>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
            <p className="text-[10px] text-muted-foreground mb-1 capitalize">{weaker} (weak leg)</p>
            <p className="text-lg font-bold text-muted-foreground">{weakCount} members</p>
          </div>
        </div>
        <div className="mt-3 p-3 rounded-xl bg-yellow-600/[0.06] border border-yellow-600/10">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="text-yellow-300 font-medium">Power Leg Points: {powerLegPts}</span> — Every 10 points from the strong arm generates 1 extra binary pair, on top of matched pairs.
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

      {/* How Binary Works */}
      <div className="premium-card rounded-2xl p-5 slide-in" style={{ animationDelay: "0.08s" }}>
        <h2 className="text-sm font-bold mb-4" style={{ fontFamily: "var(--font-display)" }}>
          <span className="gradient-text">How Binary Income Works</span>
        </h2>
        <div className="space-y-3">
          {[
            { icon: Users, title: "30% of Activation", desc: "30% of each $130 activation goes into the binary pool as MVT tokens.", color: "text-amber-400 bg-amber-500/10" },
            { icon: GitBranch, title: "Pair Matching", desc: "Each left+right new member pair in your subtree generates 1 matched pair.", color: "text-blue-400 bg-blue-500/10" },
            { icon: Zap, title: "Power Leg Bonus", desc: "Strong arm generates power leg points → extra pairs. 30% of pool shared via power leg.", color: "text-yellow-300 bg-yellow-600/10" },
            { icon: TrendingUp, title: "Admin Distribution", desc: "Admin triggers distribution periodically. You earn MVT proportional to your pairs.", color: "text-emerald-400 bg-emerald-500/10" },
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
