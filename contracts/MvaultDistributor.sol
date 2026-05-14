// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

// ─────────────────────────────────────────────
// Minimal interface — only the callbacks we need
// ─────────────────────────────────────────────
interface IMvaultMain {
    function distributor_lockPool()                                                                  external returns (uint256 pool);
    function distributor_creditUser(address user, uint256 mvtAmount, uint256 newMatchedVol, uint256 newPowerLegPts) external;
}

/**
 * @title  MvaultDistributor
 * @notice Trustless Merkle-proof binary / power-leg distribution for M-Vault.
 *
 *         Flow:
 *           1. Admin computes shares off-chain, builds a Merkle tree
 *              where each leaf encodes (cycle, user, binaryShare, powerLegShare,
 *              newMatchedVol, newPowerLegPts).
 *           2. Admin calls commitDistribution(root, totalPool) — locks only the
 *              NEW pool for this cycle from MvaultContract.binaryPool.
 *           3. Each user calls claimDistribution(..., proof) at ANY time — no expiry.
 *              The contract verifies the proof and credits their MVT balance.
 *
 *         Carry-forward design:
 *           • If a user skips claiming cycle N, cycle N+1 naturally includes their
 *             unclaimed pairs because matchedVolume on-chain is only updated on claim.
 *           • Each cycle is independently claimable; there is no expiry.
 *           • Users can claim multiple cycles back-to-back without restriction.
 *
 *         Security guarantees:
 *           • Admin CANNOT alter individual payouts once the root is committed.
 *           • Total distributed can NEVER exceed the committed pool (on-chain sum check).
 *           • Users verify their own allocation independently via the Merkle proof.
 *           • No double-claiming: hasClaimed[cycle][address] flag.
 */
contract MvaultDistributor is Ownable, ReentrancyGuard {

    IMvaultMain public mvault;

    uint256 public currentCycle;

    struct Distribution {
        bytes32 root;
        uint256 totalPool;      // MVT locked this cycle — upper bound for all claims in this cycle
        uint256 claimedTotal;   // running sum of claimed amounts (≤ totalPool always)
        uint256 committedAt;    // block.timestamp when committed (informational)
    }

    mapping(uint256 => Distribution)              public distributions;
    mapping(uint256 => mapping(address => bool))  public hasClaimed;

    // ── Errors ────────────────────────────────────────────────────────────────
    error AlreadyClaimed();
    error InvalidProof();
    error MvaultNotSet();
    error ZeroRoot();
    error ZeroPool();
    error PoolMismatch();

    // ── Events ────────────────────────────────────────────────────────────────
    event DistributionCommitted(uint256 indexed cycle, bytes32 root, uint256 totalPool);
    event DistributionClaimed(address indexed user, uint256 indexed cycle, uint256 mvtAmount);
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
     *         Locks the FULL current binaryPool from MvaultContract into this cycle.
     *         `totalPool` must equal the declared sum of all leaf (binaryShare + powerLegShare)
     *         for NEW income this cycle. Any pool excess (rounding dust) stays in the locked
     *         balance to cover future cycles.
     *
     * @param root       Merkle root (StandardMerkleTree, double-keccak leaf encoding)
     * @param totalPool  Sum of all (binaryShare + powerLegShare) in the tree for this cycle
     */
    function commitDistribution(bytes32 root, uint256 totalPool) external onlyOwner {
        if (root      == bytes32(0)) revert ZeroRoot();
        if (totalPool == 0)          revert ZeroPool();

        // Drain binaryPool from MvaultContract
        uint256 locked = mvault.distributor_lockPool();
        if (locked < totalPool) revert PoolMismatch();

        currentCycle++;
        distributions[currentCycle] = Distribution({
            root:         root,
            totalPool:    locked,   // store full locked amount (≥ totalPool, dust stays in contract)
            claimedTotal: 0,
            committedAt:  block.timestamp
        });

        emit DistributionCommitted(currentCycle, root, totalPool);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CLAIM (users — at ANY time, no expiry)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Claim your binary + power-leg income for a given cycle.
     *         Can be called at any time — there is no expiry or time limit.
     *
     *         Caller must supply the exact values from the Merkle tree leaf
     *         (available from backend API: GET /api/distribution/proofs/:address).
     *
     * @param cycle          Distribution cycle number
     * @param binaryShare    Caller's binary income share (MVT wei)
     * @param powerLegShare  Caller's power-leg share (MVT wei)
     * @param newMatchedVol  Caller's updated matched-volume watermark after this cycle
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

        // On-chain safety: cumulative claims can never exceed this cycle's locked pool
        uint256 total = binaryShare + powerLegShare;
        d.claimedTotal += total;
        require(d.claimedTotal <= d.totalPool, "Exceeds pool");

        hasClaimed[cycle][msg.sender] = true;

        // Credit user's MVT balance and update binary watermark in MvaultContract
        mvault.distributor_creditUser(msg.sender, total, newMatchedVol, newPowerLegPts);

        emit DistributionClaimed(msg.sender, cycle, total);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // VIEW
    // ─────────────────────────────────────────────────────────────────────────

    function getDistribution(uint256 cycle) external view returns (
        bytes32 root, uint256 totalPool, uint256 claimedTotal, uint256 committedAt
    ) {
        Distribution storage d = distributions[cycle];
        return (d.root, d.totalPool, d.claimedTotal, d.committedAt);
    }
}
