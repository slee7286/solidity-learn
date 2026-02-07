// hardhat.config.js
require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    // Flare Mainnet
    flare: {
      url: "https://flare-api.flare.network/ext/C/rpc",
      accounts: [process.env.PRIVATE_KEY],
      chainId: 14
    },
    // Flare Testnet (Coston2)
    coston2: {
      url: "https://coston2-api.flare.network/ext/C/rpc",
      accounts: [process.env.PRIVATE_KEY],
      chainId: 114
    },
    // Local development
    localhost: {
      url: "http://127.0.0.1:8545"
    }
  },
  etherscan: {
    apiKey: {
      flare: "flare", // Placeholder
      coston2: "coston2"
    },
    customChains: [
      {
        network: "flare",
        chainId: 14,
        urls: {
          apiURL: "https://flare-explorer.flare.network/api",
          browserURL: "https://flare-explorer.flare.network"
        }
      },
      {
        network: "coston2",
        chainId: 114,
        urls: {
          apiURL: "https://coston2-explorer.flare.network/api",
          browserURL: "https://coston2-explorer.flare.network"
        }
      }
    ]
  }
};
