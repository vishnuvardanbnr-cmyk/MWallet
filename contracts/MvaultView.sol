// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @title  MvaultView
 * @notice Read-only helper contract that re-exposes view functions removed
 *         from MvaultContract to stay under the EIP-170 24 576-byte limit.
 *
 *         Deploy once, point at the live MvaultContract + BoardHandler.
 *         No state is written here — every function is a pure view delegate.
 */

// ── Minimal interfaces ────────────────────────────────────────────────────────

interface IMvault {
    function totalUsers()  external view returns (uint256);
    function reservePool() external view returns (uint256);
    function adminPool()   external view returns (uint256);
    function rankPool()    external view returns (uint256);
    function communityPool() external view returns (uint256);
    function mvaultToken() external view returns (address);
    function usdtToken()   external view returns (address);
    function boardHandler()  external view returns (address);
    function stakingModule() external view returns (address);
    function allUsers(uint256 index) external view returns (address);
    function users(address u) external view returns (
        bool    isRegistered,
        bool    isActive,
        address sponsor,
        uint256 directCount,
        address binaryParent,
        bool    placedLeft,
        address leftChild,
        address rightChild,
        uint256 leftSubVolume,
        uint256 rightSubVolume,
        uint256 mvtBalance,
        uint256 totalReceived,
        uint256 totalSold,
        uint256 incomeLimit,
        uint256 usdtBalance,
        uint256 rebirthPool,
        uint256 totalUsdtEarned,
        uint256 btcPoolBalance,
        uint256 totalBtcEarned,
        uint256 packagePrice,
        uint256 incomeLimitCap,
        address mainAccount,
        uint256 rebirthCount,
        uint8   rank,
        uint256 teamSalesUsdt,
        uint256 joinedAt,
        string  memory displayName,
        string  memory email,
        string  memory phone,
        string  memory country,
        bool    profileSet
    );
}

interface IBoardHandler {
    function getBoardPrice(uint256 boardLevel)                        external view returns (uint256);
    function getBoardQueueLength(uint256 boardLevel)                  external view returns (uint256);
    function getBoardCurrentIndex(uint256 boardLevel)                 external view returns (uint256);
    function getBoardMatrixInfo(uint256 boardLevel, uint256 index)
        external view returns (address owner, uint256 filledCount, bool completed);
}

interface IStaking {
    function MIN_STAKE_USDT() external view returns (uint256);
    function LOCK_DURATION()  external view returns (uint256);
    function FLEX_CAP_MULT()  external view returns (uint256);
}

interface IERC20Minimal {
    function balanceOf(address account) external view returns (uint256);
    function decimals() external view returns (uint8);
}

// ── MvaultView ────────────────────────────────────────────────────────────────

