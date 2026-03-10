const fs = require('fs');
const { ethers } = require('ethers');

async function main() {
  const buildInfo = JSON.parse(fs.readFileSync('artifacts/build-info/c6baafe9bd53af4319033b597ac8b3c3.json', 'utf8'));
  const sourceCode = JSON.stringify(buildInfo.input);
  const contractAddress = '0x284dcb5C8F2407c135713a093A4fB42Ef2b1bCBF';

  const abiCoder = new ethers.AbiCoder();
  const constructorArgs = abiCoder.encode(
    ['address', 'uint8', 'address', 'address'],
    [
      '0x0D3E80cBc9DDC0a3Fdee912b99C50cd0b5761eE3',
      18,
      '0x127323b3053a901620f8d461c88fc6a7d9c7de2e',
      '0x127323b3053a901620f8d461c88fc6a7d9c7de2e'
    ]
  ).slice(2);

  const params = new URLSearchParams({
    apikey: process.env.BSCSCAN_API_KEY,
    module: 'contract',
    action: 'verifysourcecode',
    contractaddress: contractAddress,
    sourceCode: sourceCode,
    codeformat: 'solidity-standard-json-input',
    contractname: 'contracts/MLMContract.sol:MLMContract',
    compilerversion: 'v0.8.20+commit.a1b79de6',
    constructorArguements: constructorArgs,
  });

  console.log('Submitting verification...');
  const res = await fetch('https://api.etherscan.io/v2/api?chainid=97', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const d = await res.json();
  console.log('Response:', JSON.stringify(d));

  if (d.status === '1' && d.result) {
    const guid = d.result;
    console.log('GUID:', guid, '— waiting 20s then polling...');
    await new Promise(r => setTimeout(r, 20000));
    const pr = await fetch(`https://api.etherscan.io/v2/api?chainid=97&module=contract&action=checkverifystatus&guid=${guid}&apikey=${process.env.BSCSCAN_API_KEY}`);
    const pd = await pr.json();
    console.log('Status:', JSON.stringify(pd));
  }
}
main().catch(console.error);
