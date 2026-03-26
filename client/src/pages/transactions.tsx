import { useState, useEffect, useCallback } from "react";
import { ArrowLeftRight, Loader2, ArrowDownToLine, ArrowUpRight, RefreshCw, Package, Coins, Wallet, ChevronLeft, ChevronRight, Users, GitBranch, Layers, Trophy, Star, Zap, TrendingDown, Repeat2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ContractTx {
  type: string;
  amount: bigint;
  detail: string;
  timestamp: number;
  isIncome: boolean;
}

interface TransactionsProps {
  formatAmount: (val: bigint) => string;
  getTransactionsFromContract: (offset: number, limit: number) => Promise<{ transactions: ContractTx[]; total: number }>;
}

const ITEMS_PER_PAGE = 10;

export default function TransactionsPage({ formatAmount, getTransactionsFromContract }: TransactionsProps) {
  const [allTxs, setAllTxs] = useState<ContractTx[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [txLoading, setTxLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "income" | "activity" | "withdrawal">("all");
  const [currentPage, setCurrentPage] = useState(1);

  const loadTransactions = useCallback(async () => {
    setTxLoading(true);
    try {
      const result = await getTransactionsFromContract(0, 100);
      setAllTxs(result.transactions);
      setTotalCount(result.total);
      setCurrentPage(1);
    } catch {
      setAllTxs([]);
      setTotalCount(0);
    } finally {
      setTxLoading(false);
    }
  }, [getTransactionsFromContract]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  const getTxIcon = (type: string) => {
    switch (type) {
      case "Activation":        return Package;
      case "Sell MVT":          return TrendingDown;
      case "Withdrawal":        return ArrowDownToLine;
      case "BTC Pool Withdraw": return ArrowDownToLine;
      case "BTC Pool Credited": return Coins;
      case "Level Income":      return Users;
      case "Binary Income":     return GitBranch;
      case "Power Leg Income":  return Zap;
      case "Rebirth":           return Repeat2;
      case "Board Entry":       return Star;
      case "Board Reward":      return Trophy;
      default:                  return Coins;
    }
  };

  const getTxColor = (type: string) => {
    switch (type) {
      case "Activation":        return { text: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/10" };
      case "Sell MVT":          return { text: "text-rose-400",    bg: "bg-rose-500/10",    border: "border-rose-500/10" };
      case "Withdrawal":        return { text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/10" };
      case "BTC Pool Withdraw": return { text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/10" };
      case "BTC Pool Credited": return { text: "text-amber-300",   bg: "bg-amber-600/10",   border: "border-amber-600/10" };
      case "Level Income":      return { text: "text-yellow-300",  bg: "bg-yellow-600/10",  border: "border-yellow-600/10" };
      case "Binary Income":     return { text: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/10" };
      case "Power Leg Income":  return { text: "text-violet-400",  bg: "bg-violet-500/10",  border: "border-violet-500/10" };
      case "Rebirth":           return { text: "text-sky-400",     bg: "bg-sky-500/10",     border: "border-sky-500/10" };
      case "Board Entry":       return { text: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/10" };
      case "Board Reward":      return { text: "text-yellow-300",  bg: "bg-yellow-600/10",  border: "border-yellow-600/10" };
      default:                  return { text: "text-muted-foreground", bg: "bg-white/[0.05]", border: "border-white/[0.05]" };
    }
  };

  const formatTimestamp = (ts: number) => {
    if (ts === 0) return "";
    const date = new Date(ts * 1000);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) + " " + date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };

  const incomeTxs = allTxs.filter(tx => tx.isIncome);
  const withdrawalTxs = allTxs.filter(tx => tx.type === "Withdrawal" || tx.type === "BTC Pool Withdraw");
  const activityTxs = allTxs.filter(tx => !tx.isIncome && tx.type !== "Withdrawal" && tx.type !== "BTC Pool Withdraw");
  const displayTxs = activeTab === "all" ? allTxs : activeTab === "income" ? incomeTxs : activeTab === "withdrawal" ? withdrawalTxs : activityTxs;
  const totalPages = Math.max(1, Math.ceil(displayTxs.length / ITEMS_PER_PAGE));
  const paginatedTxs = displayTxs.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const tabs = [
    { key: "all" as const, label: "All", count: allTxs.length },
    { key: "income" as const, label: "Income", count: incomeTxs.length },
    { key: "activity" as const, label: "Activity", count: activityTxs.length },
    { key: "withdrawal" as const, label: "Withdrawal", count: withdrawalTxs.length },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-6 relative z-10">
      <div className="flex items-center justify-between slide-in">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-transactions-title" style={{ fontFamily: 'var(--font-display)' }}>
            <span className="gradient-text">Transactions</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">All your on-chain activity</p>
        </div>
        <button onClick={loadTransactions} disabled={txLoading} className="text-xs text-yellow-300 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-yellow-600/10" data-testid="button-refresh-txs">
          <RefreshCw className={`h-3.5 w-3.5 ${txLoading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      <div className="flex gap-2 slide-in" style={{ animationDelay: '0.05s' }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setCurrentPage(1); }}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all ${
              activeTab === tab.key
                ? "glow-button text-white"
                : "bg-white/[0.03] text-muted-foreground border border-white/[0.06]"
            }`}
            data-testid={`button-tab-${tab.key}`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {txLoading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-yellow-300 mb-3" />
          <p className="text-sm text-muted-foreground">Loading transactions...</p>
        </div>
      ) : displayTxs.length > 0 ? (
        <div className="glass-card rounded-2xl slide-in" style={{ animationDelay: '0.1s' }}>
          <div className="divide-y divide-white/[0.04]">
            {paginatedTxs.map((tx, index) => {
              const TxIcon = getTxIcon(tx.type);
              const colors = getTxColor(tx.type);
              const globalIndex = (currentPage - 1) * ITEMS_PER_PAGE + index;
              return (
                <div key={`${tx.timestamp}-${globalIndex}`} className="flex items-center justify-between px-5 py-3.5" data-testid={`row-tx-${globalIndex}`}>
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-xl ${colors.bg} flex items-center justify-center shrink-0`}>
                      <TxIcon className={`h-5 w-5 ${colors.text}`} />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold" data-testid={`text-tx-type-${globalIndex}`}>{tx.type}</span>
                        <Badge variant="outline" className="text-[10px] border-yellow-600/20">{tx.detail}</Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{formatTimestamp(tx.timestamp)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`font-bold text-sm ${tx.isIncome || tx.type === "Withdrawal" ? "text-emerald-400" : ""}`} style={{ fontFamily: 'var(--font-display)' }} data-testid={`text-tx-amount-${globalIndex}`}>
                      {tx.isIncome || tx.type === "Withdrawal" ? "+" : "-"}${formatAmount(tx.amount)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {displayTxs.length > ITEMS_PER_PAGE && (
            <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-white/[0.06]">
              <p className="text-[11px] text-muted-foreground">
                Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, displayTxs.length)} of {displayTxs.length}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  data-testid="button-txs-prev"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(page => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1)
                  .map((page, idx, arr) => {
                    const showEllipsis = idx > 0 && page - arr[idx - 1] > 1;
                    return (
                      <span key={page} className="flex items-center gap-1">
                        {showEllipsis && <span className="text-xs text-muted-foreground px-1">...</span>}
                        <Button
                          variant={page === currentPage ? "default" : "ghost"}
                          size="icon"
                          onClick={() => setCurrentPage(page)}
                          className={page === currentPage ? "glow-button text-white" : ""}
                          data-testid={`button-txs-page-${page}`}
                        >
                          <span className="text-xs">{page}</span>
                        </Button>
                      </span>
                    );
                  })}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  data-testid="button-txs-next"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-20 slide-in">
          <div className="h-14 w-14 mx-auto rounded-2xl bg-white/[0.03] flex items-center justify-center mb-4">
            <Wallet className="h-7 w-7 text-muted-foreground/30" />
          </div>
          <p className="text-sm font-medium text-muted-foreground" data-testid="text-no-transactions">No transactions found</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Your on-chain activity will appear here</p>
        </div>
      )}
    </div>
  );
}
