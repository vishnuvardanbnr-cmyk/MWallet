import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import {
  getMvaultContract, getTokenContract,
  MVAULT_CONTRACT_ADDRESS, TOKEN_ADDRESS,
  NETWORK, formatTokenAmount, getDirectProvider,
} from "@/lib/contract";

// ── Type definitions ──────────────────────────────────────────────────────────

export interface UserInfo {
  isRegistered: boolean;
  isActive: boolean;
  sponsor: string;
  directCount: bigint;
  binaryParent: string;
  placedLeft: boolean;
  leftChild: string;
  rightChild: string;
  leftSubUsers: bigint;
  rightSubUsers: bigint;
  mvtBalance: bigint;
  totalReceived: bigint;
  totalSold: bigint;
  incomeLimit: bigint;
  incomeLimitCap: bigint;   // max income for this user's package (3× packagePrice)
  packagePrice: bigint;     // activation price paid: 55e18 (Starter) or 130e18 (Pro)
  usdtBalance: bigint;
  rebirthPool: bigint;
  btcPoolBalance: bigint;
  mainAccount: string;
  rebirthCount: bigint;
  joinedAt: bigint;
  rank: number;             // 0=Unranked 1=M1 2=M2 3=M3 4=M4 5=M5
  teamSalesUsdt: bigint;    // total team sales USDT (used for rank)
}

export interface MvtPrice {
  buyPrice: bigint;
  sellPrice: bigint;
}

export interface BinaryPairs {
  currentPairs: bigint;
  newPairs: bigint;
}

export interface ProfileOnChain {
  displayName: string;
  email: string;
  phone: string;
  country: string;
  profileSet: boolean;
}

// ── Legacy types kept for pages that haven't been migrated ────────────────────
export interface IncomeInfo {
  totalDirectIncome: bigint;
  totalBinaryIncome: bigint;
  totalMatchingOverrideIncome: bigint;
  totalWithdrawalMatchIncome: bigint;
  totalEarnings: bigint;
  totalWithdrawn: bigint;
  maxIncome: bigint;
}

export interface BinaryInfo {
  leftBusiness: bigint;
  rightBusiness: bigint;
  carryLeft: bigint;
  carryRight: bigint;
  todayBinaryIncome: bigint;
  dailyCap: bigint;
  claimableBinaryIncome: bigint;
  binaryDepth: bigint;
}

