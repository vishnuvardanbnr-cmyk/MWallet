# M-Vault — Web3 MLM/DeFi Platform

## Overview
M-Vault is a Web3 MLM/DeFi platform for BNB Smart Chain. Users connect MetaMask wallets and participate in a binary MLM structure with staking rewards, board pools, and a BTC swap feature.

**Production URL**: https://app.mvault.pro  
**VPS**: 173.249.10.179 (root) — Ubuntu 24.04, Nginx → Node.js on port 5000  
**VPS App Path**: /opt/mvault  
**VPS SSH Password**: stored in secret `VPS_SSH_PASSWORD`

## Tech Stack
- **Frontend**: React 18 + Vite + TailwindCSS + shadcn/ui + Wouter routing + TanStack Query + ethers.js
- **Backend**: Node.js + Express 5 + Drizzle ORM + PostgreSQL
- **Blockchain**: BSC (BNB Smart Chain) — testnet by default
- **Process manager (VPS)**: PM2

## Smart Contracts (BSC Testnet)
- **MLMContract**: `0xAC69c540DDF49fCe90088B36127ca852f198B353`
- **Payment Token (USDT)**: `0x0D3E80cBc9DDC0a3Fdee912b99C50cd0b5761eE3`
- **BoardHandler**: `0x6b3280d57159e2Cac30777b437291900cA3ba1C0`

## Environment Variables
| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (Replit-managed) |
| `VITE_CONTRACT_ADDRESS` | MLMContract address |
| `VITE_PAYMENT_TOKEN_ADDRESS` | USDT token address |
| `VITE_BSC_NETWORK` | `testnet` or `mainnet` |
| `VITE_BOARD_HANDLER_ADDRESS` | BoardHandler contract address |

## Project Structure
```
client/src/
  pages/           — All 16 pages (dashboard, income, wallet, team, board, staking, swap, etc.)
  components/      — App sidebar, logo, mobile nav, theme provider + shadcn/ui
  hooks/
    use-web3.ts    — MetaMask connection, contract calls, user state
    use-support-ws.ts — WebSocket for support chat
  lib/
    contract.ts    — Contract ABIs, addresses, helper functions
    queryClient.ts — TanStack Query setup
server/
  index.ts         — Express server entry
  routes.ts        — API routes
  storage.ts       — Database CRUD via Drizzle
  db.ts            — PostgreSQL pool + Drizzle instance
  websocket.ts     — WebSocket for support ticket real-time chat
shared/
  schema.ts        — Drizzle schema (profiles, staking_plans, staking_claims, mwallet_balances, support_tickets, ticket_messages)
```

## Pages
| Route | Page | Description |
|---|---|---|
| `/` | Dashboard | Overview stats |
| `/income` | Income | Direct, binary, matching income |
| `/wallet` | Wallet | mWallet balance & withdrawals |
| `/team` | Team | Binary tree & referrals |
| `/binary` | Binary Details | Deep binary tree view |
| `/board` | Board | BTC pool board entry |
| `/swap` | BTC Swap | Swap virtual rewards to BTCB via PancakeSwap |
| `/staking` | Staking | Token staking plans (15/30 month) |
| `/store` | Store | Hardware product store |
| `/transactions` | Transactions | On-chain transaction history |
| `/support` | Support | Ticket system (admin: 0x127323b3...) |
| `/profile` | Settings | Profile management |
| `/register` | Register | Wallet-based registration |
| `/activate` | Activate | Package selection |

## Database Schema
- `profiles` — wallet-linked user profiles
- `staking_plans` — staking positions
- `staking_claims` — daily claim history
- `mwallet_balances` — off-chain wallet balances
- `support_tickets` — support tickets
- `ticket_messages` — support chat messages

## Development
```bash
npm run dev        # Start dev server (port 5000)
npm run db:push    # Push schema changes to database
npm run build      # Build for production
```

## Deploying to VPS
```bash
# SSH into VPS
sshpass -p "$VPS_SSH_PASSWORD" ssh root@173.249.10.179

# On VPS: pull changes, rebuild, restart
cd /opt/mvault
git pull
npm run build
pm2 restart mvault
```

## Known Issues / Notes
- The `.env` file on the VPS was being served publicly via `/api/.env` — this is a security vulnerability that should be blocked in nginx
- BoardMatrixHandler contract changes (virtualRewardBalance, claimAndSwapToBTC, 9-member boards) are NOT yet deployed to the blockchain
- The BTC Updater PM2 process has a placeholder private key and is not running
