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
}

// ─────────────────────────────────────────────────────────────────────────────
// MvaultContract
//
// Flow on activation:
//   1. User pays $130 USDT
//   2. Contract mints MVT via MvaultToken  (token keeps 10%, we receive 90%)
//   3. Of the minted MVT:
//        40% → level income  (15 upline levels; unqualified share → adminPool)
//        30% → binaryPool    (distributed by admin per cycle)
//        30% → reservePool   (for future use)
//
// Level rates (% of total minted):
//   L1=20%, L2=5%, L3=4%, L4=3%, L5=2%, L6=1%, L7=1%, L8-L15=0.5% each
//   Sum = 20+5+4+3+2+1+1+8×0.5 = 40% ✓
//
// Qualification to receive level income:
//   L1        → 0 directs required
//   L2–L4     → 2 directs required
//   L5–L7     → 5 directs required
//   L8–L15    → 10 directs required
//
// Binary income (admin distributes once per cycle):
//   Step 1 – distributeBinaryIncome(batch):
//             calculates new pairs per user, distributes 70% of binaryPool,
//             sets powerLegPoints = newPairs × 10
//   Step 2 – distributePowerLeg(batch):
//             distributes 30% of binaryPool proportional to powerLegPoints,
//             then resets all powerLegPoints to 0
//
// Virtual MVT balance:
//   MVT tokens are held by this contract; each user's share is tracked virtually.
//   User calls sellMvt(amount) → contract calls MvaultToken.sell() → user receives USDT.
// ─────────────────────────────────────────────────────────────────────────────
contract MvaultContract is Ownable, ReentrancyGuard {

    // ── External contracts ────────────────────────────────────────────────────
    IERC20        public immutable usdtToken;
    IMvaultToken  public           mvaultToken;

    // ── Constants ─────────────────────────────────────────────────────────────
    uint256 public constant PACKAGE_PRICE  = 130 * 1e18; // $130 USDT (18 decimals)
    uint256 public constant LEVEL_ALLOC    = 40;          // % of minted → level income
    uint256 public constant BINARY_ALLOC   = 30;          // % of minted → binary pool
    // RESERVE_ALLOC = 30 (remainder)

    // ── User record ───────────────────────────────────────────────────────────
    struct User {
        bool    isRegistered;
        bool    isActive;
        // Referral / level tree
        address sponsor;
        uint256 directCount;
        // Binary tree
        address binaryParent;
        bool    placedLeft;       // true = placed on left side of binaryParent
        address leftChild;
        address rightChild;
        uint256 leftSubUsers;     // total users in left subtree
        uint256 rightSubUsers;    // total users in right subtree
        uint256 matchedPairs;     // cumulative pairs as of last distribution (watermark)
        // Balances
        uint256 mvtBalance;       // virtual MVT claimable
        uint256 totalReceived;    // lifetime MVT credited
        uint256 totalSold;        // lifetime MVT sold (burned)
        // Power leg (reset each cycle)
        uint256 powerLegPoints;
        // Meta
        uint256 joinedAt;
    }

    mapping(address => User) public users;
    address[] public allUsers;
    uint256   public totalUsers;

    // ── Pool balances (virtual MVT) ───────────────────────────────────────────
    uint256 public binaryPool;   // 30% per activation, cleared each cycle
    uint256 public reservePool;  // 30% per activation
    uint256 public adminPool;    // unqualified level income + leftover pool amounts

    // Binary distribution state (set during distributeBinaryIncome, consumed in distributePowerLeg)
    uint256 private _powerLeg30Reserve; // the 30% of binaryPool allocated to power legs this cycle
    bool    private _binaryDistributed; // true between the two admin steps

    // ── Events ────────────────────────────────────────────────────────────────
    event Registered(address indexed user, address indexed sponsor, address indexed binaryParent, bool placeLeft);
    event Activated(address indexed user, uint256 mvtMinted, uint256 levelAmt, uint256 binaryAmt, uint256 reserveAmt);
    event LevelIncomePaid(address indexed to, address indexed from, uint8 level, uint256 amount);
    event LevelIncomeSkipped(address indexed upline, uint8 level, uint256 amount);
    event BinaryIncomeDistributed(uint256 totalPool, uint256 binary70, uint256 powerLeg30, uint256 totalPairs);
    event PowerLegDistributed(uint256 totalPowerLeg30, uint256 totalPowerLegs);
    event MvtSold(address indexed user, uint256 mvtAmount, uint256 usdtOut);
    event MvaultTokenUpdated(address newToken);
    event AdminWithdraw(address indexed to, uint256 mvtAmount);
    event ReserveWithdraw(address indexed to, uint256 mvtAmount);

    // ── Errors ────────────────────────────────────────────────────────────────
    error AlreadyRegistered();
    error NotRegistered();
    error AlreadyActive();
    error InvalidSponsor();
    error PositionTaken();
    error InsufficientVirtualBalance();
    error ZeroAddress();
    error ZeroAmount();
    error TransferFailed();
    error BinaryNotDistributed();
    error BinaryAlreadyDistributed();

    // ─────────────────────────────────────────────────────────────────────────
    constructor(address _usdt, address _mvaultToken) Ownable(msg.sender) {
        if (_usdt == address(0) || _mvaultToken == address(0)) revert ZeroAddress();
        usdtToken    = IERC20(_usdt);
        mvaultToken  = IMvaultToken(_mvaultToken);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ADMIN SETTERS
    // ─────────────────────────────────────────────────────────────────────────

    function setMvaultToken(address _mvaultToken) external onlyOwner {
        if (_mvaultToken == address(0)) revert ZeroAddress();
        mvaultToken = IMvaultToken(_mvaultToken);
        emit MvaultTokenUpdated(_mvaultToken);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // REGISTRATION
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Register a new user.
     * @param sponsor       Sponsor (referrer) address. Pass address(0) for first user.
     * @param binaryParent  Node to place under in binary tree. Pass address(0) to default to sponsor.
     * @param placeLeft     true = place on sponsor/parent's left side, false = right.
     */
    function register(
        address sponsor,
        address binaryParent,
        bool    placeLeft
    ) external {
        if (users[msg.sender].isRegistered) revert AlreadyRegistered();

        if (totalUsers == 0) {
            // ── First / root user ────────────────────────────────────────────
            _createUser(msg.sender, address(0), address(0), false);
        } else {
            // ── Normal registration ──────────────────────────────────────────
            if (!users[sponsor].isRegistered) revert InvalidSponsor();

            // Default binary parent to sponsor if not specified or invalid
            address parent = (binaryParent != address(0) && users[binaryParent].isRegistered)
                ? binaryParent
                : sponsor;

            if (placeLeft  && users[parent].leftChild  != address(0)) revert PositionTaken();
            if (!placeLeft && users[parent].rightChild != address(0)) revert PositionTaken();

            _createUser(msg.sender, sponsor, parent, placeLeft);

            // Assign child slot
            if (placeLeft) {
                users[parent].leftChild = msg.sender;
            } else {
                users[parent].rightChild = msg.sender;
            }

            // Increment sponsor's direct count
            users[sponsor].directCount++;

            // Walk up the binary tree and increment subtree user counts
            _updateAncestorCounts(msg.sender);
        }

        emit Registered(msg.sender, sponsor, binaryParent, placeLeft);
    }

    function _createUser(address u, address sponsor, address parent, bool placeLeft) internal {
        users[u].isRegistered  = true;
        users[u].sponsor       = sponsor;
        users[u].binaryParent  = parent;
        users[u].placedLeft    = placeLeft;
        users[u].joinedAt      = block.timestamp;
        allUsers.push(u);
        totalUsers++;
    }

    /**
     * @dev Walk up the binary tree from `newUser` incrementing subtree counters on each ancestor.
     */
    function _updateAncestorCounts(address newUser) internal {
        address cur    = users[newUser].binaryParent;
        bool    isLeft = users[newUser].placedLeft;

        while (cur != address(0)) {
            if (isLeft) {
                users[cur].leftSubUsers++;
            } else {
                users[cur].rightSubUsers++;
            }
            isLeft = users[cur].placedLeft;
            cur    = users[cur].binaryParent;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ACTIVATION
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Pay $130 USDT and activate. Mints MVT and distributes income.
     *         Caller must have pre-approved this contract for PACKAGE_PRICE USDT.
     */
    function activate() external nonReentrant {
        User storage u = users[msg.sender];
        if (!u.isRegistered) revert NotRegistered();
        if (u.isActive)      revert AlreadyActive();

        // ── Pull USDT ────────────────────────────────────────────────────────
        bool ok = usdtToken.transferFrom(msg.sender, address(this), PACKAGE_PRICE);
        if (!ok) revert TransferFailed();

        // ── Approve MvaultToken to spend USDT and mint ───────────────────────
        usdtToken.approve(address(mvaultToken), PACKAGE_PRICE);

        uint256 before = mvaultToken.balanceOf(address(this));
        mvaultToken.addLiquidityAndMint(address(this), PACKAGE_PRICE);
        uint256 minted = mvaultToken.balanceOf(address(this)) - before;

        // ── Split minted MVT ─────────────────────────────────────────────────
        uint256 levelAmt  = (minted * LEVEL_ALLOC)  / 100;   // 40%
        uint256 binaryAmt = (minted * BINARY_ALLOC) / 100;   // 30%
        uint256 reserveAmt = minted - levelAmt - binaryAmt;  // 30%

        binaryPool  += binaryAmt;
        reservePool += reserveAmt;

        u.isActive = true;

        // ── Distribute level income ──────────────────────────────────────────
        _distributeLevelIncome(msg.sender, minted, levelAmt);

        emit Activated(msg.sender, minted, levelAmt, binaryAmt, reserveAmt);
    }

    /**
     * @dev Walk up 15 sponsor levels and credit level income.
     *      Each level's share = minted × rate.
     *      Total of all rates = 40% = levelAmt, so no rounding pool needed.
     *      Unqualified shares go to adminPool.
     */
    function _distributeLevelIncome(
        address from,
        uint256 minted,
        uint256 levelAmt
    ) internal {
        address cur = users[from].sponsor;
        uint256 distributed = 0;

        for (uint8 lvl = 1; lvl <= 15 && cur != address(0); lvl++) {
            uint256 share = _levelShare(minted, lvl);
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

        // Any dust left (rounding) also goes to admin
        if (levelAmt > distributed) {
            adminPool += levelAmt - distributed;
        }
    }

    /**
     * @dev Returns the MVT share for a given level (as % of total minted).
     *      L1=20%, L2=5%, L3=4%, L4=3%, L5=2%, L6=1%, L7=1%, L8-L15=0.5%
     */
    function _levelShare(uint256 minted, uint8 lvl) internal pure returns (uint256) {
        if (lvl == 1) return (minted * 20) / 100;
        if (lvl == 2) return (minted * 5)  / 100;
        if (lvl == 3) return (minted * 4)  / 100;
        if (lvl == 4) return (minted * 3)  / 100;
        if (lvl == 5) return (minted * 2)  / 100;
        if (lvl == 6) return (minted * 1)  / 100;
        if (lvl == 7) return (minted * 1)  / 100;
        if (lvl >= 8 && lvl <= 15) return (minted * 5) / 1000; // 0.5%
        return 0;
    }

    /**
     * @dev Minimum direct referrals required to receive income at a given level.
     */
    function _directReq(uint8 lvl) internal pure returns (uint256) {
        if (lvl <= 1) return 0;
        if (lvl <= 4) return 2;
        if (lvl <= 7) return 5;
        return 10; // L8-L15
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BINARY INCOME DISTRIBUTION  (admin — Step 1 of 2)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice STEP 1: Distribute 70% of binary pool to users with new pair matches.
     *         Sets powerLegPoints = newPairs × 10 for each matching user.
     *         Call distributePowerLeg() after this to complete the cycle.
     *
     * @param offset  Start index in allUsers array (for batch processing).
     * @param limit   Max users to process in this call. Pass allUsers.length for all.
     *
     * NOTE: If your user base is large, call this in multiple batches with increasing
     *       offsets until all users are processed, then call finaliseBinaryDistribution()
     *       to close the cycle before calling distributePowerLeg().
     */
    function distributeBinaryIncome(
        uint256 offset,
        uint256 limit
    ) external onlyOwner nonReentrant {
        if (_binaryDistributed) revert BinaryAlreadyDistributed();
        require(binaryPool > 0, "Empty binary pool");

        uint256 pool = binaryPool;
        binaryPool = 0;

        uint256 binary70    = (pool * 70) / 100;
        uint256 powerLeg30  = pool - binary70;

        _powerLeg30Reserve = powerLeg30;

        // ── Count total new pairs across the batch ────────────────────────────
        uint256 end = offset + limit;
        if (end > allUsers.length) end = allUsers.length;

        uint256 totalNewPairs = 0;

        for (uint256 i = offset; i < end; i++) {
            address u = allUsers[i];
            if (!users[u].isActive) continue;
            uint256 pairs = _minOf(users[u].leftSubUsers, users[u].rightSubUsers);
            uint256 newPairs = pairs > users[u].matchedPairs
                ? pairs - users[u].matchedPairs
                : 0;
            totalNewPairs += newPairs;
        }

        // ── Distribute 70% proportionally to new pairs ────────────────────────
        if (totalNewPairs == 0) {
            // No pairs this cycle — move funds to admin
            adminPool += binary70;
            adminPool += powerLeg30;
            _powerLeg30Reserve = 0;
            emit BinaryIncomeDistributed(pool, 0, 0, 0);
            return;
        }

        for (uint256 i = offset; i < end; i++) {
            address u = allUsers[i];
            if (!users[u].isActive) continue;

            uint256 pairs = _minOf(users[u].leftSubUsers, users[u].rightSubUsers);
            uint256 newPairs = pairs > users[u].matchedPairs
                ? pairs - users[u].matchedPairs
                : 0;

            if (newPairs == 0) continue;

            uint256 share = (binary70 * newPairs) / totalNewPairs;
            users[u].mvtBalance    += share;
            users[u].totalReceived += share;

            // Assign power leg points for next step
            users[u].powerLegPoints += newPairs * 10;

            // Advance watermark
            users[u].matchedPairs = pairs;
        }

        _binaryDistributed = true;

        emit BinaryIncomeDistributed(pool, binary70, powerLeg30, totalNewPairs);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // POWER LEG DISTRIBUTION  (admin — Step 2 of 2)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice STEP 2: Distribute the 30% power leg reserve proportionally to
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

        // ── Count total power legs in this batch ──────────────────────────────
        uint256 totalPowerLegs = 0;
        for (uint256 i = offset; i < end; i++) {
            totalPowerLegs += users[allUsers[i]].powerLegPoints;
        }

        // ── Distribute powerLeg30 proportionally ──────────────────────────────
        uint256 reserve = _powerLeg30Reserve;
        if (totalPowerLegs > 0 && reserve > 0) {
            for (uint256 i = offset; i < end; i++) {
                address u = allUsers[i];
                if (users[u].powerLegPoints == 0) continue;
                uint256 share = (reserve * users[u].powerLegPoints) / totalPowerLegs;
                users[u].mvtBalance    += share;
                users[u].totalReceived += share;
            }
        } else {
            adminPool += reserve;
        }

        // ── Reset power leg points ────────────────────────────────────────────
        for (uint256 i = offset; i < end; i++) {
            users[allUsers[i]].powerLegPoints = 0;
        }

        // ── Close cycle ───────────────────────────────────────────────────────
        _powerLeg30Reserve  = 0;
        _binaryDistributed  = false;

        emit PowerLegDistributed(reserve, totalPowerLegs);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SELL MVT  (user — convert virtual balance to USDT)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Sell `amount` of your virtual MVT balance for USDT.
     *         The contract burns the MVT via MvaultToken and forwards USDT to you.
     */
    function sellMvt(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        User storage u = users[msg.sender];
        if (!u.isActive) revert NotRegistered();
        if (u.mvtBalance < amount) revert InsufficientVirtualBalance();

        u.mvtBalance -= amount;
        u.totalSold  += amount;

        // Record USDT balance before sell
        uint256 usdtBefore = usdtToken.balanceOf(address(this));

        // Burn MVT and receive USDT from MvaultToken
        mvaultToken.sell(amount);

        uint256 usdtReceived = usdtToken.balanceOf(address(this)) - usdtBefore;

        // Forward USDT to user
        bool ok = usdtToken.transfer(msg.sender, usdtReceived);
        if (!ok) revert TransferFailed();

        emit MvtSold(msg.sender, amount, usdtReceived);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ADMIN FUNCTIONS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Withdraw from adminPool as virtual MVT (credited to admin's wallet balance).
     *         The admin can then call sellMvt() to convert, or use reserve for ops.
     */
    function withdrawAdminPool(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        require(adminPool >= amount, "Exceeds admin pool");
        adminPool -= amount;
        // Credit as virtual balance so admin can sell via sellMvt()
        users[to].mvtBalance    += amount;
        users[to].totalReceived += amount;
        emit AdminWithdraw(to, amount);
    }

    /**
     * @notice Withdraw from reservePool (virtual MVT credited to a given address).
     */
    function withdrawReservePool(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        require(reservePool >= amount, "Exceeds reserve pool");
        reservePool -= amount;
        users[to].mvtBalance    += amount;
        users[to].totalReceived += amount;
        emit ReserveWithdraw(to, amount);
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
        uint256 powerLegPoints,
        uint256 matchedPairs,
        uint256 joinedAt
    ) {
        User storage d = users[u];
        return (
            d.isRegistered, d.isActive, d.sponsor, d.directCount,
            d.binaryParent, d.placedLeft, d.leftChild, d.rightChild,
            d.leftSubUsers, d.rightSubUsers,
            d.mvtBalance, d.totalReceived, d.totalSold,
            d.powerLegPoints, d.matchedPairs, d.joinedAt
        );
    }

    function getCurrentBinaryPairs(address u) external view returns (uint256 currentPairs, uint256 newPairs) {
        currentPairs = _minOf(users[u].leftSubUsers, users[u].rightSubUsers);
        newPairs = currentPairs > users[u].matchedPairs ? currentPairs - users[u].matchedPairs : 0;
    }

    function getMvtPrice() external view returns (uint256 buyPrice, uint256 sellPrice) {
        buyPrice  = mvaultToken.getBuyPrice();
        sellPrice = mvaultToken.getSellPrice();
    }

    function getAllUsersCount() external view returns (uint256) {
        return allUsers.length;
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
    // INTERNAL HELPERS
    // ─────────────────────────────────────────────────────────────────────────

    function _minOf(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}
