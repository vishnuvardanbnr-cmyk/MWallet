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
// Activation ($130 USDT):
//   $130 → MvaultToken mints MVT (token keeps 10% for liquidity)
//   Gross MVT (pre-deduction, e.g. 1,300) is the basis for all splits:
//     30% → level income   (10 upline levels)
//     30% → binaryPool     (admin distributes per cycle)
//     30% → adminPool      (admin free pool)
//     10% → liquidity      (handled by MvaultToken internally)
//
// Income limit  = 3 × $130 = $390 USDT per user.
//   When user sells MVT → USDT first fills income limit → excess to rebirthPool.
//   Once incomeLimit = 0 all sell proceeds go to rebirthPool.
//
// Rebirth:
//   Requires rebirthPool ≥ $130.
//   On rebirth(subAccount):
//     • $130 deducted from rebirthPool  → funds sub-account activation.
//     • $130 transferred from rebirthPool → credited to main account usdtBalance.
//     • incomeLimit resets to $390.
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
//   Step 1 distributeBinaryIncome:  70% to pair matchers; sets powerLegPoints = newPairs×10
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

    // ── Constants ─────────────────────────────────────────────────────────────
    uint256 public constant PACKAGE_PRICE  = 130 * 1e18; // $130 USDT (18 decimals)
    uint256 public constant INCOME_LIMIT   = 390 * 1e18; // 3 × $130 per activation cycle
    uint256 public constant LEVEL_ALLOC    = 30;          // % of gross MVT → level income (10 levels)
    uint256 public constant BINARY_ALLOC   = 30;          // % of gross MVT → binary pool
    uint256 public constant ADMIN_ALLOC    = 30;          // % of gross MVT → admin free pool
    // Liquidity 10% handled internally by MvaultToken (only 90% minted)
    uint256 public constant BTC_POOL_RATE  = 10;          // % of sell USDT → user BTC pool

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
        // Rebirth
        address mainAccount;      // if sub-account → points to main; else address(0)
        uint256 rebirthCount;
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

    // Binary distribution state
    uint256 private _powerLeg30Reserve;
    bool    private _binaryDistributed;

    // ── Board Matrix tracking ──────────────────────────────────────────────────
    mapping(address => uint256) public boardEntryCount;
    mapping(address => uint256) public totalBoardRewardsEarned;

    // ── Staking ───────────────────────────────────────────────────────────────
    uint256 public constant MIN_STAKE_USDT = 50 * 1e18; // $50 minimum

    struct StakePosition {
        uint256 mvtAmount;    // MVT tokens currently staked (held by this contract)
        uint256 usdtInvested; // original USDT deposited
        uint256 stakedAt;     // timestamp
        bool    isLocked;     // false = flexible, true = locked
        bool    active;       // false once unstaked
    }

    mapping(address => StakePosition[]) private _stakes;

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
    event ProfileUpdated(address indexed user);
    event MvaultTokenUpdated(address newToken);
    event AdminWithdraw(address indexed to, uint256 amount);
    event ReserveWithdraw(address indexed to, uint256 amount);
    event BoardEntered(address indexed user, uint256 boardLevel, uint256 usdtDeducted);
    event BoardRewardCredited(address indexed user, uint256 usdtAmount, uint256 boardLevel);
    event BoardHandlerUpdated(address indexed newHandler);
    event Staked(address indexed user, uint256 stakeIndex, uint256 usdtAmount, uint256 mvtMinted, bool isLocked);
    event Unstaked(address indexed user, uint256 stakeIndex, uint256 mvtReturned, uint256 usdtReceived);
    event StakeLevelIncomePaid(address indexed to, address indexed from, uint8 level, uint256 usdtAmount);

    // ── Errors ────────────────────────────────────────────────────────────────
    error AlreadyRegistered();
    error NotRegistered();
    error AlreadyActive();
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
    error BinaryNotDistributed();
    error BinaryAlreadyDistributed();
    error BoardHandlerNotSet();
    error InsufficientBtcPoolForBoard();

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
        require(u.isActive, "Not active");

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
        require(msg.sender == address(boardHandler), "Not board handler");
        require(_user != address(0), "ZA");
        require(_usdtAmount > 0, "ZA");

        users[_user].usdtBalance     += _usdtAmount;
        users[_user].totalUsdtEarned += _usdtAmount;
        totalBoardRewardsEarned[_user] += _usdtAmount;

        emit BoardRewardCredited(_user, _usdtAmount, _boardLevel);
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

            address parent = (binaryParent != address(0) && users[binaryParent].isRegistered)
                ? binaryParent
                : sponsor;

            if (placeLeft  && users[parent].leftChild  != address(0)) revert PositionTaken();
            if (!placeLeft && users[parent].rightChild != address(0)) revert PositionTaken();

            _createUser(msg.sender, sponsor, parent, placeLeft, address(0));

            if (placeLeft) users[parent].leftChild  = msg.sender;
            else           users[parent].rightChild = msg.sender;

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
     * @notice Pay $130 USDT and activate.
     *         Caller must have pre-approved this contract for PACKAGE_PRICE USDT.
     */
    function activate() external nonReentrant {
        User storage u = users[msg.sender];
        if (!u.isRegistered) revert NotRegistered();
        if (u.isActive)      revert AlreadyActive();

        bool ok = usdtToken.transferFrom(msg.sender, address(this), PACKAGE_PRICE);
        if (!ok) revert TransferFailed();

        _doActivate(msg.sender);
    }

    /**
     * @dev Core activation logic.  USDT must already be in this contract before calling.
     */
    function _doActivate(address user) internal {
        // Snapshot buy price BEFORE minting (price rises after)
        uint256 buyPrice = mvaultToken.getBuyPrice();
        // Gross MVT = what $130 buys at current price (e.g. 1,300 MVT at 0.1 USDT)
        uint256 grossMvt = (PACKAGE_PRICE * 1e18) / buyPrice;

        // Approve token contract and mint
        usdtToken.approve(address(mvaultToken), PACKAGE_PRICE);
        uint256 before = mvaultToken.balanceOf(address(this));
        mvaultToken.addLiquidityAndMint(address(this), PACKAGE_PRICE);
        uint256 minted = mvaultToken.balanceOf(address(this)) - before; // actual 90%

        // Split on GROSS basis: 30% level + 30% binary + 30% admin + 10% liquidity (in MVT token)
        uint256 levelAmt  = (grossMvt * LEVEL_ALLOC)  / 100;  // 30%
        uint256 binaryAmt = (grossMvt * BINARY_ALLOC) / 100;  // 30%
        uint256 adminAmt  = (grossMvt * ADMIN_ALLOC)  / 100;  // 30%
        // Remaining ~10% (rounding dust) also goes to adminPool
        uint256 dust = grossMvt - levelAmt - binaryAmt - adminAmt;

        binaryPool += binaryAmt;
        adminPool  += adminAmt + dust;

        users[user].isActive    = true;
        users[user].incomeLimit = INCOME_LIMIT; // $390

        _distributeLevelIncome(user, grossMvt, levelAmt);

        emit Activated(user, minted, grossMvt, levelAmt, binaryAmt, adminAmt);
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
            } else {
                adminPool += share;
                emit LevelIncomeSkipped(cur, lvl, share);
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
        if (lvl <= 4)  return 2;  // L1–L4: 2 direct sponsors
        return 5;                 // L5–L10: 5 direct sponsors
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
        require(u.isActive, "Not active");
        if (u.rebirthPool < PACKAGE_PRICE) revert InsufficientRebirthPool();
        require(!users[subAccount].isRegistered, "Sub-account already registered");

        // ── 1. Deduct $130 for activation ────────────────────────────────────
        u.rebirthPool -= PACKAGE_PRICE;

        // ── 2. Credit $130 to main wallet (capped at what remains in pool) ───
        uint256 mainCredit = u.rebirthPool >= PACKAGE_PRICE
            ? PACKAGE_PRICE
            : u.rebirthPool;
        u.rebirthPool     -= mainCredit;
        u.usdtBalance     += mainCredit;
        u.totalUsdtEarned += mainCredit;

        // ── 3. Reset income limit ─────────────────────────────────────────────
        u.incomeLimit = INCOME_LIMIT;

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
        _doActivate(subAccount);

        u.rebirthCount++;

        emit Reborn(msg.sender, subAccount, u.rebirthCount);
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
     *         Sets powerLegPoints = newPairs × 10 for matching users.
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
        require(binaryPool > 0, "Empty binary pool");

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
            users[u].powerLegPoints  += newPairs * 10;
            users[u].matchedPairs     = pairs;
            emit BinaryIncomePaid(u, newPairs, share);
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
        require(adminPool >= amount, "Exceeds admin pool");
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
        require(reservePool >= amount, "Exceeds reserve pool");
        reservePool             -= amount;
        users[to].mvtBalance    += amount;
        users[to].totalReceived += amount;
        emit ReserveWithdraw(to, amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STAKING
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Stake USDT. 15% distributed as level income (in USDT) to 5 uplines.
     *         Remaining 85% buys MVT at current price. MVT held by this contract.
     * @param usdtAmount  Amount of USDT to stake (must be >= MIN_STAKE_USDT).
     * @param isLocked    false = flexible, true = locked.
     */
    function stake(uint256 usdtAmount, bool isLocked) external nonReentrant {
        require(usdtAmount >= MIN_STAKE_USDT, "Below $50 minimum");
        require(users[msg.sender].isRegistered, "Not registered");
        require(users[msg.sender].isActive,     "Not activated");

        // Pull USDT from the user
        bool ok = usdtToken.transferFrom(msg.sender, address(this), usdtAmount);
        require(ok, "USDT transfer failed");

        // Distribute 15% level income in USDT to 5 uplines
        uint8[5] memory rates = [10, 2, 1, 1, 1]; // 10+2+1+1+1 = 15%
        address cur = users[msg.sender].sponsor;
        uint256 levelDistributed = 0;
        for (uint8 i = 0; i < 5; i++) {
            uint256 share = (usdtAmount * rates[i]) / 100;
            if (share == 0) { cur = users[cur].sponsor; continue; }
            if (cur == address(0)) { adminPool += share; }
            else if (!users[cur].isActive) { adminPool += share; }
            else {
                users[cur].usdtBalance += share;
                levelDistributed += share;
                emit StakeLevelIncomePaid(cur, msg.sender, i + 1, share);
            }
            cur = users[cur].sponsor;
        }
        uint256 adminShare = (usdtAmount * 15 / 100) - levelDistributed;
        if (adminShare > 0) adminPool += adminShare;

        // Buy MVT with remaining 85%
        uint256 forTokens = usdtAmount - (usdtAmount * 15 / 100);
        usdtToken.approve(address(mvaultToken), forTokens);
        uint256 balBefore = mvaultToken.balanceOf(address(this));
        mvaultToken.addLiquidityAndMint(address(this), forTokens);
        uint256 mvtMinted = mvaultToken.balanceOf(address(this)) - balBefore;
        require(mvtMinted > 0, "No MVT minted");

        // Record stake
        uint256 stakeIndex = _stakes[msg.sender].length;
        _stakes[msg.sender].push(StakePosition({
            mvtAmount:    mvtMinted,
            usdtInvested: usdtAmount,
            stakedAt:     block.timestamp,
            isLocked:     isLocked,
            active:       true
        }));

        emit Staked(msg.sender, stakeIndex, usdtAmount, mvtMinted, isLocked);
    }

    /**
     * @notice Unstake a position.
     *         Flexible: 5% tokens → direct sponsor; 95% sold for USDT → user.
     *         Locked:   5%/2%/1%/1%/1% tokens → 5 uplines; 90% sold for USDT → user.
     *         NO BTC pool deduction.
     */
    function unstake(uint256 stakeIndex) external nonReentrant {
        require(stakeIndex < _stakes[msg.sender].length, "Invalid index");
        StakePosition storage pos = _stakes[msg.sender][stakeIndex];
        require(pos.active, "Already unstaked");

        pos.active = false;
        uint256 totalMvt = pos.mvtAmount;
        bool isLocked = pos.isLocked;

        uint256 toSell = totalMvt;

        if (!isLocked) {
            // Flexible: 5% to direct sponsor
            uint256 sponsorShare = (totalMvt * 5) / 100;
            address sponsor = users[msg.sender].sponsor;
            if (sponsor != address(0) && users[sponsor].isActive) {
                bool t = mvaultToken.transfer(sponsor, sponsorShare);
                if (!t) { /* silently keep */ } else { toSell -= sponsorShare; }
            }
        } else {
            // Locked: 5%+2%+1%+1%+1% = 10% tokens to 5 uplines
            uint8[5] memory rates = [5, 2, 1, 1, 1];
            address cur = users[msg.sender].sponsor;
            for (uint8 i = 0; i < 5; i++) {
                uint256 share = (totalMvt * rates[i]) / 100;
                if (share == 0) { cur = users[cur].sponsor; continue; }
                if (cur != address(0) && users[cur].isActive) {
                    bool t = mvaultToken.transfer(cur, share);
                    if (t) toSell -= share;
                }
                cur = users[cur].sponsor;
            }
        }

        // Sell remaining tokens — proceeds come to this contract
        uint256 usdtBefore = usdtToken.balanceOf(address(this));
        mvaultToken.sell(toSell);
        uint256 usdtReceived = usdtToken.balanceOf(address(this)) - usdtBefore;

        // Transfer USDT to user (no BTC pool deduction)
        if (usdtReceived > 0) {
            bool sent = usdtToken.transfer(msg.sender, usdtReceived);
            require(sent, "USDT transfer failed");
        }

        emit Unstaked(msg.sender, stakeIndex, totalMvt, usdtReceived);
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
        eligible    = poolBalance >= PACKAGE_PRICE;
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
    // PROFILE
    // ─────────────────────────────────────────────────────────────────────────

    function setProfile(
        string calldata _displayName,
        string calldata _email,
        string calldata _phone,
        string calldata _country
    ) external {
        require(users[msg.sender].isRegistered, "Not registered");
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
        bool    isLocked,
        bool    active
    ) {
        require(index < _stakes[user].length, "Invalid index");
        StakePosition storage p = _stakes[user][index];
        return (p.mvtAmount, p.usdtInvested, p.stakedAt, p.isLocked, p.active);
    }

    /**
     * @notice Returns all active stake positions for a user.
     */
    function getActiveStakes(address user) external view returns (
        uint256[] memory indices,
        uint256[] memory mvtAmounts,
        uint256[] memory usdtInvested,
        uint256[] memory stakedAts,
        bool[]    memory isLocked
    ) {
        uint256 total = _stakes[user].length;
        uint256 count = 0;
        for (uint256 i = 0; i < total; i++) {
            if (_stakes[user][i].active) count++;
        }
        indices     = new uint256[](count);
        mvtAmounts  = new uint256[](count);
        usdtInvested = new uint256[](count);
        stakedAts   = new uint256[](count);
        isLocked    = new bool[](count);
        uint256 j = 0;
        for (uint256 i = 0; i < total; i++) {
            if (_stakes[user][i].active) {
                StakePosition storage p = _stakes[user][i];
                indices[j]     = i;
                mvtAmounts[j]  = p.mvtAmount;
                usdtInvested[j] = p.usdtInvested;
                stakedAts[j]   = p.stakedAt;
                isLocked[j]    = p.isLocked;
                j++;
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // INTERNAL HELPERS
    // ─────────────────────────────────────────────────────────────────────────

    function _minOf(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}
