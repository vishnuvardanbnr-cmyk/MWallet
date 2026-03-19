import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { getContract, getTokenContract, CONTRACT_ADDRESS, NETWORK, formatTokenAmount, TX_TYPE_NAMES, TX_TYPE_INCOME, PACKAGE_NAMES } from "@/lib/contract";

export interface UserInfo {
  userId: bigint;
  sponsor: string;
  binaryParent: string;
  leftChild: string;
  rightChild: string;
  placementSide: number;
  userPackage: number;
  status: number;
  walletBalance: bigint;
  tempWalletBalance: bigint;
  totalEarnings: bigint;
  directReferralCount: bigint;
  joinedAt: bigint;
}

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

export function useWeb3() {
  const [account, setAccount] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [incomeInfo, setIncomeInfo] = useState<IncomeInfo | null>(null);
  const [binaryInfo, setBinaryInfo] = useState<BinaryInfo | null>(null);
  const [slabInfo, setSlabInfo] = useState<SlabInfo | null>(null);
  const [btcPoolBalance, setBtcPoolBalance] = useState<bigint>(0n);
  const [tokenDecimals, setTokenDecimals] = useState(18);
  const [totalUsers, setTotalUsers] = useState<number>(0);
  const [profileOnChain, setProfileOnChain] = useState<{ displayName: string; email: string; phone: string; country: string; profileSet: boolean } | null>(null);

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
      const contract = getContract(provider);
      const decimals = Number(await contract.tokenDecimals());
      setTokenDecimals(decimals);

      const total = Number(await contract.getTotalUsers());
      setTotalUsers(total);

      const registered = await contract.isRegistered(address);
      setIsRegistered(registered);

      if (registered) {
        const info = await contract.getUserInfo(address);
        setUserInfo({
          userId: info[0], sponsor: info[1], binaryParent: info[2],
          leftChild: info[3], rightChild: info[4], placementSide: Number(info[5]),
          userPackage: Number(info[6]), status: Number(info[7]),
          walletBalance: info[8], tempWalletBalance: info[9],
          totalEarnings: info[10], directReferralCount: info[11], joinedAt: info[12],
        });

        const inc = await contract.getIncomeInfo(address);
        setIncomeInfo({
          totalDirectIncome: inc[0], totalBinaryIncome: inc[1],
          totalMatchingOverrideIncome: inc[2], totalWithdrawalMatchIncome: inc[3],
          totalEarnings: inc[4], totalWithdrawn: inc[5], maxIncome: inc[6],
        });

        const bin = await contract.getBinaryInfo(address);
        setBinaryInfo({
          leftBusiness: bin[0], rightBusiness: bin[1],
          carryLeft: bin[2], carryRight: bin[3],
          todayBinaryIncome: bin[4], dailyCap: bin[5],
          claimableBinaryIncome: bin[6], binaryDepth: bin[7] ?? 0n,
        });

        try {
          const slab = await contract.getBinarySlabInfo(address);
          const toArr = (v: unknown): bigint[] => {
            const arr = Array.from(v as ArrayLike<unknown>).map(x => BigInt(x as string | number | bigint));
            while (arr.length < 4) arr.push(0n);
            return arr.slice(0, 4);
          };
          setSlabInfo({
            carryLeftSlabs: toArr(slab[0]),
            carryRightSlabs: toArr(slab[1]),
            matchableSlabs: toArr(slab[2]),
            potentialIncomeSlabs: toArr(slab[3]),
            rates: toArr(slab[4]),
          });
        } catch {
          setSlabInfo(null);
        }

        const btcBal = await contract.getBtcPoolBalance(address);
        setBtcPoolBalance(btcBal);

        try {
          const profile = await contract.getProfile(address);
          setProfileOnChain({
            displayName: profile[0], email: profile[1],
            phone: profile[2], country: profile[3], profileSet: profile[4],
          });
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

  const register = useCallback(async (sponsorId: string, binaryParentId: string, placeLeft: boolean) => {
    const signer = await getSigner();
    const contract = getContract(signer);
    const tx = await contract.register(BigInt(sponsorId), BigInt(binaryParentId), placeLeft);
    await tx.wait();
    await fetchUserData();
  }, [getSigner, fetchUserData]);

  const approveToken = useCallback(async (amount: string) => {
    const signer = await getSigner();
    const token = getTokenContract(signer);
    const parsedAmount = ethers.parseUnits(amount, tokenDecimals);
    const tx = await token.approve(CONTRACT_ADDRESS, parsedAmount);
    await tx.wait();
  }, [getSigner, tokenDecimals]);

  const activatePackage = useCallback(async (pkg: number) => {
    const signer = await getSigner();
    const contract = getContract(signer);
    const tx = await contract.activatePackage(pkg);
    await tx.wait();
    await fetchUserData();
  }, [getSigner, fetchUserData]);

  const withdrawFunds = useCallback(async (amount: string) => {
    const signer = await getSigner();
    const contract = getContract(signer);
    const parsedAmount = ethers.parseUnits(amount, tokenDecimals);
    const tx = await contract.withdraw(parsedAmount);
    await tx.wait();
    await fetchUserData();
  }, [getSigner, tokenDecimals, fetchUserData]);

  const reactivatePackage = useCallback(async (pkg: number) => {
    const signer = await getSigner();
    const contract = getContract(signer);
    const tx = await contract.reactivate(pkg);
    await tx.wait();
    await fetchUserData();
  }, [getSigner, fetchUserData]);

  const repurchase = useCallback(async () => {
    const signer = await getSigner();
    const contract = getContract(signer);
    const tx = await contract.repurchase();
    await tx.wait();
    await fetchUserData();
  }, [getSigner, fetchUserData]);

  const enterBoardPool = useCallback(async () => {
    const signer = await getSigner();
    const contract = getContract(signer);
    const tx = await contract.enterBoardPool();
    await tx.wait();
    await fetchUserData();
  }, [getSigner, fetchUserData]);

  const claimBinaryIncome = useCallback(async () => {
    const signer = await getSigner();
    const contract = getContract(signer);
    const tx = await contract.claimBinaryIncome();
    await tx.wait();
    await fetchUserData();
  }, [getSigner, fetchUserData]);

  const saveProfileOnChain = useCallback(async (displayName: string, email: string, phone: string, country: string) => {
    const signer = await getSigner();
    const contract = getContract(signer);
    const tx = await contract.setProfile(displayName, email, phone, country);
    await tx.wait();
    await fetchUserData();
  }, [getSigner, fetchUserData]);

  const getDirectReferrals = useCallback(async (offset: number, limit: number) => {
    if (!account) return { referrals: [], total: 0 };
    const provider = getProvider();
    const contract = getContract(provider);
    const result = await contract.getDirectReferralsPaginated(account, offset, limit);
    return { referrals: result[0] as string[], total: Number(result[1]) };
  }, [account, getProvider]);

  const getTokenBalance = useCallback(async () => {
    if (!account) return "0";
    const provider = getProvider();
    const token = getTokenContract(provider);
    const bal = await token.balanceOf(account);
    return formatTokenAmount(bal, tokenDecimals);
  }, [account, getProvider, tokenDecimals]);

  const getTransactionsFromContract = useCallback(async (offset: number, limit: number) => {
    if (!account) return { transactions: [], total: 0 };
    try {
      const provider = getProvider();
      const contract = getContract(provider);
      const result = await contract.getUserTransactionsPaginated(account, offset, limit);
      const txTypes = result[0] as number[];
      const amounts = result[1] as bigint[];
      const timestamps = result[2] as bigint[];
      const relatedUsers = result[3] as string[];
      const extraDatas = result[4] as number[];
      const total = Number(result[5]);

      const txs: { type: string; amount: bigint; detail: string; timestamp: number; isIncome: boolean }[] = [];

      for (let i = 0; i < txTypes.length; i++) {
        const txType = Number(txTypes[i]);
        const typeName = TX_TYPE_NAMES[txType] || "Unknown";
        const isIncome = TX_TYPE_INCOME[txType] || false;
        const related = relatedUsers[i];
        const extra = Number(extraDatas[i]);
        let detail = "";

        if (txType === 0 || txType === 2) {
          detail = PACKAGE_NAMES[extra] || `Package ${extra}`;
        } else if (txType === 1) {
          detail = PACKAGE_NAMES[extra] || `Package ${extra}`;
        } else if (txType === 3) {
          detail = "Withdrawal";
        } else if (txType === 4) {
          detail = related !== ethers.ZeroAddress ? `From ${related.slice(0, 6)}...${related.slice(-4)}` : "";
        } else if (txType === 5) {
          detail = "Binary Match";
        } else if (txType === 6) {
          detail = related !== ethers.ZeroAddress ? `Level ${extra} from ${related.slice(0, 6)}...${related.slice(-4)}` : `Level ${extra}`;
        } else if (txType === 7) {
          detail = related !== ethers.ZeroAddress ? `Level ${extra} from ${related.slice(0, 6)}...${related.slice(-4)}` : `Level ${extra}`;
        } else if (txType === 8) {
          detail = `Pool ${extra}`;
        } else if (txType === 9) {
          detail = `Pool ${extra} Reward`;
        }

        txs.push({
          type: typeName,
          amount: amounts[i],
          detail,
          timestamp: Number(timestamps[i]),
          isIncome,
        });
      }

      return { transactions: txs, total };
    } catch (err) {
      console.error("getTransactionsFromContract error:", err);
      return { transactions: [], total: 0 };
    }
  }, [account, getProvider]);

  const getBinaryFlushedEvents = useCallback(async (): Promise<{ amount: bigint; timestamp: number }[]> => {
    if (!account) return [];
    try {
      const provider = getProvider();
      const contract = getContract(provider);
      const filter = contract.filters.BinaryFlushed(account);
      let events: any[];
      try {
        events = await contract.queryFilter(filter, 0);
      } catch {
        const currentBlock = await provider.getBlockNumber();
        events = await contract.queryFilter(filter, Math.max(0, currentBlock - 100000));
      }
      const blocks = await Promise.all(events.map((e: any) => provider.getBlock(e.blockNumber)));
      return events.map((e: any, i: number) => ({
        amount: e.args?.[1] as bigint ?? 0n,
        timestamp: (blocks[i] as any)?.timestamp ?? 0,
      }));
    } catch (err) {
      console.error("getBinaryFlushedEvents error:", err);
      return [];
    }
  }, [account, getProvider]);

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

  return {
    account, loading, initialLoaded, isRegistered, userInfo, incomeInfo, binaryInfo, slabInfo,
    btcPoolBalance, tokenDecimals, totalUsers, profileOnChain,
    connect, register, approveToken, activatePackage,
    withdrawFunds, enterBoardPool, claimBinaryIncome, saveProfileOnChain, reactivatePackage, repurchase,
    getDirectReferrals, getTokenBalance, getTransactionsFromContract, getBinaryFlushedEvents, fetchUserData,
    formatAmount: (val: bigint) => formatTokenAmount(val, tokenDecimals),
  };
}
