import { ethers } from "ethers";

export const BSC_MAINNET = {
  chainId: "0x38",
  chainName: "BNB Smart Chain",
  rpcUrls: ["https://bsc-dataseed1.binance.org/"],
  blockExplorerUrls: ["https://bscscan.com/"],
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
};

export const BSC_TESTNET = {
  chainId: "0x61",
  chainName: "BSC Testnet",
  rpcUrls: [
    "https://bsc-testnet-rpc.publicnode.com",
    "https://data-seed-prebsc-1-s1.binance.org:8545/",
  ],
  blockExplorerUrls: ["https://testnet.bscscan.com/"],
  nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
};

export const MCHAIN = {
  chainId: "0x760",  // 1888
  chainName: "MChain",
  rpcUrls: ["https://node.mymchain.com/api/rpc"],
  blockExplorerUrls: [],
  nativeCurrency: { name: "MxC", symbol: "MxC", decimals: 18 },
};

// Reliable public RPCs used for read-only simulation (staticCall)
export const BSC_TESTNET_RPC_LIST = [
  "https://bsc-testnet-rpc.publicnode.com",
  "https://data-seed-prebsc-1-s1.binance.org:8545/",
  "https://data-seed-prebsc-2-s1.binance.org:8545/",
];
export const BSC_MAINNET_RPC_LIST = [
  "https://bsc-rpc.publicnode.com",
  "https://bsc-dataseed1.binance.org/",
  "https://bsc-dataseed2.binance.org/",
];
// MChain RPC has no CORS headers — proxy through our own backend to avoid browser block
export const MCHAIN_RPC_LIST = [
  typeof window !== "undefined"
    ? `${window.location.origin}/api/rpc/mchain`
    : "https://node.mymchain.com/api/rpc",
];

// Returns a direct JsonRpcProvider (not MetaMask) for reliable eth_call simulation
export function getDirectProvider(): ethers.JsonRpcProvider {
  const net = import.meta.env.VITE_BSC_NETWORK;
  const rpcs = net === "mainnet"
    ? BSC_MAINNET_RPC_LIST
    : net === "mchain"
    ? MCHAIN_RPC_LIST
    : BSC_TESTNET_RPC_LIST;
  return new ethers.JsonRpcProvider(rpcs[0]);
}

// MChain block headers use a bech32 `miner` address that ethers.js v6 cannot
// parse, causing tx.wait() to throw BAD_DATA on every confirmed transaction.
// This helper polls eth_getTransactionReceipt directly (no block fetch) so we
// never hit the broken block-parsing path.  Works on all networks.
// Known custom error signatures → 4-byte selectors (computed at module load)
const KNOWN_ERROR_SIGS = [
  "NotAuthorized()", "AlreadyRegistered()", "NotRegistered()", "AlreadyActive()",
  "NotActive()", "InvalidSponsor()", "PositionTaken()", "InsufficientVirtualBalance()",
  "InsufficientUsdtBalance()", "InsufficientBtcPool()", "InsufficientRebirthPool()",
  "NoOpenBinarySlot()", "ZeroAddress()", "ZeroAmount()", "TransferFailed()",
  "BoardHandlerNotSet()", "InsufficientBtcPoolForBoard()", "ExceedsPool()",
  "IncomeNotExhausted()", "CannotDowngradePackage()",
  "NotEligibleForRebirth()", "SubAccountAlreadyRegistered()", "UseRebirthInstead()", "NoRebirthBalance()",
  "BelowMinStake()", "NoMvtMinted()", "AlreadyUnstaked()", "AlreadyLocked()",
  "StillLocked()", "InvalidIndex()", "NotMvaultContract()",
  "OnlyMvault()", "InsufficientBalance()", "InsufficientLiquidity()",
  "NotStakingModule()",
];
const ERROR_SELECTOR_MAP: Record<string, string> = {};
for (const sig of KNOWN_ERROR_SIGS) {
  const name = sig.split("(")[0];
  const selector = ethers.id(sig).slice(0, 10).toLowerCase();
  ERROR_SELECTOR_MAP[selector] = name;
}

