import { useState, useEffect, useCallback } from "react";
import { Wallet as WalletIcon, ArrowDownToLine, Coins, Loader2, ArrowUpRight, Package, RefreshCw, Info, ChevronLeft, ChevronRight, Star, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import type { UserInfo } from "@/hooks/use-web3";

interface ContractTx {
  type: string;
  amount: bigint;
  detail: string;
  timestamp: number;
  isIncome: boolean;
}

interface WalletProps {
  userInfo: UserInfo;
  formatAmount: (val: bigint) => string;
  withdrawFunds: (amount: string) => Promise<void>;
  getTransactionsFromContract: (offset: number, limit: number) => Promise<{ transactions: ContractTx[]; total: number }>;
}

const ITEMS_PER_PAGE = 10;

export default function WalletPage({ userInfo, formatAmount, withdrawFunds, getTransactionsFromContract }: WalletProps) {
  const { toast } = useToast();
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [showWithdrawDialog, setShowWithdrawDialog] = useState(false);
  const [recentTxs, setRecentTxs] = useState<ContractTx[]>([]);
  const [txLoading, setTxLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  const loadTransactions = useCallback(async () => {
    setTxLoading(true);
    try {
      const result = await getTransactionsFromContract(0, 50);
      const activityTxs = result.transactions.filter(tx =>
        ["Activation", "Upgrade", "Reactivation", "Withdrawal"].includes(tx.type)
      );
      setRecentTxs(activityTxs);
      setCurrentPage(1);
    } catch {
      setRecentTxs([]);
    } finally {
      setTxLoading(false);
    }
  }, [getTransactionsFromContract]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  const handleWithdraw = async () => {
    if (!withdrawAmount || parseFloat(withdrawAmount) <= 0) {
      toast({ title: "Invalid amount", description: "Please enter a valid withdrawal amount.", variant: "destructive" });
      return;
    }
    setWithdrawing(true);
    try {
      await withdrawFunds(withdrawAmount);
      toast({ title: "Withdrawal successful", description: `Successfully withdrew $${withdrawAmount}` });
      setWithdrawAmount("");
      setShowWithdrawDialog(false);
      loadTransactions();
    } catch (err: any) {
      toast({ title: "Withdrawal failed", description: err?.message || "Transaction failed", variant: "destructive" });
    } finally {
      setWithdrawing(false);
    }
  };

  const setMaxAmount = () => {
    const raw = parseFloat(formatAmount(userInfo.walletBalance).replace(/,/g, ''));
    const rounded = Math.floor(raw / 10) * 10;
    if (rounded >= 10) {
      setWithdrawAmount(String(rounded));
    } else {
      setWithdrawAmount("");
      toast({ title: "Insufficient balance", description: "Your balance is less than the $10 minimum withdrawal.", variant: "destructive" });
    }
  };

  const getTxIcon = (type: string) => {
    switch (type) {
      case "Activation": return Package;
      case "Upgrade": return ArrowUpRight;
      case "Reactivation": return RefreshCw;
      case "Withdrawal": return ArrowDownToLine;
      case "Board Entry": return Star;
      case "Board Reward": return Trophy;
      default: return Coins;
    }
  };

  const getTxColor = (type: string) => {
    switch (type) {
      case "Activation": return { text: "text-amber-400", bg: "bg-amber-500/10" };
      case "Upgrade": return { text: "text-purple-400", bg: "bg-purple-500/10" };
      case "Reactivation": return { text: "text-cyan-400", bg: "bg-cyan-500/10" };
      case "Withdrawal": return { text: "text-emerald-400", bg: "bg-emerald-500/10" };
      default: return { text: "text-muted-foreground", bg: "bg-white/[0.05]" };
    }
  };

  const formatTimestamp = (ts: number) => {
    if (ts === 0) return "";
    const date = new Date(ts * 1000);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + " " + date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };

  const totalPages = Math.max(1, Math.ceil(recentTxs.length / ITEMS_PER_PAGE));
  const paginatedTxs = recentTxs.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  return (
    <div className="p-4 sm:p-6 space-y-6 relative z-10">
      <div className="slide-in">
        <h1 className="text-2xl font-bold" data-testid="text-wallet-title" style={{ fontFamily: 'var(--font-display)' }}>
          <span className="gradient-text">Wallet</span>
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">Manage your funds and withdrawals</p>
      </div>

      <div className="earnings-card rounded-2xl p-6 slide-in" style={{ animationDelay: '0.05s' }} data-testid="card-wallet-main">
        <div className="flex items-start justify-between mb-2">
          <div className="h-12 w-12 rounded-xl bg-amber-500/15 flex items-center justify-center">
            <WalletIcon className="h-6 w-6 text-amber-400" />
          </div>
        </div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Available Balance</p>
        <p className="text-4xl font-bold gradient-text mb-1" data-testid="text-wallet-balance-large" style={{ fontFamily: 'var(--font-display)' }}>
          ${formatAmount(userInfo.walletBalance)}
        </p>
        <p className="text-xs text-muted-foreground mb-5">Withdrawals are available to your wallet with a minimum of $10, in multiples of $10.</p>

        <button
          onClick={() => setShowWithdrawDialog(true)}
          className="w-full glow-button text-white font-bold py-3.5 px-6 rounded-xl transition-all flex items-center justify-center gap-2"
          data-testid="button-withdraw-open"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          <ArrowDownToLine className="h-4 w-4" />
          Withdraw
        </button>
      </div>

      <Dialog open={showWithdrawDialog} onOpenChange={setShowWithdrawDialog}>
        <DialogContent className="glass-card border-purple-500/20 sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-purple-500/15 flex items-center justify-center">
                <ArrowDownToLine className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                  <span className="gradient-text">Withdraw Funds</span>
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">Transfer earnings to your wallet</p>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="p-4 rounded-xl bg-white/[0.03] border border-amber-500/10">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Available Balance</p>
              <p className="text-2xl font-bold gradient-text" style={{ fontFamily: 'var(--font-display)' }}>${formatAmount(userInfo.walletBalance)}</p>
            </div>

            <div className="relative">
              <Input
                type="number"
                placeholder="Enter amount to withdraw"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                className="bg-white/[0.03] border-purple-500/20 pr-16"
                data-testid="input-withdraw-amount"
              />
              <button
                onClick={setMaxAmount}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-purple-400 font-medium px-2 py-1 rounded-md bg-purple-500/10"
                data-testid="button-max-amount"
              >
                MAX
              </button>
            </div>

            <p className="text-xs text-muted-foreground" data-testid="text-withdraw-rule">
              Withdrawals are available to your wallet with a minimum of $10, in multiples of $10.
            </p>
            {withdrawAmount && (parseFloat(withdrawAmount) < 10 || parseFloat(withdrawAmount) % 10 !== 0) && (
              <p className="text-xs text-red-400" data-testid="text-withdraw-error">Amount must be a minimum of $10 and in multiples of $10</p>
            )}

            <button
              onClick={handleWithdraw}
              disabled={withdrawing || !withdrawAmount || parseFloat(withdrawAmount) < 10 || parseFloat(withdrawAmount) % 10 !== 0}
              className="w-full glow-button text-white font-bold py-3 px-6 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              data-testid="button-withdraw"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {withdrawing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}
              {withdrawing ? "Processing..." : "USDT Withdrawal"}
            </button>

            <div className="flex items-start gap-2 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
              <div className="text-xs text-muted-foreground space-y-0.5">
                <p data-testid="text-withdraw-note">10% withdrawal matching + 10% BTC pool deduction</p>
                <p>You receive 80% of the withdrawn amount as USDT</p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="glass-card rounded-2xl slide-in" style={{ animationDelay: '0.1s' }} data-testid="card-recent-transactions">
        <div className="flex items-center justify-between gap-3 p-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-purple-500/15 flex items-center justify-center">
              <WalletIcon className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                <span className="gradient-text">Recent Transactions</span>
              </h2>
              <p className="text-[10px] text-muted-foreground">Activations, upgrades & withdrawals</p>
            </div>
          </div>
          <button onClick={loadTransactions} disabled={txLoading} className="text-xs text-purple-400 flex items-center gap-1" data-testid="button-refresh-txs">
            <RefreshCw className={`h-3.5 w-3.5 ${txLoading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        {txLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
          </div>
        ) : recentTxs.length > 0 ? (
          <div className="divide-y divide-white/[0.04]">
            {paginatedTxs.map((tx, index) => {
              const TxIcon = getTxIcon(tx.type);
              const colors = getTxColor(tx.type);
              const globalIndex = (currentPage - 1) * ITEMS_PER_PAGE + index;
              return (
                <div key={`${tx.timestamp}-${globalIndex}`} className="flex items-center justify-between px-5 py-3.5" data-testid={`row-tx-${globalIndex}`}>
                  <div className="flex items-center gap-3">
                    <div className={`h-9 w-9 rounded-lg ${colors.bg} flex items-center justify-center shrink-0`}>
                      <TxIcon className={`h-4 w-4 ${colors.text}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium" data-testid={`text-tx-type-${globalIndex}`}>{tx.type}</span>
                        <Badge variant="outline" className="text-[10px] border-purple-500/20">{tx.detail}</Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{formatTimestamp(tx.timestamp)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`font-bold text-sm ${tx.type === "Withdrawal" ? "text-emerald-400" : ""}`} style={{ fontFamily: 'var(--font-display)' }} data-testid={`text-tx-amount-${globalIndex}`}>
                      {tx.type === "Withdrawal" ? "+" : "-"}${formatAmount(tx.amount)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-10">
            <div className="h-12 w-12 mx-auto rounded-xl bg-white/[0.03] flex items-center justify-center mb-3">
              <WalletIcon className="h-6 w-6 text-muted-foreground/30" />
            </div>
            <p className="text-sm text-muted-foreground" data-testid="text-no-transactions">No recent transactions found</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Your activation and withdrawal history will appear here</p>
          </div>
        )}

        {!txLoading && recentTxs.length > ITEMS_PER_PAGE && (
          <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-white/[0.06]">
            <p className="text-[11px] text-muted-foreground">
              Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, recentTxs.length)} of {recentTxs.length}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                data-testid="button-wallet-tx-prev"
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
                  data-testid={`button-wallet-tx-page-${page}`}
                >
                  <span className="text-xs">{page}</span>
                </Button>
              ))}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                data-testid="button-wallet-tx-next"
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
