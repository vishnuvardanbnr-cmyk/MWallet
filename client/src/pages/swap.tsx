import { useState, useEffect, useCallback, useRef } from "react";
import { ArrowDownUp, Loader2, Bitcoin, DollarSign, RefreshCw, CheckCircle2, AlertCircle, ExternalLink, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

interface SwapPageProps {
  account: string;
  formatAmount: (val: bigint) => string;
  tokenDecimals: number;
  fetchUserData: () => Promise<void>;
}

interface BtcSwapData {
  balance: string;
  totalEarned: string;
  totalSwapped: string;
  history: BtcSwapTxn[];
}

interface BtcSwapTxn {
  id: number;
  walletAddress: string;
  amountUsdt: string;
  amountBtcb: string | null;
  bscTxHash: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: string;
}

const BSC_SCAN = "https://bscscan.com/tx/";
const MIN_SWAP = 10;

export default function SwapPage({ account, fetchUserData }: SwapPageProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [swapping, setSwapping] = useState(false);
  const [swapData, setSwapData] = useState<BtcSwapData>({
    balance: "0",
    totalEarned: "0",
    totalSwapped: "0",
    history: [],
  });
  const [swapAmount, setSwapAmount] = useState("");
  const [btcPrice, setBtcPrice] = useState<number | null>(null);
  const [pendingTxnId, setPendingTxnId] = useState<number | null>(null);
  const [pendingStatus, setPendingStatus] = useState<"pending" | "completed" | "failed" | null>(null);
  const [completedTxn, setCompletedTxn] = useState<BtcSwapTxn | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [syncing, setSyncing] = useState(false);

  const syncRewards = useCallback(async (silent = false) => {
    setSyncing(true);
    try {
      const res = await fetch(`/api/btcswap/sync/${account.toLowerCase()}`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setSwapData({ balance: data.balance, totalEarned: data.totalEarned, totalSwapped: data.totalSwapped, history: data.history });
        if (!silent && data.synced && parseFloat(data.newCredits) > 0) {
          toast({ title: "Rewards synced!", description: `$${parseFloat(data.newCredits).toFixed(4)} USDT in new board rewards credited to your BTC swap balance.` });
        }
      }
    } catch {}
    setSyncing(false);
    setLoading(false);
  }, [account, toast]);

  const fetchBtcPrice = useCallback(async () => {
    try {
      const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd");
      const data = await res.json();
      if (data?.bitcoin?.usd) setBtcPrice(data.bitcoin.usd);
    } catch {}
  }, []);

  useEffect(() => {
    syncRewards(true);
    fetchBtcPrice();
    const interval = setInterval(fetchBtcPrice, 30000);
    return () => clearInterval(interval);
  }, [syncRewards, fetchBtcPrice]);

  const startPolling = useCallback((txnId: number) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/btcswap/txn/${txnId}`);
        if (!res.ok) return;
        const txn: BtcSwapTxn = await res.json();
        if (txn.status === "completed") {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setPendingStatus("completed");
          setCompletedTxn(txn);
          setSwapping(false);
          await syncRewards(true);
          await fetchUserData();
          toast({ title: "Swap Successful!", description: `${parseFloat(txn.amountBtcb ?? "0").toFixed(8)} BTCB sent to your wallet on BSC.` });
        } else if (txn.status === "failed") {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setPendingStatus("failed");
          setCompletedTxn(txn);
          setSwapping(false);
          await syncRewards(true);
          toast({ title: "Swap Failed", description: txn.errorMessage || "Please try again.", variant: "destructive" });
        }
      } catch {}
    }, 4000);
  }, [syncRewards, fetchUserData, toast]);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const handleSwap = async () => {
    const amount = parseFloat(swapAmount);
    if (isNaN(amount) || amount < MIN_SWAP) {
      toast({ title: "Invalid Amount", description: `Minimum swap is $${MIN_SWAP}.`, variant: "destructive" });
      return;
    }
    const available = parseFloat(swapData.balance);
    if (amount > available) {
      toast({ title: "Insufficient Balance", description: "Swap amount exceeds your virtual BTC balance.", variant: "destructive" });
      return;
    }

    setSwapping(true);
    setPendingStatus("pending");
    setCompletedTxn(null);

    try {
      const res = await fetch("/api/btcswap/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: account, amountUsdt: amount.toString() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Swap Failed", description: data.message, variant: "destructive" });
        setSwapping(false);
        setPendingStatus(null);
        return;
      }
      setPendingTxnId(data.txnId);
      setSwapAmount("");
      startPolling(data.txnId);
    } catch {
      toast({ title: "Network Error", description: "Could not connect to swap service.", variant: "destructive" });
      setSwapping(false);
      setPendingStatus(null);
    }
  };

  const estimatedBtcb = btcPrice && parseFloat(swapAmount) > 0
    ? (parseFloat(swapAmount) / btcPrice).toFixed(8)
    : null;

  const balance = parseFloat(swapData.balance);
  const totalEarned = parseFloat(swapData.totalEarned);
  const totalSwapped = parseFloat(swapData.totalSwapped);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-xl gradient-icon flex items-center justify-center pulse-glow">
            <Loader2 className="w-6 h-6 animate-spin text-yellow-300" />
          </div>
          <p className="text-sm text-muted-foreground">Loading swap data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }} data-testid="text-swap-title">
          BTC Swap
        </h1>
        <p className="text-sm text-muted-foreground">
          Convert your board pool rewards to BTCB via PancakeSwap on BSC
        </p>
        <button
          onClick={() => syncRewards(false)}
          disabled={syncing}
          className="inline-flex items-center gap-1.5 text-xs text-yellow-300 hover:text-yellow-200 transition-colors disabled:opacity-50"
          data-testid="button-sync-rewards"
        >
          <RefreshCw className={`w-3 h-3 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing rewards..." : "Sync board rewards"}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="premium-card rounded-xl p-3 text-center" data-testid="card-virtual-balance">
          <DollarSign className="w-5 h-5 mx-auto text-emerald-400 mb-1" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Available</p>
          <p className="text-sm font-bold gradient-text" style={{ fontFamily: "var(--font-display)" }} data-testid="text-virtual-balance">
            ${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className="premium-card rounded-xl p-3 text-center" data-testid="card-total-earned">
          <DollarSign className="w-5 h-5 mx-auto text-amber-400 mb-1" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Total Earned</p>
          <p className="text-sm font-bold text-amber-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-total-earned">
            ${totalEarned.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className="premium-card rounded-xl p-3 text-center" data-testid="card-total-swapped">
          <Bitcoin className="w-5 h-5 mx-auto text-orange-400 mb-1" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Swapped (USDT)</p>
          <p className="text-sm font-bold text-orange-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-total-swapped">
            ${totalSwapped.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {btcPrice && (
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground" data-testid="text-btc-price">
          <Bitcoin className="w-3.5 h-3.5 text-orange-400" />
          <span>1 BTC = ${btcPrice.toLocaleString()}</span>
          <button onClick={fetchBtcPrice} className="text-yellow-300 hover:text-yellow-200 transition-colors" data-testid="button-refresh-price">
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Swap Card */}
      <div className="premium-card rounded-2xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>Swap</h2>

        <div className="space-y-1">
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
            <p className="text-xs text-muted-foreground mb-2">You Pay (Virtual USDT)</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={swapAmount}
                onChange={(e) => setSwapAmount(e.target.value)}
                placeholder="0.00"
                min={MIN_SWAP}
                className="flex-1 bg-transparent text-xl font-bold text-foreground outline-none placeholder:text-muted-foreground/30"
                style={{ fontFamily: "var(--font-display)" }}
                data-testid="input-swap-amount"
                disabled={swapping}
              />
              <button
                onClick={() => setSwapAmount(balance.toFixed(2))}
                className="text-[10px] text-yellow-300 hover:text-yellow-200 font-semibold uppercase tracking-wider px-2 py-1 rounded-md bg-yellow-600/10 hover:bg-yellow-600/15 transition-colors shrink-0"
                data-testid="button-max-amount"
              >
                MAX
              </button>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 shrink-0">
                <DollarSign className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-bold text-emerald-400">USDT</span>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              Balance: ${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · Min: ${MIN_SWAP}
            </p>
          </div>

          <div className="flex justify-center -my-1.5 relative z-10">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-yellow-600/20 to-amber-400/10 border border-white/[0.08] flex items-center justify-center">
              <ArrowDownUp className="w-4 h-4 text-yellow-300" />
            </div>
          </div>

          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">You Receive (Estimated)</span>
            </div>
            <div className="flex items-center gap-3">
              <p className="flex-1 text-xl font-bold text-orange-400" style={{ fontFamily: "var(--font-display)" }} data-testid="text-estimated-btcb">
                {estimatedBtcb ?? "0.00000000"}
              </p>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20">
                <Bitcoin className="w-4 h-4 text-orange-400" />
                <span className="text-sm font-bold text-orange-400">BTCB</span>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Sent to your BSC wallet · Live rate via PancakeSwap</p>
          </div>
        </div>

        {/* Pending / result status */}
        {pendingStatus === "pending" && (
          <div className="flex items-center gap-2.5 p-3 rounded-xl border bg-amber-500/10 border-amber-500/20" data-testid="status-pending">
            <Loader2 className="h-4 w-4 text-amber-400 shrink-0 animate-spin" />
            <p className="text-sm font-medium text-amber-400">Swap in progress — executing on BSC via PancakeSwap…</p>
          </div>
        )}
        {pendingStatus === "completed" && completedTxn && (
          <div className="flex flex-col gap-2 p-3 rounded-xl border bg-emerald-500/10 border-emerald-500/20" data-testid="status-completed">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <p className="text-sm font-medium text-emerald-400">
                Swap complete! {parseFloat(completedTxn.amountBtcb ?? "0").toFixed(8)} BTCB sent to your wallet.
              </p>
            </div>
            {completedTxn.bscTxHash && (
              <a
                href={`${BSC_SCAN}${completedTxn.bscTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[11px] text-yellow-300 hover:text-yellow-200"
                data-testid="link-bscscan"
              >
                <ExternalLink className="h-3 w-3" /> View on BscScan
              </a>
            )}
          </div>
        )}
        {pendingStatus === "failed" && completedTxn && (
          <div className="flex items-center gap-2.5 p-3 rounded-xl border bg-red-500/10 border-red-500/20" data-testid="status-failed">
            <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
            <p className="text-sm font-medium text-red-400">{completedTxn.errorMessage || "Swap failed. Please try again."}</p>
          </div>
        )}

        <button
          onClick={handleSwap}
          disabled={swapping || !swapAmount || parseFloat(swapAmount) < MIN_SWAP || balance === 0}
          className="w-full glow-button text-white font-bold py-4 px-6 rounded-xl text-base transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ fontFamily: "var(--font-display)" }}
          data-testid="button-swap"
        >
          {swapping ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Swapping on BSC…</>
          ) : (
            <><ArrowDownUp className="w-5 h-5" /> Swap to BTC</>
          )}
        </button>
      </div>

      {/* Swap History */}
      {swapData.history.length > 0 && (
        <div className="premium-card rounded-2xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>Swap History</h2>
          <div className="space-y-2">
            {swapData.history.map((txn) => (
              <div key={txn.id} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]" data-testid={`row-swap-${txn.id}`}>
                <div className="flex items-center gap-3">
                  {txn.status === "completed" ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : txn.status === "failed" ? (
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  ) : (
                    <Clock className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
                  )}
                  <div>
                    <p className="text-xs font-medium">${parseFloat(txn.amountUsdt).toFixed(2)} USDT</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(txn.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                </div>
                <div className="text-right flex items-center gap-2">
                  {txn.amountBtcb && (
                    <p className="text-xs font-bold text-orange-400">{parseFloat(txn.amountBtcb).toFixed(8)} BTC</p>
                  )}
                  <Badge
                    className={
                      txn.status === "completed"
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]"
                        : txn.status === "failed"
                        ? "bg-red-500/10 text-red-400 border-red-500/20 text-[10px]"
                        : "bg-amber-500/10 text-amber-400 border-amber-500/20 text-[10px]"
                    }
                  >
                    {txn.status}
                  </Badge>
                  {txn.bscTxHash && (
                    <a href={`${BSC_SCAN}${txn.bscTxHash}`} target="_blank" rel="noopener noreferrer" data-testid={`link-scan-${txn.id}`}>
                      <ExternalLink className="w-3 h-3 text-yellow-300 hover:text-yellow-200" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* How It Works */}
      <div className="premium-card rounded-2xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>How It Works</h2>
        <div className="space-y-3">
          {[
            { step: "1", title: "Earn Board Rewards", desc: "Complete Board Pool matrices to accumulate virtual USDT rewards on BSC Testnet" },
            { step: "2", title: "Sync Rewards", desc: "Click 'Sync board rewards' to pull your latest on-chain rewards into your swap balance" },
            { step: "3", title: "Enter Swap Amount", desc: `Choose how much to convert to BTC (minimum $${MIN_SWAP})` },
            { step: "4", title: "Receive BTCB on BSC", desc: "Our liquidity wallet swaps USDT → BTCB via PancakeSwap and sends it to your wallet" },
          ].map((item) => (
            <div key={item.step} className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-yellow-600/20 to-amber-400/10 border border-white/[0.08] flex items-center justify-center shrink-0">
                <span className="text-xs font-bold gradient-text">{item.step}</span>
              </div>
              <div>
                <p className="text-xs font-medium text-foreground">{item.title}</p>
                <p className="text-[10px] text-muted-foreground">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