const CONTRACT_ERROR_MESSAGES_EXPORT: Record<string, string> = {
  AlreadyRegistered:          "This wallet is already registered.",
  NotRegistered:              "This wallet is not registered.",
  AlreadyActive:              "Your account is already activated.",
  InvalidSponsor:             "Invalid sponsor address — they must be a registered member.",
  PositionTaken:              "That binary tree position is already taken. Try the other side.",
  InsufficientVirtualBalance: "Insufficient MVT balance.",
  InsufficientUsdtBalance:    "Insufficient USDT balance.",
  InsufficientBtcPool:        "Insufficient BTC pool balance.",
  InsufficientRebirthPool:    "Insufficient rebirth pool balance — need $130 in rebirth pool first.",
  NotEligibleForRebirth:      "Rebirth requires the PRO package ($130). STARTER accounts cannot rebirth.",
  SubAccountAlreadyRegistered:"That wallet is already registered — use a fresh, unregistered address.",
  UseRebirthInstead:          "Your rebirth pool has $130+ — use the Create Sub-Account button, not Claim.",
  NoRebirthBalance:           "Your rebirth pool is empty — sell MVT after your income limit is exhausted to fill it.",
  NoOpenBinarySlot:           "No open slot found in the binary tree.",
  ZeroAddress:                "Invalid address provided.",
  ZeroAmount:                 "Amount must be greater than zero.",
  TransferFailed:             "Token transfer failed. Check your USDT balance and approval.",
  NotAuthorized:              "Not authorized to call this function.",
  ExceedsPool:                "Amount exceeds pool balance.",
  BoardHandlerNotSet:         "Board module not configured yet.",
  InsufficientBtcPoolForBoard:"Insufficient BTC pool balance to enter the board.",
  NotActive:                  "Your account is not yet activated. Please activate ($130 USDT) before staking.",
  BelowMinStake:              "Minimum stake is $50 USDT.",
  NoMvtMinted:                "MVT minting failed — bonding curve issue, please contact support.",
  AlreadyUnstaked:            "This position has already been unstaked.",
  AlreadyLocked:              "This position is already locked.",
  StillLocked:                "This position is still in the lock period.",
  InvalidIndex:               "Invalid stake position index.",
  NotMvaultContract:          "Call not allowed from this address.",
  OnlyMvault:                 "Caller not authorized in MVT token (staking module address mismatch).",
  InsufficientLiquidity:      "MVT pool has insufficient liquidity for this operation.",
  NotStakingModule:           "Caller is not the staking module.",
};

async function tryDecodeRevertReason(txHash: string, rpcUrl: string): Promise<string | null> {
  try {
    const txRes = await fetch(rpcUrl, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "eth_getTransactionByHash", params: [txHash], id: 1 }),
    });
    const tx = (await txRes.json()).result;
    if (!tx) return null;

    const callRes = await fetch(rpcUrl, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", method: "eth_call",
        params: [{ from: tx.from, to: tx.to, data: tx.input, value: tx.value }, tx.blockNumber ?? "latest"],
        id: 2,
      }),
    });
    const callJson = await callRes.json();

    // Different nodes encode revert data differently
    let revertData: string | null = null;
    if (callJson.error?.data && typeof callJson.error.data === "string") {
      revertData = callJson.error.data;
    } else if (typeof callJson.result === "string" && callJson.result.length >= 10 && callJson.result !== "0x") {
      revertData = callJson.result;
    }

    if (!revertData || revertData === "0x" || revertData.length < 10) return null;

    const selector = revertData.slice(0, 10).toLowerCase();

    // Standard Error(string) — 0x08c379a0
    if (selector === "0x08c379a0") {
      try {
        const iface = new ethers.Interface(["function Error(string)"]);
        const decoded = iface.decodeFunctionData("Error", revertData);
        return `[Error] ${decoded[0]}`;
      } catch { /* fall through */ }
    }

    // Standard Panic(uint256) — 0x4e487b71
    if (selector === "0x4e487b71") {
      try {
        const code = parseInt(revertData.slice(10), 16);
        const PANIC_CODES: Record<number, string> = {
          0x01: "assert failed", 0x11: "arithmetic overflow/underflow",
          0x12: "division by zero", 0x21: "invalid enum value",
          0x22: "invalid storage array", 0x31: "pop on empty array",
          0x32: "array index out of bounds", 0x41: "too much memory",
          0x51: "bad function pointer",
        };
        return `[Panic] ${PANIC_CODES[code] ?? `code ${code}`}`;
      } catch { /* fall through */ }
    }

    const errorName = ERROR_SELECTOR_MAP[selector];
    if (errorName) {
      const friendly = CONTRACT_ERROR_MESSAGES_EXPORT[errorName];
      return friendly ? `[${errorName}] ${friendly}` : errorName;
    }
    return `Revert selector: ${selector}`;
  } catch {
    return null;
  }
}

