import { useState, useEffect, useCallback } from "react";
import { Coins, Loader2, Lock, Unlock, ChevronRight, Users, Trophy, Zap, CheckCircle2, Grid2X2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { BOARD_PRICES_USD, getMvaultContract, formatTokenAmount } from "@/lib/contract";

interface BoardProps {
  btcPoolBalance: bigint;
  formatAmount: (val: bigint) => string;
  enterBoardPool: () => Promise<void>;
  account: string;
}

interface UserBoardEntry {
  poolLevel: number;
  matrixIndex: number;
  positionInQueue: number;
  filledCount: number;
  completed: boolean;
}

interface BoardTier {
  level: number;
  price: number;
  queueLength: number;
  currentIndex: number;
  userEntries: UserBoardEntry[];
}

function getPoolReward(level: number): number {
  if (level >= 1 && level <= 9) {
    return BOARD_PRICES_USD[level + 1] || 0;
  }
  const price = BOARD_PRICES_USD[10] || 0;
  return Math.floor(price * 12 * 0.875);
}

export default function BoardPage({ btcPoolBalance, formatAmount, enterBoardPool, account }: BoardProps) {
  const { toast } = useToast();
  const [entering, setEntering] = useState(false);
  const [loading, setLoading] = useState(true);
  const [boardTiers, setBoardTiers] = useState<BoardTier[]>([]);

  const btcPoolFormatted = formatAmount(btcPoolBalance);
  const btcPoolNum = parseFloat(btcPoolFormatted.replace(/,/g, ''));
  const btcPoolPercent = Math.min((btcPoolNum / 50) * 100, 100);
  const canEnter = btcPoolNum >= 50;

  const loadBoardData = useCallback(async () => {
    setLoading(true);
    try {
      const { ethers } = await import("ethers");
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const contract = getMvaultContract(provider);
      const userAddr = account.toLowerCase();

      const tiers: BoardTier[] = [];
      for (let i = 1; i <= 10; i++) {
        try {
          const [queueLength, currentIndex] = await Promise.all([
            contract.getBoardQueueLength(i),
            contract.getBoardCurrentIndex(i),
          ]);
          const qLen = Number(queueLength);
          const cIdx = Number(currentIndex);

          const entries: UserBoardEntry[] = [];
          const maxScan = Math.min(qLen, cIdx + 50);

          for (let j = cIdx; j < maxScan; j++) {
            try {
              const matrixInfo = await contract.getBoardMatrixInfo(i, j);
              if (matrixInfo[0].toLowerCase() === userAddr) {
                entries.push({
                  poolLevel: i,
                  matrixIndex: j,
                  positionInQueue: j - cIdx + 1,
                  filledCount: Number(matrixInfo[1]),
                  completed: matrixInfo[2],
                });
              }
            } catch {
              break;
            }
          }

          tiers.push({
            level: i,
            price: BOARD_PRICES_USD[i],
            queueLength: qLen,
            currentIndex: cIdx,
            userEntries: entries,
          });
        } catch {
          tiers.push({
            level: i,
            price: BOARD_PRICES_USD[i],
            queueLength: 0,
            currentIndex: 0,
            userEntries: [],
          });
        }
      }
      setBoardTiers(tiers);
    } catch (err) {
      console.error("Failed to load board data:", err);
    } finally {
      setLoading(false);
    }
  }, [account]);

  useEffect(() => {
    loadBoardData();
  }, [loadBoardData]);

  const handleEnterPool = async () => {
    if (!canEnter) {
      toast({ title: "Insufficient balance", description: "You need at least $50 in your BTC pool to enter.", variant: "destructive" });
      return;
    }
    setEntering(true);
    try {
      await enterBoardPool();
      toast({ title: "Entered Board Pool", description: "You have successfully entered Pool 1." });
      loadBoardData();
    } catch (err: any) {
      toast({ title: "Failed to enter", description: err?.message || "Transaction failed", variant: "destructive" });
    } finally {
      setEntering(false);
    }
  };

  const formatPrice = (price: number) => {
    return `$${price.toLocaleString()}`;
  };

  const tierColors = [
    { bg: "bg-amber-500/10", border: "border-amber-500/15", text: "text-amber-400", gradient: "#f59e0b" },
    { bg: "bg-yellow-600/10", border: "border-yellow-600/15", text: "text-yellow-300", gradient: "#d4af37" },
    { bg: "bg-amber-600/10", border: "border-amber-600/15", text: "text-amber-300", gradient: "#c9a227" },
    { bg: "bg-emerald-500/10", border: "border-emerald-500/15", text: "text-emerald-400", gradient: "#10b981" },
    { bg: "bg-rose-500/10", border: "border-rose-500/15", text: "text-rose-400", gradient: "#f43f5e" },
    { bg: "bg-amber-500/10", border: "border-amber-500/15", text: "text-amber-400", gradient: "#f59e0b" },
    { bg: "bg-yellow-600/10", border: "border-yellow-600/15", text: "text-yellow-300", gradient: "#d4af37" },
    { bg: "bg-amber-600/10", border: "border-amber-600/15", text: "text-amber-300", gradient: "#c9a227" },
    { bg: "bg-emerald-500/10", border: "border-emerald-500/15", text: "text-emerald-400", gradient: "#10b981" },
    { bg: "bg-rose-500/10", border: "border-rose-500/15", text: "text-rose-400", gradient: "#f43f5e" },
  ];

  const getRewardSplit = (level: number) => {
    if (level <= 9) return { reward: "40%", nextPool: "40%", liquidity: "20%" };
    return { reward: "87.5%", system: "6.25%", liquidity: "6.25%" };
  };

  const allUserEntries = boardTiers.flatMap(t => t.userEntries);
  const fillingEntries = allUserEntries.filter(e => !e.completed);
  const completedEntries = allUserEntries.filter(e => e.completed);

  return (
    <div className="p-4 sm:p-6 space-y-6 relative z-10">
      <div className="slide-in">
        <h1 className="text-2xl font-bold" data-testid="text-board-title" style={{ fontFamily: 'var(--font-display)' }}>
          <span className="gradient-text">Board Pool</span>
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">Global BTC Reward Pool with 10 tiers</p>
      </div>

      <div className="earnings-card rounded-2xl p-6 slide-in" style={{ animationDelay: '0.05s' }} data-testid="card-btc-pool">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="relative w-32 h-32 shrink-0">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(168,85,247,0.1)" strokeWidth="8" />
              <circle
                cx="50" cy="50" r="42" fill="none"
                stroke="url(#boardPoolGradient)" strokeWidth="8" strokeLinecap="round"
                strokeDasharray={`${btcPoolPercent * 2.64} ${264 - btcPoolPercent * 2.64}`}
              />
              <defs>
                <linearGradient id="boardPoolGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#f59e0b" />
                  <stop offset="50%" stopColor="#d4af37" />
                  <stop offset="100%" stopColor="#c9a227" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold gradient-text" style={{ fontFamily: 'var(--font-display)' }} data-testid="text-btc-pool-amount">${btcPoolFormatted}</span>
              <span className="text-[10px] text-muted-foreground">of $50 required</span>
            </div>
          </div>

          <div className="flex-1 text-center sm:text-left">
            <h2 className="text-lg font-bold mb-1" style={{ fontFamily: 'var(--font-display)' }}>
              <span className="gradient-text">Your BTC Pool Balance</span>
            </h2>
            <p className="text-xs text-muted-foreground mb-4">10% of every withdrawal is added to your BTC pool. Once you reach $50, you can enter Pool 1.</p>
            <button
              onClick={handleEnterPool}
              disabled={!canEnter || entering}
              className={`w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                canEnter
                  ? "glow-button text-white"
                  : "bg-white/[0.05] text-muted-foreground cursor-not-allowed"
              }`}
              data-testid="button-enter-pool"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {entering ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Entering...</>
              ) : canEnter ? (
                <><Unlock className="h-4 w-4" /> Enter Pool 1</>
              ) : (
                <><Lock className="h-4 w-4" /> Need $50 to Enter</>
              )}
            </button>
          </div>
        </div>
      </div>

      {!loading && (
        <div className="glass-card rounded-2xl p-5 slide-in" style={{ animationDelay: '0.1s' }} data-testid="card-my-entries">
          <div className="flex items-center gap-3 mb-5">
            <div className="h-9 w-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
              <Grid2X2 className="h-4 w-4 text-amber-400" />
            </div>
            <div>
              <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                <span className="gradient-text">My Entries</span>
              </h2>
              <p className="text-[10px] text-muted-foreground">Your active and completed board positions</p>
            </div>
          </div>

          {allUserEntries.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">You have no board entries yet.</p>
              <p className="text-xs text-muted-foreground mt-1">Enter Pool 1 above to get started.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {fillingEntries.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2.5" data-testid="text-filling-count">FILLING ({fillingEntries.length})</p>
                  <div className="space-y-1">
                    {fillingEntries.map((entry, idx) => {
                      const colors = tierColors[(entry.poolLevel - 1) % 10];
                      const reward = getPoolReward(entry.poolLevel);
                      const progressPct = (entry.filledCount / 12) * 100;
                      return (
                        <div
                          key={`filling-${entry.poolLevel}-${entry.matrixIndex}`}
                          className="flex items-center gap-3 py-3 px-3 rounded-xl hover:bg-white/[0.02] transition-colors group"
                          data-testid={`entry-filling-${entry.poolLevel}-${idx}`}
                        >
                          <div className={`h-8 w-8 rounded-lg ${colors.bg} flex items-center justify-center shrink-0`}>
                            <span className={`text-xs font-bold ${colors.text}`} style={{ fontFamily: 'var(--font-display)' }}>{entry.poolLevel}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-sm font-semibold" style={{ fontFamily: 'var(--font-display)' }}>Pool {entry.poolLevel}</span>
                              <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-400 font-medium flex items-center gap-1">
                                <Loader2 className="h-2.5 w-2.5 animate-spin" /> Filling
                              </span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{ width: `${progressPct}%`, background: `linear-gradient(90deg, ${colors.gradient}, ${colors.gradient}cc)` }}
                              />
                            </div>
                          </div>
                          <div className="text-right shrink-0 ml-2">
                            <p className="text-[10px] text-muted-foreground">{entry.filledCount}/12</p>
                          </div>
                          <div className="text-right shrink-0 ml-2 min-w-[60px]">
                            <p className="text-[9px] text-muted-foreground">Reward</p>
                            <p className={`text-sm font-bold ${colors.text}`} style={{ fontFamily: 'var(--font-display)' }}>{formatPrice(reward)}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {completedEntries.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2.5" data-testid="text-completed-count">COMPLETED ({completedEntries.length})</p>
                  <div className="space-y-1">
                    {completedEntries.map((entry, idx) => {
                      const colors = tierColors[(entry.poolLevel - 1) % 10];
                      const reward = getPoolReward(entry.poolLevel);
                      return (
                        <div
                          key={`completed-${entry.poolLevel}-${entry.matrixIndex}`}
                          className="flex items-center gap-3 py-3 px-3 rounded-xl hover:bg-white/[0.02] transition-colors"
                          data-testid={`entry-completed-${entry.poolLevel}-${idx}`}
                        >
                          <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold" style={{ fontFamily: 'var(--font-display)' }}>Pool {entry.poolLevel}</span>
                              <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 font-medium flex items-center gap-1">
                                <CheckCircle2 className="h-2.5 w-2.5" /> Completed
                              </span>
                            </div>
                          </div>
                          <div className="text-right shrink-0 ml-2">
                            <p className="text-[10px] text-muted-foreground">12/12</p>
                          </div>
                          <div className="text-right shrink-0 ml-2 min-w-[60px]">
                            <p className="text-[9px] text-emerald-400">Earned</p>
                            <p className="text-sm font-bold text-emerald-400" style={{ fontFamily: 'var(--font-display)' }}>{formatPrice(reward)}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="slide-in" style={{ animationDelay: '0.15s' }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="h-9 w-9 rounded-xl bg-yellow-600/15 flex items-center justify-center">
            <Trophy className="h-4 w-4 text-yellow-300" />
          </div>
          <div>
            <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-display)' }}>
              <span className="gradient-text">Pool Tiers</span>
            </h2>
            <p className="text-[10px] text-muted-foreground">2-level matrix (12 members), FCFS placement, 10 levels</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-yellow-300 mb-3" />
          <p className="text-sm text-muted-foreground">Loading board data...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {boardTiers.map((tier, idx) => {
            const colors = tierColors[idx];
            const split = getRewardSplit(tier.level);
            const activeMatrices = tier.queueLength > 0 ? tier.queueLength - tier.currentIndex : 0;
            const ownerReward = getPoolReward(tier.level);
            return (
              <div
                key={tier.level}
                className={`glass-card rounded-2xl p-5 slide-in border ${colors.border}`}
                style={{ animationDelay: `${0.2 + idx * 0.03}s` }}
                data-testid={`card-board-tier-${tier.level}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-xl ${colors.bg} flex items-center justify-center`}>
                      <span className={`text-sm font-bold ${colors.text}`} style={{ fontFamily: 'var(--font-display)' }}>{tier.level}</span>
                    </div>
                    <div>
                      <p className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)' }}>Pool {tier.level}</p>
                      <p className="text-[11px] text-muted-foreground">Entry: {formatPrice(tier.price)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] text-muted-foreground">Reward</p>
                    <p className={`text-sm font-bold ${colors.text}`} style={{ fontFamily: 'var(--font-display)' }}>{formatPrice(ownerReward)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="p-2.5 rounded-lg bg-white/[0.03]">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Active Queue</p>
                    <p className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)' }} data-testid={`text-board-queue-${tier.level}`}>{activeMatrices}</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white/[0.03]">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Completed</p>
                    <p className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)' }} data-testid={`text-board-completed-${tier.level}`}>{tier.currentIndex}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-md ${colors.bg} ${colors.text} font-medium`}>
                    Owner: {split.reward}
                  </span>
                  {split.nextPool && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-white/[0.03] text-muted-foreground font-medium">
                      Next Pool: {split.nextPool}
                    </span>
                  )}
                  <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-white/[0.03] text-muted-foreground font-medium">
                    Liquidity: {split.liquidity}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="glass-card rounded-2xl p-5 slide-in" style={{ animationDelay: '0.5s' }} data-testid="card-board-info">
        <h3 className="text-sm font-bold mb-3" style={{ fontFamily: 'var(--font-display)' }}>
          <span className="gradient-text">How it Works</span>
        </h3>
        <div className="space-y-2">
          <div className="flex items-start gap-2.5">
            <div className="h-5 w-5 rounded-md bg-amber-500/10 flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-[10px] font-bold text-amber-400">1</span>
            </div>
            <p className="text-xs text-muted-foreground">10% of every withdrawal is added to your BTC pool balance</p>
          </div>
          <div className="flex items-start gap-2.5">
            <div className="h-5 w-5 rounded-md bg-yellow-600/10 flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-[10px] font-bold text-yellow-300">2</span>
            </div>
            <p className="text-xs text-muted-foreground">Once your BTC pool reaches $50, you can enter Pool 1</p>
          </div>
          <div className="flex items-start gap-2.5">
            <div className="h-5 w-5 rounded-md bg-amber-600/10 flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-[10px] font-bold text-amber-300">3</span>
            </div>
            <p className="text-xs text-muted-foreground">Each pool uses a 2-level matrix (3 + 9 = 12 members to complete)</p>
          </div>
          <div className="flex items-start gap-2.5">
            <div className="h-5 w-5 rounded-md bg-emerald-500/10 flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-[10px] font-bold text-emerald-400">4</span>
            </div>
            <p className="text-xs text-muted-foreground">When your matrix completes, you receive your reward and auto-enter the next pool</p>
          </div>
        </div>
      </div>
    </div>
  );
}
