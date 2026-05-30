---
name: MChain build env vars
description: VITE_BSC_NETWORK and contract addresses must be set at build time — Vite bakes them into JS, runtime .env does NOT affect the frontend bundle.
---

# MChain build env vars

**Rule:** NEVER run bare `npm run build` for VPS deploys. Always prefix with the MChain env vars.

**Why:** `import.meta.env.VITE_BSC_NETWORK` is resolved by Vite at compile time — it is NOT read from the VPS `.env` at runtime. A plain `npm run build` without the vars produces `undefined` for all `VITE_*` values, so `getDirectProvider()` falls back to BSC testnet and contract addresses default to old testnet values. This makes every registered MChain user look unregistered.

**Diagnostic signal:** If the app shows 16 members (BSC testnet count) instead of 3+ (MChain count), the build used the wrong env vars.

**How to apply:** Use this prefix for every VPS build:
```bash
VITE_BSC_NETWORK=mchain \
VITE_MVT_TOKEN_ADDRESS=0x183a4A6b843ce85D1e363D7a1820f404fccDD726 \
VITE_MVAULT_CONTRACT_ADDRESS=0x60c5bd746f6245ecE5daC006082a7bd13f521aF8 \
VITE_BOARD_HANDLER_ADDRESS=0x575A96A86A8a0954d138B30be6De9CfCd6e6CA90 \
VITE_MVAULT_VIEW_ADDRESS=0xeae33B0EF77B8eA51B866DFD923117dBbD5cAF9d \
VITE_MVAULT_STAKING_ADDRESS=0xA1A9569DeEc0AD743EC1d78E44085DE616985D77 \
VITE_PAYMENT_TOKEN_ADDRESS=0xab8c6267dcca9e70b625014c8f77eee9728e14c3 \
npm run build
```
Or just run `bash scripts/update-vps.sh` (already correct in step 1).
