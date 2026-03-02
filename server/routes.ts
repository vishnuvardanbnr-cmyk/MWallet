import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertProfileSchema } from "@shared/schema";
import { z } from "zod";

const PACKAGE_PRICES: Record<number, number> = {
  1: 200,
  2: 600,
  3: 1200,
  4: 2400,
  5: 4800,
};

const selectStakingSchema = z.object({
  walletAddress: z.string().min(1),
  planMonths: z.enum(["15", "30"]).transform(Number),
  packageLevel: z.number().min(1).max(5),
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get("/api/profiles/:walletAddress", async (req, res) => {
    try {
      const profile = await storage.getProfile(req.params.walletAddress);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }
      res.json(profile);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/profiles", async (req, res) => {
    try {
      const parsed = insertProfileSchema.parse(req.body);
      const profile = await storage.upsertProfile(parsed);
      res.json(profile);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/staking/select", async (req, res) => {
    try {
      const parsed = selectStakingSchema.parse(req.body);
      const addr = parsed.walletAddress.toLowerCase();

      const existing = await storage.getActiveStakingPlan(addr);
      if (existing) {
        return res.status(400).json({ message: "You already have an active staking plan" });
      }

      const activationFee = PACKAGE_PRICES[parsed.packageLevel];
      if (!activationFee) {
        return res.status(400).json({ message: "Invalid package level" });
      }

      const TOKEN_PRICE = 0.0024;
      const multiplier = parsed.planMonths === 15 ? 1 : 2;
      const totalUsd = activationFee * multiplier;
      const totalTokens = totalUsd / TOKEN_PRICE;
      const totalDays = parsed.planMonths * 30;
      const dailyTokens = totalTokens / totalDays;

      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + totalDays);

      const plan = await storage.createStakingPlan({
        walletAddress: addr,
        planMonths: parsed.planMonths,
        activationFee: activationFee.toString(),
        totalTokens: totalTokens.toString(),
        dailyTokens: dailyTokens.toFixed(6),
        startDate,
        endDate,
      });

      res.json(plan);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get("/api/staking/:walletAddress", async (req, res) => {
    try {
      const plans = await storage.getStakingPlans(req.params.walletAddress);
      res.json(plans);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/staking/:walletAddress/active", async (req, res) => {
    try {
      const plan = await storage.getActiveStakingPlan(req.params.walletAddress);
      res.json(plan || null);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/staking/claim", async (req, res) => {
    try {
      const { walletAddress } = req.body;
      if (!walletAddress) {
        return res.status(400).json({ message: "Wallet address required" });
      }
      const addr = walletAddress.toLowerCase();
      const plan = await storage.getActiveStakingPlan(addr);
      if (!plan) {
        return res.status(400).json({ message: "No active staking plan found" });
      }

      const now = new Date();
      const endDate = new Date(plan.endDate);

      if (now > endDate) {
        now.setTime(endDate.getTime());
      }

      const startMs = new Date(plan.startDate).getTime();
      const totalElapsedDays = Math.floor((now.getTime() - startMs) / (1000 * 60 * 60 * 24));
      const dailyAmount = parseFloat(plan.dailyTokens);
      const alreadyClaimed = parseFloat(plan.claimedTokens);
      const totalAvailable = parseFloat(plan.totalTokens);
      const totalEarnedToDate = Math.min(totalElapsedDays * dailyAmount, totalAvailable);
      const claimable = totalEarnedToDate - alreadyClaimed;

      if (claimable < 0.001) {
        if (alreadyClaimed >= totalAvailable - 0.001) {
          return res.status(400).json({ message: "All tokens have been claimed for this plan" });
        }
        return res.status(400).json({ message: "No tokens available to claim yet. Come back tomorrow!" });
      }

      const finalClaim = Math.min(claimable, totalAvailable - alreadyClaimed);
      const daysSinceClaim = plan.lastClaimDate
        ? Math.floor((now.getTime() - new Date(plan.lastClaimDate).getTime()) / (1000 * 60 * 60 * 24))
        : totalElapsedDays;

      const claimStr = finalClaim.toFixed(6);
      const claimDays = Math.max(daysSinceClaim, 1);
      const updatedPlan = await storage.claimTokens(plan.id, claimStr);
      await storage.addToMwalletBalance(addr, claimStr);
      await storage.createStakingClaim({
        walletAddress: addr,
        planId: plan.id,
        amount: claimStr,
        daysCount: claimDays,
      });

      const newClaimed = parseFloat(updatedPlan.claimedTokens);
      if (newClaimed >= totalAvailable - 0.001) {
        const { db } = await import("./db");
        const { stakingPlans: stakingTable } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");
        await db.update(stakingTable).set({ isActive: false }).where(eq(stakingTable.id, plan.id));
      }

      res.json({
        claimed: claimStr,
        days: claimDays,
        totalClaimed: updatedPlan.claimedTokens,
        remaining: (totalAvailable - newClaimed).toFixed(6),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/staking/:walletAddress/claims", async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
      const page = Math.max(parseInt(req.query.page as string) || 1, 1);
      const offset = (page - 1) * limit;
      const result = await storage.getStakingClaims(req.params.walletAddress, limit, offset);
      res.json({ claims: result.claims, total: result.total, page, limit });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/mwallet/:walletAddress", async (req, res) => {
    try {
      const balance = await storage.getMwalletBalance(req.params.walletAddress);
      res.json(balance || { walletAddress: req.params.walletAddress.toLowerCase(), balance: "0", totalClaimed: "0" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/hardware/products", async (_req, res) => {
    const products = await storage.getProducts();
    res.json(products);
  });

  app.get("/api/hardware/products/:id", async (req, res) => {
    const product = await storage.getProduct(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  });

  app.post("/api/admin/products", async (req, res) => {
    const { name, description, price, image, category, inStock } = req.body;
    if (!name || !price) return res.status(400).json({ message: "Name and price are required" });
    const product = await storage.addProduct({
      name, description: description || "", price, image: image || "", category: category || "Hardware Wallet", inStock: inStock !== false,
    });
    res.status(201).json(product);
  });

  app.patch("/api/admin/products/:id", async (req, res) => {
    const updated = await storage.updateProduct(req.params.id, req.body);
    if (!updated) return res.status(404).json({ message: "Product not found" });
    res.json(updated);
  });

  app.delete("/api/admin/products/:id", async (req, res) => {
    const deleted = await storage.deleteProduct(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Product not found" });
    res.json({ message: "Product deleted" });
  });

  app.post("/api/hardware/orders", async (req, res) => {
    const { walletAddress, productId, quantity, totalPrice, shippingAddress } = req.body;
    if (!walletAddress || !productId) return res.status(400).json({ message: "Missing required fields" });
    const order = await storage.createOrder({
      walletAddress, productId, quantity: quantity || 1, totalPrice: totalPrice || 0, status: "pending", shippingAddress: shippingAddress || "",
    });
    res.status(201).json(order);
  });

  app.get("/api/hardware/orders", async (req, res) => {
    const walletAddress = req.query.wallet as string | undefined;
    const orders = await storage.getOrders(walletAddress);
    res.json(orders);
  });

  app.patch("/api/admin/orders/:id", async (req, res) => {
    const { status } = req.body;
    if (!status) return res.status(400).json({ message: "Status is required" });
    const updated = await storage.updateOrderStatus(req.params.id, status);
    if (!updated) return res.status(404).json({ message: "Order not found" });
    res.json(updated);
  });

  app.post("/api/support/tickets", async (req, res) => {
    try {
      const { walletAddress, subject, category, message, priority } = req.body;
      if (!walletAddress || !subject || !message) {
        return res.status(400).json({ message: "walletAddress, subject, and message are required" });
      }
      const ticket = await storage.createTicket({
        walletAddress: walletAddress.toLowerCase(),
        subject,
        category: category || "general",
        status: "open",
        priority: priority || "normal",
      });
      const firstMsg = await storage.addTicketMessage({
        ticketId: ticket.id,
        senderWallet: walletAddress.toLowerCase(),
        senderRole: "user",
        message,
      });
      res.json({ ticket, message: firstMsg });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/support/tickets", async (req, res) => {
    try {
      const wallet = req.query.wallet as string | undefined;
      const tickets = await storage.getTickets(wallet);
      res.json(tickets);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/support/tickets/:id", async (req, res) => {
    try {
      const ticket = await storage.getTicket(parseInt(req.params.id));
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });
      res.json(ticket);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/support/tickets/:id/messages", async (req, res) => {
    try {
      const ticketId = parseInt(req.params.id);
      const wallet = req.query.wallet as string;
      const ticket = await storage.getTicket(ticketId);
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });
      const isAdmin = wallet?.toLowerCase() === "0x127323b3053a901620f8d461c88fc6a7d9c7de2e";
      if (!isAdmin && ticket.walletAddress !== wallet?.toLowerCase()) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const messages = await storage.getTicketMessages(ticketId);
      res.json(messages);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/tickets", async (_req, res) => {
    try {
      const tickets = await storage.getTickets();
      res.json(tickets);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/admin/tickets/:id/status", async (req, res) => {
    try {
      const { status } = req.body;
      if (!status) return res.status(400).json({ message: "Status is required" });
      const updated = await storage.updateTicketStatus(parseInt(req.params.id), status);
      if (!updated) return res.status(404).json({ message: "Ticket not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  return httpServer;
}
