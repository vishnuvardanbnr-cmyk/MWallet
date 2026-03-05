// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IMLMCallback {
    function logBoardReward(address _user, uint256 _reward, uint256 _boardLevel) external;
    function logBoardEntry(address _user, uint256 _price, uint256 _boardLevel) external;
}

interface IPancakeRouter {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    function getAmountsOut(
        uint256 amountIn,
        address[] calldata path
    ) external view returns (uint256[] memory amounts);
}

contract BoardMatrixHandler is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct BoardMatrix {
        address owner;
        uint256 filledCount;
        bool    completed;
    }

    uint256 public constant TOTAL_BOARDS = 10;
    uint256 public constant BOARD_MEMBERS_REQUIRED = 12;
    uint256 public constant BOARD_LEVEL2_MEMBERS = 9;
    uint256 public constant BOARD_REWARD_RATE_BP = 4000;
    uint256 public constant BOARD_NEXT_POOL_RATE_BP = 4000;
    uint256 public constant BOARD_LIQUIDITY_RATE_BP = 2000;
    uint256 public constant BOARD_10_REWARD_RATE_BP = 8750;
    uint256 public constant BOARD_10_SYSTEM_RATE_BP = 625;
    uint256 public constant BOARD_10_LIQUIDITY_RATE_BP = 625;
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant DEFAULT_SLIPPAGE_BP = 200;

    mapping(uint256 => BoardMatrix[]) internal _boardMatrices;
    mapping(uint256 => uint256) public boardCurrentIndex;
    mapping(address => uint256) public virtualRewardBalance;
    mapping(address => uint256) public totalVirtualRewards;
    mapping(address => uint256) public totalSwappedToBTC;
    uint256[11] public boardPrices;

    // ── USDT Deposit Vault ────────────────────────────────────────────────────
    mapping(address => uint256)   public depositBalance;
    mapping(address => uint256[]) public depositAmounts;
    mapping(address => uint256[]) public depositTimestamps;

    IERC20 public paymentToken;
    IERC20 public btcRewardToken;
    IPancakeRouter public pancakeRouter;
    address public coinLiquidityAddress;
    address public systemAddress;
    address public mlmContract;
    address public btcbToken;

    event BoardEntered(address indexed user, uint256 indexed boardLevel, uint256 matrixIndex);
    event BoardCompleted(address indexed owner, uint256 indexed boardLevel, uint256 reward, uint256 liquidity);
    event VirtualRewardCredited(address indexed user, uint256 amount, uint256 boardLevel);
    event SwappedToBTC(address indexed user, uint256 usdtAmount, uint256 btcbAmount);
    event Deposited(address indexed user, uint256 amount);
    event AdminWithdrawn(address indexed to, uint256 amount);

    modifier onlyMLM() {
        require(msg.sender == mlmContract || msg.sender == owner(), "NA");
        _;
    }

    constructor(address _paymentToken, uint8 _tokenDecimals) Ownable(msg.sender) {
        paymentToken = IERC20(_paymentToken);

        uint256 unit = 10 ** uint256(_tokenDecimals);
        boardPrices[1]  = 50        * unit;
        boardPrices[2]  = 180       * unit;
        boardPrices[3]  = 648       * unit;
        boardPrices[4]  = 2333      * unit;
        boardPrices[5]  = 8398      * unit;
        boardPrices[6]  = 30233     * unit;
        boardPrices[7]  = 108839    * unit;
        boardPrices[8]  = 391821    * unit;
        boardPrices[9]  = 1410555   * unit;
        boardPrices[10] = 5077998   * unit;
    }

    function setMLMContract(address _mlm) external onlyOwner {
        require(_mlm != address(0), "IV");
        mlmContract = _mlm;
    }

    function setCoinLiquidityAddress(address _addr) external onlyOwner {
        coinLiquidityAddress = _addr;
    }

    function setSystemAddress(address _addr) external onlyOwner {
        systemAddress = _addr;
    }

    function setBtcRewardToken(address _token) external onlyOwner {
        btcRewardToken = IERC20(_token);
    }

    function setPancakeRouter(address _router) external onlyOwner {
        require(_router != address(0), "IV");
        pancakeRouter = IPancakeRouter(_router);
    }

    function setBtcbToken(address _token) external onlyOwner {
        require(_token != address(0), "IV");
        btcbToken = _token;
    }

    function setBoardPrice(uint256 _boardLevel, uint256 _price) external onlyOwner {
        require(_boardLevel >= 1 && _boardLevel <= TOTAL_BOARDS, "BL");
        require(_price > 0, "P0");
        boardPrices[_boardLevel] = _price;
    }

    function enterBoard(address _user, uint256 _boardLevel) external onlyMLM {
        _enterBoard(_user, _boardLevel);
    }

    function _enterBoard(address _user, uint256 _boardLevel) internal {
        _boardMatrices[_boardLevel].push(BoardMatrix({
            owner:       _user,
            filledCount: 0,
            completed:   false
        }));
        uint256 newMatrixIdx = _boardMatrices[_boardLevel].length - 1;

        emit BoardEntered(_user, _boardLevel, newMatrixIdx);

        uint256 currentIdx = boardCurrentIndex[_boardLevel];
        if (currentIdx < newMatrixIdx) {
            BoardMatrix storage matrix = _boardMatrices[_boardLevel][currentIdx];
            matrix.filledCount++;

            if (matrix.filledCount >= BOARD_MEMBERS_REQUIRED) {
                matrix.completed = true;
                boardCurrentIndex[_boardLevel] = currentIdx + 1;
                _completeBoardMatrix(matrix.owner, _boardLevel);
            }
        }
    }

    function _completeBoardMatrix(address _owner, uint256 _boardLevel) internal {
        uint256 totalPool = boardPrices[_boardLevel] * BOARD_LEVEL2_MEMBERS;

        if (_boardLevel < TOTAL_BOARDS) {
            uint256 reward    = (totalPool * BOARD_REWARD_RATE_BP) / BASIS_POINTS;
            uint256 liquidity = (totalPool * BOARD_LIQUIDITY_RATE_BP) / BASIS_POINTS;

            virtualRewardBalance[_owner] += reward;
            totalVirtualRewards[_owner] += reward;
            emit VirtualRewardCredited(_owner, reward, _boardLevel);

            if (coinLiquidityAddress != address(0)) {
                paymentToken.safeTransfer(coinLiquidityAddress, liquidity);
            }

            if (mlmContract != address(0)) {
                IMLMCallback(mlmContract).logBoardReward(_owner, reward, _boardLevel);
                IMLMCallback(mlmContract).logBoardEntry(_owner, boardPrices[_boardLevel + 1], _boardLevel + 1);
            }

            emit BoardCompleted(_owner, _boardLevel, reward, liquidity);

            _enterBoard(_owner, _boardLevel + 1);
        } else {
            uint256 reward    = (totalPool * BOARD_10_REWARD_RATE_BP) / BASIS_POINTS;
            uint256 systemFee = (totalPool * BOARD_10_SYSTEM_RATE_BP) / BASIS_POINTS;
            uint256 liquidity = (totalPool * BOARD_10_LIQUIDITY_RATE_BP) / BASIS_POINTS;

            virtualRewardBalance[_owner] += reward;
            totalVirtualRewards[_owner] += reward;
            emit VirtualRewardCredited(_owner, reward, _boardLevel);

            if (systemAddress != address(0)) {
                paymentToken.safeTransfer(systemAddress, systemFee);
            }
            if (coinLiquidityAddress != address(0)) {
                paymentToken.safeTransfer(coinLiquidityAddress, liquidity);
            }

            if (mlmContract != address(0)) {
                IMLMCallback(mlmContract).logBoardReward(_owner, reward, _boardLevel);
            }

            emit BoardCompleted(_owner, _boardLevel, reward, liquidity);
        }
    }

    function getSwapEstimate(uint256 _usdtAmount) external view returns (uint256 btcbAmount) {
        require(address(pancakeRouter) != address(0), "Router not set");
        require(btcbToken != address(0), "BTCB not set");

        address[] memory path = new address[](2);
        path[0] = address(paymentToken);
        path[1] = btcbToken;

        uint256[] memory amounts = pancakeRouter.getAmountsOut(_usdtAmount, path);
        return amounts[1];
    }

    function claimAndSwapToBTC(uint256 _amount, uint256 _minBtcbOut) external nonReentrant {
        require(_amount > 0, "Zero amount");
        require(virtualRewardBalance[msg.sender] >= _amount, "Insufficient virtual balance");
        require(address(pancakeRouter) != address(0), "Router not set");
        require(btcbToken != address(0), "BTCB not set");

        virtualRewardBalance[msg.sender] -= _amount;

        paymentToken.approve(address(pancakeRouter), _amount);

        address[] memory path = new address[](2);
        path[0] = address(paymentToken);
        path[1] = btcbToken;

        uint256[] memory amounts = pancakeRouter.swapExactTokensForTokens(
            _amount,
            _minBtcbOut,
            path,
            msg.sender,
            block.timestamp + 300
        );

        totalSwappedToBTC[msg.sender] += amounts[1];

        emit SwappedToBTC(msg.sender, _amount, amounts[1]);
    }

    function getVirtualRewardBalance(address _user) external view returns (uint256 balance, uint256 totalEarned) {
        return (virtualRewardBalance[_user], totalVirtualRewards[_user]);
    }

    function getTotalSwappedToBTC(address _user) external view returns (uint256) {
        return totalSwappedToBTC[_user];
    }

    function getBoardPrice(uint256 _boardLevel) external view returns (uint256) {
        require(_boardLevel >= 1 && _boardLevel <= TOTAL_BOARDS, "BL");
        return boardPrices[_boardLevel];
    }

    function getBoardQueueLength(uint256 _boardLevel) external view returns (uint256) {
        return _boardMatrices[_boardLevel].length;
    }

    function getBoardMatrixInfo(uint256 _boardLevel, uint256 _index) external view returns (
        address owner,
        uint256 filledCount,
        bool    completed
    ) {
        require(_index < _boardMatrices[_boardLevel].length, "OB");
        BoardMatrix storage m = _boardMatrices[_boardLevel][_index];
        return (m.owner, m.filledCount, m.completed);
    }

    function getBoardCurrentIndex(uint256 _boardLevel) external view returns (uint256) {
        return boardCurrentIndex[_boardLevel];
    }

    // ── USDT Deposit Vault ────────────────────────────────────────────────────

    function deposit(uint256 _amount) external nonReentrant {
        require(_amount > 0, "A0");
        paymentToken.safeTransferFrom(msg.sender, address(this), _amount);
        depositBalance[msg.sender] += _amount;
        depositAmounts[msg.sender].push(_amount);
        depositTimestamps[msg.sender].push(block.timestamp);
        emit Deposited(msg.sender, _amount);
    }

    function getDepositBalance(address _user) external view returns (uint256) {
        return depositBalance[_user];
    }

    function getDepositHistory(address _user) external view returns (
        uint256[] memory amounts,
        uint256[] memory timestamps
    ) {
        return (depositAmounts[_user], depositTimestamps[_user]);
    }

    function adminWithdrawDeposits(address _to, uint256 _amount) external onlyOwner {
        require(_to != address(0), "ZA");
        require(_amount > 0, "A0");
        paymentToken.safeTransfer(_to, _amount);
        emit AdminWithdrawn(_to, _amount);
    }

    function recoverToken(address _token, address _to, uint256 _amount) external onlyOwner {
        require(_to != address(0), "IV");
        IERC20(_token).safeTransfer(_to, _amount);
    }
}
