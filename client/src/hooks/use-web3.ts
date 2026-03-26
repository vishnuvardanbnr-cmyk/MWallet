import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import {
  getMvaultContract, getTokenContract,
  MVAULT_CONTRACT_ADDRESS, TOKEN_ADDRESS,
  NETWORK, formatTokenAmount,
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
  usdtBalance: bigint;
  rebirthPool: bigint;
  btcPoolBalance: bigint;
  powerLegPoints: bigint;
  matchedPairs: bigint;
  mainAccount: string;
  rebirthCount: bigint;
  joinedAt: bigint;
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
    try {
      await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: NETWORK.chainId }] });
    } catch (err: any) {
      if (err.code === 4902) {
        await ethereum.request({ method: "wallet_addEthereumChain", params: [NETWORK] });
      }
    }
  }, []);

  const fetchUserData = useCallback(async (addr?: string) => {
    const address = addr || account;
    if (!address) return;
    setLoading(true);
    try {
      const provider = getProvider();
      const contract = getMvaultContract(provider);

      // Total users
      let total = 0;
      try { total = Number(await contract.totalUsers()); } catch { }
      setTotalUsers(total);

      // getUserInfo
      let info: any;
      try {
        info = await contract.getUserInfo(address);
      } catch (e) {
        console.error("getUserInfo failed:", e);
        setIsRegistered(false);
        setUserInfo(null);
        return;
      }

      const ui: UserInfo = {
        isRegistered:    info[0],
        isActive:        info[1],
        sponsor:         info[2],
        directCount:     info[3],
        binaryParent:    info[4],
        placedLeft:      info[5],
        leftChild:       info[6],
        rightChild:      info[7],
        leftSubUsers:    info[8],
        rightSubUsers:   info[9],
        mvtBalance:      info[10],
        totalReceived:   info[11],
        totalSold:       info[12],
        incomeLimit:     info[13],
        usdtBalance:     info[14],
        rebirthPool:     info[15],
        btcPoolBalance:  info[16],
        powerLegPoints:  info[17],
        matchedPairs:    info[18],
        mainAccount:     info[19],
        rebirthCount:    info[20],
        joinedAt:        info[21],
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

        // Binary pairs
        try {
          const [curr, newP] = await contract.getCurrentBinaryPairs(address);
          setBinaryPairs({ currentPairs: curr, newPairs: newP });
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
  }, [account, getProvider]);

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

  const register = useCallback(async (sponsor: string, binaryParent: string, placeLeft: boolean) => {
    const signer = await getSigner();
    const contract = getMvaultContract(signer);
    const tx = await contract.register(sponsor, binaryParent, placeLeft);
    await tx.wait();
    await fetchUserData();
  }, [getSigner, fetchUserData]);

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

  const activatePackage = useCallback(async (_pkg?: number) => {
    const signer = await getSigner();
    const contract = getMvaultContract(signer);
    const tx = await contract.activate();
    await tx.wait();
    await fetchUserData();
  }, [getSigner, fetchUserData]);

  // ── Sell virtual MVT → USDT (stays in contract) ────────────────────────────

  const sellMvt = useCallback(async (amount: string) => {
    const signer = await getSigner();
    const contract = getMvaultContract(signer);
    const parsed = ethers.parseUnits(amount, tokenDecimals);
    const tx = await contract.sellMvt(parsed);
    await tx.wait();
    await fetchUserData();
  }, [getSigner, tokenDecimals, fetchUserData]);

  // ── Withdraw USDT balance → wallet ─────────────────────────────────────────

  const withdrawFunds = useCallback(async (amount: string) => {
    const signer = await getSigner();
    const contract = getMvaultContract(signer);
    const parsed = ethers.parseUnits(amount, tokenDecimals);
    const tx = await contract.withdrawUsdt(parsed);
    await tx.wait();
    await fetchUserData();
  }, [getSigner, tokenDecimals, fetchUserData]);

  // ── Withdraw BTC pool balance → wallet ─────────────────────────────────────

  const withdrawBtcPool = useCallback(async (amount: string) => {
    const signer = await getSigner();
    const contract = getMvaultContract(signer);
    const parsed = ethers.parseUnits(amount, tokenDecimals);
    const tx = await contract.withdrawBtcPool(parsed);
    await tx.wait();
    await fetchUserData();
  }, [getSigner, tokenDecimals, fetchUserData]);

  // ── Rebirth (create sub-account) ───────────────────────────────────────────

  const rebirth = useCallback(async (subAccount: string, placeLeft: boolean) => {
    const signer = await getSigner();
    const contract = getMvaultContract(signer);
    const tx = await contract.rebirth(subAccount, placeLeft);
    await tx.wait();
    await fetchUserData();
  }, [getSigner, fetchUserData]);

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

  // ── Direct referrals (via events) ──────────────────────────────────────────

  const getDirectReferrals = useCallback(async (offset: number, limit: number) => {
    if (!account) return { referrals: [], total: 0 };
    try {
      const provider = getProvider();
      const contract = getMvaultContract(provider);
      const filter = contract.filters.Registered(null, account);
      let events: any[];
      try {
        events = await contract.queryFilter(filter, 0);
      } catch {
        const current = await provider.getBlockNumber();
        events = await contract.queryFilter(filter, Math.max(0, current - 100000));
      }
      const all = events.map((e: any) => e.args?.[0] as string).filter(Boolean);
      const page = all.slice(offset, offset + limit);
      return { referrals: page, total: all.length };
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

      // Single on-chain read — no event querying, no block range limits.
      const [records, totalBn] = await contract.getTransactions(account, BigInt(offset), BigInt(limit));
      const total = Number(totalBn);

      // txType → display metadata
      // 0=Activation 1=LevelIncome 2=LevelMissed 3=BinaryIncome 4=PowerLeg
      // 5=SellMVT 6=BtcCredited 7=UsdtWithdraw 8=BtcWithdraw 9=Rebirth
      // 10=BoardEntry 11=BoardReward
      const TX_META: Record<number, { type: string; isIncome: boolean; detail: (r: any) => string }> = {
        0:  { type: "Activation",          isIncome: false, detail: ()  => "$130 package activated" },
        1:  { type: "Level Income",         isIncome: true,  detail: (r) => {
               const lvl = Number(r.level);
               const addr = r.addr as string;
               const short = addr && addr !== "0x0000000000000000000000000000000000000000" ? `${addr.slice(0,6)}...${addr.slice(-4)}` : "";
               return `Level ${lvl}${short ? ` from ${short}` : ""}`;
             }},
        2:  { type: "Level Income Missed",  isIncome: false, detail: (r) => `Level ${Number(r.level)} — need more directs` },
        3:  { type: "Binary Income",        isIncome: true,  detail: ()  => "Binary pairs matched" },
        4:  { type: "Power Leg Income",     isIncome: true,  detail: ()  => "Power leg distribution" },
        5:  { type: "Sell MVT",             isIncome: false, detail: ()  => "MVT sold for USDT" },
        6:  { type: "BTC Pool Credited",    isIncome: true,  detail: ()  => "10% credited to BTC pool" },
        7:  { type: "Withdrawal",           isIncome: false, detail: ()  => "USDT withdrawn to wallet" },
        8:  { type: "BTC Pool Withdraw",    isIncome: false, detail: ()  => "BTC pool withdrawn" },
        9:  { type: "Rebirth",              isIncome: false, detail: (r) => {
               const addr = r.addr as string;
               return addr && addr !== "0x0000000000000000000000000000000000000000" ? `Sub-account: ${addr.slice(0,6)}...${addr.slice(-4)}` : "Sub-account reborn";
             }},
        10: { type: "Board Entry",          isIncome: false, detail: (r) => `Entered Pool ${Number(r.level)}` },
        11: { type: "Board Reward",         isIncome: true,  detail: (r) => `Pool ${Number(r.level)} completed` },
      };

      const transactions = (records as any[]).map((r) => {
        const txType = Number(r.txType);
        const meta = TX_META[txType] ?? { type: "Unknown", isIncome: false, detail: () => "" };
        return {
          type:      meta.type,
          amount:    BigInt(r.amount),
          detail:    meta.detail(r),
          timestamp: Number(r.ts),
          isIncome:  meta.isIncome,
        };
      });

      return { transactions, total };
    } catch (err) {
      console.error("getTransactionsFromContract error:", err);
      return { transactions: [], total: 0 };
    }
  }, [account, getProvider]);

  // ── Stubs for legacy pages that haven't been migrated yet ──────────────────

  const enterBoardPool = useCallback(async () => {}, []);
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

  // ── MetaMask event listener ─────────────────────────────────────────────────

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

  // ── Staking ─────────────────────────────────────────────────────────────────

  const stakeUsdt = useCallback(async (usdtAmount: string, isLocked: boolean) => {
    const signer = await getSigner();
    const contract = getMvaultContract(signer);
    const amountBn = ethers.parseUnits(usdtAmount, 18);
    const tx = await contract.stake(amountBn, isLocked);
    await tx.wait();
    await fetchUserData();
  }, [getSigner, fetchUserData]);

  const unstakePosition = useCallback(async (stakeIndex: number) => {
    const signer = await getSigner();
    const contract = getMvaultContract(signer);
    const tx = await contract.unstake(stakeIndex);
    await tx.wait();
    await fetchUserData();
  }, [getSigner, fetchUserData]);

  const convertStakeToLocked = useCallback(async (stakeIndex: number) => {
    const signer = await getSigner();
    const contract = getMvaultContract(signer);
    const tx = await contract.convertToLocked(stakeIndex);
    await tx.wait();
  }, [getSigner]);

  const registerAndActivateFor = useCallback(async (
    newUser: string,
    binaryParent: string,
    placeLeft: boolean
  ) => {
    const signer = await getSigner();
    const contract = getMvaultContract(signer);
    const tx = await contract.registerAndActivateFor(newUser, binaryParent, placeLeft);
    await tx.wait();
    await fetchUserData();
  }, [getSigner, fetchUserData]);

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

  return {
    account, loading, initialLoaded, isRegistered, userInfo,
    incomeInfo, binaryInfo, slabInfo: null as SlabInfo | null,
    mvtPrice, binaryPairs,
    btcPoolBalance, tokenDecimals, totalUsers, profileOnChain,
    connect, register, approveToken, activatePackage,
    sellMvt, withdrawFunds, withdrawBtcPool, rebirth,
    enterBoardPool, claimBinaryIncome, saveProfileOnChain,
    reactivatePackage, repurchase,
    getDirectReferrals, getTokenBalance,
    getTransactionsFromContract, getBinaryFlushedEvents, fetchUserData,
    stakeUsdt, unstakePosition, convertStakeToLocked, getActiveStakesOnChain, registerAndActivateFor,
    formatAmount: (val: bigint) => formatTokenAmount(val, tokenDecimals),
  };
}
