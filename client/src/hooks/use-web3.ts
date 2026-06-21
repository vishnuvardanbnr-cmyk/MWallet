import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import {
  getMvaultContract, getTokenContract, getMvtTokenContract, getStakingModuleContract,
  MVAULT_CONTRACT_ADDRESS, TOKEN_ADDRESS,
  NETWORK, formatTokenAmount, getDirectProvider, waitForTx,
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
  const [btcPoolRate, setBtcPoolRateState] = useState<number>(10);
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

  // Returns true if the wallet's current chainId matches our target network.
  const isOnCorrectChain = useCallback(async (): Promise<boolean> => {
    const ethereum = (window as any).ethereum;
    if (!ethereum) return false;
    try {
      const chainHex: string = await ethereum.request({ method: "eth_chainId" });
      return chainHex.toLowerCase() === NETWORK.chainId.toLowerCase();
    } catch { return false; }
  }, []);

  const switchNetwork = useCallback(async () => {
    const ethereum = (window as any).ethereum;
    if (!ethereum) return;
    try {
      // Try switching first — works even if chain was added with a different symbol/name,
      // and avoids the MetaMask "nativeCurrency.symbol mismatch" rejection on addEthereumChain.
      await ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: NETWORK.chainId }],
      });
    } catch (switchErr: any) {
      if (switchErr?.code === 4902) {
        // Chain not in wallet yet — add it
        try {
          await ethereum.request({ method: "wallet_addEthereumChain", params: [NETWORK] });
        } catch { /* user rejected add */ }
      }
      // Other wallets (Token Pocket, SafePal) may reject switch/add — try add anyway
      try {
        await ethereum.request({ method: "wallet_addEthereumChain", params: [NETWORK] });
      } catch { /* ignore */ }
    }
  }, []);

  // ── sendRawTx ────────────────────────────────────────────────────────────────
  // Builds a fully pre-populated legacy (type:0) transaction using nonce+gasPrice
  // from our direct RPC, then sends it through the wallet signer.
  // This bypasses the wallet's internal eth_estimateGas / eth_gasPrice calls which
  // fail on Token Pocket and SafePal for custom chains like MChain.
  const sendRawTx = useCallback(async (
    signer: ethers.JsonRpcSigner,
    to: string,
    data: string,
    gasLimit = 600_000,
  ): Promise<string> => {
    const direct = getDirectProvider();
    const addr = await signer.getAddress();
    // Raw eth_gasPrice avoids getFeeData() which fetches a block — MChain blocks
    // have a Bech32 miner address that ethers v6 cannot parse (INVALID_ARGUMENT).
    const [nonce, gasPriceHex] = await Promise.all([
      direct.getTransactionCount(addr, "pending"),
      direct.send("eth_gasPrice", []),
    ]);
    const gasPriceBn = (gasPriceHex !== null && gasPriceHex !== undefined)
      ? BigInt(gasPriceHex) : 1_000_000_000n;

    const toHex = (n: number | bigint) => "0x" + BigInt(n).toString(16);
    const chainId = parseInt(NETWORK.chainId, 16);
    const txParams = {
      from: addr, to, data,
      gas:      toHex(gasLimit),
      gasPrice: toHex(gasPriceBn),
      nonce:    toHex(nonce),
      value:    "0x0",
      chainId:  toHex(chainId),
    };

    const ethereum = (window as any).ethereum;
    const rpcUrl = typeof window !== "undefined"
      ? `${window.location.origin}/api/rpc/mchain`
      : "https://node.mymchain.com/api/rpc";

    // Primary: eth_signTransaction — wallet signs only, we broadcast via plain fetch.
    // This prevents Token Pocket / SafePal from running their own broken MChain
    // simulation inside eth_sendTransaction.
    try {
      const signed: string = await ethereum.request({
        method: "eth_signTransaction",
        params: [txParams],
      });
      // Plain fetch avoids ethers JsonRpcProvider.send() which may trigger
      // eth_getBlockByNumber internally (Bech32 miner crash on MChain).
      const resp = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", method: "eth_sendRawTransaction",
          params: [signed], id: 1,
        }),
      });
      const rpcData = await resp.json();
      if (rpcData.error) throw new Error(rpcData.error.message || "Broadcast failed");
      return rpcData.result as string; // tx hash
    } catch (signErr: any) {
      // Only re-throw on explicit user rejection — anything else (not supported,
      // network error, wallet quirk) falls through to eth_sendTransaction fallback.
      if (signErr?.code === 4001 || signErr?.code === "ACTION_REJECTED") throw signErr;
    }

    // Fallback: raw eth_sendTransaction (wallet handles broadcast itself)
    return await ethereum.request({
      method: "eth_sendTransaction",
      params: [txParams],
    });
  }, []);

  // Ensures the wallet is on the correct chain before sending a tx.
  // Throws a user-friendly error if the chain can't be switched.
  const ensureCorrectChain = useCallback(async () => {
    if (await isOnCorrectChain()) return;
    await switchNetwork();
    // Give wallet up to 3 s to reflect the chain switch
    for (let i = 0; i < 6; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (await isOnCorrectChain()) return;
    }
    throw new Error(
      `Please switch your wallet to ${NETWORK.chainName} (Chain ID ${parseInt(NETWORK.chainId, 16)}) manually and try again.`
    );
  }, [isOnCorrectChain, switchNetwork]);

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
        // MWT price — call token contract directly (getMvtPrice removed from main contract)
        try {
          const mvtToken = getMvtTokenContract(getDirectProvider());
          const bp = await mvtToken.getBuyPrice();
          const sp = await mvtToken.getSellPrice();
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

        // MWT ERC20 tokens held by the contract (from mvaultToken address)
        try {
          const mvtAddr = await contract.mvaultToken();
          const { ethers: e } = await import("ethers");
          const mvt = new e.Contract(mvtAddr, ["function balanceOf(address) view returns (uint256)"], provider);
          const bal = await mvt.balanceOf(MVAULT_CONTRACT_ADDRESS);
          setContractMvtBalance(bal);
        } catch { }

        // Profile — bytes32 fields in users() struct; decode to human-readable string.
        const decB32 = (v: any): string => {
          if (!v || v === "0x" + "00".repeat(32)) return "";
          try { return ethers.decodeBytes32String(v); } catch { return ""; }
        };
        setProfileOnChain({
          displayName: decB32(info.displayName),
          email:       decB32(info.email),
          phone:       decB32(info.phone),
          country:     decB32(info.country),
          profileSet:  !!info.profileSet,
        });

        // Per-user BTC pool rate (stored in user struct — 0 = default 10%)
        try {
          const rate = Number(info.btcPoolRate ?? 0);
          setBtcPoolRateState(rate === 0 ? 10 : rate);
        } catch {
          setBtcPoolRateState(10);
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
    // Ensure wallet is on MChain before signing — Token Pocket / SafePal may not
    // auto-switch, causing the tx to go to the wrong chain and revert.
    await ensureCorrectChain();
    const signer = await getSigner();
    const signerAddress = await signer.getAddress();
    // Step 1 — simulate via direct RPC to catch contract revert reasons early.
    // If the simulation itself has a network error (not a contract revert), skip
    // it and let the wallet tx surface the real error.
    try {
      const directProvider = getDirectProvider();
      const simContract = getMvaultContract(directProvider);
      await simContract.register.staticCall(sponsor, ZERO_ADDRESS, placeLeft, { from: signerAddress });
    } catch (simErr: any) {
      const simMsg = simErr?.reason || simErr?.shortMessage || simErr?.message || "";
      // Only block on known contract reverts — not on network/parse errors
      const isContractRevert =
        simErr?.errorName ||
        simMsg.includes("AlreadyRegistered") ||
        simMsg.includes("SponsorNotRegistered") ||
        simMsg.includes("revert") ||
        (simErr?.code === "CALL_EXCEPTION" && simErr?.data && simErr.data !== "0x");
      if (isContractRevert) throw simErr;
      // Network/proxy error — proceed anyway and let the wallet tx fail with a real reason
      console.warn("staticCall simulation failed (network error), proceeding with tx:", simMsg);
    }
    // Step 2 — send via pre-populated raw tx (bypasses wallet eth_estimateGas/gasPrice)
    const iface = getMvaultContract(getDirectProvider()).interface;
    const txHash = await sendRawTx(signer, MVAULT_CONTRACT_ADDRESS,
      iface.encodeFunctionData("register", [sponsor, ZERO_ADDRESS, placeLeft]), 600_000);
    await waitForTx(txHash);
    await refreshAfterTx();
  }, [getSigner, ensureCorrectChain, refreshAfterTx]);

  // ── USDT approval for MvaultContract ───────────────────────────────────────

  const approveToken = useCallback(async (_amount?: string) => {
    const signer = await getSigner();
    const signerAddress = await signer.getAddress();
    // Read via direct provider — MetaMask eth_call on MChain returns 0x
    const tokenRead = getTokenContract(getDirectProvider());
    const currentAllowance = await tokenRead.allowance(signerAddress, MVAULT_CONTRACT_ADDRESS);
    const needed = _amount ? ethers.parseUnits(_amount, tokenDecimals) : 0n;
    if (currentAllowance >= needed && needed > 0n) return;
    const tokenIface = getTokenContract(getDirectProvider()).interface;
    const txHash = await sendRawTx(signer, TOKEN_ADDRESS,
      tokenIface.encodeFunctionData("approve", [MVAULT_CONTRACT_ADDRESS, ethers.MaxUint256]), 100_000);
    await waitForTx(txHash);
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
    const pkg = _pkg ?? 2;
    const iface = getMvaultContract(getDirectProvider()).interface;
    const txHash = await sendRawTx(signer, MVAULT_CONTRACT_ADDRESS,
      iface.encodeFunctionData("activate", [pkg]), 5_000_000);
    await waitForTx(txHash);
    await refreshAfterTx();
    if (account) notifyActivation(account);
  }, [getSigner, refreshAfterTx, account, notifyActivation]);

  // ── Sell virtual MWT → USDT (stays in contract) ────────────────────────────

  const sellMvt = useCallback(async (amount: string) => {
    const signer = await getSigner();
    const parsed = ethers.parseUnits(amount, tokenDecimals);
    const iface = getMvaultContract(getDirectProvider()).interface;
    const txHash = await sendRawTx(signer, MVAULT_CONTRACT_ADDRESS,
      iface.encodeFunctionData("sellMvt", [parsed]), 600_000);
    await waitForTx(txHash);
    await refreshAfterTx();
  }, [getSigner, tokenDecimals, refreshAfterTx]);

  // ── Withdraw USDT balance → wallet ─────────────────────────────────────────

  const withdrawFunds = useCallback(async (amount: string) => {
    const signer = await getSigner();
    const parsed = ethers.parseUnits(amount, tokenDecimals);
    const iface = getMvaultContract(getDirectProvider()).interface;
    const txHash = await sendRawTx(signer, MVAULT_CONTRACT_ADDRESS,
      iface.encodeFunctionData("withdrawUsdt", [parsed]), 200_000);
    await waitForTx(txHash);
    await refreshAfterTx();
  }, [getSigner, tokenDecimals, refreshAfterTx]);

  // ── Withdraw BTC pool balance → wallet ─────────────────────────────────────

  const withdrawBtcPool = useCallback(async (amount: string) => {
    const signer = await getSigner();
    const parsed = ethers.parseUnits(amount, tokenDecimals);
    const iface = getMvaultContract(getDirectProvider()).interface;
    const txHash = await sendRawTx(signer, MVAULT_CONTRACT_ADDRESS,
      iface.encodeFunctionData("withdrawBtcPool", [parsed]), 200_000);
    await waitForTx(txHash);
    await refreshAfterTx();
  }, [getSigner, tokenDecimals, refreshAfterTx]);

  // ── Rebirth (create sub-account) ───────────────────────────────────────────

  const rebirth = useCallback(async (subAccount: string, placeLeft: boolean) => {
    const signer = await getSigner();
    const signerAddress = await signer.getAddress();
    // Simulate first to surface a clean revert reason
    const simContract = getMvaultContract(getDirectProvider());
    await simContract.rebirth.staticCall(subAccount, placeLeft, { from: signerAddress });
    const iface = getMvaultContract(getDirectProvider()).interface;
    const txHash = await sendRawTx(signer, MVAULT_CONTRACT_ADDRESS,
      iface.encodeFunctionData("rebirth", [subAccount, placeLeft]), 5_000_000);
    await waitForTx(txHash);
    await refreshAfterTx();
  }, [getSigner, refreshAfterTx]);

  const claimRebirthBalance = useCallback(async () => {
    const signer = await getSigner();
    const iface = getMvaultContract(getDirectProvider()).interface;
    const txHash = await sendRawTx(signer, MVAULT_CONTRACT_ADDRESS,
      iface.encodeFunctionData("claimRebirthBalance", []), 200_000);
    await waitForTx(txHash);
    await refreshAfterTx();
  }, [getSigner, refreshAfterTx]);

  // ── Profile (on-chain via MvaultContract) ──────────────────────────────────

  const saveProfileOnChain = useCallback(async (
    displayName: string, email: string, phone: string, country: string,
  ) => {
    if (!account) return;
    const signer = await getSigner();
    const iface = getMvaultContract(getDirectProvider()).interface;
    const encB32 = (s: string) => { try { return ethers.encodeBytes32String(s.slice(0, 31)); } catch { return ethers.encodeBytes32String(""); } };
    const txHash = await sendRawTx(signer, MVAULT_CONTRACT_ADDRESS,
      iface.encodeFunctionData("setProfile", [encB32(displayName), encB32(email), encB32(phone), encB32(country)]), 200_000);
    await waitForTx(txHash);
    setProfileOnChain({ displayName, email, phone, country, profileSet: true });
  }, [account, getSigner]);

  const setBtcPoolRate = useCallback(async (rate: number) => {
    if (!account) return;
    const signer = await getSigner();
    const iface = getMvaultContract(getDirectProvider()).interface;
    const txHash = await sendRawTx(signer, MVAULT_CONTRACT_ADDRESS,
      iface.encodeFunctionData("setBtcPoolRate", [rate]), 80_000);
    await waitForTx(txHash);
    setBtcPoolRateState(rate);
  }, [account, getSigner]);

  // ── Direct referrals (via contract view getDirectReferralsPaginated — no event scanning) ───
  const getDirectReferrals = useCallback(async (offset: number, limit: number) => {
    if (!account) return { referrals: [], total: 0 };
    try {
      const provider = getDirectProvider();
      const contract = getMvaultContract(provider);
      const result = await contract.getDirectReferralsPaginated(account, offset, limit);
      const referrals: string[] = Array.from(result.referrals ?? result[0] ?? []);
      const total: number = Number(result.total ?? result[1] ?? 0);
      return { referrals, total };
    } catch (err) {
      console.error("getDirectReferrals error:", err);
      return { referrals: [], total: 0 };
    }
  }, [account]);

  // ── Transactions (from on-chain events) ────────────────────────────────────

  const getTransactionsFromContract = useCallback(async (offset: number, limit: number) => {
    if (!account) return { transactions: [], total: 0 };
    try {
      // Use direct provider — wallet's eth_call / eth_getLogs on MChain returns 0x
      const contract = getMvaultContract(getDirectProvider());

      // TX_META: type 0-11 from on-chain _recordTx
      const TX_META: Record<number, { type: string; isIncome: boolean; currency: "USDT" | "MWT"; detail: (r: any) => string }> = {
        0:  { type: "Activation",          isIncome: false, currency: "USDT", detail: ()  => "$130 package activated" },
        1:  { type: "Level Income",         isIncome: true,  currency: "MWT",  detail: (r) => {
               const lvl = Number(r.level);
               const addr = r.addr as string;
               const short = addr && addr !== "0x0000000000000000000000000000000000000000" ? `${addr.slice(0,6)}...${addr.slice(-4)}` : "";
               return `Level ${lvl}${short ? ` from ${short}` : ""}`;
             }},
        2:  { type: "Level Income Missed",  isIncome: false, currency: "MWT",  detail: (r) => `Level ${Number(r.level)} — need more directs` },
        3:  { type: "Placement Income",        isIncome: true,  currency: "MWT",  detail: (r) => {
               const lvl = Number(r.level);
               const addr = r.addr as string;
               const short = addr && addr !== "0x0000000000000000000000000000000000000000" ? `${addr.slice(0,6)}...${addr.slice(-4)}` : "";
               return `Level ${lvl} placement${short ? ` from ${short}` : ""}`;
             }},
        4:  { type: "Placement Missed",      isIncome: false, currency: "MWT",  detail: (r) => `Level ${Number(r.level)} — need more directs` },
        5:  { type: "Sell MWT",             isIncome: false, currency: "USDT", detail: ()  => "MWT sold for USDT" },
        6:  { type: "BTC Pool Credited",    isIncome: true,  currency: "USDT", detail: ()  => "10% of sell → BTC pool" },
        7:  { type: "Withdrawal",           isIncome: false, currency: "USDT", detail: ()  => "USDT withdrawn to wallet" },
        8:  { type: "BTC Pool Withdraw",    isIncome: false, currency: "USDT", detail: ()  => "BTC pool withdrawn" },
        9:  { type: "Rebirth",              isIncome: false, currency: "USDT", detail: (r) => {
               const addr = r.addr as string;
               return addr && addr !== "0x0000000000000000000000000000000000000000" ? `Sub-account: ${addr.slice(0,6)}...${addr.slice(-4)}` : "Sub-account reborn";
             }},
        10: { type: "Board Entry",          isIncome: false, currency: "USDT", detail: (r) => `Entered Pool ${Number(r.level)}` },
        11: { type: "Board Reward",         isIncome: true,  currency: "USDT", detail: (r) => `Pool ${Number(r.level)} completed` },
        12: { type: "Staked",               isIncome: false, currency: "USDT", detail: ()  => "USDT staked for MWT" },
        13: { type: "Unstaked",             isIncome: true,  currency: "USDT", detail: ()  => "USDT credited from unstake" },
        14: { type: "Rebirth Claim",        isIncome: true,  currency: "USDT", detail: ()  => "Partial rebirth pool claimed to wallet" },
        15: { type: "Reactivation",         isIncome: false, currency: "USDT", detail: ()  => "Account reactivated" },
        16: { type: "Rank Income",          isIncome: true,  currency: "MWT",  detail: (r) => `Rank M${Number(r.level)} income` },
        17: { type: "Staking Level Income", isIncome: true,  currency: "MWT",  detail: (r) => `Level ${Number(r.level)} — staking upline` },
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
        // For sell transactions, try to extract MWT amount from r.level if stored
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



      return { transactions, total };
    } catch (err) {
      console.error("getTransactionsFromContract error:", err);
      return { transactions: [], total: 0 };
    }
  }, [account, getProvider]);

  // ── Board pool entry ────────────────────────────────────────────────────────

  const enterBoardPool = useCallback(async () => {
    const signer = await getSigner();
    const iface = getMvaultContract(getDirectProvider()).interface;
    const txHash = await sendRawTx(signer, MVAULT_CONTRACT_ADDRESS,
      iface.encodeFunctionData("enterBoardPool", []), 500_000);
    await waitForTx(txHash);
    await refreshAfterTx();
  }, [getSigner, refreshAfterTx]);

  const activateFromBalance = useCallback(async (_pkg?: number) => {
    const signer = await getSigner();
    const pkg = _pkg ?? 2;
    const iface = getMvaultContract(getDirectProvider()).interface;
    const txHash = await sendRawTx(signer, MVAULT_CONTRACT_ADDRESS,
      iface.encodeFunctionData("activateFromBalance", [pkg]), 5_000_000);
    await waitForTx(txHash);
    await refreshAfterTx();
    if (account) notifyActivation(account);
  }, [getSigner, refreshAfterTx, account, notifyActivation]);

  const reactivateWithWallet = useCallback(async (pkg: number) => {
    const signer = await getSigner();
    const price = pkg === 1 ? ethers.parseUnits("55", 18) : ethers.parseUnits("130", 18);
    const tokenIface = getTokenContract(getDirectProvider()).interface;
    const approveHash = await sendRawTx(signer, TOKEN_ADDRESS,
      tokenIface.encodeFunctionData("approve", [MVAULT_CONTRACT_ADDRESS, price]), 100_000);
    await waitForTx(approveHash);
    const iface = getMvaultContract(getDirectProvider()).interface;
    const txHash = await sendRawTx(signer, MVAULT_CONTRACT_ADDRESS,
      iface.encodeFunctionData("reactivate", [pkg]), 5_000_000);
    await waitForTx(txHash);
    await refreshAfterTx();
  }, [getSigner, refreshAfterTx]);

  const reactivateFromIncomeWallet = useCallback(async (pkg: number) => {
    const signer = await getSigner();
    const iface = getMvaultContract(getDirectProvider()).interface;
    const txHash = await sendRawTx(signer, MVAULT_CONTRACT_ADDRESS,
      iface.encodeFunctionData("reactivateFromBalance", [pkg]), 5_000_000);
    await waitForTx(txHash);
    await refreshAfterTx();
  }, [getSigner, refreshAfterTx]);

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
    const signerAddress = await signer.getAddress();
    console.log("[stake] signer:", signerAddress, "amount:", usdtAmount, "locked:", isLocked, "fromBalance:", useContractBalance);

    // All reads use direct provider — MetaMask's eth_call on MChain returns "missing revert data"
    const directProvider = getDirectProvider();
    const readContract = getMvaultContract(directProvider);

    // Pre-flight checks (read-only, via direct RPC — not MetaMask)
    const [stakingAddr, userInfo] = await Promise.all([
      readContract.stakingModule(),
      readContract.users(signerAddress),
    ]);
    console.log("[stake] stakingAddr:", stakingAddr, "isRegistered:", userInfo.isRegistered, "isActive:", userInfo.isActive);
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

    if (!useContractBalance) {
      // Check allowance via direct provider, approve via MetaMask signer
      const usdtRead = new ethers.Contract(TOKEN_ADDRESS, [
        "function allowance(address,address) view returns (uint256)",
        "function balanceOf(address) view returns (uint256)",
      ], directProvider);
      const [currentAllowance, walletBal] = await Promise.all([
        usdtRead.allowance(signerAddress, MVAULT_CONTRACT_ADDRESS),
        usdtRead.balanceOf(signerAddress),
      ]);
      console.log("[stake] on-chain allowance:", currentAllowance.toString(), "walletUSDT:", walletBal.toString(), "need:", amountBn.toString());
      if (currentAllowance < amountBn) {
        console.log("[stake] sending approve tx...");
        const tokenIface = getTokenContract(getDirectProvider()).interface;
        const approveHash = await sendRawTx(signer, TOKEN_ADDRESS,
          tokenIface.encodeFunctionData("approve", [MVAULT_CONTRACT_ADDRESS, ethers.MaxUint256]), 100_000);
        console.log("[stake] approve tx hash:", approveHash);
        await waitForTx(approveHash);
        console.log("[stake] approve confirmed");
      } else {
        console.log("[stake] allowance sufficient, skipping approve");
      }
    }

    // Send directly through MetaMask — gasLimit bypasses eth_estimateGas.
    // MChain's eth_call returns 0x for state-mutating simulations (staticCall unreliable).
    // Pre-flight reads above already catch the most common revert cases.
    const iface = getMvaultContract(getDirectProvider()).interface;
    if (useContractBalance) {
      console.log("[stake] calling stakeFromBalance...");
      const txHash = await sendRawTx(signer, MVAULT_CONTRACT_ADDRESS,
        iface.encodeFunctionData("stakeFromBalance", [amountBn, isLocked]), 2_000_000);
      console.log("[stake] stakeFromBalance tx hash:", txHash);
      await waitForTx(txHash);
    } else {
      console.log("[stake] calling stake()...");
      const txHash = await sendRawTx(signer, MVAULT_CONTRACT_ADDRESS,
        iface.encodeFunctionData("stake", [amountBn, isLocked]), 2_000_000);
      console.log("[stake] stake tx hash:", txHash);
      await waitForTx(txHash);
    }
    await refreshAfterTx();
  }, [getSigner, refreshAfterTx]);

  const unstakePosition = useCallback(async (stakeIndex: number) => {
    const signer = await getSigner();
    const iface = getMvaultContract(getDirectProvider()).interface;
    const txHash = await sendRawTx(signer, MVAULT_CONTRACT_ADDRESS,
      iface.encodeFunctionData("unstake", [stakeIndex]), 800_000);
    await waitForTx(txHash);
    await refreshAfterTx();
  }, [getSigner, refreshAfterTx]);

  const convertStakeToLocked = useCallback(async (stakeIndex: number) => {
    const signer = await getSigner();
    const iface = getMvaultContract(getDirectProvider()).interface;
    const txHash = await sendRawTx(signer, MVAULT_CONTRACT_ADDRESS,
      iface.encodeFunctionData("convertToLocked", [stakeIndex]), 200_000);
    await waitForTx(txHash);
  }, [getSigner]);

  const registerAndActivateFor = useCallback(async (
    newUser: string,
    binaryParent: string,
    placeLeft: boolean,
    pkg = 2
  ) => {
    const signer = await getSigner();
    const iface = getMvaultContract(getDirectProvider()).interface;
    const txHash = await sendRawTx(signer, MVAULT_CONTRACT_ADDRESS,
      iface.encodeFunctionData("registerAndActivateFor", [newUser, binaryParent, placeLeft, pkg]), 5_000_000);
    await waitForTx(txHash);
    await refreshAfterTx();
    // Notify for the newly activated user (not the caller)
    notifyActivation(newUser);
  }, [getSigner, refreshAfterTx, notifyActivation]);

  const getActiveStakesOnChain = useCallback(async (user: string) => {
    const provider = getDirectProvider();
    const contract = getStakingModuleContract(provider);
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
    btcPoolBalance, btcPoolRate, tokenDecimals, totalUsers, profileOnChain, contractMvtBalance,
    connect, register, approveToken, activatePackage, activateFromBalance,
    sellMvt, withdrawFunds, withdrawBtcPool, rebirth, claimRebirthBalance,
    enterBoardPool, claimBinaryIncome, saveProfileOnChain, setBtcPoolRate,
    reactivatePackage, repurchase, reactivateWithWallet, reactivateFromIncomeWallet,
    getDirectReferrals, getTokenBalance,
    getTransactionsFromContract, getBinaryFlushedEvents, fetchUserData,
    stakeUsdt, unstakePosition, convertStakeToLocked, getActiveStakesOnChain, registerAndActivateFor,
    getAdminPoolBalances,
    formatAmount: (val: bigint) => formatTokenAmount(val, tokenDecimals),
  };
}