export async function waitForTx(txHash: string): Promise<void> {
  const rpcUrl = import.meta.env.VITE_BSC_NETWORK === "mchain"
    ? (typeof window !== "undefined"
        ? `${window.location.origin}/api/rpc/mchain`
        : "https://node.mymchain.com/api/rpc")
    : import.meta.env.VITE_BSC_NETWORK === "mainnet"
    ? BSC_MAINNET_RPC_LIST[0]
    : BSC_TESTNET_RPC_LIST[0];

  for (let i = 0; i < 120; i++) {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", method: "eth_getTransactionReceipt",
        params: [txHash], id: 1,
      }),
    });
    const data = await res.json();
    const receipt = data.result;
    if (receipt) {
      if (receipt.status === "0x0") {
        const reason = await tryDecodeRevertReason(txHash, rpcUrl);
        throw new Error(reason ?? "Transaction reverted on-chain");
      }
      return;
    }
    await new Promise(r => setTimeout(r, 2500));
  }
  throw new Error("Timeout waiting for transaction confirmation");
}

const _net = import.meta.env.VITE_BSC_NETWORK;
export const NETWORK = _net === "mainnet" ? BSC_MAINNET : _net === "mchain" ? MCHAIN : BSC_TESTNET;

// ── New MvaultContract + MvaultToken ──────────────────────────────────────────
export const MVAULT_CONTRACT_ADDRESS =
  import.meta.env.VITE_MVAULT_CONTRACT_ADDRESS || "";
export const MVT_TOKEN_ADDRESS =
  import.meta.env.VITE_MVT_TOKEN_ADDRESS || "";
export const TOKEN_ADDRESS =
  import.meta.env.VITE_PAYMENT_TOKEN_ADDRESS || "";

export const CONTRACT_ADDRESS =
  import.meta.env.VITE_CONTRACT_ADDRESS || "";

export const DEPOSIT_ADMIN_WALLET = "0x04e8c5b49de683c5b44ef1269bd5ee4f338868c4";

