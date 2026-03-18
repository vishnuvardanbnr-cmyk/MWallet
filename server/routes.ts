import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertProfileSchema } from "@shared/schema";
import { z } from "zod";

const PACKAGE_PRICES: Record<number, number> = {
  1: 50,    // STARTER
  2: 200,   // BASIC
  3: 600,   // PRO
  4: 1200,  // ELITE
  5: 2400,  // STOCKIEST
  6: 4800,  // SUPER_STOCKIEST
};

const selectStakingSchema = z.object({
  walletAddress: z.string().min(1),
  planMonths: z.literal("10").transform(Number),
  packageLevel: z.number().min(1).max(6),
});

// Override rates per level (basis: 1.0 = 100%)
const OVERRIDE_RATES = [0, 0.01, 0.01, 0.01, 0.01, 0.01, 0.005, 0.005, 0.005, 0.005, 0.005, 0.005, 0.005, 0.005, 0.005, 0.005];
// Max levels eligible by package index (0=NONE,1=STARTER,2=BASIC,3=PRO,4=ELITE,5=STOCKIEST,6=SS)
const OVERRIDE_MAX_LEVELS = [0, 1, 2, 3, 4, 6, 15];

const BSC_TESTNET_RPC = "https://data-seed-prebsc-1-s1.binance.org:8545/";
const MLM_READ_ABI = [
  "function getUserInfo(address _user) external view returns (uint256 userId, address sponsor, address binaryParent, address leftChild, address rightChild, uint8 placementSide, uint8 userPackage, uint8 status, uint256 walletBalance, uint256 tempWalletBalance, uint256 totalEarnings, uint256 directReferralCount, uint256 joinedAt)",
];
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const MLM_CONTRACT_ADDR = "0x284dcb5C8F2407c135713a093A4fB42Ef2b1bCBF";

async function distributeStakingOverride(fromWallet: string, usdtProfit: number): Promise<void> {
  try {
    const { ethers } = await import("ethers");
    const provider = new ethers.JsonRpcProvider(BSC_TESTNET_RPC);
    const mlm = new ethers.Contract(MLM_CONTRACT_ADDR, MLM_READ_ABI, provider);

    let current = fromWallet;
    for (let level = 1; level <= 15; level++) {
      const info = await mlm.getUserInfo(current);
      const sponsor: string = info[1];
      if (!sponsor || sponsor === ZERO_ADDR) break;
      const pkg = Number(info[6]);
      const maxLevels = pkg >= 0 && pkg < OVERRIDE_MAX_LEVELS.length ? OVERRIDE_MAX_LEVELS[pkg] : 0;
      if (level <= maxLevels && pkg >= 1) {
        const rate = OVERRIDE_RATES[level] ?? 0;
        const amount = usdtProfit * rate;
        if (amount > 0) {
          await storage.logStakingOverrideIncome(sponsor, fromWallet, amount.toFixed(4), level);
        }
      }
      current = sponsor;
    }
  } catch (_err) {
    // Non-fatal — override distribution failure should not block user action
  }
}

