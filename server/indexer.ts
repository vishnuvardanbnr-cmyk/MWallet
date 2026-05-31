import { ethers } from "ethers";
import { storage } from "./storage";
import { log } from "./index";
import { MCHAIN_RPC, MVAULT_CONTRACT as CONTRACT_ADDR } from "./config";
const CHUNK_SIZE    = 2000;
const KV_KEY        = "indexer:lastBlock";
const CHECKPOINT_INTERVAL = 60_000; // save block checkpoint every 60s

const ABI = [
  "event LevelIncomePaid(address indexed to, address indexed from, uint8 level, uint256 amount)",
  "event PlacementIncomePaid(address indexed to, address indexed from, uint8 level, uint256 amount)",
  "event RankIncomePaid(address indexed to, address indexed from, uint8 rank, uint256 amount)",
  "event Activated(address indexed user, uint256 mvtMinted, uint256 grossMvt, uint256 levelAmt, uint256 binaryAmt, uint256 adminAmt)",
  "event Reborn(address indexed mainAccount, address indexed subAccount, uint256 rebirthIndex)",
];

// ── Helper: save one log to DB ────────────────────────────────────────────────

async function saveLog(evt: ethers.EventLog, provider: ethers.JsonRpcProvider): Promise<void> {
  const block = await provider.getBlock(evt.blockNumber);
  const a = evt.args;

  let walletAddress: string;
  let fromAddress:   string | undefined;
  let level:         number | undefined;
  let amountRaw:     string | undefined;
  let extraData:     string | undefined;

  switch (evt.fragment.name) {
    case "LevelIncomePaid":
    case "PlacementIncomePaid":
    case "RankIncomePaid":
      walletAddress = a[0] as string;
      fromAddress   = a[1] as string;
      level         = Number(a[2]);
      amountRaw     = (a[3] as bigint).toString();
      break;
    case "Activated":
      walletAddress = a[0] as string;
      extraData     = JSON.stringify({
        mvtMinted: (a[1] as bigint).toString(),
        grossMvt:  (a[2] as bigint).toString(),
        levelAmt:  (a[3] as bigint).toString(),
        binaryAmt: (a[4] as bigint).toString(),
        adminAmt:  (a[5] as bigint).toString(),
      });
      break;
    case "Reborn":
      walletAddress = a[0] as string;
      fromAddress   = a[1] as string;
      extraData     = JSON.stringify({ rebirthIndex: (a[2] as bigint).toString() });
      break;
    default:
      return;
  }

  await storage.saveOnChainEvent({
    txHash:         evt.transactionHash,
    blockNumber:    evt.blockNumber,
    logIndex:       evt.index,
    eventType:      evt.fragment.name,
    walletAddress,
    fromAddress,
    level,
    amountRaw,
    extraData,
    blockTimestamp: block ? new Date(Number(block.timestamp) * 1000) : undefined,
  });
}

// ── Catch-up: scan missed blocks from lastSaved → currentBlock ────────────────

async function catchUp(
  contract: ethers.Contract,
  provider: ethers.JsonRpcProvider,
  fromBlock: number,
  toBlock:   number,
): Promise<void> {
  if (fromBlock > toBlock) return;

  log(`catching up blocks ${fromBlock}→${toBlock}…`, "indexer");
  let saved = 0;
  let from  = fromBlock;

  while (from <= toBlock) {
    const to = Math.min(from + CHUNK_SIZE - 1, toBlock);
    try {
      for (const eventName of ["LevelIncomePaid", "PlacementIncomePaid", "RankIncomePaid", "Activated", "Reborn"]) {
        const logs = await contract.queryFilter(contract.filters[eventName](), from, to);
        for (const evt of logs) {
          if ("args" in evt) {
            await saveLog(evt as ethers.EventLog, provider);
            saved++;
          }
        }
      }
      await storage.setKv(KV_KEY, to.toString());
      from = to + 1;
    } catch (err: any) {
      log(`catch-up chunk ${from}-${to} failed: ${err.message}`, "indexer");
      break;
    }
  }

  if (saved > 0) log(`catch-up complete — saved ${saved} historical events`, "indexer");
}

// ── Live listener ─────────────────────────────────────────────────────────────

function attachListeners(contract: ethers.Contract, provider: ethers.JsonRpcProvider): void {
  const handle = async (evt: ethers.EventLog) => {
    try {
      await saveLog(evt, provider);
      log(`[${evt.fragment.name}] tx ${evt.transactionHash.slice(0, 10)}… saved`, "indexer");
    } catch (err: any) {
      log(`listener save failed: ${err.message}`, "indexer");
    }
  };

  for (const eventName of ["LevelIncomePaid", "PlacementIncomePaid", "RankIncomePaid", "Activated", "Reborn"]) {
    contract.on(eventName, (...args) => {
      const evt = args[args.length - 1] as ethers.EventLog;
      handle(evt);
    });
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function startIndexer(): Promise<void> {
  try {
    const provider = new ethers.JsonRpcProvider(MCHAIN_RPC);
    provider.pollingInterval = 8_000; // check for new events every 8s

    const contract = new ethers.Contract(CONTRACT_ADDR, ABI, provider);

    const currentBlock = Number(await provider.getBlockNumber());
    const savedStr     = await storage.getKv(KV_KEY);
    const lastBlock    = savedStr ? parseInt(savedStr, 10) : Math.max(0, currentBlock - 10_000);

    // 1. Catch up on anything missed while server was down
    await catchUp(contract, provider, lastBlock + 1, currentBlock);

    // 2. Attach real-time listeners for everything going forward
    attachListeners(contract, provider);
    log(`Live event listeners active (polling every 8s)`, "indexer");

    // 3. Periodically save current block as checkpoint (so restart recovery is fast)
    setInterval(async () => {
      try {
        const blk = Number(await provider.getBlockNumber());
        await storage.setKv(KV_KEY, blk.toString());
      } catch {}
    }, CHECKPOINT_INTERVAL);

  } catch (err: any) {
    log(`Failed to start indexer: ${err.message}`, "indexer");
  }
}
