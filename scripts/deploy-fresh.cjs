/**
 * Fresh M-Vault Full Deployment — BSC Testnet
 * Deploys: MvaultToken, MvaultContract, MvaultBoardMatrix, MvaultStaking, MvaultView
 * Wires all contracts together correctly.
 * Usage: node scripts/deploy-fresh.cjs
 */

require("dotenv/config");
const { ethers } = require("ethers");
const fs   = require("fs");
const path = require("path");

const USDT      = "0x0D3E80cBc9DDC0a3Fdee912b99C50cd0b5761eE3";
const RPC       = "https://bsc-testnet-rpc.publicnode.com";
const DEPLOYER_PK = process.env.DEPLOYER_PRIVATE_KEY;
if (!DEPLOYER_PK) { console.error("DEPLOYER_PRIVATE_KEY not set"); process.exit(1); }

function loadArtifact(name) {
  const p = path.join(__dirname, `../artifacts/contracts/${name}.sol/${name}.json`);
  if (!fs.existsSync(p)) { console.error(`Artifact missing: ${p}\nRun: npx hardhat compile`); process.exit(1); }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

async function deploy(signer, name, ...args) {
  const art = loadArtifact(name);
  const factory = new ethers.ContractFactory(art.abi, art.bytecode, signer);
  const nonce = await signer.getNonce();
  console.log(`  deploying ${name} (nonce ${nonce})...`);
  const contract = await factory.deploy(...args, { gasLimit: 8_000_000 });
  await contract.waitForDeployment();
  const addr = await contract.getAddress();
  console.log(`  ✓ ${name}: ${addr}`);
  return { contract, addr };
}

async function tx(label, promise) {
  const t = await promise;
  await t.wait();
  console.log(`  ✓ ${label}`);
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const signer   = new ethers.Wallet(DEPLOYER_PK, provider);
  const deployer = signer.address;

  const bal = await provider.getBalance(deployer);
  console.log("\n══════════════════════════════════════════");
  console.log("  M-Vault Fresh Deployment — BSC Testnet");
  console.log(`  Deployer : ${deployer}`);
  console.log(`  Balance  : ${ethers.formatEther(bal)} BNB`);
  console.log("══════════════════════════════════════════\n");

  // ── 1. MvaultToken ──────────────────────────────────────────────────────
  console.log("[1/5] MvaultToken");
  const { contract: mvtC, addr: MVT } = await deploy(signer, "MvaultToken", USDT);

  // ── 2. MvaultContract ───────────────────────────────────────────────────
  console.log("\n[2/5] MvaultContract");
  const { contract: mainC, addr: MAIN } = await deploy(signer, "MvaultContract", USDT, MVT);

  // ── 3. MvaultBoardMatrix ────────────────────────────────────────────────
  console.log("\n[3/5] MvaultBoardMatrix");
  const { contract: boardC, addr: BOARD } = await deploy(signer, "MvaultBoardMatrix", USDT);

  // ── 4. MvaultStaking ────────────────────────────────────────────────────
  console.log("\n[4/5] MvaultStaking");
  const { contract: stakingC, addr: STAKING } = await deploy(signer, "MvaultStaking", deployer, MAIN, USDT, MVT);

  // ── 5. MvaultView ───────────────────────────────────────────────────────
  console.log("\n[5/5] MvaultView");
  const { addr: VIEW } = await deploy(signer, "MvaultView", MAIN);

  // ── 6. Wire ─────────────────────────────────────────────────────────────
  console.log("\n[6/6] Wiring contracts...");

  await tx("MvaultToken → MvaultContract",
    mvtC.setMvaultContract(MAIN, { gasLimit: 100_000 }));

  await tx("MvaultToken → StakingModule",
    mvtC.setStakingModule(STAKING, { gasLimit: 100_000 }));

  await tx("MvaultContract → StakingModule",
    mainC.setStakingModule(STAKING, { gasLimit: 100_000 }));

  await tx("MvaultContract → BoardHandler",
    mainC.setBoardHandler(BOARD, { gasLimit: 100_000 }));

  await tx("MvaultContract → Manager (deployer)",
    mainC.setManager(deployer, { gasLimit: 100_000 }));

  await tx("BoardMatrix → MvaultContract",
    boardC.setMvaultContract(MAIN, { gasLimit: 100_000 }));

  await tx("BoardMatrix → LiquidityAddress (deployer)",
    boardC.setLiquidityAddress(deployer, { gasLimit: 100_000 }));

  await tx("BoardMatrix → SystemAddress (deployer)",
    boardC.setSystemAddress(deployer, { gasLimit: 100_000 }));

  // ── 7. Verify links ─────────────────────────────────────────────────────
  console.log("\n── Verifying links ──");
  const [stakingOnMain, boardOnMain, mvtOnMain, mvaultOnMvt, stakingOnMvt, mvaultOnStaking, mvtOnStaking] = await Promise.all([
    mainC.stakingModule(),
    mainC.boardHandler(),
    mainC.mvaultToken ? mainC.mvaultToken() : Promise.resolve("n/a"),
    mvtC.mvaultContract(),
    mvtC.stakingModule(),
    stakingC.mvaultMain(),
    stakingC.mvaultToken(),
  ]);
  const ok = (a, b) => a.toLowerCase() === b.toLowerCase() ? "✅" : "❌";
  console.log(`  Main.stakingModule  ${ok(stakingOnMain, STAKING)} ${stakingOnMain}`);
  console.log(`  Main.boardHandler   ${ok(boardOnMain, BOARD)} ${boardOnMain}`);
  console.log(`  MVT.mvaultContract  ${ok(mvaultOnMvt, MAIN)} ${mvaultOnMvt}`);
  console.log(`  MVT.stakingModule   ${ok(stakingOnMvt, STAKING)} ${stakingOnMvt}`);
  console.log(`  Staking.mvaultMain  ${ok(mvaultOnStaking, MAIN)} ${mvaultOnStaking}`);
  console.log(`  Staking.mvaultToken ${ok(mvtOnStaking, MVT)} ${mvtOnStaking}`);

  const balAfter = await provider.getBalance(deployer);
  const spent = bal - balAfter;

  console.log("\n══════════════════════════════════════════");
  console.log("  DEPLOYMENT COMPLETE ✓");
  console.log(`  BNB spent: ${ethers.formatEther(spent)}`);
  console.log(`  BNB left : ${ethers.formatEther(balAfter)}`);
  console.log("══════════════════════════════════════════");
  console.log(`\nVITE_MVT_TOKEN_ADDRESS=${MVT}`);
  console.log(`VITE_MVAULT_CONTRACT_ADDRESS=${MAIN}`);
  console.log(`VITE_BOARD_HANDLER_ADDRESS=${BOARD}`);
  console.log(`VITE_MVAULT_STAKING_ADDRESS=${STAKING}`);
  console.log(`VITE_MVAULT_VIEW_ADDRESS=${VIEW}`);
  console.log(`VITE_PAYMENT_TOKEN_ADDRESS=${USDT}`);
  console.log(`VITE_BSC_NETWORK=testnet`);

  // Write addresses to a temp file for the shell script to pick up
  fs.writeFileSync(
    path.join(__dirname, "../.deploy-addresses"),
    [
      `MVT_TOKEN=${MVT}`,
      `MVAULT_CONTRACT=${MAIN}`,
      `BOARD_HANDLER=${BOARD}`,
      `MVAULT_STAKING=${STAKING}`,
      `MVAULT_VIEW=${VIEW}`,
    ].join("\n") + "\n"
  );
  console.log("\nAddresses saved to .deploy-addresses");
}

main().catch(err => {
  console.error("\nDeployment failed:", err.shortMessage || err.message || err);
  process.exit(1);
});