// ── MvaultContract ABI ────────────────────────────────────────────────────────
export const MVAULT_ABI = [
  // Custom errors
  "error NotAuthorized()",
  "error AlreadyRegistered()",
  "error NotRegistered()",
  "error AlreadyActive()",
  "error NotActive()",
  "error InvalidSponsor()",
  "error PositionTaken()",
  "error InsufficientVirtualBalance()",
  "error InsufficientUsdtBalance()",
  "error InsufficientBtcPool()",
  "error InsufficientRebirthPool()",
  "error NoOpenBinarySlot()",
  "error ZeroAddress()",
  "error ZeroAmount()",
  "error TransferFailed()",
  "error BoardHandlerNotSet()",
  "error InsufficientBtcPoolForBoard()",
  "error ExceedsPool()",
  "error IncomeNotExhausted()",
  "error CannotDowngradePackage()",
  // MvaultStaking errors (bubbled through MvaultContract)
  "error BelowMinStake()",
  "error NoMvtMinted()",
  "error AlreadyUnstaked()",
  "error AlreadyLocked()",
  "error StillLocked()",
  "error InvalidIndex()",
  "error NotMvaultContract()",
  // Registration & activation
  "function register(address sponsor, address binaryParent, bool placeLeft) external",
  "function activate(uint8 pkg) external",
  "function activateFromBalance(uint8 pkg) external",
  "function registerAndActivateFor(address newUser, address binaryParent, bool placeLeft, uint8 pkg) external",
  "function reactivate(uint8 pkg) external",
  "function reactivateFromBalance(uint8 pkg) external",
  // Virtual MVT operations
  "function sellMvt(uint256 amount) external",
  "function withdrawUsdt(uint256 amount) external",
  "function withdrawBtcPool(uint256 amount) external",
  // Rebirth
  "function rebirth(address subAccount, bool placeLeft) external",
  "function claimRebirthBalance() external",
  // Profile
  "function setProfile(string _displayName, string _email, string _phone, string _country) external",
  "function getProfile(address _user) view returns (string displayName, string email, string phone, string country, bool profileSet)",
  "function setBtcPoolRate(uint8 _rate) external",
  // Public state — users mapping (32 fields incl. btcPoolRate)
  "function users(address) view returns (bool isRegistered, bool isActive, address sponsor, uint256 directCount, address binaryParent, bool placedLeft, address leftChild, address rightChild, uint256 leftSubVolume, uint256 rightSubVolume, uint256 mvtBalance, uint256 totalReceived, uint256 totalSold, uint256 incomeLimit, uint256 usdtBalance, uint256 rebirthPool, uint256 totalUsdtEarned, uint256 btcPoolBalance, uint256 totalBtcEarned, uint256 packagePrice, uint256 incomeLimitCap, address mainAccount, uint256 rebirthCount, uint8 rank, uint256 teamSalesUsdt, uint256 joinedAt, string displayName, string email, string phone, string country, bool profileSet, uint8 btcPoolRate)",
  // Public pool variables
  "function communityPool() view returns (uint256)",
  "function reservePool() view returns (uint256)",
  "function adminPool() view returns (uint256)",
  "function rankPool() view returns (uint256)",
  "function totalUsers() view returns (uint256)",
  "function boardHandler() view returns (address)",
  "function stakingModule() view returns (address)",
  // Views
  "function getBtcPoolInfo(address u) view returns (uint256 btcPoolBalance, uint256 totalBtcEarned)",
  "function canRebirth(address user) view returns (bool eligible, uint256 poolBalance)",
  "function getMvtPrice() view returns (uint256 buyPrice, uint256 sellPrice)",
  "function getDirectReferralsPaginated(address _user, uint256 _offset, uint256 _limit) view returns (address[] referrals, uint256 total)",
  "function getTransactions(address user, uint256 offset, uint256 limit) view returns (tuple(uint8 txType, uint32 ts, uint256 amount, uint8 level, address addr)[] records, uint256 total)",
  "function usdtToken() view returns (address)",
  "function mvaultToken() view returns (address)",
  // Board pool
  "function enterBoardPool() external",
  "function getUserBoardStats(address user) view returns (uint256 entries, uint256 totalRewards)",
  // Admin setters
  "function setCommunityWallet(address _wallet) external",
  "function setPlacementRates(uint256[30] _rates) external",
  "function setRefsPerGroup(uint256 _refs) external",
  "function withdrawCommunityPool(address to, uint256 amount) external",
  "function withdrawAdminPool(address to, uint256 amount) external",
  "function withdrawReservePool(address to, uint256 amount) external",
  "function drainRankPool() external",
  "function setUserRanks(address[] addrs, uint8[] ranks_) external",
  // Events
  "event Registered(address indexed user, address indexed sponsor, address indexed binaryParent, bool placeLeft)",
  "event Activated(address indexed user, uint256 mvtMinted, uint256 grossMvt, uint256 levelAmt, uint256 placementAmt, uint256 adminAmt)",
  "event LevelIncomePaid(address indexed to, address indexed from, uint8 level, uint256 amount)",
  "event LevelIncomeSkipped(address indexed upline, uint8 level, uint256 amount)",
  "event PlacementIncomePaid(address indexed to, address indexed from, uint8 level, uint256 amount)",
  "event MvtSold(address indexed user, uint256 mvtAmount, uint256 usdtNet, uint256 usdtToBtcPool, uint256 usdtToIncome, uint256 usdtToRebirth)",
  "event BtcPoolCredited(address indexed user, uint256 amount)",
  "event BtcPoolWithdrawn(address indexed user, uint256 amount)",
  "event UsdtWithdrawn(address indexed user, uint256 amount)",
  "event Reborn(address indexed mainAccount, address indexed subAccount, uint256 rebirthIndex)",
  "event Reactivated(address indexed user, uint256 pkgPrice, uint256 grossMvt, bool upgraded)",
  "event RankIncomePaid(address indexed to, address indexed from, uint8 rank, uint256 amount)",
  "event RankIncomeDistributed(uint256 totalPool, uint256 recipientCount)",
  "event BoardEntered(address indexed user, uint256 boardLevel, uint256 usdtDeducted)",
  "event BoardRewardCredited(address indexed user, uint256 usdtAmount, uint256 boardLevel)",
  // Staking
  "function stakeFromBalance(uint256 usdtAmount, bool isLocked) external",
  "function stake(uint256 usdtAmount, bool isLocked) external",
  "function unstake(uint256 stakeIndex) external",
  "function convertToLocked(uint256 stakeIndex) external",
  "function getStakeCount(address user) view returns (uint256)",
  "function getStake(address user, uint256 index) view returns (uint256 mvtAmount, uint256 usdtInvested, uint256 stakedAt, uint256 lockedSince, bool active)",
  "function getActiveStakes(address user) view returns (uint256[] indices, uint256[] mvtAmounts, uint256[] usdtInvestedArr, uint256[] stakedAts, uint256[] lockedSinces)",
  "function MIN_STAKE_USDT() pure returns (uint256)",
  "function LOCK_DURATION() pure returns (uint256)",
  "function FLEX_CAP_MULT() pure returns (uint256)",
  "event Staked(address indexed user, uint256 stakeIndex, uint256 usdtAmount, uint256 mvtMinted, bool isLocked)",
  "event Unstaked(address indexed user, uint256 stakeIndex, uint256 mvtReturned, uint256 usdtReceived, uint256 adminCapCut)",
  "event ConvertedToLocked(address indexed user, uint256 stakeIndex, uint256 lockedSince)",
  "event StakeLevelIncomePaid(address indexed to, address indexed from, uint8 level, uint256 usdtAmount)",
];

