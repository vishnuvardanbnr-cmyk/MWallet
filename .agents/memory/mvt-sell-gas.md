---
name: MVT sell gas budget
description: sellMvt transaction needs significantly more gas than initially estimated
---

## Rule

`sellMvt(uint256)` in MvaultContract requires **~444K gas** in practice.
Frontend gasLimit must be **600_000** (not 300_000).

**Why:** The function calls MVT.sell() which does burns, USDT transfers, and history storage pushes. Two _recordTx calls are also made. Total gas well exceeds the original 300K estimate.

**How to apply:** In use-web3.ts, `gasLimit: 600_000` for sellMvt. Review other multi-step functions similarly.
