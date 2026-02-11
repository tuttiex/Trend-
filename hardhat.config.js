require("@nomicfoundation/hardhat-toolbox");
require('dotenv').config();

const BASE_SEPOLIA_RPC = process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org";
const BASE_MAINNET_RPC = process.env.BASE_MAINNET_RPC || "https://mainnet.base.org";
// DEV ONLY: Fallback key for compilation/testing if not in .env
const PRIVATE_KEY = process.env.AGENT_WALLET_PRIVATE_KEY || "0000000000000000000000000000000000000000000000000000000000000000";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
    solidity: {
        version: "0.8.20",
        settings: {
            optimizer: {
                enabled: true,
                runs: 200
            }
        }
    },
    networks: {
        baseSepolia: {
            url: BASE_SEPOLIA_RPC,
            accounts: [PRIVATE_KEY],
            chainId: 84532
        },
        base: {
            url: BASE_MAINNET_RPC,
            accounts: [PRIVATE_KEY],
            chainId: 8453
        },
        hardhat: {
            forking: {
                url: BASE_MAINNET_RPC,
                enabled: false // Enable for mainnet forking tests
            }
        }
    },
    paths: {
        sources: "./contracts",
        tests: "./tests",
        cache: "./cache",
        artifacts: "./artifacts"
    },
    etherscan: {
        apiKey: {
            baseSepolia: process.env.BASESCAN_API_KEY || ""
        },
        customChains: [
            {
                network: "baseSepolia",
                chainId: 84532,
                urls: {
                    apiURL: "https://api-sepolia.basescan.org/api",
                    browserURL: "https://sepolia.basescan.org"
                }
            }
        ]
    }
};
