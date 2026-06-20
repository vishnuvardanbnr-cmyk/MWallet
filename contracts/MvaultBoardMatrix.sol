// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// ─────────────────────────────────────────────────────────────────────────────
// MvaultBoardMatrix
//
// Board Matrix System (6 pools):
//   $20 is carved out of every activation/reactivation and placed in Pool 1.
//   Each pool needs 9 members to complete.
//   Pool reward = boardPrice × 9 members.
//
//   Pools 1–5 on completion (40/40/20 split):
//     40% → owner reward      (USDT credited back to MvaultContract for owner)
//     40% → next pool entry   (auto-enters owner into next level; USDT stays in contract)
//     20% → liquidity address
//
//   Pool 6 (final) on completion (~76.52/23.48 split):
//     76.52% → owner reward
//     23.48% → liquidity address
//
// Pool prices (derived from $20 × 9 × 0.4 = $72 chain):
//   Pool 1: $20      Pool 2: $72      Pool 3: $259.20
//   Pool 4: $933.12  Pool 5: $3,359.23  Pool 6: $12,093.24
//
// Entry:
//   MvaultContract automatically calls enterBoard(user, 1) on every activation.
//   USDT is transferred from MvaultContract to this contract before calling enterBoard.
// ─────────────────────────────────────────────────────────────────────────────

interface IMvaultBoardCallback {
    function creditBoardReward(address user, uint256 usdtAmount, uint256 boardLevel) external;
}

