---
name: Rank check architecture
description: How M1-M5 rank qualification works (off-chain check + on-chain setUserRanks)
---

## Architecture

- Rank eligibility is checked **off-chain** by the server (distributor.ts runRankCheck)
- On-chain: `setUserRanks(address[], uint8[])` called by owner/deployer wallet
- `manager()` returns 0x0 on-chain — owner (deployer) must call setUserRanks
- Uses MvaultView.getRankBatch() for efficient batch reads
- Uses MvaultView.getUserSlice() to enumerate all users

## Eligibility Criteria (MIN_COUNTS = [0,0,2,4,4,4])
- M1: directCount >= 5, teamSalesUsdt >= 2000 USDT, leftSubVolume > 0, rightSubVolume > 0
- M2: 2+ M1-ranked users in downline
- M3: 4+ M2-ranked users in downline
- M4: 4+ M3-ranked users in downline
- M5: 4+ M4-ranked users in downline

## What was broken (and fixed)
- distributor.ts runRankCheck() was a no-op stub → implemented properly
- /api/rank/claim used BSC testnet RPC → fixed to MCHAIN_RPC
- /api/activation/notify used BSC testnet RPC → fixed to MCHAIN_RPC
- /api/admin/pool-status used BSC testnet RPC → fixed to MCHAIN_RPC
- MIN_COUNTS had only 5 elements (M5 check was undefined) → fixed to length 6

**How to apply:** Any new server route reading on-chain data must use MCHAIN_RPC constant defined at top of routes.ts.
