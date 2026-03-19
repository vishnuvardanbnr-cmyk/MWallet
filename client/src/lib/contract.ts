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
export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || "0x6Ff2b61d1882e7a122b09a109F78F5b2E5ef174e";
export const TOKEN_ADDRESS = import.meta.env.VITE_PAYMENT_TOKEN_ADDRESS || "0x0D3E80cBc9DDC0a3Fdee912b99C50cd0b5761eE3";
export const DEPOSIT_ADMIN_WALLET = "0x127323b3053a901620f8d461c88fc6a7d9c7de2e";

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
  "function getBinarySlabInfo(address _user) view returns (uint256[4] carryLeftSlabs, uint256[4] carryRightSlabs, uint256[4] matchableSlabs, uint256[4] potentialIncomeSlabs, uint256[4] rates)",
  "function claimBinaryIncome() external",
  "function autoDistributeBinaryIncome(uint256 _batchNumber) external",
  "function binaryBatchSize() view returns (uint256)",
  "function getTotalBatches() view returns (uint256)",
  "function setBinaryBatchSize(uint256 _size) external",
  "function setBinaryProcessor(address _processor, bool _status) external",
  "function getProfile(address _user) view returns (string displayName, string email, string phone, string country, bool profileSet)",
  "function getBtcPoolBalance(address _user) view returns (uint256)",
  "function getBoardPrice(uint256 _boardLevel) view returns (uint256)",
  "function getBoardQueueLength(uint256 _boardLevel) view returns (uint256)",
  "function getBoardMatrixInfo(uint256 _boardLevel, uint256 _index) view returns (address owner, uint256 filledCount, bool completed)",
  "function getBoardCurrentIndex(uint256 _boardLevel) view returns (uint256)",
  "function getDirectReferralsPaginated(address _user, uint256 _offset, uint256 _limit) view returns (address[] referrals, uint256 total)",
  "function getTotalUsers() view returns (uint256)",
  "function getContractBalance() view returns (uint256)",
  "function getUserIdByAddress(address _user) view returns (uint256)",
  "function getAddressByUserId(uint256 _userId) view returns (address)",
  "function packagePrices(uint256) view returns (uint256)",
  "function getMaxIncomeLimit(uint8 _pkg) view returns (uint256)",
  "function getPackagePrice(uint8 _pkg) view returns (uint256)",
  "function getUserTransactionCount(address _user) view returns (uint256)",
  "function getUserTransactionsPaginated(address _user, uint256 _offset, uint256 _limit) view returns (uint8[] txTypes, uint256[] amounts, uint256[] timestamps, address[] relatedUsers, uint8[] extraDatas, uint256 total)",
  "event PackageActivated(address indexed user, uint8 pkg, uint256 amountPaid)",
  "event PackageUpgraded(address indexed user, uint8 oldPkg, uint8 newPkg, uint256 amountPaid)",
  "event Withdrawal(address indexed user, uint256 netAmount, uint256 fee)",
  "event Reactivated(address indexed user, uint8 pkg, uint256 amountPaid)",
  "event DirectIncomeDistributed(address indexed recipient, address indexed from, uint256 amount)",
  "event BinaryIncomeDistributed(address indexed recipient, uint256 income, uint256 matchedVolume)",
  "event MatchingOverrideDistributed(address indexed recipient, address indexed from, uint256 amount, uint256 level)",
  "event BinaryIncomeClaimed(address indexed user, uint256 amount)",
  "event WithdrawalMatchDistributed(address indexed recipient, address indexed from, uint256 amount, uint256 level)",
  "event BinaryFlushed(address indexed user, uint256 flushedAmount)",
  "event GracePeriodStarted(address indexed user, uint256 startTime)",
  "event GracePeriodExpired(address indexed user, uint256 flushedAmount)",
];

export const BOARD_HANDLER_ADDRESS = import.meta.env.VITE_BOARD_HANDLER_ADDRESS || "0xD307FB39d7d42B59AC46e28D71ef72019E9D5e38";

export const PANCAKE_ROUTER_ADDRESS = import.meta.env.VITE_PANCAKE_ROUTER_ADDRESS || "0xD99D1c33F9fC3444f8101754aBC46c52416550D1";

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

export const PACKAGE_NAMES = ["None", "Starter", "Basic", "Pro", "Elite", "Stockiest", "Super Stockiest"];
export const PACKAGE_PRICES_USD = [0, 50, 200, 600, 1200, 2400, 4800];
export const STATUS_NAMES = ["Inactive", "Active", "Grace Period"];

export const BOARD_PRICES_USD = [0, 50, 180, 648, 2333, 8398, 30233, 108839, 391821, 1410555, 5077998];

export const TX_TYPE_NAMES = [
  "Activation", "Upgrade", "Reactivation", "Withdrawal",
  "Direct Sponsor", "Binary Matching", "Matching Override", "Withdrawal Match",
  "Board Entry", "Board Reward", "BTC Pool Deduction", "Withdrawal Match Deduction"
];

export const TX_TYPE_INCOME = [false, false, false, false, true, true, true, true, false, true, false, false];

export function getContract(signerOrProvider: ethers.Signer | ethers.Provider) {
  return new ethers.Contract(CONTRACT_ADDRESS, MLM_ABI, signerOrProvider);
}

export function getTokenContract(signerOrProvider: ethers.Signer | ethers.Provider) {
  return new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, signerOrProvider);
}

export function getBoardHandlerContract(signerOrProvider: ethers.Signer | ethers.Provider) {
  return new ethers.Contract(BOARD_HANDLER_ADDRESS, BOARD_HANDLER_ABI, signerOrProvider);
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
