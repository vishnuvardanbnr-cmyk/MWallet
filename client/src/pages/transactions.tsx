import { useState, useEffect, useCallback } from "react";
import { Loader2, ArrowDownToLine, RefreshCw, Package, Coins, Wallet, ChevronLeft, ChevronRight, Users, GitBranch, Trophy, Star, TrendingDown, Repeat2, Ban, Lock, Unlock, ChevronDown, ChevronUp, Info, Zap, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ethers } from "ethers";

interface ContractTx {
  type: string;
  amount: bigint;
  detail: string;
  timestamp: number;
  isIncome: boolean;
  currency: "USDT" | "MVT";
  mvtMinted?: bigint;
  mvtReturned?: bigint;
}

interface TransactionsProps {
  formatAmount: (val: bigint) => string;
  getTransactionsFromContract: (offset: number, limit: number) => Promise<{ transactions: ContractTx[]; total: number }>;
}

const ITEMS_PER_PAGE = 10;

function normalizeTxType(type: string): string {
  if (type === "Staking Level") return "Staking Level Income";
  return type;
}

const TX_META: Record<string, { icon: any; color: string; bg: string; border: string; label: string; tag?: string }> = {
  "Activation":            { icon: Package,       color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/20",   label: "Activation",             tag: "activity" },
  "Reactivation":          { icon: Package,       color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/20",   label: "Reactivation",           tag: "activity" },
  "Sell MVT":              { icon: TrendingDown,  color: "text-rose-400",    bg: "bg-rose-500/10",    border: "border-rose-500/20",    label: "Sell MVT",               tag: "activity" },
  "Withdrawal":            { icon: ArrowDownToLine,color:"text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", label: "USDT Withdrawal",        tag: "withdrawal" },
  "BTC Pool Withdraw":     { icon: ArrowDownToLine,color:"text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", label: "USDT Pool Withdrawal",   tag: "withdrawal" },
  "BTC Pool Credited":     { icon: Coins,         color: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/20",  label: "USDT Pool Credited",     tag: "income" },
  "Level Income":          { icon: Users,         color: "text-yellow-300",  bg: "bg-yellow-600/10",  border: "border-yellow-600/20",  label: "Level Income",           tag: "income" },
  "Staking Level Income":  { icon: ShieldCheck,   color: "text-sky-300",     bg: "bg-sky-500/10",     border: "border-sky-500/20",     label: "Staking Level Income",   tag: "income" },
  "Level Income Missed":   { icon: Ban,           color: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/20",  label: "Level Income Missed",    tag: "activity" },
  "Placement Income":      { icon: GitBranch,     color: "text-cyan-400",    bg: "bg-cyan-500/10",    border: "border-cyan-500/20",    label: "Placement Income",       tag: "income" },
  "Placement Missed":      { icon: Ban,           color: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/20",  label: "Placement Missed",       tag: "activity" },
  "Rank Income":           { icon: Star,          color: "text-amber-300",   bg: "bg-amber-300/10",   border: "border-amber-300/20",   label: "Rank Income",            tag: "income" },
  "Board Reward":          { icon: Trophy,        color: "text-yellow-300",  bg: "bg-yellow-600/10",  border: "border-yellow-600/20",  label: "Board Reward",           tag: "income" },
  "Board Entry":           { icon: Star,          color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/20",   label: "Board Entry",            tag: "activity" },
  "Rebirth":               { icon: Repeat2,       color: "text-sky-400",     bg: "bg-sky-500/10",     border: "border-sky-500/20",     label: "Rebirth",                tag: "activity" },
  "Rebirth Claim":         { icon: Repeat2,       color: "text-violet-400",  bg: "bg-violet-500/10",  border: "border-violet-500/20",  label: "Rebirth Claim",          tag: "income" },
  "Staked":                { icon: Lock,          color: "text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-500/20",    label: "Staked",                 tag: "activity" },
  "Unstaked":              { icon: Unlock,        color: "text-purple-400",  bg: "bg-purple-500/10",  border: "border-purple-500/20",  label: "Unstaked",               tag: "activity" },
};

const DEFAULT_META = { icon: Coins, color: "text-muted-foreground", bg: "bg-white/[0.04]", border: "border-white/[0.06]", label: "", tag: "activity" };

function getMeta(type: string) {
  return TX_META[type] ?? { ...DEFAULT_META, label: type };
}

export default function TransactionsPage({ formatAmount, getTransactionsFromContract }: TransactionsProps) {
  const [allTxs, setAllTxs] = useState<ContractTx[]>([]);
  const [txLoading, setTxLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "income" | "activity" | "withdrawal">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const loadTransactions = useCallback(async () => {
    setTxLoading(true);
    try {
      const result = await getTransactionsFromContract(0, 200);
      const normalized = result.transactions.map(tx => ({ ...tx, type: normalizeTxType(tx.type) }));
      setAllTxs(normalized);
      setCurrentPage(1);
    } catch {
      setAllTxs([]);
    } finally {
      setTxLoading(false);
    }
  }, [getTransactionsFromContract]);

  useEffect(() => { loadTransactions(); }, [loadTransactions]);

  const fmt2 = (val: bigint) => parseFloat(ethers.formatUnits(val, 18)).toFixed(2);

  const formatAmt = (amount: bigint, currency: "USDT" | "MVT") => {
    const raw = parseFloat(ethers.formatUnits(amount, 18));
    return currency === "USDT"
      ? { prefix: "$", value: raw.toFixed(2), suffix: "" }
      : { prefix: "", value: raw.toFixed(2), suffix: " MVT" };
  };

  const formatTimestamp = (ts: number) => {
    if (!ts) return "";
    const d = new Date(ts * 1000);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
      + " · "
      + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  };

  const incomeTxs     = allTxs.filter(tx => tx.isIncome);
  const withdrawalTxs = allTxs.filter(tx => tx.type === "USDT Withdrawal" || tx.type === "BTC Pool Withdrawal" || tx.type === "Withdrawal" || tx.type === "BTC Pool Withdraw");
  const activityTxs   = allTxs.filter(tx => !tx.isIncome && tx.type !== "USDT Withdrawal" && tx.type !== "BTC Pool Withdrawal" && tx.type !== "Withdrawal" && tx.type !== "BTC Pool Withdraw");
  const displayTxs    = activeTab === "all" ? allTxs : activeTab === "income" ? incomeTxs : activeTab === "withdrawal" ? withdrawalTxs : activityTxs;
  const totalPages    = Math.max(1, Math.ceil(displayTxs.length / ITEMS_PER_PAGE));
  const paginatedTxs  = displayTxs.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const tabs = [
    { key: "all" as const,        label: "All",         count: allTxs.length },
    { key: "income" as const,     label: "Income",      count: incomeTxs.length },
    { key: "activity" as const,   label: "Activity",    count: activityTxs.length },
    { key: "withdrawal" as const, label: "Withdrawals", count: withdrawalTxs.length },
  ];

  const isMissed    = (type: string) => type === "Level Income Missed" || type === "Placement Missed";
  const canExpand   = (type: string) => type === "Sell MVT" || type === "Staked" || type === "Unstaked";

  return (
    <div className="p-4 sm:p-6 space-y-5 relative z-10">

      {/* Header */}
      <div className="flex items-center justify-between slide-in">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-transactions-title" style={{ fontFamily: "var(--font-display)" }}>
            <span className="gradient-text">Transactions</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Your complete on-chain history</p>
        </div>
        <button
          onClick={loadTransactions}
          disabled={txLoading}
          className="flex items-center gap-1.5 text-xs text-yellow-300 px-3 py-2 rounded-xl bg-yellow-600/10 border border-yellow-600/20 hover:bg-yellow-600/15 transition-colors"
          data-testid="button-refresh-txs"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${txLoading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap slide-in" style={{ animationDelay: "0.05s" }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setCurrentPage(1); setExpandedIdx(null); }}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all ${
              activeTab === tab.key
                ? "glow-button text-white"
                : "bg-white/[0.03] text-muted-foreground border border-white/[0.06] hover:bg-white/[0.06]"
            }`}
            data-testid={`button-tab-${tab.key}`}
          >
            {tab.label}
            <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${activeTab === tab.key ? "bg-white/20" : "bg-white/[0.06]"}`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Content */}
      {txLoading ? (
        <div className="flex flex-col items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-yellow-300 mb-3" />
          <p className="text-sm text-muted-foreground">Loading transactions…</p>
        </div>
      ) : displayTxs.length === 0 ? (
        <div className="text-center py-24 slide-in">
          <div className="h-14 w-14 mx-auto rounded-2xl bg-white/[0.03] flex items-center justify-center mb-4">
            <Wallet className="h-7 w-7 text-muted-foreground/30" />
          </div>
          <p className="text-sm font-medium text-muted-foreground" data-testid="text-no-transactions">No transactions found</p>
          <p className="text-xs text-muted-foreground/50 mt-1">Your on-chain activity will appear here</p>
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden slide-in" style={{ animationDelay: "0.1s" }}>

          {/* Column header */}
          <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[2fr_1fr_1fr] gap-3 px-5 py-2.5 border-b border-white/[0.06] bg-white/[0.02]">
            <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">Transaction</p>
            <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider hidden sm:block">Date</p>
            <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider text-right">Amount</p>
          </div>

          <div className="divide-y divide-white/[0.04]">
            {paginatedTxs.map((tx, index) => {
              const meta       = getMeta(tx.type);
              const TxIcon     = meta.icon;
              const globalIdx  = (currentPage - 1) * ITEMS_PER_PAGE + index;
              const isExpanded = expandedIdx === globalIdx;
              const expandable = canExpand(tx.type);
              const missed     = isMissed(tx.type);
              const { prefix, value, suffix } = formatAmt(tx.amount, tx.currency ?? "USDT");
              const sign  = tx.isIncome || tx.type === "USDT Withdrawal" || tx.type === "Withdrawal" || tx.type === "BTC Pool Withdraw" || tx.type === "BTC Pool Withdrawal" ? "+" : tx.type === "Staked" ? "" : "-";
              const amountColor = missed
                ? "text-orange-400/60 line-through"
                : tx.isIncome
                ? "text-emerald-400"
                : tx.type === "Staked"
                ? "text-blue-400"
                : tx.type === "Unstaked"
                ? "text-purple-400"
                : tx.type === "USDT Withdrawal" || tx.type === "Withdrawal" || tx.type === "BTC Pool Withdraw" || tx.type === "BTC Pool Withdrawal"
                ? "text-emerald-400"
                : "text-muted-foreground";

              return (
                <div key={`${tx.timestamp}-${globalIdx}`} data-testid={`row-tx-${globalIdx}`}>
                  <div
                    className={`grid grid-cols-[1fr_auto] sm:grid-cols-[2fr_1fr_1fr] gap-3 items-center px-5 py-4 ${expandable ? "cursor-pointer hover:bg-white/[0.02] transition-colors" : ""}`}
                    onClick={() => expandable && setExpandedIdx(isExpanded ? null : globalIdx)}
                  >
                    {/* Left: icon + label */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`h-9 w-9 rounded-xl ${meta.bg} border ${meta.border} flex items-center justify-center shrink-0`}>
                        <TxIcon className={`h-4 w-4 ${meta.color}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-semibold leading-tight" data-testid={`text-tx-type-${globalIdx}`}>
                            {meta.label || tx.type}
                          </span>
                          {tx.detail && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-md border font-medium ${meta.border} ${meta.bg} ${meta.color}`}>
                              {tx.detail}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground/60 mt-0.5 sm:hidden">{formatTimestamp(tx.timestamp)}</p>
                        {missed && (
                          <p className="text-[10px] text-orange-400/60 mt-0.5">Missed — routed to admin pool</p>
                        )}
                        {expandable && (
                          <p className="text-[10px] text-muted-foreground/40 mt-0.5">Tap for breakdown</p>
                        )}
                      </div>
                    </div>

                    {/* Date — desktop only */}
                    <div className="hidden sm:block">
                      <p className="text-[11px] text-muted-foreground/60">{formatTimestamp(tx.timestamp)}</p>
                    </div>

                    {/* Amount */}
                    <div className="flex items-center justify-end gap-1.5">
                      <span
                        className={`font-bold text-sm tabular-nums ${amountColor}`}
                        style={{ fontFamily: "var(--font-display)" }}
                        data-testid={`text-tx-amount-${globalIdx}`}
                      >
                        {sign}{prefix}{value}{suffix}
                      </span>
                      {expandable && (
                        isExpanded
                          ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                          : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                      )}
                    </div>
                  </div>

                  {/* Expanded breakdown */}
                  {isExpanded && (
                    <div className="px-5 pb-4 bg-white/[0.01]">
                      <div className="rounded-xl border border-white/[0.06] p-3.5 space-y-3">
                        <div className="flex items-center gap-1.5">
                          <Info className="h-3 w-3 text-muted-foreground/50" />
                          <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">Breakdown</p>
                        </div>

                        {tx.type === "Sell MVT" && (
                          <div className="grid grid-cols-3 gap-2 text-[11px]">
                            <div className="bg-white/[0.03] rounded-lg p-2.5">
                              <p className="text-muted-foreground/60 mb-1">Gross USDT</p>
                              <p className="font-semibold text-white">${(parseFloat(fmt2(tx.amount)) / 0.9).toFixed(2)}</p>
                            </div>
                            <div className="bg-white/[0.03] rounded-lg p-2.5">
                              <p className="text-muted-foreground/60 mb-1">Net USDT (90%)</p>
                              <p className="font-semibold text-emerald-400">${fmt2(tx.amount)}</p>
                            </div>
                            <div className="bg-white/[0.03] rounded-lg p-2.5">
                              <p className="text-muted-foreground/60 mb-1">USDT Pool (10%)</p>
                              <p className="font-semibold text-orange-400">~${(parseFloat(fmt2(tx.amount)) / 9).toFixed(2)}</p>
                            </div>
                          </div>
                        )}

                        {tx.type === "Staked" && (
                          <div className="grid grid-cols-2 gap-2 text-[11px]">
                            <div className="bg-white/[0.03] rounded-lg p-2.5">
                              <p className="text-muted-foreground/60 mb-1">USDT Staked</p>
                              <p className="font-semibold text-blue-400">${fmt2(tx.amount)}</p>
                            </div>
                            {tx.mvtMinted && tx.mvtMinted > 0n && (
                              <div className="bg-white/[0.03] rounded-lg p-2.5">
                                <p className="text-muted-foreground/60 mb-1">MVT Received</p>
                                <p className="font-semibold text-amber-400">{fmt2(tx.mvtMinted)} MVT</p>
                              </div>
                            )}
                            <div className="bg-white/[0.03] rounded-lg p-2.5 col-span-2 text-[10px] text-muted-foreground/60">
                              {tx.detail.includes("Locked")
                                ? "Locked stake — no earning cap, 10-month lock period"
                                : "Flexible stake — 2× earning cap, unstake anytime"}
                            </div>
                          </div>
                        )}

                        {tx.type === "Unstaked" && (
                          <div className="grid grid-cols-2 gap-2 text-[11px]">
                            <div className="bg-white/[0.03] rounded-lg p-2.5">
                              <p className="text-muted-foreground/60 mb-1">USDT Returned</p>
                              <p className="font-semibold text-purple-400">${fmt2(tx.amount)}</p>
                            </div>
                            {tx.mvtReturned && tx.mvtReturned > 0n && (
                              <div className="bg-white/[0.03] rounded-lg p-2.5">
                                <p className="text-muted-foreground/60 mb-1">MVT Burned</p>
                                <p className="font-semibold text-rose-400">{fmt2(tx.mvtReturned)} MVT</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {displayTxs.length > ITEMS_PER_PAGE && (
            <div className="flex items-center justify-between gap-2 px-5 py-3.5 border-t border-white/[0.06] bg-white/[0.02]">
              <p className="text-[11px] text-muted-foreground/60">
                {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, displayTxs.length)} of {displayTxs.length}
              </p>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} data-testid="button-txs-prev">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(page => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1)
                  .map((page, idx, arr) => {
                    const showEllipsis = idx > 0 && page - arr[idx - 1] > 1;
                    return (
                      <span key={page} className="flex items-center gap-1">
                        {showEllipsis && <span className="text-xs text-muted-foreground/40 px-1">…</span>}
                        <Button
                          variant={page === currentPage ? "default" : "ghost"}
                          size="icon"
                          className={`h-7 w-7 text-xs ${page === currentPage ? "glow-button text-white" : ""}`}
                          onClick={() => setCurrentPage(page)}
                          data-testid={`button-txs-page-${page}`}
                        >
                          {page}
                        </Button>
                      </span>
                    );
                  })}
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} data-testid="button-txs-next">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
