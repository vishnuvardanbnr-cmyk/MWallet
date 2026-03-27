require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const DEPLOYER_KEY   = process.env.DEPLOYER_PRIVATE_KEY || "";
const ETHERSCAN_KEY  = process.env.BSCSCAN_API_KEY || "";

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 1 },
      viaIR: true,
    },
  },
  networks: {
    bscTestnet: {
      url: "https://data-seed-prebsc-1-s1.binance.org:8545/",
      chainId: 97,
      accounts: DEPLOYER_KEY ? [DEPLOYER_KEY] : [],
      gasPrice: 200000000,
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
  etherscan: {
    apiKey: ETHERSCAN_KEY || "YourApiKeyToken",
    customChains: [
      {
        network: "bscTestnet",
        chainId: 97,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=97",
          browserURL: "https://testnet.bscscan.com",
        },
      },
      {
        network: "bscMainnet",
        chainId: 56,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=56",
          browserURL: "https://bscscan.com",
        },
      },
    ],
  },
  sourcify: {
    enabled: true,
  },
};