// ── MvaultToken ABI ───────────────────────────────────────────────────────────
export const MVT_ABI = [
  "function getBuyPrice() view returns (uint256)",
  "function getSellPrice() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function totalLiquidity() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "event TokensMinted(address indexed to, uint256 usdtAmount, uint256 mvtAmount)",
  "event TokensBurned(address indexed from, uint256 mvtAmount, uint256 usdtAmount)",
  "event PriceUpdated(uint256 newBuyPrice, uint256 newSellPrice)",
];

// ── Legacy ABI (for board, swap pages) ───────────────────────────────────────
export const MLM_ABI = [
  "function register(uint256 _sponsorId, uint256 _binaryParentId, bool _placeLeft) external",
  "function activatePackage(uint8 _pkg) external",
  "function withdraw(uint256 _amount) external",
  "function enterBoardPool() external",
  "function reactivate(uint8 _pkg) external",
  "function repurchase() external",
  "function setProfile(string _displayName, string _email, string _phone, string _country) external",
  "function isRegistered(address) view returns (bool)",
  "function tokenDecimals() view returns (uint8)",
  "function paymentToken() view returns (address)",
  "function userIdToAddress(uint256 _id) view returns (address)",
  "function getUserInfo(address _user) view returns (uint256 userId, address sponsor, address binaryParent, address leftChild, address rightChild, uint8 placementSide, uint8 userPackage, uint8 status, uint256 walletBalance, uint256 tempWalletBalance, uint256 totalEarnings, uint256 directReferralCount, uint256 joinedAt)",
  "function getIncomeInfo(address _user) view returns (uint256 totalDirectIncome, uint256 totalBinaryIncome, uint256 totalMatchingOverrideIncome, uint256 totalWithdrawalMatchIncome, uint256 totalEarnings, uint256 totalWithdrawn, uint256 maxIncome)",
  "function getBinaryInfo(address _user) view returns (uint256 leftBusiness, uint256 rightBusiness, uint256 carryLeft, uint256 carryRight, uint256 todayBinaryIncome, uint256 dailyCap, uint256 claimableBinaryIncome, uint256 binaryDepth)",
  "function getProfile(address _user) view returns (string displayName, string email, string phone, string country, bool profileSet)",
  "function getBtcPoolBalance(address _user) view returns (uint256)",
  "function getDirectReferralsPaginated(address _user, uint256 _offset, uint256 _limit) view returns (address[] referrals, uint256 total)",
  "function getTotalUsers() view returns (uint256)",
  "function getUserIdByAddress(address _user) view returns (uint256)",
  "function getAddressByUserId(uint256 _userId) view returns (address)",
  "function getUserTransactionsPaginated(address _user, uint256 _offset, uint256 _limit) view returns (uint8[] txTypes, uint256[] amounts, uint256[] timestamps, address[] relatedUsers, uint8[] extraDatas, uint256 total)",
  "function claimBinaryIncome() external",
  "event BinaryFlushed(address indexed user, uint256 flushedAmount)",
];

