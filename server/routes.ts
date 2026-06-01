import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertProfileSchema, kvStore } from "@shared/schema";
import { z } from "zod";
import { MCHAIN_RPC, MVAULT_CONTRACT, BOARD_HANDLER as BOARD_HANDLER_ADDR, ADMIN_WALLET as ADMIN_WALLET_CFG } from "./config";
import { db } from "./db";
import { eq } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";

// ── APK upload setup ──────────────────────────────────────────────────────────
const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const apkStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, _file, cb) => cb(null, "mwallet.apk"),
});
const apkUpload = multer({
  storage: apkStorage,
  limits: { fileSize: 250 * 1024 * 1024 }, // 250 MB
  fileFilter: (_req, file, cb) => {
    const ok = file.originalname.endsWith(".apk") || file.mimetype === "application/vnd.android.package-archive" || file.mimetype === "application/octet-stream";
    cb(null, ok);
  },
});

// Override rates per level (basis: 1.0 = 100%)
const OVERRIDE_RATES = [0, 0.01, 0.01, 0.01, 0.01, 0.01, 0.005, 0.005, 0.005, 0.005, 0.005, 0.005, 0.005, 0.005, 0.005, 0.005];
// Max levels eligible by package index (0=NONE,1=STARTER,2=BASIC,3=PRO,4=ELITE,5=STOCKIEST,6=SS)
const OVERRIDE_MAX_LEVELS = [0, 1, 2, 3, 4, 6, 15];

// Staking invest level reward rates (10 levels, sum = 20% of theoretical tokens)
const STAKING_INVEST_LEVEL_RATES = [0.10, 0.05, 0.02, 0.01, 0.005, 0.005, 0.003, 0.003, 0.002, 0.002];

const MLM_READ_ABI = [
  "function users(address) view returns (bool isRegistered, bool isActive, address sponsor, uint256 directCount, address binaryParent, bool placedLeft, address leftChild, address rightChild, uint256 leftSubVolume, uint256 rightSubVolume, uint256 mvtBalance, uint256 totalReceived, uint256 totalSold, uint256 incomeLimit, uint256 usdtBalance, uint256 rebirthPool, uint256 totalUsdtEarned, uint256 btcPoolBalance, uint256 totalBtcEarned, uint256 packagePrice, uint256 incomeLimitCap, address mainAccount, uint256 rebirthCount, uint8 rank, uint256 teamSalesUsdt, uint256 joinedAt, string displayName, string email, string phone, string country, bool profileSet)",
];
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const MLM_CONTRACT_ADDR = MVAULT_CONTRACT;

/**
 * Distributes 20% of theoretical tokens to 10 upline levels on staking invest.
 * Rates: L1=10% L2=5% L3=2% L4=1% L5=0.5% L6=0.5% L7=0.3% L8=0.3% L9=0.2% L10=0.2%
 * Unqualified (inactive/missing) upline shares accumulate to admin.
 * Returns { distributed, toAdmin } both in tokens.
 */
async function distributeStakingInvestLevelIncome(
  fromWallet: string,
  theoreticalTokens: number,
  buyPrice: number,
): Promise<{ distributed: number; toAdmin: number }> {
  let distributed = 0;
  let toAdmin = 0;
  try {
    const { ethers } = await import("ethers");
    const provider = new ethers.JsonRpcProvider(MCHAIN_RPC);
    const mlm = new ethers.Contract(MLM_CONTRACT_ADDR, MLM_READ_ABI, provider);

    let current = fromWallet;
    for (let i = 0; i < STAKING_INVEST_LEVEL_RATES.length; i++) {
      const info = await mlm.users(current);
      const sponsor: string = info.sponsor;
      if (!sponsor || sponsor === ZERO_ADDR) {
        // No more uplines — all remaining level shares go to admin
        for (let r = i; r < STAKING_INVEST_LEVEL_RATES.length; r++) {
          toAdmin += theoreticalTokens * STAKING_INVEST_LEVEL_RATES[r];
        }
        break;
      }

      const sponsorInfo = await mlm.users(sponsor);
      const isActive = sponsorInfo.isActive === true;
      const share = theoreticalTokens * STAKING_INVEST_LEVEL_RATES[i];

      if (isActive && share > 0) {
        await storage.addMTokenMainBalance(sponsor, share.toFixed(8));
        await storage.logTokenTransaction({
          walletAddress: sponsor,
          txType: "staking_level_income",
          tokenAmount: share.toFixed(8),
          usdtAmount: (share * buyPrice).toFixed(4),
          priceAtTxn: buyPrice.toFixed(8),
          note: `Level ${i + 1} staking invest reward from ${fromWallet}`,
        });
        distributed += share;
      } else {
        toAdmin += share;
      }

      current = sponsor;
    }
  } catch (_err) {
    // Non-fatal — if RPC fails, unprocessed level income goes to admin
    const totalLevelPct = STAKING_INVEST_LEVEL_RATES.reduce((a, b) => a + b, 0);
    toAdmin = theoreticalTokens * totalLevelPct - distributed;
  }
  return { distributed, toAdmin };
}

