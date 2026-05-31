import { useState, useEffect, useCallback } from "react";
import { Wallet as WalletIcon, ArrowDownToLine, Bitcoin, Loader2, ArrowUpRight, RefreshCw, ChevronLeft, ChevronRight, CheckCircle2, Banknote, Info, ChevronDown, ChevronUp, Repeat2, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatTokenAmount, shortenAddress, decodeContractError } from "@/lib/contract";
import { useLocation } from "wouter";
import { ethers } from "ethers";
import type { UserInfo } from "@/hooks/use-web3";

interface ContractTx {
  type: string;
  amount: bigint;
  detail: string;
  timestamp: number;
  isIncome: boolean;
  currency?: "USDT" | "MWT";
  mvtAmount?: bigint;
  sellPrice?: bigint;
}

interface WalletProps {
  userInfo: UserInfo;
  account: string;
  formatAmount: (val: bigint) => string;
  withdrawFunds: (amount: string) => Promise<void>;
  claimRebirthBalance: () => Promise<void>;
  getTransactionsFromContract: (offset: number, limit: number) => Promise<{ transactions: ContractTx[]; total: number }>;
}

const ITEMS_PER_PAGE = 10;

function usdFmt(val: bigint) {
  return parseFloat(formatTokenAmount(val, 18)).toFixed(2);
}

const REBIRTH_THRESHOLD = 130;