export const BOARD_HANDLER_ADDRESS =
  import.meta.env.VITE_BOARD_HANDLER_ADDRESS || "";

// MvaultView — read-only helper that re-exposes functions removed from
// MvaultContract to stay under the EIP-170 24 576-byte limit.
// Set VITE_MVAULT_VIEW_ADDRESS in .env after deploying MvaultView.sol.
export const MVAULT_VIEW_ADDRESS =
  import.meta.env.VITE_MVAULT_VIEW_ADDRESS || "";

export const MVAULT_VIEW_ABI = [
  // Pool balances
  "function getAllUsersCount() view returns (uint256)",
  "function getPoolBalances() view returns (uint256 community, uint256 reserve, uint256 admin)",
  "function getAllPoolBalances() view returns (uint256 community, uint256 reserve, uint256 admin, uint256 rank)",
  "function canEnterBoard(address _user) view returns (bool eligible, uint256 btcBalance, uint256 boardPrice)",
  // Token balances held by MvaultContract
  "function getMvtContractBalance() view returns (uint256)",
  "function getUsdtContractBalance() view returns (uint256)",
  // Package / income constants
  "function PACKAGE_PRICE() view returns (uint256)",
  "function INCOME_LIMIT() view returns (uint256)",
  "function PRICE_STARTER() view returns (uint256)",
  "function INCOME_STARTER() view returns (uint256)",
  "function PRICE_PRO() view returns (uint256)",
  "function INCOME_PRO() view returns (uint256)",
  "function getPackageParams(uint8 pkg) view returns (uint256 price, uint256 incomeCap)",
  // Staking constants
  "function getLockDuration() view returns (uint256)",
  "function getMinStakeUsdt() view returns (uint256)",
  "function getFlexCapMult() view returns (uint256)",
  // Board handler delegates
  "function getBoardPrice(uint256 boardLevel) view returns (uint256)",
  "function getBoardQueueLength(uint256 boardLevel) view returns (uint256)",
  "function getBoardCurrentIndex(uint256 boardLevel) view returns (uint256)",
  "function getBoardMatrixInfo(uint256 boardLevel, uint256 index) view returns (address owner, uint256 filledCount, bool completed)",
  "function getBoardSnapshot(uint256 fromLevel, uint256 toLevel) view returns (tuple(uint256 level, uint256 price, uint256 queueLength, uint256 currentIndex)[] tiers)",
  // User-list helpers
  "function getUserSlice(uint256 offset, uint256 limit) view returns (address[] slice)",
  // Address lookups
  "function getMvaultAddress() view returns (address)",
  "function getMvtTokenAddress() view returns (address)",
  "function getUsdtTokenAddress() view returns (address)",
  "function getBoardHandlerAddress() view returns (address)",
  "function getStakingAddress() view returns (address)",
  "function mvault() view returns (address)",
];
export const DEPOSIT_VAULT_ADDRESS =
  import.meta.env.VITE_DEPOSIT_VAULT_ADDRESS || "";
