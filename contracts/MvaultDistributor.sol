// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

// ─────────────────────────────────────────────
// Minimal interface — only the callbacks we need
// ─────────────────────────────────────────────
interface IMvaultMain {
    function distributor_lockPool()                                                  external returns (uint256 pool);
    function distributor_creditUser(address user, uint256 mvtAmount, uint256 newMatchedVol, uint256 newPowerLegPts) external;
    function distributor_returnToAdmin(uint256 amount)                               external;
}

/**
 * @title  MvaultDistributor
 * @notice Trustless Merkle-proof binary / power-leg distribution for M-Vault.
 *
 *         Flow:
 *           1. Admin computes shares off-chain, builds a Merkle tree
 *              where each leaf encodes (cycle, user, binaryShare, powerLegShare,
 *              newMatchedVol, newPowerLegPts).
 *           2. Admin calls commitDistribution(root, totalPool) — locks the pool.
 *           3. Each user calls claimDistribution(..., proof) at their own time.
 *              The contract verifies the proof and credits their MVT balance.
 *           4. After CLAIM_WINDOW (60 days), admin can reclaim any unclaimed pool.
 *
 *         Security guarantees:
 *           • Admin CANNOT alter individual payouts once the root is committed.
 *           • Total distributed can NEVER exceed the committed pool (on-chain sum check).
 *           • Users verify their own allocation independently via the Merkle proof.
 *           • No double-claiming: hasClaimed[cycle][address] flag.
 */
contract MvaultDistributor is Ownable, ReentrancyGuard {

    IMvaultMain public mvault;

    uint256 public constant CLAIM_WINDOW = 60 days;

    uint256 public currentCycle;

    struct Distribution {
        bytes32 root;
        uint256 totalPool;      // MVT committed — on-chain upper bound for all claims
        uint256 claimedTotal;   // running sum of claimed amounts (≤ totalPool always)
        uint256 committedAt;
        bool    reclaimed;
    }

    mapping(uint256 => Distribution)              public distributions;
    mapping(uint256 => mapping(address => bool))  public hasClaimed;

    // ── Errors ────────────────────────────────────────────────────────────────
    error AlreadyClaimed();
    error InvalidProof();
    error NothingToReclaim();
    error ClaimWindowOpen();
    error MvaultNotSet();
    error ZeroRoot();
    error ZeroPool();
    error PoolMismatch();

    // ── Events ────────────────────────────────────────────────────────────────
    event DistributionCommitted(uint256 indexed cycle, bytes32 root, uint256 totalPool);
    event DistributionClaimed(address indexed user, uint256 indexed cycle, uint256 mvtAmount);
    event DistributionReclaimed(uint256 indexed cycle, uint256 unclaimed);
    event MvaultUpdated(address newMvault);

    // ─────────────────────────────────────────────────────────────────────────
    constructor(address _mvault) Ownable(msg.sender) {
        if (_mvault == address(0)) revert MvaultNotSet();
        mvault = IMvaultMain(_mvault);
    }

    function setMvault(address _mvault) external onlyOwner {
        if (_mvault == address(0)) revert MvaultNotSet();
        mvault = IMvaultMain(_mvault);
        emit MvaultUpdated(_mvault);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // COMMIT (admin — once per distribution cycle)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Commit a new distribution cycle.
     *         Locks the binary pool from MvaultContract into this cycle.
     *         `totalPool` must equal the declared sum of all leaf (binaryShare + powerLegShare).
     *         The contract verifies that the pool it drains is ≥ totalPool.
     *
     * @param root       Merkle root (StandardMerkleTree, double-keccak leaf encoding)
     * @param totalPool  Sum of all (binaryShare + powerLegShare) in the tree
     */
    function commitDistribution(bytes32 root, uint256 totalPool) external onlyOwner {
        if (root      == bytes32(0)) revert ZeroRoot();
        if (totalPool == 0)          revert ZeroPool();

        // Drain binaryPool from MvaultContract
        uint256 locked = mvault.distributor_lockPool();
        if (locked < totalPool) revert PoolMismatch();

        // Return any excess (rounding dust) back to adminPool
        if (locked > totalPool) {
            mvault.distributor_returnToAdmin(locked - totalPool);
        }

        currentCycle++;
        distributions[currentCycle] = Distribution({
            root:         root,
            totalPool:    totalPool,
            claimedTotal: 0,
            committedAt:  block.timestamp,
            reclaimed:    false
        });

        emit DistributionCommitted(currentCycle, root, totalPool);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CLAIM (users — at any time within CLAIM_WINDOW)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Claim your binary + power-leg income for a given cycle.
     *
     *         Caller must supply the exact values from the Merkle tree leaf
     *         (available from the backend API: GET /api/distribution/proof/:address).
     *         The contract verifies the proof against the committed root —
     *         no trust in admin execution required.
     *
     * @param cycle          Distribution cycle number
     * @param binaryShare    Caller's binary income share (MVT wei)
     * @param powerLegShare  Caller's power-leg share (MVT wei)
     * @param newMatchedVol  Caller's updated matched-volume watermark (USDT wei)
     * @param newPowerLegPts Caller's updated power-leg points after this cycle
     * @param proof          Merkle proof (array of bytes32 siblings)
     */
    function claimDistribution(
        uint256   cycle,
        uint256   binaryShare,
        uint256   powerLegShare,
        uint256   newMatchedVol,
        uint256   newPowerLegPts,
        bytes32[] calldata proof
    ) external nonReentrant {
        if (hasClaimed[cycle][msg.sender]) revert AlreadyClaimed();

        Distribution storage d = distributions[cycle];

        // Reconstruct leaf using the same encoding as StandardMerkleTree.of()
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(
            cycle, msg.sender, binaryShare, powerLegShare, newMatchedVol, newPowerLegPts
        ))));

        if (!MerkleProof.verify(proof, d.root, leaf)) revert InvalidProof();

        // On-chain safety: cumulative claims can never exceed committed pool
        uint256 total = binaryShare + powerLegShare;
        d.claimedTotal += total;
        require(d.claimedTotal <= d.totalPool, "Exceeds pool");

        hasClaimed[cycle][msg.sender] = true;

        // Credit user's MVT balance and update binary state in MvaultContract
        mvault.distributor_creditUser(msg.sender, total, newMatchedVol, newPowerLegPts);

        emit DistributionClaimed(msg.sender, cycle, total);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // RECLAIM EXPIRED (admin — after CLAIM_WINDOW)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Reclaim unclaimed pool back to adminPool after 60 days.
     *         This prevents locked MVT from being stranded indefinitely.
     */
    function reclaimExpired(uint256 cycle) external onlyOwner {
        Distribution storage d = distributions[cycle];
        if (d.root == bytes32(0))                          revert NothingToReclaim();
        if (d.reclaimed)                                   revert NothingToReclaim();
        if (block.timestamp < d.committedAt + CLAIM_WINDOW) revert ClaimWindowOpen();

        uint256 unclaimed = d.totalPool - d.claimedTotal;
        if (unclaimed == 0) revert NothingToReclaim();

        d.reclaimed = true;
        mvault.distributor_returnToAdmin(unclaimed);

        emit DistributionReclaimed(cycle, unclaimed);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // VIEW
    // ─────────────────────────────────────────────────────────────────────────

    function getDistribution(uint256 cycle) external view returns (
        bytes32 root, uint256 totalPool, uint256 claimedTotal, uint256 committedAt, bool reclaimed
    ) {
        Distribution storage d = distributions[cycle];
        return (d.root, d.totalPool, d.claimedTotal, d.committedAt, d.reclaimed);
    }
}
