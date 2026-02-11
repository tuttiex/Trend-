const { ethers } = require("hardhat");
const LiquidityManager = require('../src/services/liquidityManager');

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Debugging Mint with account:", deployer.address);

    const liquidityManager = new LiquidityManager(ethers.provider, deployer);

    // Address from the last failed run
    const tokenAddress = "0x2BefaC569C1857b537bD2fA395EEbb440811d0E4";

    // 1. Get Pool
    console.log("Fetching pool...");
    const poolAddress = await liquidityManager.getOrCreatePool(tokenAddress);
    console.log("Pool Address:", poolAddress);

    // 2. Check Pool State
    const poolContract = new ethers.Contract(poolAddress, [
        "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)"
    ], deployer);

    const slot0 = await poolContract.slot0();
    console.log("Pool State (slot0):", slot0);
    console.log("Unlocked:", slot0.unlocked);
    console.log("SqrtPrice:", slot0.sqrtPriceX96.toString());

    if (slot0.sqrtPriceX96 == 0) {
        console.error("CRITICAL: Pool price is 0! Initialization failed.");
        // Try initializing?
    }

    // 3. Approve Token (again, just in case)
    const tokenContract = new ethers.Contract(tokenAddress, ["function approve(address, uint256) public returns (bool)", "function decimals() view returns (uint8)"], deployer);
    const decimals = await tokenContract.decimals();
    const amountToken = ethers.parseUnits("100000", decimals);
    const amountETH = ethers.parseEther("0.0001");

    console.log("Approving...");
    await (await tokenContract.approve(liquidityManager.pmContract.target, ethers.MaxUint256)).wait();

    // 4. Params
    const params = {
        token0: tokenAddress < "0x4200000000000000000000000000000000000006" ? tokenAddress : "0x4200000000000000000000000000000000000006",
        token1: tokenAddress < "0x4200000000000000000000000000000000000006" ? "0x4200000000000000000000000000000000000006" : tokenAddress,
        fee: 3000,
        tickLower: -887220, // Try standard full range ticks
        tickUpper: 887220,
        amount0Desired: amountToken, // Simplified, order might be wrong but let's see revert
        amount1Desired: amountETH,
        amount0Min: 0,
        amount1Min: 0,
        recipient: deployer.address,
        deadline: Math.floor(Date.now() / 1000) + 1200
    };

    console.log("Minting with params:", params);

    try {
        // Force manual gas limit to bypass estimation revert if possible / catch generic errors
        const tx = await liquidityManager.pmContract.mint(params, {
            value: amountETH,
            gasLimit: 3000000
        });
        console.log("Tx sent:", tx.hash);
        await tx.wait();
        console.log("Success!");
    } catch (e) {
        console.error("Mint failed:", e);
        if (e.data) console.error("Error Data:", e.data);
    }
}

main();