export const PANCAKE_ROUTER_ADDRESS =
  import.meta.env.VITE_PANCAKE_ROUTER_ADDRESS || "";
export const BTCB_TOKEN_ADDRESS = import.meta.env.VITE_BTCB_TOKEN_ADDRESS || "";

export const BOARD_HANDLER_ABI = [
  "function virtualRewardBalance(address) view returns (uint256)",
  "function totalVirtualRewards(address) view returns (uint256)",
  "function totalSwappedToBTC(address) view returns (uint256)",
  "function getVirtualRewardBalance(address _user) view returns (uint256 balance, uint256 totalEarned)",
  "function getTotalSwappedToBTC(address _user) view returns (uint256)",
  "function getSwapEstimate(uint256 _usdtAmount) view returns (uint256 btcbAmount)",
  "function claimAndSwapToBTC(uint256 _amount, uint256 _minBtcbOut) external",
  "function btcbToken() view returns (address)",
  "function pancakeRouter() view returns (address)",
  "function boardPrices(uint256) view returns (uint256)",
  "function getBoardPrice(uint256 _boardLevel) view returns (uint256)",
  "function getBoardQueueLength(uint256 _boardLevel) view returns (uint256)",
  "function getBoardMatrixInfo(uint256 _boardLevel, uint256 _index) view returns (address owner, uint256 filledCount, bool completed)",
  "function getBoardCurrentIndex(uint256 _boardLevel) view returns (uint256)",
  "function getUserBoardStats(address _user) view returns (uint256 totalEntries, uint256 totalRewards)",
  "function pendingBoardRewards(address) view returns (uint256)",
  "function pendingBoardLevel(address) view returns (uint256)",
  "function settlePendingReward(address user) external",
  "event BoardCompleted(address indexed owner, uint256 indexed boardLevel, uint256 reward, uint256 liquidity)",
  "event PendingBoardReward(address indexed user, uint256 amount, uint256 boardLevel)",
  "event PendingBoardRewardSettled(address indexed user, uint256 amount)",
  "event VirtualRewardCredited(address indexed user, uint256 amount, uint256 boardLevel)",
  "event SwappedToBTC(address indexed user, uint256 usdtAmount, uint256 btcbAmount)",
  "event Deposited(address indexed user, uint256 amount)",
  "event AdminWithdrawn(address indexed to, uint256 amount)",
  "function deposit(uint256 _amount) external",
  "function depositBalance(address) view returns (uint256)",
  "function getDepositBalance(address _user) view returns (uint256)",
  "function getDepositHistory(address _user) view returns (uint256[] amounts, uint256[] timestamps)",
  "function adminWithdrawDeposits(address _to, uint256 _amount) external",
];

export const PANCAKE_ROUTER_ABI = [
  "function getAmountsOut(uint256 amountIn, address[] calldata path) view returns (uint256[] memory amounts)",
];

export const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

// ── Contract factory helpers ──────────────────────────────────────────────────
export function getMvaultContract(signerOrProvider: ethers.Signer | ethers.Provider) {
  return new ethers.Contract(MVAULT_CONTRACT_ADDRESS, MVAULT_ABI, signerOrProvider);
}

export function getMvtTokenContract(signerOrProvider: ethers.Signer | ethers.Provider) {
  return new ethers.Contract(MVT_TOKEN_ADDRESS, MVT_ABI, signerOrProvider);
}

export function getTokenContract(signerOrProvider: ethers.Signer | ethers.Provider) {
  return new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, signerOrProvider);
}

export function getContract(signerOrProvider: ethers.Signer | ethers.Provider) {
  return new ethers.Contract(CONTRACT_ADDRESS, MLM_ABI, signerOrProvider);
}

export const getMlmContract = getContract;

export function getBoardHandlerContract(signerOrProvider: ethers.Signer | ethers.Provider) {
  return new ethers.Contract(BOARD_HANDLER_ADDRESS, BOARD_HANDLER_ABI, signerOrProvider);
}

export function getMvaultViewContract(signerOrProvider: ethers.Signer | ethers.Provider) {
  if (!MVAULT_VIEW_ADDRESS) throw new Error("VITE_MVAULT_VIEW_ADDRESS not set — deploy MvaultView.sol first");
  return new ethers.Contract(MVAULT_VIEW_ADDRESS, MVAULT_VIEW_ABI, signerOrProvider);
}