contract MvaultBoardMatrix is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct BoardMatrix {
        address owner;
        uint256 filledCount;
        bool    completed;
    }

    uint256 public constant TOTAL_BOARDS            = 6;
    uint256 public constant BOARD_MEMBERS_REQUIRED  = 9;
    uint256 public constant BOARD_POOL_MEMBERS      = 9;    // 9 members × price = total pool
    uint256 public constant BOARD_REWARD_RATE_BP    = 4000; // 40% → owner reward (pools 1-5)
    uint256 public constant BOARD_NEXT_POOL_RATE_BP = 4000; // 40% → next pool entry (pools 1-5)
    uint256 public constant BOARD_LIQUIDITY_RATE_BP = 2000; // 20% → liquidity (pools 1-5)
    // Pool 6 (final): no next pool — split between reward and liquidity
    uint256 public constant BOARD_FINAL_REWARD_RATE_BP    = 7652; // 76.52%
    uint256 public constant BOARD_FINAL_LIQUIDITY_RATE_BP = 2348; //  23.48%
    uint256 public constant BASIS_POINTS            = 10000;

    mapping(uint256 => BoardMatrix[]) internal _boardMatrices;
    mapping(uint256 => uint256) public boardCurrentIndex;

    // Per-user board tracking
    mapping(address => uint256) public boardEntryCount;
    mapping(address => uint256) public totalBoardRewardsEarned;

    // Pending rewards: USDT already transferred to MvaultContract but balance not yet credited
    // (occurs when creditBoardReward callback is blocked by MvaultContract's reentrancy guard)
    mapping(address => uint256) public pendingBoardRewards;
    mapping(address => uint256) public pendingBoardLevel;

    uint256[7] public boardPrices; // index 1–6

    IERC20  public immutable usdtToken;
    address public mvaultContract;
    address public liquidityAddress;

    event BoardEntered(address indexed user, uint256 indexed boardLevel, uint256 matrixIndex);
    event BoardCompleted(address indexed owner, uint256 indexed boardLevel, uint256 reward, uint256 liquidity);
    event BoardHandlerSet(address indexed mvaultContract);
    event LiquidityAddressSet(address indexed addr);
    event PendingBoardReward(address indexed user, uint256 amount, uint256 boardLevel);
    event PendingBoardRewardSettled(address indexed user, uint256 amount);

    modifier onlyMvault() {
        require(msg.sender == mvaultContract || msg.sender == owner(), "NA");
        _;
    }

    // ─────────────────────────────────────────────────────────────────────────
    constructor(address _usdt) Ownable(msg.sender) {
        require(_usdt != address(0), "ZA");
        usdtToken = IERC20(_usdt);

        // Board prices: Pool 1 entry = $20 (auto-funded from activation)
        // price[N+1] = price[N] × 9 × 0.40  (the 40% that flows forward)
        // Using 18-decimal USDT (1e18 = $1)
        boardPrices[1] = 20 * 1e18;              //  $20.00
        boardPrices[2] = 72 * 1e18;              //  $72.00
        boardPrices[3] = 2592 * 1e17;            // $259.20
        boardPrices[4] = 93312 * 1e16;           // $933.12
        boardPrices[5] = 3359232 * 1e15;         // $3,359.232
        boardPrices[6] = 120932352 * 1e14;       // $12,093.2352
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ADMIN SETTERS
    // ─────────────────────────────────────────────────────────────────────────

    function setMvaultContract(address _mvault) external onlyOwner {
        require(_mvault != address(0), "ZA");
        mvaultContract = _mvault;
        emit BoardHandlerSet(_mvault);
    }

    function setLiquidityAddress(address _addr) external onlyOwner {
        require(_addr != address(0), "ZA");
        liquidityAddress = _addr;
        emit LiquidityAddressSet(_addr);
    }

    function setBoardPrice(uint256 _level, uint256 _price) external onlyOwner {
        require(_level >= 1 && _level <= TOTAL_BOARDS, "BL");
        require(_price > 0, "P0");
        boardPrices[_level] = _price;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ENTRY POINT (called by MvaultContract)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Enter a user into the board at the given level.
     *         USDT equal to boardPrices[boardLevel] must already be in this contract.
     *         Only callable by MvaultContract or owner.
     */
    function enterBoard(address _user, uint256 _boardLevel) external onlyMvault {
        require(_boardLevel >= 1 && _boardLevel <= TOTAL_BOARDS, "BL");
        _enterBoard(_user, _boardLevel);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // INTERNAL LOGIC
    // ─────────────────────────────────────────────────────────────────────────

    function _enterBoard(address _user, uint256 _boardLevel) internal {
        // Create new board matrix slot for this user as owner
        _boardMatrices[_boardLevel].push(BoardMatrix({
            owner:       _user,
            filledCount: 0,
            completed:   false
        }));
        uint256 newIdx = _boardMatrices[_boardLevel].length - 1;
        boardEntryCount[_user]++;

        emit BoardEntered(_user, _boardLevel, newIdx);

        // Fill a slot in the current active board (if one exists ahead of this user's new slot)
        uint256 currentIdx = boardCurrentIndex[_boardLevel];
        if (currentIdx < newIdx) {
            BoardMatrix storage activeMatrix = _boardMatrices[_boardLevel][currentIdx];
            activeMatrix.filledCount++;

            if (activeMatrix.filledCount >= BOARD_MEMBERS_REQUIRED) {
                activeMatrix.completed = true;
                boardCurrentIndex[_boardLevel] = currentIdx + 1;
                _completeBoardMatrix(activeMatrix.owner, _boardLevel);
            }
        }
    }

    function _completeBoardMatrix(address _owner, uint256 _boardLevel) internal {
        uint256 totalPool = boardPrices[_boardLevel] * BOARD_POOL_MEMBERS;

        if (_boardLevel < TOTAL_BOARDS) {
            // ── Pools 1–5: 40% reward / 40% next pool / 20% liquidity ────────
            uint256 reward    = (totalPool * BOARD_REWARD_RATE_BP)    / BASIS_POINTS; // 40%
            // 40% (BOARD_NEXT_POOL_RATE_BP) stays in this contract to fund the owner's next pool entry
            uint256 liquidity = (totalPool * BOARD_LIQUIDITY_RATE_BP) / BASIS_POINTS; // 20%

            _creditReward(_owner, reward, _boardLevel);

            if (liquidityAddress != address(0) && liquidity > 0) {
                usdtToken.safeTransfer(liquidityAddress, liquidity);
            }

            emit BoardCompleted(_owner, _boardLevel, reward, liquidity);

            // ── Auto-enter owner into next pool (40% USDT already in contract) ──
            _enterBoard(_owner, _boardLevel + 1);

        } else {
            // ── Final pool (Level 6): 76.52% reward / 23.48% liquidity ───────
            uint256 reward    = (totalPool * BOARD_FINAL_REWARD_RATE_BP)    / BASIS_POINTS; // 76.52%
            uint256 liquidity = (totalPool * BOARD_FINAL_LIQUIDITY_RATE_BP) / BASIS_POINTS; // 23.48%

            _creditReward(_owner, reward, _boardLevel);

            if (liquidityAddress != address(0) && liquidity > 0) {
                usdtToken.safeTransfer(liquidityAddress, liquidity);
            }

            emit BoardCompleted(_owner, _boardLevel, reward, liquidity);
        }
    }

    /**
     * @dev Credit board reward. Transfers USDT to MvaultContract and calls the
     *      creditBoardReward callback to update the user's withdrawable balance.
     *
     *      If the callback reverts (e.g. MvaultContract's reentrancy guard is locked
     *      because we're inside enterBoardPool), the USDT is already safely in
     *      MvaultContract and the pending amount is stored here.
     *      Call settlePendingReward(user) once the lock is released.
     */
    function _creditReward(address _owner, uint256 _reward, uint256 _boardLevel) internal {
        if (_reward == 0) return;

        totalBoardRewardsEarned[_owner] += _reward;

        if (mvaultContract != address(0)) {
            // Transfer USDT to MvaultContract first — this is NOT rolled back if the
            // subsequent external call is caught by try/catch.
            usdtToken.safeTransfer(mvaultContract, _reward);

            // Try to credit the balance via callback. If MvaultContract's nonReentrant
            // guard is active (e.g. called from within enterBoardPool), this reverts.
            // We catch that and record the amount as pending — the USDT is already in
            // MvaultContract and will be credited when settlePendingReward is called.
            try IMvaultBoardCallback(mvaultContract).creditBoardReward(_owner, _reward, _boardLevel) {
                // success
            } catch {
                pendingBoardRewards[_owner] += _reward;
                pendingBoardLevel[_owner]    = _boardLevel;
                emit PendingBoardReward(_owner, _reward, _boardLevel);
            }
        } else {
            // Fallback: send directly to owner's wallet
            usdtToken.safeTransfer(_owner, _reward);
        }
    }

    /**
     * @notice Settle any pending board reward for `user`.
     *         The USDT was already forwarded to MvaultContract during board completion.
     *         This simply triggers the balance-credit callback once the reentrancy lock is free.
     *         Callable by anyone (permissionless — USDT is already secured in MvaultContract).
     */
    function settlePendingReward(address user) external nonReentrant {
        uint256 pending = pendingBoardRewards[user];
        require(pending > 0, "NP");
        uint256 level = pendingBoardLevel[user];
        pendingBoardRewards[user] = 0;
        pendingBoardLevel[user]   = 0;
        // USDT is already in MvaultContract — just trigger the balance credit
        IMvaultBoardCallback(mvaultContract).creditBoardReward(user, pending, level);
        emit PendingBoardRewardSettled(user, pending);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // VIEW FUNCTIONS
    // ─────────────────────────────────────────────────────────────────────────

    function getBoardPrice(uint256 _level) external view returns (uint256) {
        require(_level >= 1 && _level <= TOTAL_BOARDS, "BL");
        return boardPrices[_level];
    }

    function getBoardQueueLength(uint256 _level) external view returns (uint256) {
        return _boardMatrices[_level].length;
    }

    function getBoardMatrixInfo(uint256 _level, uint256 _index) external view returns (
        address owner,
        uint256 filledCount,
        bool    completed
    ) {
        require(_index < _boardMatrices[_level].length, "OB");
        BoardMatrix storage m = _boardMatrices[_level][_index];
        return (m.owner, m.filledCount, m.completed);
    }

    function getBoardCurrentIndex(uint256 _level) external view returns (uint256) {
        return boardCurrentIndex[_level];
    }

    function getUserBoardStats(address _user) external view returns (
        uint256 totalEntries,
        uint256 totalRewards
    ) {
        return (boardEntryCount[_user], totalBoardRewardsEarned[_user]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ADMIN RECOVERY
    // ─────────────────────────────────────────────────────────────────────────

    function recoverToken(address _token, address _to, uint256 _amount) external onlyOwner {
        require(_to != address(0), "ZA");
        IERC20(_token).safeTransfer(_to, _amount);
    }
}
