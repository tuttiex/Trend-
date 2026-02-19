const hre = require("hardhat");

/**
 * Deploys the TrendToken contract.
 * @param {Object} signer - The ethers signer
 * @param {string} name - Token Name
 * @param {string} symbol - Token Symbol
 * @param {string} topic - Trend Topic
 * @param {string} region - Trend Region
 * @param {string} tokenURI - IPFS Metadata URI
 */
async function deployToken(signer, name, symbol, topic, region, tokenURI) {
    const TrendToken = await hre.ethers.getContractFactory("TrendToken", signer);

    // Deploy contract with new tokenURI argument
    const token = await TrendToken.deploy(name, symbol, topic, region, tokenURI);
    await token.waitForDeployment();

    const address = await token.getAddress();
    console.log(`✅ TrendToken deployed to: ${address}`);
    return { token, address };
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
        const uri = "ipfs://QmPlaceholder";

        console.log("--- Deploying TrendToken (Manual) ---");
        await deployToken(deployer, name, symbol, topic, region, uri);
    })().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}
