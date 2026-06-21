/**
 * Compile all M-Vault contracts using solc + OpenZeppelin from node_modules.
 * Outputs artifacts to artifacts/contracts/<Name>.sol/<Name>.json
 */
const solc   = require("solc");
const fs     = require("fs");
const path   = require("path");

const ROOT       = path.join(__dirname, "..");
const CONTRACTS  = path.join(ROOT, "contracts");
const ARTIFACTS  = path.join(ROOT, "artifacts", "contracts");
const OZ_PATH    = path.join(ROOT, "node_modules", "@openzeppelin");

const FILES = [
  "MvaultToken.sol",
  "MvaultContract.sol",
  "MvaultBoardMatrix.sol",
  "MvaultStaking.sol",
  "MvaultView.sol",
];

function readFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function findImport(importPath) {
  // @openzeppelin/... → node_modules/@openzeppelin/...
  if (importPath.startsWith("@openzeppelin/")) {
    const full = path.join(ROOT, "node_modules", importPath);
    if (fs.existsSync(full)) return { contents: readFile(full) };
  }
  // relative imports
  const full = path.join(CONTRACTS, importPath);
  if (fs.existsSync(full)) return { contents: readFile(full) };
  return { error: `File not found: ${importPath}` };
}

const sources = {};
for (const file of FILES) {
  sources[file] = { content: readFile(path.join(CONTRACTS, file)) };
}

const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 1 },
    viaIR: true,
    evmVersion: "paris",
    outputSelection: {
      "*": { "*": ["abi", "evm.bytecode", "evm.deployedBytecode"] },
    },
  },
};

console.log("Compiling contracts...\n");
const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImport }));

let hasError = false;
if (output.errors) {
  for (const err of output.errors) {
    if (err.severity === "error") { console.error("ERROR:", err.formattedMessage); hasError = true; }
    else console.warn("WARN:", err.formattedMessage.split("\n")[0]);
  }
}
if (hasError) { console.error("\nCompilation failed."); process.exit(1); }

fs.mkdirSync(ARTIFACTS, { recursive: true });

const SIZE_LIMIT = 24576;
let allOk = true;

for (const file of FILES) {
  const baseName = file.replace(".sol", "");
  const contract = output.contracts[file]?.[baseName];
  if (!contract) { console.error(`Missing output for ${baseName}`); allOk = false; continue; }

  const artifact = {
    contractName: baseName,
    abi: contract.abi,
    bytecode: "0x" + contract.evm.bytecode.object,
    deployedBytecode: "0x" + contract.evm.deployedBytecode.object,
  };

  const outDir = path.join(ARTIFACTS, file);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, baseName + ".json"), JSON.stringify(artifact, null, 2));

  const deployedBytes = (artifact.deployedBytecode.length - 2) / 2;
  const ok = deployedBytes <= SIZE_LIMIT;
  console.log(`  ${ok ? "✓" : "⚠"} ${baseName}: ${deployedBytes} bytes / ${SIZE_LIMIT} limit ${ok ? "" : "← OVER LIMIT (deploying anyway)"}`);
}

console.log("\nAll contracts compiled → artifacts/");

