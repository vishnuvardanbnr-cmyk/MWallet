import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Wallet as WalletIcon, ArrowDownToLine, Coins, Loader2, ArrowUpRight, Package, RefreshCw, Info, ChevronLeft, ChevronRight, Star, Trophy, ArrowDownCircle, CheckCircle2, ExternalLink, Banknote } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { getTokenContract, getDepositVaultContract, DEPOSIT_VAULT_ADDRESS, NETWORK } from "@/lib/contract";
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
  getTransactionsFromContract: (offset: number, limit: number) => Promise<{ transactions: ContractTx[]; total: number }>;
}

const ITEMS_PER_PAGE = 10;

type DepositStep = "idle" | "approving" | "depositing" | "verifying" | "done";

export default function WalletPage({ userInfo, account, formatAmount, withdrawFunds, getTransactionsFromContract }: WalletProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // MLM withdrawal state
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [showWithdrawDialog, setShowWithdrawDialog] = useState(false);

  // Transaction list state
  const [recentTxs, setRecentTxs] = useState<ContractTx[]>([]);
  const [txLoading, setTxLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  // Deposit state
  const [showDepositDialog, setShowDepositDialog] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositStep, setDepositStep] = useState<DepositStep>("idle");
  const [depositTxHash, setDepositTxHash] = useState("");

  // Virtual USDT balance
  const { data: virtualUsdtData, refetch: refetchVirtualUsdt } = useQuery<{ balance: string; totalDeposited: string }>({
    queryKey: ["/api/usdt", account],
    queryFn: () => fetch(`/api/usdt/${account}`).then(r => r.json()),
    enabled: !!account,
  });

  // Deposit history
  const { data: depositHistory = [], refetch: refetchHistory } = useQuery<Array<{ id: number; txHash: string; amount: string; status: string; createdAt: string }>>({
    queryKey: ["/api/usdt/deposits", account],
    queryFn: () => fetch(`/api/usdt/deposits/${account}`).then(r => r.json()),
    enabled: !!account,
  });

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

  useEffect(() => { loadTransactions(); }, [loadTransactions]);

  // MLM Withdrawal
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

  // USDT Deposit via BoardMatrixHandler vault
  const handleDeposit = async () => {
    const amt = parseFloat(depositAmount);
    if (!depositAmount || isNaN(amt) || amt <= 0) {
      toast({ title: "Invalid amount", variant: "destructive" });
      return;
    }

    let txHash = "";
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      await provider.send("wallet_switchEthereumChain", [{ chainId: NETWORK.chainId }]);
      const signer = await provider.getSigner();
      const usdtContract = getTokenContract(signer);
      const parsedAmt = ethers.parseUnits(amt.toFixed(4), 18);

      // Step 1: approve USDT to DepositVault
      setDepositStep("approving");
      const allowance: bigint = await (usdtContract as any).allowance(account, DEPOSIT_VAULT_ADDRESS);
      if (allowance < parsedAmt) {
        toast({ title: "Approving USDT...", description: "Please confirm the approval in MetaMask" });
        const approveTx = await (usdtContract as any).approve(DEPOSIT_VAULT_ADDRESS, parsedAmt);
        await approveTx.wait();
        toast({ title: "Approval confirmed", description: "Now depositing..." });
      }

      // Step 2: call deposit on DepositVault
      setDepositStep("depositing");
      const depositVault = getDepositVaultContract(signer);
      toast({ title: "Depositing...", description: "Please confirm the deposit transaction in MetaMask" });
      const depositTx = await (depositVault as any).deposit(parsedAmt);
      const receipt = await depositTx.wait();
      txHash = receipt.hash;
      setDepositTxHash(txHash);
    } catch (err: any) {
      setDepositStep("idle");
      toast({ title: "Deposit failed", description: err?.shortMessage || err?.message || "MetaMask rejected", variant: "destructive" });
      return;
    }

    // Step 3: verify on backend & credit virtual balance
    setDepositStep("verifying");
    try {
      const res = await fetch("/api/usdt/deposit-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: account, txHash, claimedAmount: amt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setDepositStep("done");
      toast({ title: "Deposit confirmed!", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/usdt", account] });
      queryClient.invalidateQueries({ queryKey: ["/api/usdt/deposits", account] });
    } catch (err: any) {
      setDepositStep("idle");
      toast({ title: "Verification failed", description: err.message, variant: "destructive" });
    }
  };

  const closeDepositDialog = () => {
    setShowDepositDialog(false);
    setDepositAmount("");
    setDepositStep("idle");
    setDepositTxHash("");
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
      case "Upgrade": return { text: "text-yellow-300", bg: "bg-yellow-600/10" };
      case "Reactivation": return { text: "text-amber-300", bg: "bg-amber-600/10" };
      case "Withdrawal": return { text: "text-emerald-400", bg: "bg-emerald-500/10" };
      default: return { text: "text-muted-foreground", bg: "bg-white/[0.05]" };
    }
  };

  const formatTimestamp = (ts: number) => {
    if (!ts) return "";
    const date = new Date(typeof ts === "number" && ts < 1e12 ? ts * 1000 : ts);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + " " + date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };

  const stepDotClass = (isActive: boolean, isComplete: boolean) =>
    isActive ? "bg-amber-400 animate-pulse" : isComplete ? "bg-emerald-400" : "bg-white/20";

  const ds = depositStep as string;
  const dep1Done = ds === "depositing" || ds === "verifying" || ds === "done";
  const dep2Done = ds === "verifying" || ds === "done";
  const dep3Done = ds === "done";

  const totalPages = Math.max(1, Math.ceil(recentTxs.length / ITEMS_PER_PAGE));
  const paginatedTxs = recentTxs.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const virtualBal = parseFloat(virtualUsdtData?.balance ?? "0");

  return (
    <div className="p-4 sm:p-6 space-y-6 relative z-10">
      <div className="slide-in">
        <h1 className="text-2xl font-bold" data-testid="text-wallet-title" style={{ fontFamily: 'var(--font-display)' }}>
          <span className="gradient-text">Wallet</span>
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">Manage your funds, deposits and withdrawals</p>
      </div>

      {/* MLM Earnings Balance */}
      <div className="earnings-card rounded-2xl p-6 slide-in" style={{ animationDelay: '0.05s' }} data-testid="card-wallet-main">
        <div className="flex items-start justify-between mb-2">
          <div className="h-12 w-12 rounded-xl bg-amber-500/15 flex items-center justify-center">
            <WalletIcon className="h-6 w-6 text-amber-400" />
          </div>
          <Badge variant="outline" className="border-amber-500/30 text-amber-400 text-[10px]">MLM Earnings</Badge>
        </div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Available Balance</p>
        <p className="text-4xl font-bold gradient-text mb-1" data-testid="text-wallet-balance-large" style={{ fontFamily: 'var(--font-display)' }}>
          ${formatAmount(userInfo.walletBalance)}
        </p>
        <p className="text-xs text-muted-foreground mb-5">Withdrawals available with a minimum of $10, in multiples of $10.</p>
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

      {/* Virtual USDT Balance + Deposit */}
      <div className="glass-card rounded-2xl p-6 slide-in" style={{ animationDelay: '0.08s' }} data-testid="card-virtual-usdt">
        <div className="flex items-start justify-between mb-2">
          <div className="h-12 w-12 rounded-xl bg-emerald-500/15 flex items-center justify-center">
            <Banknote className="h-6 w-6 text-emerald-400" />
          </div>
          <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 text-[10px]">Virtual USDT</Badge>
        </div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">M Token Staking Balance</p>
        <p className="text-4xl font-bold text-emerald-400 mb-1" data-testid="text-virtual-usdt-balance" style={{ fontFamily: 'var(--font-display)' }}>
          ${virtualBal.toFixed(2)}
        </p>
        <p className="text-xs text-muted-foreground mb-5">Used to purchase &amp; stake M Tokens on the paid staking platform.</p>
        <div className="flex gap-3">
          <button
            onClick={() => { setShowDepositDialog(true); setDepositStep("idle"); }}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold text-sm hover:bg-emerald-500/20 transition-all"
            data-testid="button-deposit-open"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            <ArrowDownCircle className="h-4 w-4" />
            Deposit USDT
          </button>
          <a
            href="/paid-staking"
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-yellow-600/10 border border-yellow-600/20 text-yellow-300 font-bold text-sm hover:bg-yellow-600/20 transition-all"
            data-testid="link-paid-staking"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            <Coins className="h-4 w-4" />
            Stake M Token
          </a>
        </div>
      </div>

      {/* Deposit History */}
      {depositHistory.length > 0 && (
        <div className="glass-card rounded-2xl slide-in" style={{ animationDelay: '0.1s' }} data-testid="card-deposit-history">
          <div className="flex items-center gap-3 p-5 border-b border-white/[0.06]">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
              <ArrowDownCircle className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                <span className="text-emerald-400">Deposit History</span>
              </h2>
              <p className="text-[10px] text-muted-foreground">On-chain USDT deposits credited to virtual balance</p>
            </div>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {depositHistory.slice(0, 10).map((dep, i) => (
              <div key={dep.id} className="flex items-center justify-between px-5 py-3.5" data-testid={`row-deposit-${i}`}>
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-emerald-400" data-testid={`text-deposit-amount-${i}`}>+${parseFloat(dep.amount).toFixed(2)} USDT</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <p className="text-[11px] text-muted-foreground">{formatTimestamp(new Date(dep.createdAt).getTime())}</p>
                      <a
                        href={`https://testnet.bscscan.com/tx/${dep.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-yellow-300 flex items-center gap-0.5 hover:underline"
                        data-testid={`link-deposit-tx-${i}`}
                      >
                        <ExternalLink className="h-3 w-3" /> Tx
                      </a>
                    </div>
                  </div>
                </div>
                <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">Confirmed</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MLM Transaction History */}
      <div className="glass-card rounded-2xl slide-in" style={{ animationDelay: '0.15s' }} data-testid="card-recent-transactions">
        <div className="flex items-center justify-between gap-3 p-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-yellow-600/15 flex items-center justify-center">
              <WalletIcon className="h-5 w-5 text-yellow-300" />
            </div>
            <div>
              <h2 className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                <span className="gradient-text">MLM Transactions</span>
              </h2>
              <p className="text-[10px] text-muted-foreground">Activations, upgrades &amp; withdrawals</p>
            </div>
          </div>
          <button onClick={loadTransactions} disabled={txLoading} className="text-xs text-yellow-300 flex items-center gap-1" data-testid="button-refresh-txs">
            <RefreshCw className={`h-3.5 w-3.5 ${txLoading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        {txLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-yellow-300" />
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
                        <Badge variant="outline" className="text-[10px] border-yellow-600/20">{tx.detail}</Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{formatTimestamp(tx.timestamp)}</p>
                    </div>
                  </div>
                  <span className={`font-bold text-sm ${tx.type === "Withdrawal" ? "text-emerald-400" : ""}`} style={{ fontFamily: 'var(--font-display)' }} data-testid={`text-tx-amount-${globalIndex}`}>
                    {tx.type === "Withdrawal" ? "+" : "-"}${formatAmount(tx.amount)}
                  </span>
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
              Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, recentTxs.length)} of {recentTxs.length}
            </p>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} data-testid="button-wallet-tx-prev">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <Button key={page} variant={page === currentPage ? "default" : "ghost"} size="icon" onClick={() => setCurrentPage(page)} className={page === currentPage ? "glow-button text-white" : ""} data-testid={`button-wallet-tx-page-${page}`}>
                  <span className="text-xs">{page}</span>
                </Button>
              ))}
              <Button variant="ghost" size="icon" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} data-testid="button-wallet-tx-next">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Withdraw Dialog */}
      <Dialog open={showWithdrawDialog} onOpenChange={setShowWithdrawDialog}>
        <DialogContent className="glass-card border-yellow-600/20 sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-yellow-600/15 flex items-center justify-center">
                <ArrowDownToLine className="h-5 w-5 text-yellow-300" />
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
              <Input type="number" placeholder="Enter amount to withdraw" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} className="bg-white/[0.03] border-yellow-600/20 pr-16" data-testid="input-withdraw-amount" />
              <button onClick={setMaxAmount} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-yellow-300 font-medium px-2 py-1 rounded-md bg-yellow-600/10" data-testid="button-max-amount">MAX</button>
            </div>
            <p className="text-xs text-muted-foreground" data-testid="text-withdraw-rule">Minimum $10, multiples of $10.</p>
            {withdrawAmount && (parseFloat(withdrawAmount) < 10 || parseFloat(withdrawAmount) % 10 !== 0) && (
              <p className="text-xs text-red-400" data-testid="text-withdraw-error">Amount must be a minimum of $10 and in multiples of $10</p>
            )}
            <button onClick={handleWithdraw} disabled={withdrawing || !withdrawAmount || parseFloat(withdrawAmount) < 10 || parseFloat(withdrawAmount) % 10 !== 0} className="w-full glow-button text-white font-bold py-3 px-6 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2" data-testid="button-withdraw" style={{ fontFamily: 'var(--font-display)' }}>
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

      {/* Deposit Dialog */}
      <Dialog open={showDepositDialog} onOpenChange={(open) => { if (!open) closeDepositDialog(); }}>
        <DialogContent className="glass-card border-emerald-500/20 sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                <ArrowDownCircle className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                  <span className="text-emerald-400">Deposit USDT</span>
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">Funds M Token staking virtual balance</p>
              </div>
            </div>
          </DialogHeader>

          {depositStep === "done" ? (
            <div className="space-y-4 pt-2 text-center">
              <div className="h-16 w-16 mx-auto rounded-full bg-emerald-500/15 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              </div>
              <div>
                <p className="text-lg font-bold text-emerald-400" style={{ fontFamily: 'var(--font-display)' }}>Deposit Confirmed!</p>
                <p className="text-sm text-muted-foreground mt-1">${parseFloat(depositAmount).toFixed(2)} USDT credited to your virtual balance</p>
              </div>
              {depositTxHash && (
                <a href={`https://testnet.bscscan.com/tx/${depositTxHash}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-yellow-300 hover:underline" data-testid="link-deposit-tx-done">
                  <ExternalLink className="h-3 w-3" /> View on BSCScan
                </a>
              )}
              <button onClick={closeDepositDialog} className="w-full glow-button text-white font-bold py-3 rounded-xl" data-testid="button-deposit-close">Done</button>
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              <div className="p-4 rounded-xl bg-white/[0.03] border border-emerald-500/10">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Current Virtual Balance</p>
                <p className="text-2xl font-bold text-emerald-400" style={{ fontFamily: 'var(--font-display)' }}>${virtualBal.toFixed(2)}</p>
              </div>

              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">USDT Amount to Deposit</label>
                <Input
                  type="number"
                  placeholder="Enter USDT amount"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  disabled={depositStep !== "idle"}
                  className="bg-white/[0.03] border-emerald-500/20"
                  data-testid="input-deposit-amount"
                  min="1"
                />
              </div>

              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${stepDotClass(depositStep === "approving", dep1Done)}`} />
                  <p className="text-xs text-muted-foreground">Step 1: Approve USDT to vault contract</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${stepDotClass(depositStep === "depositing", dep2Done)}`} />
                  <p className="text-xs text-muted-foreground">Step 2: Deposit USDT to on-chain vault</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${stepDotClass(depositStep === "verifying", dep3Done)}`} />
                  <p className="text-xs text-muted-foreground">Step 3: Verify &amp; credit virtual balance</p>
                </div>
              </div>

              <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-400" />
                <div className="text-xs text-muted-foreground">
                  <p>USDT is deposited into the M-Vault on-chain vault contract on BSC Testnet. Your virtual balance is credited after on-chain confirmation.</p>
                  <p className="mt-1 font-mono text-[10px] break-all text-emerald-400/70">Vault: {DEPOSIT_VAULT_ADDRESS}</p>
                </div>
              </div>

              <button
                onClick={handleDeposit}
                disabled={depositStep !== "idle" || !depositAmount || parseFloat(depositAmount) <= 0}
                className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold hover:bg-emerald-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="button-deposit-confirm"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {(depositStep === "approving" || depositStep === "depositing" || depositStep === "verifying") && <Loader2 className="h-4 w-4 animate-spin" />}
                {depositStep === "idle" && <ArrowDownCircle className="h-4 w-4" />}
                {depositStep === "idle" && "Deposit USDT"}
                {depositStep === "approving" && "Approving USDT..."}
                {depositStep === "depositing" && "Depositing to vault..."}
                {depositStep === "verifying" && "Verifying on-chain..."}
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
