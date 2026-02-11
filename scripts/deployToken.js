const hre = require("hardhat");

/**
 * Script to deploy a TrendToken contract.
 * Expects environment variables for connection or args for trend data.
 */
async function main() {
    console.log("--- Deploying TrendToken ---");

    // These would typically come from the Agent's Planner module
    // For manual testing, we provide defaults or use process.env
    const name = process.env.TOKEN_NAME || "Test Trend Token";
    const symbol = process.env.TOKEN_SYMBOL || "TTT";
    const topic = process.env.TREND_TOPIC || "Blockchain Automation";
    const region = process.env.TREND_REGION || "World";

    console.log(`Token Name: ${name}`);
    console.log(`Token Symbol: ${symbol}`);
    console.log(`Trend Topic: ${topic}`);
    console.log(`Trend Region: ${region}`);

    // Get the deployer account
    const [deployer] = await hre.ethers.getSigners();
    const balance = await hre.ethers.provider.getBalance(deployer.address);

    console.log(`Deploying with account: ${deployer.address}`);
    console.log(`Account balance: ${hre.ethers.formatEther(balance)} ETH`);

    // Deploy the contract
    const TrendToken = await hre.ethers.getContractFactory("TrendToken");
    const token = await TrendToken.deploy(name, symbol, topic, region);

    await token.waitForDeployment();

    const address = await token.getAddress();
    console.log(`✅ TrendToken deployed to: ${address}`);

    // Optional: Wait for block confirmations and verify
    if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
        console.log("Waiting for block confirmations...");
        // Wait for 5 blocks for reliability
        await token.deploymentTransaction().wait(5);

        console.log("Verifying on Block Explorer...");
        try {
            await hre.run("verify:verify", {
                address: address,
                constructorArguments: [name, symbol, topic, region],
            });
            console.log("✅ Contract verified successfully!");
        } catch (error) {
            console.error("Verification failed:", error.message);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