export default function WalletPage({ userInfo, account, formatAmount, withdrawFunds, claimRebirthBalance, getTransactionsFromContract }: WalletProps) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [showWithdrawDialog, setShowWithdrawDialog] = useState(false);

  const [claiming, setClaiming] = useState(false);

  const [recentTxs, setRecentTxs] = useState<ContractTx[]>([]);
  const [txLoading, setTxLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalTxs, setTotalTxs] = useState(0);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const usdtBalance = parseFloat(usdFmt(userInfo.usdtBalance));
  const btcPoolBalance = parseFloat(usdFmt(userInfo.btcPoolBalance));
  const rebirthPool = parseFloat(usdFmt(userInfo.rebirthPool));

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

  const handleClaimRebirth = async () => {
    setClaiming(true);
    try {
      await claimRebirthBalance();
      toast({ title: "Rebirth Balance Claimed!", description: `$${rebirthPool.toFixed(2)} USDT has been moved to your wallet balance.` });
    } catch (err: any) {
      const msg = decodeContractError(err);
      toast({ title: "Claim Failed", description: msg, variant: "destructive" });
    } finally {
      setClaiming(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalTxs / ITEMS_PER_PAGE));

  const fmt2 = (val: bigint, decimals = 18) =>
    parseFloat(ethers.formatUnits(val, decimals)).toFixed(2);

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
          <p className="text-xs text-muted-foreground mt-1">From MWT sells &amp; unstake proceeds — withdraw to your wallet anytime</p>
          <button
            onClick={() => setShowWithdrawDialog(true)}
            disabled={usdtBalance <= 0}
            className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-sm font-semibold text-emerald-400 hover:bg-emerald-500/15 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid="button-withdraw-usdt"
          >
            <ArrowDownToLine className="h-4 w-4" /> Withdraw USDT
          </button>
        </div>

        {/* BTC Pool Income */}
        <div className="glass-card rounded-2xl p-5" data-testid="card-btc-pool-balance">
          <div className="flex items-center justify-between mb-4">
            <div className="h-10 w-10 rounded-xl bg-orange-500/15 flex items-center justify-center">
              <Bitcoin className="h-5 w-5 text-orange-400" />
            </div>
            <Badge variant="outline" className="text-[9px] border-orange-500/30 text-orange-400">Board Entry</Badge>
          </div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">USDT Pool Balance</p>
          <p className="text-3xl font-bold" style={{ fontFamily: "var(--font-display)" }} data-testid="text-btc-pool-balance">
            <span className="text-orange-400">${btcPoolBalance.toFixed(2)}</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">10% from every MWT sell — used exclusively to enter board pools</p>
          <div className="mt-4 w-full flex items-center gap-2 py-2.5 px-3 rounded-xl bg-orange-500/5 border border-orange-500/15">
            <Info className="h-3.5 w-3.5 text-orange-400/70 shrink-0" />
            <p className="text-[11px] text-orange-300/70">Auto-funds your board pool entries only — not withdrawable</p>
          </div>
        </div>
      </div>

      {/* Rebirth Pool */}
      {rebirthPool > 0 && (
        <div className="glass-card rounded-2xl p-5 slide-in" style={{ animationDelay: "0.06s" }} data-testid="card-rebirth-pool">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-violet-500/15 flex items-center justify-center">
                <Repeat2 className="h-5 w-5 text-violet-400" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Rebirth Wallet</p>
                <p className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }} data-testid="text-rebirth-pool">
                  <span className="text-violet-400">${rebirthPool.toFixed(2)}</span>
                </p>
              </div>
            </div>
            <Badge variant="outline" className="text-[9px] border-violet-500/30 text-violet-400">
              {rebirthPool >= REBIRTH_THRESHOLD ? "Ready to Rebirth" : "Accumulating"}
            </Badge>
          </div>

          {/* Progress bar toward $130 */}
          {rebirthPool < REBIRTH_THRESHOLD && (
            <div className="mb-3">
              <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                <span>Progress to rebirth</span>
                <span>${rebirthPool.toFixed(2)} / $130.00</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 to-purple-400 transition-all"
                  style={{ width: `${Math.min(100, (rebirthPool / REBIRTH_THRESHOLD) * 100).toFixed(1)}%` }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Need ${(REBIRTH_THRESHOLD - rebirthPool).toFixed(2)} more to trigger rebirth
              </p>
            </div>
          )}

          {rebirthPool >= REBIRTH_THRESHOLD ? (
            <div className="space-y-2">
              <p className="text-[11px] text-emerald-400 font-medium">
                Rebirth pool is ready! Use it to activate a new sub-account and reset your income limit to $390.
              </p>
              <p className="text-[11px] text-muted-foreground">
                After rebirth: $130 activates sub-account → income limit resets to $390 → remaining <span className="text-violet-300">${(rebirthPool - REBIRTH_THRESHOLD).toFixed(2)} credits to your new limit</span>. Any amount beyond $390 stays here for the next rebirth.
              </p>
              <button
                onClick={() => setLocation("/rebirth")}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/15 transition-all"
                data-testid="button-go-to-rebirth"
              >
                <RotateCcw className="h-4 w-4" /> Create Sub-Account Now
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] text-muted-foreground">
                Keep selling MWT to fill this wallet. Once it hits $130, you can create a sub-account — income limit resets to $390, and <span className="text-violet-300 font-medium">remaining funds credit to your new income limit</span>.
              </p>
              <button
                onClick={handleClaimRebirth}
                disabled={claiming}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-violet-500/10 border border-violet-500/20 text-sm font-semibold text-violet-400 hover:bg-violet-500/15 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                data-testid="button-claim-rebirth"
              >
                {claiming ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}
                {claiming ? "Claiming..." : "Claim Small Balance to Wallet"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Info box */}
      <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 slide-in" style={{ animationDelay: "0.07s" }}>
        <Info className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-[11px] text-muted-foreground leading-relaxed space-y-1">
          <p><span className="text-amber-400 font-medium">Income Limit ($390): </span>MWT sells → 90% goes to USDT balance (subject to $390 cap). Excess beyond the cap flows to your Rebirth Wallet.</p>
          <p><span className="text-emerald-400 font-medium">Staking/Unstaking — No limit: </span>USDT received on unstake is credited directly to your USDT balance and is NOT subject to the income limit.</p>
          <p><span className="text-orange-400 font-medium">Board rewards: </span>40% of board pool completions credited directly to your USDT balance — also NOT subject to income limit.</p>
        </div>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-2 gap-3 slide-in" style={{ animationDelay: "0.08s" }}>
        <div className="glass-card rounded-xl p-3 text-center" data-testid="card-total-earned">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Total MWT Earned</p>
          <p className="text-base font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }} data-testid="text-total-received">
            {parseFloat(formatTokenAmount(userInfo.totalReceived, 18)).toFixed(2)} MWT
          </p>
        </div>
        <div className="glass-card rounded-xl p-3 text-center" data-testid="card-total-sold">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Total MWT Sold</p>
          <p className="text-base font-bold text-orange-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-total-sold">
            {parseFloat(formatTokenAmount(userInfo.totalSold, 18)).toFixed(2)} MWT
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
              const isSell = tx.type === "Sell MWT";
              const isExpanded = expandedIdx === idx;
              return (
                <div key={idx} data-testid={`row-tx-${idx}`}>
                  <div
                    className={`flex items-center justify-between px-5 py-3.5 ${isSell ? "cursor-pointer hover:bg-white/[0.02]" : ""}`}
                    onClick={() => isSell && setExpandedIdx(isExpanded ? null : idx)}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${tx.isIncome ? "bg-emerald-500/10" : "bg-white/[0.04]"}`}>
                        <ArrowUpRight className={`h-4 w-4 ${tx.isIncome ? "text-emerald-400" : "text-muted-foreground"}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium" data-testid={`text-tx-type-${idx}`}>{tx.type}</p>
                          {isSell && (
                            <span className="text-[9px] text-muted-foreground/50">tap for details</span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground">{tx.detail} · {date.toLocaleDateString()}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="text-right">
                        {tx.amount > 0n && (
                          <p className={`text-sm font-bold ${tx.isIncome ? "text-emerald-400" : "text-muted-foreground"}`} data-testid={`text-tx-amount-${idx}`}>
                            {tx.isIncome ? "+" : ""}{amtNum.toFixed(2)} {tx.currency ?? "USDT"}
                          </p>
                        )}
                        <p className="text-[9px] text-muted-foreground">
                          {date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      {isSell && (
                        isExpanded
                          ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                          : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                      )}
                    </div>
                  </div>

                  {/* Expanded sell detail */}
                  {isSell && isExpanded && (
                    <div className="px-5 pb-4 bg-white/[0.01]">
                      <div className="rounded-xl border border-white/[0.06] p-3 space-y-2">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Sell Transaction Detail</p>
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          {tx.mvtAmount && tx.mvtAmount > 0n && (
                            <div className="bg-white/[0.02] rounded-lg p-2">
                              <p className="text-muted-foreground/60 mb-0.5">MWT Tokens Sold</p>
                              <p className="font-semibold text-amber-400">{fmt2(tx.mvtAmount)} MWT</p>
                            </div>
                          )}
                          {tx.sellPrice && tx.sellPrice > 0n && (
                            <div className="bg-white/[0.02] rounded-lg p-2">
                              <p className="text-muted-foreground/60 mb-0.5">Sell Price</p>
                              <p className="font-semibold text-white">${parseFloat(ethers.formatUnits(tx.sellPrice, 18)).toFixed(6)}/MWT</p>
                            </div>
                          )}
                          <div className="bg-white/[0.02] rounded-lg p-2">
                            <p className="text-muted-foreground/60 mb-0.5">Total USDT (Gross)</p>
                            <p className="font-semibold text-white">${(parseFloat(fmt2(tx.amount)) / 0.9).toFixed(2)}</p>
                          </div>
                          <div className="bg-white/[0.02] rounded-lg p-2">
                            <p className="text-muted-foreground/60 mb-0.5">USDT Received (90%)</p>
                            <p className="font-semibold text-emerald-400">${fmt2(tx.amount)}</p>
                          </div>
                          <div className="bg-white/[0.02] rounded-lg p-2 col-span-2">
                            <p className="text-muted-foreground/60 mb-0.5">USDT Pool Contribution (10%)</p>
                            <p className="font-semibold text-orange-400">${(parseFloat(fmt2(tx.amount)) / 9).toFixed(2)}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
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
                <Button variant="outline" size="sm" onClick={() => setWithdrawAmount(usdtBalance.toFixed(2))} className="border-white/[0.08] shrink-0" data-testid="button-withdraw-max">
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

    </div>
  );
}
