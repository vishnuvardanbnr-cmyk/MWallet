# M-Vault — Web3 MLM/DeFi Platform

## Overview
M-Vault is a Web3 MLM/DeFi platform for BNB Smart Chain. Users connect MetaMask wallets and participate in a binary MLM structure with staking rewards, board pools, BTC swap, and MVT token paid staking.

**Production URL**: https://app.mvault.pro  
**VPS**: 173.249.10.179 (root) — Ubuntu 24.04, Nginx → Node.js on port 5000  
**VPS App Path**: /opt/mvault  
**VPS SSH Password**: stored in secret `VPS_PASSWORD`

## Tech Stack
- **Frontend**: React 18 + Vite + TailwindCSS + shadcn/ui + Wouter routing + TanStack Query + ethers.js
- **Backend**: Node.js + Express 5 + Drizzle ORM + PostgreSQL
- **Blockchain**: BSC (BNB Smart Chain) — testnet active
- **Process manager (VPS)**: PM2 (name: `mvault`)

## Smart Contracts (BSC Testnet — ACTIVE)
| Contract | Address |
|---|---|
| **MVault Main** | `0x164E4c01958c623CeF48C7DF8C66deFbB5eB4f57` |
| **MVT Token** | `0x80fBC04347c8a163902C9D7E2daE8B2474b01f5e` |
| **Board Matrix** | `0xcA0Cc4A6236b4Af41E5588B70679DF9E9B8625Dc` |
| **USDT (testnet)** | `0x0D3E80cBc9DDC0a3Fdee912b99C50cd0b5761eE3` |
| **Admin Wallet** | `0x04E8c5B49dE683c5B44eF1269Bd5ee4f338868C4` |

## Deploying to VPS
```bash
bash scripts/update-vps.sh <TOKEN_ADDR> <CONTRACT_ADDR> <BOARD_ADDR>
# Requires VPS_PASSWORD env secret and DEPLOYER_PRIVATE_KEY secret
```

## Environment Variables (VPS .env)
| Variable | Purpose |
|---|---|
| `VITE_MVAULT_CONTRACT_ADDRESS` | MVault main contract |
| `VITE_MVT_TOKEN_ADDRESS` | MVT token contract |
| `VITE_PAYMENT_TOKEN_ADDRESS` | USDT token address |
| `VITE_BOARD_HANDLER_ADDRESS` | Board handler address |
| `VITE_BSC_NETWORK` | `testnet` or `mainnet` |
| `DEPLOYER_PRIVATE_KEY` | Admin wallet for on-chain scripts |
| `NEW_USER_PRIVATE_KEY` | Test wallet for registration scripts |

## RPC Configuration
All reads, BFS, and simulations use `https://bsc-testnet-rpc.publicnode.com` (direct, not MetaMask).  
MetaMask is forced to add/update BSC testnet via `wallet_addEthereumChain` with publicnode as primary RPC on every connect, fixing inconsistent MetaMask simulations.

## Registration Flow
1. Sponsor address validated via publicnode RPC
2. If sponsor's direct slots are taken → BFS up to 128 nodes to find first open slot
3. `staticCall` simulates the tx via publicnode before sending — catches all revert reasons
4. Actual tx goes through MetaMask with `gasLimit: 500_000` to skip `eth_estimateGas`
5. All errors decoded with `decodeContractError()` from `client/src/lib/contract.ts`

## Project Structure
```
client/src/
  pages/           — All pages (dashboard, income, wallet, team, board, staking, transactions, register, etc.)
  components/      — App sidebar, logo, mobile nav, theme provider + shadcn/ui
  hooks/
    use-web3.ts    — MetaMask connection, contract calls, user state
  lib/
    contract.ts    — ABIs, addresses, getDirectProvider(), decodeContractError()
    queryClient.ts — TanStack Query setup
server/
  index.ts         — Express server entry
  routes.ts        — API routes
  storage.ts       — Database CRUD via Drizzle
shared/
  schema.ts        — Drizzle schema
scripts/
  update-vps.sh    — Build + sync + restart on VPS
  deploy-mvault.cjs — Contract deployment script
```

## TX_META Currency Rules
- **MVT-denominated** (amber, no $): types 1 (Level Income), 2 (Level Missed), 3 (Binary Income), 4 (Power Leg)
- **USDT-denominated** (green, with $): types 0, 5–11

## Known Notes
- `getDirectReferralsPaginated` uses the contract view function directly (single call, not event scanning)
- BFS and sponsor validation both use `getDirectProvider()` for consistent state with MetaMask tx simulation
- `0x3794bBC8641Cc30232B193bD23B5fB4668e0Bb78` — registered as user #10 via test script (NEW_USER_PRIVATE_KEY), not yet activated
