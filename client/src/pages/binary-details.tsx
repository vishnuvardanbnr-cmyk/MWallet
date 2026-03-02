import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { GitBranch, ArrowLeft, Loader2, Clock, BarChart3, ArrowDownLeft, ArrowDownRight, ChevronLeft, ChevronRight, Zap, CalendarDays, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { IncomeInfo, BinaryInfo } from "@/hooks/use-web3";

interface ContractTx {
  type: string;
  amount: bigint;
  detail: string;
  timestamp: number;
  isIncome: boolean;
}

interface BinaryDetailsProps {
  incomeInfo: IncomeInfo;
  binaryInfo: BinaryInfo;
  formatAmount: (val: bigint) => string;
  getTransactionsFromContract: (offset: number, limit: number) => Promise<{ transactions: ContractTx[]; total: number }>;
  claimBinaryIncome: () => Promise<void>;
}

const ITEMS_PER_PAGE = 10;

export default function BinaryDetails({ incomeInfo, binaryInfo, formatAmount, getTransactionsFromContract, claimBinaryIncome }: BinaryDetailsProps) {
  const [, navigate] = useLocation();
  const [transactions, setTransactions] = useState<ContractTx[]>([]);
  const [loadingTxs, setLoadingTxs] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [claiming, setClaiming] = useState(false);

  const handleClaim = async () => {
    setClaiming(true);
    try {
      await claimBinaryIncome();
    } catch (err) {
      console.error("Claim error:", err);
    } finally {
      setClaiming(false);
    }
  };

  const loadTransactions = useCallback(async () => {
    setLoadingTxs(true);
    try {
      const result = await getTransactionsFromContract(0, 200);
      const binaryTxs = result.transactions.filter(tx => tx.type === "Binary Matching");
      setTransactions(binaryTxs);
    } catch {
      setTransactions([]);
    } finally {
      setLoadingTxs(false);
    }
  }, [getTransactionsFromContract]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  const dailyPercent = binaryInfo.dailyCap > BigInt(0)
    ? Math.min(Number((binaryInfo.todayBinaryIncome * BigInt(100)) / binaryInfo.dailyCap), 100)
    : 0;

  const totalVolume = binaryInfo.leftBusiness + binaryInfo.rightBusiness;
  const matchedVolume = binaryInfo.carryLeft < binaryInfo.carryRight ? binaryInfo.carryLeft : binaryInfo.carryRight;

  const formatTimestamp = (ts: number) => {
    if (ts === 0) return "";
    const date = new Date(ts * 1000);
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) + " " + date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (ts: number) => {
    if (ts === 0) return "";
    const date = new Date(ts * 1000);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const claimsByDay = transactions.reduce<Record<string, { total: bigint; count: number; timestamps: number[] }>>((acc, tx) => {
    const dayKey = new Date(tx.timestamp * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    if (!acc[dayKey]) {
      acc[dayKey] = { total: BigInt(0), count: 0, timestamps: [] };
    }
    acc[dayKey].total += tx.amount;
    acc[dayKey].count += 1;
    acc[dayKey].timestamps.push(tx.timestamp);
    return acc;
  }, {});

  const dayEntries = Object.entries(claimsByDay).sort((a, b) => {
    const tsA = Math.max(...a[1].timestamps);
    const tsB = Math.max(...b[1].timestamps);
    return tsB - tsA;
  });

  const totalPages = Math.max(1, Math.ceil(transactions.length / ITEMS_PER_PAGE));
  const paginatedTxs = transactions.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  return (
    <div className="p-4 sm:p-6 space-y-6 relative z-10">
      <div className="slide-in">
        <button
          onClick={() => navigate("/income")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground mb-3 transition-colors"
          data-testid="button-back-to-income"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Income
        </button>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-purple-500/15 flex items-center justify-center">
            <GitBranch className="h-5 w-5 text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-binary-details-title" style={{ fontFamily: 'var(--font-display)' }}>
              <span className="gradient-text">Binary Income</span>
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">Detailed view of your binary matching income</p>
          </div>
        </div>
      </div>

      <div className="earnings-card rounded-2xl overflow-hidden slide-in" style={{ animationDelay: '0.05s' }} data-testid="card-binary-claimable">
        <div className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-9 w-9 rounded-xl bg-purple-500/15 flex items-center justify-center">
              <Zap className="h-4 w-4 text-purple-400" />
            </div>
            <div>
              <p className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                <span className="gradient-text">Claimable Balance</span>
              </p>
              <p className="text-[10px] text-muted-foreground">Accumulated from daily snapshots</p>
            </div>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-3xl font-bold gradient-text" style={{ fontFamily: 'var(--font-display)' }} data-testid="text-binary-claimable-amount">
                ${formatAmount(binaryInfo.claimableBinaryIncome)}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">Total binary earned: ${formatAmount(incomeInfo.totalBinaryIncome)}</p>
            </div>
            {binaryInfo.claimableBinaryIncome > BigInt(0) && (
              <Button
                onClick={handleClaim}
                disabled={claiming || dailyPercent >= 100}
                className="bg-gradient-to-r from-amber-500 via-purple-500 to-cyan-500 text-white font-semibold px-6"
                data-testid="button-claim-binary-detail"
              >
                {claiming ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {claiming ? "Claiming..." : dailyPercent >= 100 ? "Daily Cap Reached" : "Claim Now"}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="earnings-card rounded-2xl overflow-hidden slide-in" style={{ animationDelay: '0.1s' }} data-testid="card-binary-daily-cap">
          <div className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-9 w-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
                <Clock className="h-4 w-4 text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                  <span className="gradient-text">Today's Cap Usage</span>
                </p>
                <p className="text-[10px] text-muted-foreground">Resets every 24 hours</p>
              </div>
            </div>
            <div className="flex flex-wrap items-end justify-between gap-2 mb-2">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Claimed Today</p>
                <p className="text-2xl font-bold gradient-text" style={{ fontFamily: 'var(--font-display)' }} data-testid="text-binary-today-claimed">
                  ${formatAmount(binaryInfo.todayBinaryIncome)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Daily Cap</p>
                <p className="text-base font-bold text-muted-foreground" style={{ fontFamily: 'var(--font-display)' }} data-testid="text-binary-daily-cap">
                  ${formatAmount(binaryInfo.dailyCap)}
                </p>
              </div>
            </div>
            <div className="h-2 rounded-full bg-white/[0.05] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${dailyPercent}%`,
                  background: dailyPercent >= 100 ? 'linear-gradient(90deg, #ef4444, #dc2626)' : 'linear-gradient(90deg, #f59e0b, #a855f7)'
                }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">
              {dailyPercent >= 100 ? "Daily cap reached - try again tomorrow" : `${dailyPercent}% of daily cap used`}
            </p>
          </div>
        </div>

        <div className="earnings-card rounded-2xl overflow-hidden slide-in" style={{ animationDelay: '0.15s' }} data-testid="card-binary-total">
          <div className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-9 w-9 rounded-xl bg-cyan-500/15 flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-cyan-400" />
              </div>
              <div>
                <p className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                  <span className="gradient-text">Lifetime Binary</span>
                </p>
                <p className="text-[10px] text-muted-foreground">All-time binary matching income</p>
              </div>
            </div>
            <p className="text-2xl font-bold gradient-text" style={{ fontFamily: 'var(--font-display)' }} data-testid="text-binary-total-earned">
              ${formatAmount(incomeInfo.totalBinaryIncome)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">30% of matched binary volume</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass-card rounded-2xl p-4 slide-in border border-amber-500/10" style={{ animationDelay: '0.2s' }} data-testid="card-binary-left-vol">
          <div className="flex items-center gap-2 mb-2">
            <ArrowDownLeft className="h-4 w-4 text-amber-400" />
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Left Volume</p>
          </div>
          <p className="text-lg font-bold text-amber-400" style={{ fontFamily: 'var(--font-display)' }}>
            ${formatAmount(binaryInfo.leftBusiness)}
          </p>
        </div>
        <div className="glass-card rounded-2xl p-4 slide-in border border-cyan-500/10" style={{ animationDelay: '0.25s' }} data-testid="card-binary-right-vol">
          <div className="flex items-center gap-2 mb-2">
            <ArrowDownRight className="h-4 w-4 text-cyan-400" />
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Right Volume</p>
          </div>
          <p className="text-lg font-bold text-cyan-400" style={{ fontFamily: 'var(--font-display)' }}>
            ${formatAmount(binaryInfo.rightBusiness)}
          </p>
        </div>
        <div className="glass-card rounded-2xl p-4 slide-in border border-amber-500/10" style={{ animationDelay: '0.3s' }} data-testid="card-binary-carry-left">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="h-4 w-4 text-amber-400" />
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Left Carry</p>
          </div>
          <p className="text-lg font-bold text-amber-400" style={{ fontFamily: 'var(--font-display)' }}>
            ${formatAmount(binaryInfo.carryLeft)}
          </p>
        </div>
        <div className="glass-card rounded-2xl p-4 slide-in border border-cyan-500/10" style={{ animationDelay: '0.35s' }} data-testid="card-binary-carry-right">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="h-4 w-4 text-cyan-400" />
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Right Carry</p>
          </div>
          <p className="text-lg font-bold text-cyan-400" style={{ fontFamily: 'var(--font-display)' }}>
            ${formatAmount(binaryInfo.carryRight)}
          </p>
        </div>
      </div>

      <div className="glass-card rounded-2xl p-5 slide-in border border-purple-500/10" style={{ animationDelay: '0.38s' }} data-testid="card-binary-pending-match">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-9 w-9 rounded-xl bg-purple-500/15 flex items-center justify-center">
            <GitBranch className="h-4 w-4 text-purple-400" />
          </div>
          <div>
            <p className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)' }}>
              <span className="gradient-text">Claimable Binary Income</span>
            </p>
            <p className="text-[10px] text-muted-foreground">Available to claim from carry matching</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Carry Matchable</p>
            <p className="text-2xl font-bold gradient-text" style={{ fontFamily: 'var(--font-display)' }} data-testid="text-binary-matchable">
              ${formatAmount(matchedVolume)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Potential Income (30%)</p>
            <p className="text-lg font-bold text-purple-400" style={{ fontFamily: 'var(--font-display)' }} data-testid="text-binary-potential">
              ${formatAmount(matchedVolume * BigInt(30) / BigInt(100))}
            </p>
          </div>
        </div>
      </div>

      {dayEntries.length > 0 && (
        <div className="glass-card rounded-2xl slide-in" style={{ animationDelay: '0.4s' }} data-testid="card-binary-daily-summary">
          <div className="p-5 border-b border-white/[0.06]">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-purple-500/15 flex items-center justify-center">
                <CalendarDays className="h-4 w-4 text-purple-400" />
              </div>
              <div>
                <h2 className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                  <span className="gradient-text">Daily Claim Summary</span>
                </h2>
                <p className="text-[10px] text-muted-foreground">Grouped by day</p>
              </div>
            </div>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {dayEntries.map(([day, data]) => (
              <div key={day} className="flex items-center justify-between gap-3 px-5 py-3.5" data-testid={`row-binary-day-${day}`}>
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
                    <CalendarDays className="h-3.5 w-3.5 text-purple-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{day}</p>
                    <p className="text-[11px] text-muted-foreground">{data.count} claim{data.count > 1 ? "s" : ""}</p>
                  </div>
                </div>
                <span className="text-sm font-bold gradient-text" style={{ fontFamily: 'var(--font-display)' }}>
                  +${formatAmount(data.total)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="glass-card rounded-2xl slide-in" style={{ animationDelay: '0.45s' }} data-testid="card-binary-claim-history">
        <div className="p-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-cyan-500/15 flex items-center justify-center">
              <GitBranch className="h-4 w-4 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                <span className="gradient-text">Claim History</span>
              </h2>
              <p className="text-[10px] text-muted-foreground">All binary income claim transactions</p>
            </div>
          </div>
        </div>

        <div className="divide-y divide-white/[0.04]">
          {loadingTxs ? (
            <div className="flex items-center justify-center py-12" data-testid="loader-binary-txs">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading claim history...</span>
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-12" data-testid="text-no-binary-txs">
              <GitBranch className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No binary claims yet</p>
              <p className="text-[11px] text-muted-foreground/60 mt-1">Claims will appear here after you claim binary income</p>
            </div>
          ) : (
            paginatedTxs.map((tx, index) => {
              const globalIndex = (currentPage - 1) * ITEMS_PER_PAGE + index;
              return (
                <div key={`${tx.timestamp}-${globalIndex}`} className="flex items-center gap-3 px-5 py-3.5" data-testid={`row-binary-tx-${globalIndex}`}>
                  <div className="h-8 w-8 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
                    <GitBranch className="h-3.5 w-3.5 text-purple-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">Binary Claim</p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-purple-500/10 text-purple-400 font-medium">
                        +${formatAmount(tx.amount)}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">{formatTimestamp(tx.timestamp)}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {!loadingTxs && transactions.length > ITEMS_PER_PAGE && (
          <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-white/[0.06]">
            <p className="text-[11px] text-muted-foreground">
              Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, transactions.length)} of {transactions.length}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                data-testid="button-binary-tx-prev"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                let page: number;
                if (totalPages <= 5) {
                  page = i + 1;
                } else if (currentPage <= 3) {
                  page = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  page = totalPages - 4 + i;
                } else {
                  page = currentPage - 2 + i;
                }
                return (
                  <Button
                    key={page}
                    variant={page === currentPage ? "default" : "ghost"}
                    size="icon"
                    onClick={() => setCurrentPage(page)}
                    className={page === currentPage ? "glow-button text-white" : ""}
                    data-testid={`button-binary-tx-page-${page}`}
                  >
                    <span className="text-xs">{page}</span>
                  </Button>
                );
              })}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                data-testid="button-binary-tx-next"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
