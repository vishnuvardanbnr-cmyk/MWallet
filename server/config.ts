/**
 * Central server config — all env vars in one place.
 * Import from here; never read process.env directly in route/distributor files.
 */

export const MCHAIN_RPC = "https://node.mymchain.com/api/rpc";

// ── Contract addresses (required on VPS via .env) ────────────────────────────
function addr(key: string): string {
  const val = process.env[key];
  if (!val) console.warn(`[config] ${key} is not set — some features may fail`);
  return val ?? "";
}

export const MVAULT_CONTRACT = addr("VITE_MVAULT_CONTRACT_ADDRESS");
export const MVAULT_VIEW     = addr("VITE_MVAULT_VIEW_ADDRESS");
export const MVT_TOKEN       = addr("VITE_MVT_TOKEN_ADDRESS");
export const BOARD_HANDLER   = addr("VITE_BOARD_HANDLER_ADDRESS");
export const MVAULT_STAKING  = addr("VITE_MVAULT_STAKING_ADDRESS");
export const PAYMENT_TOKEN   = addr("VITE_PAYMENT_TOKEN_ADDRESS");

// ── Admin / deployer ──────────────────────────────────────────────────────────
// VITE_ADMIN_WALLET = deployer wallet address (public, used for auth checks)
// DEPLOYER_PRIVATE_KEY = private key for on-chain admin calls
export const ADMIN_WALLET = (process.env.VITE_ADMIN_WALLET ?? "").toLowerCase();
export const DEPLOYER_PK  = process.env.DEPLOYER_PRIVATE_KEY ?? "";
