// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract MLMContract is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    enum Package { NONE, BASIC, PRO, ELITE, STOCKIEST, SUPER_STOCKIEST }
    enum Status  { INACTIVE, ACTIVE, GRACE_PERIOD }
    enum Side    { NONE, LEFT, RIGHT }

    enum TxType { ACTIVATION, UPGRADE, REACTIVATION, WITHDRAWAL, DIRECT_INCOME, BINARY_INCOME, MATCHING_OVERRIDE, WITHDRAWAL_MATCH, BOARD_ENTRY, BOARD_REWARD, BTC_POOL_DEDUCTION, WITHDRAWAL_MATCH_DEDUCTION }

    struct TransactionRecord {
        TxType  txType;
        uint256 amount;
        uint256 timestamp;
        address relatedUser;
        uint8   extraData;
    }

    struct User {
        uint256 userId;
        address sponsor;
        address binaryParent;
        address leftChild;
        address rightChild;
        Side    placementSide;
        Package userPackage;
        Status  status;

        uint256 walletBalance;
        uint256 tempWalletBalance;

        uint256 totalDirectIncome;
        uint256 totalBinaryIncome;
        uint256 totalMatchingOverrideIncome;
        uint256 totalWithdrawalMatchIncome;
        uint256 totalEarnings;

        uint256 leftBusiness;
        uint256 rightBusiness;
        uint256 carryLeft;
        uint256 carryRight;

        uint256 todayBinaryIncome;
        uint256 lastBinaryResetDay;

        uint256 directReferralCount;
        uint256 gracePeriodStart;
        uint256 joinedAt;
        uint256 totalWithdrawn;

        uint256 claimableBinaryIncome;
        uint256 binaryDepth;

        string displayName;
        string email;
        string phone;
        string country;
        bool   profileSet;
    }

    IERC20 public paymentToken;
    IERC20 public mToken;
    uint8  public tokenDecimals;
    address public feeRecipient;
    address public productWallet;
    uint256 public withdrawalFee;
    uint256 public withdrawalUsdtRate = 10000;

    mapping(address => User)      public users;
    mapping(address => bool)      public isRegistered;
    mapping(address => bool)      public isFreeAccount;
    mapping(address => address[]) public directReferrals;

    address[] public allUsers;

    mapping(address => TransactionRecord[]) internal _userTransactions;

    mapping(address => bool) public isBinaryProcessor;
    uint256 public binaryBatchSize = 50;

    mapping(uint256 => address) public userIdToAddress;
    mapping(uint256 => bool)    public userIdTaken;
    uint256 private _idNonce;

    uint256 public constant MIN_USER_ID = 1000;
    uint256 public constant MAX_USER_ID = 999999999999;

    struct BoardMatrix {
        address owner;
        uint256 filledCount;
        bool    completed;
    }

    uint256 public constant TOTAL_BOARDS = 10;
    uint256 public constant BOARD_MEMBERS_REQUIRED = 12;
    uint256 public constant BTC_POOL_RATE = 1000;
    uint256 public constant BOARD_REWARD_RATE_BP = 4000;
    uint256 public constant BOARD_NEXT_POOL_RATE_BP = 4000;
    uint256 public constant BOARD_LIQUIDITY_RATE_BP = 2000;
    uint256 public constant BOARD_10_REWARD_RATE_BP = 8750;
    uint256 public constant BOARD_10_SYSTEM_RATE_BP = 625;
    uint256 public constant BOARD_10_LIQUIDITY_RATE_BP = 625;

    mapping(address => uint256) public btcPoolBalance;
    mapping(uint256 => BoardMatrix[]) internal _boardMatrices;
    mapping(uint256 => uint256) public boardCurrentIndex;
    uint256[11] public boardPrices;

    mapping(address => uint256) public boardEntryCount;

    address public coinLiquidityAddress;
    address public systemAddress;
    IERC20  public btcRewardToken;

    address public adminBinaryWallet;
    uint256 public totalBinaryFlushed;

    uint256[6] public packagePrices;
    uint256[6] public directRates = [0, 1000, 1500, 2000, 2500, 3000];
    uint256[6] public dailyCapping;
    uint256[6] public maxIncomeLimit;
    uint256[6] public matchingOverrideMaxLevels = [0, 3, 6, 10, 15, 20];
    uint256[6] public withdrawalMatchMaxLevels = [0, 3, 5, 9, 12, 15];

    uint256 public constant BINARY_RATE   = 3000;
    uint256 public constant MATCHING_OVERRIDE_RATE = 100;
    uint256 public constant WITHDRAWAL_MATCH_POOL_RATE = 1000;
    uint256 public constant GRACE_PERIOD_DURATION = 48 hours;
    uint256 public constant BASIS_POINTS  = 10000;
    uint256 public constant INCOME_SPLIT_RATE = 6000;
    uint256 public constant PRODUCT_WALLET_RATE = 4000;

    event UserRegistered(address indexed user, uint256 userId, address indexed sponsor, address indexed binaryParent, Side side);
    event PackageActivated(address indexed user, Package pkg, uint256 amountPaid);
    event PackageUpgraded(address indexed user, Package oldPkg, Package newPkg, uint256 amountPaid);
    event DirectIncomeDistributed(address indexed recipient, address indexed from, uint256 amount);
    event MatchingOverrideDistributed(address indexed recipient, address indexed from, uint256 amount, uint256 level);
    event WithdrawalMatchDistributed(address indexed recipient, address indexed from, uint256 amount, uint256 level);
    event Withdrawal(address indexed user, uint256 netAmount, uint256 fee);
    event GracePeriodStarted(address indexed user, uint256 startTime);
    event GracePeriodExpired(address indexed user, uint256 flushedAmount);
    event TempWalletClaimed(address indexed user, uint256 amount);
    event Reactivated(address indexed user, Package pkg, uint256 amountPaid);
    event FeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);
    event WithdrawalFeeUpdated(uint256 oldFee, uint256 newFee);
    event PaymentTokenUpdated(address indexed oldToken, address indexed newToken);
    event EmergencyTokenRecovery(address indexed token, address indexed to, uint256 amount);
    event ProfileUpdated(address indexed user);
    event ContractFundsWithdrawn(address indexed to, uint256 amount);
    event PackagePriceUpdated(Package pkg, uint256 oldPrice, uint256 newPrice);
    event DailyCappingUpdated(Package pkg, uint256 oldCap, uint256 newCap);
    event MaxIncomeLimitUpdated(Package pkg, uint256 oldLimit, uint256 newLimit);
    event BtcPoolCredited(address indexed user, uint256 amount);
    event BoardEntered(address indexed user, uint256 indexed boardLevel, uint256 matrixIndex);
    event BoardCompleted(address indexed owner, uint256 indexed boardLevel, uint256 reward, uint256 liquidity);
    event CoinLiquidityAddressUpdated(address indexed oldAddr, address indexed newAddr);
    event SystemAddressUpdated(address indexed oldAddr, address indexed newAddr);
    event ProductWalletUpdated(address indexed oldAddr, address indexed newAddr);
    event BinaryIncomeAllocated(address indexed user, uint256 amount);
    event BinaryIncomeClaimed(address indexed user, uint256 amount);
    event BinaryBatchSizeUpdated(uint256 oldSize, uint256 newSize);
    event BinaryBatchProcessed(uint256 batchNumber, uint256 processedCount);
    event BinaryProcessorUpdated(address indexed processor, bool status);
    event MTokenUpdated(address indexed oldToken, address indexed newToken);
    event WithdrawalUsdtRateUpdated(uint256 oldRate, uint256 newRate);
    event FreeAccountActivated(address indexed user, uint256 userId, Package pkg, address indexed sponsor);
    event BinaryFlushed(address indexed user, uint256 flushedAmount);
    event AdminBinaryWalletUpdated(address indexed oldWallet, address indexed newWallet);

    modifier onlyRegistered(address _user) {
        require(isRegistered[_user], "MLM: Not registered");
        _;
    }

    modifier onlyBinaryProcessor() {
        require(isBinaryProcessor[msg.sender] || msg.sender == owner(), "MLM: Not authorized");
        _;
    }

    constructor(
        address _paymentToken,
        uint8   _tokenDecimals,
        address _feeRecipient,
        address _adminBinaryWallet
    ) Ownable(msg.sender) {
        require(_paymentToken != address(0), "MLM: Invalid token");
        require(_feeRecipient != address(0), "MLM: Invalid fee recipient");
        require(_adminBinaryWallet != address(0), "MLM: Invalid admin binary wallet");

        paymentToken  = IERC20(_paymentToken);
        tokenDecimals = _tokenDecimals;
        feeRecipient  = _feeRecipient;
        productWallet = _feeRecipient;
        adminBinaryWallet = _adminBinaryWallet;
        withdrawalFee = 0;

        uint256 unit = 10 ** uint256(_tokenDecimals);

        packagePrices[0] = 0;
        packagePrices[1] = 200  * unit;
        packagePrices[2] = 600  * unit;
        packagePrices[3] = 1200 * unit;
        packagePrices[4] = 2400 * unit;
        packagePrices[5] = 4800 * unit;

        dailyCapping[0] = 0;
        dailyCapping[1] = 200   * unit;
        dailyCapping[2] = 600   * unit;
        dailyCapping[3] = 1200  * unit;
        dailyCapping[4] = 2400  * unit;
        dailyCapping[5] = 4800  * unit;

        maxIncomeLimit[0] = 0;
        maxIncomeLimit[1] = 1000  * unit;
        maxIncomeLimit[2] = 3000  * unit;
        maxIncomeLimit[3] = 6000  * unit;
        maxIncomeLimit[4] = 12000 * unit;
        maxIncomeLimit[5] = 24000 * unit;

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

    function _generateUserId() internal returns (uint256) {
        uint256 id;
        uint256 attempts = 0;

        do {
            _idNonce++;
            id = uint256(keccak256(abi.encodePacked(
                block.timestamp,
                block.prevrandao,
                msg.sender,
                _idNonce,
                allUsers.length
            )));
            id = (id % (MAX_USER_ID - MIN_USER_ID + 1)) + MIN_USER_ID;
            attempts++;
            require(attempts <= 50, "MLM: ID generation failed");
        } while (userIdTaken[id]);

        return id;
    }

    function _findDeepestAvailable(address _start, bool _left) internal view returns (address) {
        address current = _start;
        if (_left) {
            while (users[current].leftChild != address(0)) {
                current = users[current].leftChild;
            }
        } else {
            while (users[current].rightChild != address(0)) {
                current = users[current].rightChild;
            }
        }
        return current;
    }

    function register(
        uint256 _sponsorId,
        uint256 _binaryParentId,
        bool    _placeLeft
    ) external whenNotPaused {
        require(!isRegistered[msg.sender], "MLM: Already registered");

        address _sponsor;
        address _binaryParent;
        Side side;

        if (allUsers.length == 0) {
            _sponsor      = address(0);
            _binaryParent = address(0);
            side = Side.NONE;
        } else {
            _sponsor = userIdToAddress[_sponsorId];
            require(_sponsor != address(0) && isRegistered[_sponsor], "MLM: Invalid sponsor ID");

            if (_binaryParentId == 0) {
                _binaryParent = _sponsor;
            } else {
                _binaryParent = userIdToAddress[_binaryParentId];
                require(_binaryParent != address(0) && isRegistered[_binaryParent], "MLM: Invalid binary parent ID");
            }

            if (_placeLeft) {
                _binaryParent = _findDeepestAvailable(_binaryParent, true);
                side = Side.LEFT;
            } else {
                _binaryParent = _findDeepestAvailable(_binaryParent, false);
                side = Side.RIGHT;
            }
        }

        uint256 newUserId = _generateUserId();
        userIdTaken[newUserId]     = true;
        userIdToAddress[newUserId] = msg.sender;

        User storage u = users[msg.sender];
        u.userId        = newUserId;
        u.sponsor       = _sponsor;
        u.binaryParent  = _binaryParent;
        u.placementSide = side;
        u.status        = Status.INACTIVE;
        u.joinedAt      = block.timestamp;
        u.binaryDepth   = _binaryParent != address(0) ? users[_binaryParent].binaryDepth + 1 : 0;

        if (_binaryParent != address(0)) {
            if (side == Side.LEFT) {
                users[_binaryParent].leftChild = msg.sender;
            } else {
                users[_binaryParent].rightChild = msg.sender;
            }
        }

        if (_sponsor != address(0)) {
            directReferrals[_sponsor].push(msg.sender);
            users[_sponsor].directReferralCount++;
        }

        isRegistered[msg.sender] = true;
        allUsers.push(msg.sender);

        emit UserRegistered(msg.sender, newUserId, _sponsor, _binaryParent, side);
    }

    function setProfile(
        string calldata _displayName,
        string calldata _email,
        string calldata _phone,
        string calldata _country
    ) external onlyRegistered(msg.sender) {
        require(bytes(_displayName).length > 0, "MLM: Display name required");

        User storage u = users[msg.sender];
        u.displayName = _displayName;
        u.email       = _email;
        u.phone       = _phone;
        u.country     = _country;
        u.profileSet  = true;

        emit ProfileUpdated(msg.sender);
    }

    function activatePackage(Package _pkg) external nonReentrant whenNotPaused {
        require(isRegistered[msg.sender], "MLM: Not registered");
        require(_pkg >= Package.BASIC && _pkg <= Package.SUPER_STOCKIEST, "MLM: Invalid package");

        User storage u = users[msg.sender];
        require(uint256(_pkg) > uint256(u.userPackage), "MLM: Must upgrade to higher package");

        uint256 price = packagePrices[uint256(_pkg)];
        paymentToken.safeTransferFrom(msg.sender, address(this), price);

        Package oldPkg = u.userPackage;

        u.userPackage       = _pkg;
        u.status            = Status.ACTIVE;
        u.totalEarnings     = 0;
        u.tempWalletBalance = 0;
        u.gracePeriodStart  = 0;
        u.todayBinaryIncome = 0;

        if (oldPkg == Package.NONE) {
            _userTransactions[msg.sender].push(TransactionRecord(TxType.ACTIVATION, price, block.timestamp, address(0), uint8(_pkg)));
            emit PackageActivated(msg.sender, _pkg, price);
        } else {
            _userTransactions[msg.sender].push(TransactionRecord(TxType.UPGRADE, price, block.timestamp, address(0), uint8(_pkg)));
            emit PackageUpgraded(msg.sender, oldPkg, _pkg, price);
        }

        uint256 incomeAmount = (price * INCOME_SPLIT_RATE) / BASIS_POINTS;
        uint256 productAmount = price - incomeAmount;

        if (productWallet != address(0) && productAmount > 0) {
            paymentToken.safeTransfer(productWallet, productAmount);
        }

        _distributeDirectIncome(msg.sender, incomeAmount);
        _updateBinaryVolumes(msg.sender, incomeAmount);
    }

    function reactivate(Package _pkg) external nonReentrant whenNotPaused {
        require(isRegistered[msg.sender], "MLM: Not registered");
        User storage u = users[msg.sender];
        require(
            u.status == Status.GRACE_PERIOD || u.status == Status.INACTIVE,
            "MLM: Already active"
        );
        require(_pkg >= Package.BASIC, "MLM: Invalid package");
        require(uint256(_pkg) >= uint256(u.userPackage), "MLM: Cannot downgrade");

        uint256 price = packagePrices[uint256(_pkg)];
        paymentToken.safeTransferFrom(msg.sender, address(this), price);

        if (u.status == Status.GRACE_PERIOD) {
            if (block.timestamp <= u.gracePeriodStart + GRACE_PERIOD_DURATION) {
                u.walletBalance += u.tempWalletBalance;
                emit TempWalletClaimed(msg.sender, u.tempWalletBalance);
            } else {
                emit GracePeriodExpired(msg.sender, u.tempWalletBalance);
            }
        }

        u.tempWalletBalance = 0;
        u.userPackage       = _pkg;
        u.status            = Status.ACTIVE;
        u.totalEarnings     = 0;
        u.gracePeriodStart  = 0;
        u.todayBinaryIncome = 0;

        _userTransactions[msg.sender].push(TransactionRecord(TxType.REACTIVATION, price, block.timestamp, address(0), uint8(_pkg)));
        emit Reactivated(msg.sender, _pkg, price);

        uint256 incomeAmount = (price * INCOME_SPLIT_RATE) / BASIS_POINTS;
        uint256 productAmount = price - incomeAmount;

        if (productWallet != address(0) && productAmount > 0) {
            paymentToken.safeTransfer(productWallet, productAmount);
        }

        _distributeDirectIncome(msg.sender, incomeAmount);
        _updateBinaryVolumes(msg.sender, incomeAmount);
    }

    function repurchase() external nonReentrant whenNotPaused onlyRegistered(msg.sender) {
        User storage u = users[msg.sender];
        require(u.status == Status.INACTIVE || u.status == Status.GRACE_PERIOD, "MLM: Must be inactive");
        require(u.userPackage >= Package.BASIC, "MLM: No package to repurchase");

        uint256 price = packagePrices[uint256(u.userPackage)];
        paymentToken.safeTransferFrom(msg.sender, address(this), price);

        u.status            = Status.ACTIVE;
        u.totalEarnings     = 0;
        u.tempWalletBalance = 0;
        u.gracePeriodStart  = 0;
        u.todayBinaryIncome = 0;

        _userTransactions[msg.sender].push(TransactionRecord(TxType.ACTIVATION, price, block.timestamp, address(0), uint8(u.userPackage)));
        emit PackageActivated(msg.sender, u.userPackage, price);

        uint256 incomeAmount = (price * INCOME_SPLIT_RATE) / BASIS_POINTS;
        uint256 productAmount = price - incomeAmount;

        if (productWallet != address(0) && productAmount > 0) {
            paymentToken.safeTransfer(productWallet, productAmount);
        }

        _distributeDirectIncome(msg.sender, incomeAmount);
        _updateBinaryVolumes(msg.sender, incomeAmount);
    }

    function _distributeDirectIncome(address _user, uint256 _incomeBase) internal {
        address sponsor = users[_user].sponsor;
        if (sponsor == address(0)) return;

        User storage s = users[sponsor];
        if (s.status != Status.ACTIVE && s.status != Status.GRACE_PERIOD) return;

        uint256 rate   = directRates[uint256(s.userPackage)];
        uint256 income = (_incomeBase * rate) / BASIS_POINTS;

        if (income == 0) return;

        _creditIncome(sponsor, income);
        s.totalDirectIncome += income;

        _userTransactions[sponsor].push(TransactionRecord(TxType.DIRECT_INCOME, income, block.timestamp, _user, 0));
        emit DirectIncomeDistributed(sponsor, _user, income);
    }

    function _updateBinaryVolumes(address _user, uint256 _amount) internal {
        address current = _user;

        while (true) {
            address parent = users[current].binaryParent;
            if (parent == address(0)) break;

            if (users[parent].status == Status.ACTIVE || users[parent].status == Status.GRACE_PERIOD) {
                Side side = users[current].placementSide;

                if (side == Side.LEFT) {
                    users[parent].leftBusiness += _amount;
                    users[parent].carryLeft    += _amount;
                } else if (side == Side.RIGHT) {
                    users[parent].rightBusiness += _amount;
                    users[parent].carryRight    += _amount;
                }
            }

            current = parent;
        }
    }

    function _getBinaryIncomeRate(uint256 _depth) internal pure returns (uint256) {
        if (_depth <= 5)  return 3000;
        if (_depth <= 10) return 2000;
        if (_depth <= 15) return 1000;
        return 500;
    }

    function autoDistributeBinaryIncome(uint256 _batchNumber)
        external
        onlyBinaryProcessor
        whenNotPaused
    {
        require(_batchNumber > 0, "MLM: Batch number must be > 0");

        uint256 startIndex = (_batchNumber - 1) * binaryBatchSize;
        require(startIndex < allUsers.length, "MLM: Batch exceeds total users");

        uint256 endIndex = startIndex + binaryBatchSize;
        if (endIndex > allUsers.length) {
            endIndex = allUsers.length;
        }

        uint256 processedCount = 0;

        for (uint256 i = startIndex; i < endIndex; i++) {
            address userAddr = allUsers[i];
            User storage u = users[userAddr];

            if (u.status != Status.ACTIVE && u.status != Status.GRACE_PERIOD) continue;

            uint256 matchedVolume = u.carryLeft < u.carryRight ? u.carryLeft : u.carryRight;
            if (matchedVolume == 0) continue;

            uint256 rate = _getBinaryIncomeRate(u.binaryDepth);
            uint256 binaryIncome = (matchedVolume * rate) / BASIS_POINTS;
            if (binaryIncome == 0) continue;

            u.carryLeft  -= matchedVolume;
            u.carryRight -= matchedVolume;

            u.claimableBinaryIncome += binaryIncome;
            emit BinaryIncomeAllocated(userAddr, binaryIncome);
            processedCount++;
        }

        emit BinaryBatchProcessed(_batchNumber, processedCount);
    }

    function claimBinaryIncome() external nonReentrant whenNotPaused onlyRegistered(msg.sender) {
        User storage u = users[msg.sender];
        require(u.status == Status.ACTIVE || u.status == Status.GRACE_PERIOD, "MLM: Not active");
        require(u.claimableBinaryIncome > 0, "MLM: Nothing to claim");

        uint256 today = block.timestamp / 1 days;
        if (u.lastBinaryResetDay < today) {
            u.todayBinaryIncome  = 0;
            u.lastBinaryResetDay = today;
        }

        uint256 cap = dailyCapping[uint256(u.userPackage)];
        uint256 remainingCap = 0;
        if (cap > u.todayBinaryIncome) {
            remainingCap = cap - u.todayBinaryIncome;
        }

        require(remainingCap > 0, "MLM: Daily cap reached");

        uint256 totalClaimable = u.claimableBinaryIncome;
        uint256 income = totalClaimable;
        uint256 flushedAmount = 0;

        if (income > remainingCap) {
            income = remainingCap;
            flushedAmount = totalClaimable - remainingCap;
        }

        u.claimableBinaryIncome = 0;
        u.todayBinaryIncome += income;
        u.totalBinaryIncome += income;

        _creditIncome(msg.sender, income);

        _userTransactions[msg.sender].push(TransactionRecord(TxType.BINARY_INCOME, income, block.timestamp, address(0), uint8(u.binaryDepth > 255 ? 255 : u.binaryDepth)));
        emit BinaryIncomeClaimed(msg.sender, income);

        if (flushedAmount > 0) {
            totalBinaryFlushed += flushedAmount;
            emit BinaryFlushed(msg.sender, flushedAmount);
            if (adminBinaryWallet != address(0)) {
                paymentToken.safeTransfer(adminBinaryWallet, flushedAmount);
            }
        }

        _distributeMatchingOverride(msg.sender, income);
    }

    function _distributeMatchingOverride(address _user, uint256 _binaryIncome) internal {
        address current = users[_user].sponsor;
        uint256 level   = 1;

        while (current != address(0) && level <= 20) {
            User storage s = users[current];

            if (s.status == Status.ACTIVE || s.status == Status.GRACE_PERIOD) {
                uint256 maxLevels = matchingOverrideMaxLevels[uint256(s.userPackage)];
                if (level <= maxLevels) {
                    uint256 income = (_binaryIncome * MATCHING_OVERRIDE_RATE) / BASIS_POINTS;
                    if (income > 0) {
                        _creditIncome(current, income);
                        s.totalMatchingOverrideIncome += income;
                        _userTransactions[current].push(TransactionRecord(TxType.MATCHING_OVERRIDE, income, block.timestamp, _user, uint8(level)));
                        emit MatchingOverrideDistributed(current, _user, income, level);
                    }
                }
            }

            current = s.sponsor;
            level++;
        }
    }

    function withdraw(uint256 _amount) external nonReentrant whenNotPaused {
        User storage u = users[msg.sender];
        require(u.status == Status.ACTIVE, "MLM: Not active");
        require(u.walletBalance >= _amount, "MLM: Insufficient balance");
        require(_amount > 0, "MLM: Amount must be > 0");
        require(_amount % (10 * 10 ** uint256(tokenDecimals)) == 0, "MLM: Amount must be a multiple of 10");

        u.walletBalance -= _amount;

        uint256 matchPool = (_amount * WITHDRAWAL_MATCH_POOL_RATE) / BASIS_POINTS;
        uint256 btcDeduction = (_amount * BTC_POOL_RATE) / BASIS_POINTS;

        uint256 adminFee = 0;
        if (withdrawalFee > 0) {
            adminFee = (_amount * withdrawalFee) / BASIS_POINTS;
        }

        uint256 payout = _amount - matchPool - btcDeduction - adminFee;

        uint256 usdtPayout = (payout * withdrawalUsdtRate) / BASIS_POINTS;
        uint256 mTokenPayout = payout - usdtPayout;

        if (usdtPayout > 0) {
            paymentToken.safeTransfer(msg.sender, usdtPayout);
        }

        if (mTokenPayout > 0) {
            require(address(mToken) != address(0), "MLM: MToken not set");
            mToken.safeTransfer(msg.sender, mTokenPayout);
        }

        if (adminFee > 0) {
            paymentToken.safeTransfer(feeRecipient, adminFee);
        }

        u.totalWithdrawn += payout;

        btcPoolBalance[msg.sender] += btcDeduction;
        emit BtcPoolCredited(msg.sender, btcDeduction);

        _distributeWithdrawalMatch(msg.sender, matchPool);

        _userTransactions[msg.sender].push(TransactionRecord(TxType.WITHDRAWAL, payout, block.timestamp, address(0), 0));
        _userTransactions[msg.sender].push(TransactionRecord(TxType.BTC_POOL_DEDUCTION, btcDeduction, block.timestamp, address(0), 0));
        _userTransactions[msg.sender].push(TransactionRecord(TxType.WITHDRAWAL_MATCH_DEDUCTION, matchPool, block.timestamp, address(0), 0));
        emit Withdrawal(msg.sender, payout, adminFee);
    }

    function _distributeWithdrawalMatch(address _user, uint256 _matchPool) internal {
        address current = users[_user].sponsor;
        uint256 level   = 1;
        uint256 totalDistributed = 0;

        while (current != address(0) && level <= 15) {
            User storage s = users[current];

            if (s.status == Status.ACTIVE || s.status == Status.GRACE_PERIOD) {
                uint256 maxLevels = withdrawalMatchMaxLevels[uint256(s.userPackage)];
                if (level <= maxLevels) {
                    uint256 rate = _getWithdrawalMatchRate(s.userPackage, level);
                    if (rate > 0) {
                        uint256 income = (_matchPool * rate) / BASIS_POINTS;
                        if (income > 0 && totalDistributed + income <= _matchPool) {
                            _creditIncome(current, income);
                            s.totalWithdrawalMatchIncome += income;
                            totalDistributed += income;
                            _userTransactions[current].push(TransactionRecord(TxType.WITHDRAWAL_MATCH, income, block.timestamp, _user, uint8(level)));
                            emit WithdrawalMatchDistributed(current, _user, income, level);
                        }
                    }
                }
            }

            current = s.sponsor;
            level++;
        }
    }

    function _getWithdrawalMatchRate(Package _pkg, uint256 _level) internal pure returns (uint256) {
        if (_pkg == Package.BASIC) {
            if (_level <= 3) return 100;
        } else if (_pkg == Package.PRO) {
            if (_level <= 4) return 100;
            if (_level == 5) return 50;
        } else if (_pkg == Package.ELITE) {
            if (_level <= 5) return 100;
            if (_level <= 9) return 50;
        } else if (_pkg == Package.STOCKIEST) {
            if (_level <= 4) return 100;
            if (_level <= 12) return 50;
        } else if (_pkg == Package.SUPER_STOCKIEST) {
            if (_level <= 5) return 500;
            if (_level <= 15) return 50;
        }
        return 0;
    }

    function enterBoardPool() external nonReentrant whenNotPaused onlyRegistered(msg.sender) {
        require(users[msg.sender].status == Status.ACTIVE || users[msg.sender].status == Status.GRACE_PERIOD, "MLM: Not active");
        
        uint256 price = boardPrices[1];
        require(btcPoolBalance[msg.sender] >= price, "MLM: Insufficient BTC pool balance");

        btcPoolBalance[msg.sender] -= price;
        boardEntryCount[msg.sender]++;
        _userTransactions[msg.sender].push(TransactionRecord(TxType.BOARD_ENTRY, price, block.timestamp, address(0), 1));
        _enterBoard(msg.sender, 1);
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
        uint256 totalPool = boardPrices[_boardLevel] * BOARD_MEMBERS_REQUIRED;

        if (_boardLevel < TOTAL_BOARDS) {
            uint256 reward    = (totalPool * BOARD_REWARD_RATE_BP) / BASIS_POINTS;
            uint256 liquidity = (totalPool * BOARD_LIQUIDITY_RATE_BP) / BASIS_POINTS;

            if (address(btcRewardToken) != address(0)) {
                btcRewardToken.safeTransfer(_owner, reward);
            }

            if (coinLiquidityAddress != address(0)) {
                paymentToken.safeTransfer(coinLiquidityAddress, liquidity);
            }

            _userTransactions[_owner].push(TransactionRecord(TxType.BOARD_REWARD, reward, block.timestamp, address(0), uint8(_boardLevel)));
            emit BoardCompleted(_owner, _boardLevel, reward, liquidity);

            _userTransactions[_owner].push(TransactionRecord(TxType.BOARD_ENTRY, boardPrices[_boardLevel + 1], block.timestamp, address(0), uint8(_boardLevel + 1)));
            _enterBoard(_owner, _boardLevel + 1);
        } else {
            uint256 reward    = (totalPool * BOARD_10_REWARD_RATE_BP) / BASIS_POINTS;
            uint256 systemFee = (totalPool * BOARD_10_SYSTEM_RATE_BP) / BASIS_POINTS;
            uint256 liquidity = (totalPool * BOARD_10_LIQUIDITY_RATE_BP) / BASIS_POINTS;

            if (address(btcRewardToken) != address(0)) {
                btcRewardToken.safeTransfer(_owner, reward);
            }

            if (systemAddress != address(0)) {
                paymentToken.safeTransfer(systemAddress, systemFee);
            }
            if (coinLiquidityAddress != address(0)) {
                paymentToken.safeTransfer(coinLiquidityAddress, liquidity);
            }

            _userTransactions[_owner].push(TransactionRecord(TxType.BOARD_REWARD, reward, block.timestamp, address(0), uint8(_boardLevel)));
            emit BoardCompleted(_owner, _boardLevel, reward, liquidity);
        }
    }

    function _creditIncome(address _user, uint256 _amount) internal {
        User storage u = users[_user];
        if (_amount == 0) return;

        uint256 maxLimit  = maxIncomeLimit[uint256(u.userPackage)];
        uint256 remaining = 0;
        if (maxLimit > u.totalEarnings) {
            remaining = maxLimit - u.totalEarnings;
        }

        if (remaining == 0) {
            _handleOverflow(u, _user, _amount);
            return;
        }

        if (_amount <= remaining) {
            u.walletBalance += _amount;
            u.totalEarnings += _amount;
        } else {
            u.walletBalance += remaining;
            u.totalEarnings += remaining;
            uint256 overflow = _amount - remaining;
            _handleOverflow(u, _user, overflow);
        }
    }

    function _handleOverflow(User storage u, address _user, uint256 _overflow) internal {
        if (u.status == Status.ACTIVE) {
            u.status           = Status.GRACE_PERIOD;
            u.gracePeriodStart = block.timestamp;
            emit GracePeriodStarted(_user, block.timestamp);
        }

        if (u.status == Status.GRACE_PERIOD) {
            u.tempWalletBalance += _overflow;
        }
    }

    function flushGracePeriod(address _user) external onlyOwner onlyRegistered(_user) {
        User storage u = users[_user];
        require(u.status == Status.GRACE_PERIOD, "MLM: Not in grace period");
        require(
            block.timestamp > u.gracePeriodStart + GRACE_PERIOD_DURATION,
            "MLM: Grace period not expired"
        );

        uint256 flushed = u.tempWalletBalance;
        u.tempWalletBalance = 0;
        u.status = Status.INACTIVE;

        emit GracePeriodExpired(_user, flushed);
    }

    function batchFlushGracePeriods(address[] calldata _users) external onlyOwner {
        for (uint256 i = 0; i < _users.length; i++) {
            address user = _users[i];
            if (!isRegistered[user]) continue;

            User storage u = users[user];
            if (u.status != Status.GRACE_PERIOD) continue;
            if (block.timestamp <= u.gracePeriodStart + GRACE_PERIOD_DURATION) continue;

            uint256 flushed = u.tempWalletBalance;
            u.tempWalletBalance = 0;
            u.status = Status.INACTIVE;

            emit GracePeriodExpired(user, flushed);
        }
    }

    function getUserInfo(address _user) external view returns (
        uint256 userId,
        address sponsor,
        address binaryParent,
        address leftChild,
        address rightChild,
        Side    placementSide,
        Package userPackage,
        Status  status,
        uint256 walletBalance,
        uint256 tempWalletBalance,
        uint256 totalEarnings,
        uint256 directReferralCount,
        uint256 joinedAt
    ) {
        User storage u = users[_user];
        return (
            u.userId,
            u.sponsor,
            u.binaryParent,
            u.leftChild,
            u.rightChild,
            u.placementSide,
            u.userPackage,
            u.status,
            u.walletBalance,
            u.tempWalletBalance,
            u.totalEarnings,
            u.directReferralCount,
            u.joinedAt
        );
    }

    function getProfile(address _user) external view returns (
        string memory displayName,
        string memory email,
        string memory phone,
        string memory country,
        bool   profileSet
    ) {
        User storage u = users[_user];
        return (
            u.displayName,
            u.email,
            u.phone,
            u.country,
            u.profileSet
        );
    }

    function getIncomeInfo(address _user) external view returns (
        uint256 totalDirectIncome,
        uint256 totalBinaryIncome,
        uint256 totalMatchingOverrideIncome,
        uint256 totalWithdrawalMatchIncome,
        uint256 totalEarnings,
        uint256 totalWithdrawn,
        uint256 maxIncome
    ) {
        User storage u = users[_user];
        return (
            u.totalDirectIncome,
            u.totalBinaryIncome,
            u.totalMatchingOverrideIncome,
            u.totalWithdrawalMatchIncome,
            u.totalEarnings,
            u.totalWithdrawn,
            maxIncomeLimit[uint256(u.userPackage)]
        );
    }

    function getBinaryInfo(address _user) external view returns (
        uint256 leftBusiness,
        uint256 rightBusiness,
        uint256 carryLeft,
        uint256 carryRight,
        uint256 todayBinaryIncome,
        uint256 dailyCap,
        uint256 claimableBinaryIncome,
        uint256 binaryDepth
    ) {
        User storage u = users[_user];
        return (
            u.leftBusiness,
            u.rightBusiness,
            u.carryLeft,
            u.carryRight,
            u.todayBinaryIncome,
            dailyCapping[uint256(u.userPackage)],
            u.claimableBinaryIncome,
            u.binaryDepth
        );
    }

    function getUserIdByAddress(address _user) external view returns (uint256) {
        require(isRegistered[_user], "MLM: Not registered");
        return users[_user].userId;
    }

    function getAddressByUserId(uint256 _userId) external view returns (address) {
        address addr = userIdToAddress[_userId];
        require(addr != address(0), "MLM: User ID not found");
        return addr;
    }

    function getDirectReferrals(address _user) external view returns (address[] memory) {
        return directReferrals[_user];
    }

    function getDirectReferralsPaginated(
        address _user,
        uint256 _offset,
        uint256 _limit
    ) external view returns (address[] memory referrals, uint256 total) {
        address[] storage refs = directReferrals[_user];
        total = refs.length;

        if (_offset >= total) {
            return (new address[](0), total);
        }

        uint256 end = _offset + _limit;
        if (end > total) end = total;
        uint256 count = end - _offset;

        referrals = new address[](count);
        for (uint256 i = 0; i < count; i++) {
            referrals[i] = refs[_offset + i];
        }
    }

    function getMaxIncomeLimit(Package _pkg) external view returns (uint256) {
        return maxIncomeLimit[uint256(_pkg)];
    }

    function getPackagePrice(Package _pkg) external view returns (uint256) {
        return packagePrices[uint256(_pkg)];
    }

    function getTotalUsers() external view returns (uint256) {
        return allUsers.length;
    }

    function getUserByIndex(uint256 _index) external view returns (address) {
        require(_index < allUsers.length, "MLM: Index out of bounds");
        return allUsers[_index];
    }

    function getContractBalance() external view returns (uint256) {
        return paymentToken.balanceOf(address(this));
    }

    function getBtcPoolBalance(address _user) external view returns (uint256) {
        return btcPoolBalance[_user];
    }

    function getBoardPrice(uint256 _boardLevel) external view returns (uint256) {
        require(_boardLevel >= 1 && _boardLevel <= TOTAL_BOARDS, "MLM: Invalid board level");
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
        require(_index < _boardMatrices[_boardLevel].length, "MLM: Index out of bounds");
        BoardMatrix storage m = _boardMatrices[_boardLevel][_index];
        return (m.owner, m.filledCount, m.completed);
    }

    function getBoardCurrentIndex(uint256 _boardLevel) external view returns (uint256) {
        return boardCurrentIndex[_boardLevel];
    }

    function getUserTransactionCount(address _user) external view returns (uint256) {
        return _userTransactions[_user].length;
    }

    function getUserTransactionsPaginated(
        address _user,
        uint256 _offset,
        uint256 _limit
    ) external view returns (
        TxType[]  memory txTypes,
        uint256[] memory amounts,
        uint256[] memory timestamps,
        address[] memory relatedUsers,
        uint8[]   memory extraDatas,
        uint256   total
    ) {
        TransactionRecord[] storage txs = _userTransactions[_user];
        total = txs.length;

        if (_offset >= total) {
            return (new TxType[](0), new uint256[](0), new uint256[](0), new address[](0), new uint8[](0), total);
        }

        uint256 end = _offset + _limit;
        if (end > total) end = total;
        uint256 count = end - _offset;

        txTypes      = new TxType[](count);
        amounts      = new uint256[](count);
        timestamps   = new uint256[](count);
        relatedUsers = new address[](count);
        extraDatas   = new uint8[](count);

        for (uint256 i = 0; i < count; i++) {
            uint256 idx = total - 1 - (_offset + i);
            TransactionRecord storage t = txs[idx];
            txTypes[i]      = t.txType;
            amounts[i]      = t.amount;
            timestamps[i]   = t.timestamp;
            relatedUsers[i] = t.relatedUser;
            extraDatas[i]   = t.extraData;
        }
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setFeeRecipient(address _newRecipient) external onlyOwner {
        require(_newRecipient != address(0), "MLM: Invalid address");
        address old = feeRecipient;
        feeRecipient = _newRecipient;
        emit FeeRecipientUpdated(old, _newRecipient);
    }

    function setProductWallet(address _wallet) external onlyOwner {
        require(_wallet != address(0), "MLM: Invalid address");
        address old = productWallet;
        productWallet = _wallet;
        emit ProductWalletUpdated(old, _wallet);
    }

    function setAdminBinaryWallet(address _wallet) external onlyOwner {
        require(_wallet != address(0), "MLM: Invalid address");
        address old = adminBinaryWallet;
        adminBinaryWallet = _wallet;
        emit AdminBinaryWalletUpdated(old, _wallet);
    }

    function setWithdrawalFee(uint256 _feeBasisPoints) external onlyOwner {
        require(_feeBasisPoints <= 2000, "MLM: Fee too high");
        uint256 oldFee = withdrawalFee;
        withdrawalFee = _feeBasisPoints;
        emit WithdrawalFeeUpdated(oldFee, _feeBasisPoints);
    }

    function setPackagePrice(Package _pkg, uint256 _price) external onlyOwner {
        require(_pkg >= Package.BASIC && _pkg <= Package.SUPER_STOCKIEST, "MLM: Invalid package");
        uint256 oldPrice = packagePrices[uint256(_pkg)];
        packagePrices[uint256(_pkg)] = _price;
        emit PackagePriceUpdated(_pkg, oldPrice, _price);
    }

    function setDailyCapping(Package _pkg, uint256 _cap) external onlyOwner {
        require(_pkg >= Package.BASIC && _pkg <= Package.SUPER_STOCKIEST, "MLM: Invalid package");
        uint256 oldCap = dailyCapping[uint256(_pkg)];
        dailyCapping[uint256(_pkg)] = _cap;
        emit DailyCappingUpdated(_pkg, oldCap, _cap);
    }

    function setMaxIncomeLimit(Package _pkg, uint256 _limit) external onlyOwner {
        require(_pkg >= Package.BASIC && _pkg <= Package.SUPER_STOCKIEST, "MLM: Invalid package");
        uint256 oldLimit = maxIncomeLimit[uint256(_pkg)];
        maxIncomeLimit[uint256(_pkg)] = _limit;
        emit MaxIncomeLimitUpdated(_pkg, oldLimit, _limit);
    }

    function updatePaymentToken(address _token, uint8 _decimals) external onlyOwner {
        require(_token != address(0), "MLM: Invalid token");
        address oldToken = address(paymentToken);
        paymentToken  = IERC20(_token);
        tokenDecimals = _decimals;
        emit PaymentTokenUpdated(oldToken, _token);
    }

    function withdrawContractFunds(address _to, uint256 _amount) external onlyOwner {
        require(_to != address(0), "MLM: Invalid address");
        paymentToken.safeTransfer(_to, _amount);
        emit ContractFundsWithdrawn(_to, _amount);
    }

    function recoverToken(
        address _token,
        address _to,
        uint256 _amount
    ) external onlyOwner {
        require(_to != address(0), "MLM: Invalid address");
        IERC20(_token).safeTransfer(_to, _amount);
        emit EmergencyTokenRecovery(_token, _to, _amount);
    }

    function setCoinLiquidityAddress(address _addr) external onlyOwner {
        require(_addr != address(0), "MLM: Invalid address");
        address old = coinLiquidityAddress;
        coinLiquidityAddress = _addr;
        emit CoinLiquidityAddressUpdated(old, _addr);
    }

    function setSystemAddress(address _addr) external onlyOwner {
        require(_addr != address(0), "MLM: Invalid address");
        address old = systemAddress;
        systemAddress = _addr;
        emit SystemAddressUpdated(old, _addr);
    }

    function setBoardPrice(uint256 _boardLevel, uint256 _price) external onlyOwner {
        require(_boardLevel >= 1 && _boardLevel <= TOTAL_BOARDS, "MLM: Invalid board level");
        require(_price > 0, "MLM: Price must be > 0");
        boardPrices[_boardLevel] = _price;
    }

    function setBtcRewardToken(address _token) external onlyOwner {
        require(_token != address(0), "MLM: Invalid address");
        btcRewardToken = IERC20(_token);
    }

    function setBinaryProcessor(address _processor, bool _status) external onlyOwner {
        require(_processor != address(0), "MLM: Invalid address");
        isBinaryProcessor[_processor] = _status;
        emit BinaryProcessorUpdated(_processor, _status);
    }

    function setBinaryBatchSize(uint256 _size) external onlyOwner {
        require(_size > 0 && _size <= 500, "MLM: Batch size 1-500");
        uint256 oldSize = binaryBatchSize;
        binaryBatchSize = _size;
        emit BinaryBatchSizeUpdated(oldSize, _size);
    }

    function getTotalBatches() external view returns (uint256) {
        if (allUsers.length == 0) return 0;
        return (allUsers.length + binaryBatchSize - 1) / binaryBatchSize;
    }

    function adminActivateUser(
        address _user,
        uint256 _sponsorId,
        uint256 _binaryParentId,
        bool    _placeLeft,
        Package _pkg
    ) external onlyOwner whenNotPaused {
        require(_user != address(0), "MLM: Invalid address");
        require(!isRegistered[_user], "MLM: Already registered");
        require(_pkg >= Package.BASIC && _pkg <= Package.SUPER_STOCKIEST, "MLM: Invalid package");
        require(allUsers.length > 0, "MLM: No root user");

        address _sponsor = userIdToAddress[_sponsorId];
        require(_sponsor != address(0) && isRegistered[_sponsor], "MLM: Invalid sponsor ID");

        address _binaryParent;
        Side side;

        if (_binaryParentId == 0) {
            _binaryParent = _sponsor;
        } else {
            _binaryParent = userIdToAddress[_binaryParentId];
            require(_binaryParent != address(0) && isRegistered[_binaryParent], "MLM: Invalid binary parent ID");
        }

        if (_placeLeft) {
            _binaryParent = _findDeepestAvailable(_binaryParent, true);
            side = Side.LEFT;
        } else {
            _binaryParent = _findDeepestAvailable(_binaryParent, false);
            side = Side.RIGHT;
        }

        uint256 newUserId = _generateUserId();
        userIdTaken[newUserId]     = true;
        userIdToAddress[newUserId] = _user;

        User storage u = users[_user];
        u.userId        = newUserId;
        u.sponsor       = _sponsor;
        u.binaryParent  = _binaryParent;
        u.placementSide = side;
        u.userPackage   = _pkg;
        u.status        = Status.ACTIVE;
        u.joinedAt      = block.timestamp;
        u.binaryDepth   = users[_binaryParent].binaryDepth + 1;

        if (side == Side.LEFT) {
            users[_binaryParent].leftChild = _user;
        } else {
            users[_binaryParent].rightChild = _user;
        }

        directReferrals[_sponsor].push(_user);
        users[_sponsor].directReferralCount++;

        isRegistered[_user] = true;
        isFreeAccount[_user] = true;
        allUsers.push(_user);

        emit UserRegistered(_user, newUserId, _sponsor, _binaryParent, side);
        emit FreeAccountActivated(_user, newUserId, _pkg, _sponsor);
    }

    function setMToken(address _token) external onlyOwner {
        require(_token != address(0), "MLM: Invalid address");
        address old = address(mToken);
        mToken = IERC20(_token);
        emit MTokenUpdated(old, _token);
    }

    function setWithdrawalUsdtRate(uint256 _rateBasisPoints) external onlyOwner {
        require(_rateBasisPoints <= BASIS_POINTS, "MLM: Rate exceeds 100%");
        uint256 oldRate = withdrawalUsdtRate;
        withdrawalUsdtRate = _rateBasisPoints;
        emit WithdrawalUsdtRateUpdated(oldRate, _rateBasisPoints);
    }
}
