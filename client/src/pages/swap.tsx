import { useState, useEffect, useCallback } from "react";
import { ArrowDownUp, Loader2, Bitcoin, DollarSign, RefreshCw, AlertTriangle, CheckCircle2, ExternalLink, Settings2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getBoardHandlerContract, getPancakeRouterContract, TOKEN_ADDRESS, BTCB_TOKEN_ADDRESS, formatTokenAmount, BOARD_HANDLER_ADDRESS } from "@/lib/contract";
import { ethers } from "ethers";

interface SwapPageProps {
  account: string;
  formatAmount: (val: bigint) => string;
  tokenDecimals: number;
  fetchUserData: () => Promise<void>;
}

interface SwapState {
  virtualBalance: bigint;
  totalEarned: bigint;
  totalSwapped: bigint;
  btcbAddress: string;
  routerConfigured: boolean;
}

export default function SwapPage({ account, formatAmount, tokenDecimals, fetchUserData }: SwapPageProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [swapping, setSwapping] = useState(false);
  const [swapState, setSwapState] = useState<SwapState>({
    virtualBalance: 0n,
    totalEarned: 0n,
    totalSwapped: 0n,
    btcbAddress: "",
    routerConfigured: false,
  });
  const [swapAmount, setSwapAmount] = useState("");
  const [estimatedBtcb, setEstimatedBtcb] = useState<string | null>(null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [btcPrice, setBtcPrice] = useState<number | null>(null);
  const [slippage, setSlippage] = useState(2);
  const [showSettings, setShowSettings] = useState(false);

  const loadSwapData = useCallback(async () => {
    setLoading(true);
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const boardHandler = getBoardHandlerContract(provider);

      const [balanceResult, totalSwapped] = await Promise.all([
        boardHandler.getVirtualRewardBalance(account),
        boardHandler.getTotalSwappedToBTC(account),
      ]);

      let btcbAddr = BTCB_TOKEN_ADDRESS;
      let routerOk = false;
      try {
        btcbAddr = await boardHandler.btcbToken();
        const routerAddr = await boardHandler.pancakeRouter();
        routerOk = routerAddr !== ethers.ZeroAddress && btcbAddr !== ethers.ZeroAddress;
      } catch {
        routerOk = false;
      }

      setSwapState({
        virtualBalance: balanceResult[0],
        totalEarned: balanceResult[1],
        totalSwapped,
        btcbAddress: btcbAddr,
        routerConfigured: routerOk,
      });
    } catch (err) {
      console.error("loadSwapData error:", err);
    } finally {
      setLoading(false);
    }
  }, [account]);

  const fetchBtcPrice = useCallback(async () => {
    try {
      const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd");
      const data = await res.json();
      if (data?.bitcoin?.usd) {
        setBtcPrice(data.bitcoin.usd);
      }
    } catch {
      setBtcPrice(null);
    }
  }, []);

  useEffect(() => {
    loadSwapData();
    fetchBtcPrice();
    const interval = setInterval(fetchBtcPrice, 30000);
    return () => clearInterval(interval);
  }, [loadSwapData, fetchBtcPrice]);

  const fetchEstimate = useCallback(async (amount: string) => {
    if (!amount || parseFloat(amount) <= 0) {
      setEstimatedBtcb(null);
      return;
    }

    if (!swapState.routerConfigured) {
      if (btcPrice && btcPrice > 0) {
        const usdtVal = parseFloat(amount);
        const btcVal = usdtVal / btcPrice;
        setEstimatedBtcb(btcVal.toFixed(8));
      }
      return;
    }

    setEstimateLoading(true);
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const boardHandler = getBoardHandlerContract(provider);
      const amountWei = ethers.parseUnits(amount, tokenDecimals);
      const estimate = await boardHandler.getSwapEstimate(amountWei);
      setEstimatedBtcb(ethers.formatUnits(estimate, 18));
    } catch {
      if (btcPrice && btcPrice > 0) {
        const usdtVal = parseFloat(amount);
        const btcVal = usdtVal / btcPrice;
        setEstimatedBtcb(btcVal.toFixed(8));
      } else {
        setEstimatedBtcb(null);
      }
    } finally {
      setEstimateLoading(false);
    }
  }, [swapState.routerConfigured, btcPrice, tokenDecimals]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (swapAmount) fetchEstimate(swapAmount);
    }, 500);
    return () => clearTimeout(timer);
  }, [swapAmount, fetchEstimate]);

  const handleSwap = async () => {
    if (!swapAmount || parseFloat(swapAmount) <= 0) {
      toast({ title: "Invalid Amount", description: "Enter a valid swap amount.", variant: "destructive" });
      return;
    }

    const amountWei = ethers.parseUnits(swapAmount, tokenDecimals);
    if (amountWei > swapState.virtualBalance) {
      toast({ title: "Insufficient Balance", description: "Swap amount exceeds your virtual reward balance.", variant: "destructive" });
      return;
    }

    if (!swapState.routerConfigured) {
      toast({ title: "Router Not Configured", description: "PancakeSwap router is not set up yet. Contact admin.", variant: "destructive" });
      return;
    }

    setSwapping(true);
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const boardHandler = getBoardHandlerContract(signer);

      let minOut = 0n;
      try {
        const estimate = await boardHandler.getSwapEstimate(amountWei);
        minOut = (estimate * BigInt(10000 - slippage * 100)) / 10000n;
      } catch {
        minOut = 0n;
      }

      const tx = await boardHandler.claimAndSwapToBTC(amountWei, minOut);
      await tx.wait();

      toast({ title: "Swap Successful!", description: `Swapped ${swapAmount} USDT to BTC successfully.` });
      setSwapAmount("");
      setEstimatedBtcb(null);
      await loadSwapData();
      await fetchUserData();
    } catch (err: any) {
      const msg = err?.reason || err?.message || "Swap failed";
      toast({ title: "Swap Failed", description: msg, variant: "destructive" });
    } finally {
      setSwapping(false);
    }
  };

  const setMaxAmount = () => {
    const maxVal = formatTokenAmount(swapState.virtualBalance, tokenDecimals);
    setSwapAmount(maxVal);
  };

  const balanceFormatted = parseFloat(formatTokenAmount(swapState.virtualBalance, tokenDecimals));
  const totalEarnedFormatted = parseFloat(formatTokenAmount(swapState.totalEarned, tokenDecimals));
  const totalSwappedFormatted = parseFloat(formatTokenAmount(swapState.totalSwapped, 18));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-xl gradient-icon flex items-center justify-center pulse-glow">
            <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
          </div>
          <p className="text-sm text-muted-foreground">Loading swap data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold gradient-text" style={{ fontFamily: 'var(--font-display)' }} data-testid="text-swap-title">
          BTC Swap
        </h1>
        <p className="text-sm text-muted-foreground">
          Convert your virtual USDT rewards to BTC via PancakeSwap
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="premium-card rounded-xl p-3 text-center" data-testid="card-virtual-balance">
          <DollarSign className="w-5 h-5 mx-auto text-emerald-400 mb-1" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Available</p>
          <p className="text-sm font-bold gradient-text" style={{ fontFamily: 'var(--font-display)' }} data-testid="text-virtual-balance">
            ${balanceFormatted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className="premium-card rounded-xl p-3 text-center" data-testid="card-total-earned">
          <DollarSign className="w-5 h-5 mx-auto text-amber-400 mb-1" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Total Earned</p>
          <p className="text-sm font-bold text-amber-400" style={{ fontFamily: 'var(--font-display)' }} data-testid="text-total-earned">
            ${totalEarnedFormatted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className="premium-card rounded-xl p-3 text-center" data-testid="card-total-swapped">
          <Bitcoin className="w-5 h-5 mx-auto text-orange-400 mb-1" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Swapped</p>
          <p className="text-sm font-bold text-orange-400" style={{ fontFamily: 'var(--font-display)' }} data-testid="text-total-swapped">
            {totalSwappedFormatted.toFixed(8)} BTC
          </p>
        </div>
      </div>

      {btcPrice && (
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground" data-testid="text-btc-price">
          <Bitcoin className="w-3.5 h-3.5 text-orange-400" />
          <span>1 BTC = ${btcPrice.toLocaleString()}</span>
          <button onClick={fetchBtcPrice} className="text-purple-400 hover:text-purple-300 transition-colors" data-testid="button-refresh-price">
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      )}

      <div className="premium-card rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground" style={{ fontFamily: 'var(--font-display)' }}>Swap</h2>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-1.5 rounded-lg hover:bg-white/5 transition-colors text-muted-foreground hover:text-foreground"
            data-testid="button-swap-settings"
          >
            <Settings2 className="w-4 h-4" />
          </button>
        </div>

        {showSettings && (
          <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-3 space-y-2">
            <p className="text-xs text-muted-foreground">Slippage Tolerance</p>
            <div className="flex gap-2">
              {[1, 2, 3, 5].map((val) => (
                <button
                  key={val}
                  onClick={() => setSlippage(val)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    slippage === val
                      ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                      : "bg-white/[0.03] text-muted-foreground border border-white/[0.06] hover:border-white/[0.12]"
                  }`}
                  data-testid={`button-slippage-${val}`}
                >
                  {val}%
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1">
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">You Pay (Virtual USDT)</span>
              <button
                onClick={setMaxAmount}
                className="text-[10px] text-purple-400 hover:text-purple-300 font-medium uppercase tracking-wider"
                data-testid="button-max-amount"
              >
                MAX
              </button>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={swapAmount}
                onChange={(e) => setSwapAmount(e.target.value)}
                placeholder="0.00"
                className="flex-1 bg-transparent text-xl font-bold text-foreground outline-none placeholder:text-muted-foreground/30"
                style={{ fontFamily: 'var(--font-display)' }}
                data-testid="input-swap-amount"
              />
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <DollarSign className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-bold text-emerald-400">USDT</span>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Balance: ${balanceFormatted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>

          <div className="flex justify-center -my-1.5 relative z-10">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500/20 to-cyan-500/10 border border-white/[0.08] flex items-center justify-center">
              <ArrowDownUp className="w-4 h-4 text-purple-400" />
            </div>
          </div>

          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">You Receive (Estimated)</span>
              {estimateLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
            </div>
            <div className="flex items-center gap-3">
              <p className="flex-1 text-xl font-bold text-foreground" style={{ fontFamily: 'var(--font-display)' }} data-testid="text-estimated-btcb">
                {estimatedBtcb ? parseFloat(estimatedBtcb).toFixed(8) : "0.00000000"}
              </p>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20">
                <Bitcoin className="w-4 h-4 text-orange-400" />
                <span className="text-sm font-bold text-orange-400">BTC</span>
              </div>
            </div>
            {estimatedBtcb && btcPrice && (
              <p className="text-[10px] text-muted-foreground mt-1">
                ~ ${(parseFloat(estimatedBtcb) * btcPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
              </p>
            )}
          </div>
        </div>

        {swapAmount && parseFloat(swapAmount) > 0 && estimatedBtcb && (
          <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-3 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Rate</span>
              <span className="text-foreground" data-testid="text-swap-rate">
                1 USDT = {btcPrice ? (1 / btcPrice).toFixed(8) : "..."} BTC
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Slippage Tolerance</span>
              <span className="text-foreground">{slippage}%</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Min. Received</span>
              <span className="text-foreground" data-testid="text-min-received">
                {(parseFloat(estimatedBtcb) * (1 - slippage / 100)).toFixed(8)} BTC
              </span>
            </div>
          </div>
        )}

        {!swapState.routerConfigured && (
          <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 border border-amber-500/20 p-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-medium text-amber-400">PancakeSwap Router Not Configured</p>
              <p className="text-[10px] text-amber-400/70 mt-0.5">
                The admin needs to set the PancakeSwap router and BTCB token address on the contract before swaps can execute.
              </p>
            </div>
          </div>
        )}

        <button
          onClick={handleSwap}
          disabled={swapping || !swapAmount || parseFloat(swapAmount) <= 0 || swapState.virtualBalance === 0n || !swapState.routerConfigured}
          className="w-full glow-button text-white font-bold py-4 px-6 rounded-xl text-base transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ fontFamily: 'var(--font-display)' }}
          data-testid="button-swap"
        >
          {swapping ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Swapping...
            </>
          ) : (
            <>
              <ArrowDownUp className="w-5 h-5" />
              Swap to BTC
            </>
          )}
        </button>
      </div>

      <div className="premium-card rounded-2xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground" style={{ fontFamily: 'var(--font-display)' }}>How It Works</h2>
        <div className="space-y-3">
          {[
            { step: "1", title: "Earn Virtual Rewards", desc: "Complete Board Pool matrices to accumulate virtual USDT rewards" },
            { step: "2", title: "Enter Swap Amount", desc: "Choose how much of your virtual balance to convert to BTC" },
            { step: "3", title: "On-Chain Swap", desc: "PancakeSwap converts your USDT to BTCB at live market rate" },
            { step: "4", title: "Receive BTC", desc: "BTCB (Bitcoin on BSC) is sent directly to your wallet" },
          ].map((item) => (
            <div key={item.step} className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500/20 to-cyan-500/10 border border-white/[0.08] flex items-center justify-center shrink-0">
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
