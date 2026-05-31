---
name: Contract size limit on MChain
description: How MChain enforces EIP-170 and what failure looks like
---

MChain (Chain ID 1888) **does** enforce the EIP-170 24,576-byte limit.

**How the failure appears:** `gasUsed = 0` and `status = 0` in the deploy receipt. There is NO revert reason string — it looks like a silent failure. This is NOT a gas issue.

**Fix:** Reduce contract size with `viaIR: true, runs: 1` in solc optimizer (already set in hardhat.config.cjs), and remove view-only functions by moving them to a separate read-only helper contract (MvaultView.sol).

**Why:** MChain's EVM silently rejects oversized bytecode at the protocol level before execution.

**How to apply:** If a deploy results in gasUsed=0 + status=0, check compiled bytecode size with `npx hardhat compile --show-stack-traces` and ensure it stays below 24,576 bytes.
