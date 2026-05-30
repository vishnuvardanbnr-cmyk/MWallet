---
name: MvaultView deployment
description: How to redeploy MvaultView when the main contract address changes, and MChain-specific CREATE address quirk
---

## Rule

MvaultView is an **immutable** contract — its `mvault` pointer is set at deploy time and cannot be changed. When MvaultContract is redeployed, MvaultView MUST be redeployed too.

**Current live addresses (as of 2026-05-30):**
- MvaultContract: `0x60c5bd746f6245ecE5daC006082a7bd13f521aF8`
- MvaultView: `0x1324CE45d2c043760bEe056c534c94386B1BEFEE` (points to above)

## MChain CREATE address quirk

`ethers.getCreateAddress({ from, nonce })` gives the **wrong** address on MChain. Always use `receipt.contractAddress` from the transaction receipt — that is the authoritative deployed address.

## How to redeploy

Use `scripts/deploy-mvault-view.cjs` with `VITE_BSC_NETWORK=mchain`. The script uses raw `eth_sendRawTransaction` (standard `factory.deploy()` crashes on MChain due to bech32 miner field).

After deploy:
1. Update `VITE_MVAULT_VIEW_ADDRESS` in VPS `.env`
2. Rebuild frontend with new address
3. Deploy build to VPS + restart pm2

## Smoke-test check
```
getMvaultAddress() === MvaultContract address  // confirms correct wiring
getAllUsersCount() > 0                          // confirms live data
getRankBatch([addr])                            // confirms rank reads work
```

**Why:** The old MvaultView at `0xeae33B0EF77B8eA51B866DFD923117dBbD5cAF9d` was pointing to `0x9e71d588...` (an old contract). Every VIEW call reverted with "could not decode result data" — which surfaced as the 500 rank check error.