contract MvaultView {

    IMvault public immutable mvault;

    constructor(address _mvault) {
        require(_mvault != address(0), "zero address");
        mvault = IMvault(_mvault);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    function _board() internal view returns (IBoardHandler) {
        address bh = mvault.boardHandler();
        require(bh != address(0), "board handler not set");
        return IBoardHandler(bh);
    }

    function _staking() internal view returns (IStaking) {
        address sm = mvault.stakingModule();
        require(sm != address(0), "staking module not set");
        return IStaking(sm);
    }

    // ── Aliases for removed MvaultContract functions ──────────────────────────

    function getAllUsersCount() external view returns (uint256) {
        return mvault.totalUsers();
    }

    /// @notice Returns (communityPool, reservePool, adminPool) from MvaultContract.
    function getPoolBalances() external view returns (
        uint256 community,
        uint256 reserve,
        uint256 admin
    ) {
        community = mvault.communityPool();
        reserve   = mvault.reservePool();
        admin     = mvault.adminPool();
    }

    /// @notice Returns all pool balances including rankPool.
    function getAllPoolBalances() external view returns (
        uint256 community,
        uint256 reserve,
        uint256 admin,
        uint256 rank
    ) {
        community = mvault.communityPool();
        reserve   = mvault.reservePool();
        admin     = mvault.adminPool();
        rank      = mvault.rankPool();
    }

    /// @notice MVT ERC-20 tokens held by MvaultContract.
    function getMvtContractBalance() external view returns (uint256) {
        address mvt = mvault.mvaultToken();
        return IERC20Minimal(mvt).balanceOf(address(mvault));
    }

    /// @notice USDT ERC-20 balance held by MvaultContract.
    function getUsdtContractBalance() external view returns (uint256) {
        address usdt = mvault.usdtToken();
        return IERC20Minimal(usdt).balanceOf(address(mvault));
    }

    // ── Package / income constants ────────────────────────────────────────────

    uint256 public constant PRICE_STARTER  =  75 * 1e18;
    uint256 public constant INCOME_STARTER = 225 * 1e18;
    uint256 public constant PRICE_PRO      = 150 * 1e18;
    uint256 public constant INCOME_PRO     = 450 * 1e18;

    function PACKAGE_PRICE() external pure returns (uint256) { return PRICE_PRO; }
    function INCOME_LIMIT()  external pure returns (uint256) { return INCOME_PRO; }

    function getPackageParams(uint8 pkg) external pure returns (uint256 price, uint256 incomeCap) {
        if (pkg == 1) return (PRICE_STARTER, INCOME_STARTER);
        if (pkg == 2) return (PRICE_PRO,     INCOME_PRO);
        revert("invalid package");
    }

    // ── Staking constants ─────────────────────────────────────────────────────

    function getLockDuration() external view returns (uint256) { return _staking().LOCK_DURATION();  }
    function getMinStakeUsdt() external view returns (uint256) { return _staking().MIN_STAKE_USDT(); }
    function getFlexCapMult()  external view returns (uint256) { return _staking().FLEX_CAP_MULT();  }

    // ── Board handler delegates ───────────────────────────────────────────────

    function getBoardPrice(uint256 boardLevel) external view returns (uint256) {
        return _board().getBoardPrice(boardLevel);
    }

    function getBoardQueueLength(uint256 boardLevel) external view returns (uint256) {
        return _board().getBoardQueueLength(boardLevel);
    }

    function getBoardCurrentIndex(uint256 boardLevel) external view returns (uint256) {
        return _board().getBoardCurrentIndex(boardLevel);
    }

    function getBoardMatrixInfo(uint256 boardLevel, uint256 index)
        external view returns (address owner, uint256 filledCount, bool completed)
    {
        return _board().getBoardMatrixInfo(boardLevel, index);
    }

    // ── Batch board snapshot ──────────────────────────────────────────────────

    struct BoardTierSnapshot {
        uint256 level;
        uint256 price;
        uint256 queueLength;
        uint256 currentIndex;
    }

    function getBoardSnapshot(uint256 fromLevel, uint256 toLevel)
        external view returns (BoardTierSnapshot[] memory tiers)
    {
        IBoardHandler bh = _board();
        uint256 count = toLevel >= fromLevel ? toLevel - fromLevel + 1 : 0;
        tiers = new BoardTierSnapshot[](count);
        for (uint256 i = 0; i < count; i++) {
            uint256 lvl = fromLevel + i;
            tiers[i] = BoardTierSnapshot({
                level:        lvl,
                price:        bh.getBoardPrice(lvl),
                queueLength:  bh.getBoardQueueLength(lvl),
                currentIndex: bh.getBoardCurrentIndex(lvl)
            });
        }
    }

    // ── User-list helpers ─────────────────────────────────────────────────────

    function getUserSlice(uint256 offset, uint256 limit)
        external view returns (address[] memory slice)
    {
        uint256 total = mvault.totalUsers();
        if (offset >= total) return new address[](0);
        uint256 end = offset + limit > total ? total : offset + limit;
        slice = new address[](end - offset);
        for (uint256 i = 0; i < slice.length; i++) {
            slice[i] = mvault.allUsers(offset + i);
        }
    }

    // ── Rank batch reader ─────────────────────────────────────────────────────

    struct RankBatchEntry {
        bool    isActive;
        uint8   rank;
        address sponsor;
        uint256 directCount;
        uint256 teamSalesUsdt;
        uint256 leftSubVolume;
        uint256 rightSubVolume;
    }

    function getRankBatch(address[] calldata addrs)
        external view returns (RankBatchEntry[] memory data)
    {
        data = new RankBatchEntry[](addrs.length);
        for (uint256 i = 0; i < addrs.length; i++) {
            _fillRankEntry(data, i, addrs[i]);
        }
    }

    function _fillRankEntry(RankBatchEntry[] memory data, uint256 idx, address addr) internal view {
        (
            bool reg_, bool act_,
            address sp_, uint256 dc_, , , , ,
            uint256 lv_, uint256 rv_,
            , , , , , , , , ,
            , , , ,
            uint8 rk_, uint256 tsu_, ,
            , , , ,
            bool prs_
        ) = mvault.users(addr);
        prs_;
        if (!reg_) return;
        data[idx] = RankBatchEntry({
            isActive:       act_,
            rank:           rk_,
            sponsor:        sp_,
            directCount:    dc_,
            teamSalesUsdt:  tsu_,
            leftSubVolume:  lv_,
            rightSubVolume: rv_
        });
    }

    // ── Board eligibility check ───────────────────────────────────────────────

    function _getUserBoardData(address _user) internal view returns (bool act_, uint256 btc_) {
        (
            , bool a_, , , , , , , , ,
            , , , , , , , uint256 b_,
            , , , , , , , ,
            , , , ,
            bool p_
        ) = mvault.users(_user);
        p_;
        act_ = a_;
        btc_ = b_;
    }

    function canEnterBoard(address _user) external view returns (
        bool eligible, uint256 btcBalance, uint256 boardPrice
    ) {
        address bh = mvault.boardHandler();
        if (bh == address(0)) return (false, 0, 0);
        bool act_;
        (act_, btcBalance) = _getUserBoardData(_user);
        boardPrice = IBoardHandler(bh).getBoardPrice(1);
        eligible   = act_ && btcBalance >= boardPrice;
    }

    // ── Contract addresses ────────────────────────────────────────────────────

    function getMvaultAddress()       external view returns (address) { return address(mvault); }
    function getMvtTokenAddress()     external view returns (address) { return mvault.mvaultToken(); }
    function getUsdtTokenAddress()    external view returns (address) { return mvault.usdtToken(); }
    function getBoardHandlerAddress() external view returns (address) { return mvault.boardHandler(); }
    function getStakingAddress()      external view returns (address) { return mvault.stakingModule(); }
}
