const {ethers} = require('ethers');

async function main() {
  const provider = new ethers.JsonRpcProvider('https://bsc-testnet-dataseed.bnbchain.org');
  const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);

  const MLM_ADDR   = '0x284dcb5C8F2407c135713a093A4fB42Ef2b1bCBF';
  const BOARD_ADDR = '0x0C63B585586E263DC801554d40A72F84976FdCfc';
  const USDT_ADDR  = '0x0D3E80cBc9DDC0a3Fdee912b99C50cd0b5761eE3';
  const UNIT       = ethers.parseUnits('1', 18);

  const mlmAbi = [
    'function recoverToken(address _token, address _to, uint256 _amount) external',
    'function btcPoolBalance(address) view returns (uint256)',
  ];
  const erc20Abi = ['function balanceOf(address) view returns (uint256)'];

  const mlm   = new ethers.Contract(MLM_ADDR, mlmAbi, wallet);
  const usdt  = new ethers.Contract(USDT_ADDR, erc20Abi, provider);

  const boardBefore = await usdt.balanceOf(BOARD_ADDR);
  const mlmBefore   = await usdt.balanceOf(MLM_ADDR);
  console.log('Before - MLMContract USDT:', ethers.formatUnits(mlmBefore, 18));
  console.log('Before - BoardHandler USDT:', ethers.formatUnits(boardBefore, 18));

  // Transfer $5,000 USDT to fund board handler pool operations
  const amount = ethers.parseUnits('5000', 18);
  console.log('\nTransferring $5,000 USDT from MLMContract → BoardMatrixHandler...');
  const tx = await mlm.recoverToken(USDT_ADDR, BOARD_ADDR, amount, {
    gasLimit: 100000,
    gasPrice: ethers.parseUnits('3', 'gwei'),
  });
  console.log('TX:', tx.hash);
  await tx.wait();
  console.log('Confirmed!');

  const boardAfter = await usdt.balanceOf(BOARD_ADDR);
  const mlmAfter   = await usdt.balanceOf(MLM_ADDR);
  console.log('\nAfter - MLMContract USDT:', ethers.formatUnits(mlmAfter, 18));
  console.log('After - BoardHandler USDT:', ethers.formatUnits(boardAfter, 18));
}

main().catch(console.error);
