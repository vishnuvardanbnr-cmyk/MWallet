const solc = require("solc");
const fs   = require("fs");
const path = require("path");

const contractsDir = path.join(__dirname, "../contracts");
const artifactsDir = path.join(__dirname, "../artifacts/contracts");

// Only MvaultContract needs viaIR (stack too deep without it)
const contracts = [
  { name: "MvaultToken",        viaIR: false },
  { name: "MvaultContract",     viaIR: true  },
  { name: "MvaultBoardMatrix",  viaIR: false },
  { name: "MvaultStaking",      viaIR: false },
  { name: "MvaultView",         viaIR: true  },
];

function readFile(p) { return fs.readFileSync(p, "utf8"); }

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

function compileOne({ name, viaIR }) {
  const sources = {};
  sources[`contracts/${name}.sol`] = { content: readFile(path.join(contractsDir, `${name}.sol`)) };

  const input = {
    language: "Solidity",
    sources,
    settings: {
      optimizer: { enabled: true, runs: 1 },
      evmVersion: "london",
      ...(viaIR ? { viaIR: true } : {}),
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImport }));

  if (output.errors) {
    const errs = output.errors.filter(e => e.severity === "error");
    if (errs.length) {
      console.error(`COMPILE ERRORS in ${name}:`);
      errs.forEach(e => console.error(e.formattedMessage));
      process.exit(1);
    }
  }

  const compiled = output.contracts[`contracts/${name}.sol`]?.[name];
  if (!compiled) { console.error(`Missing output for ${name}`); process.exit(1); }
  return compiled;
}

console.log("Compiling...");
for (const c of contracts) {
  const compiled = compileOne(c);
  const artifactDir = path.join(artifactsDir, `${c.name}.sol`);
  fs.mkdirSync(artifactDir, { recursive: true });

  const artifact = {
    contractName: c.name,
    abi: compiled.abi,
    bytecode: "0x" + compiled.evm.bytecode.object,
    deployedBytecode: "0x" + compiled.evm.deployedBytecode.object,
  };

  fs.writeFileSync(path.join(artifactDir, `${c.name}.json`), JSON.stringify(artifact, null, 2));
  const size = Math.ceil(compiled.evm.deployedBytecode.object.length / 2);
  const viaIRTag = c.viaIR ? " [viaIR]" : "";
  console.log(`  ✓ ${c.name}: ${size} bytes${viaIRTag}`);
}
console.log("Done.");