// Runs hourly; distributes override income for each completed day across all active plans.
// Override is credited the moment a day elapses, independent of when users claim.
async function runDailyOverrideDistribution(): Promise<void> {
  try {
    const plans = await storage.getAllActivePaidStakingPlans();
    const now = new Date();
    // Midnight UTC of today as the cutoff
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    for (const plan of plans) {
      const baseline = plan.lastOverrideDate
        ? new Date(plan.lastOverrideDate)
        : new Date(plan.startDate);

      const msPerDay = 1000 * 60 * 60 * 24;
      const daysDue = Math.floor((todayStart.getTime() - baseline.getTime()) / msPerDay);
      if (daysDue <= 0) continue;

      const dailyUsdt = parseFloat(plan.dailyRewardUsdt as string);
      if (dailyUsdt <= 0) continue;

      // Cap backfill at 7 days to prevent flooding on first run for old plans
      const daysToProcess = Math.min(daysDue, 7);
      for (let d = 0; d < daysToProcess; d++) {
        await distributeStakingOverride(plan.walletAddress, dailyUsdt);
      }

      await storage.updatePlanOverrideDate(plan.id, todayStart);
    }
  } catch (_err) {
    // Non-fatal background job
  }
}

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

      const econ = await storage.getTokenEconomics();
      const TOKEN_PRICE = parseFloat(econ.listingPrice) || 0.0036;
      const multiplier = 0.1;
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
      const isValidation = err?.name === "ZodError";
      res.status(isValidation ? 400 : 500).json({ message: err.message || err.toString() });
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

  // ── Token Economics ────────────────────────────────────────────────────────

  // Helper: get current buy/sell price
  const getTokenPrice = async () => {
    const econ = await storage.getTokenEconomics();
    const listing = parseFloat(econ.listingPrice);
    const liquidity = parseFloat(econ.liquidity);
    const supply = parseFloat(econ.circulatingSupply);
    const buyPrice = (supply > 0 && liquidity > 0) ? Math.max(listing, liquidity / supply) : listing;
    const sellPrice = buyPrice * 0.9;
    return { buyPrice, sellPrice, econ };
  };

  // Ensure token economics row exists on startup
  storage.initTokenEconomics().catch(() => {});

  // GET /api/token/price
  app.get("/api/token/price", async (_req, res) => {
    try {
      const { buyPrice, sellPrice, econ } = await getTokenPrice();
      res.json({
        buyPrice: buyPrice.toFixed(8),
        sellPrice: sellPrice.toFixed(8),
        listingPrice: econ.listingPrice,
        liquidity: econ.liquidity,
        circulatingSupply: econ.circulatingSupply,
        generatedVolume: econ.generatedVolume,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/usdt/credit  (admin credits virtual USDT to a user)
  app.post("/api/usdt/credit", async (req, res) => {
    try {
      const { walletAddress, amount } = req.body;
      if (!walletAddress || !amount || parseFloat(amount) <= 0) {
        return res.status(400).json({ message: "walletAddress and positive amount required" });
      }
      const result = await storage.creditVirtualUsdt(walletAddress, amount.toString());
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/usdt/deposit-verify — verify Deposited event from BoardMatrixHandler vault contract
  app.post("/api/usdt/deposit-verify", async (req, res) => {
    try {
      const { walletAddress, txHash, claimedAmount } = req.body;
      if (!walletAddress || !txHash || !claimedAmount || parseFloat(claimedAmount) <= 0) {
        return res.status(400).json({ message: "walletAddress, txHash and positive claimedAmount required" });
      }
      const addr = walletAddress.toLowerCase();
      const hash = txHash.toLowerCase();

      // Prevent double-crediting same txHash
      const existing = await storage.findDepositByTxHash(hash);
      if (existing) {
        return res.status(409).json({ message: "This transaction has already been processed" });
      }

      const { ethers } = await import("ethers");
      const provider = new ethers.JsonRpcProvider(BSC_TESTNET_RPC);

      const receipt = await provider.getTransactionReceipt(hash);
      if (!receipt) {
        return res.status(400).json({ message: "Transaction not found on-chain. Please wait for confirmation and try again." });
      }
      if (!receipt.status) {
        return res.status(400).json({ message: "Transaction failed on-chain" });
      }

      // Verify the Deposited(address indexed user, uint256 amount) event from BoardMatrixHandler
      const BOARD_HANDLER = "0x0C63B585586E263DC801554d40A72F84976FdCfc".toLowerCase();
      const DEPOSITED_TOPIC = ethers.id("Deposited(address,uint256)").toLowerCase();

      let verifiedAmount: string | null = null;
      for (const log of receipt.logs) {
        if (
          log.address.toLowerCase() === BOARD_HANDLER &&
          log.topics[0]?.toLowerCase() === DEPOSITED_TOPIC &&
          log.topics.length >= 2
        ) {
          const user = "0x" + log.topics[1].slice(26);
          if (user.toLowerCase() === addr) {
            const rawAmount = ethers.getBigInt(log.data);
            const humanAmount = parseFloat(ethers.formatUnits(rawAmount, 18));
            const claimed = parseFloat(claimedAmount);
            // Allow ±1% tolerance for rounding
            if (Math.abs(humanAmount - claimed) / claimed < 0.01) {
              verifiedAmount = humanAmount.toFixed(4);
            }
            break;
          }
        }
      }

      if (!verifiedAmount) {
        return res.status(400).json({ message: "Could not verify deposit event in this transaction. Ensure the deposit was made via the M-Vault interface." });
      }

      await storage.recordUsdtDeposit(addr, hash, verifiedAmount);
      await storage.creditVirtualUsdt(addr, verifiedAmount);

      res.json({ success: true, amount: verifiedAmount, message: `$${verifiedAmount} USDT credited to your virtual balance` });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET /api/usdt/deposits/:walletAddress — deposit history
  app.get("/api/usdt/deposits/:walletAddress", async (req, res) => {
    try {
      const deposits = await storage.getUsdtDeposits(req.params.walletAddress);
      res.json(deposits);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET /api/usdt/:walletAddress
  app.get("/api/usdt/:walletAddress", async (req, res) => {
    try {
      const bal = await storage.getVirtualUsdtBalance(req.params.walletAddress);
      res.json({ balance: bal?.balance ?? "0", totalDeposited: bal?.totalDeposited ?? "0" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Leadership Rewards ──────────────────────────────────────────────────────

  const STAR_RANK_DATA: Record<number, { totalQual: number; allocation: number }> = {
    1:  { totalQual: 5_000,       allocation: 250 },
    2:  { totalQual: 20_000,      allocation: 1_000 },
    3:  { totalQual: 50_000,      allocation: 2_500 },
    4:  { totalQual: 100_000,     allocation: 8_000 },
    5:  { totalQual: 500_000,     allocation: 40_000 },
    6:  { totalQual: 1_000_000,   allocation: 80_000 },
    7:  { totalQual: 5_000_000,   allocation: 400_000 },
    8:  { totalQual: 10_000_000,  allocation: 1_000_000 },
    9:  { totalQual: 50_000_000,  allocation: 5_000_000 },
    10: { totalQual: 100_000_000, allocation: 10_000_000 },
  };

  // GET /api/leadership/:walletAddress — returns claimed star ranks
  app.get("/api/leadership/:walletAddress", async (req, res) => {
    try {
      const claimed = await storage.getClaimedLeadershipRanks(req.params.walletAddress);
      res.json(claimed);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/leadership/claim — claim a star rank reward as virtual USDT
  app.post("/api/leadership/claim", async (req, res) => {
    try {
      const { walletAddress, starRank, leftBusiness, rightBusiness } = req.body;
      if (!walletAddress || !starRank || leftBusiness == null || rightBusiness == null) {
        return res.status(400).json({ message: "walletAddress, starRank, leftBusiness, rightBusiness are required" });
      }
      const rank = parseInt(starRank);
      if (!STAR_RANK_DATA[rank]) {
        return res.status(400).json({ message: "Invalid star rank (must be 1-10)" });
      }

      const rankInfo = STAR_RANK_DATA[rank];
      const left = parseFloat(leftBusiness);
      const right = parseFloat(rightBusiness);
      const minLeg = Math.min(left, right);
      const required = rankInfo.totalQual / 2;

      if (minLeg < required) {
        return res.status(400).json({ message: `Not qualified: weaker leg needs $${required.toLocaleString()} USDT, currently $${minLeg.toFixed(2)}` });
      }

      const addr = walletAddress.toLowerCase();
      const alreadyClaimed = await storage.hasClaimedLeadershipRank(addr, rank);
      if (alreadyClaimed) {
        return res.status(400).json({ message: `Star ${rank} reward already claimed` });
      }

      const usdtAmt = rankInfo.allocation;
      const allocationStr = usdtAmt.toFixed(4);
      const reward = await storage.claimLeadershipReward(addr, rank, allocationStr);

      // Auto-create a paid staking plan with the rank reward instead of crediting virtual wallet
      const { buyPrice } = await getTokenPrice();
      const theoreticalTokens = usdtAmt / buyPrice;
      const mintedTokens = theoreticalTokens * 0.9;
      const userTokens   = theoreticalTokens * 0.7;
      const adminTokens  = theoreticalTokens * 0.2;
      const dailyRewardUsdt = usdtAmt * 0.003; // 0.3% daily

      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 10);

      const stakingPlan = await storage.createPaidStakingPlan({
        walletAddress: addr,
        usdtInvested:        usdtAmt.toFixed(4),
        buyPriceAtEntry:     buyPrice.toFixed(8),
        totalTokensMinted:   mintedTokens.toFixed(8),
        userTokens:          userTokens.toFixed(8),
        adminTokens:         adminTokens.toFixed(8),
        dailyRewardUsdt:     dailyRewardUsdt.toFixed(4),
        startDate,
        endDate,
      });

      // Update global token economics
      const econ = await storage.getTokenEconomics();
      await storage.updateTokenEconomics({
        circulatingSupply: (parseFloat(econ.circulatingSupply) + mintedTokens).toFixed(8),
        liquidity:         (parseFloat(econ.liquidity) + usdtAmt).toFixed(8),
      });

      // Credit tokens to user's M-token balance
      await storage.addMTokenMainBalance(addr, userTokens.toFixed(8));

      // Log the staking transaction
      await storage.logTokenTransaction({
        walletAddress: addr,
        txType:      "paid_stake",
        tokenAmount: mintedTokens.toFixed(8),
        usdtAmount:  usdtAmt.toFixed(4),
        priceAtTxn:  buyPrice.toFixed(8),
        note:        `Auto-staked Star ${rank} rank reward: $${usdtAmt.toLocaleString()} USDT`,
      });

      res.json({
        reward,
        stakingPlan,
        autoStaked: allocationStr,
        message: `$${rankInfo.allocation.toLocaleString()} USDT auto-staked for Star ${rank} rank! Earning $${dailyRewardUsdt.toFixed(2)}/day starting now.`,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Paid Staking ────────────────────────────────────────────────────────────

  // GET /api/paidstaking/:walletAddress
  app.get("/api/paidstaking/:walletAddress", async (req, res) => {
    try {
      const addr = req.params.walletAddress.toLowerCase();
      const [activePlan, allPlans, mTokenBal, usdtBal, tokenTxns, overrideIncome] = await Promise.all([
        storage.getActivePaidStakingPlan(addr),
        storage.getAllPaidStakingPlans(addr),
        storage.getMTokenBalance(addr),
        storage.getVirtualUsdtBalance(addr),
        storage.getTokenTransactions(addr),
        storage.getStakingOverrideIncome(addr),
      ]);
      const { buyPrice, sellPrice } = await getTokenPrice();
      const overrideTotal = overrideIncome.reduce((s, r) => s + parseFloat(r.amountUsdt), 0);
      res.json({
        activePlan,
        allPlans,
        mTokenBalance: mTokenBal,
        usdtBalance: usdtBal?.balance ?? "0",
        currentBuyPrice: buyPrice.toFixed(8),
        currentSellPrice: sellPrice.toFixed(8),
        tokenTransactions: tokenTxns,
        overrideIncome,
        overrideTotalUsdt: overrideTotal.toFixed(4),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/paidstaking/stake
  app.post("/api/paidstaking/stake", async (req, res) => {
    try {
      const { walletAddress, usdtAmount } = req.body;
      if (!walletAddress || !usdtAmount || parseFloat(usdtAmount) <= 0) {
        return res.status(400).json({ message: "walletAddress and positive usdtAmount required" });
      }
      const usdtAmt = parseFloat(usdtAmount);
      const addr = walletAddress.toLowerCase();

      // Check virtual USDT balance
      const usdtBal = await storage.getVirtualUsdtBalance(addr);
      if (!usdtBal || parseFloat(usdtBal.balance) < usdtAmt) {
        return res.status(400).json({ message: "Insufficient virtual USDT balance" });
      }

      const { buyPrice } = await getTokenPrice();

      // Token calculations
      const theoreticalTokens = usdtAmt / buyPrice;
      const mintedTokens = theoreticalTokens * 0.9;       // mint 90%
      const userTokens = theoreticalTokens * 0.7;          // user gets 70%
      const adminTokens = theoreticalTokens * 0.2;         // admin gets 20%
      const dailyRewardUsdt = usdtAmt * 0.003;             // 0.3% daily of invested USDT

      // Deduct USDT from user, add to liquidity (USDT backs the token supply)
      await storage.deductVirtualUsdt(addr, usdtAmt.toString());

      // Update circulating supply and liquidity
      const econ = await storage.getTokenEconomics();
      const newSupply = parseFloat(econ.circulatingSupply) + mintedTokens;
      const newLiquidity = parseFloat(econ.liquidity) + usdtAmt;
      await storage.updateTokenEconomics({
        circulatingSupply: newSupply.toFixed(8),
        liquidity: newLiquidity.toFixed(8),
      });

      // Add user's tokens to their M token main balance
      await storage.addMTokenMainBalance(addr, userTokens.toFixed(8));

      // Create the staking plan
      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 10); // 10 months

      const plan = await storage.createPaidStakingPlan({
        walletAddress: addr,
        usdtInvested: usdtAmt.toFixed(4),
        buyPriceAtEntry: buyPrice.toFixed(8),
        totalTokensMinted: mintedTokens.toFixed(8),
        userTokens: userTokens.toFixed(8),
        adminTokens: adminTokens.toFixed(8),
        dailyRewardUsdt: dailyRewardUsdt.toFixed(4),
        startDate,
        endDate,
      });

      // Log transaction
      await storage.logTokenTransaction({
        walletAddress: addr,
        txType: "paid_stake",
        tokenAmount: mintedTokens.toFixed(8),
        usdtAmount: usdtAmt.toFixed(4),
        priceAtTxn: buyPrice.toFixed(8),
        note: `Staked $${usdtAmt} USDT. User: ${userTokens.toFixed(2)} tokens, Admin: ${adminTokens.toFixed(2)} tokens`,
      });

      res.json({ plan, mintedTokens: mintedTokens.toFixed(8), userTokens: userTokens.toFixed(8), adminTokens: adminTokens.toFixed(8), buyPriceUsed: buyPrice.toFixed(8) });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/paidstaking/claim-rewards
  app.post("/api/paidstaking/claim-rewards", async (req, res) => {
    try {
      const { walletAddress } = req.body;
      if (!walletAddress) return res.status(400).json({ message: "walletAddress required" });
      const addr = walletAddress.toLowerCase();

      const plan = await storage.getActivePaidStakingPlan(addr);
      if (!plan) return res.status(404).json({ message: "No active paid staking plan found" });

      const now = new Date();
      const lastClaim = plan.lastRewardClaimDate ? new Date(plan.lastRewardClaimDate) : new Date(plan.startDate);
      const daysSince = Math.floor((now.getTime() - lastClaim.getTime()) / (1000 * 60 * 60 * 24));

      if (daysSince < 1) return res.status(400).json({ message: "Rewards can only be claimed once per day" });

      const { buyPrice } = await getTokenPrice();
      const dailyUsdtValue = parseFloat(plan.dailyRewardUsdt);
      const totalUsdtReward = dailyUsdtValue * daysSince;
      const rewardTokens = totalUsdtReward / buyPrice; // convert to tokens at current price

      // Add to user's reward balance (generated volume, not circulating supply)
      await storage.addMTokenRewardBalance(addr, rewardTokens.toFixed(8));

      // Update generated volume
      const econ = await storage.getTokenEconomics();
      const newGenVol = parseFloat(econ.generatedVolume) + rewardTokens;
      await storage.updateTokenEconomics({ generatedVolume: newGenVol.toFixed(8) });

      // Update plan
      await storage.updatePaidStakingRewards(plan.id, rewardTokens.toFixed(8), now);

      await storage.logTokenTransaction({
        walletAddress: addr,
        txType: "paid_stake_reward",
        tokenAmount: rewardTokens.toFixed(8),
        usdtAmount: totalUsdtReward.toFixed(4),
        priceAtTxn: buyPrice.toFixed(8),
        note: `${daysSince} day(s) reward @ $${dailyUsdtValue.toFixed(4)}/day`,
      });

      res.json({ rewardTokens: rewardTokens.toFixed(8), daysRewarded: daysSince, usdtValue: totalUsdtReward.toFixed(4), priceUsed: buyPrice.toFixed(8) });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/paidstaking/claim-usdt-rewards — withdraw daily staking rewards directly as USDT
  app.post("/api/paidstaking/claim-usdt-rewards", async (req, res) => {
    try {
      const { walletAddress } = req.body;
      if (!walletAddress) return res.status(400).json({ message: "walletAddress required" });
      const addr = walletAddress.toLowerCase();

      const plan = await storage.getActivePaidStakingPlan(addr);
      if (!plan) return res.status(404).json({ message: "No active paid staking plan found" });

      const now = new Date();
      const lastClaim = plan.lastRewardClaimDate ? new Date(plan.lastRewardClaimDate) : new Date(plan.startDate);
      const daysSince = Math.floor((now.getTime() - lastClaim.getTime()) / (1000 * 60 * 60 * 24));

      if (daysSince < 1) return res.status(400).json({ message: "Rewards can only be claimed once per day" });

      const dailyUsdtValue = parseFloat(plan.dailyRewardUsdt);
      const totalUsdtReward = dailyUsdtValue * daysSince;

      await storage.creditVirtualUsdt(addr, totalUsdtReward.toFixed(4));
      await storage.updatePaidStakingRewards(plan.id, "0", now);

      await storage.logTokenTransaction({
        walletAddress: addr,
        txType: "paid_stake_usdt_claim",
        tokenAmount: "0",
        usdtAmount: totalUsdtReward.toFixed(4),
        priceAtTxn: "0",
        note: `Daily USDT claim: ${daysSince} day(s) × $${dailyUsdtValue.toFixed(4)}/day`,
      });

      res.json({ usdtClaimed: totalUsdtReward.toFixed(4), daysRewarded: daysSince });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/paidstaking/sell-main-tokens  (sell main M-Token balance → USDT, burned from circulating supply)
  app.post("/api/paidstaking/sell-main-tokens", async (req, res) => {
    try {
      const { walletAddress, tokenAmount } = req.body;
      if (!walletAddress || !tokenAmount || parseFloat(tokenAmount) <= 0) {
        return res.status(400).json({ message: "walletAddress and positive tokenAmount required" });
      }
      const addr = walletAddress.toLowerCase();
      const tokens = parseFloat(tokenAmount);

      const mBal = await storage.getMTokenBalance(addr);
      const mainBal = parseFloat(mBal?.mainBalance ?? "0");
      if (mainBal < tokens) {
        return res.status(400).json({ message: "Insufficient M-Token main balance" });
      }

      const { sellPrice } = await getTokenPrice();
      const usdtOut = tokens * sellPrice;

      await storage.deductMTokenMainBalance(addr, tokens.toFixed(8));
      const econ = await storage.getTokenEconomics();
      const newSupply = Math.max(0, parseFloat(econ.circulatingSupply) - tokens);
      const newLiquidity = Math.max(0, parseFloat(econ.liquidity) - usdtOut);
      await storage.updateTokenEconomics({
        circulatingSupply: newSupply.toFixed(8),
        liquidity: newLiquidity.toFixed(8),
      });

      await storage.creditVirtualUsdt(addr, usdtOut.toFixed(4));

      await storage.logTokenTransaction({
        walletAddress: addr,
        txType: "sell_main_tokens",
        tokenAmount: tokens.toFixed(8),
        usdtAmount: usdtOut.toFixed(4),
        priceAtTxn: sellPrice.toFixed(8),
        note: `Sold ${tokens.toFixed(4)} M Tokens at sell price $${sellPrice.toFixed(8)}`,
      });

      res.json({ usdtReceived: usdtOut.toFixed(4), tokensBurned: tokens.toFixed(8), sellPriceUsed: sellPrice.toFixed(8) });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/paidstaking/sell-rewards  (sell reward tokens → USDT, burned from circulating supply)
  app.post("/api/paidstaking/sell-rewards", async (req, res) => {
    try {
      const { walletAddress, tokenAmount } = req.body;
      if (!walletAddress || !tokenAmount || parseFloat(tokenAmount) <= 0) {
        return res.status(400).json({ message: "walletAddress and positive tokenAmount required" });
      }
      const addr = walletAddress.toLowerCase();
      const tokens = parseFloat(tokenAmount);

      const mBal = await storage.getMTokenBalance(addr);
      const rewardBal = parseFloat(mBal?.rewardBalance ?? "0");
      if (rewardBal < tokens) return res.status(400).json({ message: "Insufficient reward token balance" });

      const { sellPrice } = await getTokenPrice();
      const usdtOut = tokens * sellPrice;

      // Deduct reward balance, decrement circulating supply (burns as main token), decrement liquidity
      await storage.deductMTokenRewardBalance(addr, tokens.toFixed(8));
      const econ = await storage.getTokenEconomics();
      const newSupply = Math.max(0, parseFloat(econ.circulatingSupply) - tokens);
      const newLiquidity = Math.max(0, parseFloat(econ.liquidity) - usdtOut);
      const newGenVol = Math.max(0, parseFloat(econ.generatedVolume) - tokens);
      await storage.updateTokenEconomics({
        circulatingSupply: newSupply.toFixed(8),
        liquidity: newLiquidity.toFixed(8),
        generatedVolume: newGenVol.toFixed(8),
      });

      // Credit virtual USDT to user
      await storage.creditVirtualUsdt(addr, usdtOut.toFixed(4));

      await storage.logTokenTransaction({
        walletAddress: addr,
        txType: "sell_rewards",
        tokenAmount: tokens.toFixed(8),
        usdtAmount: usdtOut.toFixed(4),
        priceAtTxn: sellPrice.toFixed(8),
        note: `Sold ${tokens.toFixed(4)} reward tokens at sell price $${sellPrice.toFixed(8)}`,
      });

      res.json({ usdtReceived: usdtOut.toFixed(4), tokensBurned: tokens.toFixed(8), sellPriceUsed: sellPrice.toFixed(8) });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/paidstaking/unstake  (after 10 months)
  app.post("/api/paidstaking/unstake", async (req, res) => {
    try {
      const { walletAddress } = req.body;
      if (!walletAddress) return res.status(400).json({ message: "walletAddress required" });
      const addr = walletAddress.toLowerCase();

      const plan = await storage.getActivePaidStakingPlan(addr);
      if (!plan) return res.status(404).json({ message: "No active paid staking plan" });

      const now = new Date();
      const endDate = new Date(plan.endDate);
      if (now < endDate) {
        const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return res.status(400).json({ message: `Staking period not ended. ${daysLeft} days remaining.` });
      }

      const { sellPrice } = await getTokenPrice();
      const userTokens = parseFloat(plan.userTokens);
      const usdtFromTokens = userTokens * sellPrice;              // USDT from selling 70% tokens
      const usdtBonus = parseFloat(plan.usdtInvested) * 0.2;     // 20% of original investment from admin

      // Burn user's 70% staked tokens from circulating supply, remove USDT from liquidity
      await storage.deductMTokenMainBalance(addr, userTokens.toFixed(8));
      const econ = await storage.getTokenEconomics();
      const newSupply = Math.max(0, parseFloat(econ.circulatingSupply) - userTokens);
      const newLiquidity = Math.max(0, parseFloat(econ.liquidity) - usdtFromTokens);
      await storage.updateTokenEconomics({
        circulatingSupply: newSupply.toFixed(8),
        liquidity: newLiquidity.toFixed(8),
      });

      // Credit USDT to user (token proceeds + 20% bonus)
      const totalUsdt = usdtFromTokens + usdtBonus;
      await storage.creditVirtualUsdt(addr, totalUsdt.toFixed(4));

      // Mark plan as unstaked
      await storage.markPaidStakingUnstaked(plan.id, totalUsdt.toFixed(4));

      await storage.logTokenTransaction({
        walletAddress: addr,
        txType: "unstake",
        tokenAmount: userTokens.toFixed(8),
        usdtAmount: totalUsdt.toFixed(4),
        priceAtTxn: sellPrice.toFixed(8),
        note: `Unstaked: ${userTokens.toFixed(2)} tokens burned → $${usdtFromTokens.toFixed(2)} USDT + $${usdtBonus.toFixed(2)} bonus`,
      });

      res.json({ usdtReceived: totalUsdt.toFixed(4), fromTokens: usdtFromTokens.toFixed(4), bonusUsdt: usdtBonus.toFixed(4), tokensBurned: userTokens.toFixed(8), sellPriceUsed: sellPrice.toFixed(8) });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET /api/paidstaking/override-income/:walletAddress
  app.get("/api/paidstaking/override-income/:walletAddress", async (req, res) => {
    try {
      const addr = req.params.walletAddress.toLowerCase();
      const rows = await storage.getStakingOverrideIncome(addr);
      const total = rows.reduce((sum, r) => sum + parseFloat(r.amountUsdt), 0);
      res.json({ records: rows, totalUsdt: total.toFixed(4) });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET /api/token/transactions/:walletAddress
  app.get("/api/token/transactions/:walletAddress", async (req, res) => {
    try {
      const txns = await storage.getTokenTransactions(req.params.walletAddress);
      res.json(txns);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── BTC Swap via backend liquidity wallet ──────────────────────────────────

  const BOARD_HANDLER_TESTNET = "0x0C63B585586E263DC801554d40A72F84976FdCfc";
  const BOARD_HANDLER_SYNC_ABI = ["function totalVirtualRewards(address) view returns (uint256)"];

  // POST /api/btcswap/sync/:walletAddress — sync on-chain board rewards to backend virtual balance
  // Reads totalVirtualRewards from BoardMatrixHandler (BSC testnet) and credits any new earnings
  app.post("/api/btcswap/sync/:walletAddress", async (req, res) => {
    try {
      const addr = req.params.walletAddress.toLowerCase();
      const { ethers } = await import("ethers");
      const provider = new ethers.JsonRpcProvider(BSC_TESTNET_RPC);
      const boardContract = new ethers.Contract(BOARD_HANDLER_TESTNET, BOARD_HANDLER_SYNC_ABI, provider);

      const onChainTotalWei: bigint = await boardContract.totalVirtualRewards(addr);
      const onChainTotal = parseFloat(ethers.formatUnits(onChainTotalWei, 18));

      const vBalance = await storage.getVirtualBtcBalance(addr);
      const dbTotalEarned = parseFloat(vBalance?.totalEarned ?? "0");

      const diff = onChainTotal - dbTotalEarned;
      if (diff > 0.0001) {
        await storage.creditVirtualBtcBalance(addr, diff.toFixed(4));
      }

      const updated = await storage.getVirtualBtcBalance(addr);
      res.json({
        synced: diff > 0.0001,
        newCredits: diff > 0.0001 ? diff.toFixed(4) : "0",
        balance: updated?.balance ?? "0",
        totalEarned: updated?.totalEarned ?? "0",
        totalSwapped: updated?.totalSwapped ?? "0",
        history: await storage.getBtcSwapTxns(addr),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  const BSC_RPC = "https://bsc-dataseed.binance.org/";
  const PANCAKE_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
  const USDT_BSC = "0x55d398326f99059fF775485246999027B3197955";
  const BTCB_BSC = "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c";
  const MIN_SWAP_USDT = 10;

  const PANCAKE_ABI = [
    "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts)",
    "function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts)",
  ];
  const ERC20_ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) external view returns (uint256)",
    "function balanceOf(address account) external view returns (uint256)",
  ];

  // GET /api/btcswap/:walletAddress — balance + swap history
  app.get("/api/btcswap/:walletAddress", async (req, res) => {
    try {
      const addr = req.params.walletAddress.toLowerCase();
      const [balance, history] = await Promise.all([
        storage.getVirtualBtcBalance(addr),
        storage.getBtcSwapTxns(addr),
      ]);
      res.json({
        balance: balance?.balance ?? "0",
        totalEarned: balance?.totalEarned ?? "0",
        totalSwapped: balance?.totalSwapped ?? "0",
        history,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/btcswap/credit — admin credits virtual BTC balance to a user
  app.post("/api/btcswap/credit", async (req, res) => {
    try {
      const { walletAddress, amount } = req.body;
      if (!walletAddress || !amount || parseFloat(amount) <= 0) {
        return res.status(400).json({ message: "walletAddress and positive amount required" });
      }
      const result = await storage.creditVirtualBtcBalance(walletAddress, amount.toString());
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/btcswap/execute — swap virtual USDT → BTCB on BSC via liquidity wallet
  app.post("/api/btcswap/execute", async (req, res) => {
    const { walletAddress, amountUsdt } = req.body;
    if (!walletAddress || !amountUsdt) {
      return res.status(400).json({ message: "walletAddress and amountUsdt are required" });
    }
    const amount = parseFloat(amountUsdt);
    if (isNaN(amount) || amount < MIN_SWAP_USDT) {
      return res.status(400).json({ message: `Minimum swap amount is $${MIN_SWAP_USDT}` });
    }

    // Check user virtual balance
    const vBalance = await storage.getVirtualBtcBalance(walletAddress);
    const available = parseFloat(vBalance?.balance ?? "0");
    if (available < amount) {
      return res.status(400).json({ message: "Insufficient virtual BTC balance" });
    }

    // Check liquidity wallet key is configured
    const liquidityKey = process.env.BTC_LIQUIDITY_WALLET_PRIVATE_KEY;
    if (!liquidityKey || liquidityKey.length < 10) {
      return res.status(503).json({ message: "BTC swap service not configured. Contact admin." });
    }

    // Create a pending txn record first
    const txnRecord = await storage.createBtcSwapTxn({
      walletAddress,
      amountUsdt: amount.toString(),
      status: "pending",
    });

    // Execute swap asynchronously — respond immediately with txn ID
    res.json({ txnId: txnRecord.id, status: "pending", message: "Swap initiated. Check status shortly." });

    // Background execution
    (async () => {
      try {
        const { ethers } = await import("ethers");
        const provider = new ethers.JsonRpcProvider(BSC_RPC);
        const wallet = new ethers.Wallet(liquidityKey, provider);

        const usdtContract = new ethers.Contract(USDT_BSC, ERC20_ABI, wallet);
        const routerContract = new ethers.Contract(PANCAKE_ROUTER, PANCAKE_ABI, wallet);

        const amountWei = ethers.parseUnits(amount.toFixed(4), 18);

        // Check liquidity wallet USDT balance
        const usdtBalance: bigint = await usdtContract.balanceOf(wallet.address);
        if (usdtBalance < amountWei) {
          await storage.updateBtcSwapTxn(txnRecord.id, { status: "failed", errorMessage: "Liquidity wallet has insufficient USDT" });
          return;
        }

        // Approve router if needed
        const allowance: bigint = await usdtContract.allowance(wallet.address, PANCAKE_ROUTER);
        if (allowance < amountWei) {
          const approveTx = await usdtContract.approve(PANCAKE_ROUTER, ethers.MaxUint256);
          await approveTx.wait();
        }

        // Get estimated BTCB output
        const path = [USDT_BSC, BTCB_BSC];
        const amounts: bigint[] = await routerContract.getAmountsOut(amountWei, path);
        const estimatedBtcb = amounts[1];
        const minOut = (estimatedBtcb * 97n) / 100n; // 3% slippage tolerance

        // Execute swap — send BTCB directly to user's wallet
        const deadline = Math.floor(Date.now() / 1000) + 300; // 5 min
        const swapTx = await routerContract.swapExactTokensForTokens(
          amountWei,
          minOut,
          path,
          walletAddress,
          deadline,
        );
        const receipt = await swapTx.wait();

        const btcbReceived = ethers.formatUnits(estimatedBtcb, 18);

        // Deduct from user's virtual balance and update txn
        await storage.deductVirtualBtcBalance(walletAddress, amount.toString());
        await storage.updateBtcSwapTxn(txnRecord.id, {
          status: "completed",
          bscTxHash: receipt.hash,
          amountBtcb: btcbReceived,
        });
      } catch (err: any) {
        await storage.updateBtcSwapTxn(txnRecord.id, {
          status: "failed",
          errorMessage: err?.reason || err?.message || "Unknown error",
        });
      }
    })();
  });

  // GET /api/btcswap/txn/:id — check swap status
  app.get("/api/btcswap/txn/:id", async (req, res) => {
    try {
      const { btcSwapTxns: txnTable } = await import("@shared/schema");
      const { db } = await import("./db");
      const { eq } = await import("drizzle-orm");
      const [txn] = await db.select().from(txnTable).where(eq(txnTable.id, parseInt(req.params.id)));
      if (!txn) return res.status(404).json({ message: "Transaction not found" });
      res.json(txn);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Distribute staking override income daily for all active plans, independent of user claims
  runDailyOverrideDistribution(); // run once immediately on startup to catch any missed days
  setInterval(runDailyOverrideDistribution, 60 * 60 * 1000); // then every hour

  return httpServer;
}
