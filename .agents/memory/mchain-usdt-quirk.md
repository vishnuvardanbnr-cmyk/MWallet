---
name: MChain USDT transferFrom quirk
description: MChain test USDT token's transferFrom returns true but doesn't move tokens
---

## Rule
The USDT token on MChain 1888 (`0xab8c6267dcca9e70b625014c8f77eee9728e14c3`) returns `true`
from `transferFrom` calls without actually moving tokens. This causes silent failures where:
- The calling contract sees "ok = true" and updates internal mappings
- But no USDT physically arrives at the recipient address

## Why
MChain is a test network and the USDT appears to be a mock/stub token that doesn't enforce real transfers.

## How to apply
**Never use `transferFrom` from an admin/manager call to fund MvaultContract.**
Instead, split the operation into two:
1. **`adminCreditBtcPool(user, amount)`** — pure virtual credit, no `transferFrom`; just updates user's `btcPoolBalance` mapping
2. **`adminDepositUsdtPool(amount)`** — the actual USDT deposit with `transferFrom`; call this separately to physically fund the contract's liquidity pool for board entries and withdrawals

The admin workflow on the admin page is:
1. "Fund Contract USDT Pool" → `approve` + `adminDepositUsdtPool` (puts real USDT into contract)
2. "Credit BTC Pool" → `adminCreditBtcPool` (one click, no approve, just updates user mapping)
3. User can then enter board (contract has USDT to forward to boardHandler)

This is also the fix for the board entry failure: `enterBoardPool` calls `usdtToken.transfer(boardHandler, price)` which only works when MvaultContract has real USDT from step 1 above.
