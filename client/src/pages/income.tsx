import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Users, GitBranch, Layers, RefreshCw, ArrowUpRight, Loader2, ChevronLeft, ChevronRight, ExternalLink, AlertTriangle, ArrowDownLeft, ArrowDownRight, BarChart3, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { IncomeInfo, BinaryInfo, SlabInfo } from "@/hooks/use-web3";
import { PACKAGE_NAMES, PACKAGE_PRICES_USD } from "@/lib/contract";

interface ContractTx {
  type: string;
  amount: bigint;
  detail: string;
  timestamp: number;
  isIncome: boolean;
}

interface IncomeProps {
  incomeInfo: IncomeInfo;
  binaryInfo: BinaryInfo;
  slabInfo: SlabInfo | null;
  userPackage: number;
  formatAmount: (val: bigint) => string;
  getTransactionsFromContract: (offset: number, limit: number) => Promise<{ transactions: ContractTx[]; total: number }>;
  claimBinaryIncome: () => Promise<void>;
}

const typeConfig: Record<string, { color: string; bg: string; border: string; icon: typeof Users }> = {
  "Direct Sponsor": { color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/10", icon: Users },
  "Binary Matching": { color: "text-yellow-300", bg: "bg-yellow-600/10", border: "border-yellow-600/10", icon: GitBranch },
  "Matching on Binary": { color: "text-amber-300", bg: "bg-amber-600/10", border: "border-amber-600/10", icon: Layers },
  "Withdrawal Match": { color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/10", icon: RefreshCw },
};

const ITEMS_PER_PAGE = 10;

const WITHDRAWAL_MATCH_DESC: Record<number, string> = {
  0: "Activate a package to unlock",
  1: "0.1% per level, up to 3 levels",
  2: "0.1% per level, up to 5 levels",
  3: "0.1% per level, up to 9 levels",
  4: "0.1% per level, up to 12 levels",
  5: "1% per level, up to 15 levels",
};

// 5× package price = maxIncomeLimit from contract
const PACKAGE_MAX_INCOME = [0, 250, 1000, 3000, 6000, 12000, 24000];

const BINARY_MATCH_DESC: Record<number, string> = {
  0: "Activate a package to unlock",
  1: "30% matching, $200 daily cap",
  2: "30% matching, $600 daily cap",
  3: "30% matching, $1,200 daily cap",
  4: "30% matching, $2,400 daily cap",
  5: "30% matching, $4,800 daily cap",
};

const MATCHING_OVERRIDE_DESC: Record<number, string> = {
  0: "Activate a package to unlock",
  1: "1% per level, up to 3 levels",
  2: "1% per level, up to 6 levels",
  3: "1% per level, up to 10 levels",
  4: "1% per level, up to 15 levels",
  5: "1% per level, up to 20 levels",
};

const DIRECT_SPONSOR_DESC: Record<number, string> = {
  0: "Activate a package to unlock",
  1: "10% from direct referrals",
  2: "15% from direct referrals",
  3: "20% from direct referrals",
  4: "25% from direct referrals",
  5: "30% from direct referrals",
};

export default function Income({ incomeInfo, binaryInfo, slabInfo, userPackage, formatAmount, getTransactionsFromContract, claimBinaryIncome }: IncomeProps) {
  const [, navigate] = useLocation();
  const [allTransactions, setAllTransactions] = useState<ContractTx[]>([]);
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

  const totalEarned = parseFloat(formatAmount(incomeInfo.totalEarnings).replace(/,/g, ''));

  const pkg = userPackage;
  const incomeTypes = [
    { title: "Direct Sponsor", amount: incomeInfo.totalDirectIncome, icon: Users, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/10", gradient: "#f59e0b", description: DIRECT_SPONSOR_DESC[pkg] || "10-30% from direct referrals" },
    { title: "Binary Matching", amount: incomeInfo.totalBinaryIncome + binaryInfo.claimableBinaryIncome, icon: GitBranch, color: "text-yellow-300", bg: "bg-yellow-600/10", border: "border-yellow-600/10", gradient: "#d4af37", description: BINARY_MATCH_DESC[pkg] || "30% of matching volume" },
    { title: "Matching on Binary", amount: incomeInfo.totalMatchingOverrideIncome, icon: Layers, color: "text-amber-300", bg: "bg-amber-600/10", border: "border-amber-600/10", gradient: "#c9a227", description: MATCHING_OVERRIDE_DESC[pkg] || "1% per level from downline binary income" },
    { title: "Withdrawal Match", amount: incomeInfo.totalWithdrawalMatchIncome, icon: RefreshCw, color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/10", gradient: "#10b981", description: WITHDRAWAL_MATCH_DESC[pkg] || "0.1% per level from downline withdrawals" },
  ];

  const getPercentage = (amount: bigint) => {
    if (totalEarned === 0) return 0;
    return Math.round((parseFloat(formatAmount(amount).replace(/,/g, '')) / totalEarned) * 100);
  };

  const formatTimestamp = (ts: number) => {
    if (ts === 0) return "";
    const date = new Date(ts * 1000);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + " " + date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };

  useEffect(() => {
    setLoadingTxs(true);
    getTransactionsFromContract(0, 100).then(result => {
      setAllTransactions(result.transactions);
      const incomeTxs = result.transactions.filter(tx => tx.isIncome);
      setTransactions(incomeTxs);
      setLoadingTxs(false);
    }).catch(() => setLoadingTxs(false));
  }, [getTransactionsFromContract]);

  const totalPages = Math.max(1, Math.ceil(transactions.length / ITEMS_PER_PAGE));
  const paginatedTxs = transactions.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  return (
    <div className="p-4 sm:p-6 space-y-6 relative z-10">
      <div className="slide-in">
        <h1 className="text-2xl font-bold" data-testid="text-income-title" style={{ fontFamily: 'var(--font-display)' }}>
          <span className="gradient-text">Income</span>
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">All your income streams in one place</p>
      </div>

      <div className="glass-card rounded-2xl slide-in" style={{ animationDelay: '0.05s' }} data-testid="card-flushout-history">
        <div className="p-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-red-500/15 flex items-center justify-center">
              <AlertTriangle className="h-4 w-4 text-red-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                <span className="gradient-text">Flushout History</span>
              </h2>
              <p className="text-[10px] text-muted-foreground">Records of when max income was reached and incomes were flushed</p>
            </div>
          </div>
        </div>
        {loadingTxs ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (() => {
          const reactivationTxs = allTransactions.filter(tx => tx.type === "Reactivation");
          if (reactivationTxs.length === 0) {
            return (
              <div className="text-center py-10">
                <div className="h-12 w-12 mx-auto rounded-xl bg-white/[0.03] flex items-center justify-center mb-3">
                  <AlertTriangle className="h-6 w-6 text-muted-foreground/30" />
                </div>
                <p className="text-sm text-muted-foreground" data-testid="text-no-flushouts">No flushouts yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Your incomes have not been flushed out</p>
              </div>
            );
          }
          return (
            <div className="divide-y divide-white/[0.04]">
              {reactivationTxs.map((tx, idx) => {
                const pkgIdx = PACKAGE_NAMES.indexOf(tx.detail);
                const flushedIncome = pkgIdx > 0 ? PACKAGE_MAX_INCOME[pkgIdx] : 0;
                const reactivationFee = parseFloat(formatAmount(tx.amount));
                return (
                  <div key={`flush-${tx.timestamp}-${idx}`} className="flex items-start justify-between px-5 py-3.5" data-testid={`row-flushout-${idx}`}>
                    <div className="flex items-start gap-3">
                      <div className="h-9 w-9 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0 mt-0.5">
                        <AlertTriangle className="h-4 w-4 text-red-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">Flushed & Reactivated</span>
                          <Badge variant="outline" className="text-[10px] border-red-500/20 text-red-400">
                            {tx.detail}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {formatTimestamp(tx.timestamp)}
                        </p>
                        <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                          Paid to reactivate: ${reactivationFee.toFixed(2)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-sm text-red-400" style={{ fontFamily: 'var(--font-display)' }}>
                        {flushedIncome > 0 ? `-$${flushedIncome.toLocaleString()}` : `-$${reactivationFee.toFixed(2)}`}
                      </p>
                      <p className="text-[10px] text-muted-foreground">Income flushed</p>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {binaryInfo.claimableBinaryIncome > BigInt(0) && (
        <div className="earnings-card rounded-2xl overflow-hidden slide-in" style={{ animationDelay: '0.12s' }} data-testid="card-claim-binary">
          <div className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-yellow-600/15 flex items-center justify-center">
                  <GitBranch className="h-4 w-4 text-yellow-300" />
                </div>
                <div>
                  <p className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                    <span className="gradient-text">Claimable Binary Income</span>
                  </p>
                  <p className="text-2xl font-bold gradient-text mt-0.5" style={{ fontFamily: 'var(--font-display)' }} data-testid="text-claimable-binary">
                    ${formatAmount(binaryInfo.claimableBinaryIncome)}
                  </p>
                </div>
              </div>
              <Button
                onClick={handleClaim}
                disabled={claiming}
                className="bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-400 text-white font-semibold px-6"
                data-testid="button-claim-binary"
              >
                {claiming ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {claiming ? "Claiming..." : "Claim Now"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {incomeTypes.map((item, idx) => {
          const pct = getPercentage(item.amount);
          return (
            <div key={item.title} className={`glass-card rounded-2xl p-5 slide-in border ${item.border}`} style={{ animationDelay: `${0.15 + idx * 0.05}s` }} data-testid={`card-${item.title.toLowerCase().replace(/\s/g, '-')}-income`}>
              <div className="mb-3">
                <div className={`h-10 w-10 rounded-xl ${item.bg} flex items-center justify-center`}>
                  <item.icon className={`h-5 w-5 ${item.color}`} />
                </div>
              </div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-0.5">{item.title}</p>
              <p className="text-2xl font-bold gradient-text mb-1" style={{ fontFamily: 'var(--font-display)' }} data-testid={`text-${item.title.toLowerCase().replace(/\s/g, '-')}-amount`}>
                ${formatAmount(item.amount)}
              </p>
              <p className="text-[11px] text-muted-foreground mb-3">{item.description}</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${Math.max(pct, 2)}%`,
                      background: `linear-gradient(90deg, ${item.gradient}, ${item.gradient}80)`
                    }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground font-medium shrink-0">{pct}%</span>
              </div>
              {item.title === "Binary Matching" && (
                <button
                  onClick={() => navigate("/binary")}
                  className="flex items-center gap-1 mt-3 text-[11px] font-medium text-yellow-300 transition-colors"
                  data-testid="link-binary-details"
                >
                  View Details <ExternalLink className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 slide-in" style={{ animationDelay: '0.35s' }}>
        <div className="glass-card rounded-2xl p-4 border border-amber-500/10" data-testid="card-left-volume">
          <div className="flex items-center gap-2 mb-2">
            <ArrowDownLeft className="h-4 w-4 text-amber-400" />
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Left Volume</p>
          </div>
          <p className="text-lg font-bold text-amber-400" style={{ fontFamily: 'var(--font-display)' }} data-testid="text-left-volume">
            ${formatAmount(binaryInfo.leftBusiness)}
          </p>
        </div>
        <div className="glass-card rounded-2xl p-4 border border-amber-600/10" data-testid="card-right-volume">
          <div className="flex items-center gap-2 mb-2">
            <ArrowDownRight className="h-4 w-4 text-amber-300" />
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Right Volume</p>
          </div>
          <p className="text-lg font-bold text-amber-300" style={{ fontFamily: 'var(--font-display)' }} data-testid="text-right-volume">
            ${formatAmount(binaryInfo.rightBusiness)}
          </p>
        </div>
        <div className="glass-card rounded-2xl p-4 border border-amber-500/10" data-testid="card-left-carry">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="h-4 w-4 text-amber-400" />
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Left Carry</p>
          </div>
          <p className="text-lg font-bold text-amber-400" style={{ fontFamily: 'var(--font-display)' }} data-testid="text-left-carry">
            ${formatAmount(binaryInfo.carryLeft)}
          </p>
        </div>
        <div className="glass-card rounded-2xl p-4 border border-amber-600/10" data-testid="card-right-carry">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="h-4 w-4 text-amber-300" />
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Right Carry</p>
          </div>
          <p className="text-lg font-bold text-amber-300" style={{ fontFamily: 'var(--font-display)' }} data-testid="text-right-carry">
            ${formatAmount(binaryInfo.carryRight)}
          </p>
        </div>
      </div>

      <div className="glass-card rounded-2xl slide-in" style={{ animationDelay: '0.38s' }} data-testid="card-slab-commission">
        <div className="p-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-amber-600/15 flex items-center justify-center">
              <Layers className="h-4 w-4 text-amber-300" />
            </div>
            <div>
              <h2 className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                <span className="gradient-text">Slab-Based Binary Commission</span>
              </h2>
              <p className="text-[10px] text-muted-foreground">Per-slab carry volumes, matchable amounts & potential income from contract</p>
            </div>
          </div>
        </div>
        <div className="p-5 space-y-3">
          {[
            { levels: "Lv 1-3", slabIdx: 0, color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", gradient: "#10b981" },
            { levels: "Lv 4-6", slabIdx: 1, color: "text-yellow-300", bg: "bg-yellow-600/10", border: "border-yellow-600/20", gradient: "#d4af37" },
            { levels: "Lv 7-9", slabIdx: 2, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20", gradient: "#f59e0b" },
            { levels: "Lv 10-20", slabIdx: 3, color: "text-amber-300", bg: "bg-amber-600/10", border: "border-amber-600/20", gradient: "#c9a227" },
          ].map((slab) => {
            const rate = slabInfo ? Number(slabInfo.rates[slab.slabIdx]) / 100 : [30, 20, 10, 5][slab.slabIdx];
            const carryL = slabInfo ? slabInfo.carryLeftSlabs[slab.slabIdx] : 0n;
            const carryR = slabInfo ? slabInfo.carryRightSlabs[slab.slabIdx] : 0n;
            const matchable = slabInfo ? slabInfo.matchableSlabs[slab.slabIdx] : 0n;
            const potentialIncome = slabInfo ? slabInfo.potentialIncomeSlabs[slab.slabIdx] : 0n;

            return (
              <div key={slab.slabIdx} className={`rounded-xl ${slab.bg} border ${slab.border} overflow-hidden`} data-testid={`row-slab-${slab.slabIdx}`}>
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.04]">
                  <div className="flex items-center gap-2">
                    <p className={`text-xs font-bold ${slab.color}`}>{slab.levels}</p>
                    <Badge variant="outline" className={`text-[10px] ${slab.border} ${slab.color} px-1.5 py-0`}>
                      {rate}%
                    </Badge>
                  </div>
                  <p className={`text-sm font-bold ${slab.color}`} style={{ fontFamily: 'var(--font-display)' }} data-testid={`text-slab-income-${slab.slabIdx}`}>
                    ${formatAmount(potentialIncome)}
                  </p>
                </div>
                <div className="grid grid-cols-3 divide-x divide-white/[0.04]">
                  <div className="px-3 py-2 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Left Carry</p>
                    <p className="text-xs font-semibold text-amber-400" style={{ fontFamily: 'var(--font-display)' }} data-testid={`text-slab-left-${slab.slabIdx}`}>
                      ${formatAmount(carryL)}
                    </p>
                  </div>
                  <div className="px-3 py-2 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Right Carry</p>
                    <p className="text-xs font-semibold text-amber-300" style={{ fontFamily: 'var(--font-display)' }} data-testid={`text-slab-right-${slab.slabIdx}`}>
                      ${formatAmount(carryR)}
                    </p>
                  </div>
                  <div className="px-3 py-2 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Matchable</p>
                    <p className="text-xs font-semibold text-foreground" style={{ fontFamily: 'var(--font-display)' }} data-testid={`text-slab-matchable-${slab.slabIdx}`}>
                      ${formatAmount(matchable)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
          <div className="flex items-start gap-2 mt-4 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="text-[11px] text-muted-foreground leading-relaxed">
              <p>Binary income is matched per slab. Each slab matches the minimum of left and right carry volumes at its respective rate (<span className="text-foreground font-medium">30%, 20%, 10%, 5%</span>). Business volume from your downline is distributed across slabs based on depth. Data shown is live from the smart contract.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card rounded-2xl slide-in" style={{ animationDelay: '0.4s' }} data-testid="card-income-transactions">
        <div className="p-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-amber-600/15 flex items-center justify-center">
              <ArrowUpRight className="h-4 w-4 text-amber-300" />
            </div>
            <div>
              <h2 className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                <span className="gradient-text">Income Transactions</span>
              </h2>
              <p className="text-[10px] text-muted-foreground">Recent income events from contract</p>
            </div>
          </div>
        </div>

        <div className="divide-y divide-white/[0.04]">
          {loadingTxs ? (
            <div className="flex items-center justify-center py-12" data-testid="loader-income-txs">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading transactions...</span>
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-12" data-testid="text-no-income-txs">
              <ArrowUpRight className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No income transactions yet</p>
              <p className="text-[11px] text-muted-foreground/60 mt-1">Earnings will appear here as they are distributed</p>
            </div>
          ) : (
            paginatedTxs.map((tx, index) => {
              const cfg = typeConfig[tx.type] || { color: "text-muted-foreground", bg: "bg-muted/10", border: "border-muted/10", icon: ArrowUpRight };
              const Icon = cfg.icon;
              const globalIndex = (currentPage - 1) * ITEMS_PER_PAGE + index;
              return (
                <div key={`${tx.timestamp}-${globalIndex}`} className="flex items-center gap-3 px-5 py-3.5" data-testid={`row-income-tx-${globalIndex}`}>
                  <div className={`h-8 w-8 rounded-lg ${cfg.bg} flex items-center justify-center shrink-0`}>
                    <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{tx.type}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${cfg.bg} ${cfg.color} font-medium`}>
                        +${formatAmount(tx.amount)}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">{tx.detail} {formatTimestamp(tx.timestamp)}</p>
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
                data-testid="button-income-tx-prev"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <Button
                  key={page}
                  variant={page === currentPage ? "default" : "ghost"}
                  size="icon"
                  onClick={() => setCurrentPage(page)}
                  className={page === currentPage ? "glow-button text-white" : ""}
                  data-testid={`button-income-tx-page-${page}`}
                >
                  <span className="text-xs">{page}</span>
                </Button>
              ))}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                data-testid="button-income-tx-next"
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
