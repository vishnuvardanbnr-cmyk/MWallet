import { ethers } from "ethers";
import { storage } from "./storage";
import { log } from "./index";

const MCHAIN_RPC   = "https://node.mymchain.com/api/rpc";
const CONTRACT_ADDR = process.env.VITE_MVAULT_CONTRACT_ADDRESS || "0x60c5bd746f6245ecE5daC006082a7bd13f521aF8";
const CHUNK_SIZE    = 1000;
const POLL_INTERVAL = 30_000;
const KV_KEY        = "indexer:lastBlock";

const ABI = [
  "event LevelIncomePaid(address indexed to, address indexed from, uint8 level, uint256 amount)",
  "event PlacementIncomePaid(address indexed to, address indexed from, uint8 level, uint256 amount)",
  "event RankIncomePaid(address indexed to, address indexed from, uint8 rank, uint256 amount)",
  "event Activated(address indexed user, uint256 mvtMinted, uint256 grossMvt, uint256 levelAmt, uint256 binaryAmt, uint256 adminAmt)",
  "event Reborn(address indexed mainAccount, address indexed subAccount, uint256 rebirthIndex)",
];

type EventSpec = {
  name: string;
  wallet: (args: ethers.Result) => string;
  from?:  (args: ethers.Result) => string;
  level?: (args: ethers.Result) => number;
  amount?: (args: ethers.Result) => string;
  extra?: (args: ethers.Result) => string;
};

const EVENTS: EventSpec[] = [
  {
    name:   "LevelIncomePaid",
    wallet: (a) => a[0] as string,
    from:   (a) => a[1] as string,
    level:  (a) => Number(a[2]),
    amount: (a) => (a[3] as bigint).toString(),
  },
  {
    name:   "PlacementIncomePaid",
    wallet: (a) => a[0] as string,
    from:   (a) => a[1] as string,
    level:  (a) => Number(a[2]),
    amount: (a) => (a[3] as bigint).toString(),
  },
  {
    name:   "RankIncomePaid",
    wallet: (a) => a[0] as string,
    from:   (a) => a[1] as string,
    level:  (a) => Number(a[2]),
    amount: (a) => (a[3] as bigint).toString(),
  },
  {
    name:   "Activated",
    wallet: (a) => a[0] as string,
    extra:  (a) => JSON.stringify({
      mvtMinted: (a[1] as bigint).toString(),
      grossMvt:  (a[2] as bigint).toString(),
      levelAmt:  (a[3] as bigint).toString(),
      binaryAmt: (a[4] as bigint).toString(),
      adminAmt:  (a[5] as bigint).toString(),
    }),
  },
  {
    name:   "Reborn",
    wallet: (a) => a[0] as string,
    from:   (a) => a[1] as string,
    extra:  (a) => JSON.stringify({ rebirthIndex: (a[2] as bigint).toString() }),
  },
];

async function processChunk(
  contract: ethers.Contract,
  provider: ethers.JsonRpcProvider,
  fromBlock: number,
  toBlock: number,
): Promise<number> {
  let saved = 0;

  for (const spec of EVENTS) {
    const filter = contract.filters[spec.name]();
    const logs = await contract.queryFilter(filter, fromBlock, toBlock);

    for (const evt of logs) {
      if (!("args" in evt)) continue;
      const block = await provider.getBlock(evt.blockNumber);
      await storage.saveOnChainEvent({
        txHash:        evt.transactionHash,
        blockNumber:   evt.blockNumber,
        logIndex:      evt.index,
        eventType:     spec.name,
        walletAddress: spec.wallet(evt.args),
        fromAddress:   spec.from?.(evt.args),
        level:         spec.level?.(evt.args),
        amountRaw:     spec.amount?.(evt.args),
        extraData:     spec.extra?.(evt.args),
        blockTimestamp: block ? new Date(Number(block.timestamp) * 1000) : undefined,
      });
      saved++;
    }
  }

  return saved;
}

async function runIndexer(): Promise<void> {
  const provider = new ethers.JsonRpcProvider(MCHAIN_RPC);
  const contract = new ethers.Contract(CONTRACT_ADDR, ABI, provider);

  const currentBlock = Number(await provider.getBlockNumber());
  const savedStr     = await storage.getKv(KV_KEY);
  const lastBlock    = savedStr ? parseInt(savedStr, 10) : Math.max(0, currentBlock - 10_000);

  if (lastBlock >= currentBlock) return;

  let from = lastBlock + 1;
  let totalSaved = 0;

  while (from <= currentBlock) {
    const to = Math.min(from + CHUNK_SIZE - 1, currentBlock);
    try {
      const n = await processChunk(contract, provider, from, to);
      totalSaved += n;
      await storage.setKv(KV_KEY, to.toString());
      from = to + 1;
    } catch (err: any) {
      log(`[indexer] chunk ${from}-${to} failed: ${err.message}`, "indexer");
      break;
    }
  }

  if (totalSaved > 0) {
    log(`indexed blocks ${lastBlock + 1}→${from - 1}, saved ${totalSaved} events`, "indexer");
  }
}

export function startIndexer(): void {
  const run = async () => {
    try {
      await runIndexer();
    } catch (err: any) {
      log(`[indexer] error: ${err.message}`, "indexer");
    }
  };

  run();
  setInterval(run, POLL_INTERVAL);
  log("Event indexer started (polling every 30s)", "indexer");
}
