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
