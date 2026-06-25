---
name: MvaultView deployment
description: Current contract addresses after full redeploy June 2026, and env-var bypass pattern needed in distributor.ts
---

## Current addresses (MChain, Chain ID 1888) — redeployed June 25, 2026
- **MvaultContract**: `0xbae14a18af7a70280e97e040963477f7d3c6130e`
- **MVT Token**: `0x21897fbdc48468f55c9bb7fd9ea5f8e0083adc00`
- **Board Matrix**: `0xa775d77b21915f32c7240cf613c51349e71f2c11`
- **MvaultStaking**: `0xfc2c10c5f2f5c2d66c35d5659aed37e6b9e7bebf`
- **MvaultView**: `0x7e98aa3bc71add93897535564cbf68deeaf3319b`
- **USDT (MChain)**: `0x7b2ed1be97fa240dbd0328dd307e35e588bcb917` (unchanged)

## The env-var override problem
`process.env.VITE_MVAULT_VIEW_ADDRESS || "hardcoded_fallback"` does NOT work when the env var IS set (even to a wrong/stale value). The `||` pattern only provides a fallback when the var is absent.

**Why:** The VPS `.env` file was updated but systemd may cache env vars at process start. Hardcoding bypasses this entirely for immutable contract addresses.

## Board Matrix v2 — adminSkipEntry
The new Board Matrix contract includes `adminSkipEntry(uint256 level, uint256 index)` and `getActiveQueueCount(uint256 level)`. Ghost-activated users should NOT be manually added to the board queue via `enterBoard` — it bypasses the activation flow and pollutes the count. `adminSkipEntry` can clean up any accidental entries.
