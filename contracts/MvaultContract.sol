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

// ─────────────────────────────────────────────
// MvaultStaking interface (called by MvaultContract delegates)
// ─────────────────────────────────────────────
interface IMvaultStaking {
    function executeStake(address user, uint256 amount, bool isLocked) external;
    function executeUnstake(address user, uint256 stakeIndex) external;
    function executeConvertToLocked(address user, uint256 stakeIndex) external;
    function getStakeCount(address user) external view returns (uint256);
    function getStake(address user, uint256 index) external view returns (
        uint256 mvtAmount, uint256 usdtInvested, uint256 stakedAt, uint256 lockedSince, bool active
    );
    function getActiveStakes(address user) external view returns (
        uint256[] memory indices, uint256[] memory mvtAmounts,
        uint256[] memory usdtInvestedArr, uint256[] memory stakedAts, uint256[] memory lockedSinces
    );
}

contract MvaultContract is Ownable, ReentrancyGuard {

    // ── External contracts ────────────────────────────────────────────────────
    IERC20              public immutable usdtToken;
    IMvaultToken        public           mvaultToken;
    IMvaultBoardMatrix  public           boardHandler;
    IMvaultStaking      public           stakingModule;

    // ── Package constants ──────────────────────────────────────────────────────
    uint256 internal constant PRICE_STARTER  =  75 * 1e18;
    uint256 internal constant INCOME_STARTER = 225 * 1e18;
    uint256 internal constant PRICE_PRO      = 150 * 1e18;
    uint256 internal constant INCOME_PRO     = 450 * 1e18;
    // $20 of every activation/reactivation is carved out and auto-placed in Board Pool 1
    uint256 internal constant BOARD_AUTO_ENTRY = 20 * 1e18;

    // ── Pool allocation constants ──────────────────────────────────────────────
    uint256 internal constant LEVEL_ALLOC    = 30;
    uint256 internal constant COMMUNITY_ALLOC = 10;
    uint256 internal constant PLACEMENT_ALLOC = 20;
    uint256 internal constant ADMIN_ALLOC    = 20;
    uint256 internal constant RANK_ALLOC     = 10;
    // Liquidity 10% handled internally by MvaultToken (only 90% minted)

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
        uint256 leftSubVolume;    // cumulative USDT activated in left binary subtree
        uint256 rightSubVolume;   // cumulative USDT activated in right binary subtree
        // Virtual MVT
        uint256 mvtBalance;       // available to sell
        uint256 totalReceived;    // lifetime MVT credited
        uint256 totalSold;        // lifetime MVT sold
        // USDT income
        uint256 incomeLimit;      // remaining USDT earning capacity (resets on rebirth)
        uint256 usdtBalance;      // withdrawable USDT
        uint256 rebirthPool;      // USDT accumulating toward next rebirth
        uint256 totalUsdtEarned;  // lifetime USDT received to usdtBalance
        // Legacy fields — no longer written to (kept for storage layout compatibility)
        uint256 btcPoolBalance;
        uint256 totalBtcEarned;
        // Package
        uint256 packagePrice;     // activation price paid ($75 or $150)
        uint256 incomeLimitCap;   // max income per cycle (3 × packagePrice)
        // Rebirth
        address mainAccount;      // if sub-account → points to main; else address(0)
        uint256 rebirthCount;
        // Rank
        uint8   rank;             // reserved for rank system (not yet auto-computed)
        uint256 teamSalesUsdt;    // cumulative USDT activated in sponsor-tree downline
        // Meta
        uint256 joinedAt;
        // Profile
        string  displayName;
        string  email;
        string  phone;
        string  country;
        bool    profileSet;
        uint8   btcPoolRate; // legacy — no longer used
    }

    mapping(address => User) public users;
    address[] public allUsers;
    uint256   public totalUsers;

    // ── Pool balances (virtual MVT) ───────────────────────────────────────────
    uint256 public reservePool;
    uint256 public adminPool;
    uint256 public rankPool;
    uint256 public communityPool;

    // Community wallet — receives 10% of grossMvt on every activation
    address public communityWallet;

    // Placement income config (binary tree, 30 levels)
    uint256[30] public placementRates; // basis points out of 10000; sum = 2000 (20%)
    uint256 public refsPerGroup;       // direct referrals required per 3-level group

    // Manager — can call admin setters without full owner powers
    address public manager;

    // ── Board Matrix tracking ──────────────────────────────────────────────────
    mapping(address => uint256) public boardEntryCount;
    mapping(address => uint256) public totalBoardRewardsEarned;


    // ── Transaction History (on-chain) ────────────────────────────────────────
    // txType constants
    uint8 internal constant TX_ACTIVATION        = 0;
    uint8 internal constant TX_LEVEL_INCOME      = 1;
    uint8 internal constant TX_LEVEL_MISSED      = 2;
    uint8 internal constant TX_PLACEMENT_INCOME  = 3;
    uint8 internal constant TX_PLACEMENT_MISSED  = 4;
    uint8 internal constant TX_SELL_MVT          = 5;
    uint8 internal constant TX_USDT_WITHDRAW  = 7;
    uint8 internal constant TX_REACTIVATION         = 15;
    uint8 internal constant TX_RANK_INCOME           = 16;
    uint8 internal constant TX_STAKING_LEVEL_INCOME  = 17;
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
    event PlacementIncomePaid(address indexed to, address indexed from, uint8 level, uint256 amount);
    event MvtSold(address indexed user, uint256 mvtAmount, uint256 usdtNet, uint256 usdtToIncome, uint256 usdtToRebirth);
    event AdminUsdtDeposited(address indexed from, uint256 amount);
    event UsdtWithdrawn(address indexed user, uint256 amount);
    event Reborn(address indexed mainAccount, address indexed subAccount, uint256 rebirthIndex);
    event Reactivated(address indexed user, uint256 pkgPrice, uint256 grossMvt, bool upgraded);
    event RankIncomePaid(address indexed to, address indexed from, uint8 rank, uint256 amount);
    event RankIncomeDistributed(uint256 totalPool, uint256 recipientCount);
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
    event AdminActivated(address indexed user, uint8 pkg);

    // ── Errors ────────────────────────────────────────────────────────────────
    error NotAuthorized();
    error AlreadyRegistered();
    error NotRegistered();
    error AlreadyActive();
    error NotActive();
    error InvalidSponsor();
    error PositionTaken();
    error InsufficientVirtualBalance();
    error InsufficientUsdtBalance();
    error InsufficientRebirthPool();
    error NoOpenBinarySlot();
    error ZeroAddress();
    error ZeroAmount();
    error TransferFailed();
    error InvalidPackage();
    error NotEligibleForRebirth();
    error IncomeNotExhausted();
    error CannotDowngradePackage();
    error BoardHandlerNotSet();
    error NotBoardHandler();
    error ExceedsPool();
    error SubAccountAlreadyRegistered();
    error NotStakingModule();
    error InvalidAddress();
    error CannotSelfRegister();
    error CallerNotActive();
    error NoRebirthBalance();
    error UseRebirthInstead();

    // ─────────────────────────────────────────────────────────────────────────
    constructor(address _usdt, address _mvaultToken) Ownable(msg.sender) {
        if (_usdt == address(0) || _mvaultToken == address(0)) revert ZeroAddress();
        usdtToken   = IERC20(_usdt);
        mvaultToken = IMvaultToken(_mvaultToken);
        // Placement rates (bp/10000): L1=5% L2-3=2% L4=1% L5-12=0.5% L13-20=0.4% L21-28=0.3% L29-30=0.2%
        placementRates[0] = 500; placementRates[1] = 200; placementRates[2] = 200;
        placementRates[3] = 100;
        for (uint8 i = 4; i < 12; i++) placementRates[i] = 50;
        for (uint8 i = 12; i < 20; i++) placementRates[i] = 40;
        for (uint8 i = 20; i < 28; i++) placementRates[i] = 30;
        placementRates[28] = 20; placementRates[29] = 20;
        refsPerGroup = 1;
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

    function setStakingModule(address _staking) external onlyOwner {
        if (_staking == address(0)) revert ZeroAddress();
        stakingModule = IMvaultStaking(_staking);
    }

    // ── Manager role ──────────────────────────────────────────────────────────

    modifier onlyOwnerOrManager() {
        if (msg.sender != owner() && msg.sender != manager) revert NotAuthorized();
        _;
    }

    function setManager(address _manager) external onlyOwner {
        if (_manager == address(0)) revert ZeroAddress();
        manager = _manager;
    }

    function setCommunityWallet(address _wallet) external onlyOwner {
        if (_wallet == address(0)) revert ZeroAddress();
        communityWallet = _wallet;
    }

    function setPlacementRates(uint256[30] calldata _rates) external onlyOwner {
        for (uint8 i = 0; i < 30; i++) placementRates[i] = _rates[i];
    }

    function setRefsPerGroup(uint256 _refs) external onlyOwner {
        refsPerGroup = _refs;
    }

    function withdrawCommunityPool(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        if (communityPool < amount) revert ExceedsPool();
        communityPool           -= amount;
        users[to].mvtBalance    += amount;
        users[to].totalReceived += amount;
    }

    // Ghost-activate: sets account active at chosen package with no USDT/MVT/income
    function adminActivate(address user, uint8 pkg) external onlyOwnerOrManager {
        User storage u = users[user];
        if (!u.isRegistered) revert NotRegistered();
        if (u.isActive) revert AlreadyActive();
        (uint256 p, uint256 c) = _pkgParams(pkg);
        u.isActive = true;
        u.packagePrice = p;
        u.incomeLimit = c;
        u.incomeLimitCap = c;
        emit AdminActivated(user, pkg);
    }

    modifier onlyStakingModule() {
        if (msg.sender != address(stakingModule)) revert NotStakingModule();
        _;
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
    // STAKING MODULE — CALLBACKS (called by MvaultStaking)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Batch-credit virtual MVT income to a list of uplines.
     *         Called by MvaultStaking after computing the distribution off-chain.
     */
    function staking_batchCreditMvtIncome(
        address   staker,
        address[] calldata tos,
        uint8[]   calldata levels,
        uint256[] calldata amounts
    ) external onlyStakingModule {
        for (uint256 i = 0; i < tos.length; i++) {
            users[tos[i]].mvtBalance    += amounts[i];
            users[tos[i]].totalReceived += amounts[i];
            _recordTx(tos[i], TX_STAKING_LEVEL_INCOME, amounts[i], levels[i], staker);
        }
    }

    /// @notice Called by MvaultStaking after executeStake completes.
    function staking_postStake(address user, uint256 usdtAmount, uint256 adminAmt)
        external onlyStakingModule
    {
        adminPool += adminAmt;
        _recordTx(user, TX_STAKE, usdtAmount, 0, address(0));
    }

    /// @notice Called by MvaultStaking after executeUnstake completes.
    function staking_postUnstake(address user, uint256 usdtToUser, uint256 adminCapCut)
        external onlyStakingModule
    {
        users[user].usdtBalance += usdtToUser;
        adminPool               += adminCapCut;
        _recordTx(user, TX_UNSTAKE, usdtToUser, 0, address(0));
    }

    function staking_getSponsorChain(address staker, uint8 depth)
        external view
        returns (address[] memory sponsors, bool[] memory actives)
    {
        sponsors = new address[](depth);
        actives  = new bool[](depth);
        address cur = users[staker].sponsor;
        for (uint8 i = 0; i < depth; i++) {
            if (cur == address(0)) break;
            sponsors[i] = cur;
            actives[i]  = users[cur].isActive;
            cur = users[cur].sponsor;
        }
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
            // Volume update deferred to _doActivate (when pkgPrice is known)
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
     * @dev Walk up the binary tree and add `pkgPrice` (USDT) to the appropriate
     *      side volume counter on every ancestor.  Called at activation time so
     *      each activation contributes its real dollar value to binary volumes.
     */
    function _updateAncestorVolumes(address user, uint256 pkgPrice) internal {
        address cur    = users[user].binaryParent;
        bool    isLeft = users[user].placedLeft;

        while (cur != address(0)) {
            if (isLeft) users[cur].leftSubVolume  += pkgPrice;
            else        users[cur].rightSubVolume += pkgPrice;
            isLeft = users[cur].placedLeft;
            cur    = users[cur].binaryParent;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ACTIVATION
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @dev Resolves package params from pkg index.
     *      pkg=1 → STARTER ($75 / $225 limit)
     *      pkg=2 → PRO     ($150 / $450 limit)
     *      $20 of the price is auto-placed into Board Pool 1 on activation.
     */
    function _pkgParams(uint8 pkg) internal pure returns (uint256 price, uint256 incomeCap) {
        if (pkg == 1) return (PRICE_STARTER, INCOME_STARTER);
        if (pkg == 2) return (PRICE_PRO,     INCOME_PRO);
        revert InvalidPackage();
    }

    /**
     * @notice Pay USDT and activate. Choose your package:
     *         pkg=1 → STARTER $75  (income limit $225, $20 auto board entry)
     *         pkg=2 → PRO     $150 (income limit $450, $20 auto board entry)
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
     *         pkg=1 → STARTER ($75)   pkg=2 → PRO ($150)
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
     *         pkg=1 → STARTER ($75)   pkg=2 → PRO ($150)
     */
    function registerAndActivateFor(
        address newUser,
        address binaryParent,
        bool    placeLeft,
        uint8   pkg
    ) external nonReentrant {
        if (newUser == address(0))           revert InvalidAddress();
        if (newUser == msg.sender)           revert CannotSelfRegister();
        if (!users[msg.sender].isRegistered) revert NotRegistered();
        if (!users[msg.sender].isActive)     revert CallerNotActive();
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
        // Volume update deferred to _doActivate (when pkgPrice is known)

        emit Registered(newUser, msg.sender, parent, placeLeft);

        // Activate newUser (USDT already in contract)
        _doActivate(newUser, price, incomeCap);

        emit RegisteredAndActivatedFor(msg.sender, newUser, msg.sender, placeLeft);
    }

    /**
     * @dev Core activation logic.  USDT must already be in this contract before calling.
     *      pkgPrice   — amount paid ($75e18 or $150e18)
     *      incomeCap  — max income this cycle ($225e18 or $450e18)
     *      $20 is carved out first for Board Pool 1 auto-entry; the remaining
     *      $55/$130 base (mvtBase = pkgPrice − $20) drives MVT minting and income distribution.
     */
    function _doActivate(address user, uint256 pkgPrice, uint256 incomeCap) internal {
        // ── Auto board matrix entry: carve out $20 → Board Pool 1 ────────────
        uint256 mvtBase = pkgPrice;
        if (address(boardHandler) != address(0) && pkgPrice >= BOARD_AUTO_ENTRY) {
            mvtBase = pkgPrice - BOARD_AUTO_ENTRY;
            usdtToken.transfer(address(boardHandler), BOARD_AUTO_ENTRY);
            boardEntryCount[user]++;
            boardHandler.enterBoard(user, 1);
            emit BoardEntered(user, 1, BOARD_AUTO_ENTRY);
            _recordTx(user, TX_BOARD_ENTRY, BOARD_AUTO_ENTRY, 1, address(0));
        }

        // Snapshot buy price BEFORE minting (price rises after)
        uint256 buyPrice = mvaultToken.getBuyPrice();
        // Gross MVT = what mvtBase buys at current price
        uint256 grossMvt = (mvtBase * 1e18) / buyPrice;

        // Approve token contract and mint on mvtBase
        usdtToken.approve(address(mvaultToken), mvtBase);
        uint256 before = mvaultToken.balanceOf(address(this));
        mvaultToken.addLiquidityAndMint(address(this), mvtBase);
        uint256 minted = mvaultToken.balanceOf(address(this)) - before; // actual 90%

        // Split on GROSS basis: 30% level + 10% community + 20% placement + 20% admin + 10% rank
        uint256 levelAmt     = (grossMvt * LEVEL_ALLOC)     / 100;
        uint256 communityAmt = (grossMvt * COMMUNITY_ALLOC) / 100;
        uint256 placementAmt = (grossMvt * PLACEMENT_ALLOC) / 100;
        uint256 adminAmt     = (grossMvt * ADMIN_ALLOC)     / 100;
        uint256 rankAmt      = (grossMvt * RANK_ALLOC)      / 100;
        uint256 dust = grossMvt - levelAmt - communityAmt - placementAmt - adminAmt - rankAmt;

        communityPool += communityAmt;
        adminPool     += adminAmt + dust;

        users[user].isActive       = true;
        users[user].incomeLimit    = incomeCap;
        users[user].packagePrice   = pkgPrice;
        users[user].incomeLimitCap = incomeCap;

        _updateAncestorVolumes(user, pkgPrice);
        _updateTeamStats(user, pkgPrice);
        _distributeLevelIncome(user, grossMvt, levelAmt);
        _distributeRankIncome(user, grossMvt, rankAmt);
        _distributePlacementIncome(user, grossMvt, placementAmt);

        emit Activated(user, minted, grossMvt, levelAmt, communityAmt + placementAmt, adminAmt);
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

    /**
     * @dev Immediately distributes the rank portion of a new activation up the
     *      sponsor chain.  Walks up to 50 hops looking for uplines with rank > 0.
     *
     *      Slot percentages (of grossMvt): M1=1%, M2=2%, M3=2%, M4=2%, M5=3%  (total 10%)
     *      A person with rank R fills all unfilled slots 1…R simultaneously.
     *      Unfilled slots → adminPool.  If all 5 slots are filled, admin gets 0.
     *
     *      Option B: if an upline has hit their incomeLimit the slot is NOT
     *      skipped — income goes to admin (consistent with level income).
     */
    function _distributeRankIncome(address from, uint256 grossMvt, uint256 rankAmt) internal {
        uint8   filled = 0;    // bitmask: bit k set ⟹ slot k is filled
        uint256 paid   = 0;
        address cur    = users[from].sponsor;

        for (uint256 depth = 0; depth < 50 && cur != address(0); depth++) {
            uint8 r = users[cur].rank;
            if (r > 5) r = 5;
            if (r > 0) {
                for (uint8 slot = 1; slot <= r; slot++) {
                    uint8 bit = uint8(1 << slot);
                    if (filled & bit == 0) {
                        filled |= bit;
                        uint256 slotAmt = _rankSlotAmt(slot, grossMvt);
                        users[cur].mvtBalance    += slotAmt;
                        users[cur].totalReceived += slotAmt;
                        paid += slotAmt;
                        emit RankIncomePaid(cur, from, slot, slotAmt);
                        _recordTx(cur, TX_RANK_INCOME, slotAmt, slot, from);
                    }
                }
            }
            if (filled == 0x3E) break;   // bits 1-5 all set → all slots filled
            cur = users[cur].sponsor;
        }

        if (rankAmt > paid) adminPool += rankAmt - paid;   // unfilled slots → admin
    }

    /// @dev Per-slot rank income amounts as % of grossMvt: 1%, 2%, 2%, 2%, 3%.
    function _rankSlotAmt(uint8 slot, uint256 grossMvt) internal pure returns (uint256) {
        if (slot == 1) return grossMvt / 100;           //  1%
        if (slot == 5) return (grossMvt * 3) / 100;    //  3%
        return (grossMvt * 2) / 100;                    //  2% (slots 2, 3, 4)
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
            cur = users[cur].sponsor;
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

        // ── Route full USDT through income limit → rebirth pool ──────────────
        uint256 netUsdt   = usdtReceived;
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

        emit MvtSold(msg.sender, amount, netUsdt, toIncome, toRebirth);
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
        // Volume update handled in _doActivate below

        // ── 5 & 6. Activate sub-account (USDT already in contract) ───────────
        // Sub-account inherits the same package tier as the main account.
        _doActivate(subAccount, u.packagePrice, u.incomeLimitCap);

        u.rebirthCount++;

        emit Reborn(msg.sender, subAccount, u.rebirthCount);
        _recordTx(msg.sender, TX_REBIRTH, 0, 0, subAccount);
    }

    /**
     * @notice Claim a partial rebirth pool balance (< $150) back to USDT balance.
     *         If rebirthPool >= $150 the user must use rebirth() instead.
     *         This allows users to recover small overflow amounts that are not
     *         enough to trigger a full rebirth.
     */
    function claimRebirthBalance() external nonReentrant {
        User storage u = users[msg.sender];
        if (!u.isActive)               revert NotActive();
        if (u.rebirthPool == 0)              revert NoRebirthBalance();
        if (u.rebirthPool >= u.packagePrice) revert UseRebirthInstead();

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
    //   B) Upgrade from STARTER → PRO by paying $150 → income limit resets
    //      to $450, packagePrice updated to PRO, rebirth becomes eligible.
    //
    // Rules:
    //   • Caller must be active and have incomeLimit == 0.
    //   • Cannot downgrade from PRO (pkg=2) to STARTER (pkg=1).
    //   • Same MVT minting and pool distributions as initial activation.
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Reactivate (or upgrade) by paying USDT from your wallet.
     *         pkg=1 → STARTER $75  (resets limit to $225, no rebirth)
     *         pkg=2 → PRO     $150 (resets limit to $450, rebirth eligible)
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
     *         pkg=1 → STARTER $75   pkg=2 → PRO $150
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
     *      $20 is carved out for Board Pool 1 auto-entry (same as activation).
     */
    function _doReactivate(address user, uint256 pkgPrice, uint256 incomeCap) internal {
        bool upgraded = (users[user].packagePrice != pkgPrice);

        // ── Auto board matrix entry: carve out $20 → Board Pool 1 ────────────
        uint256 mvtBase = pkgPrice;
        if (address(boardHandler) != address(0) && pkgPrice >= BOARD_AUTO_ENTRY) {
            mvtBase = pkgPrice - BOARD_AUTO_ENTRY;
            usdtToken.transfer(address(boardHandler), BOARD_AUTO_ENTRY);
            boardEntryCount[user]++;
            boardHandler.enterBoard(user, 1);
            emit BoardEntered(user, 1, BOARD_AUTO_ENTRY);
            _recordTx(user, TX_BOARD_ENTRY, BOARD_AUTO_ENTRY, 1, address(0));
        }

        uint256 buyPrice = mvaultToken.getBuyPrice();
        uint256 grossMvt = (mvtBase * 1e18) / buyPrice;

        usdtToken.approve(address(mvaultToken), mvtBase);
        mvaultToken.addLiquidityAndMint(address(this), mvtBase);

        uint256 levelAmt     = (grossMvt * LEVEL_ALLOC)     / 100;
        uint256 communityAmt = (grossMvt * COMMUNITY_ALLOC) / 100;
        uint256 placementAmt = (grossMvt * PLACEMENT_ALLOC) / 100;
        uint256 adminAmt     = (grossMvt * ADMIN_ALLOC)     / 100;
        uint256 rankAmt      = (grossMvt * RANK_ALLOC)      / 100;
        uint256 dust         = grossMvt - levelAmt - communityAmt - placementAmt - adminAmt - rankAmt;

        communityPool += communityAmt;
        adminPool     += adminAmt + dust;

        // Update package tier (handles both reactivation and upgrade)
        users[user].packagePrice   = pkgPrice;
        users[user].incomeLimitCap = incomeCap;
        users[user].incomeLimit    = incomeCap;

        _updateAncestorVolumes(user, pkgPrice);
        _updateTeamStats(user, pkgPrice);
        _distributeLevelIncome(user, grossMvt, levelAmt);
        _distributeRankIncome(user, grossMvt, rankAmt);
        _distributePlacementIncome(user, grossMvt, placementAmt);

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
    // PLACEMENT INCOME  (binary tree, 30 levels, paid instantly at activation)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @dev Walks up the binary parent chain up to 30 levels from `from`.
     *      Each level earns placementRates[lvl-1] basis points of grossMvt.
     *      Qualification: ceil(lvl/3) * refsPerGroup direct referrals needed.
     *      Unqualified or missing upline shares → adminPool.
     */
    function _distributePlacementIncome(address from, uint256 grossMvt, uint256 totalAmt) internal {
        address cur = users[from].binaryParent;
        uint256 distributed = 0;
        for (uint8 lvl = 1; lvl <= 30 && cur != address(0); lvl++) {
            uint256 share = (grossMvt * placementRates[lvl - 1]) / 10000;
            if (share > 0) {
                uint256 required = ((uint256(lvl) + 2) / 3) * refsPerGroup;
                if (users[cur].isActive && users[cur].directCount >= required) {
                    users[cur].mvtBalance    += share;
                    users[cur].totalReceived += share;
                    distributed += share;
                    emit PlacementIncomePaid(cur, from, lvl, share);
                    _recordTx(cur, TX_PLACEMENT_INCOME, share, lvl, from);
                } else {
                    adminPool += share;
                    if (users[cur].isRegistered) {
                        _recordTx(cur, TX_PLACEMENT_MISSED, share, lvl, from);
                    }
                }
            }
            cur = users[cur].binaryParent;
        }
        if (totalAmt > distributed) adminPool += totalAmt - distributed;
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
    // STAKING — thin delegates to MvaultStaking module
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Stake USDT from the user's external wallet.
     *         Requires prior USDT approval for this contract.
     */
    function stake(uint256 usdtAmount, bool isLocked) external nonReentrant {
        if (!users[msg.sender].isRegistered) revert NotRegistered();
        if (!users[msg.sender].isActive) revert NotActive();
        bool ok = usdtToken.transferFrom(msg.sender, address(this), usdtAmount);
        if (!ok) revert TransferFailed();
        usdtToken.approve(address(stakingModule), usdtAmount);
        stakingModule.executeStake(msg.sender, usdtAmount, isLocked);
    }

    /**
     * @notice Stake using USDT held in this contract (from income, unstaking, or deposits).
     *         No external wallet approval needed — USDT is already in this contract.
     */
    function stakeFromBalance(uint256 usdtAmount, bool isLocked) external nonReentrant {
        if (!users[msg.sender].isRegistered) revert NotRegistered();
        if (!users[msg.sender].isActive) revert NotActive();
        if (users[msg.sender].usdtBalance < usdtAmount) revert InsufficientUsdtBalance();
        users[msg.sender].usdtBalance -= usdtAmount;
        usdtToken.approve(address(stakingModule), usdtAmount);
        stakingModule.executeStake(msg.sender, usdtAmount, isLocked);
    }

    /**
     * @notice Unstake a position (flexible or locked).
     */
    function unstake(uint256 stakeIndex) external nonReentrant {
        stakingModule.executeUnstake(msg.sender, stakeIndex);
    }

    /**
     * @notice Convert a flexible stake position to locked (starts 10-month lock).
     */
    function convertToLocked(uint256 stakeIndex) external {
        stakingModule.executeConvertToLocked(msg.sender, stakeIndex);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // VIEW FUNCTIONS
    // ─────────────────────────────────────────────────────────────────────────


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

    /**
     * @notice Get direct referrals of a user with pagination (newest first).
     */
    function getDirectReferralsPaginated(
        address _user,
        uint256 _offset,
        uint256 _limit
    ) external view returns (address[] memory referrals, uint256 total) {
        uint256 n = allUsers.length;
        // Count directs
        for (uint256 i = 0; i < n; i++) {
            if (users[allUsers[i]].sponsor == _user) total++;
        }
        if (total == 0 || _offset >= total) return (new address[](0), total);
        uint256 available = total - _offset;
        uint256 count = _limit < available ? _limit : available;
        referrals = new address[](count);
        uint256 found = 0;
        uint256 skip  = _offset;
        for (uint256 i = 0; i < n && found < count; i++) {
            if (users[allUsers[i]].sponsor == _user) {
                if (skip > 0) { skip--; continue; }
                referrals[found++] = allUsers[i];
            }
        }
    }

    /**
     * @notice MANAGER/OWNER: Batch-set user rank levels (0=unranked 1=M1…5=M5).
     *         Called by the off-chain distributor after evaluating qualifications.
     */
    function setUserRanks(address[] calldata addrs, uint8[] calldata ranks_) external onlyOwnerOrManager {
        require(addrs.length == ranks_.length);
        for (uint256 i; i < addrs.length; i++) {
            uint8 old = users[addrs[i]].rank;
            if (old != ranks_[i]) {
                users[addrs[i]].rank = ranks_[i];
                emit RankUpdated(addrs[i], old, ranks_[i]);
            }
        }
    }

    /**
     * @notice MANAGER/OWNER: Flush any legacy rankPool balance → adminPool.
     *         Rank income is now distributed on-chain at activation time via
     *         _distributeRankIncome(), so rankPool should always be 0.
     *         This function exists only as a safety drain for any accumulated
     *         balance from before the on-chain distribution upgrade.
     */
    function drainRankPool() external onlyOwnerOrManager {
        if (rankPool == 0) revert ExceedsPool();
        uint256 pool = rankPool;
        rankPool = 0;
        adminPool += pool;
        emit RankIncomeDistributed(pool, 0);
    }

    /**
     * @notice OWNER/MANAGER: Deposit real USDT directly into the contract's
     *         liquidity pool so board entries and withdrawals have backing.
     *         Caller must have approved this contract for `amount` USDT first.
     */
    function adminDepositUsdtPool(uint256 amount) external onlyOwnerOrManager {
        if (amount == 0) revert ZeroAmount();
        bool ok = usdtToken.transferFrom(msg.sender, address(this), amount);
        if (!ok) revert TransferFailed();
        emit AdminUsdtDeposited(msg.sender, amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // INTERNAL HELPERS
    // ─────────────────────────────────────────────────────────────────────────

    function _minOf(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}
