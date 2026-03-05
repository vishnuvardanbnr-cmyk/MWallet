import { profiles, type Profile, type InsertProfile, stakingPlans, type StakingPlan, type InsertStakingPlan, mwalletBalances, type MwalletBalance, stakingClaims, type StakingClaim, type InsertStakingClaim, type HardwareProduct, type HardwareOrder, supportTickets, type SupportTicket, type InsertTicket, ticketMessages, type TicketMessage, type InsertTicketMessage, virtualBtcBalances, type VirtualBtcBalance, btcSwapTxns, type BtcSwapTxn, type InsertBtcSwapTxn, tokenEconomics, type TokenEconomics, virtualUsdtBalances, type VirtualUsdtBalance, mTokenBalances, type MTokenBalance, paidStakingPlans, type PaidStakingPlan, type InsertPaidStakingPlan, tokenTransactions, type TokenTransaction, stakingOverrideIncome, type StakingOverrideIncome, usdtDeposits, type UsdtDeposit } from "@shared/schema";
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
  // Token Economics
  getTokenEconomics(): Promise<TokenEconomics>;
  initTokenEconomics(): Promise<TokenEconomics>;
  updateTokenEconomics(data: Partial<{ liquidity: string; circulatingSupply: string; generatedVolume: string }>): Promise<TokenEconomics>;
  // Virtual USDT
  getVirtualUsdtBalance(walletAddress: string): Promise<VirtualUsdtBalance | undefined>;
  creditVirtualUsdt(walletAddress: string, amount: string): Promise<VirtualUsdtBalance>;
  deductVirtualUsdt(walletAddress: string, amount: string): Promise<VirtualUsdtBalance>;
  // M Token balances
  getMTokenBalance(walletAddress: string): Promise<MTokenBalance | undefined>;
  addMTokenMainBalance(walletAddress: string, amount: string): Promise<MTokenBalance>;
  addMTokenRewardBalance(walletAddress: string, amount: string): Promise<MTokenBalance>;
  deductMTokenRewardBalance(walletAddress: string, amount: string): Promise<MTokenBalance>;
  deductMTokenMainBalance(walletAddress: string, amount: string): Promise<MTokenBalance>;
  // Paid Staking
  createPaidStakingPlan(data: InsertPaidStakingPlan): Promise<PaidStakingPlan>;
  getActivePaidStakingPlan(walletAddress: string): Promise<PaidStakingPlan | undefined>;
  getAllPaidStakingPlans(walletAddress: string): Promise<PaidStakingPlan[]>;
  updatePaidStakingRewards(id: number, tokensClaimed: string, claimDate: Date): Promise<PaidStakingPlan>;
  markPaidStakingUnstaked(id: number, usdtReturned: string): Promise<PaidStakingPlan>;
  // Token Transactions
  logTokenTransaction(data: { walletAddress: string; txType: string; tokenAmount: string; usdtAmount?: string; priceAtTxn?: string; note?: string }): Promise<TokenTransaction>;
  getTokenTransactions(walletAddress: string): Promise<TokenTransaction[]>;
  // Virtual BTC
  getVirtualBtcBalance(walletAddress: string): Promise<VirtualBtcBalance | undefined>;
  creditVirtualBtcBalance(walletAddress: string, amount: string): Promise<VirtualBtcBalance>;
  deductVirtualBtcBalance(walletAddress: string, amount: string): Promise<VirtualBtcBalance>;
  createBtcSwapTxn(data: Omit<InsertBtcSwapTxn, "id">): Promise<BtcSwapTxn>;
  updateBtcSwapTxn(id: number, data: Partial<{ amountBtcb: string; bscTxHash: string; status: string; errorMessage: string }>): Promise<BtcSwapTxn>;
  getBtcSwapTxns(walletAddress: string): Promise<BtcSwapTxn[]>;
  getProducts(): Promise<HardwareProduct[]>;
  getProduct(id: string): Promise<HardwareProduct | undefined>;
  addProduct(product: Omit<HardwareProduct, "id">): Promise<HardwareProduct>;
  updateProduct(id: string, product: Partial<HardwareProduct>): Promise<HardwareProduct | undefined>;
  deleteProduct(id: string): Promise<boolean>;
  getOrders(walletAddress?: string): Promise<HardwareOrder[]>;
  createOrder(order: Omit<HardwareOrder, "id" | "createdAt">): Promise<HardwareOrder>;
  updateOrderStatus(id: string, status: string): Promise<HardwareOrder | undefined>;
  logStakingOverrideIncome(recipientWallet: string, fromWallet: string, amountUsdt: string, level: number): Promise<StakingOverrideIncome>;
  getStakingOverrideIncome(recipientWallet: string): Promise<StakingOverrideIncome[]>;
  findDepositByTxHash(txHash: string): Promise<UsdtDeposit | undefined>;
  recordUsdtDeposit(walletAddress: string, txHash: string, amount: string): Promise<UsdtDeposit>;
  getUsdtDeposits(walletAddress: string): Promise<UsdtDeposit[]>;
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

  async getTokenEconomics(): Promise<TokenEconomics> {
    const [row] = await db.select().from(tokenEconomics).limit(1);
    if (row) return row;
    return this.initTokenEconomics();
  }

  async initTokenEconomics(): Promise<TokenEconomics> {
    const [existing] = await db.select().from(tokenEconomics).limit(1);
    if (existing) return existing;
    const [row] = await db.insert(tokenEconomics).values({ liquidity: "0", circulatingSupply: "0", generatedVolume: "0", listingPrice: "0.036" }).returning();
    return row;
  }

  async updateTokenEconomics(data: Partial<{ liquidity: string; circulatingSupply: string; generatedVolume: string }>): Promise<TokenEconomics> {
    const [existing] = await db.select().from(tokenEconomics).limit(1);
    if (!existing) await this.initTokenEconomics();
    const set: any = { updatedAt: new Date() };
    if (data.liquidity !== undefined) set.liquidity = data.liquidity;
    if (data.circulatingSupply !== undefined) set.circulatingSupply = data.circulatingSupply;
    if (data.generatedVolume !== undefined) set.generatedVolume = data.generatedVolume;
    const [row] = await db.update(tokenEconomics).set(set).returning();
    return row;
  }

  async getVirtualUsdtBalance(walletAddress: string): Promise<VirtualUsdtBalance | undefined> {
    const [row] = await db.select().from(virtualUsdtBalances).where(eq(virtualUsdtBalances.walletAddress, walletAddress.toLowerCase()));
    return row;
  }

  async creditVirtualUsdt(walletAddress: string, amount: string): Promise<VirtualUsdtBalance> {
    const addr = walletAddress.toLowerCase();
    const [row] = await db.insert(virtualUsdtBalances)
      .values({ walletAddress: addr, balance: amount, totalDeposited: amount })
      .onConflictDoUpdate({
        target: virtualUsdtBalances.walletAddress,
        set: {
          balance: sql`${virtualUsdtBalances.balance}::numeric + ${amount}::numeric`,
          totalDeposited: sql`${virtualUsdtBalances.totalDeposited}::numeric + ${amount}::numeric`,
          updatedAt: new Date(),
        },
      }).returning();
    return row;
  }

  async deductVirtualUsdt(walletAddress: string, amount: string): Promise<VirtualUsdtBalance> {
    const [row] = await db.update(virtualUsdtBalances)
      .set({ balance: sql`${virtualUsdtBalances.balance}::numeric - ${amount}::numeric`, updatedAt: new Date() })
      .where(eq(virtualUsdtBalances.walletAddress, walletAddress.toLowerCase()))
      .returning();
    return row;
  }

  async getMTokenBalance(walletAddress: string): Promise<MTokenBalance | undefined> {
    const [row] = await db.select().from(mTokenBalances).where(eq(mTokenBalances.walletAddress, walletAddress.toLowerCase()));
    return row;
  }

  async addMTokenMainBalance(walletAddress: string, amount: string): Promise<MTokenBalance> {
    const addr = walletAddress.toLowerCase();
    const [row] = await db.insert(mTokenBalances)
      .values({ walletAddress: addr, mainBalance: amount })
      .onConflictDoUpdate({
        target: mTokenBalances.walletAddress,
        set: { mainBalance: sql`${mTokenBalances.mainBalance}::numeric + ${amount}::numeric`, updatedAt: new Date() },
      }).returning();
    return row;
  }

  async addMTokenRewardBalance(walletAddress: string, amount: string): Promise<MTokenBalance> {
    const addr = walletAddress.toLowerCase();
    const [row] = await db.insert(mTokenBalances)
      .values({ walletAddress: addr, rewardBalance: amount, totalRewardEarned: amount })
      .onConflictDoUpdate({
        target: mTokenBalances.walletAddress,
        set: {
          rewardBalance: sql`${mTokenBalances.rewardBalance}::numeric + ${amount}::numeric`,
          totalRewardEarned: sql`${mTokenBalances.totalRewardEarned}::numeric + ${amount}::numeric`,
          updatedAt: new Date(),
        },
      }).returning();
    return row;
  }

  async deductMTokenRewardBalance(walletAddress: string, amount: string): Promise<MTokenBalance> {
    const [row] = await db.update(mTokenBalances)
      .set({ rewardBalance: sql`${mTokenBalances.rewardBalance}::numeric - ${amount}::numeric`, updatedAt: new Date() })
      .where(eq(mTokenBalances.walletAddress, walletAddress.toLowerCase()))
      .returning();
    return row;
  }

  async deductMTokenMainBalance(walletAddress: string, amount: string): Promise<MTokenBalance> {
    const [row] = await db.update(mTokenBalances)
      .set({ mainBalance: sql`${mTokenBalances.mainBalance}::numeric - ${amount}::numeric`, updatedAt: new Date() })
      .where(eq(mTokenBalances.walletAddress, walletAddress.toLowerCase()))
      .returning();
    return row;
  }

  async createPaidStakingPlan(data: InsertPaidStakingPlan): Promise<PaidStakingPlan> {
    const [plan] = await db.insert(paidStakingPlans).values({ ...data, walletAddress: data.walletAddress.toLowerCase() }).returning();
    return plan;
  }

  async getActivePaidStakingPlan(walletAddress: string): Promise<PaidStakingPlan | undefined> {
    const [plan] = await db.select().from(paidStakingPlans)
      .where(and(eq(paidStakingPlans.walletAddress, walletAddress.toLowerCase()), eq(paidStakingPlans.isActive, true)));
    return plan;
  }

  async getAllPaidStakingPlans(walletAddress: string): Promise<PaidStakingPlan[]> {
    return db.select().from(paidStakingPlans)
      .where(eq(paidStakingPlans.walletAddress, walletAddress.toLowerCase()))
      .orderBy(desc(paidStakingPlans.startDate));
  }

  async updatePaidStakingRewards(id: number, tokensClaimed: string, claimDate: Date): Promise<PaidStakingPlan> {
    const [plan] = await db.update(paidStakingPlans)
      .set({
        totalRewardTokensClaimed: sql`${paidStakingPlans.totalRewardTokensClaimed}::numeric + ${tokensClaimed}::numeric`,
        lastRewardClaimDate: claimDate,
      })
      .where(eq(paidStakingPlans.id, id))
      .returning();
    return plan;
  }

  async markPaidStakingUnstaked(id: number, usdtReturned: string): Promise<PaidStakingPlan> {
    const [plan] = await db.update(paidStakingPlans)
      .set({ unstaked: true, isActive: false, unstakeDate: new Date(), usdtReturnedOnUnstake: usdtReturned })
      .where(eq(paidStakingPlans.id, id))
      .returning();
    return plan;
  }

  async logTokenTransaction(data: { walletAddress: string; txType: string; tokenAmount: string; usdtAmount?: string; priceAtTxn?: string; note?: string }): Promise<TokenTransaction> {
    const [txn] = await db.insert(tokenTransactions).values({
      walletAddress: data.walletAddress.toLowerCase(),
      txType: data.txType,
      tokenAmount: data.tokenAmount,
      usdtAmount: data.usdtAmount,
      priceAtTxn: data.priceAtTxn,
      note: data.note,
    }).returning();
    return txn;
  }

  async getTokenTransactions(walletAddress: string): Promise<TokenTransaction[]> {
    return db.select().from(tokenTransactions)
      .where(eq(tokenTransactions.walletAddress, walletAddress.toLowerCase()))
      .orderBy(desc(tokenTransactions.createdAt))
      .limit(50);
  }

  async getVirtualBtcBalance(walletAddress: string): Promise<VirtualBtcBalance | undefined> {
    const [row] = await db.select().from(virtualBtcBalances).where(eq(virtualBtcBalances.walletAddress, walletAddress.toLowerCase()));
    return row;
  }

  async creditVirtualBtcBalance(walletAddress: string, amount: string): Promise<VirtualBtcBalance> {
    const addr = walletAddress.toLowerCase();
    const [row] = await db.insert(virtualBtcBalances)
      .values({ walletAddress: addr, balance: amount, totalEarned: amount, totalSwapped: "0" })
      .onConflictDoUpdate({
        target: virtualBtcBalances.walletAddress,
        set: {
          balance: sql`${virtualBtcBalances.balance}::numeric + ${amount}::numeric`,
          totalEarned: sql`${virtualBtcBalances.totalEarned}::numeric + ${amount}::numeric`,
          updatedAt: new Date(),
        },
      })
      .returning();
    return row;
  }

  async deductVirtualBtcBalance(walletAddress: string, amount: string): Promise<VirtualBtcBalance> {
    const addr = walletAddress.toLowerCase();
    const [row] = await db.update(virtualBtcBalances)
      .set({
        balance: sql`${virtualBtcBalances.balance}::numeric - ${amount}::numeric`,
        totalSwapped: sql`${virtualBtcBalances.totalSwapped}::numeric + ${amount}::numeric`,
        updatedAt: new Date(),
      })
      .where(eq(virtualBtcBalances.walletAddress, addr))
      .returning();
    return row;
  }

  async createBtcSwapTxn(data: Omit<InsertBtcSwapTxn, "id">): Promise<BtcSwapTxn> {
    const [txn] = await db.insert(btcSwapTxns).values({
      ...data,
      walletAddress: data.walletAddress.toLowerCase(),
    }).returning();
    return txn;
  }

  async updateBtcSwapTxn(id: number, data: Partial<{ amountBtcb: string; bscTxHash: string; status: string; errorMessage: string }>): Promise<BtcSwapTxn> {
    const [txn] = await db.update(btcSwapTxns).set(data).where(eq(btcSwapTxns.id, id)).returning();
    return txn;
  }

  async getBtcSwapTxns(walletAddress: string): Promise<BtcSwapTxn[]> {
    return db.select().from(btcSwapTxns)
      .where(eq(btcSwapTxns.walletAddress, walletAddress.toLowerCase()))
      .orderBy(desc(btcSwapTxns.createdAt))
      .limit(20);
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

  async logStakingOverrideIncome(recipientWallet: string, fromWallet: string, amountUsdt: string, level: number): Promise<StakingOverrideIncome> {
    const [row] = await db.insert(stakingOverrideIncome).values({
      recipientWallet: recipientWallet.toLowerCase(),
      fromWallet: fromWallet.toLowerCase(),
      amountUsdt,
      level,
    }).returning();
    await this.creditVirtualUsdt(recipientWallet.toLowerCase(), amountUsdt);
    return row;
  }

  async getStakingOverrideIncome(recipientWallet: string): Promise<StakingOverrideIncome[]> {
    return db.select().from(stakingOverrideIncome)
      .where(eq(stakingOverrideIncome.recipientWallet, recipientWallet.toLowerCase()))
      .orderBy(desc(stakingOverrideIncome.createdAt));
  }

  async findDepositByTxHash(txHash: string): Promise<UsdtDeposit | undefined> {
    const [row] = await db.select().from(usdtDeposits).where(eq(usdtDeposits.txHash, txHash.toLowerCase()));
    return row;
  }

  async recordUsdtDeposit(walletAddress: string, txHash: string, amount: string): Promise<UsdtDeposit> {
    const [row] = await db.insert(usdtDeposits).values({
      walletAddress: walletAddress.toLowerCase(),
      txHash: txHash.toLowerCase(),
      amount,
      status: "confirmed",
    }).returning();
    return row;
  }

  async getUsdtDeposits(walletAddress: string): Promise<UsdtDeposit[]> {
    return db.select().from(usdtDeposits)
      .where(eq(usdtDeposits.walletAddress, walletAddress.toLowerCase()))
      .orderBy(desc(usdtDeposits.createdAt));
  }
}

export const storage = new DatabaseStorage();
