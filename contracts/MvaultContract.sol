// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// ─────────────────────────────────────────────
// MvaultToken interface (minimal surface needed)
// ─────────────────────────────────────────────
interface IMvaultToken {
    function addLiquidityAndMint(address to, uint256 usdtAmount) external;
    function sell(uint256 amount) external;
    function getBuyPrice() external view returns (uint256);
    function getSellPrice() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

// ─────────────────────────────────────────────
// MvaultBoardMatrix interface
// ─────────────────────────────────────────────
interface IMvaultBoardMatrix {
    function enterBoard(address user, uint256 boardLevel) external;
    function getBoardPrice(uint256 boardLevel) external view returns (uint256);
    function getBoardQueueLength(uint256 boardLevel) external view returns (uint256);
    function getBoardMatrixInfo(uint256 boardLevel, uint256 index) external view returns (address owner, uint256 filledCount, bool completed);
    function getBoardCurrentIndex(uint256 boardLevel) external view returns (uint256);
}

// ─────────────────────────────────────────────────────────────────────────────
// MvaultContract
//
// Packages (chosen at activation):
//   pkg=1  STARTER  $55   → income limit $165  (3×)
//   pkg=2  PRO      $130  → income limit $390  (3×)
//
// Activation:
//   Chosen pkg price → MvaultToken mints MVT (token keeps 10% for liquidity)
//   Gross MVT (pre-deduction) is the basis for all splits:
//     30% → level income   (10 upline levels)
//     30% → binaryPool     (admin distributes per cycle)
//     20% → adminPool      (admin free pool)
//     10% → rank income    (M1–M5 sponsor-tree walk, unqualified → adminPool)
//     10% → liquidity      (handled by MvaultToken internally)
//
// Income limit  = 3 × pkg price per user.
//   When user sells MVT → USDT first fills income limit → excess to rebirthPool.
//   Once incomeLimit = 0 all sell proceeds go to rebirthPool.
//
// Rebirth:
//   Requires rebirthPool ≥ user's packagePrice.
//   On rebirth(subAccount):
//     • packagePrice deducted from rebirthPool  → funds sub-account activation.
//     • packagePrice transferred from rebirthPool → credited to main account usdtBalance.
//     • incomeLimit resets to user's incomeLimitCap.
//     • Sub-account registered + activated (same distributions).
//     • Sub-account's level-income sponsor = main account's sponsor
//       → so sub-account's L1 income goes to the person who referred the main account.
//     • Sub-account placed in binary tree (BFS from main account for open slot).
//
// Level rates (% of gross MVT, sum = 40%):
//   L1=20%  L2=5%  L3=4%  L4=3%  L5=2%  L6=1%  L7=1%  L8-L15=0.5% each
//
// Qualification to receive level income:
//   L1 → 0 directs   L2–L4 → 2 directs   L5–L7 → 5 directs   L8–L15 → 10 directs
//
// Binary distribution (admin, 2-step per cycle):
//   Step 1 distributeBinaryIncome:  70% to pair matchers; sets powerLegPoints = newPairs×3 (STARTER) or newPairs×5 (PRO)
//   Step 2 distributePowerLeg:      30% proportional to powerLegPoints; resets points to 0
//
// Virtual MVT balance:
//   All MVT held by this contract, tracked per user.
//   sellMvt(amount) → burns MVT → USDT routed through income limit / rebirthPool.
//   withdrawUsdt(amount) → user pulls accumulated USDT balance.
// ─────────────────────────────────────────────────────────────────────────────
contract MvaultContract is Ownable, ReentrancyGuard {

    // ── External contracts ────────────────────────────────────────────────────
    IERC20              public immutable usdtToken;
    IMvaultToken        public           mvaultToken;
    IMvaultBoardMatrix  public           boardHandler;

    // ── Package constants ──────────────────────────────────────────────────────
    // pkg=1  STARTER : $55  → income limit $165 (3×)
    // pkg=2  PRO     : $130 → income limit $390 (3×)
    uint256 public constant PRICE_STARTER  = 55  * 1e18;
    uint256 public constant INCOME_STARTER = 165 * 1e18;
    uint256 public constant PRICE_PRO      = 130 * 1e18;
    uint256 public constant INCOME_PRO     = 390 * 1e18;

    // ── Pool allocation constants ──────────────────────────────────────────────
    uint256 public constant LEVEL_ALLOC    = 30;          // % of gross MVT → level income (10 levels)
    uint256 public constant BINARY_ALLOC   = 30;          // % of gross MVT → binary pool
    uint256 public constant ADMIN_ALLOC    = 20;          // % of gross MVT → admin free pool
    uint256 public constant RANK_ALLOC     = 10;          // % of gross MVT → rank income pool
    // Liquidity 10% handled internally by MvaultToken (only 90% minted)
    uint256 public constant BTC_POOL_RATE  = 10;          // % of sell USDT → user BTC pool

    // ── Rank qualification constants ──────────────────────────────────────────
    // Team sales threshold for M1 ($2000 USDT, 18 decimals)
    uint256 public constant M1_TEAM_SALES  = 2000 * 1e18;
    // Minimum direct sponsors for M1
    uint256 public constant M1_MIN_DIRECTS = 5;
    // Minimum legs (sponsor-tree branches at depth 1) that must contain sales for M1
    uint256 public constant M1_MIN_LEGS    = 2;

    // ── User record ───────────────────────────────────────────────────────────
    struct User {
        bool    isRegistered;
        bool    isActive;
        // Level / sponsor tree
        address sponsor;
        uint256 directCount;
        // Binary tree
        address binaryParent;
        bool    placedLeft;
        address leftChild;
        address rightChild;
        uint256 leftSubUsers;     // users in left subtree
        uint256 rightSubUsers;    // users in right subtree
        uint256 matchedPairs;     // watermark: cumulative pairs as of last distribution
        // Virtual MVT
        uint256 mvtBalance;       // available to sell
        uint256 totalReceived;    // lifetime MVT credited
        uint256 totalSold;        // lifetime MVT sold
        // USDT income
        uint256 incomeLimit;      // remaining USDT earning capacity (resets on rebirth)
        uint256 usdtBalance;      // withdrawable USDT
        uint256 rebirthPool;      // USDT accumulating toward next rebirth
        uint256 totalUsdtEarned;  // lifetime USDT received to usdtBalance
        // BTC pool (10% deducted from every sell, per user — like backup contract)
        uint256 btcPoolBalance;   // accumulated USDT for BTC purchase
        uint256 totalBtcEarned;   // lifetime BTC pool credits
        // Power leg (resets each cycle)
        uint256 powerLegPoints;
        // Package
        uint256 packagePrice;     // activation price paid ($55 or $130)
        uint256 incomeLimitCap;   // max income per cycle (3 × packagePrice)
        // Rebirth
        address mainAccount;      // if sub-account → points to main; else address(0)
        uint256 rebirthCount;
        // Rank
        uint8   rank;             // 0=none, 1=M1, 2=M2, 3=M3, 4=M4, 5=M5
        uint256 teamSalesUsdt;    // cumulative USDT activated in sponsor-tree downline
        uint256 m1Count;          // M1+ users anywhere in sponsor-tree downline
        uint256 m2Count;          // M2+ users anywhere in sponsor-tree downline
        uint256 m3Count;          // M3+ users anywhere in sponsor-tree downline
        uint256 m4Count;          // M4+ users anywhere in sponsor-tree downline
        // Meta
        uint256 joinedAt;
        // Profile
        string  displayName;
        string  email;
        string  phone;
        string  country;
        bool    profileSet;
    }

    mapping(address => User) public users;
    address[] public allUsers;
    uint256   public totalUsers;

    // ── Pool balances (virtual MVT) ───────────────────────────────────────────
    uint256 public binaryPool;
    uint256 public reservePool;
    uint256 public adminPool;
    uint256 public rankPool;

    // Binary distribution state
    uint256 private _powerLeg30Reserve;
    bool    private _binaryDistributed;

    // ── Board Matrix tracking ──────────────────────────────────────────────────
    mapping(address => uint256) public boardEntryCount;
    mapping(address => uint256) public totalBoardRewardsEarned;

    // ── Staking ───────────────────────────────────────────────────────────────
    uint256 public constant MIN_STAKE_USDT  = 50  * 1e18; // $50 minimum
    uint256 public constant LOCK_DURATION   = 300 days;   // 10-month lock
    uint256 public constant FLEX_CAP_MULT   = 2;          // flexible sell cap = 2× invested

    struct StakePosition {
        uint256 mvtAmount;    // MVT tokens currently staked (held by this contract)
        uint256 usdtInvested; // original USDT deposited (used for 2x cap on flexible)
        uint256 stakedAt;     // when position was created
        uint256 lockedSince;  // >0 = locked, value = timestamp when lock started; 0 = flexible
        bool    active;       // false once unstaked
    }

    mapping(address => StakePosition[]) private _stakes;

    // ── Transaction History (on-chain) ────────────────────────────────────────
    // txType constants
    uint8 internal constant TX_ACTIVATION     = 0;
    uint8 internal constant TX_LEVEL_INCOME   = 1;
    uint8 internal constant TX_LEVEL_MISSED   = 2;
    uint8 internal constant TX_BINARY_INCOME  = 3;
    uint8 internal constant TX_POWERLEG       = 4;
    uint8 internal constant TX_SELL_MVT       = 5;
    uint8 internal constant TX_BTC_CREDITED   = 6;
    uint8 internal constant TX_USDT_WITHDRAW  = 7;
    uint8 internal constant TX_REACTIVATION   = 15;
    uint8 internal constant TX_RANK_INCOME    = 16;
    uint8 internal constant TX_BTC_WITHDRAW   = 8;
    uint8 internal constant TX_REBIRTH        = 9;
    uint8 internal constant TX_BOARD_ENTRY    = 10;
    uint8 internal constant TX_BOARD_REWARD   = 11;
    uint8 internal constant TX_STAKE          = 12;
    uint8 internal constant TX_UNSTAKE        = 13;
    uint8 internal constant TX_REBIRTH_CLAIM  = 14;

    struct TxRecord {
        uint8   txType;    // one of TX_* constants above
        uint32  ts;        // block.timestamp (safe until year 2106)
        uint256 amount;    // in token's native units
        uint8   level;     // level number (0 = N/A)
        address addr;      // counterpart address (from/to), address(0) if N/A
    }

    mapping(address => TxRecord[]) private _txRecords;

    function _recordTx(address user, uint8 txType, uint256 amount, uint8 level, address addr) internal {
        _txRecords[user].push(TxRecord({
            txType: txType,
            ts:     uint32(block.timestamp),
            amount: amount,
            level:  level,
            addr:   addr
        }));
    }

    // ── Events ────────────────────────────────────────────────────────────────
    event Registered(address indexed user, address indexed sponsor, address indexed binaryParent, bool placeLeft);
    event Activated(address indexed user, uint256 mvtMinted, uint256 grossMvt, uint256 levelAmt, uint256 binaryAmt, uint256 adminAmt);
    event LevelIncomePaid(address indexed to, address indexed from, uint8 level, uint256 amount);
    event LevelIncomeSkipped(address indexed upline, uint8 level, uint256 amount);
    event BinaryIncomeDistributed(uint256 totalPool, uint256 binary70, uint256 powerLeg30, uint256 totalPairs);
    event BinaryIncomePaid(address indexed user, uint256 newPairs, uint256 amount);
    event PowerLegDistributed(uint256 totalPowerLeg30, uint256 totalPowerLegs);
    event PowerLegIncomePaid(address indexed user, uint256 powerLegPoints, uint256 amount);
    event MvtSold(address indexed user, uint256 mvtAmount, uint256 usdtNet, uint256 usdtToBtcPool, uint256 usdtToIncome, uint256 usdtToRebirth);
    event BtcPoolCredited(address indexed user, uint256 amount);
    event BtcPoolWithdrawn(address indexed user, uint256 amount);
    event UsdtWithdrawn(address indexed user, uint256 amount);
    event Reborn(address indexed mainAccount, address indexed subAccount, uint256 rebirthIndex);
    event Reactivated(address indexed user, uint256 pkgPrice, uint256 grossMvt, bool upgraded);
    event RankIncomePaid(address indexed to, address indexed from, uint8 rank, uint256 amount);
    event RankIncomeSkipped(address indexed upline, uint8 rank, uint256 amount);
    event RankUpdated(address indexed user, uint8 oldRank, uint8 newRank);
    event ProfileUpdated(address indexed user);
    event MvaultTokenUpdated(address newToken);
    event RegisteredAndActivatedFor(address indexed payer, address indexed newUser, address indexed sponsor, bool placeLeft);
    event AdminWithdraw(address indexed to, uint256 amount);
    event ReserveWithdraw(address indexed to, uint256 amount);
    event BoardEntered(address indexed user, uint256 boardLevel, uint256 usdtDeducted);
    event BoardRewardCredited(address indexed user, uint256 usdtAmount, uint256 boardLevel);
    event BoardHandlerUpdated(address indexed newHandler);
    event Staked(address indexed user, uint256 stakeIndex, uint256 usdtAmount, uint256 mvtMinted, bool isLocked);
    event Unstaked(address indexed user, uint256 stakeIndex, uint256 mvtReturned, uint256 usdtReceived, uint256 adminCapCut);
    event ConvertedToLocked(address indexed user, uint256 stakeIndex, uint256 lockedSince);
    event StakeLevelIncomePaid(address indexed to, address indexed from, uint8 level, uint256 mvtAmount);

    // ── Errors ────────────────────────────────────────────────────────────────
    error AlreadyRegistered();
    error NotRegistered();
    error AlreadyActive();
    error NotActive();
    error InvalidSponsor();
    error PositionTaken();
    error InsufficientVirtualBalance();
    error InsufficientUsdtBalance();
    error InsufficientBtcPool();
    error InsufficientRebirthPool();
    error NoOpenBinarySlot();
    error ZeroAddress();
    error ZeroAmount();
    error TransferFailed();
    error InvalidPackage();
    error NotEligibleForRebirth();
    error IncomeNotExhausted();
    error CannotDowngradePackage();
    error BinaryNotDistributed();
    error BinaryAlreadyDistributed();
    error BoardHandlerNotSet();
    error InsufficientBtcPoolForBoard();
    error NotBoardHandler();
    error InvalidIndex();
    error AlreadyUnstaked();
    error AlreadyLocked();
    error StillLocked();
    error BelowMinStake();
    error EmptyPool();
    error ExceedsPool();
    error SubAccountAlreadyRegistered();
    error AlreadyConverted();
    error NoMvtMinted();

    // ─────────────────────────────────────────────────────────────────────────
    constructor(address _usdt, address _mvaultToken) Ownable(msg.sender) {
        if (_usdt == address(0) || _mvaultToken == address(0)) revert ZeroAddress();
        usdtToken   = IERC20(_usdt);
        mvaultToken = IMvaultToken(_mvaultToken);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ADMIN SETTERS
    // ─────────────────────────────────────────────────────────────────────────

    function setMvaultToken(address _mvaultToken) external onlyOwner {
        if (_mvaultToken == address(0)) revert ZeroAddress();
        mvaultToken = IMvaultToken(_mvaultToken);
        emit MvaultTokenUpdated(_mvaultToken);
    }

    function setBoardHandler(address _boardHandler) external onlyOwner {
        if (_boardHandler == address(0)) revert ZeroAddress();
        boardHandler = IMvaultBoardMatrix(_boardHandler);
        emit BoardHandlerUpdated(_boardHandler);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BOARD MATRIX — ENTRY
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Use your BTC pool balance to enter the Board Matrix at Level 1.
     *         BTC pool fills automatically (10% of every MVT sell).
     *         Requires boardHandler to be set by admin.
     */
    function enterBoardPool() external nonReentrant {
        if (address(boardHandler) == address(0)) revert BoardHandlerNotSet();

        User storage u = users[msg.sender];
        if (!u.isActive) revert NotActive();

        uint256 price = boardHandler.getBoardPrice(1);
        if (u.btcPoolBalance < price) revert InsufficientBtcPoolForBoard();

        // Deduct from user's BTC pool
        u.btcPoolBalance -= price;

        // Transfer USDT to board handler
        bool ok = usdtToken.transfer(address(boardHandler), price);
        if (!ok) revert TransferFailed();

        // Register entry in board matrix
        boardEntryCount[msg.sender]++;
        boardHandler.enterBoard(msg.sender, 1);

        emit BoardEntered(msg.sender, 1, price);
        _recordTx(msg.sender, TX_BOARD_ENTRY, price, 1, address(0));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BOARD MATRIX — REWARD CALLBACK (called by MvaultBoardMatrix)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Called by the board matrix contract when a board completes.
     *         USDT is transferred to this contract before this call,
     *         then credited to the user's withdrawable usdtBalance.
     */
    function creditBoardReward(address _user, uint256 _usdtAmount, uint256 _boardLevel) external nonReentrant {
        if (msg.sender != address(boardHandler)) revert NotBoardHandler();
        if (_user == address(0)) revert ZeroAddress();
        if (_usdtAmount == 0) revert ZeroAmount();

        users[_user].usdtBalance     += _usdtAmount;
        users[_user].totalUsdtEarned += _usdtAmount;
        totalBoardRewardsEarned[_user] += _usdtAmount;

        emit BoardRewardCredited(_user, _usdtAmount, _boardLevel);
        _recordTx(_user, TX_BOARD_REWARD, _usdtAmount, uint8(_boardLevel), address(0));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // REGISTRATION
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Register a new user in the system.
     * @param sponsor       Your referrer. Pass address(0) only for the very first (root) user.
     * @param binaryParent  Node to be placed under. Pass address(0) to default to sponsor.
     * @param placeLeft     true = left side of binaryParent, false = right.
     */
    function register(
        address sponsor,
        address binaryParent,
        bool    placeLeft
    ) external {
        if (users[msg.sender].isRegistered) revert AlreadyRegistered();

        if (totalUsers == 0) {
            // Root / first user — no sponsor
            _createUser(msg.sender, address(0), address(0), false, address(0));
        } else {
            if (!users[sponsor].isRegistered) revert InvalidSponsor();

            // Start search from binaryParent if valid, otherwise from sponsor.
            // _findSlotOnSide walks the tree on-chain to find the deepest open slot
            // on the requested side — same logic used by rebirth().
            address startFrom = (binaryParent != address(0) && users[binaryParent].isRegistered)
                ? binaryParent
                : sponsor;

            (address parent, bool actualLeft) = _findSlotOnSide(startFrom, placeLeft);

            _createUser(msg.sender, sponsor, parent, actualLeft, address(0));

            if (actualLeft) users[parent].leftChild  = msg.sender;
            else            users[parent].rightChild = msg.sender;

            users[sponsor].directCount++;
            _updateAncestorCounts(msg.sender);
        }

        emit Registered(msg.sender, sponsor, binaryParent, placeLeft);
    }

    function _createUser(
        address u,
        address sponsor,
        address parent,
        bool    placeLeft,
        address main
    ) internal {
        users[u].isRegistered  = true;
        users[u].sponsor       = sponsor;
        users[u].binaryParent  = parent;
        users[u].placedLeft    = placeLeft;
        users[u].mainAccount   = main;
        users[u].joinedAt      = block.timestamp;
        allUsers.push(u);
        totalUsers++;
    }

    /**
     * @dev Walk up the binary tree and increment subtree counters on each ancestor.
     */
    function _updateAncestorCounts(address newUser) internal {
        address cur    = users[newUser].binaryParent;
        bool    isLeft = users[newUser].placedLeft;

        while (cur != address(0)) {
            if (isLeft) users[cur].leftSubUsers++;
            else        users[cur].rightSubUsers++;
            isLeft = users[cur].placedLeft;
            cur    = users[cur].binaryParent;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ACTIVATION
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @dev Resolves package params from pkg index.
     *      pkg=1 → STARTER ($55 / $165 limit)
     *      pkg=2 → PRO     ($130 / $390 limit)
     */
    function _pkgParams(uint8 pkg) internal pure returns (uint256 price, uint256 incomeCap) {
        if (pkg == 1) return (PRICE_STARTER, INCOME_STARTER);
        if (pkg == 2) return (PRICE_PRO,     INCOME_PRO);
        revert InvalidPackage();
    }

    /**
     * @notice Pay USDT and activate. Choose your package:
     *         pkg=1 → STARTER $55  (income limit $165)
     *         pkg=2 → PRO     $130 (income limit $390)
     *         Caller must have pre-approved this contract for the chosen package price.
     */
    function activate(uint8 pkg) external nonReentrant {
        User storage u = users[msg.sender];
        if (!u.isRegistered) revert NotRegistered();
        if (u.isActive)      revert AlreadyActive();

        (uint256 price, uint256 incomeCap) = _pkgParams(pkg);
        bool ok = usdtToken.transferFrom(msg.sender, address(this), price);
        if (!ok) revert TransferFailed();

        _doActivate(msg.sender, price, incomeCap);
    }

    /**
     * @notice Activate using your in-contract USDT balance (usdtBalance).
     *         Useful if you have accumulated USDT from income/unstaking and want to
     *         self-activate without an external wallet transfer.
     *         pkg=1 → STARTER ($55)   pkg=2 → PRO ($130)
     */
    function activateFromBalance(uint8 pkg) external nonReentrant {
        User storage u = users[msg.sender];
        if (!u.isRegistered) revert NotRegistered();
        if (u.isActive)      revert AlreadyActive();

        (uint256 price, uint256 incomeCap) = _pkgParams(pkg);
        if (u.usdtBalance < price) revert InsufficientUsdtBalance();

        u.usdtBalance -= price;
        _doActivate(msg.sender, price, incomeCap);
    }

    /**
     * @notice Register a NEW wallet address and immediately activate it.
     *         Caller (msg.sender) becomes the direct sponsor of `newUser`.
     *         USDT is deducted from the caller's in-contract virtual usdtBalance.
     *         No external wallet approval needed — uses earned income already in the contract.
     *         pkg=1 → STARTER ($55)   pkg=2 → PRO ($130)
     */
    function registerAndActivateFor(
        address newUser,
        address binaryParent,
        bool    placeLeft,
        uint8   pkg
    ) external nonReentrant {
        if (newUser == address(0))           revert("Invalid address");
        if (newUser == msg.sender)           revert("Cannot register yourself");
        if (!users[msg.sender].isRegistered) revert NotRegistered();
        if (!users[msg.sender].isActive)     revert("Caller not active");
        if (users[newUser].isRegistered)     revert AlreadyRegistered();

        (uint256 price, uint256 incomeCap) = _pkgParams(pkg);
        if (users[msg.sender].usdtBalance < price) revert InsufficientUsdtBalance();

        // Determine binary parent (default = caller), then auto-find open slot on-chain
        address startFrom = (binaryParent != address(0) && users[binaryParent].isRegistered)
            ? binaryParent
            : msg.sender;

        (address parent, bool actualLeft) = _findSlotOnSide(startFrom, placeLeft);

        // Deduct from caller's virtual USDT balance (USDT already held by this contract)
        users[msg.sender].usdtBalance -= price;

        // Register newUser with caller as sponsor
        _createUser(newUser, msg.sender, parent, actualLeft, address(0));

        if (actualLeft) users[parent].leftChild  = newUser;
        else            users[parent].rightChild = newUser;

        users[msg.sender].directCount++;
        _updateAncestorCounts(newUser);

        emit Registered(newUser, msg.sender, parent, placeLeft);

        // Activate newUser (USDT already in contract)
        _doActivate(newUser, price, incomeCap);

        emit RegisteredAndActivatedFor(msg.sender, newUser, msg.sender, placeLeft);
    }

    /**
     * @dev Core activation logic.  USDT must already be in this contract before calling.
     *      pkgPrice   — amount paid ($55e18 or $130e18)
     *      incomeCap  — max income this cycle ($165e18 or $390e18)
     */
    function _doActivate(address user, uint256 pkgPrice, uint256 incomeCap) internal {
        // Snapshot buy price BEFORE minting (price rises after)
        uint256 buyPrice = mvaultToken.getBuyPrice();
        // Gross MVT = what pkgPrice buys at current price
        uint256 grossMvt = (pkgPrice * 1e18) / buyPrice;

        // Approve token contract and mint
        usdtToken.approve(address(mvaultToken), pkgPrice);
        uint256 before = mvaultToken.balanceOf(address(this));
        mvaultToken.addLiquidityAndMint(address(this), pkgPrice);
        uint256 minted = mvaultToken.balanceOf(address(this)) - before; // actual 90%

        // Split on GROSS basis: 30% level + 30% binary + 20% admin + 10% rank + 10% liquidity (in MVT token)
        uint256 levelAmt  = (grossMvt * LEVEL_ALLOC)  / 100;  // 30%
        uint256 binaryAmt = (grossMvt * BINARY_ALLOC) / 100;  // 30%
        uint256 adminAmt  = (grossMvt * ADMIN_ALLOC)  / 100;  // 20%
        uint256 rankAmt   = (grossMvt * RANK_ALLOC)   / 100;  // 10%
        // Remaining dust (rounding) → adminPool
        uint256 dust = grossMvt - levelAmt - binaryAmt - adminAmt - rankAmt;

        binaryPool += binaryAmt;
        adminPool  += adminAmt + dust;

        users[user].isActive       = true;
        users[user].incomeLimit    = incomeCap;
        users[user].packagePrice   = pkgPrice;
        users[user].incomeLimitCap = incomeCap;

        _updateTeamStats(user, pkgPrice);
        _distributeLevelIncome(user, grossMvt, levelAmt);
        _distributeRankIncome(user, rankAmt);

        emit Activated(user, minted, grossMvt, levelAmt, binaryAmt, adminAmt);
        _recordTx(user, TX_ACTIVATION, pkgPrice, 0, address(0));
    }

    /**
     * @dev Walks up 10 sponsor levels, credits qualifying uplines, unqualified → adminPool.
     */
    function _distributeLevelIncome(
        address from,
        uint256 grossMvt,
        uint256 levelAmt
    ) internal {
        address cur = users[from].sponsor;
        uint256 distributed = 0;

        for (uint8 lvl = 1; lvl <= 10 && cur != address(0); lvl++) {
            uint256 share = _levelShare(grossMvt, lvl);
            if (share == 0) { cur = users[cur].sponsor; continue; }

            distributed += share;

            bool qualified = users[cur].isActive
                && users[cur].directCount >= _directReq(lvl);

            if (qualified) {
                users[cur].mvtBalance    += share;
                users[cur].totalReceived += share;
                emit LevelIncomePaid(cur, from, lvl, share);
                _recordTx(cur, TX_LEVEL_INCOME, share, lvl, from);
            } else {
                adminPool += share;
                emit LevelIncomeSkipped(cur, lvl, share);
                _recordTx(cur, TX_LEVEL_MISSED, share, lvl, address(0));
            }

            cur = users[cur].sponsor;
        }

        // Dust from rounding → admin
        if (levelAmt > distributed) adminPool += levelAmt - distributed;
    }

    /** @dev Level share as % of gross MVT.  Rates sum to 30%. */
    function _levelShare(uint256 grossMvt, uint8 lvl) internal pure returns (uint256) {
        if (lvl == 1)  return (grossMvt * 20)  / 100;   // 20%
        if (lvl == 2)  return (grossMvt * 5)   / 100;   //  5%
        if (lvl == 3)  return (grossMvt * 2)   / 100;   //  2%
        if (lvl == 4)  return (grossMvt * 1)   / 100;   //  1%
        if (lvl == 5)  return (grossMvt * 5)   / 1000;  //  0.5%
        if (lvl == 6)  return (grossMvt * 5)   / 1000;  //  0.5%
        if (lvl == 7)  return (grossMvt * 3)   / 1000;  //  0.3%
        if (lvl == 8)  return (grossMvt * 3)   / 1000;  //  0.3%
        if (lvl == 9)  return (grossMvt * 2)   / 1000;  //  0.2%
        if (lvl == 10) return (grossMvt * 2)   / 1000;  //  0.2%
        return 0;
    }

    /** @dev Minimum directs needed to qualify at each level. */
    function _directReq(uint8 lvl) internal pure returns (uint256) {
        if (lvl == 1)  return 0;  // L1: no requirement — always paid to active sponsor
        if (lvl <= 4)  return 2;  // L2–L4: 2 direct sponsors
        return 5;                 // L5–L10: 5 direct sponsors
    }

    // ─────────────────────────────────────────────────────────────────────────
    // RANK SYSTEM
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @dev Walk up the sponsor tree from `from` and increment teamSalesUsdt on every ancestor.
     *      Also re-evaluates and updates the rank of each ancestor.
     *      Called on every activation / reactivation.
     */
    function _updateTeamStats(address from, uint256 pkgPrice) internal {
        address cur = users[from].sponsor;
        while (cur != address(0)) {
            users[cur].teamSalesUsdt += pkgPrice;
            _refreshRank(cur);
            cur = users[cur].sponsor;
        }
    }

    /**
     * @dev Recompute rank for `u` based on current struct counters and emit RankUpdated if changed.
     *      Rank rules:
     *        M1: directCount >= 5 AND teamSalesUsdt >= $2000 AND >=2 different direct-leg subtrees have sales
     *        M2: m1Count >= 2
     *        M3: m2Count >= 4
     *        M4: m3Count >= 4
     *        M5: m4Count >= 4
     *      When a user advances from rank N-1 to rank N their count is incremented on their sponsor.
     */
    function _refreshRank(address u) internal {
        uint8 old = users[u].rank;
        uint8 newRank = _computeRank(u);
        if (newRank == old) return;

        users[u].rank = newRank;
        emit RankUpdated(u, old, newRank);

        // Update ancestor count fields for the newly achieved rank(s).
        // We walk from old+1 up to newRank to credit each newly earned rank step.
        address sp = users[u].sponsor;
        while (sp != address(0)) {
            bool changed = false;
            if (newRank >= 1 && old < 1) { users[sp].m1Count++; changed = true; }
            if (newRank >= 2 && old < 2) { users[sp].m2Count++; changed = true; }
            if (newRank >= 3 && old < 3) { users[sp].m3Count++; changed = true; }
            if (newRank >= 4 && old < 4) { users[sp].m4Count++; changed = true; }
            if (!changed) break;
            // Ancestor's rank may now change too
            _refreshRankNoPropagate(sp);
            sp = users[sp].sponsor;
        }
    }

    /**
     * @dev Refresh rank of a single node without recursively propagating count changes upward.
     *      Used inside the ancestor walk in _refreshRank to avoid double-propagation.
     */
    function _refreshRankNoPropagate(address u) internal {
        uint8 old = users[u].rank;
        uint8 newRank = _computeRank(u);
        if (newRank == old) return;
        users[u].rank = newRank;
        emit RankUpdated(u, old, newRank);
    }

    /**
     * @dev Pure rank computation from current User fields.
     *      Checks ranks from highest to lowest and returns the best achieved.
     */
    function _computeRank(address u) internal view returns (uint8) {
        User storage d = users[u];
        if (!d.isActive) return 0;

        // M5: 4x M4 in downline
        if (d.m4Count >= 4) return 5;
        // M4: 4x M3
        if (d.m3Count >= 4) return 4;
        // M3: 4x M2
        if (d.m2Count >= 4) return 3;
        // M2: 2x M1
        if (d.m1Count >= 2) return 2;
        // M1: 5 directs + $2000 team sales + 2 active legs
        if (d.directCount >= M1_MIN_DIRECTS
            && d.teamSalesUsdt >= M1_TEAM_SALES
            && _activeLegCount(u) >= M1_MIN_LEGS) return 1;

        return 0;
    }

    /**
     * @dev Count how many of u's direct sponsor-children (u's direct referrals)
     *      have at least one active user in their own subtree (or are themselves active).
     *      A "leg" here is one direct referral of u.
     */
    function _activeLegCount(address u) internal view returns (uint256 count) {
        // We iterate allUsers once and check sponsor == u; then check if that child
        // or any of their downline is active. To keep gas reasonable we use the
        // directCount already tracked — any direct of u who is active counts as a leg.
        // We need at least M1_MIN_LEGS such directs.
        for (uint256 i = 0; i < allUsers.length && count < M1_MIN_LEGS + 1; i++) {
            address a = allUsers[i];
            if (users[a].sponsor == u && users[a].isActive) {
                count++;
            }
        }
    }

    /**
     * @dev Walk up the sponsor tree from `from` and distribute rankAmt proportionally.
     *      Each rank slot (M1=10%, M2=20%, M3=20%, M4=20%, M5=30%) is paid to the
     *      NEAREST ancestor holding exactly that rank.  If no qualifier is found the
     *      share goes to adminPool.
     *
     *      Because a higher-rank user also holds lower rank they would absorb all lower
     *      slots below them — which is NOT the design.  Instead each slot goes to the
     *      first ancestor whose rank == that target rank exactly (or the first to have
     *      qualified for it — since ranks are strictly ascending we look for rank >= target
     *      but stop at the first hit, meaning a M3 only absorbs the M3 slot, not M1/M2).
     *
     *      Implementation: walk sponsor tree once, tracking which rank slots are still
     *      unclaimed.  When we meet a user whose rank == requiredRank, pay that slot.
     *      A higher-rank user does NOT satisfy a lower-rank slot.
     */
    function _distributeRankIncome(address from, uint256 rankAmt) internal {
        // Slot amounts: index 1=M1, 2=M2, 3=M3, 4=M4, 5=M5
        uint256[6] memory slotPct = [uint256(0), 10, 20, 20, 20, 30];
        bool[6] memory paid;      // tracks which slots have been filled
        uint256 unpaid = 5;       // all 5 slots start unpaid

        address cur = users[from].sponsor;
        while (cur != address(0) && unpaid > 0) {
            uint8 r = users[cur].rank;
            if (r >= 1 && r <= 5 && !paid[r]) {
                uint256 share = (rankAmt * slotPct[r]) / 100;
                paid[r] = true;
                unpaid--;
                users[cur].mvtBalance    += share;
                users[cur].totalReceived += share;
                emit RankIncomePaid(cur, from, r, share);
                _recordTx(cur, TX_RANK_INCOME, share, r, from);
            }
            cur = users[cur].sponsor;
        }

        // Any unpaid slots → adminPool
        if (unpaid > 0) {
            uint256 leftover = 0;
            for (uint8 r = 1; r <= 5; r++) {
                if (!paid[r]) {
                    uint256 share = (rankAmt * slotPct[r]) / 100;
                    leftover += share;
                    emit RankIncomeSkipped(address(0), r, share);
                }
            }
            adminPool += leftover;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SELL MVT
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Convert virtual MVT balance to USDT.
     *         USDT is held in the contract; call withdrawUsdt() to pull it.
     *
     *         Routing:
     *           ① If incomeLimit > 0  → USDT fills incomeLimit first  → usdtBalance
     *           ② Excess              → rebirthPool
     *           ③ If incomeLimit = 0  → all USDT goes to rebirthPool
     */
    function sellMvt(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        User storage u = users[msg.sender];
        if (!u.isActive)           revert NotRegistered();
        if (u.mvtBalance < amount) revert InsufficientVirtualBalance();

        u.mvtBalance -= amount;
        u.totalSold  += amount;

        // Burn MVT via token contract; receive USDT
        uint256 usdtBefore = usdtToken.balanceOf(address(this));
        mvaultToken.sell(amount);
        uint256 usdtReceived = usdtToken.balanceOf(address(this)) - usdtBefore;

        // ── Deduct 10% to user's BTC pool first ──────────────────────────────
        uint256 btcCharge = (usdtReceived * BTC_POOL_RATE) / 100;
        uint256 netUsdt   = usdtReceived - btcCharge;

        u.btcPoolBalance += btcCharge;
        u.totalBtcEarned += btcCharge;
        emit BtcPoolCredited(msg.sender, btcCharge);
        _recordTx(msg.sender, TX_BTC_CREDITED, btcCharge, 0, address(0));

        // ── Route remaining 90% through income limit → rebirth pool ──────────
        uint256 toIncome  = 0;
        uint256 toRebirth = 0;

        if (u.incomeLimit > 0) {
            toIncome  = netUsdt > u.incomeLimit ? u.incomeLimit : netUsdt;
            toRebirth = netUsdt - toIncome;
            u.usdtBalance     += toIncome;
            u.incomeLimit     -= toIncome;
            u.totalUsdtEarned += toIncome;
        } else {
            toRebirth = netUsdt;
        }

        u.rebirthPool += toRebirth;

        emit MvtSold(msg.sender, amount, netUsdt, btcCharge, toIncome, toRebirth);
        _recordTx(msg.sender, TX_SELL_MVT, netUsdt, 0, address(0));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // WITHDRAW USDT
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Pull your accumulated USDT balance to your wallet.
     */
    function withdrawUsdt(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        User storage u = users[msg.sender];
        if (u.usdtBalance < amount) revert InsufficientUsdtBalance();

        u.usdtBalance -= amount;
        bool ok = usdtToken.transfer(msg.sender, amount);
        if (!ok) revert TransferFailed();

        emit UsdtWithdrawn(msg.sender, amount);
        _recordTx(msg.sender, TX_USDT_WITHDRAW, amount, 0, address(0));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // WITHDRAW BTC POOL
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Withdraw from your BTC pool balance.
     *         The USDT is sent to your wallet; the frontend/app handles BTC swap.
     *         10% of every sell accumulates here (same as backup contract pattern).
     */
    function withdrawBtcPool(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        User storage u = users[msg.sender];
        if (u.btcPoolBalance < amount) revert InsufficientBtcPool();

        u.btcPoolBalance -= amount;
        bool ok = usdtToken.transfer(msg.sender, amount);
        if (!ok) revert TransferFailed();

        emit BtcPoolWithdrawn(msg.sender, amount);
        _recordTx(msg.sender, TX_BTC_WITHDRAW, amount, 0, address(0));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // REBIRTH
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @param subAccount  Fresh (unregistered) wallet address for the sub-account.
     * @param placeLeft   true = place sub-account on LEFT side of the open slot,
     *                    false = RIGHT side.  Tries directly under main account first;
     *                    if that side is taken, searches deeper on the chosen side (BFS).
     */
    function rebirth(address subAccount, bool placeLeft) external nonReentrant {
        if (subAccount == address(0)) revert ZeroAddress();

        User storage u = users[msg.sender];
        if (!u.isActive) revert NotActive();
        if (u.packagePrice != PRICE_PRO) revert NotEligibleForRebirth();
        if (u.rebirthPool < u.packagePrice) revert InsufficientRebirthPool();
        if (users[subAccount].isRegistered) revert SubAccountAlreadyRegistered();

        // ── 1. Deduct package price for sub-account activation ───────────────
        u.rebirthPool -= u.packagePrice;

        // ── 2. Reset income limit to full ─────────────────────────────────────
        u.incomeLimit = u.incomeLimitCap;

        // ── 3. Move remaining rebirth pool → main wallet through income limit ──
        // Credits the remainder to usdtBalance up to the newly reset income limit.
        // Excess beyond the income limit stays in rebirthPool (toward next rebirth).
        uint256 remaining = u.rebirthPool;
        if (remaining > 0) {
            uint256 toMain    = remaining > u.incomeLimit ? u.incomeLimit : remaining;
            u.rebirthPool    -= toMain;
            u.usdtBalance    += toMain;
            u.incomeLimit    -= toMain;
            u.totalUsdtEarned += toMain;
        }

        // ── 4. Register sub-account ───────────────────────────────────────────
        // Sponsor = main account's sponsor → sub-account's L1 income goes to
        // the person who originally referred the main account.
        address subSponsor = u.sponsor;

        // Place on the user's chosen side under main account.
        // If that slot is already taken, BFS deeper on the same preferred side.
        (address binParent, bool actualLeft) = _findSlotOnSide(msg.sender, placeLeft);

        _createUser(subAccount, subSponsor, binParent, actualLeft, msg.sender);

        if (actualLeft) users[binParent].leftChild  = subAccount;
        else            users[binParent].rightChild = subAccount;

        if (subSponsor != address(0)) users[subSponsor].directCount++;
        _updateAncestorCounts(subAccount);

        // ── 5 & 6. Activate sub-account (USDT already in contract) ───────────
        // Sub-account inherits the same package tier as the main account.
        _doActivate(subAccount, u.packagePrice, u.incomeLimitCap);

        u.rebirthCount++;

        emit Reborn(msg.sender, subAccount, u.rebirthCount);
        _recordTx(msg.sender, TX_REBIRTH, 0, 0, subAccount);
    }

    /**
     * @notice Claim a partial rebirth pool balance (< $130) back to USDT balance.
     *         If rebirthPool >= $130 the user must use rebirth() instead.
     *         This allows users to recover small overflow amounts that are not
     *         enough to trigger a full rebirth.
     */
    function claimRebirthBalance() external nonReentrant {
        User storage u = users[msg.sender];
        if (!u.isActive)               revert NotActive();
        if (u.rebirthPool == 0)        revert("No rebirth balance to claim");
        if (u.rebirthPool >= u.packagePrice) revert("Use rebirth() - pool is >= package price");

        uint256 claim    = u.rebirthPool;
        u.rebirthPool    = 0;
        u.usdtBalance   += claim;
        u.totalUsdtEarned += claim;

        _recordTx(msg.sender, TX_REBIRTH_CLAIM, claim, 0, address(0));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // REACTIVATION  (STARTER and PRO)
    //
    // When a user's incomeLimit reaches 0 they have two options:
    //   A) Reactivate at their current pkg price → income limit resets.
    //   B) Upgrade from STARTER → PRO by paying $130 → income limit resets
    //      to $390, packagePrice updated to PRO, rebirth becomes eligible.
    //
    // Rules:
    //   • Caller must be active and have incomeLimit == 0.
    //   • Cannot downgrade from PRO (pkg=2) to STARTER (pkg=1).
    //   • Same MVT minting and pool distributions as initial activation.
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Reactivate (or upgrade) by paying USDT from your wallet.
     *         pkg=1 → STARTER $55  (resets limit to $165, no rebirth)
     *         pkg=2 → PRO     $130 (resets limit to $390, rebirth eligible)
     *         Caller must pre-approve the contract for the chosen pkg price.
     */
    function reactivate(uint8 pkg) external nonReentrant {
        User storage u = users[msg.sender];
        if (!u.isActive)        revert NotActive();
        if (u.incomeLimit > 0)  revert IncomeNotExhausted();

        (uint256 price, uint256 incomeCap) = _pkgParams(pkg);
        if (u.packagePrice == PRICE_PRO && price < PRICE_PRO) revert CannotDowngradePackage();

        bool ok = usdtToken.transferFrom(msg.sender, address(this), price);
        if (!ok) revert TransferFailed();

        _doReactivate(msg.sender, price, incomeCap);
    }

    /**
     * @notice Reactivate (or upgrade) using your in-contract USDT balance.
     *         pkg=1 → STARTER $55   pkg=2 → PRO $130
     */
    function reactivateFromBalance(uint8 pkg) external nonReentrant {
        User storage u = users[msg.sender];
        if (!u.isActive)        revert NotActive();
        if (u.incomeLimit > 0)  revert IncomeNotExhausted();

        (uint256 price, uint256 incomeCap) = _pkgParams(pkg);
        if (u.packagePrice == PRICE_PRO && price < PRICE_PRO) revert CannotDowngradePackage();
        if (u.usdtBalance < price) revert InsufficientUsdtBalance();

        u.usdtBalance -= price;
        _doReactivate(msg.sender, price, incomeCap);
    }

    /**
     * @dev Core reactivation logic. Same MVT minting / distribution as activation.
     *      Updates packagePrice and incomeLimitCap to reflect any upgrade.
     */
    function _doReactivate(address user, uint256 pkgPrice, uint256 incomeCap) internal {
        bool upgraded = (users[user].packagePrice != pkgPrice);

        uint256 buyPrice = mvaultToken.getBuyPrice();
        uint256 grossMvt = (pkgPrice * 1e18) / buyPrice;

        usdtToken.approve(address(mvaultToken), pkgPrice);
        mvaultToken.addLiquidityAndMint(address(this), pkgPrice);

        uint256 levelAmt  = (grossMvt * LEVEL_ALLOC)  / 100;
        uint256 binaryAmt = (grossMvt * BINARY_ALLOC) / 100;
        uint256 adminAmt  = (grossMvt * ADMIN_ALLOC)  / 100;
        uint256 rankAmt   = (grossMvt * RANK_ALLOC)   / 100;
        uint256 dust      = grossMvt - levelAmt - binaryAmt - adminAmt - rankAmt;

        binaryPool += binaryAmt;
        adminPool  += adminAmt + dust;

        // Update package tier (handles both reactivation and upgrade)
        users[user].packagePrice   = pkgPrice;
        users[user].incomeLimitCap = incomeCap;
        users[user].incomeLimit    = incomeCap;

        _updateTeamStats(user, pkgPrice);
        _distributeLevelIncome(user, grossMvt, levelAmt);
        _distributeRankIncome(user, rankAmt);

        emit Reactivated(user, pkgPrice, grossMvt, upgraded);
        _recordTx(user, TX_REACTIVATION, pkgPrice, 0, address(0));
    }

    /**
     * @dev BFS from `start`, searching only on the preferred side first.
     *      If the preferred side's slot is open at `start`, returns immediately.
     *      Otherwise explores deeper on the preferred side; falls back to other side
     *      if the preferred subtree is completely full.
     */
    function _findSlotOnSide(address start, bool preferLeft)
        internal
        view
        returns (address parent, bool goLeft)
    {
        // Check direct slot under `start` first
        if (preferLeft  && users[start].leftChild  == address(0)) return (start, true);
        if (!preferLeft && users[start].rightChild == address(0)) return (start, false);

        // BFS deeper, honouring the preferred side
        address[] memory queue = new address[](totalUsers + 1);
        uint256 front = 0;
        uint256 back  = 0;

        // Seed with the preferred child subtree
        address preferredChild = preferLeft
            ? users[start].leftChild
            : users[start].rightChild;
        if (preferredChild != address(0)) queue[back++] = preferredChild;

        while (front < back) {
            address cur = queue[front++];
            if (users[cur].leftChild  == address(0)) return (cur, true);
            if (users[cur].rightChild == address(0)) return (cur, false);
            queue[back++] = users[cur].leftChild;
            queue[back++] = users[cur].rightChild;
        }

        // Fallback: check the other side of `start`
        if (!preferLeft && users[start].leftChild  == address(0)) return (start, true);
        if (preferLeft  && users[start].rightChild == address(0)) return (start, false);

        revert NoOpenBinarySlot();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BINARY INCOME DISTRIBUTION  (admin — Step 1 of 2)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice STEP 1: Distribute 70% of binaryPool to users with new pair matches.
     *         Sets powerLegPoints = newPairs × 3 (STARTER $55) or newPairs × 5 (PRO $130) for matching users.
     *         Call distributePowerLeg() after processing all batches to close the cycle.
     *
     * @param offset  Start index in allUsers array.
     * @param limit   How many users to process in this call.
     */
    function distributeBinaryIncome(
        uint256 offset,
        uint256 limit
    ) external onlyOwner nonReentrant {
        if (_binaryDistributed) revert BinaryAlreadyDistributed();
        if (binaryPool == 0) revert EmptyPool();

        uint256 pool = binaryPool;
        binaryPool   = 0;

        uint256 binary70   = (pool * 70) / 100;
        uint256 powerLeg30 = pool - binary70;
        _powerLeg30Reserve = powerLeg30;

        uint256 end = offset + limit;
        if (end > allUsers.length) end = allUsers.length;

        // First pass — count total new pairs in this batch
        uint256 totalNewPairs = 0;
        for (uint256 i = offset; i < end; i++) {
            address u = allUsers[i];
            if (!users[u].isActive) continue;
            uint256 pairs = _minOf(users[u].leftSubUsers, users[u].rightSubUsers);
            if (pairs > users[u].matchedPairs) {
                totalNewPairs += pairs - users[u].matchedPairs;
            }
        }

        if (totalNewPairs == 0) {
            adminPool += binary70 + powerLeg30;
            _powerLeg30Reserve = 0;
            emit BinaryIncomeDistributed(pool, 0, 0, 0);
            return;
        }

        // Second pass — distribute 70% and assign power leg points
        for (uint256 i = offset; i < end; i++) {
            address u = allUsers[i];
            if (!users[u].isActive) continue;

            uint256 pairs    = _minOf(users[u].leftSubUsers, users[u].rightSubUsers);
            uint256 newPairs = pairs > users[u].matchedPairs
                ? pairs - users[u].matchedPairs : 0;
            if (newPairs == 0) continue;

            uint256 share = (binary70 * newPairs) / totalNewPairs;
            users[u].mvtBalance      += share;
            users[u].totalReceived   += share;
            uint256 ptsPerPair = users[u].packagePrice == PRICE_PRO ? 5 : 3;
            users[u].powerLegPoints  += newPairs * ptsPerPair;
            users[u].matchedPairs     = pairs;
            emit BinaryIncomePaid(u, newPairs, share);
            _recordTx(u, TX_BINARY_INCOME, share, 0, address(0));
        }

        _binaryDistributed = true;
        emit BinaryIncomeDistributed(pool, binary70, powerLeg30, totalNewPairs);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // POWER LEG DISTRIBUTION  (admin — Step 2 of 2)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice STEP 2: Distribute the 30% power-leg reserve proportionally to
     *         powerLegPoints, then reset all power leg points to 0.
     *
     * @param offset  Start index in allUsers array.
     * @param limit   Max users to process in this call.
     */
    function distributePowerLeg(
        uint256 offset,
        uint256 limit
    ) external onlyOwner nonReentrant {
        if (!_binaryDistributed) revert BinaryNotDistributed();

        uint256 end = offset + limit;
        if (end > allUsers.length) end = allUsers.length;

        // Count total power legs in this batch
        uint256 totalPowerLegs = 0;
        for (uint256 i = offset; i < end; i++) {
            totalPowerLegs += users[allUsers[i]].powerLegPoints;
        }

        uint256 reserve = _powerLeg30Reserve;
        if (totalPowerLegs > 0 && reserve > 0) {
            for (uint256 i = offset; i < end; i++) {
                address u = allUsers[i];
                if (users[u].powerLegPoints == 0) continue;
                uint256 pts   = users[u].powerLegPoints;
                uint256 share = (reserve * pts) / totalPowerLegs;
                users[u].mvtBalance    += share;
                users[u].totalReceived += share;
                emit PowerLegIncomePaid(u, pts, share);
                _recordTx(u, TX_POWERLEG, share, 0, address(0));
            }
        } else {
            adminPool += reserve;
        }

        // Reset power legs
        for (uint256 i = offset; i < end; i++) {
            users[allUsers[i]].powerLegPoints = 0;
        }

        _powerLeg30Reserve = 0;
        _binaryDistributed = false;

        emit PowerLegDistributed(reserve, totalPowerLegs);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ADMIN FUNCTIONS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Move MVT from adminPool to a target address's virtual balance.
     */
    function withdrawAdminPool(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        if (adminPool < amount) revert ExceedsPool();
        adminPool               -= amount;
        users[to].mvtBalance    += amount;
        users[to].totalReceived += amount;
        emit AdminWithdraw(to, amount);
    }

    /**
     * @notice Move MVT from reservePool to a target address's virtual balance.
     */
    function withdrawReservePool(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        if (reservePool < amount) revert ExceedsPool();
        reservePool             -= amount;
        users[to].mvtBalance    += amount;
        users[to].totalReceived += amount;
        emit ReserveWithdraw(to, amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STAKING
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Stake USDT.
     *         100% USDT buys MVT via bonding curve (token internally mints 90% = "gross MVT").
     *         From gross MVT:
     *           15% of theoretical (= 15/90 of grossMvt) → level income in MVT to 5 uplines
     *                                                        (rates: 10/2/1/1/1 per 90 units)
     *            5% of theoretical (=  5/90 of grossMvt) → admin pool in MVT
     *           70% of theoretical (= 70/90 of grossMvt) → staked for the user
     * @param usdtAmount  Must be >= MIN_STAKE_USDT ($50).
     * @param isLocked    false = flexible (2× cap on USDT return, instant unstake)
     *                    true  = locked  (no cap, 10-month lock, bonus token distribution to uplines)
     */
    function stake(uint256 usdtAmount, bool isLocked) external nonReentrant {
        if (usdtAmount < MIN_STAKE_USDT) revert BelowMinStake();
        if (!users[msg.sender].isRegistered) revert NotRegistered();
        if (!users[msg.sender].isActive) revert NotActive();

        bool ok = usdtToken.transferFrom(msg.sender, address(this), usdtAmount);
        if (!ok) revert TransferFailed();

        // 100% USDT → MVT (token mints 90% of theoretical = "gross MVT")
        usdtToken.approve(address(mvaultToken), usdtAmount);
        uint256 balBefore = mvaultToken.balanceOf(address(this));
        mvaultToken.addLiquidityAndMint(address(this), usdtAmount);
        uint256 grossMvt = mvaultToken.balanceOf(address(this)) - balBefore;
        if (grossMvt == 0) revert NoMvtMinted();

        // Level income in MVT: rates [10,2,1,1,1] per 90 units of grossMvt (sums to 15/90).
        // Credited to sponsors' virtual MVT balance — subject to income limit when they sell.
        // Unqualified upline shares accumulate to levelToAdmin (MVT).
        uint8[5] memory levelRates = [10, 2, 1, 1, 1];
        address cur = users[msg.sender].sponsor;
        uint256 levelDistributed = 0;
        uint256 levelToAdmin     = 0;
        for (uint8 i = 0; i < 5; i++) {
            uint256 share = grossMvt * levelRates[i] / 90;
            if (share == 0) {
                if (cur != address(0)) cur = users[cur].sponsor;
                continue;
            }
            if (cur == address(0) || !users[cur].isActive) {
                levelToAdmin += share;
            } else {
                users[cur].mvtBalance    += share;
                users[cur].totalReceived += share;
                levelDistributed         += share;
                emit StakeLevelIncomePaid(cur, msg.sender, i + 1, share);
                _recordTx(cur, TX_LEVEL_INCOME, share, i + 1, msg.sender);
            }
            cur = users[cur].sponsor;
        }

        // Admin alloc: 5/90 of grossMvt + any unqualified level shares (kept as MVT)
        uint256 adminAmt = grossMvt * 5 / 90;
        adminPool += adminAmt + levelToAdmin;

        // Staked: grossMvt minus all level alloc (15/90) and admin alloc (5/90) = 70/90
        uint256 levelTotal = levelDistributed + levelToAdmin;
        uint256 stakedMvt  = grossMvt - levelTotal - adminAmt;
        if (stakedMvt == 0) revert NoMvtMinted();

        uint256 stakeIndex = _stakes[msg.sender].length;
        _stakes[msg.sender].push(StakePosition({
            mvtAmount:    stakedMvt,
            usdtInvested: usdtAmount,
            stakedAt:     block.timestamp,
            lockedSince:  isLocked ? block.timestamp : 0,
            active:       true
        }));

        emit Staked(msg.sender, stakeIndex, usdtAmount, stakedMvt, isLocked);
        _recordTx(msg.sender, TX_STAKE, usdtAmount, 0, address(0));
    }

    /**
     * @notice Unstake a position.
     *
     *  Flexible (lockedSince == 0):
     *   • 5% tokens → direct sponsor
     *   • 95% tokens sold; USDT capped at 2× usdtInvested → user
     *   • Excess USDT (above cap) → adminPool
     *   • Instant — no time lock
     *
     *  Locked (lockedSince > 0):
     *   • Requires 10-month lock elapsed
     *   • 5%/2%/1%/1%/1% tokens → 5 uplines
     *   • 90% tokens sold → full USDT → user (no cap)
     *
     *  NO BTC pool deduction in either case.
     */
    function unstake(uint256 stakeIndex) external nonReentrant {
        if (stakeIndex >= _stakes[msg.sender].length) revert InvalidIndex();
        StakePosition storage pos = _stakes[msg.sender][stakeIndex];
        if (!pos.active) revert AlreadyUnstaked();

        bool isLocked = pos.lockedSince > 0;
        if (isLocked) {
            if (block.timestamp < pos.lockedSince + LOCK_DURATION) revert StillLocked();
        }

        pos.active = false;
        uint256 totalMvt = pos.mvtAmount;
        uint256 usdtCap  = pos.usdtInvested * FLEX_CAP_MULT; // only used for flexible
        uint256 toSell   = totalMvt;

        if (!isLocked) {
            // ── Flexible: 5% virtual MVT to direct sponsor (subject to income limit on sell) ─
            uint256 sponsorShare = (totalMvt * 5) / 100;
            address sponsor = users[msg.sender].sponsor;
            if (sponsor != address(0) && users[sponsor].isActive && sponsorShare > 0) {
                users[sponsor].mvtBalance    += sponsorShare;
                users[sponsor].totalReceived += sponsorShare;
                toSell -= sponsorShare;
                emit StakeLevelIncomePaid(sponsor, msg.sender, 1, sponsorShare);
                _recordTx(sponsor, TX_LEVEL_INCOME, sponsorShare, 1, msg.sender);
            }
        } else {
            // ── Locked: 5%+2%+1%+1%+1% virtual MVT to 5 uplines (subject to income limit on sell) ─
            uint8[5] memory rates = [5, 2, 1, 1, 1];
            address cur = users[msg.sender].sponsor;
            for (uint8 i = 0; i < 5; i++) {
                if (cur == address(0)) break;
                uint256 share = (totalMvt * rates[i]) / 100;
                if (share > 0 && users[cur].isActive) {
                    users[cur].mvtBalance    += share;
                    users[cur].totalReceived += share;
                    toSell -= share;
                    emit StakeLevelIncomePaid(cur, msg.sender, i + 1, share);
                    _recordTx(cur, TX_LEVEL_INCOME, share, i + 1, msg.sender);
                }
                cur = users[cur].sponsor;
            }
        }

        // Sell remaining tokens — USDT lands in this contract
        uint256 usdtBefore = usdtToken.balanceOf(address(this));
        mvaultToken.sell(toSell);
        uint256 usdtGross = usdtToken.balanceOf(address(this)) - usdtBefore;

        uint256 usdtToUser  = usdtGross;
        uint256 adminCapCut = 0;

        if (!isLocked && usdtGross > usdtCap) {
            // Flexible 2× cap: excess goes to adminPool
            adminCapCut = usdtGross - usdtCap;
            usdtToUser  = usdtCap;
            adminPool  += adminCapCut;
        }

        // Credit USDT to user's in-contract balance (not direct wallet transfer)
        if (usdtToUser > 0) {
            users[msg.sender].usdtBalance += usdtToUser;
        }

        emit Unstaked(msg.sender, stakeIndex, totalMvt, usdtToUser, adminCapCut);
        _recordTx(msg.sender, TX_UNSTAKE, usdtToUser, 0, address(0));
    }

    /**
     * @notice Convert a flexible position to locked.
     *         Starts the 10-month lock from now.
     *         The 2× cap no longer applies once converted.
     */
    function convertToLocked(uint256 stakeIndex) external {
        if (stakeIndex >= _stakes[msg.sender].length) revert InvalidIndex();
        StakePosition storage pos = _stakes[msg.sender][stakeIndex];
        if (!pos.active) revert AlreadyUnstaked();
        if (pos.lockedSince != 0) revert AlreadyLocked();

        pos.lockedSince = block.timestamp;
        emit ConvertedToLocked(msg.sender, stakeIndex, block.timestamp);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // VIEW FUNCTIONS
    // ─────────────────────────────────────────────────────────────────────────

    function getUserInfo(address u) external view returns (
        bool    isRegistered,
        bool    isActive,
        address sponsor,
        uint256 directCount,
        address binaryParent,
        bool    placedLeft,
        address leftChild,
        address rightChild,
        uint256 leftSubUsers,
        uint256 rightSubUsers,
        uint256 mvtBalance,
        uint256 totalReceived,
        uint256 totalSold,
        uint256 incomeLimit,
        uint256 usdtBalance,
        uint256 rebirthPool,
        uint256 btcPoolBalance,
        uint256 powerLegPoints,
        uint256 matchedPairs,
        address mainAccount,
        uint256 rebirthCount,
        uint256 joinedAt
    ) {
        User storage d = users[u];
        return (
            d.isRegistered, d.isActive, d.sponsor, d.directCount,
            d.binaryParent, d.placedLeft, d.leftChild, d.rightChild,
            d.leftSubUsers, d.rightSubUsers,
            d.mvtBalance, d.totalReceived, d.totalSold,
            d.incomeLimit, d.usdtBalance, d.rebirthPool,
            d.btcPoolBalance,
            d.powerLegPoints, d.matchedPairs,
            d.mainAccount, d.rebirthCount, d.joinedAt
        );
    }

    /**
     * @notice Returns BTC pool details for a user.
     */
    function getBtcPoolInfo(address u) external view returns (
        uint256 btcPoolBalance,
        uint256 totalBtcEarned
    ) {
        return (users[u].btcPoolBalance, users[u].totalBtcEarned);
    }

    /**
     * @notice Check whether a user can trigger a rebirth and how much is in their pool.
     */
    function canRebirth(address user) external view returns (bool eligible, uint256 poolBalance) {
        poolBalance = users[user].rebirthPool;
        eligible    = users[user].packagePrice > 0 && poolBalance >= users[user].packagePrice;
    }

    function getCurrentBinaryPairs(address u) external view returns (uint256 currentPairs, uint256 newPairs) {
        currentPairs = _minOf(users[u].leftSubUsers, users[u].rightSubUsers);
        newPairs = currentPairs > users[u].matchedPairs
            ? currentPairs - users[u].matchedPairs : 0;
    }

    function getMvtPrice() external view returns (uint256 buyPrice, uint256 sellPrice) {
        buyPrice  = mvaultToken.getBuyPrice();
        sellPrice = mvaultToken.getSellPrice();
    }

    function getAllUsersCount() external view returns (uint256) { return allUsers.length; }

    function getBoardPrice(uint256 _level) external view returns (uint256) {
        if (address(boardHandler) == address(0)) return 0;
        return boardHandler.getBoardPrice(_level);
    }

    function getBoardQueueLength(uint256 _level) external view returns (uint256) {
        if (address(boardHandler) == address(0)) return 0;
        return boardHandler.getBoardQueueLength(_level);
    }

    function getBoardMatrixInfo(uint256 _level, uint256 _index) external view returns (
        address owner, uint256 filledCount, bool completed
    ) {
        return boardHandler.getBoardMatrixInfo(_level, _index);
    }

    function getBoardCurrentIndex(uint256 _level) external view returns (uint256) {
        if (address(boardHandler) == address(0)) return 0;
        return boardHandler.getBoardCurrentIndex(_level);
    }

    function getUserBoardStats(address _user) external view returns (
        uint256 entries,
        uint256 totalRewards
    ) {
        return (boardEntryCount[_user], totalBoardRewardsEarned[_user]);
    }

    function canEnterBoard(address _user) external view returns (bool eligible, uint256 btcBalance, uint256 boardPrice) {
        if (address(boardHandler) == address(0)) return (false, 0, 0);
        btcBalance = users[_user].btcPoolBalance;
        boardPrice = boardHandler.getBoardPrice(1);
        eligible   = users[_user].isActive && btcBalance >= boardPrice;
    }

    function getPoolBalances() external view returns (
        uint256 binary,
        uint256 reserve,
        uint256 admin
    ) {
        return (binaryPool, reservePool, adminPool);
    }

    function getMvtContractBalance() external view returns (uint256) {
        return mvaultToken.balanceOf(address(this));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TRANSACTION HISTORY
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Return stored transaction records for `user`, newest-first.
     * @param user    Wallet address to query.
     * @param offset  Number of newest records to skip (0 = start from latest).
     * @param limit   Max records to return.
     * @return records Array of TxRecord structs.
     * @return total   Total number of records stored for this user.
     */
    function getTransactions(
        address user,
        uint256 offset,
        uint256 limit
    ) external view returns (TxRecord[] memory records, uint256 total) {
        TxRecord[] storage all = _txRecords[user];
        total = all.length;
        if (total == 0 || offset >= total) return (new TxRecord[](0), total);

        // newest-first: start from the last element and walk backwards
        uint256 available = total - offset;
        uint256 count     = limit < available ? limit : available;

        records = new TxRecord[](count);
        for (uint256 i = 0; i < count; i++) {
            records[i] = all[total - 1 - offset - i];
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PROFILE
    // ─────────────────────────────────────────────────────────────────────────

    function setProfile(
        string calldata _displayName,
        string calldata _email,
        string calldata _phone,
        string calldata _country
    ) external {
        if (!users[msg.sender].isRegistered) revert NotRegistered();
        User storage u = users[msg.sender];
        u.displayName = _displayName;
        u.email       = _email;
        u.phone       = _phone;
        u.country     = _country;
        u.profileSet  = true;
        emit ProfileUpdated(msg.sender);
    }

    function getProfile(address _user) external view returns (
        string memory displayName,
        string memory email,
        string memory phone,
        string memory country,
        bool profileSet
    ) {
        User storage u = users[_user];
        return (u.displayName, u.email, u.phone, u.country, u.profileSet);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STAKING VIEW FUNCTIONS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Returns the number of stake positions for a user.
     */
    function getStakeCount(address user) external view returns (uint256) {
        return _stakes[user].length;
    }

    /**
     * @notice Returns details of a specific stake position.
     */
    function getStake(address user, uint256 index) external view returns (
        uint256 mvtAmount,
        uint256 usdtInvested,
        uint256 stakedAt,
        uint256 lockedSince,
        bool    active
    ) {
        require(index < _stakes[user].length, "Invalid index");
        StakePosition storage p = _stakes[user][index];
        return (p.mvtAmount, p.usdtInvested, p.stakedAt, p.lockedSince, p.active);
    }

    /**
     * @notice Returns all active stake positions for a user.
     */
    function getActiveStakes(address user) external view returns (
        uint256[] memory indices,
        uint256[] memory mvtAmounts,
        uint256[] memory usdtInvestedArr,
        uint256[] memory stakedAts,
        uint256[] memory lockedSinces
    ) {
        uint256 total = _stakes[user].length;
        uint256 count = 0;
        for (uint256 i = 0; i < total; i++) {
            if (_stakes[user][i].active) count++;
        }
        indices        = new uint256[](count);
        mvtAmounts     = new uint256[](count);
        usdtInvestedArr = new uint256[](count);
        stakedAts      = new uint256[](count);
        lockedSinces   = new uint256[](count);
        uint256 j = 0;
        for (uint256 i = 0; i < total; i++) {
            if (_stakes[user][i].active) {
                StakePosition storage p = _stakes[user][i];
                indices[j]         = i;
                mvtAmounts[j]      = p.mvtAmount;
                usdtInvestedArr[j] = p.usdtInvested;
                stakedAts[j]       = p.stakedAt;
                lockedSinces[j]    = p.lockedSince;
                j++;
            }
        }
    }

    /**
     * @notice Returns LOCK_DURATION constant (for frontend use).
     */
    function getLockDuration() external pure returns (uint256) {
        return LOCK_DURATION;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // INTERNAL HELPERS
    // ─────────────────────────────────────────────────────────────────────────

    function _minOf(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}
