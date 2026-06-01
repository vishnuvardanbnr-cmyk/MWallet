// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IMvaultToken {
    function addLiquidityAndMint(address to, uint256 usdtAmount) external;
    function sell(uint256 amount) external;
    function balanceOf(address account) external view returns (uint256);
}

interface IMvaultMain {
    function staking_batchCreditMvtIncome(
        address staker,
        address[] calldata tos,
        uint8[]   calldata levels,
        uint256[] calldata amounts
    ) external;
    function staking_postStake(address user, uint256 usdtAmount, uint256 adminAmt) external;
    function staking_postUnstake(address user, uint256 usdtToUser, uint256 adminCapCut) external;
    function staking_getSponsorChain(address staker, uint8 depth)
        external view returns (address[] memory sponsors, bool[] memory actives);
}

contract MvaultStaking is Ownable, ReentrancyGuard {

    IERC20        public immutable usdtToken;
    IMvaultToken  public immutable mvaultToken;
    IMvaultMain   public           mvaultMain;

    uint256 public constant MIN_STAKE_USDT = 50  * 1e18;
    uint256 public constant LOCK_DURATION  = 300 days;
    uint256 public constant FLEX_CAP_MULT  = 2;

    uint8 internal constant TX_LEVEL_INCOME = 1;
    uint8 internal constant TX_STAKE        = 12;
    uint8 internal constant TX_UNSTAKE      = 13;

    struct StakePosition {
        uint256 mvtAmount;
        uint256 usdtInvested;
        uint256 stakedAt;
        uint256 lockedSince;
        bool    active;
    }

    mapping(address => StakePosition[]) private _stakes;

    event Staked(address indexed user, uint256 stakeIndex, uint256 usdtAmount, uint256 mvtMinted, bool isLocked);
    event Unstaked(address indexed user, uint256 stakeIndex, uint256 mvtReturned, uint256 usdtReceived, uint256 adminCapCut);
    event ConvertedToLocked(address indexed user, uint256 stakeIndex, uint256 lockedSince);
    event StakeLevelIncomePaid(address indexed to, address indexed from, uint8 level, uint256 mvtAmount);

    error BelowMinStake();
    error AlreadyUnstaked();
    error AlreadyLocked();
    error StillLocked();
    error NoMvtMinted();
    error InvalidIndex();
    error NotMvaultContract();

    modifier onlyMvaultMain() {
        if (msg.sender != address(mvaultMain)) revert NotMvaultContract();
        _;
    }

    constructor(address _owner, address _mvaultMain, address _usdt, address _mvaultToken)
        Ownable(_owner)
    {
        mvaultMain  = IMvaultMain(_mvaultMain);
        usdtToken   = IERC20(_usdt);
        mvaultToken = IMvaultToken(_mvaultToken);
    }

    function setMvaultMain(address _main) external onlyOwner {
        mvaultMain = IMvaultMain(_main);
    }

    /**
     * @notice Called by MvaultContract.stake() and MvaultContract.stakeFromBalance().
     *         USDT is already in MvaultContract and approved for this contract.
     */
    function executeStake(address user, uint256 amount, bool isLocked)
        external onlyMvaultMain nonReentrant
    {
        if (amount < MIN_STAKE_USDT) revert BelowMinStake();

        // Pull USDT from MvaultContract
        usdtToken.transferFrom(address(mvaultMain), address(this), amount);

        // Mint MVT via bonding curve (mints 90% of theoretical = grossMvt)
        usdtToken.approve(address(mvaultToken), amount);
        uint256 balBefore = mvaultToken.balanceOf(address(this));
        mvaultToken.addLiquidityAndMint(address(this), amount);
        uint256 grossMvt = mvaultToken.balanceOf(address(this)) - balBefore;
        if (grossMvt == 0) revert NoMvtMinted();

        // 20% → 10 upline levels; compute distribution locally, then batch-credit via callback
        uint256[10] memory levelRates = [uint256(100), 50, 20, 10, 5, 5, 3, 3, 2, 2];
        (address[] memory sponsors, bool[] memory actives) =
            mvaultMain.staking_getSponsorChain(user, 10);

        address[]  memory creditTos     = new address[](10);
        uint8[]    memory creditLevels  = new uint8[](10);
        uint256[]  memory creditAmounts = new uint256[](10);
        uint256 creditCount      = 0;
        uint256 levelDistributed = 0;
        uint256 levelToAdmin     = 0;

        for (uint8 i = 0; i < 10; i++) {
            uint256 share = grossMvt * levelRates[i] / 1000;
            if (share == 0) continue;
            if (i >= sponsors.length || sponsors[i] == address(0) || !actives[i]) {
                levelToAdmin += share;
            } else {
                creditTos[creditCount]     = sponsors[i];
                creditLevels[creditCount]  = i + 1;
                creditAmounts[creditCount] = share;
                creditCount++;
                levelDistributed += share;
                emit StakeLevelIncomePaid(sponsors[i], user, i + 1, share);
            }
        }

        if (creditCount > 0) {
            // Trim arrays to actual length
            assembly { mstore(creditTos, creditCount) mstore(creditLevels, creditCount) mstore(creditAmounts, creditCount) }
            mvaultMain.staking_batchCreditMvtIncome(user, creditTos, creditLevels, creditAmounts);
        }

        // 10% → adminPool + unqualified level shares (5% base + 5% from removed liquidity slice)
        uint256 adminAmt = grossMvt * 10 / 100;

        // 70% → user stake (90% mint + sell rate provides natural price support; no separate liquidity slice needed)
        uint256 stakedMvt = grossMvt - levelDistributed - levelToAdmin - adminAmt;
        if (stakedMvt == 0) revert NoMvtMinted();

        // Transfer all non-staked MVT to MvaultContract so virtual mvtBalance + adminPool credits
        // are backed by real ERC20 tokens that MvaultContract can burn when users call sellMvt().
        // Only stakedMvt stays here (burned on unstake via mvaultToken.sell()).
        uint256 toTransfer = levelDistributed + levelToAdmin + adminAmt;
        if (toTransfer > 0) {
            IERC20(address(mvaultToken)).transfer(address(mvaultMain), toTransfer);
        }

        uint256 stakeIndex = _stakes[user].length;
        _stakes[user].push(StakePosition({
            mvtAmount:    stakedMvt,
            usdtInvested: amount,
            stakedAt:     block.timestamp,
            lockedSince:  isLocked ? block.timestamp : 0,
            active:       true
        }));

        mvaultMain.staking_postStake(user, amount, adminAmt + levelToAdmin);
        emit Staked(user, stakeIndex, amount, stakedMvt, isLocked);
    }

    /**
     * @notice Called by MvaultContract.unstake().
     */
    function executeUnstake(address user, uint256 stakeIndex)
        external onlyMvaultMain nonReentrant
    {
        if (stakeIndex >= _stakes[user].length) revert InvalidIndex();
        StakePosition storage pos = _stakes[user][stakeIndex];
        if (!pos.active) revert AlreadyUnstaked();

        bool isLocked = pos.lockedSince > 0;
        if (isLocked && block.timestamp < pos.lockedSince + LOCK_DURATION) revert StillLocked();

        pos.active = false;
        uint256 totalMvt = pos.mvtAmount;
        uint256 usdtCap  = pos.usdtInvested * FLEX_CAP_MULT;
        uint256 toSell   = totalMvt;

        {
            uint8 depth = isLocked ? 5 : 1;
            (address[] memory sponsors, bool[] memory actives) =
                mvaultMain.staking_getSponsorChain(user, depth);

            address[] memory tos     = new address[](depth);
            uint8[]   memory lvls    = new uint8[](depth);
            uint256[] memory amts    = new uint256[](depth);
            uint256 cnt = 0;

            uint8[5] memory rates = isLocked ? [uint8(5), 2, 1, 1, 1] : [uint8(5), 0, 0, 0, 0];

            for (uint8 i = 0; i < uint8(sponsors.length); i++) {
                if (rates[i] == 0) break;
                if (!actives[i] || sponsors[i] == address(0)) continue;
                uint256 share = (totalMvt * rates[i]) / 100;
                if (share == 0) continue;
                tos[cnt]  = sponsors[i];
                lvls[cnt] = i + 1;
                amts[cnt] = share;
                cnt++;
                toSell -= share;
                emit StakeLevelIncomePaid(sponsors[i], user, i + 1, share);
            }
            if (cnt > 0) {
                assembly { mstore(tos, cnt) mstore(lvls, cnt) mstore(amts, cnt) }
                mvaultMain.staking_batchCreditMvtIncome(user, tos, lvls, amts);
            }
        }

        // Sell remaining MVT → USDT lands in this contract
        uint256 usdtBefore = usdtToken.balanceOf(address(this));
        mvaultToken.sell(toSell);
        uint256 usdtGross  = usdtToken.balanceOf(address(this)) - usdtBefore;

        uint256 usdtToUser  = usdtGross;
        uint256 adminCapCut = 0;

        if (!isLocked && usdtGross > usdtCap) {
            adminCapCut = usdtGross - usdtCap;
            usdtToUser  = usdtCap;
        }

        // Transfer all USDT to MvaultContract; callback credits user and records tx
        if (usdtGross > 0) {
            usdtToken.transfer(address(mvaultMain), usdtGross);
        }
        mvaultMain.staking_postUnstake(user, usdtToUser, adminCapCut);
        emit Unstaked(user, stakeIndex, totalMvt, usdtToUser, adminCapCut);
    }

    /**
     * @notice Called by MvaultContract.convertToLocked().
     */
    function executeConvertToLocked(address user, uint256 stakeIndex)
        external onlyMvaultMain
    {
        if (stakeIndex >= _stakes[user].length) revert InvalidIndex();
        StakePosition storage pos = _stakes[user][stakeIndex];
        if (!pos.active) revert AlreadyUnstaked();
        if (pos.lockedSince != 0) revert AlreadyLocked();

        pos.lockedSince = block.timestamp;
        emit ConvertedToLocked(user, stakeIndex, block.timestamp);
    }

    // ── View functions ──────────────────────────────────────────────────────────

    function getStakeCount(address user) external view returns (uint256) {
        return _stakes[user].length;
    }

    function getStake(address user, uint256 index)
        external view returns (
            uint256 mvtAmount,
            uint256 usdtInvested,
            uint256 stakedAt,
            uint256 lockedSince,
            bool    active
        )
    {
        StakePosition storage p = _stakes[user][index];
        return (p.mvtAmount, p.usdtInvested, p.stakedAt, p.lockedSince, p.active);
    }

    function getActiveStakes(address user) external view returns (
        uint256[] memory indices,
        uint256[] memory mvtAmounts,
        uint256[] memory usdtInvestedArr,
        uint256[] memory stakedAts,
        uint256[] memory lockedSinces
    ) {
        StakePosition[] storage positions = _stakes[user];
        uint256 count = 0;
        for (uint256 i = 0; i < positions.length; i++) {
            if (positions[i].active) count++;
        }
        indices        = new uint256[](count);
        mvtAmounts     = new uint256[](count);
        usdtInvestedArr = new uint256[](count);
        stakedAts      = new uint256[](count);
        lockedSinces   = new uint256[](count);
        uint256 j = 0;
        for (uint256 i = 0; i < positions.length; i++) {
            if (!positions[i].active) continue;
            indices[j]         = i;
            mvtAmounts[j]      = positions[i].mvtAmount;
            usdtInvestedArr[j] = positions[i].usdtInvested;
            stakedAts[j]       = positions[i].stakedAt;
            lockedSinces[j]    = positions[i].lockedSince;
            j++;
        }
    }
}
