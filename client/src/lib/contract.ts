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
  rpcUrls: ["https://data-seed-prebsc-1-s1.binance.org:8545/"],
  blockExplorerUrls: ["https://testnet.bscscan.com/"],
  nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
};

const isMainnet = import.meta.env.VITE_BSC_NETWORK === "mainnet";
export const NETWORK = isMainnet ? BSC_MAINNET : BSC_TESTNET;

// ── New MvaultContract + MvaultToken ──────────────────────────────────────────
export const MVAULT_CONTRACT_ADDRESS =
  import.meta.env.VITE_MVAULT_CONTRACT_ADDRESS || "0x0000000000000000000000000000000000000000";
export const MVT_TOKEN_ADDRESS =
  import.meta.env.VITE_MVT_TOKEN_ADDRESS || "0x0000000000000000000000000000000000000000";
// USDT token address (same for both old and new contracts)
export const TOKEN_ADDRESS =
  import.meta.env.VITE_PAYMENT_TOKEN_ADDRESS || "0x0D3E80cBc9DDC0a3Fdee912b99C50cd0b5761eE3";

// ── Legacy (old) contract — kept for board/swap pages ────────────────────────
export const CONTRACT_ADDRESS =
  import.meta.env.VITE_CONTRACT_ADDRESS || "0x6Ff2b61d1882e7a122b09a109F78F5b2E5ef174e";

export const DEPOSIT_ADMIN_WALLET = "0x127323b3053a901620f8d461c88fc6a7d9c7de2e";

// ── MvaultContract ABI ────────────────────────────────────────────────────────
export const MVAULT_ABI = [
  // Registration & activation
  "function register(address sponsor, address binaryParent, bool placeLeft) external",
  "function activate() external",
  // Virtual MVT operations
  "function sellMvt(uint256 amount) external",
  "function withdrawUsdt(uint256 amount) external",
  "function withdrawBtcPool(uint256 amount) external",
  // Rebirth
  "function rebirth(address subAccount, bool placeLeft) external",
  // Profile
  "function setProfile(string _displayName, string _email, string _phone, string _country) external",
  "function getProfile(address _user) view returns (string displayName, string email, string phone, string country, bool profileSet)",
  // Views
  "function getUserInfo(address u) view returns (bool isRegistered, bool isActive, address sponsor, uint256 directCount, address binaryParent, bool placedLeft, address leftChild, address rightChild, uint256 leftSubUsers, uint256 rightSubUsers, uint256 mvtBalance, uint256 totalReceived, uint256 totalSold, uint256 incomeLimit, uint256 usdtBalance, uint256 rebirthPool, uint256 btcPoolBalance, uint256 powerLegPoints, uint256 matchedPairs, address mainAccount, uint256 rebirthCount, uint256 joinedAt)",
  "function getBtcPoolInfo(address u) view returns (uint256 btcPoolBalance, uint256 totalBtcEarned)",
  "function canRebirth(address user) view returns (bool eligible, uint256 poolBalance)",
  "function getCurrentBinaryPairs(address u) view returns (uint256 currentPairs, uint256 newPairs)",
  "function getMvtPrice() view returns (uint256 buyPrice, uint256 sellPrice)",
  "function totalUsers() view returns (uint256)",
  "function getAllUsersCount() view returns (uint256)",
  "function getPoolBalances() view returns (uint256 binary, uint256 reserve, uint256 admin)",
  "function getMvtContractBalance() view returns (uint256)",
  "function usdtToken() view returns (address)",
  "function mvaultToken() view returns (address)",
  "function PACKAGE_PRICE() view returns (uint256)",
  "function INCOME_LIMIT() view returns (uint256)",
  // Events
  "event Registered(address indexed user, address indexed sponsor, address indexed binaryParent, bool placeLeft)",
  "event Activated(address indexed user, uint256 mvtMinted, uint256 grossMvt, uint256 levelAmt, uint256 binaryAmt, uint256 reserveAmt)",
  "event LevelIncomePaid(address indexed to, address indexed from, uint8 level, uint256 amount)",
  "event MvtSold(address indexed user, uint256 mvtAmount, uint256 usdtNet, uint256 usdtToBtcPool, uint256 usdtToIncome, uint256 usdtToRebirth)",
  "event BtcPoolCredited(address indexed user, uint256 amount)",
  "event BtcPoolWithdrawn(address indexed user, uint256 amount)",
  "event UsdtWithdrawn(address indexed user, uint256 amount)",
  "event Reborn(address indexed mainAccount, address indexed subAccount, uint256 rebirthIndex)",
  "event BinaryIncomeDistributed(uint256 totalPool, uint256 binary70, uint256 powerLeg30, uint256 totalPairs)",
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
  import.meta.env.VITE_BOARD_HANDLER_ADDRESS || "0xAFDf34f6e2FBa1D1E9b1E4e180821b463c3cB72D";
export const DEPOSIT_VAULT_ADDRESS =
  import.meta.env.VITE_DEPOSIT_VAULT_ADDRESS || "0xD307FB39d7d42B59AC46e28D71ef72019E9D5e38";
export const PANCAKE_ROUTER_ADDRESS =
  import.meta.env.VITE_PANCAKE_ROUTER_ADDRESS || "0xD99D1c33F9fC3444f8101754aBC46c52416550D1";
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
  "event BoardCompleted(address indexed owner, uint256 indexed boardLevel, uint256 reward, uint256 liquidity)",
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

export const PACKAGE_NAMES = ["None", "Starter", "Basic", "Pro", "Elite", "Stockiest", "Super Stockiest"];
export const PACKAGE_PRICES_USD = [0, 50, 200, 600, 1200, 2400, 4800];
export const STATUS_NAMES = ["Inactive", "Active", "Grace Period"];
export const BOARD_PRICES_USD = [0, 50, 180, 648, 2333, 8398, 30233, 108839, 391821, 1410555, 5077998];

export const TX_TYPE_NAMES = [
  "Activation", "Level Income", "Binary Income", "Sell MVT",
  "Withdraw USDT", "Withdraw BTC Pool", "Rebirth",
];
export const TX_TYPE_INCOME = [false, true, true, false, false, false, false];

// Income limit = $390 USDT (3× package price)
export const INCOME_LIMIT_USDT = 390;
export const PACKAGE_PRICE_USDT = 130;