export interface SlabInfo {
  carryLeftSlabs: bigint[];
  carryRightSlabs: bigint[];
  matchableSlabs: bigint[];
  potentialIncomeSlabs: bigint[];
  rates: bigint[];
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useWeb3() {
  const [account, setAccount] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [mvtPrice, setMvtPrice] = useState<MvtPrice>({ buyPrice: 0n, sellPrice: 0n });
  const [binaryPairs, setBinaryPairs] = useState<BinaryPairs>({ currentPairs: 0n, newPairs: 0n });
  const [btcPoolBalance, setBtcPoolBalance] = useState<bigint>(0n);
  const [totalUsers, setTotalUsers] = useState<number>(0);
  const [profileOnChain, setProfileOnChain] = useState<ProfileOnChain | null>(null);
  const [contractMvtBalance, setContractMvtBalance] = useState<bigint>(0n);
  const tokenDecimals = 18;

  const getProvider = useCallback(() => {
    if (!(window as any).ethereum) throw new Error("MetaMask not installed");
    return new ethers.BrowserProvider((window as any).ethereum);
  }, []);

  const getSigner = useCallback(async () => {
    const provider = getProvider();
    return await provider.getSigner();
  }, [getProvider]);

  const switchNetwork = useCallback(async () => {
    const ethereum = (window as any).ethereum;
    if (!ethereum) return;
    // Always call addEthereumChain — this adds it if new, or updates the RPC
    // if already added, ensuring MetaMask uses our reliable publicnode endpoint.
    try {
      await ethereum.request({ method: "wallet_addEthereumChain", params: [NETWORK] });
    } catch (addErr: any) {
      // addEthereumChain fails when user rejects; fall back to plain switch
      try {
        await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: NETWORK.chainId }] });
      } catch { /* ignore */ }
    }
  }, []);

  const fetchUserData = useCallback(async (addr?: string) => {
    const address = addr || account;
    if (!address) return;
    setLoading(true);
    try {
      // Always use direct RPC provider (publicnode) for reads — avoids MetaMask
      // cache which can return stale state immediately after a tx is confirmed.
      const provider = getDirectProvider();
      const contract = getMvaultContract(provider);

      // Total users
      let total = 0;
      try { total = Number(await contract.totalUsers()); } catch { }
      setTotalUsers(total);

      // users() auto-getter replaces getUserInfo
      let info: any;
      try {
        info = await contract.users(address);
      } catch (e) {
        console.error("users() failed:", e);
        setIsRegistered(false);
        setUserInfo(null);
        return;
      }

      const ui: UserInfo = {
        isRegistered:    info.isRegistered,
        isActive:        info.isActive,
        sponsor:         info.sponsor,
        directCount:     info.directCount,
        binaryParent:    info.binaryParent,
        placedLeft:      info.placedLeft,
        leftChild:       info.leftChild,
        rightChild:      info.rightChild,
        leftSubUsers:    info.leftSubVolume,
        rightSubUsers:   info.rightSubVolume,
        mvtBalance:      info.mvtBalance,
        totalReceived:   info.totalReceived,
        totalSold:       info.totalSold,
        incomeLimit:     info.incomeLimit,
        incomeLimitCap:  info.incomeLimitCap  ?? 390n * 10n ** 18n,
        packagePrice:    info.packagePrice    ?? 130n * 10n ** 18n,
        usdtBalance:     info.usdtBalance,
        rebirthPool:     info.rebirthPool,
        btcPoolBalance:  info.btcPoolBalance,
        mainAccount:     info.mainAccount,
        rebirthCount:    info.rebirthCount,
        joinedAt:        info.joinedAt,
        rank:            Number(info.rank ?? 0),
        teamSalesUsdt:   info.teamSalesUsdt ?? 0n,
      };

      setIsRegistered(ui.isRegistered);
      setUserInfo(ui);
      setBtcPoolBalance(ui.btcPoolBalance);

      if (ui.isRegistered) {
        // MVT price
        try {
          const [bp, sp] = await contract.getMvtPrice();
          setMvtPrice({ buyPrice: bp, sellPrice: sp });
        } catch { }

        // Binary sub-volumes (placement tree — no matching, just leg volumes)
        try {
          const u = info; // already fetched above
          setBinaryPairs({
            currentPairs: u.leftSubVolume ?? 0n,
            newPairs:     u.rightSubVolume ?? 0n,
          });
        } catch { }

        // MVT ERC20 tokens held by the contract (from mvaultToken address)
        try {
          const mvtAddr = await contract.mvaultToken();
          const { ethers: e } = await import("ethers");
          const mvt = new e.Contract(mvtAddr, ["function balanceOf(address) view returns (uint256)"], provider);
          const bal = await mvt.balanceOf(MVAULT_CONTRACT_ADDRESS);
          setContractMvtBalance(bal);
        } catch { }

        // Profile from new MvaultContract (on-chain)
        try {
          const [displayName, email, phone, country, profileSet] = await contract.getProfile(address);
          setProfileOnChain({ displayName, email, phone, country, profileSet });
        } catch {
          setProfileOnChain(null);
        }
      }
    } catch (err) {
      console.error("fetchUserData error:", err);
    } finally {
      setLoading(false);
      setInitialLoaded(true);
    }
  }, [account]);

  // ── Post-tx refresh ─────────────────────────────────────────────────────────
  // Fires immediately AND again after 2 s so the RPC has time to index the new
  // block.  The instant call gives near-instant UI feedback; the delayed call
  // guarantees the displayed values are always the fully-confirmed on-chain state.
  const refreshAfterTx = useCallback(async (addr?: string) => {
    fetchUserData(addr);                                   // fire immediately
    await new Promise(r => setTimeout(r, 2_000));
    fetchUserData(addr);                                   // confirm fresh state
  }, [fetchUserData]);

  // ── Connection ──────────────────────────────────────────────────────────────

  const connect = useCallback(async () => {
    try {
      await switchNetwork();
      const provider = getProvider();
      const accounts = await provider.send("eth_requestAccounts", []);
      if (accounts.length > 0) {
        setAccount(accounts[0]);
        await fetchUserData(accounts[0]);
      }
    } catch (err) {
      console.error("Connect error:", err);
    }
  }, [switchNetwork, getProvider, fetchUserData]);

  // ── Registration (address-based) ────────────────────────────────────────────
  // MetaMask's built-in RPC often returns "Internal JSON-RPC error" without any
  // revert reason (eth_estimateGas is unreliable on BSC testnet).
  // Strategy:
  //   1. Simulate via a direct JsonRpcProvider (publicnode, not MetaMask) so we
  //      get proper revert data from eth_call
  //   2. If simulation passes, send through MetaMask with a fixed gasLimit to
  //      skip eth_estimateGas entirely
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  const register = useCallback(async (sponsor: string, _binaryParent: string, placeLeft: boolean) => {
    const signer = await getSigner();
    // The contract now handles placement on-chain via _findSlotOnSide.
    // Always pass ZERO_ADDRESS as binaryParent → contract defaults to sponsor and
    // walks the tree to find the deepest open slot on the requested side.
    // Step 1 — simulate via direct RPC to catch any revert reason before sending
    const directProvider = getDirectProvider();
    const signerAddress = await signer.getAddress();
    const simContract = getMvaultContract(directProvider);
    await simContract.register.staticCall(sponsor, ZERO_ADDRESS, placeLeft, { from: signerAddress });
    // Step 2 — send through MetaMask with fixed gasLimit (bypasses eth_estimateGas)
    const sendContract = getMvaultContract(signer);
    const tx = await sendContract.register(sponsor, ZERO_ADDRESS, placeLeft, { gasLimit: 600_000n });
    await tx.wait();
    await refreshAfterTx();
  }, [getSigner, refreshAfterTx]);

  // ── USDT approval for MvaultContract ───────────────────────────────────────

  const approveToken = useCallback(async (_amount?: string) => {
    const signer = await getSigner();
    const token = getTokenContract(signer);
    const signerAddress = await signer.getAddress();
    const currentAllowance = await token.allowance(signerAddress, MVAULT_CONTRACT_ADDRESS);
    const needed = _amount ? ethers.parseUnits(_amount, tokenDecimals) : 0n;
    if (currentAllowance >= needed && needed > 0n) return;
    const tx = await token.approve(MVAULT_CONTRACT_ADDRESS, ethers.MaxUint256);
    await tx.wait();
  }, [getSigner, tokenDecimals]);

  // ── Activation ($130 USDT, no package selection) ───────────────────────────

  // Notify server after any activation so it can refresh the DB snapshot
  // and trigger rank evaluation immediately (replaces the 30s BSC poller).
  const notifyActivation = useCallback(async (activatedAddress: string) => {
    try {
      await fetch("/api/activation/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: activatedAddress }),
      });
    } catch {
      // non-critical — rank check will still run on the 24h cycle
    }
  }, []);

  const activatePackage = useCallback(async (_pkg?: number) => {
    const signer = await getSigner();
    const contract = getMvaultContract(signer);
    const pkg = _pkg ?? 2; // default PRO ($130)
    const tx = await contract.activate(pkg);
    await tx.wait();
    await refreshAfterTx();
    if (account) notifyActivation(account);
  }, [getSigner, refreshAfterTx, account, notifyActivation]);

  // ── Sell virtual MVT → USDT (stays in contract) ────────────────────────────

  const sellMvt = useCallback(async (amount: string) => {
    const signer = await getSigner();
    const contract = getMvaultContract(signer);
    const parsed = ethers.parseUnits(amount, tokenDecimals);
    const tx = await contract.sellMvt(parsed);
    await tx.wait();
    await refreshAfterTx();
  }, [getSigner, tokenDecimals, refreshAfterTx]);

  // ── Withdraw USDT balance → wallet ─────────────────────────────────────────

  const withdrawFunds = useCallback(async (amount: string) => {
    const signer = await getSigner();
    const contract = getMvaultContract(signer);
    const parsed = ethers.parseUnits(amount, tokenDecimals);
    const tx = await contract.withdrawUsdt(parsed);
    await tx.wait();
    await refreshAfterTx();
  }, [getSigner, tokenDecimals, refreshAfterTx]);

  // ── Withdraw BTC pool balance → wallet ─────────────────────────────────────

  const withdrawBtcPool = useCallback(async (amount: string) => {
    const signer = await getSigner();
    const contract = getMvaultContract(signer);
    const parsed = ethers.parseUnits(amount, tokenDecimals);
    const tx = await contract.withdrawBtcPool(parsed);
    await tx.wait();
    await refreshAfterTx();
  }, [getSigner, tokenDecimals, refreshAfterTx]);

  // ── Rebirth (create sub-account) ───────────────────────────────────────────

  const rebirth = useCallback(async (subAccount: string, placeLeft: boolean) => {
    const signer = await getSigner();
    const contract = getMvaultContract(signer);
    const tx = await contract.rebirth(subAccount, placeLeft);
    await tx.wait();
    await refreshAfterTx();
  }, [getSigner, refreshAfterTx]);

  const claimRebirthBalance = useCallback(async () => {
    const signer = await getSigner();
    const contract = getMvaultContract(signer);
    const tx = await contract.claimRebirthBalance();
    await tx.wait();
    await refreshAfterTx();
  }, [getSigner, refreshAfterTx]);

  // ── Profile (on-chain via MvaultContract) ──────────────────────────────────

  const saveProfileOnChain = useCallback(async (
    displayName: string, email: string, phone: string, country: string,
  ) => {
    if (!account) return;
    const signer = await getSigner();
    const contract = getMvaultContract(signer);
    const tx = await contract.setProfile(displayName, email, phone, country);
    await tx.wait();
    setProfileOnChain({ displayName, email, phone, country, profileSet: true });
  }, [account, getSigner]);

  // ── Direct referrals (via Registered events filtered by sponsor == account) ───
  const getDirectReferrals = useCallback(async (offset: number, limit: number) => {
    if (!account) return { referrals: [], total: 0 };
    const tryQuery = async (provider: ethers.Provider, fromBlock: number | "earliest", toBlock: number | "latest") => {
      const contract = getMvaultContract(provider);
      const filter = contract.filters.Registered(null, account);
      return await contract.queryFilter(filter, fromBlock, toBlock);
    };
    try {
      // Try direct provider first (avoids MetaMask proxy limitations)
      let events: any[];
      const directProvider = getDirectProvider();
      try {
        events = await tryQuery(directProvider, 0, "latest");
      } catch {
        // Fall back to recent block range (last 200,000 blocks ≈ ~7 days on BSC)
        try {
          const currentBlock = await directProvider.getBlockNumber();
          events = await tryQuery(directProvider, Math.max(0, currentBlock - 200_000), currentBlock);
        } catch {
          // Last resort: use MetaMask provider
          const mmProvider = getProvider();
          const currentBlock = await mmProvider.getBlockNumber();
          events = await tryQuery(mmProvider, Math.max(0, currentBlock - 200_000), currentBlock);
        }
      }
      const allAddresses = events.map((e: any) => (e.args?.[0] ?? e.args?.user) as string).filter(Boolean).reverse();
      const total = allAddresses.length;
      const referrals = allAddresses.slice(offset, offset + limit);
      return { referrals, total };
    } catch (err) {
      console.error("getDirectReferrals error:", err);
      return { referrals: [], total: 0 };
    }
  }, [account, getProvider]);

  // ── Transactions (from on-chain events) ────────────────────────────────────

  const getTransactionsFromContract = useCallback(async (offset: number, limit: number) => {
    if (!account) return { transactions: [], total: 0 };
    try {
      const provider = getProvider();
      const contract = getMvaultContract(provider);

      // TX_META: type 0-11 from on-chain _recordTx
      const TX_META: Record<number, { type: string; isIncome: boolean; currency: "USDT" | "MVT"; detail: (r: any) => string }> = {
        0:  { type: "Activation",          isIncome: false, currency: "USDT", detail: ()  => "$130 package activated" },
        1:  { type: "Level Income",         isIncome: true,  currency: "MVT",  detail: (r) => {
               const lvl = Number(r.level);
               const addr = r.addr as string;
               const short = addr && addr !== "0x0000000000000000000000000000000000000000" ? `${addr.slice(0,6)}...${addr.slice(-4)}` : "";
               return `Level ${lvl}${short ? ` from ${short}` : ""}`;
             }},
        2:  { type: "Level Income Missed",  isIncome: false, currency: "MVT",  detail: (r) => `Level ${Number(r.level)} — need more directs` },
        3:  { type: "Binary Income",        isIncome: true,  currency: "MVT",  detail: ()  => "Binary pairs matched" },
        4:  { type: "Power Leg Income",     isIncome: true,  currency: "MVT",  detail: ()  => "Power leg distribution" },
        5:  { type: "Sell MVT",             isIncome: false, currency: "USDT", detail: ()  => "MVT sold for USDT" },
        6:  { type: "BTC Pool Credited",    isIncome: true,  currency: "USDT", detail: ()  => "10% of sell → BTC pool" },
        7:  { type: "Withdrawal",           isIncome: false, currency: "USDT", detail: ()  => "USDT withdrawn to wallet" },
        8:  { type: "BTC Pool Withdraw",    isIncome: false, currency: "USDT", detail: ()  => "BTC pool withdrawn" },
        9:  { type: "Rebirth",              isIncome: false, currency: "USDT", detail: (r) => {
               const addr = r.addr as string;
               return addr && addr !== "0x0000000000000000000000000000000000000000" ? `Sub-account: ${addr.slice(0,6)}...${addr.slice(-4)}` : "Sub-account reborn";
             }},
        10: { type: "Board Entry",          isIncome: false, currency: "USDT", detail: (r) => `Entered Pool ${Number(r.level)}` },
        11: { type: "Board Reward",         isIncome: true,  currency: "USDT", detail: (r) => `Pool ${Number(r.level)} completed` },
        12: { type: "Staked",               isIncome: false, currency: "USDT", detail: ()  => "USDT staked for MVT" },
        13: { type: "Unstaked",             isIncome: true,  currency: "USDT", detail: ()  => "USDT credited from unstake" },
        14: { type: "Rebirth Claim",        isIncome: true,  currency: "USDT", detail: ()  => "Partial rebirth pool claimed to wallet" },
        15: { type: "Reactivation",         isIncome: false, currency: "USDT", detail: ()  => "Account reactivated" },
        16: { type: "Rank Income",          isIncome: true,  currency: "MVT",  detail: (r) => `Rank M${Number(r.level)} income` },
      };

      // Fetch stored TX records (includes Stake/Unstake since contract now records them)
      const [records, totalBn] = await contract.getTransactions(account, BigInt(offset), BigInt(limit));
      const total = Number(totalBn);

      const transactions = (records as any[]).map((r) => {
        const txType = Number(r.txType);
        const meta = TX_META[txType] ?? { type: "Unknown", isIncome: false, currency: "USDT" as const, detail: () => "" };
        const base: any = {
          type:      meta.type,
          amount:    BigInt(r.amount),
          detail:    meta.detail(r),
          timestamp: Number(r.ts),
          isIncome:  meta.isIncome,
          currency:  meta.currency,
        };
        // For sell transactions, try to extract MVT amount from r.level if stored
        if (txType === 5) {
          const lvlBn = r.level ? BigInt(r.level) : 0n;
          if (lvlBn > 0n) base.mvtAmount = lvlBn;
          // sellPrice can be inferred if we have both mvtAmount and usdtReceived
          if (lvlBn > 0n && BigInt(r.amount) > 0n) {
            // total USDT = amount / 0.9; sell price = totalUsdt / mvtAmount
            // we'll compute in UI instead; just pass what we have
          }
        }
        return base;
      });

      // Supplement with Staked/Unstaked events if no staking records found in stored TXs
      const hasStakingRecords = transactions.some(t => t.type === "Staked" || t.type === "Unstaked");
      if (!hasStakingRecords && offset === 0) {
        try {
          const currentBlock = await provider.getBlockNumber();
          const fromBlock = Math.max(0, currentBlock - 200_000);

          // Try to find Staked events
          const stakedFilter = contract.filters.Staked?.(account);
          const unstakedFilter = contract.filters.Unstaked?.(account);
          const [stakedEvts, unstakedEvts] = await Promise.all([
            stakedFilter ? contract.queryFilter(stakedFilter, fromBlock, currentBlock).catch(() => []) : Promise.resolve([]),
            unstakedFilter ? contract.queryFilter(unstakedFilter, fromBlock, currentBlock).catch(() => []) : Promise.resolve([]),
          ]);

          for (const evt of stakedEvts as any[]) {
            const block = await provider.getBlock(evt.blockNumber);
            // Event: Staked(address user, uint256 stakeIndex, uint256 usdtAmount, uint256 mvtMinted, bool isLocked)
            const isLocked = evt.args?.isLocked ?? false;
            transactions.unshift({
              type: "Staked",
              amount: evt.args?.usdtAmount ?? evt.args?.[2] ?? 0n,
              detail: isLocked ? "USDT staked for MVT (Locked)" : "USDT staked for MVT (Flexible)",
              timestamp: block?.timestamp ?? 0,
              isIncome: false,
              currency: "USDT",
              mvtMinted: evt.args?.mvtMinted ?? evt.args?.[3] ?? 0n,
            } as any);
          }
          for (const evt of unstakedEvts as any[]) {
            const block = await provider.getBlock(evt.blockNumber);
            // Event: Unstaked(address user, uint256 stakeIndex, uint256 mvtReturned, uint256 usdtReceived, uint256 adminCapCut)
            transactions.unshift({
              type: "Unstaked",
              amount: evt.args?.usdtReceived ?? evt.args?.[3] ?? 0n,
              detail: "USDT credited from unstake",
              timestamp: block?.timestamp ?? 0,
              isIncome: true,
              currency: "USDT",
              mvtReturned: evt.args?.mvtReturned ?? evt.args?.[2] ?? 0n,
            } as any);
          }
          // sort by timestamp desc
          transactions.sort((a, b) => b.timestamp - a.timestamp);
        } catch {
          // Staked/Unstaked events not available — continue without them
        }
      }

      return { transactions, total };
    } catch (err) {
      console.error("getTransactionsFromContract error:", err);
      return { transactions: [], total: 0 };
    }
  }, [account, getProvider]);

  // ── Board pool entry ────────────────────────────────────────────────────────

  const enterBoardPool = useCallback(async () => {
    const signer = await getSigner();
    const contract = getMvaultContract(signer);
    const tx = await contract.enterBoardPool();
    await tx.wait();
    await refreshAfterTx();
  }, [getSigner, refreshAfterTx]);

  const activateFromBalance = useCallback(async (_pkg?: number) => {
    const signer = await getSigner();
    const contract = getMvaultContract(signer);
    const pkg = _pkg ?? 2; // default PRO ($130)
    const tx = await contract.activateFromBalance(pkg);
    await tx.wait();
    await refreshAfterTx();
    if (account) notifyActivation(account);
  }, [getSigner, refreshAfterTx, account, notifyActivation]);

  const claimBinaryIncome = useCallback(async () => {}, []);
  const reactivatePackage = useCallback(async (_pkg: number) => {}, []);
  const repurchase = useCallback(async () => {}, []);
  const getBinaryFlushedEvents = useCallback(async () => [], []);

  const getTokenBalance = useCallback(async () => {
    if (!account) return "0";
    const provider = getProvider();
    const token = getTokenContract(provider);
    const bal = await token.balanceOf(account);
    return formatTokenAmount(bal, tokenDecimals);
  }, [account, getProvider, tokenDecimals]);

  // ── Incomeinfo / binaryinfo stubs (old pages compatibility) ────────────────
  const incomeInfo: IncomeInfo = {
    totalDirectIncome: 0n,
    totalBinaryIncome: userInfo?.mvtBalance ?? 0n,
    totalMatchingOverrideIncome: 0n,
    totalWithdrawalMatchIncome: 0n,
    totalEarnings: userInfo?.totalReceived ?? 0n,
    totalWithdrawn: userInfo?.totalSold ?? 0n,
    maxIncome: 390n * 10n ** 18n,
  };

  const binaryInfo: BinaryInfo = {
    leftBusiness: userInfo?.leftSubUsers ?? 0n,
    rightBusiness: userInfo?.rightSubUsers ?? 0n,
    carryLeft: 0n,
    carryRight: 0n,
    todayBinaryIncome: 0n,
    dailyCap: 0n,
    claimableBinaryIncome: 0n,
    binaryDepth: 0n,
  };

  // ── MetaMask event listener + auto-refresh ──────────────────────────────────

  useEffect(() => {
    const ethereum = (window as any).ethereum;
    if (!ethereum) return;
    ethereum.request({ method: "eth_accounts" }).then((accounts: string[]) => {
      if (accounts.length > 0) {
        setAccount(accounts[0]);
        fetchUserData(accounts[0]);
      }
    });
    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length > 0) {
        setAccount(accounts[0]);
        fetchUserData(accounts[0]);
      } else {
        setAccount(null);
        setIsRegistered(false);
        setUserInfo(null);
      }
    };
    ethereum.on("accountsChanged", handleAccountsChanged);
    return () => ethereum.removeListener("accountsChanged", handleAccountsChanged);
  }, [fetchUserData]);

  // Auto-poll every 30 s so balances stay live after claims/sells/withdrawals
  useEffect(() => {
    if (!account) return;
    const id = setInterval(() => fetchUserData(), 30_000);
    return () => clearInterval(id);
  }, [account, fetchUserData]);

  // ── Staking ─────────────────────────────────────────────────────────────────

  const stakeUsdt = useCallback(async (usdtAmount: string, isLocked: boolean, useContractBalance = false) => {
    const signer = await getSigner();
    const contract = getMvaultContract(signer);
    const signerAddress = await signer.getAddress();

    // Pre-flight checks (read-only, before MetaMask opens)
    const [stakingAddr, userInfo] = await Promise.all([
      contract.stakingModule(),
      contract.users(signerAddress),
    ]);
    if (!stakingAddr || stakingAddr === ethers.ZeroAddress) {
      throw new Error("Staking module not yet configured on-chain. Please contact support.");
    }
    if (!userInfo.isRegistered) {
      throw new Error("This wallet is not registered. Please register first before staking.");
    }
    if (!userInfo.isActive) {
      throw new Error("Your account is not yet activated. Please activate ($130 USDT) before staking.");
    }

    const amountBn = ethers.parseUnits(usdtAmount, 18);
    if (useContractBalance) {
      // Uses USDT already in the contract — no wallet approval needed
      const tx = await contract.stakeFromBalance(amountBn, isLocked, { gasLimit: 600_000 });
      await tx.wait();
    } else {
      const tx = await contract.stake(amountBn, isLocked, { gasLimit: 600_000 });
      await tx.wait();
    }
    await refreshAfterTx();
  }, [getSigner, refreshAfterTx]);

  const unstakePosition = useCallback(async (stakeIndex: number) => {
    const signer = await getSigner();
    const contract = getMvaultContract(signer);
    const tx = await contract.unstake(stakeIndex);
    await tx.wait();
    await refreshAfterTx();
  }, [getSigner, refreshAfterTx]);

  const convertStakeToLocked = useCallback(async (stakeIndex: number) => {
    const signer = await getSigner();
    const contract = getMvaultContract(signer);
    const tx = await contract.convertToLocked(stakeIndex);
    await tx.wait();
  }, [getSigner]);

  const registerAndActivateFor = useCallback(async (
    newUser: string,
    binaryParent: string,
    placeLeft: boolean,
    pkg = 2
  ) => {
    const signer = await getSigner();
    const contract = getMvaultContract(signer);
    const tx = await contract.registerAndActivateFor(newUser, binaryParent, placeLeft, pkg, { gasLimit: 800000 });
    await tx.wait();
    await refreshAfterTx();
    // Notify for the newly activated user (not the caller)
    notifyActivation(newUser);
  }, [getSigner, refreshAfterTx, notifyActivation]);

  const getActiveStakesOnChain = useCallback(async (user: string) => {
    const provider = getProvider();
    const contract = getMvaultContract(provider);
    try {
      const result = await contract.getActiveStakes(user);
      const positions = [];
      for (let i = 0; i < result.indices.length; i++) {
        positions.push({
          index: Number(result.indices[i]),
          mvtAmount: result.mvtAmounts[i] as bigint,
          usdtInvested: result.usdtInvestedArr[i] as bigint,
          stakedAt: Number(result.stakedAts[i]),
          lockedSince: Number(result.lockedSinces[i]),
        });
      }
      return positions;
    } catch {
      return [];
    }
  }, []);

  // ── Admin: pool balances ──────────────────────────────────────────────────
  const getAdminPoolBalances = useCallback(async () => {
    const provider = getProvider();
    const contract = getMvaultContract(provider);
    const [community, reserve, admin, userCount] = await Promise.all([
      contract.communityPool(),
      contract.reservePool(),
      contract.adminPool(),
      contract.totalUsers(),
    ]);
    return {
      communityPool:   community as bigint,
      reservePool:     reserve   as bigint,
      adminPool:       admin     as bigint,
      totalUsers:      Number(userCount),
    };
  }, []);

  return {
    account, loading, initialLoaded, isRegistered, userInfo,
    incomeInfo, binaryInfo, slabInfo: null as SlabInfo | null,
    mvtPrice, binaryPairs,
    btcPoolBalance, tokenDecimals, totalUsers, profileOnChain, contractMvtBalance,
    connect, register, approveToken, activatePackage, activateFromBalance,
    sellMvt, withdrawFunds, withdrawBtcPool, rebirth, claimRebirthBalance,
    enterBoardPool, claimBinaryIncome, saveProfileOnChain,
    reactivatePackage, repurchase,
    getDirectReferrals, getTokenBalance,
    getTransactionsFromContract, getBinaryFlushedEvents, fetchUserData,
    stakeUsdt, unstakePosition, convertStakeToLocked, getActiveStakesOnChain, registerAndActivateFor,
    getAdminPoolBalances,
    formatAmount: (val: bigint) => formatTokenAmount(val, tokenDecimals),
  };
}
