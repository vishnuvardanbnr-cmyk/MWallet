---
name: MvaultView deployment
description: Current MvaultView address, why it was redeployed, and the env-var bypass pattern needed in distributor.ts
---

## Current addresses (MChain, Chain ID 1888)
- **MvaultView**: `0x1324CE45d2c043760bEe056c534c94386B1BEFEE` (deployed May 2026)
- **MvaultContract main**: `0x60c5bd746f6245ecE5daC006082a7bd13f521aF8`

## Why redeployed
The old MvaultView (`0xeae33B0EF77B8eA51B866DFD923117dBbD5cAF9d`) was pointing at a dead/wrong main contract (`0x9e71d588...`). All VIEW calls reverted → "could not decode result data" in the rank check.

## The env-var override problem
`process.env.VITE_MVAULT_VIEW_ADDRESS || "hardcoded_fallback"` does NOT work when the env var IS set (even to a wrong/stale value). The `||` pattern only provides a fallback when the var is absent.

**Fix**: In `server/distributor.ts`, the VIEW and MAIN addresses are hardcoded directly (no env var lookup) because PM2 may cache the old address indefinitely:
```ts
const MAIN = "0x60c5bd746f6245ecE5daC006082a7bd13f521aF8";
const VIEW = "0x1324CE45d2c043760bEe056c534c94386B1BEFEE";
```

**Why:** The VPS `.env` file was updated but PM2 caches env vars at process start and doesn't reload from `.env` unless `--update-env` is passed AND the process actually restarts (which kept failing due to EADDRINUSE). Hardcoding bypasses this entirely for immutable contract addresses.

## MvaultView ABI (confirmed working)
```ts
const VIEW_ABI = [
  "function getAllUsersCount() view returns (uint256)",
  "function getUserSlice(uint256 offset, uint256 limit) view returns (address[])",
  "function getRankBatch(address[] calldata addrs) view returns (tuple(bool isActive, uint8 rank, address sponsor, uint256 directCount, uint256 teamSalesUsdt, uint256 leftSubVolume, uint256 rightSubVolume)[])",
];
```
