const hre = require("hardhat");

/**
 * Deploys the AgentControlledToken contract with inline BondingCurveDEX.
 * @param {Object} signer - The ethers signer
 * @param {string} name - Token Name
 * @param {string} symbol - Token Symbol
 * @param {string} topic - Trend Topic
 * @param {string} region - Trend Region
 * @param {string} initialSupply - Initial token supply (in ether units, will be converted to wei)
 * @param {number} swapFeeBps - DEX swap fee in basis points (e.g., 70 = 0.7%)
 */
async function deployToken(signer, name, symbol, topic, region, initialSupply, swapFeeBps = 70) {
    const AgentControlledToken = await hre.ethers.getContractFactory("AgentControlledToken", signer);

    // Convert initial supply to wei
    const initialSupplyWei = hre.ethers.parseUnits(initialSupply.toString(), 18);

    // Deploy contract - creates DEX automatically
    const token = await AgentControlledToken.deploy(
        name,
        symbol,
        topic,
        region,
        initialSupplyWei,
        swapFeeBps
    );
    await token.waitForDeployment();

    const address = await token.getAddress();
    const dexAddress = await token.dexContract();
    
    console.log(`✅ AgentControlledToken deployed to: ${address}`);
    console.log(`✅ BondingCurveDEX deployed to: ${dexAddress}`);
    
    return { token, address, dexAddress };
}

module.exports = deployToken;

// If run directly (not required as module), execute main logic
if (require.main === module) {
    (async () => {
        const [deployer] = await hre.ethers.getSigners();
        const name = process.env.TOKEN_NAME || "Test Token";
        const symbol = process.env.TOKEN_SYMBOL || "TEST";
        const topic = process.env.TREND_TOPIC || "Testing";
        const region = process.env.TREND_REGION || "Local";
        const initialSupply = process.env.INITIAL_SUPPLY || "1000000";
        const swapFeeBps = parseInt(process.env.SWAP_FEE_BPS || "70");

        console.log("--- Deploying AgentControlledToken (Manual) ---");
        await deployToken(deployer, name, symbol, topic, region, initialSupply, swapFeeBps);
    })().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}
