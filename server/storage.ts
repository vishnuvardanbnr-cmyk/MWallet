import { profiles, type Profile, type InsertProfile, stakingPlans, type StakingPlan, type InsertStakingPlan, mwalletBalances, type MwalletBalance, stakingClaims, type StakingClaim, type InsertStakingClaim, type HardwareProduct, type HardwareOrder, supportTickets, type SupportTicket, type InsertTicket, ticketMessages, type TicketMessage, type InsertTicketMessage } from "@shared/schema";
import { db } from "./db";
import { eq, and, sql, desc, or } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface IStorage {
  getProfile(walletAddress: string): Promise<Profile | undefined>;
  upsertProfile(data: InsertProfile): Promise<Profile>;
  createStakingPlan(data: Omit<InsertStakingPlan, "id">): Promise<StakingPlan>;
  getStakingPlans(walletAddress: string): Promise<StakingPlan[]>;
  getActiveStakingPlan(walletAddress: string): Promise<StakingPlan | undefined>;
  claimTokens(planId: number, amount: string): Promise<StakingPlan>;
  getMwalletBalance(walletAddress: string): Promise<MwalletBalance | undefined>;
  addToMwalletBalance(walletAddress: string, amount: string): Promise<MwalletBalance>;
  createStakingClaim(data: Omit<InsertStakingClaim, "id">): Promise<StakingClaim>;
  getStakingClaims(walletAddress: string, limit: number, offset: number): Promise<{ claims: StakingClaim[]; total: number }>;
  getProducts(): Promise<HardwareProduct[]>;
  getProduct(id: string): Promise<HardwareProduct | undefined>;
  addProduct(product: Omit<HardwareProduct, "id">): Promise<HardwareProduct>;
  updateProduct(id: string, product: Partial<HardwareProduct>): Promise<HardwareProduct | undefined>;
  deleteProduct(id: string): Promise<boolean>;
  getOrders(walletAddress?: string): Promise<HardwareOrder[]>;
  createOrder(order: Omit<HardwareOrder, "id" | "createdAt">): Promise<HardwareOrder>;
  updateOrderStatus(id: string, status: string): Promise<HardwareOrder | undefined>;
  createTicket(data: InsertTicket): Promise<SupportTicket>;
  getTickets(walletAddress?: string): Promise<SupportTicket[]>;
  getTicket(id: number): Promise<SupportTicket | undefined>;
  updateTicketStatus(id: number, status: string): Promise<SupportTicket | undefined>;
  addTicketMessage(data: InsertTicketMessage): Promise<TicketMessage>;
  getTicketMessages(ticketId: number): Promise<TicketMessage[]>;
}

export class DatabaseStorage implements IStorage {
  private products: Map<string, HardwareProduct>;
  private orders: Map<string, HardwareOrder>;

  constructor() {
    this.products = new Map();
    this.orders = new Map();
  }

  async getProfile(walletAddress: string): Promise<Profile | undefined> {
    const [profile] = await db.select().from(profiles).where(eq(profiles.walletAddress, walletAddress.toLowerCase()));
    return profile;
  }

  async upsertProfile(data: InsertProfile): Promise<Profile> {
    const normalized = { ...data, walletAddress: data.walletAddress.toLowerCase() };
    const [profile] = await db
      .insert(profiles)
      .values(normalized)
      .onConflictDoUpdate({
        target: profiles.walletAddress,
        set: {
          displayName: normalized.displayName,
          email: normalized.email,
          phone: normalized.phone,
          country: normalized.country,
        },
      })
      .returning();
    return profile;
  }

  async createStakingPlan(data: Omit<InsertStakingPlan, "id">): Promise<StakingPlan> {
    const [plan] = await db.insert(stakingPlans).values(data).returning();
    return plan;
  }

  async getStakingPlans(walletAddress: string): Promise<StakingPlan[]> {
    return db.select().from(stakingPlans).where(eq(stakingPlans.walletAddress, walletAddress.toLowerCase()));
  }

  async getActiveStakingPlan(walletAddress: string): Promise<StakingPlan | undefined> {
    const [plan] = await db.select().from(stakingPlans)
      .where(and(eq(stakingPlans.walletAddress, walletAddress.toLowerCase()), eq(stakingPlans.isActive, true)));
    return plan;
  }

  async claimTokens(planId: number, amount: string): Promise<StakingPlan> {
    const [plan] = await db.update(stakingPlans)
      .set({
        claimedTokens: sql`${stakingPlans.claimedTokens}::numeric + ${amount}::numeric`,
        lastClaimDate: new Date(),
      })
      .where(eq(stakingPlans.id, planId))
      .returning();
    return plan;
  }

  async getMwalletBalance(walletAddress: string): Promise<MwalletBalance | undefined> {
    const [balance] = await db.select().from(mwalletBalances).where(eq(mwalletBalances.walletAddress, walletAddress.toLowerCase()));
    return balance;
  }

