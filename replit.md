# M-Vault — Web3 MLM/DeFi Platform

## Overview
M-Vault is a Web3 MLM/DeFi platform for BNB Smart Chain. Users connect MetaMask wallets and participate in a binary MLM structure earning MVT (bonding-curve ERC-20) tokens from level and binary distributions, with a BTC pool, rebirth mechanics, and a $390 income cap (3× of $130 activation).

**Production URL**: https://app.mvault.pro  
**VPS**: 173.249.10.179 (root) — Ubuntu 24.04, Nginx → Node.js on port 5000  
**VPS App Path**: /opt/mvault  
**VPS SSH Password**: stored in secret `VPS_SSH_PASSWORD`

## Tech Stack
- **Frontend**: React 18 + Vite + TailwindCSS + shadcn/ui + Wouter routing + TanStack Query + ethers.js
- **Backend**: Node.js + Express 5 + Drizzle ORM + PostgreSQL
- **Blockchain**: BSC (BNB Smart Chain) — testnet by default
- **Process manager (VPS)**: PM2

## Smart Contracts

### New System (MvaultContract + MvaultToken) — BSC TESTNET DEPLOYED
- **MvaultContract**: `0x35238F0960b86F5c48ee4098ffcB887Fb029168C`
  - $130 USDT activation (single package)
  - 40% level / 30% binary / 30% reserve MVT split
  - 3× income cap ($390), rebirth mechanics
  - 10% of every MVT sell goes to personal BTC pool
  - Address-based registration (sponsor address, binary parent, side)
- **MvaultToken (MVT)**: `0x0c4A8271828C760fae1D72cAEE7b12bc8186b6bD`
  - Bonding-curve ERC-20 (buy price rises with supply)
  - sell price = 90% of buy price
  - Deployer: `0x12Fcf3d1084455d3677a110925D73b01F3846750`
  - Linked: MvaultToken.setMvaultContract(MvaultContract) ✓

### Legacy (kept for board/swap pages)
- **MLMContract (old)**: `VITE_CONTRACT_ADDRESS` = `0x6Ff2b61d1882e7a122b09a109F78F5b2E5ef174e`
- **Payment Token (USDT)**: `VITE_PAYMENT_TOKEN_ADDRESS` = `0x0D3E80cBc9DDC0a3Fdee912b99C50cd0b5761eE3`

## Environment Variables
| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (Replit-managed) |
| `VITE_MVAULT_CONTRACT_ADDRESS` | New MvaultContract address (set after deploy) |
| `VITE_MVT_TOKEN_ADDRESS` | New MvaultToken address (set after deploy) |
| `VITE_CONTRACT_ADDRESS` | Legacy MLMContract address |
| `VITE_PAYMENT_TOKEN_ADDRESS` | USDT token address |
| `VITE_BSC_NETWORK` | `testnet` or `mainnet` |
| `VITE_BOARD_HANDLER_ADDRESS` | BoardHandler contract address |

## User Flow
1. **Connect** → MetaMask wallet
2. **Register** → sponsor address (from ref= URL param), binary parent, left/right side
3. **Activate** → approve $130 USDT → `activate()` on chain
4. **Profile** → name/email/phone/country → stored in backend DB
5. **Dashboard** → see MVT balance, USDT balance, income limit, BTC pool, binary stats

## Key UserInfo Fields (index in contract tuple)
- [0] isRegistered, [1] isActive, [2] sponsor, [3] directCount
- [4] binaryParent, [5] placedLeft, [6] leftChild, [7] rightChild
- [8] leftSubUsers, [9] rightSubUsers, [10] mvtBalance, [11] totalReceived
- [12] totalSold, [13] incomeLimit, [14] usdtBalance, [15] rebirthPool
- [16] btcPoolBalance, [17] powerLegPoints, [18] matchedPairs
- [19] mainAccount, [20] rebirthCount, [21] joinedAt

## Tokenomics
- Activation: $130 → gross MVT = $130/buyPrice (e.g. 1,300 MVT at $0.10)
- Distribution: 40% = 520 MVT level income, 30% = 390 MVT binary pool, 30% = 390 MVT reserve
- Actual minted: 910 MVT (level + binary share); 390 MVT stays in reserve
- Sell: gross USDT → 10% to BTC pool, 90% net → fills income limit → excess to rebirth pool
- Income cap: $390 (3× of $130); triggered rebirth resets cap

## Project Structure
```
client/src/
  pages/           — All pages rewritten for new contract
    dashboard.tsx  — MVT bal, USDT bal, income limit, BTC pool, binary stats
    income.tsx     — Level income structure, binary pairs, rebirth pool
    wallet.tsx     — USDT + BTC pool withdrawals, tx history
    sell-tokens.tsx — Sell virtual MVT → USDT (on-chain)
    activate.tsx   — Single $130 activation (approve + activate)
    register.tsx   — Address-based registration with sponsor validation
    binary-details.tsx — Binary tree detail, power leg, rebirth info
    team.tsx       — Direct referrals (events), binary tree, referral links
    board.tsx      — BTC board pool (legacy, enterBoardPool stub)
    swap.tsx       — BTC swap (legacy, independent)
    deep-placement.tsx — Visual tree navigation (reads old contract)
    paid-staking.tsx, musdt-staking.tsx — Paid staking (TODO)
    transactions.tsx — Event-based transaction history
    settings.tsx   — Profile management (backend DB)
  components/
    app-sidebar.tsx — Navigation, referral link copy (uses wallet address)
  hooks/
    use-web3.ts    — Complete rewrite: new UserInfo type, new functions
  lib/
    contract.ts    — MVAULT_ABI, MVT_ABI, legacy MLM_ABI, all helpers
contracts/
  MvaultContract.sol — Main MLM contract (not deployed yet)
  MvaultToken.sol    — Bonding curve ERC-20 (not deployed yet)
server/
  routes.ts        — REST API: profiles, staking, support, transactions
  storage.ts       — IStorage interface + PostgreSQL implementation
```

## Referral Link Format
`https://app.mvault.pro?ref=0x<WALLET_ADDRESS>&side=left|right`

## Backend API
- `GET/POST /api/profiles/:walletAddress` — user profile (name, email, phone, country)
- `POST /api/staking/select` — select paid staking plan
- `GET /api/staking/:wallet/active` — get active staking plan
- `GET/POST /api/support` — support tickets
