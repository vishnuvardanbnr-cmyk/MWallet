// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// ─────────────────────────────────────────────────────────────────────────────
// MvaultBoardMatrix
//
// Board Matrix System (10 levels):
//   Users fund entry using their BTC pool balance (accumulated from MVT sells).
//   Each board needs 12 members to complete.
//   Pool = boardPrice × 9 members.
//
//   Boards 1–9 on completion:
//     40% → owner reward      (USDT sent directly to owner)
//     40% → next board entry  (auto-enters owner into next level)
//     20% → liquidity address
//
//   Board 10 (final) on completion:
//     87.5% → owner reward
//      6.25% → system address
//      6.25% → liquidity address
//
// Entry:
//   MvaultContract calls enterBoard(user, 1) after deducting from btcPoolBalance.
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

    uint256 public constant TOTAL_BOARDS            = 10;
    uint256 public constant BOARD_MEMBERS_REQUIRED  = 12;
    uint256 public constant BOARD_POOL_MEMBERS      = 9;   // used for pool calculation
    uint256 public constant BOARD_REWARD_RATE_BP    = 4000; // 40%
    uint256 public constant BOARD_NEXT_POOL_RATE_BP = 4000; // 40%
    uint256 public constant BOARD_LIQUIDITY_RATE_BP = 2000; // 20%
    uint256 public constant BOARD_10_REWARD_RATE_BP    = 8750; // 87.50%
    uint256 public constant BOARD_10_SYSTEM_RATE_BP    = 625;  //  6.25%
    uint256 public constant BOARD_10_LIQUIDITY_RATE_BP = 625;  //  6.25%
    uint256 public constant BASIS_POINTS            = 10000;

    mapping(uint256 => BoardMatrix[]) internal _boardMatrices;
    mapping(uint256 => uint256) public boardCurrentIndex;

    // Per-user board tracking
    mapping(address => uint256) public boardEntryCount;
    mapping(address => uint256) public totalBoardRewardsEarned;

    uint256[11] public boardPrices; // index 1–10

    IERC20  public immutable usdtToken;
    address public mvaultContract;
    address public liquidityAddress;
    address public systemAddress;

    event BoardEntered(address indexed user, uint256 indexed boardLevel, uint256 matrixIndex);
    event BoardCompleted(address indexed owner, uint256 indexed boardLevel, uint256 reward, uint256 liquidity);
    event BoardHandlerSet(address indexed mvaultContract);
    event LiquidityAddressSet(address indexed addr);
    event SystemAddressSet(address indexed addr);

    modifier onlyMvault() {
        require(msg.sender == mvaultContract || msg.sender == owner(), "NA");
        _;
    }

    // ─────────────────────────────────────────────────────────────────────────
    constructor(address _usdt) Ownable(msg.sender) {
        require(_usdt != address(0), "ZA");
        usdtToken = IERC20(_usdt);

        // Board prices derived from 40/40/20 split: price[N+1] = price[N] × 9 × 0.4 = price[N] × 3.6
        // Using 18-decimal USDT (1e18 = $1)
        boardPrices[1]  = 50       * 1e18;
        boardPrices[2]  = 180      * 1e18;
        boardPrices[3]  = 648      * 1e18;
        boardPrices[4]  = 2333     * 1e18;
        boardPrices[5]  = 8398     * 1e18;
        boardPrices[6]  = 30233    * 1e18;
        boardPrices[7]  = 108839   * 1e18;
        boardPrices[8]  = 391821   * 1e18;
        boardPrices[9]  = 1410555  * 1e18;
        boardPrices[10] = 5077998  * 1e18;
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

    function setSystemAddress(address _addr) external onlyOwner {
        require(_addr != address(0), "ZA");
        systemAddress = _addr;
        emit SystemAddressSet(_addr);
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
            uint256 reward    = (totalPool * BOARD_REWARD_RATE_BP)    / BASIS_POINTS; // 40%
            // 40% (BOARD_NEXT_POOL_RATE_BP) stays in this contract to fund the owner's next board entry
            uint256 liquidity = (totalPool * BOARD_LIQUIDITY_RATE_BP) / BASIS_POINTS; // 20%

            // ── Credit reward ─────────────────────────────────────────────────
            _creditReward(_owner, reward, _boardLevel);

            // ── Send liquidity ────────────────────────────────────────────────
            if (liquidityAddress != address(0) && liquidity > 0) {
                usdtToken.safeTransfer(liquidityAddress, liquidity);
            }

            emit BoardCompleted(_owner, _boardLevel, reward, liquidity);

            // ── Auto-enter owner into next board (nextEntry stays in contract) ──
            // nextEntry amount is already held in this contract from previous collections.
            // We simply register the owner — no additional USDT transfer needed.
            _enterBoard(_owner, _boardLevel + 1);

        } else {
            // ── Final board (Level 10) ────────────────────────────────────────
            uint256 reward    = (totalPool * BOARD_10_REWARD_RATE_BP)    / BASIS_POINTS; // 87.5%
            uint256 systemFee = (totalPool * BOARD_10_SYSTEM_RATE_BP)    / BASIS_POINTS; //  6.25%
            uint256 liquidity = (totalPool * BOARD_10_LIQUIDITY_RATE_BP) / BASIS_POINTS; //  6.25%

            _creditReward(_owner, reward, _boardLevel);

            if (systemAddress != address(0) && systemFee > 0) {
                usdtToken.safeTransfer(systemAddress, systemFee);
            }
            if (liquidityAddress != address(0) && liquidity > 0) {
                usdtToken.safeTransfer(liquidityAddress, liquidity);
            }

            emit BoardCompleted(_owner, _boardLevel, reward, liquidity);
        }
    }

    /**
     * @dev Credit board reward. Tries callback to MvaultContract first so income
     *      is tracked in the main contract. Falls back to direct USDT transfer.
     */
    function _creditReward(address _owner, uint256 _reward, uint256 _boardLevel) internal {
        if (_reward == 0) return;

        totalBoardRewardsEarned[_owner] += _reward;

        if (mvaultContract != address(0)) {
            // Approve MvaultContract to pull the reward USDT (for the callback)
            usdtToken.safeTransfer(mvaultContract, _reward);
            // Notify MvaultContract to credit the user's usdtBalance
            IMvaultBoardCallback(mvaultContract).creditBoardReward(_owner, _reward, _boardLevel);
        } else {
            // Fallback: send directly to owner's wallet
            usdtToken.safeTransfer(_owner, _reward);
        }
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
