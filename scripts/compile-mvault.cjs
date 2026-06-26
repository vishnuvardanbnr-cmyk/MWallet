const solc = require("solc");
const fs   = require("fs");
const path = require("path");

const contractsDir = path.join(__dirname, "../contracts");
const artifactsDir = path.join(__dirname, "../artifacts/contracts");

const contracts = ["MvaultToken","MvaultContract","MvaultBoardMatrix","MvaultStaking","MvaultView"];

function readFile(p) { return fs.readFileSync(p, "utf8"); }

const sources = {};
for (const name of contracts) {
  sources[`contracts/${name}.sol`] = { content: readFile(path.join(contractsDir, `${name}.sol`)) };
}

function findImport(importPath) {
  const candidates = [
    path.join(__dirname, "../node_modules", importPath),
    path.join(__dirname, "..", importPath),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return { contents: readFile(c) };
  }
  return { error: `File not found: ${importPath}` };
}

const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    viaIR: true,
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};

console.log("Compiling...");
const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImport }));

if (output.errors) {
  const errs = output.errors.filter(e => e.severity === "error");
  if (errs.length) {
    console.error("COMPILE ERRORS:");
    errs.forEach(e => console.error(e.formattedMessage));
    process.exit(1);
  }
}

for (const name of contracts) {
  const compiled = output.contracts[`contracts/${name}.sol`]?.[name];
  if (!compiled) { console.error(`Missing output for ${name}`); continue; }

  const artifactDir = path.join(artifactsDir, `${name}.sol`);
  fs.mkdirSync(artifactDir, { recursive: true });

  const artifact = {
    contractName: name,
    abi: compiled.abi,
    bytecode: "0x" + compiled.evm.bytecode.object,
  };

  fs.writeFileSync(path.join(artifactDir, `${name}.json`), JSON.stringify(artifact, null, 2));
  const size = Math.ceil(compiled.evm.bytecode.object.length / 2);
  console.log(`  ✓ ${name}: ${size} bytes (limit 24576)`);
}
console.log("Done.");
