const { ethers } = require("hardhat");

/**
 * Test utilities for BondingCurve system
 */
class TestUtils {
    constructor() {
        this.ONE_ETH = ethers.parseEther("1");
        this.ONE_DAY = 86400; // seconds
    }

    /**
     * Advance time by N seconds (for timelock tests)
     */
    async advanceTime(seconds) {
        await ethers.provider.send("evm_increaseTime", [seconds]);
        await ethers.provider.send("evm_mine", []);
    }

    /**
     * Get readable pool state from DEX
     */
    async getPoolState(dex) {
        const info = await dex.getPoolInfo();
        return {
            tokenReserve: ethers.formatUnits(info.tokenReserve, 18),
            ethReserve: ethers.formatEther(info.ethReserve),
            k: ethers.formatUnits(info.k, 18),
            swapFeeBps: info.swapFeeBps.toString(),
            totalFeesCollected: ethers.formatEther(info.totalFeesCollected),
            price: ethers.formatUnits(info.price, 18)
        };
    }

    /**
     * Calculate expected tokens out for ETH in
     */
    calculateTokensOut(ethIn, tokenReserve, ethReserve, feeBps = 70) {
        const fee = (ethIn * BigInt(feeBps)) / BigInt(10000);
        const ethInAfterFee = ethIn - fee;
        const k = tokenReserve * ethReserve;
        const newEthReserve = ethReserve + ethInAfterFee;
        const newTokenReserve = k / newEthReserve;
        const tokensOut = tokenReserve - newTokenReserve - BigInt(1);
        return { tokensOut, fee };
    }

    /**
     * Calculate expected ETH out for tokens in
     */
    calculateEthOut(tokensIn, tokenReserve, ethReserve, feeBps = 70) {
        const k = tokenReserve * ethReserve;
        const newTokenReserve = tokenReserve + tokensIn;
        const newEthReserve = k / newTokenReserve;
        const grossEthOut = ethReserve - newEthReserve - BigInt(1);
        const fee = (grossEthOut * BigInt(feeBps)) / BigInt(10000);
        const ethOut = grossEthOut - fee;
        return { ethOut, fee };
    }

    /**
     * Deploy full system: Token + DEX
     */
    async deployFullSystem(deployer, config = {}) {
        const {
            name = "Test Token",
            symbol = "TEST",
            topic = "Testing",
            region = "TestNet",
            initialSupply = ethers.parseUnits("1000000", 18),
            swapFeeBps = 70
        } = config;

        const AgentControlledToken = await ethers.getContractFactory("AgentControlledToken");
        const token = await AgentControlledToken.deploy(
            name,
            symbol,
            topic,
            region,
            initialSupply,
            swapFeeBps
        );
        await token.waitForDeployment();

        const dexAddress = await token.dexContract();
        const BondingCurveDEX = await ethers.getContractFactory("BondingCurveDEX");
        const dex = BondingCurveDEX.attach(dexAddress);

        return {
            token,
            dex,
            tokenAddress: await token.getAddress(),
            dexAddress
        };
    }

    /**
     * Seed initial liquidity
     */
    async seedLiquidity(token, dex, deployer, tokenAmount, ethAmount) {
        const tokenWei = ethers.parseUnits(tokenAmount.toString(), 18);
        const ethWei = ethers.parseEther(ethAmount.toString());

        // Approve DEX
        await token.approve(await dex.getAddress(), tokenWei);

        // Add liquidity
        await dex.addLiquidity(tokenWei, { value: ethWei });

        return { tokenWei, ethWei };
    }
}

module.exports = new TestUtils();
