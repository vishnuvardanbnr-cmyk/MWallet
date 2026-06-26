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

## Smart Contracts (MChain — Chain ID 1888 — ACTIVE)
| Contract | Address |
|---|---|
| **MVault Main** | `0xbade927063dd8539e287f2533e8f99ed0ba90ad9` |
| **MVT Token** | `0x899dea1532a780a6e78a60f9a765ac4592484c32` |
| **Board Matrix** | `0x8339fd14a09be1834f9357d8180fcdb8772ba536` |
| **MvaultStaking** | `0x38983e73b0686bf7fb89b431555319f476dd3c9f` |
| **MvaultView** | `0xf780a3874f8c9a9f983fb95391e52699bde279b3` |
| **USDT (MChain)** | `0x7b2ed1be97fa240dbd0328dd307e35e588bcb917` |
| **Owner** | `0xF305fEdfFF08ADAA7D2F73cA17F6bA4a3FB79318` — owns all contracts |
| **Manager** | `0xe746140d043f65c0ea2f1774bcbfc222d70734bf` |
| **Deployer Wallet** | `0xA7e7681e18D6EdF52548ff4cc79257FD43de72B8` (DEPLOYER_PRIVATE_KEY) — used for deployments only |

> MvaultDistributor is retired — binary/power-leg distribution replaced by on-chain placement income.

## Rank Income Architecture (on-chain, no off-chain payout needed)
Rank income is distributed **immediately at activation time** inside `_distributeRankIncome()`.
- Each rank slot = **1% of grossMvt** paid to the first upline with `rank >= slot`
- M1 fills slot 1 (1%), M2 fills slots 1+2 (2%), … M5 fills slots 1-5 (5%)
- Lower-ranked uplines fill lower slots first; higher rank takes only remaining slots
- Unfilled slots + fixed 5% of grossMvt → adminPool
- No `rankPool` accumulation, no owner-only payout call needed
- `setUserRanks(address[], uint8[])` — still called by manager (off-chain qualification check)

## Contract Size Notes (EIP-170 limit: 24 576 bytes)
- **MvaultContract.sol**: 24 292 bytes — 284 bytes under the limit
- **MvaultView.sol**: 7 198 bytes — read-only helper (no state, no funds)
- **MvaultStaking.sol**: separate staking module

Several view functions were moved out of MvaultContract into MvaultView.sol to stay under the limit:
`getAllUsersCount`, `getPoolBalances`, `getMvtContractBalance`, `getLockDuration`, `PACKAGE_PRICE`, `INCOME_LIMIT`, `getBoardQueueLength`, `getBoardCurrentIndex`, `getBoardMatrixInfo`, `getBoardPrice`

## Deploying MvaultView (after deploying MvaultContract)
```bash
npx hardhat compile
node scripts/deploy-mvault-view.cjs
# → prints: VITE_MVAULT_VIEW_ADDRESS=0x...
# Add that address to .env and VPS environment
```

## Deploying to VPS
```bash
bash scripts/update-vps.sh
# Requires VPS_PASSWORD env secret (password SSH) and DEPLOYER_PRIVATE_KEY secret
# Note: If VPS_PASSWORD SSH fails, VPS may require key-based auth — set up SSH key or update password.
```

## Environment Variables (VPS .env)
| Variable | Purpose |
|---|---|
| `VITE_MVAULT_CONTRACT_ADDRESS` | MVault main contract |
| `VITE_MVT_TOKEN_ADDRESS` | MVT token contract |
| `VITE_PAYMENT_TOKEN_ADDRESS` | USDT token address |
| `VITE_BOARD_HANDLER_ADDRESS` | Board handler address |
| `VITE_MVAULT_VIEW_ADDRESS` | MvaultView helper contract (optional) |
| `VITE_BSC_NETWORK` | `testnet` or `mainnet` |
| `DEPLOYER_PRIVATE_KEY` | Admin wallet for on-chain scripts |
| `NEW_USER_PRIVATE_KEY` | Test wallet for registration scripts |

