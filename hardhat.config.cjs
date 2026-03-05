require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY || "";

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
    },
  },
  networks: {
    bscTestnet: {
      url: "https://data-seed-prebsc-1-s1.binance.org:8545/",
      chainId: 97,
      accounts: DEPLOYER_KEY ? [DEPLOYER_KEY] : [],
      gasPrice: 10000000000,
    },
    bscMainnet: {
      url: "https://bsc-dataseed.binance.org/",
      chainId: 56,
      accounts: DEPLOYER_KEY ? [DEPLOYER_KEY] : [],
      gasPrice: 3000000000,
    },
  },
  paths: {
    sources: "./contracts",
    artifacts: "./artifacts",
  },
};
