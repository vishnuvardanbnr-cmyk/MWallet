---
name: Delegation view removal from MvaultContract
description: Which view functions were removed from the main contract and where to call them now
---

To stay under the EIP-170 size limit, several view/pure functions were removed from MvaultContract.sol:

| Removed function | Now call instead |
|---|---|
| `getMvtPrice()` | `getMvtTokenContract(provider).getBuyPrice()` / `.getSellPrice()` |
| `getActiveStakes(user)` | `getStakingModuleContract(provider).getActiveStakes(user)` |
| `getStakeCount(user)` | `getStakingModuleContract(provider).getStakeCount(user)` |
| `getStake(user, index)` | `getStakingModuleContract(provider).getStake(user, index)` |
| `getBtcPoolInfo(user)` | read from `userInfo.btcPoolBalance` / `userInfo.totalBtcEarned` struct fields |
| `getUserBoardStats(user)` | removed — not needed by current UI |
| `canRebirth(user)` | removed — computed client-side from userInfo |
| `MIN_STAKE_USDT`, `LOCK_DURATION`, `FLEX_CAP_MULT` | hardcoded constants or read from staking module |

**Why:** MvaultContract was at 24,292 / 24,576 bytes. Removing these delegation wrappers freed enough space for `adminActivate`.

**How to apply:** Always use `getMvtTokenContract` and `getStakingModuleContract` helpers from `contract.ts` for these calls. Never add them back to MvaultContract.sol.
