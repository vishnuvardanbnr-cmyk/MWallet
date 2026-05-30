/**
 * Distributor — STUBBED (placement income is fully on-chain)
 * All distribution happens inside _distributePlacementIncome() and _distributeRankIncome()
 * at activation time. No off-chain distribution is needed.
 */

import { log } from "./index";

export async function runDistribution(): Promise<void> {
  return;
}

export async function runRankDistribution(): Promise<void> {
  return;
}

export async function runRankCheck(): Promise<void> {
  return;
}

export async function startRankEventListener(): Promise<void> {
  return;
}

export function startDistributor(): void {
  log("VITE_DISTRIBUTOR_ADDRESS not set — auto-distributor disabled", "distributor");
}