  async addToMwalletBalance(walletAddress: string, amount: string): Promise<MwalletBalance> {
    const addr = walletAddress.toLowerCase();
    const [balance] = await db.insert(mwalletBalances)
      .values({ walletAddress: addr, balance: amount, totalClaimed: amount })
      .onConflictDoUpdate({
        target: mwalletBalances.walletAddress,
        set: {
          balance: sql`${mwalletBalances.balance}::numeric + ${amount}::numeric`,
          totalClaimed: sql`${mwalletBalances.totalClaimed}::numeric + ${amount}::numeric`,
          updatedAt: new Date(),
        },
      })
      .returning();
    return balance;
  }

  async createStakingClaim(data: Omit<InsertStakingClaim, "id">): Promise<StakingClaim> {
    const [claim] = await db.insert(stakingClaims).values(data).returning();
    return claim;
  }

  async getStakingClaims(walletAddress: string, limit: number, offset: number): Promise<{ claims: StakingClaim[]; total: number }> {
    const addr = walletAddress.toLowerCase();
    const claims = await db.select().from(stakingClaims)
      .where(eq(stakingClaims.walletAddress, addr))
      .orderBy(desc(stakingClaims.claimedAt))
      .limit(limit)
      .offset(offset);
    const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(stakingClaims)
      .where(eq(stakingClaims.walletAddress, addr));
    return { claims, total: countResult?.count || 0 };
  }

  async getProducts(): Promise<HardwareProduct[]> {
    return Array.from(this.products.values());
  }

  async getProduct(id: string): Promise<HardwareProduct | undefined> {
    return this.products.get(id);
  }

  async addProduct(product: Omit<HardwareProduct, "id">): Promise<HardwareProduct> {
    const id = randomUUID();
    const newProduct: HardwareProduct = { ...product, id };
    this.products.set(id, newProduct);
    return newProduct;
  }

  async updateProduct(id: string, updates: Partial<HardwareProduct>): Promise<HardwareProduct | undefined> {
    const existing = this.products.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates, id };
    this.products.set(id, updated);
    return updated;
  }

  async deleteProduct(id: string): Promise<boolean> {
    return this.products.delete(id);
  }

  async getOrders(walletAddress?: string): Promise<HardwareOrder[]> {
    const all = Array.from(this.orders.values());
    if (walletAddress) return all.filter(o => o.walletAddress.toLowerCase() === walletAddress.toLowerCase());
    return all;
  }

  async createOrder(order: Omit<HardwareOrder, "id" | "createdAt">): Promise<HardwareOrder> {
    const id = randomUUID();
    const newOrder: HardwareOrder = { ...order, id, createdAt: new Date().toISOString() };
    this.orders.set(id, newOrder);
    return newOrder;
  }

  async updateOrderStatus(id: string, status: string): Promise<HardwareOrder | undefined> {
    const existing = this.orders.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, status };
    this.orders.set(id, updated);
    return updated;
  }
  async createTicket(data: InsertTicket): Promise<SupportTicket> {
    const [ticket] = await db.insert(supportTickets).values({
      ...data,
      walletAddress: data.walletAddress.toLowerCase(),
    }).returning();
    return ticket;
  }

  async getTickets(walletAddress?: string): Promise<SupportTicket[]> {
    if (walletAddress) {
      return db.select().from(supportTickets)
        .where(eq(supportTickets.walletAddress, walletAddress.toLowerCase()))
        .orderBy(desc(supportTickets.updatedAt));
    }
    return db.select().from(supportTickets).orderBy(desc(supportTickets.updatedAt));
  }

  async getTicket(id: number): Promise<SupportTicket | undefined> {
    const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, id));
    return ticket;
  }

  async updateTicketStatus(id: number, status: string): Promise<SupportTicket | undefined> {
    const set: any = { status, updatedAt: new Date() };
    if (status === "closed") set.closedAt = new Date();
    const [ticket] = await db.update(supportTickets).set(set).where(eq(supportTickets.id, id)).returning();
    return ticket;
  }

  async addTicketMessage(data: InsertTicketMessage): Promise<TicketMessage> {
    const [message] = await db.insert(ticketMessages).values({
      ...data,
      senderWallet: data.senderWallet.toLowerCase(),
    }).returning();
    await db.update(supportTickets).set({ updatedAt: new Date() }).where(eq(supportTickets.id, data.ticketId));
    return message;
  }

  async getTicketMessages(ticketId: number): Promise<TicketMessage[]> {
    return db.select().from(ticketMessages)
      .where(eq(ticketMessages.ticketId, ticketId))
      .orderBy(ticketMessages.createdAt);
  }
}

export const storage = new DatabaseStorage();
