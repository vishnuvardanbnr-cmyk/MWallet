import { useState, useEffect, useCallback } from "react";
import { Wallet as WalletIcon, ArrowDownToLine, Bitcoin, Loader2, ArrowUpRight, RefreshCw, ChevronLeft, ChevronRight, CheckCircle2, ExternalLink, Banknote, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatTokenAmount, shortenAddress } from "@/lib/contract";
import { ethers } from "ethers";
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
  account: string;
  formatAmount: (val: bigint) => string;
  withdrawFunds: (amount: string) => Promise<void>;
  withdrawBtcPool: (amount: string) => Promise<void>;
  getTransactionsFromContract: (offset: number, limit: number) => Promise<{ transactions: ContractTx[]; total: number }>;
}

const ITEMS_PER_PAGE = 10;

function usdFmt(val: bigint) {
  return parseFloat(formatTokenAmount(val, 18)).toFixed(2);
}

export default function WalletPage({ userInfo, account, formatAmount, withdrawFunds, withdrawBtcPool, getTransactionsFromContract }: WalletProps) {
  const { toast } = useToast();

  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [showWithdrawDialog, setShowWithdrawDialog] = useState(false);

  const [btcWithdrawAmount, setBtcWithdrawAmount] = useState("");
  const [withdrawingBtc, setWithdrawingBtc] = useState(false);
  const [showBtcWithdrawDialog, setShowBtcWithdrawDialog] = useState(false);

  const [recentTxs, setRecentTxs] = useState<ContractTx[]>([]);
  const [txLoading, setTxLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalTxs, setTotalTxs] = useState(0);

  const usdtBalance = parseFloat(usdFmt(userInfo.usdtBalance));
  const btcPoolBalance = parseFloat(usdFmt(userInfo.btcPoolBalance));
  const totalReceived = parseFloat(usdFmt(userInfo.totalReceived));

  const loadTransactions = useCallback(async () => {
    setTxLoading(true);
    try {
      const offset = (currentPage - 1) * ITEMS_PER_PAGE;
      const result = await getTransactionsFromContract(offset, ITEMS_PER_PAGE);
      setRecentTxs(result.transactions);
      setTotalTxs(result.total);
    } catch {
      setRecentTxs([]);
    } finally {
      setTxLoading(false);
    }
  }, [getTransactionsFromContract, currentPage]);

  useEffect(() => { loadTransactions(); }, [loadTransactions]);

  const handleWithdrawUsdt = async () => {
    if (!withdrawAmount || parseFloat(withdrawAmount) <= 0) return;
    if (parseFloat(withdrawAmount) > usdtBalance) {
      toast({ title: "Exceeds balance", description: `Max: $${usdtBalance.toFixed(2)} USDT`, variant: "destructive" });
      return;
    }
    setWithdrawing(true);
    try {
      await withdrawFunds(withdrawAmount);
      toast({ title: "Withdrawn!", description: `$${withdrawAmount} USDT sent to your wallet.` });
      setShowWithdrawDialog(false);
      setWithdrawAmount("");
    } catch (err: any) {
      const msg = err?.reason || err?.shortMessage || err?.message || "Withdrawal failed";
      toast({ title: "Withdrawal Failed", description: msg.slice(0, 120), variant: "destructive" });
    } finally {
      setWithdrawing(false);
    }
  };

  const handleWithdrawBtc = async () => {
    if (!btcWithdrawAmount || parseFloat(btcWithdrawAmount) <= 0) return;
    if (parseFloat(btcWithdrawAmount) > btcPoolBalance) {
      toast({ title: "Exceeds BTC pool balance", description: `Max: $${btcPoolBalance.toFixed(2)} USDT`, variant: "destructive" });
      return;
    }
    setWithdrawingBtc(true);
    try {
      await withdrawBtcPool(btcWithdrawAmount);
      toast({ title: "BTC Pool Withdrawn!", description: `$${btcWithdrawAmount} USDT from BTC pool sent to your wallet.` });
      setShowBtcWithdrawDialog(false);
      setBtcWithdrawAmount("");
    } catch (err: any) {
      const msg = err?.reason || err?.shortMessage || err?.message || "Withdrawal failed";
      toast({ title: "BTC Pool Withdrawal Failed", description: msg.slice(0, 120), variant: "destructive" });
    } finally {
      setWithdrawingBtc(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalTxs / ITEMS_PER_PAGE));

  return (
    <div className="p-4 sm:p-6 space-y-6 relative z-10">
      <div className="slide-in">
        <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
          <span className="gradient-text">Wallet</span>
        </h1>
        <p className="text-sm text-muted-foreground">Manage your earnings and withdrawals</p>
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 slide-in" style={{ animationDelay: "0.05s" }}>
        {/* USDT Balance */}
        <div className="glass-card rounded-2xl p-5" data-testid="card-usdt-balance">
          <div className="flex items-center justify-between mb-4">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
              <Banknote className="h-5 w-5 text-emerald-400" />
            </div>
            <Badge variant="outline" className="text-[9px] border-emerald-500/30 text-emerald-400">Withdrawable</Badge>
          </div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">USDT Balance</p>
          <p className="text-3xl font-bold" style={{ fontFamily: "var(--font-display)" }} data-testid="text-usdt-balance">
            <span className="gradient-text">${usdtBalance.toFixed(2)}</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">From selling MVT tokens</p>
          <button
            onClick={() => setShowWithdrawDialog(true)}
            disabled={usdtBalance <= 0}
            className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-sm font-semibold text-emerald-400 hover:bg-emerald-500/15 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid="button-withdraw-usdt"
          >
            <ArrowDownToLine className="h-4 w-4" /> Withdraw USDT
          </button>
        </div>

        {/* BTC Pool */}
        <div className="glass-card rounded-2xl p-5" data-testid="card-btc-pool-balance">
          <div className="flex items-center justify-between mb-4">
            <div className="h-10 w-10 rounded-xl bg-orange-500/15 flex items-center justify-center">
              <Bitcoin className="h-5 w-5 text-orange-400" />
            </div>
            <Badge variant="outline" className="text-[9px] border-orange-500/30 text-orange-400">10% of Sells</Badge>
          </div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">BTC Pool</p>
          <p className="text-3xl font-bold" style={{ fontFamily: "var(--font-display)" }} data-testid="text-btc-pool-balance">
            <span className="text-orange-400">${btcPoolBalance.toFixed(2)}</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">10% deducted from every MVT sell</p>
          <button
            onClick={() => setShowBtcWithdrawDialog(true)}
            disabled={btcPoolBalance <= 0}
            className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20 text-sm font-semibold text-orange-400 hover:bg-orange-500/15 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid="button-withdraw-btc-pool"
          >
            <Bitcoin className="h-4 w-4" /> Withdraw BTC Pool
          </button>
        </div>
      </div>

      {/* Info box */}
      <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 slide-in" style={{ animationDelay: "0.07s" }}>
        <Info className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-[11px] text-muted-foreground leading-relaxed">
          <span className="text-amber-400 font-medium">How it works: </span>
          Sell MVT tokens on the Sell MVT page → 90% fills your income limit → excess goes to rebirth pool. The withdrawable USDT here comes from selling MVT while your income limit is active. 10% of every sell goes to your BTC pool.
        </div>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-2 gap-3 slide-in" style={{ animationDelay: "0.08s" }}>
        <div className="glass-card rounded-xl p-3 text-center" data-testid="card-total-earned">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Total MVT Earned</p>
          <p className="text-base font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }} data-testid="text-total-received">
            {parseFloat(formatTokenAmount(userInfo.totalReceived, 18)).toLocaleString(undefined, { maximumFractionDigits: 2 })} MVT
          </p>
        </div>
        <div className="glass-card rounded-xl p-3 text-center" data-testid="card-total-sold">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Total MVT Sold</p>
          <p className="text-base font-bold text-orange-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-total-sold">
            {parseFloat(formatTokenAmount(userInfo.totalSold, 18)).toLocaleString(undefined, { maximumFractionDigits: 2 })} MVT
          </p>
        </div>
      </div>

      {/* Transaction History */}
      <div className="glass-card rounded-2xl slide-in" style={{ animationDelay: "0.1s" }} data-testid="card-tx-history">
        <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <ArrowUpRight className="h-4 w-4 text-amber-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}>
                <span className="gradient-text">Transaction History</span>
              </h2>
              <p className="text-[10px] text-muted-foreground">{totalTxs} total records</p>
            </div>
          </div>
          <button onClick={loadTransactions} className="p-1.5 rounded-lg hover:bg-white/[0.04] text-muted-foreground transition-all" data-testid="button-refresh-txs">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        {txLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-yellow-300" />
          </div>
        ) : recentTxs.length === 0 ? (
          <div className="text-center py-12">
            <WalletIcon className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No transactions yet</p>
            <p className="text-[11px] text-muted-foreground/60 mt-1">Your activity will appear here</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {recentTxs.map((tx, idx) => {
              const date = new Date(tx.timestamp * 1000);
              const amtNum = parseFloat(formatTokenAmount(tx.amount, 18));
              return (
                <div key={idx} className="flex items-center justify-between px-5 py-3.5" data-testid={`row-tx-${idx}`}>
                  <div className="flex items-center gap-3">
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${tx.isIncome ? "bg-emerald-500/10" : "bg-white/[0.04]"}`}>
                      <ArrowUpRight className={`h-4 w-4 ${tx.isIncome ? "text-emerald-400" : "text-muted-foreground"}`} />
                    </div>
                    <div>
                      <p className="text-sm font-medium" data-testid={`text-tx-type-${idx}`}>{tx.type}</p>
                      <p className="text-[10px] text-muted-foreground">{tx.detail} · {date.toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    {tx.amount > 0n && (
                      <p className={`text-sm font-bold ${tx.isIncome ? "text-emerald-400" : "text-muted-foreground"}`} data-testid={`text-tx-amount-${idx}`}>
                        {tx.isIncome ? "+" : ""}{amtNum.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                      </p>
                    )}
                    <p className="text-[9px] text-muted-foreground">
                      {date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!txLoading && totalTxs > ITEMS_PER_PAGE && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-white/[0.06]">
            <p className="text-[11px] text-muted-foreground">Page {currentPage} of {totalPages}</p>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1} data-testid="button-tx-prev">
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} data-testid="button-tx-next">
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* USDT Withdraw Dialog */}
      <Dialog open={showWithdrawDialog} onOpenChange={setShowWithdrawDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Withdraw USDT</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <p className="text-xs text-muted-foreground mb-0.5">Available</p>
              <p className="text-xl font-bold gradient-text">${usdtBalance.toFixed(2)} USDT</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Amount to Withdraw</label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={withdrawAmount}
                  onChange={e => setWithdrawAmount(e.target.value)}
                  placeholder="0.00"
                  className="bg-white/[0.03] border-white/[0.08]"
                  data-testid="input-withdraw-amount"
                />
                <Button variant="outline" size="sm" onClick={() => setWithdrawAmount(usdtBalance.toFixed(4))} className="border-white/[0.08] shrink-0" data-testid="button-withdraw-max">
                  MAX
                </Button>
              </div>
            </div>
            <Button
              onClick={handleWithdrawUsdt}
              disabled={withdrawing || !withdrawAmount || parseFloat(withdrawAmount) <= 0}
              className="w-full glow-button text-white"
              data-testid="button-confirm-withdraw"
            >
              {withdrawing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ArrowDownToLine className="h-4 w-4 mr-2" />}
              {withdrawing ? "Withdrawing..." : "Withdraw to Wallet"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* BTC Pool Withdraw Dialog */}
      <Dialog open={showBtcWithdrawDialog} onOpenChange={setShowBtcWithdrawDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Withdraw BTC Pool</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <Info className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">This withdraws USDT to your wallet. Use the BTC Swap page to convert to BTC.</p>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <p className="text-xs text-muted-foreground mb-0.5">BTC Pool Balance</p>
              <p className="text-xl font-bold text-orange-400">${btcPoolBalance.toFixed(2)} USDT</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Amount</label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={btcWithdrawAmount}
                  onChange={e => setBtcWithdrawAmount(e.target.value)}
                  placeholder="0.00"
                  className="bg-white/[0.03] border-white/[0.08]"
                  data-testid="input-btc-withdraw-amount"
                />
                <Button variant="outline" size="sm" onClick={() => setBtcWithdrawAmount(btcPoolBalance.toFixed(4))} className="border-white/[0.08] shrink-0" data-testid="button-btc-withdraw-max">
                  MAX
                </Button>
              </div>
            </div>
            <Button
              onClick={handleWithdrawBtc}
              disabled={withdrawingBtc || !btcWithdrawAmount || parseFloat(btcWithdrawAmount) <= 0}
              className="w-full bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 border border-orange-500/30"
              data-testid="button-confirm-btc-withdraw"
            >
              {withdrawingBtc ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Bitcoin className="h-4 w-4 mr-2" />}
              {withdrawingBtc ? "Withdrawing..." : "Withdraw BTC Pool"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
