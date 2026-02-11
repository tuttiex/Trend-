const { ethers } = require("hardhat");
const LiquidityManager = require('../src/services/liquidityManager');

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Testing with account:", deployer.address);

    const liquidityManager = new LiquidityManager(ethers.provider, deployer);

    // Reuse the token/pool from the failed run if possible, or deploy a dummy one
    // For now, let's just try to call the view functions to ensure we are talking to the right contracts

    console.log("Checking Factory...");
    const factory = liquidityManager.factoryContract;
    console.log("Factory Address:", await factory.getAddress());

    console.log("Checking Position Manager...");
    const pm = liquidityManager.pmContract;
    console.log("PM Address:", await pm.getAddress());

    // Try to get the pool for the failed token (from logs: 0x7891816DE50e724Be722e47c508b06929D85951A)
    const tokenAddress = "0x7891816DE50e724Be722e47c508b06929D85951A";
    const poolAddress = "0x0000000000000000000000000000000000000000"; // From logs it said created at 0x0... wait, that's suspicious!

    // Wait! The logs said: "✅ Pool created at: 0x0000000000000000000000000000000000000000"
    // AND "✅ Pool Initialized with Price."
    // AND "Initialization skipped (likely already initialized...)" with "nonce too low" warning.

    // IF POOL ADDRESS IS 0x0, THEN MINT WILL FAIL!

    console.log(`Checking pool for ${tokenAddress}...`);
    try {
        const addr = await liquidityManager.getOrCreatePool(tokenAddress);
        console.log("Real Pool Address:", addr);
    } catch (e) {
        console.error("Pool check failed:", e);
    }
}

main();
