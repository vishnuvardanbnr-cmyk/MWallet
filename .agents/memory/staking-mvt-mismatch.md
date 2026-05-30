---
name: Staking module MVT token mismatch
description: MvaultStaking.mvaultToken is immutable — wrong address at deploy time requires full redeploy + re-link.
---

## Rule
When staking consistently reverts on-chain despite correct USDT allowance and balance, check `STAKING.mvaultToken()` against the live MVT token address. A mismatch means every stake fails inside `addLiquidityAndMint`.

## Why
`mvaultToken` in MvaultStaking is declared `public immutable` — there is no setter. If the wrong MVT address is passed to the constructor (e.g., old testnet address), all stake calls reach `mvaultToken.addLiquidityAndMint()` on a dead/wrong contract, causing a silent revert (MChain returns 0x for eth_call replay so the error is invisible from the frontend).

## How to apply
1. Batch-query contract links: `stakingModule()`, `mvaultToken()`, `mvaultMain()`, `mvaultContract()` using raw `eth_call` with the correct selectors (compute via `ethers.id("fnSig()").slice(0,10)`).
2. If `STAKING.mvaultToken` ≠ `VITE_MVT_TOKEN_ADDRESS`, run `scripts/fix-staking-module.cjs --network mchain`.
3. Script redeploys MvaultStaking with correct addresses and calls `setStakingModule` on both main contract and MVT token.
4. Update `VITE_MVAULT_STAKING_ADDRESS` in VPS `.env` and `replit.md`.

## Selectors for state verification
- `stakingModule()` → `0x504b82bf`
- `mvaultContract()` → `0x912a6a3a`
- `mvaultMain()` → `0xef48d041`
- `mvaultToken()` → `0x1f6259d5`
- `usdtToken()` → `0xa98ad46c`
