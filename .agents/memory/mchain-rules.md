---
name: MChain TX rules
description: MChain-specific EVM quirks that break standard ethers.js patterns
---

## Rules

1. **Never use `wallet.sendTransaction()`** — MChain blocks return MXC bech32 miner addresses that ethers.js v6 cannot parse → crashes with "invalid address for value.miner".
2. **Always use raw TX**: `wallet.signTransaction(tx)` + `provider.send('eth_sendRawTransaction', [signedTx])`.
3. **Always set explicit gasPrice: 1_000_000_000n (1 gwei)** — "auto" or fee data fetch hangs/fails.
4. **Never call eth_estimateGas** — returns 0; always set explicit gasLimit per function.
5. **evmVersion must be "london"** in hardhat.config.cjs — MChain does not support Cancun/Shanghai opcodes (TSTORE, TLOAD, PUSH0).
6. **Contract CREATE address**: use nonce+1 approach for pre-computing CREATE addresses.
7. **Historical eth_call at block tag** does not return historical state — always returns current state.
8. **Chain ID: 1888**

**Why:** MChain is a non-standard EVM fork (MXC chain). It returns custom block structures with bech32 addresses and does not implement all standard JSON-RPC behaviors.

**How to apply:** Every backend script or server route that sends a transaction must use the raw approach. Every deploy script must use evmVersion: london.
