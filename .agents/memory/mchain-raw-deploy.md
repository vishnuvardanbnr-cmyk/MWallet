---
name: MChain raw deployment pattern
description: Why hardhat deployments silently fail on MChain and how to deploy correctly
---

## Problem
Hardhat deployments on MChain (1888) silently fail — the script reports success and prints addresses, but `eth_getCode` at those addresses returns `0x` (no bytecode). The contracts were never actually created.

**Root cause:** MChain skips nonces on internal transactions. Hardhat uses sequential nonces (N, N+1, N+2...) derived from the initial nonce. By the time the second tx is sent, the nonce may have been incremented internally by MChain, causing the tx to be silently dropped or included as a no-op.

## Symptoms
- Deploy script prints "✓ Contract deployed: 0x..." but `eth_getCode` returns `0x`
- Contract balance shows tiny gas cost (e.g. 0.000252 MxC for 4 contracts) — impossibly small
- `users()` or any call to the address returns `0x`

## Fix
Use `scripts/deploy-raw-mchain.cjs` — a raw JSON-RPC deploy script that:
1. Queries `eth_getTransactionCount` fresh before every tx
2. Uses `eth_estimateGas` for gas limit
3. Signs and broadcasts manually via `eth_sendRawTransaction`
4. Waits for receipt and verifies `status === "0x1"` + `contractAddress` is set
5. Runs `eth_getCode` at the end to confirm bytecode exists

**Why:** Fresh nonce per tx avoids the stale-nonce issue. This is the same pattern that works in `deploy-mchain-view.cjs`.

## How to apply
Always use `node scripts/deploy-raw-mchain.cjs` (not `npx hardhat run scripts/...`) for full MChain deploys.
After deploy, verify with `eth_getCode` before updating frontend addresses.
