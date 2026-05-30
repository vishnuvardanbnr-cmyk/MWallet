---
name: MChain EVM version restriction
description: MChain does not support Cancun opcodes; hardhat.config.cjs must set evmVersion:"london" or contracts fail to deploy (0 code).
---

## Rule
`hardhat.config.cjs` must include `evmVersion: "london"` in the Solidity settings. Without it, Solidity 0.8.20+ defaults to `cancun` (or `shanghai` at minimum), emitting opcodes MChain's EVM rejects.

## Why
Cancun opcodes that MChain's EVM treats as INVALID:
- `TLOAD  (0x5c)` — EIP-1153 transient storage (used by OZ 5.x ReentrancyGuard)
- `TSTORE (0x5d)` — EIP-1153 transient storage
- `MCOPY  (0x5e)` — EIP-5656 memory copy
- `PUSH0  (0x5f)` — EIP-3855 (Shanghai)

OpenZeppelin 5.x's `ReentrancyGuard` uses `TSTORE`/`TLOAD` for gas efficiency. Any contract importing it with a Cancun-default compiler will fail to deploy: the CREATE tx mines with `status: 0x1` but the constructor hits an INVALID opcode, leaving 0 bytes at the address.

**Symptom:** `provider.getCode(deployedAddr)` returns `0x` even though the deployment receipt shows `status: 0x1`.

## How to apply
```js
// hardhat.config.cjs — always include evmVersion
solidity: {
  version: "0.8.27",
  settings: {
    optimizer: { enabled: true, runs: 1 },
    viaIR: true,
    evmVersion: "london",   // ← REQUIRED for MChain
  },
}
```

Note: The naive byte scanner (`0x5c/5d/5e/5f` in bytecode hex) gives false positives because PUSH data can contain these bytes. Do a proper disassembly or just deploy and check `getCode()` to verify.
