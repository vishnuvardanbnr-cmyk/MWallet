---
name: MChain periodic contract wipe
description: MChain 1888 test network periodically resets state, wiping deployed contracts
---

## Observation
Previously deployed contracts (verified on-chain) later return `eth_getCode = 0x` (no bytecode). The chain continues producing blocks and accepts new txs, but all previously deployed contract state is gone.

**Why:** MChain (1888) is a test network that appears to periodically reset or wipe state. This is not a one-off reorg — it's a systematic wipe.

## Symptoms
- `users()` returns `0x` (could not decode result data)
- Frontend shows "Members: 0" even though users previously registered
- `eth_getCode` for all previously deployed addresses returns `0x`

## Fix
Redeploy all contracts using `node scripts/deploy-raw-mchain.cjs` followed by `node scripts/deploy-mchain-view.cjs`. Then rebuild and redeploy to VPS with new addresses via the SSH key pattern.

## How to apply
- Before debugging any "contract returns 0x" error, first check `eth_getCode` on the main contract address
- If it returns `0x`, assume a chain wipe and redeploy everything fresh
- Always run `eth_getCode` verification at end of deploy script (already done in deploy-raw-mchain.cjs)
