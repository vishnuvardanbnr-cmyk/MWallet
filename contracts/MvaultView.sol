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
    function binaryPool()  external view returns (uint256);
    function reservePool() external view returns (uint256);
    function adminPool()   external view returns (uint256);
    function rankPool()    external view returns (uint256);
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
        uint256 matchedVolume,
        uint256 mvtBalance,
        uint256 totalReceived,
        uint256 totalSold,
        uint256 incomeLimit,
        uint256 usdtBalance,
        uint256 rebirthPool,
        uint256 totalUsdtEarned,
        uint256 btcPoolBalance,
        uint256 totalBtcEarned,
        uint256 powerLegPoints,
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

    /// @notice Total registered users (alias for totalUsers()).
    function getAllUsersCount() external view returns (uint256) {
        return mvault.totalUsers();
    }

    /// @notice Returns (binaryPool, reservePool, adminPool) from MvaultContract.
    function getPoolBalances() external view returns (
        uint256 binary,
        uint256 reserve,
        uint256 admin
    ) {
        binary  = mvault.binaryPool();
        reserve = mvault.reservePool();
        admin   = mvault.adminPool();
    }

    /// @notice Returns all four pool balances including rankPool.
    function getAllPoolBalances() external view returns (
        uint256 binary,
        uint256 reserve,
        uint256 admin,
        uint256 rank
    ) {
        binary  = mvault.binaryPool();
        reserve = mvault.reservePool();
        admin   = mvault.adminPool();
        rank    = mvault.rankPool();
    }

    /// @notice MVT ERC-20 tokens held by MvaultContract (caps sell-back).
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

    uint256 public constant PRICE_STARTER  =  55 * 1e18;
    uint256 public constant INCOME_STARTER = 165 * 1e18;
    uint256 public constant PRICE_PRO      = 130 * 1e18;
    uint256 public constant INCOME_PRO     = 390 * 1e18;

    /// @notice Default activation price (PRO package, $130 USDT).
    function PACKAGE_PRICE() external pure returns (uint256) { return PRICE_PRO; }

    /// @notice Default income limit (PRO package, $390 USDT).
    function INCOME_LIMIT() external pure returns (uint256) { return INCOME_PRO; }

    /// @notice Returns (price, incomeCap) for a given package index (1 = Starter, 2 = Pro).
    function getPackageParams(uint8 pkg) external pure returns (uint256 price, uint256 incomeCap) {
        if (pkg == 1) return (PRICE_STARTER, INCOME_STARTER);
        if (pkg == 2) return (PRICE_PRO,     INCOME_PRO);
        revert("invalid package");
    }

    // ── Staking constants (delegated to staking module) ───────────────────────

    function getLockDuration()  external view returns (uint256) { return _staking().LOCK_DURATION();  }
    function getMinStakeUsdt()  external view returns (uint256) { return _staking().MIN_STAKE_USDT(); }
    function getFlexCapMult()   external view returns (uint256) { return _staking().FLEX_CAP_MULT();  }

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

    // ── Batch board snapshot (saves multiple RPC round-trips) ─────────────────

    struct BoardTierSnapshot {
        uint256 level;
        uint256 price;
        uint256 queueLength;
        uint256 currentIndex;
    }

    /// @notice Returns price, queueLength and currentIndex for every board level
    ///         from `fromLevel` to `toLevel` (inclusive) in a single call.
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

    /// @notice Returns a slice of the allUsers array.
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

    // ── Distributor batch reader ───────────────────────────────────────────────

    /**
     * @notice Returns only the 5 fields needed by the off-chain distributor
     *         for a batch of addresses, in a single eth_call.
     *
     *         One call with 500 addresses replaces 500 individual users() calls,
     *         and transfers ~40× less data (5 uint256/bool fields vs 33 fields
     *         including profile strings).  This is critical for 1M+ member scale.
     *
     * @param addrs  Array of user addresses to query (max ~500 per call)
     * @return isActive        isActive flag per user
     * @return leftSubVolume   leftSubVolume per user
     * @return rightSubVolume  rightSubVolume per user
     * @return matchedVolume   matchedVolume per user
     * @return powerLegPoints  powerLegPoints per user
     */
    function getDistributorBatch(address[] calldata addrs)
        external view
        returns (
            bool[]    memory isActive,
            uint256[] memory leftSubVolume,
            uint256[] memory rightSubVolume,
            uint256[] memory matchedVolume,
            uint256[] memory powerLegPoints
        )
    {
        uint256 len = addrs.length;
        isActive       = new bool[](len);
        leftSubVolume  = new uint256[](len);
        rightSubVolume = new uint256[](len);
        matchedVolume  = new uint256[](len);
        powerLegPoints = new uint256[](len);

        for (uint256 i = 0; i < len; i++) {
            // All 33 fields must be named — Solidity does not allow anonymous
            // positional skipping for non-value types (address, string).
            // We name everything with short _ prefixes; only 5 are used.
            (
                bool _reg, bool _act,
                address _sp, uint256 _dc, address _bp, bool _pl, address _lc, address _rc,
                uint256 _l, uint256 _r, uint256 _m,
                uint256 _mb, uint256 _tr, uint256 _ts, uint256 _il, uint256 _ub,
                uint256 _rp, uint256 _tue, uint256 _bb, uint256 _tbe,
                uint256 _p,
                uint256 _pp, uint256 _ilc, address _ma, uint256 _rb,
                uint8 _rk, uint256 _tsu, uint256 _ja,
                string memory _dn, string memory _em, string memory _ph, string memory _co,
                bool _prs
            ) = mvault.users(addrs[i]);

            // Suppress unused-variable warnings
            _sp; _dc; _bp; _pl; _lc; _rc;
            _mb; _tr; _ts; _il; _ub; _rp; _tue; _bb; _tbe;
            _pp; _ilc; _ma; _rb; _rk; _tsu; _ja;
            _dn; _em; _ph; _co; _prs;

            if (!_reg) continue;   // unregistered — leave arrays at zero
            isActive[i]       = _act;
            leftSubVolume[i]  = _l;
            rightSubVolume[i] = _r;
            matchedVolume[i]  = _m;
            powerLegPoints[i] = _p;
        }
    }

    // ── Rank distributor batch reader ─────────────────────────────────────────

    struct RankBatchEntry {
        bool    isActive;
        uint8   rank;
        address sponsor;
        uint256 directCount;
        uint256 teamSalesUsdt;
        uint256 leftSubVolume;
        uint256 rightSubVolume;
    }

    /**
     * @notice Returns the 7 fields needed by the off-chain rank distributor
     *         for a batch of addresses in a single eth_call.
     */
    function getRankBatch(address[] calldata addrs)
        external view returns (RankBatchEntry[] memory data)
    {
        data = new RankBatchEntry[](addrs.length);
        for (uint256 i = 0; i < addrs.length; i++) {
            (
                bool _reg, bool _act,
                address _sp, uint256 _dc, address _bp, bool _pl, address _lc, address _rc,
                uint256 _l, uint256 _r, uint256 _m,
                uint256 _mb, uint256 _tr, uint256 _ts, uint256 _il, uint256 _ub,
                uint256 _rp, uint256 _tue, uint256 _bb, uint256 _tbe,
                uint256 _p,
                uint256 _pp, uint256 _ilc, address _ma, uint256 _rb,
                uint8 _rk, uint256 _tsu, uint256 _ja,
                string memory _dn, string memory _em, string memory _ph, string memory _co,
                bool _prs
            ) = mvault.users(addrs[i]);
            _bp; _pl; _lc; _rc; _m;
            _mb; _tr; _ts; _il; _ub; _rp; _tue; _bb; _tbe;
            _p; _pp; _ilc; _ma; _rb; _ja;
            _dn; _em; _ph; _co; _prs;
            if (!_reg) continue;
            data[i] = RankBatchEntry({
                isActive:      _act,
                rank:          _rk,
                sponsor:       _sp,
                directCount:   _dc,
                teamSalesUsdt: _tsu,
                leftSubVolume: _l,
                rightSubVolume: _r
            });
        }
    }

    // ── Contract addresses ────────────────────────────────────────────────────

    function getMvaultAddress()       external view returns (address) { return address(mvault); }
    function getMvtTokenAddress()     external view returns (address) { return mvault.mvaultToken(); }
    function getUsdtTokenAddress()    external view returns (address) { return mvault.usdtToken(); }
    function getBoardHandlerAddress() external view returns (address) { return mvault.boardHandler(); }
    function getStakingAddress()      external view returns (address) { return mvault.stakingModule(); }
}
