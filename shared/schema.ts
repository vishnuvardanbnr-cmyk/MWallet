import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, boolean, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const profiles = pgTable("profiles", {
  walletAddress: varchar("wallet_address", { length: 42 }).primaryKey(),
  displayName: varchar("display_name", { length: 255 }).notNull().default(""),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  country: varchar("country", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProfileSchema = createInsertSchema(profiles).omit({ createdAt: true });
export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Profile = typeof profiles.$inferSelect;

export const stakingPlans = pgTable("staking_plans", {
  id: serial("id").primaryKey(),
  walletAddress: varchar("wallet_address", { length: 42 }).notNull(),
  planMonths: integer("plan_months").notNull(),
  activationFee: numeric("activation_fee", { precision: 20, scale: 4 }).notNull().default("0"),
  totalTokens: numeric("total_tokens", { precision: 20, scale: 4 }).notNull(),
  dailyTokens: numeric("daily_tokens", { precision: 20, scale: 4 }).notNull(),
  claimedTokens: numeric("claimed_tokens", { precision: 20, scale: 4 }).notNull().default("0"),
  lastClaimDate: timestamp("last_claim_date"),
  startDate: timestamp("start_date").notNull().defaultNow(),
  endDate: timestamp("end_date").notNull(),
  isActive: boolean("is_active").notNull().default(true),
});

export const insertStakingPlanSchema = createInsertSchema(stakingPlans).omit({ id: true, claimedTokens: true, lastClaimDate: true, isActive: true });
export type InsertStakingPlan = z.infer<typeof insertStakingPlanSchema>;
export type StakingPlan = typeof stakingPlans.$inferSelect;

export const stakingClaims = pgTable("staking_claims", {
  id: serial("id").primaryKey(),
  walletAddress: varchar("wallet_address", { length: 42 }).notNull(),
  planId: integer("plan_id").notNull(),
  amount: numeric("amount", { precision: 20, scale: 4 }).notNull(),
  daysCount: integer("days_count").notNull().default(1),
  claimedAt: timestamp("claimed_at").notNull().defaultNow(),
});

export const insertStakingClaimSchema = createInsertSchema(stakingClaims).omit({ id: true, claimedAt: true });
export type InsertStakingClaim = z.infer<typeof insertStakingClaimSchema>;
export type StakingClaim = typeof stakingClaims.$inferSelect;

export const mwalletBalances = pgTable("mwallet_balances", {
  walletAddress: varchar("wallet_address", { length: 42 }).primaryKey(),
  balance: numeric("balance", { precision: 20, scale: 4 }).notNull().default("0"),
  totalClaimed: numeric("total_claimed", { precision: 20, scale: 4 }).notNull().default("0"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type MwalletBalance = typeof mwalletBalances.$inferSelect;

export const supportTickets = pgTable("support_tickets", {
  id: serial("id").primaryKey(),
  walletAddress: varchar("wallet_address", { length: 42 }).notNull(),
  subject: varchar("subject", { length: 255 }).notNull(),
  category: varchar("category", { length: 50 }).notNull().default("general"),
  status: varchar("status", { length: 20 }).notNull().default("open"),
  priority: varchar("priority", { length: 20 }).notNull().default("normal"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  closedAt: timestamp("closed_at"),
});

export const insertTicketSchema = createInsertSchema(supportTickets).omit({ id: true, createdAt: true, updatedAt: true, closedAt: true });
export type InsertTicket = z.infer<typeof insertTicketSchema>;
export type SupportTicket = typeof supportTickets.$inferSelect;

export const ticketMessages = pgTable("ticket_messages", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull(),
  senderWallet: varchar("sender_wallet", { length: 42 }).notNull(),
  senderRole: varchar("sender_role", { length: 10 }).notNull().default("user"),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTicketMessageSchema = createInsertSchema(ticketMessages).omit({ id: true, createdAt: true });
export type InsertTicketMessage = z.infer<typeof insertTicketMessageSchema>;
export type TicketMessage = typeof ticketMessages.$inferSelect;

// ── Token Economics ──────────────────────────────────────────────────────────

export const tokenEconomics = pgTable("token_economics", {
  id: serial("id").primaryKey(),
  liquidity: numeric("liquidity", { precision: 30, scale: 8 }).notNull().default("0"),
  circulatingSupply: numeric("circulating_supply", { precision: 30, scale: 8 }).notNull().default("0"),
  generatedVolume: numeric("generated_volume", { precision: 30, scale: 8 }).notNull().default("0"),
  listingPrice: numeric("listing_price", { precision: 20, scale: 8 }).notNull().default("0.036"),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export type TokenEconomics = typeof tokenEconomics.$inferSelect;

export const virtualUsdtBalances = pgTable("virtual_usdt_balances", {
  walletAddress: varchar("wallet_address", { length: 42 }).primaryKey(),
  balance: numeric("balance", { precision: 20, scale: 4 }).notNull().default("0"),
  totalDeposited: numeric("total_deposited", { precision: 20, scale: 4 }).notNull().default("0"),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export type VirtualUsdtBalance = typeof virtualUsdtBalances.$inferSelect;

export const mTokenBalances = pgTable("m_token_balances", {
  walletAddress: varchar("wallet_address", { length: 42 }).primaryKey(),
  mainBalance: numeric("main_balance", { precision: 30, scale: 8 }).notNull().default("0"),
  rewardBalance: numeric("reward_balance", { precision: 30, scale: 8 }).notNull().default("0"),
  totalRewardEarned: numeric("total_reward_earned", { precision: 30, scale: 8 }).notNull().default("0"),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export type MTokenBalance = typeof mTokenBalances.$inferSelect;

export const paidStakingPlans = pgTable("paid_staking_plans", {
  id: serial("id").primaryKey(),
  walletAddress: varchar("wallet_address", { length: 42 }).notNull(),
  usdtInvested: numeric("usdt_invested", { precision: 20, scale: 4 }).notNull(),
  buyPriceAtEntry: numeric("buy_price_at_entry", { precision: 20, scale: 8 }).notNull(),
  totalTokensMinted: numeric("total_tokens_minted", { precision: 30, scale: 8 }).notNull(),
  userTokens: numeric("user_tokens", { precision: 30, scale: 8 }).notNull(),
  adminTokens: numeric("admin_tokens", { precision: 30, scale: 8 }).notNull(),
  dailyRewardUsdt: numeric("daily_reward_usdt", { precision: 20, scale: 4 }).notNull(),
  totalRewardTokensClaimed: numeric("total_reward_tokens_claimed", { precision: 30, scale: 8 }).notNull().default("0"),
  lastRewardClaimDate: timestamp("last_reward_claim_date"),
  startDate: timestamp("start_date").notNull().defaultNow(),
  endDate: timestamp("end_date").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  unstaked: boolean("unstaked").notNull().default(false),
  unstakeDate: timestamp("unstake_date"),
  usdtReturnedOnUnstake: numeric("usdt_returned_on_unstake", { precision: 20, scale: 4 }),
});
export const insertPaidStakingPlanSchema = createInsertSchema(paidStakingPlans).omit({ id: true, totalRewardTokensClaimed: true, lastRewardClaimDate: true, isActive: true, unstaked: true, unstakeDate: true, usdtReturnedOnUnstake: true });
export type InsertPaidStakingPlan = z.infer<typeof insertPaidStakingPlanSchema>;
export type PaidStakingPlan = typeof paidStakingPlans.$inferSelect;

export const tokenTransactions = pgTable("token_transactions", {
  id: serial("id").primaryKey(),
  walletAddress: varchar("wallet_address", { length: 42 }).notNull(),
  txType: varchar("tx_type", { length: 30 }).notNull(),
  tokenAmount: numeric("token_amount", { precision: 30, scale: 8 }).notNull().default("0"),
  usdtAmount: numeric("usdt_amount", { precision: 20, scale: 4 }),
  priceAtTxn: numeric("price_at_txn", { precision: 20, scale: 8 }),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type TokenTransaction = typeof tokenTransactions.$inferSelect;

// ── Virtual BTC ───────────────────────────────────────────────────────────────

export const virtualBtcBalances = pgTable("virtual_btc_balances", {
  walletAddress: varchar("wallet_address", { length: 42 }).primaryKey(),
  balance: numeric("balance", { precision: 20, scale: 4 }).notNull().default("0"),
  totalEarned: numeric("total_earned", { precision: 20, scale: 4 }).notNull().default("0"),
  totalSwapped: numeric("total_swapped", { precision: 20, scale: 4 }).notNull().default("0"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type VirtualBtcBalance = typeof virtualBtcBalances.$inferSelect;

export const btcSwapTxns = pgTable("btc_swap_txns", {
  id: serial("id").primaryKey(),
  walletAddress: varchar("wallet_address", { length: 42 }).notNull(),
  amountUsdt: numeric("amount_usdt", { precision: 20, scale: 4 }).notNull(),
  amountBtcb: numeric("amount_btcb", { precision: 20, scale: 8 }),
  bscTxHash: varchar("bsc_tx_hash", { length: 70 }),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBtcSwapTxnSchema = createInsertSchema(btcSwapTxns).omit({ id: true, createdAt: true });
export type InsertBtcSwapTxn = z.infer<typeof insertBtcSwapTxnSchema>;
export type BtcSwapTxn = typeof btcSwapTxns.$inferSelect;

export interface HardwareProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
  category: string;
  inStock: boolean;
}

export interface HardwareOrder {
  id: string;
  walletAddress: string;
  productId: string;
  quantity: number;
  totalPrice: number;
  status: string;
  shippingAddress: string;
  createdAt: string;
}