async function distributeStakingOverride(fromWallet: string, usdtProfit: number): Promise<void> {
  try {
    const { ethers } = await import("ethers");
    const provider = new ethers.JsonRpcProvider(MCHAIN_RPC);
    const mlm = new ethers.Contract(MLM_CONTRACT_ADDR, MLM_READ_ABI, provider);

    let current = fromWallet;
    for (let level = 1; level <= 15; level++) {
      const info = await mlm.users(current);
      const sponsor: string = info.sponsor;
      if (!sponsor || sponsor === ZERO_ADDR) break;
      const rank = Number(info.rank);
      const maxLevels = rank >= 0 && rank < OVERRIDE_MAX_LEVELS.length ? OVERRIDE_MAX_LEVELS[rank] : 0;
      if (level <= maxLevels && rank >= 1) {
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

  // Clean redirect used by MWallet deep link so the URL has no & or ? before encoding
  // e.g. /join/0xABC/left  →  /?ref=0xABC&side=left
  //      /join/0xABC        →  /?ref=0xABC  (no side lock)
  app.get("/join/:ref/:side", (req, res) => {
    const { ref, side } = req.params;
    res.redirect(302, `/?ref=${ref}&side=${side}`);
  });
  app.get("/join/:ref", (req, res) => {
    res.redirect(302, `/?ref=${req.params.ref}`);
  });

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
      const isAdmin = wallet?.toLowerCase() === ADMIN_WALLET_CFG;
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
      const provider = new ethers.JsonRpcProvider(MCHAIN_RPC);

      const receipt = await provider.getTransactionReceipt(hash);
      if (!receipt) {
        return res.status(400).json({ message: "Transaction not found on-chain. Please wait for confirmation and try again." });
      }
      if (!receipt.status) {
        return res.status(400).json({ message: "Transaction failed on-chain" });
      }

      // Verify the Deposited(address indexed user, uint256 amount) event from DepositVault
      const BOARD_HANDLER = BOARD_HANDLER_ADDR.toLowerCase();
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

      res.json({
        reward,
        message: `Star ${rank} reward of $${rankInfo.allocation.toLocaleString()} USDT claimed successfully.`,
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
      const [activePlan, allPlans, mTokenBal, usdtBal, tokenTxns, overrideIncome, freeBatches] = await Promise.all([
        storage.getActivePaidStakingPlan(addr),
        storage.getAllPaidStakingPlans(addr),
        storage.getMTokenBalance(addr),
        storage.getVirtualUsdtBalance(addr),
        storage.getTokenTransactions(addr),
        storage.getStakingOverrideIncome(addr),
        storage.getFreeBatches(addr),
      ]);
      const { buyPrice, sellPrice } = await getTokenPrice();
      const overrideTotal = overrideIncome.reduce((s, r) => s + parseFloat(r.amountUsdt), 0);

      // Get staked batch for active plan if exists
      let stakedBatch = null;
      if (activePlan) {
        stakedBatch = await storage.getStakedBatch(addr, activePlan.id);
      }

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
        freeBatches,
        stakedBatch,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/paidstaking/stake
  // Tokens are LOCKED in a purchase batch (NOT added to mainBalance).
  // No daily rewards. Sell after 10 months at 4x entry price cap.
  app.post("/api/paidstaking/stake", async (req, res) => {
    try {
      const { walletAddress, usdtAmount } = req.body;
      if (!walletAddress || !usdtAmount || parseFloat(usdtAmount) <= 0) {
        return res.status(400).json({ message: "walletAddress and positive usdtAmount required" });
      }
      const usdtAmt = parseFloat(usdtAmount);
      const addr = walletAddress.toLowerCase();

      const usdtBal = await storage.getVirtualUsdtBalance(addr);
      if (!usdtBal || parseFloat(usdtBal.balance) < usdtAmt) {
        return res.status(400).json({ message: "Insufficient virtual USDT balance" });
      }

      const { buyPrice } = await getTokenPrice();

      // ── Token distribution on Fixed staking invest ─────────────────────────
      // $100 USDT → 90% minted as grossMvt tokens. From grossMvt:
      //   60% → user (locked in staking plan)
      //   20% → level rewards across 10 uplines (L1=10%, L2=5%, L3=2%, L4=1%, L5–L6=0.5%, L7–L8=0.3%, L9–L10=0.2%)
      //    5% → company/admin
      //   15% → liquidity backing (stays in pool, not distributed)
      const theoreticalTokens = usdtAmt / buyPrice;
      const grossMvt     = theoreticalTokens * 0.9;   // 90% minted by token contract
      const userTokens   = grossMvt * 0.60;            // 60% of grossMvt → user
      const adminTokens  = grossMvt * 0.05;            // 5% of grossMvt → company
      const liquidityMvt = grossMvt * 0.15;            // 15% of grossMvt → liquidity pool (not circulating)

      await storage.deductVirtualUsdt(addr, usdtAmt.toString());

      // Distribute 20% of grossMvt to 10 uplines
      const { distributed: levelDistributed, toAdmin: levelToAdmin } =
        await distributeStakingInvestLevelIncome(addr, grossMvt, buyPrice);

      // Circulating supply = user + admin + level tokens (15% liquidity stays in pool, not circulating)
      const totalMinted = userTokens + adminTokens + levelDistributed + levelToAdmin + liquidityMvt;

      const econ = await storage.getTokenEconomics();
      await storage.updateTokenEconomics({
        circulatingSupply: (parseFloat(econ.circulatingSupply) + totalMinted).toFixed(8),
        liquidity: (parseFloat(econ.liquidity) + usdtAmt).toFixed(8),
      });

      // Tokens are NOT added to mainBalance — they are locked in the staking plan
      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setMinutes(endDate.getMinutes() + 10 * 5); // [TEST MODE] 10 months × 5 min/month = 50 min (prod: setMonth +10)

      const totalMintedForPlan = userTokens + adminTokens + levelDistributed + levelToAdmin;
      const plan = await storage.createPaidStakingPlan({
        walletAddress: addr,
        usdtInvested: usdtAmt.toFixed(4),
        buyPriceAtEntry: buyPrice.toFixed(8),
        totalTokensMinted: totalMintedForPlan.toFixed(8),
        userTokens: userTokens.toFixed(8),
        adminTokens: (adminTokens + levelToAdmin).toFixed(8),
        dailyRewardUsdt: "0",   // No daily rewards — price appreciation only
        startDate,
        endDate,
      });

      // Create a staked purchase batch for sell-cap tracking (4x cap)
      await storage.createTokenBatch({
        walletAddress: addr,
        tokenAmount: userTokens.toFixed(8),
        tokensRemaining: userTokens.toFixed(8),
        entryPrice: buyPrice.toFixed(8),
        batchType: "staked",
        stakingPlanId: plan.id,
      });

      await storage.logTokenTransaction({
        walletAddress: addr,
        txType: "paid_stake",
        tokenAmount: userTokens.toFixed(8),
        usdtAmount: usdtAmt.toFixed(4),
        priceAtTxn: buyPrice.toFixed(8),
        note: `Fixed stake $${usdtAmt} USDT @ $${buyPrice.toFixed(8)}/token. Split: 60% user (${userTokens.toFixed(2)} tokens), 20% levels, 15% liquidity, 5% company. 4x sell cap = $${(buyPrice * 4).toFixed(8)}/token`,
      });

      res.json({ plan, userTokens: userTokens.toFixed(8), adminTokens: adminTokens.toFixed(8), levelDistributed: levelDistributed.toFixed(8), buyPriceUsed: buyPrice.toFixed(8), capPrice: (buyPrice * 4).toFixed(8) });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/paidstaking/buy-hold
  // Buy M-tokens without staking. Added to mainBalance. 2x entry price sell cap.
  app.post("/api/paidstaking/buy-hold", async (req, res) => {
    try {
      const { walletAddress, usdtAmount } = req.body;
      if (!walletAddress || !usdtAmount || parseFloat(usdtAmount) <= 0) {
        return res.status(400).json({ message: "walletAddress and positive usdtAmount required" });
      }
      const usdtAmt = parseFloat(usdtAmount);
      const addr = walletAddress.toLowerCase();

      const usdtBal = await storage.getVirtualUsdtBalance(addr);
      if (!usdtBal || parseFloat(usdtBal.balance) < usdtAmt) {
        return res.status(400).json({ message: "Insufficient virtual USDT balance" });
      }

      const { buyPrice } = await getTokenPrice();

      // ── Token distribution on Flexi staking invest ─────────────────────────
      // $100 USDT → 90% minted as grossMvt tokens. From grossMvt:
      //   60% → user (added to mainBalance immediately, no lock)
      //   20% → level rewards across 10 uplines (L1=10%, L2=5%, L3=2%, L4=1%, L5–L6=0.5%, L7–L8=0.3%, L9–L10=0.2%)
      //    5% → company/admin
      //   15% → liquidity backing (stays in pool, not distributed)
      const theoreticalTokens = usdtAmt / buyPrice;
      const grossMvt     = theoreticalTokens * 0.9;   // 90% minted by token contract
      const userTokens   = grossMvt * 0.60;            // 60% of grossMvt → user
      const adminTokens  = grossMvt * 0.05;            // 5% of grossMvt → company
      const liquidityMvt = grossMvt * 0.15;            // 15% of grossMvt → liquidity pool (not circulating)

      await storage.deductVirtualUsdt(addr, usdtAmt.toString());

      // Distribute 20% of grossMvt to 10 uplines
      const { distributed: levelDistributed, toAdmin: levelToAdmin } =
        await distributeStakingInvestLevelIncome(addr, grossMvt, buyPrice);

      // Circulating supply = user + admin + level tokens + liquidity pool tokens (all 90% minted)
      const totalMinted = userTokens + adminTokens + levelDistributed + levelToAdmin + liquidityMvt;

      const econ = await storage.getTokenEconomics();
      await storage.updateTokenEconomics({
        circulatingSupply: (parseFloat(econ.circulatingSupply) + totalMinted).toFixed(8),
        liquidity: (parseFloat(econ.liquidity) + usdtAmt).toFixed(8),
      });

      // Add user's 60% directly to mainBalance (no lock)
      await storage.addMTokenMainBalance(addr, userTokens.toFixed(8));

      // Create a free purchase batch for sell-cap tracking (2x cap)
      const batch = await storage.createTokenBatch({
        walletAddress: addr,
        tokenAmount: userTokens.toFixed(8),
        tokensRemaining: userTokens.toFixed(8),
        entryPrice: buyPrice.toFixed(8),
        batchType: "free",
        stakingPlanId: null,
      });

      await storage.logTokenTransaction({
        walletAddress: addr,
        txType: "buy_hold",
        tokenAmount: userTokens.toFixed(8),
        usdtAmount: usdtAmt.toFixed(4),
        priceAtTxn: buyPrice.toFixed(8),
        note: `Flexi stake $${usdtAmt} USDT @ $${buyPrice.toFixed(8)}/token. Split: 60% user (${userTokens.toFixed(2)} tokens), 20% levels, 15% liquidity, 5% company. 2x cap = $${(buyPrice * 2).toFixed(8)}/token`,
      });

      res.json({ tokens: userTokens.toFixed(8), levelDistributed: levelDistributed.toFixed(8), buyPriceUsed: buyPrice.toFixed(8), capPrice: (buyPrice * 2).toFixed(8), batch });
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
      const daysSince = Math.floor((now.getTime() - lastClaim.getTime()) / (1000 * 60 * 5)); // [TEST MODE] 5 min periods (prod: 1000*60*60*24)

      if (daysSince < 1) return res.status(400).json({ message: "Rewards can only be claimed once per 5 minutes" }); // [TEST MODE]

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
      const daysSince = Math.floor((now.getTime() - lastClaim.getTime()) / (1000 * 60 * 5)); // [TEST MODE] 5 min periods (prod: 1000*60*60*24)

      if (daysSince < 1) return res.status(400).json({ message: "Rewards can only be claimed once per 5 minutes" }); // [TEST MODE]

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

  // POST /api/paidstaking/sell-staked  (sell locked staked tokens after 10 months at 4x entry price cap)
  app.post("/api/paidstaking/sell-staked", async (req, res) => {
    try {
      const { walletAddress, planId, tokenAmount } = req.body;
      if (!walletAddress || !planId || !tokenAmount || parseFloat(tokenAmount) <= 0) {
        return res.status(400).json({ message: "walletAddress, planId and positive tokenAmount required" });
      }
      const addr = walletAddress.toLowerCase();
      const tokens = parseFloat(tokenAmount);
      const pid = parseInt(planId);

      const batch = await storage.getStakedBatch(addr, pid);
      if (!batch) return res.status(404).json({ message: "No staked token batch found for this plan" });

      // Check lock period
      const plans = await storage.getAllPaidStakingPlans(addr);
      const plan = plans.find(p => p.id === pid);
      if (!plan) return res.status(404).json({ message: "Staking plan not found" });
      const now = new Date();
      if (now < new Date(plan.endDate)) {
        const daysLeft = Math.ceil((new Date(plan.endDate).getTime() - now.getTime()) / 86400000);
        return res.status(400).json({ message: `Tokens locked for ${daysLeft} more days (until ${new Date(plan.endDate).toLocaleDateString()})` });
      }

      const remaining = parseFloat(batch.tokensRemaining);
      if (tokens > remaining + 0.000001) {
        return res.status(400).json({ message: `Only ${remaining.toFixed(8)} tokens remaining in this staked batch` });
      }

      const { sellPrice } = await getTokenPrice();
      const entryPrice = parseFloat(batch.entryPrice);
      const capPrice = entryPrice * 4;                          // 4x sell cap
      const effectivePrice = Math.min(sellPrice, capPrice);     // user gets the lower of current or cap
      const usdtToUser = tokens * effectivePrice;
      const excessPerToken = Math.max(0, sellPrice - capPrice); // excess stays in company liquidity
      const companyRetains = tokens * excessPerToken;

      // Deduct from staked batch
      await storage.deductFromBatch(batch.id, tokens.toFixed(8));

      // Burn tokens from circulating supply; only reduce liquidity by what user receives
      const econ = await storage.getTokenEconomics();
      await storage.updateTokenEconomics({
        circulatingSupply: Math.max(0, parseFloat(econ.circulatingSupply) - tokens).toFixed(8),
        liquidity: Math.max(0, parseFloat(econ.liquidity) - usdtToUser).toFixed(8),
      });

      await storage.creditVirtualUsdt(addr, usdtToUser.toFixed(4));

      // If batch exhausted, close the staking plan
      const updatedBatch = await storage.getStakedBatch(addr, pid);
      if (!updatedBatch || parseFloat(updatedBatch.tokensRemaining) < 0.00001) {
        await storage.markPaidStakingUnstaked(pid, usdtToUser.toFixed(4));
      }

      await storage.logTokenTransaction({
        walletAddress: addr,
        txType: "sell_staked",
        tokenAmount: tokens.toFixed(8),
        usdtAmount: usdtToUser.toFixed(4),
        priceAtTxn: effectivePrice.toFixed(8),
        note: `Sold ${tokens.toFixed(4)} staked M-tokens. Entry: $${entryPrice.toFixed(8)}, Cap: $${capPrice.toFixed(8)}, Market: $${sellPrice.toFixed(8)}, Received: $${usdtToUser.toFixed(4)}, Company retained: $${companyRetains.toFixed(4)}`,
      });

      res.json({
        usdtReceived: usdtToUser.toFixed(4),
        tokensSold: tokens.toFixed(8),
        effectivePrice: effectivePrice.toFixed(8),
        capPrice: capPrice.toFixed(8),
        marketPrice: sellPrice.toFixed(8),
        companyRetains: companyRetains.toFixed(4),
        tokensRemainingInBatch: updatedBatch ? updatedBatch.tokensRemaining : "0",
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/paidstaking/sell-main-tokens
  // Sell free/held M-tokens (from mainBalance) using FIFO purchase batches with 2x entry price cap.
  // Excess above 2x cap stays in company liquidity pool.
  app.post("/api/paidstaking/sell-main-tokens", async (req, res) => {
    try {
      const { walletAddress, tokenAmount } = req.body;
      if (!walletAddress || !tokenAmount || parseFloat(tokenAmount) <= 0) {
        return res.status(400).json({ message: "walletAddress and positive tokenAmount required" });
      }
      const addr = walletAddress.toLowerCase();
      let tokensToSell = parseFloat(tokenAmount);

      const mBal = await storage.getMTokenBalance(addr);
      const mainBal = parseFloat(mBal?.mainBalance ?? "0");
      if (mainBal < tokensToSell - 0.000001) {
        return res.status(400).json({ message: "Insufficient M-Token main balance" });
      }

      const { sellPrice } = await getTokenPrice();

      // Try FIFO free batches first (2x cap enforced)
      const freeBatches = await storage.getFreeBatches(addr);
      let totalUsdtToUser = 0;
      let totalTokensBurned = 0;
      let totalCompanyRetains = 0;
      let remaining = tokensToSell;

      if (freeBatches.length > 0) {
        for (const batch of freeBatches) {
          if (remaining <= 0) break;
          const batchRemaining = parseFloat(batch.tokensRemaining);
          const fromThisBatch = Math.min(remaining, batchRemaining);
          const entryPrice = parseFloat(batch.entryPrice);
          const capPrice = entryPrice * 2;
          const effectivePrice = Math.min(sellPrice, capPrice);
          const usdtFromBatch = fromThisBatch * effectivePrice;
          const companyFromBatch = fromThisBatch * Math.max(0, sellPrice - capPrice);

          totalUsdtToUser += usdtFromBatch;
          totalCompanyRetains += companyFromBatch;
          totalTokensBurned += fromThisBatch;
          remaining -= fromThisBatch;

          await storage.deductFromBatch(batch.id, fromThisBatch.toFixed(8));
        }
        // Any remaining tokens (beyond tracked batches) sell without cap (legacy)
        if (remaining > 0.000001) {
          totalUsdtToUser += remaining * sellPrice;
          totalTokensBurned += remaining;
          remaining = 0;
        }
      } else {
        // No free batches — legacy sell at current price (no cap, backward compat)
        totalUsdtToUser = tokensToSell * sellPrice;
        totalTokensBurned = tokensToSell;
      }

      // Burn tokens from main balance and circulating supply
      await storage.deductMTokenMainBalance(addr, totalTokensBurned.toFixed(8));
      const econ = await storage.getTokenEconomics();
      await storage.updateTokenEconomics({
        circulatingSupply: Math.max(0, parseFloat(econ.circulatingSupply) - totalTokensBurned).toFixed(8),
        liquidity: Math.max(0, parseFloat(econ.liquidity) - totalUsdtToUser).toFixed(8),
      });

      await storage.creditVirtualUsdt(addr, totalUsdtToUser.toFixed(4));

      await storage.logTokenTransaction({
        walletAddress: addr,
        txType: "sell_main_tokens",
        tokenAmount: totalTokensBurned.toFixed(8),
        usdtAmount: totalUsdtToUser.toFixed(4),
        priceAtTxn: sellPrice.toFixed(8),
        note: `Sold ${totalTokensBurned.toFixed(4)} held M-tokens. Received: $${totalUsdtToUser.toFixed(4)}. Company retained: $${totalCompanyRetains.toFixed(4)} (2x cap enforced)`,
      });

      res.json({
        usdtReceived: totalUsdtToUser.toFixed(4),
        tokensBurned: totalTokensBurned.toFixed(8),
        sellPriceUsed: sellPrice.toFixed(8),
        companyRetains: totalCompanyRetains.toFixed(4),
      });
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

  // MvaultContract on MChain — source of truth for board rewards
  const MVAULT_CONTRACT_MCHAIN = MVAULT_CONTRACT;
  const MVAULT_BOARD_REWARD_ABI = [
    "function totalBoardRewardsEarned(address) view returns (uint256)",
  ];

  // POST /api/btcswap/sync/:walletAddress — sync on-chain board rewards to backend virtual balance
  // Reads totalBoardRewardsEarned from MvaultContract and credits any new earnings to the BTC swap balance
  app.post("/api/btcswap/sync/:walletAddress", async (req, res) => {
    try {
      const addr = req.params.walletAddress.toLowerCase();
      const { ethers } = await import("ethers");
      const provider = new ethers.JsonRpcProvider(MCHAIN_RPC);
      const mvaultContract = new ethers.Contract(MVAULT_CONTRACT_MCHAIN, MVAULT_BOARD_REWARD_ABI, provider);

      const onChainTotalWei: bigint = await mvaultContract.totalBoardRewardsEarned(addr);
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

  // ── Admin: trigger binary + power leg distribution from backend ─────────────
  const ADMIN_WALLET = ADMIN_WALLET_CFG;

  // Helper — renders a simple HTML status page readable in any browser
  function adminHtml(title: string, lines: string[]) {
    return `<!DOCTYPE html><html><head><title>M-Vault Admin</title>
    <style>body{background:#0a0a0f;color:#e2e8f0;font-family:monospace;padding:40px;max-width:600px;margin:auto}
    h2{color:#f59e0b}pre{background:#111;padding:16px;border-radius:8px;border:1px solid #333;white-space:pre-wrap}
    .ok{color:#34d399}.err{color:#f87171}</style></head><body>
    <h2>M-Vault · ${title}</h2><pre>${lines.join("\n")}</pre>
    <p style="color:#666;font-size:12px;margin-top:24px">Time: ${new Date().toUTCString()}</p>
    </body></html>`;
  }

  // POST (existing — kept for backward compat)
  app.post("/api/admin/distribute", async (req, res) => {
    const caller = (req.body?.callerAddress || "").toLowerCase();
    if (caller !== ADMIN_WALLET) {
      return res.status(403).json({ message: "Forbidden" });
    }
    const { runDistribution } = await import("./distributor");
    runDistribution().catch(() => {});
    res.json({ ok: true, message: "Distribution started on the backend" });
  });

  // GET — bookmarkable URL: /api/admin/run/distribute/<adminWallet>
  app.get("/api/admin/run/distribute/:key", async (req, res) => {
    if (req.params.key.toLowerCase() !== ADMIN_WALLET) {
      res.status(403).send(adminHtml("Forbidden", ["❌ Invalid admin key."]));
      return;
    }
    const { runDistribution } = await import("./distributor");
    runDistribution().catch(() => {});
    res.send(adminHtml("Binary + Power-Leg Distribution", [
      "✅ Distribution job started on the server.",
      "",
      "The job runs in the background and may take several minutes.",
      "Check VPS logs:  pm2 logs mvault --lines 100",
      "",
      "This triggers:",
      "  • Binary matching (left ↔ right volume pairs)",
      "  • Power-leg points distribution",
      "  • Merkle root committed on-chain",
    ]));
  });

  // GET — bookmarkable URL: /api/admin/run/rank-check/<adminWallet>
  app.get("/api/admin/run/rank-check/:key", async (req, res) => {
    if (req.params.key.toLowerCase() !== ADMIN_WALLET) {
      res.status(403).send(adminHtml("Forbidden", ["❌ Invalid admin key."]));
      return;
    }
    const { runRankCheck } = await import("./distributor");
    runRankCheck().catch(() => {});
    res.send(adminHtml("Rank Eligibility Check", [
      "✅ Rank check job started on the server.",
      "",
      "The job runs in the background and may take 1–2 minutes.",
      "Check VPS logs:  pm2 logs mvault --lines 100",
      "",
      "This triggers:",
      "  • Full M1–M5 eligibility evaluation for all users",
      "  • setUserRanks() called via manager wallet for eligible users",
      "  • onchain_users DB snapshot refreshed",
      "  • Downline rank counts cached in KV store",
    ]));
  });

  // POST /api/activation/notify — called by frontend immediately after an activation
  // tx confirms. Reads the activated user + their upline chain from BSC (single-user
  // reads, fast), updates the onchain_users DB snapshot, then triggers runRankCheck()
  // asynchronously. This replaces the old 30-second BSC block poller entirely.
  app.post("/api/activation/notify", async (req, res) => {
    try {
      const { address } = req.body ?? {};
      if (!address || !/^0x[0-9a-fA-F]{40}$/i.test(address)) {
        return res.status(400).json({ message: "Invalid address" });
      }

      const { ethers } = await import("ethers");
      const MVAULT = process.env.VITE_MVAULT_CONTRACT_ADDRESS || "";
      if (!MVAULT) return res.status(500).json({ message: "Contract not configured" });

      const provider = new ethers.JsonRpcProvider(MCHAIN_RPC);

      const USER_ABI = ["function users(address) view returns (bool isRegistered, bool isActive, address sponsor, uint256 directCount, address binaryParent, bool placedLeft, address leftChild, address rightChild, uint256 leftSubVolume, uint256 rightSubVolume, uint256 mvtBalance, uint256 totalReceived, uint256 totalSold, uint256 incomeLimit, uint256 usdtBalance, uint256 rebirthPool, uint256 totalUsdtEarned, uint256 btcPoolBalance, uint256 totalBtcEarned, uint256 packagePrice, uint256 incomeLimitCap, address mainAccount, uint256 rebirthCount, uint8 rank, uint256 teamSalesUsdt, uint256 joinedAt, string displayName, string email, string phone, string country, bool profileSet)"];
      const mvault = new ethers.Contract(MVAULT, USER_ABI, provider);

      // Walk up the sponsor chain (max 15 hops) and refresh all affected users in DB
      const toRefresh: string[] = [];
      let cursor = address.toLowerCase();
      for (let hop = 0; hop < 15; hop++) {
        toRefresh.push(cursor);
        const info = await mvault.users(cursor).catch(() => null);
        if (!info || !info.isRegistered) break;
        const sp = (info.sponsor as string).toLowerCase();
        if (!sp || sp === ethers.ZeroAddress.toLowerCase()) break;
        cursor = sp;
      }

      // Read all collected addresses in parallel
      const settled = await Promise.allSettled(
        toRefresh.map(addr => mvault.users(addr).then((u: any) => ({ addr, u })))
      );
      const rows = settled
        .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled")
        .map(({ value: { addr, u } }) => ({
          address:        addr,
          sponsor:        (u.sponsor as string).toLowerCase(),
          rank:           Number(u.rank),
          directCount:    Number(u.directCount),
          teamSalesUsdt:  (u.teamSalesUsdt as bigint).toString(),
          leftSubVolume:  (u.leftSubVolume  as bigint).toString(),
          rightSubVolume: (u.rightSubVolume as bigint).toString(),
          isActive:       Boolean(u.isActive),
        }));

      await storage.upsertOnchainUsersBulk(rows);

      // Trigger full rank check asynchronously (no-op if already running)
      const { runRankCheck } = await import("./distributor");
      runRankCheck().catch(() => {});

      return res.json({ ok: true, refreshed: rows.length, rankCheckTriggered: true });
    } catch (err: any) {
      return res.status(500).json({ message: err?.message || "Notify failed" });
    }
  });

  // GET /api/rank/status/:address — instant cached downline rank counts
  // Returns M1-M4 downline counts from KV cache (populated by runRankCheck).
  // Cache age is included so frontend can show a stale warning if needed.
  app.get("/api/rank/status/:address", async (req, res) => {
    try {
      const addr = (req.params.address || "").toLowerCase();
      if (!/^0x[0-9a-fA-F]{40}$/i.test(addr)) {
        return res.status(400).json({ message: "Invalid address" });
      }

      const raw = await storage.getKv(`rankCounts:${addr}`);
      const globalTs = await storage.getKv("rankCountsUpdatedAt");

      if (!raw) {
        // Cache not yet populated — return zeros with a flag so frontend
        // knows to show "run a claim to populate" hint
        return res.json({ m1: 0, m2: 0, m3: 0, m4: 0, updatedAt: null, cached: false });
      }

      const data = JSON.parse(raw);
      return res.json({ ...data, globalUpdatedAt: globalTs ? Number(globalTs) : null, cached: true });
    } catch (err: any) {
      return res.status(500).json({ message: err?.message || "Failed to read rank status" });
    }
  });

  // POST /api/rank/claim — user triggers their own rank eligibility check.
  // Fast path: if cache shows eligible, calls setUserRanks directly (no full scan).
  // Slow path: if cache is missing/stale, runs full runRankCheck first, then claims.
  app.post("/api/rank/claim", async (req, res) => {
    try {
      const { address } = req.body ?? {};
      if (!address || !/^0x[0-9a-fA-F]{40}$/i.test(address)) {
        return res.status(400).json({ message: "Invalid address" });
      }

      const { ethers } = await import("ethers");
      const { runRankCheck } = await import("./distributor");

      const MVAULT = process.env.VITE_MVAULT_CONTRACT_ADDRESS || "";
      if (!MVAULT) return res.status(500).json({ message: "Contract address not configured" });

      const provider = new ethers.JsonRpcProvider(MCHAIN_RPC);

      const USERS_ABI = [
        "function users(address) view returns (bool isRegistered, bool isActive, address sponsor, uint256 directCount, address binaryParent, bool placedLeft, address leftChild, address rightChild, uint256 leftSubVolume, uint256 rightSubVolume, uint256 mvtBalance, uint256 totalReceived, uint256 totalSold, uint256 incomeLimit, uint256 usdtBalance, uint256 rebirthPool, uint256 totalUsdtEarned, uint256 btcPoolBalance, uint256 totalBtcEarned, uint256 packagePrice, uint256 incomeLimitCap, address mainAccount, uint256 rebirthCount, uint8 rank, uint256 teamSalesUsdt, uint256 joinedAt, string displayName, string email, string phone, string country, bool profileSet)",
      ];
      const RANK_ABI = ["function setUserRanks(address[], uint8[]) external"];
      const mvault = new ethers.Contract(MVAULT, USERS_ABI, provider);

      const userBefore = await mvault.users(address);
      if (!userBefore.isRegistered) return res.status(400).json({ message: "Address is not registered" });
      if (!userBefore.isActive)     return res.status(400).json({ message: "Account must be active to claim a rank" });

      const oldRank = Number(userBefore.rank);
      const RANK_NAMES = ["Unranked", "M1", "M2", "M3", "M4", "M5"];
      const addr = address.toLowerCase();

      if (oldRank >= 5) {
        return res.json({ oldRank, newRank: 5, upgraded: false, message: "Already at maximum rank M5" });
      }

      // ── Check cache freshness (< 2 h = fresh) ──────────────────────────────
      const CACHE_TTL_MS = 2 * 60 * 60 * 1000;
      const rawCache = await storage.getKv(`rankCounts:${addr}`);
      const cacheAge = rawCache ? Date.now() - (JSON.parse(rawCache).updatedAt ?? 0) : Infinity;
      const cacheIsFresh = cacheAge < CACHE_TTL_MS;

      // M1 thresholds (same as distributor)
      const M1_MIN_DIRECTS   = 5n;
      const M1_MIN_TEAM_USDT = ethers.parseUnits("2000", 18);
      const MIN_COUNTS       = [0, 0, 2, 4, 4, 4]; // index = target rank (M2=2, M3=4, M4=4, M5=4)

      // Determine next expected rank from cache if fresh
      let cachedEligible = false;
      if (cacheIsFresh && rawCache) {
        const { m1, m2, m3, m4 } = JSON.parse(rawCache);
        const counts = [0, 0, m1, m2, m3, m4]; // index = target rank
        if (oldRank === 0) {
          cachedEligible =
            userBefore.directCount   >= M1_MIN_DIRECTS   &&
            userBefore.teamSalesUsdt >= M1_MIN_TEAM_USDT;
        } else {
          cachedEligible = counts[oldRank + 1] >= MIN_COUNTS[oldRank + 1];
        }
      }

      if (cacheIsFresh && !cachedEligible) {
        // Fast path: cache is fresh and says not eligible — no chain scan needed
        const cacheData = rawCache ? JSON.parse(rawCache) : { m1: 0, m2: 0, m3: 0, m4: 0 };
        return res.json({
          oldRank,
          newRank: oldRank,
          upgraded: false,
          counts: cacheData,
          message: `Not yet eligible — your current rank is ${RANK_NAMES[oldRank]}`,
        });
      }

      // Slow path: cache missing/stale, or cache says eligible → run full check
      // (Full check refreshes cache + sets ranks for everyone who qualifies)
      await runRankCheck();

      const userAfter = await mvault.users(address);
      const newRank = Number(userAfter.rank);
      const upgraded = newRank > oldRank;

      // Return updated cache counts
      const freshCache = await storage.getKv(`rankCounts:${addr}`);
      const freshCounts = freshCache ? JSON.parse(freshCache) : { m1: 0, m2: 0, m3: 0, m4: 0 };

      return res.json({
        oldRank,
        newRank,
        upgraded,
        counts: freshCounts,
        message: upgraded
          ? `Congratulations! Your rank has been upgraded from ${RANK_NAMES[oldRank]} to ${RANK_NAMES[newRank]}`
          : `Not yet eligible — your current rank is ${RANK_NAMES[oldRank]}`,
      });
    } catch (err: any) {
      const msg = err?.shortMessage || err?.reason || err?.message || String(err);
      return res.status(500).json({ message: `Rank check failed: ${msg}` });
    }
  });

  app.get("/api/admin/pool-status", async (_req, res) => {
    try {
      const { ethers } = await import("ethers");
      const MVAULT_CONTRACT_ADDRESS = MVAULT_CONTRACT;
      const ABI = [
        "function getPoolBalances() view returns (uint256 community, uint256 reserve, uint256 admin)",
        "function getAllUsersCount() view returns (uint256)",
      ];
      const provider = new ethers.JsonRpcProvider(MCHAIN_RPC);
      const contract = new ethers.Contract(MVAULT_CONTRACT_ADDRESS, ABI, provider);
      const [community, reserve, admin] = await contract.getPoolBalances() as [bigint, bigint, bigint];
      const totalUsers = Number(await contract.getAllUsersCount());
      res.json({
        communityPool: community.toString(),
        reservePool:   reserve.toString(),
        adminPool:     admin.toString(),
        totalUsers,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Binary estimate — deprecated (placement income is now instant on-chain) ─
  app.get("/api/binary/estimate/:address", async (_req, res) => {
    res.json({ deprecated: true, message: "Placement income is now paid instantly on-chain at activation time. No off-chain estimate needed." });
  });

  // ── Distribution proofs — only UNCLAIMED cycles (verified on-chain) ───────
  app.get("/api/distribution/proofs/:address", async (req, res) => {
    try {
      const walletAddress = req.params.address.toLowerCase();
      const proofs = await storage.getDistributionProofsByUser(walletAddress);
      if (!proofs.length) {
        return res.json({ cycles: [], totalMvt: "0" });
      }

      // Check on-chain which cycles have already been claimed
      const DIST_ADDR = process.env.VITE_DISTRIBUTOR_ADDRESS || "";
      let claimedSet = new Set<number>();
      if (DIST_ADDR) {
        try {
          const { ethers } = await import("ethers");
          const provider = new ethers.JsonRpcProvider(MCHAIN_RPC);
          const dist = new ethers.Contract(DIST_ADDR, [
            "function hasClaimed(uint256 cycle, address user) view returns (bool)",
          ], provider);
          // Check all cycles in parallel
          const checks = await Promise.all(
            proofs.map(p => dist.hasClaimed(p.cycle, walletAddress) as Promise<boolean>)
          );
          proofs.forEach((p, i) => { if (checks[i]) claimedSet.add(p.cycle); });
        } catch {
          // If on-chain check fails, return all proofs (safe fallback)
        }
      }

      let totalMvt = 0n;
      const cycles = proofs
        .filter(p => !claimedSet.has(p.cycle))
        .map(p => {
          const amount = BigInt(p.binaryShare) + BigInt(p.powerLegShare);
          totalMvt += amount;
          return {
            cycle:          p.cycle,
            binaryShare:    p.binaryShare,
            powerLegShare:  p.powerLegShare,
            newMatchedVol:  p.newMatchedVol,
            newPowerLegPts: p.newPowerLegPts,
            proof:          p.proof,
            totalMvt:       amount.toString(),
          };
        });
      res.json({ cycles, totalMvt: totalMvt.toString(), totalProofs: proofs.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── MWallet download URL (public read, admin write) ──────────────────────────
  app.get("/api/settings/mwallet-url", async (_req, res) => {
    try {
      const [row] = await db.select().from(kvStore).where(eq(kvStore.key, "mwallet_download_url"));
      if (!row) return res.json({ url: null, linkType: "apk" });
      const parsed = JSON.parse(row.value);
      res.json(parsed);
    } catch {
      res.json({ url: null, linkType: "apk" });
    }
  });

  app.post("/api/admin/settings/mwallet-url", async (req, res) => {
    const { wallet, url, linkType } = req.body;
    if (!wallet || wallet.toLowerCase() !== ADMIN_WALLET_CFG.toLowerCase()) {
      return res.status(403).json({ message: "Admin only" });
    }
    if (!url || typeof url !== "string") {
      return res.status(400).json({ message: "url required" });
    }
    const value = JSON.stringify({ url: url.trim(), linkType: linkType || "apk" });
    await db.insert(kvStore)
      .values({ key: "mwallet_download_url", value })
      .onConflictDoUpdate({ target: kvStore.key, set: { value, updatedAt: new Date() } });
    res.json({ ok: true });
  });

  // ── APK file upload ───────────────────────────────────────────────────────
  app.post("/api/admin/upload/apk",
    (req, res, next) => {
      const wallet = req.query.wallet as string || req.headers["x-admin-wallet"] as string;
      if (!wallet || wallet.toLowerCase() !== ADMIN_WALLET_CFG.toLowerCase()) {
        return res.status(403).json({ message: "Admin only" });
      }
      next();
    },
    apkUpload.single("apk"),
    async (req, res) => {
      if (!req.file) return res.status(400).json({ message: "No file received" });
      const apkUrl = "/uploads/mwallet.apk";
      const value = JSON.stringify({ url: apkUrl, linkType: "apk" });
      await db.insert(kvStore)
        .values({ key: "mwallet_download_url", value })
        .onConflictDoUpdate({ target: kvStore.key, set: { value, updatedAt: new Date() } });
      res.json({ ok: true, url: apkUrl, size: req.file.size });
    }
  );

  // ── RPC proxy — forwards JSON-RPC to MChain (avoids browser CORS block) ────
  app.post("/api/rpc/mchain", async (req, res) => {
    try {
      const upstream = process.env.VITE_BSC_NETWORK === "mchain"
        ? "https://node.mymchain.com/api/rpc"
        : process.env.VITE_BSC_NETWORK === "mainnet"
        ? "https://bsc-rpc.publicnode.com"
        : "https://bsc-testnet-rpc.publicnode.com";

      const response = await fetch(upstream, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body),
      });
      const data = await response.json();
      res.json(data);
    } catch (err: any) {
      res.status(502).json({ jsonrpc: "2.0", error: { code: -32603, message: err.message }, id: req.body?.id ?? null });
    }
  });

  return httpServer;
}