## RPC Configuration
All reads, BFS, and simulations use `https://node.mymchain.com/api/rpc` (direct, not MetaMask).  
MetaMask is forced to add/update MChain (1888) via `wallet_addEthereumChain` on every connect.  
Set `VITE_BSC_NETWORK=mchain` to activate MChain; `mainnet` for BSC Mainnet; default = BSC Testnet.

## Registration Flow
1. Sponsor address validated via publicnode RPC
2. If sponsor's direct slots are taken → BFS up to 128 nodes to find first open slot
3. `staticCall` simulates the tx via publicnode before sending — catches all revert reasons
4. Actual tx goes through MetaMask with `gasLimit: 500_000` to skip `eth_estimateGas`
5. All errors decoded with `decodeContractError()` from `client/src/lib/contract.ts`

## Placement Income Architecture (on-chain, instant)
Placement income replaced binary/power-leg distribution. It fires inside `_distributePlacementIncome()` at activation time:
- 20% of `grossMvt` split across 30 binary upline levels
- Level rates: L1=5%, L2–3=2%, L4=1%, L5–12=0.5%, L13–20=0.4%, L21–28=0.3%, L29–30=0.2%
- Qualification: `ceil(level/3) × refsPerGroup` direct referrals (default `refsPerGroup=1`)
- Unfilled slots go to `communityPool` (10% of grossMvt also accumulates there)
- Admin: `setPlacementRates(uint256[30])`, `setRefsPerGroup(uint8)`, `withdrawCommunityPool(address,uint256)`
- `server/distributor.ts` is now a no-op (returns immediately) — no off-chain distribution needed

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
  distributor.ts   — Stubbed (placement income is on-chain; no off-chain distribution needed)
shared/
  schema.ts        — Drizzle schema
contracts/
  MvaultContract.sol  — Main contract (~24 292 bytes, placement income)
  MvaultStaking.sol   — Staking module
  MvaultView.sol      — Read-only helper
scripts/
  update-vps.sh           — Build + sync + restart on VPS
  deploy-mvault.cjs       — Deploy MvaultContract + MvaultToken
  deploy-mvault-view.cjs  — Deploy MvaultView helper
```

## TX_META Currency Rules
- **MVT-denominated** (amber, no $): types 1 (Level Income), 2 (Level Missed), 3 (Placement Income)
- **USDT-denominated** (green, with $): types 0, 5–11

## users() Auto-Getter Field Order
The `users(address)` public mapping getter returns all **32 struct fields**:
`isRegistered[0], isActive[1], sponsor[2], directCount[3], binaryParent[4], placedLeft[5], leftChild[6], rightChild[7], leftSubVolume[8], rightSubVolume[9], mvtBalance[10], totalReceived[11], totalSold[12], incomeLimit[13], usdtBalance[14], rebirthPool[15], totalUsdtEarned[16], btcPoolBalance[17], totalBtcEarned[18], packagePrice[19], incomeLimitCap[20], mainAccount[21], rebirthCount[22], rank[23], teamSalesUsdt[24], joinedAt[25], displayName[26](bytes32), email[27](bytes32), phone[28](bytes32), country[29](bytes32), profileSet[30], btcPoolRate[31]`

Profile fields (displayName/email/phone/country) are **bytes32** — decode with `ethers.decodeBytes32String()` / encode with `ethers.encodeBytes32String()` (max 31 chars each).

Use **named properties** (`info.mvtBalance`, `info.displayName`, etc.) — not numeric indices — to avoid breakage if struct fields are reordered.

## Known Notes
- `getDirectReferralsPaginated` uses the contract view function directly (single call, not event scanning)
- BFS and sponsor validation both use `getDirectProvider()` for consistent state with MetaMask tx simulation
- `0x3794bBC8641Cc30232B193bD23B5fB4668e0Bb78` — registered as user #10 via test script (NEW_USER_PRIVATE_KEY), not yet activated
- MvaultView must be deployed pointing at the live MvaultContract — it reads addresses of boardHandler and stakingModule dynamically from the main contract