// ── MvaultDistributor ─────────────────────────────────────────────────────────
export const DISTRIBUTOR_ADDRESS: string =
  import.meta.env.VITE_DISTRIBUTOR_ADDRESS || "";

export const DISTRIBUTOR_ABI = [
  "error AlreadyClaimed()",
  "error InvalidProof()",
  "error PoolMismatch()",
  "function currentCycle() view returns (uint256)",
  "function hasClaimed(uint256 cycle, address user) view returns (bool)",
  "function distributions(uint256 cycle) view returns (bytes32 root, uint256 totalPool, uint256 claimedTotal, uint256 committedAt)",
  "function claimDistribution(uint256 cycle, uint256 binaryShare, uint256 powerLegShare, uint256 newMatchedVol, uint256 newPowerLegPts, bytes32[] calldata proof) external",
  "function batchClaim(uint256[] cycles, uint256[] binaryShares, uint256[] powerLegShares, uint256[] newMatchedVols, uint256[] newPowerLegPts, bytes32[][] proofs) external",
  "function commitDistribution(bytes32 root, uint256 totalPool) external",
];

export function getMvaultDistributorContract(signerOrProvider: ethers.Signer | ethers.Provider) {
  if (!DISTRIBUTOR_ADDRESS) throw new Error("VITE_DISTRIBUTOR_ADDRESS not configured — deploy MvaultDistributor first");
  return new ethers.Contract(DISTRIBUTOR_ADDRESS, DISTRIBUTOR_ABI, signerOrProvider);
}

export function getDepositVaultContract(signerOrProvider: ethers.Signer | ethers.Provider) {
  return new ethers.Contract(DEPOSIT_VAULT_ADDRESS, BOARD_HANDLER_ABI, signerOrProvider);
}

export function getPancakeRouterContract(signerOrProvider: ethers.Signer | ethers.Provider) {
  return new ethers.Contract(PANCAKE_ROUTER_ADDRESS, PANCAKE_ROUTER_ABI, signerOrProvider);
}

export function formatTokenAmount(amount: bigint, decimals: number = 18): string {
  return ethers.formatUnits(amount, decimals);
}

export function parseTokenAmount(amount: string, decimals: number = 18): bigint {
  return ethers.parseUnits(amount, decimals);
}

export function shortenAddress(addr: string): string {
  if (!addr) return "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function decodeContractError(err: any): string {
  // Ethers v6: custom errors set err.errorName when the error is in the ABI
  if (err?.errorName && CONTRACT_ERROR_MESSAGES_EXPORT[err.errorName]) {
    return CONTRACT_ERROR_MESSAGES_EXPORT[err.errorName];
  }
  // User rejected the transaction
  if (err?.code === "ACTION_REJECTED" || err?.code === 4001) {
    return "Transaction was rejected in your wallet.";
  }
  // Fallback chain
  return err?.reason || err?.shortMessage || err?.message || "Transaction failed. Please try again.";
}

export const PACKAGE_NAMES = ["None", "Starter", "Basic", "Pro", "Elite", "Stockiest", "Super Stockiest"];
export const PACKAGE_PRICES_USD = [0, 50, 200, 600, 1200, 2400, 4800];
export const STATUS_NAMES = ["Inactive", "Active", "Grace Period"];
export const BOARD_PRICES_USD = [0, 50, 180, 648, 2333, 8398, 30233, 108839, 391821, 1410555, 5077998];

export const TX_TYPE_NAMES = [
  "Activation", "Level Income", "Level Missed", "Placement Income",
  "Withdraw USDT", "Sell MVT", "BTC Pool", "Rebirth",
  "Board Entry", "Board Reward", "Rank Income", "Staking Level",
];
export const TX_TYPE_INCOME = [false, true, false, true, false, false, false, false, false, true, true, true];

// Income limit = $390 USDT (3× package price)
export const INCOME_LIMIT_USDT = 390;
export const PACKAGE_PRICE_USDT = 130;
