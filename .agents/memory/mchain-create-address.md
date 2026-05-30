---
name: MChain CREATE address offset
description: MChain computes CREATE addresses using nonce+1, not the nonce in the tx — ethers.getCreateAddress() predicts the wrong address.
---

## Rule
Never use `ethers.getCreateAddress({from, nonce})` or Hardhat's `ContractFactory.getAddress()` / `newContract.getAddress()` on MChain. Always read `receipt.contractAddress` from the mined deployment receipt.

## Why
MChain (chainId 1888) increments the account nonce BEFORE computing the CREATE address, so the deployed address = `keccak256(rlp([sender, nonce+1]))`. Ethereum and all other EVM chains use the nonce AT the time of the tx (pre-increment). Hardhat's `waitForDeployment()` reports the predicted address, which has 0 bytecode. The actual contract sits at a different address that only the receipt reveals.

## How to apply
1. Send deployment as a raw transaction via `eth_sendRawTransaction`.
2. Poll `eth_getTransactionReceipt` until mined.
3. Use `receipt.contractAddress` — this is the real address, guaranteed by the node.
4. Verify: `provider.getCode(receipt.contractAddress)` must return > 0 bytes before proceeding.

## Verified empirically
tx nonce 56 → predicted `ethers.getCreateAddress({nonce:56})` = `0x9080...`; actual `receipt.contractAddress` = `0xe5ce...`; matches `ethers.getCreateAddress({nonce:57})`. Offset is always +1.

## Script
`scripts/deploy-staking-mchain.cjs` implements this pattern correctly. Use it as a template for all future MChain deployments.
