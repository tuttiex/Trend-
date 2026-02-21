const { ethers } = require("ethers");
const { Token, Percent } = require("@uniswap/sdk-core");
const { Pool, Position, nearestUsableTick } = require("@uniswap/v3-sdk");
const IUniswapV3Factory = require("@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Factory.sol/IUniswapV3Factory.json");
const INonfungiblePositionManager = require("@uniswap/v3-periphery/artifacts/contracts/interfaces/INonfungiblePositionManager.sol/INonfungiblePositionManager.json");
const logger = require('../utils/logger');
require('dotenv').config();

// Base Sepolia Addresses (Official Defaults for Development)
const BASE_SEPOLIA = {
    factory: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24',
    positionManager: '0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2',
    swapRouter: '0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4', // SwapRouter02 typically
    WETH: '0x4200000000000000000000000000000000000006'
};

// Base Mainnet Addresses (For Production Switch)
const BASE_MAINNET = {
    factory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
    positionManager: '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1',
    swapRouter: '0x2626664c2603336E57B271c5C0b26F421741e481',
    WETH: '0x4200000000000000000000000000000000000006'
};

const FACTORIES = {
    84532: BASE_SEPOLIA,
    8453: BASE_MAINNET
};

class LiquidityManager {
    constructor(provider, signer) {
        this.provider = provider;
        this.signer = signer;
        // Default to Sepolia if not found
        this.config = BASE_SEPOLIA;
    }

    async init() {
        const { chainId } = await this.provider.getNetwork();
        const networkId = Number(chainId);
        if (FACTORIES[networkId]) {
            this.config = FACTORIES[networkId];
            logger.info(`LiquidityManager: Detected network ${networkId}. Using appropriate Uniswap addresses.`);
        } else {
            logger.warn(`LiquidityManager: Unknown network ${networkId}. Defaulting to Base Sepolia.`);
        }

        const factoryAddr = process.env.UNISWAP_FACTORY || this.config.factory;
        const pmAddr = process.env.UNISWAP_PM || this.config.positionManager;
        this.wethAddr = process.env.WETH_ADDRESS || this.config.WETH;

        this.factoryContract = new ethers.Contract(factoryAddr, IUniswapV3Factory.abi, this.signer);
        this.pmContract = new ethers.Contract(pmAddr, INonfungiblePositionManager.abi, this.signer);
        return this;
    }

    /**
     * Creates a pool for the given token and WETH if it doesn't exist.
     * @param {string} tokenAddress 
     * @param {number} fee e.g. 3000 for 0.3%, 10000 for 1%
     * @returns {Promise<string>} poolAddress
     */
    async getOrCreatePool(tokenAddress, fee = 3000) {
        logger.info(`Checking pool for token: ${tokenAddress} / WETH (Fee: ${fee})`);

        // Token0 must be less than Token1 address for Uniswap logic
        const [token0, token1] = tokenAddress.toLowerCase() < this.wethAddr.toLowerCase()
            ? [tokenAddress, this.wethAddr]
            : [this.wethAddr, tokenAddress];

        let poolAddress;
        try {
            poolAddress = await this.factoryContract.getPool(token0, token1, fee);
        } catch (error) {
            logger.error(`Failed to get pool address: ${error.message}`);
            // Retry logic or simpler fallback?
            throw error;
        }

        if (poolAddress === ethers.ZeroAddress) {
            logger.info("Pool does not exist. Creating new pool...");

            const MAX_RETRIES = 3;
            for (let i = 0; i < MAX_RETRIES; i++) {
                try {
                    // Check again just in case (consistency)
                    const existingPool = await this.factoryContract.getPool(token0, token1, fee);
                    if (existingPool !== ethers.ZeroAddress) {
                        logger.info(`Pool found (after retry check) at: ${existingPool}`);
                        return existingPool;
                    }

                    logger.info(`Attempt ${i + 1}/${MAX_RETRIES} to create pool...`);
                    const tx = await this.factoryContract.createPool(token0, token1, fee);
                    await tx.wait();

                    // Fetch the address again with retries
                    for (let j = 0; j < 10; j++) {
                        await new Promise(r => setTimeout(r, 2000));
                        const newPoolAddress = await this.factoryContract.getPool(token0, token1, fee);
                        if (newPoolAddress !== ethers.ZeroAddress) {
                            logger.info(`✅ Pool created at: ${newPoolAddress}`);
                            return newPoolAddress;
                        }
                        logger.warn(`Waiting for pool address indexing... (Attempt ${j + 1}/10)`);
                    }

                    throw new Error("Pool created but address could not be fetched (indexing timeout).");

                } catch (error) {
                    logger.warn(`Failed to create pool (Attempt ${i + 1}): ${error.message}`);

                    // If error is "pool already exists" (Uniswap specific) or we can find it now, return it
                    if (i === MAX_RETRIES - 1) {
                        // Last ditch effort to check if it exists
                        const finalCheck = await this.factoryContract.getPool(token0, token1, fee);
                        if (finalCheck !== ethers.ZeroAddress) return finalCheck;
                        throw error;
                    }

                    // Simple backoff
                    await new Promise(r => setTimeout(r, 2000));
                }
            }
        } else {
            logger.info(`Pool already exists at: ${poolAddress}`);
            return poolAddress;
        }
    }

    /**
     * Initializes the pool with a starting price.
     * @param {string} tokenAddress 
     * @param {string} poolAddress
     * @param {string} initialPrice (e.g., "0.00001" ETH per Token)
     */
    async initializePool(tokenAddress, poolAddress, initialPrice) {
        logger.info(`Initializing pool at ${poolAddress} with price: ${initialPrice} ETH`);

        // Calculate sqrtPriceX96 based on price ratio
        // Price = token1 / token0

        // Example: If Token < WETH
        // token0 = Token, token1 = WETH
        // Price (ETH per Token) = token1 amount / token0 amount = initialPrice
        // sqrtPriceX96 = sqrt(price) * 2^96

        // If WETH < Token
        // token0 = WETH, token1 = Token
        // Price (Token per ETH) = 1 / initialPrice
        // sqrtPriceX96 = sqrt(1/price) * 2^96

        const isToken0 = tokenAddress.toLowerCase() < this.wethAddr.toLowerCase();
        const price = parseFloat(initialPrice);
        let sqrtPrice;

        if (isToken0) {
            // Token is token0. We want price in terms of token1 (ETH).
            // Price = amount1/amount0 = ETH/Token
            sqrtPrice = Math.sqrt(price);
        } else {
            // WETH is token0. We want price in terms of token1 (Token).
            // Price (Token/ETH) = 1 / (ETH/Token)
            sqrtPrice = Math.sqrt(1 / price);
        }

        const q96 = 2n ** 96n;
        // Logic: sqrtPriceX96 = floor(sqrtPrice * 2^96)
        // Using BigInt directly might overflow/precision loss with float math, but for initial setup it's usually acceptable approximation.
        // For production, exact BigNumber implementation is safer.
        const sqrtPriceX96 = BigInt(Math.floor(sqrtPrice * Number(q96)));

        logger.info(`Calculated sqrtPriceX96: ${sqrtPriceX96.toString()}`);

        const poolContract = new ethers.Contract(poolAddress, [
            'function initialize(uint160 sqrtPriceX96) external',
            'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)'
        ], this.signer);

        const MAX_RETRIES = 3;
        for (let i = 0; i < MAX_RETRIES; i++) {
            try {
                // Wait a bit for indexing if this is a retry or fresh creation
                if (i > 0) await new Promise(r => setTimeout(r, 5000));

                logger.info(`Checking pool state (Attempt ${i + 1}/${MAX_RETRIES})...`);

                // Check if already initialized
                let isInitialized = false;
                try {
                    const slot0 = await poolContract.slot0();
                    if (slot0.sqrtPriceX96 > 0n) {
                        logger.info(`Pool already initialized. SqrtPrice: ${slot0.sqrtPriceX96.toString()}`);
                        isInitialized = true;
                    }
                } catch (e) {
                    // BAD_DATA means node hasn't indexed relevant code yet/doesn't see it
                    logger.warn(`Slot0 check failed (likely indexing lag): ${e.code || e.message}`);
                }

                if (isInitialized) return;

                // Initialize
                logger.info(`Initializing pool with price...`);
                const tx = await poolContract.initialize(sqrtPriceX96);
                await tx.wait();
                logger.info("✅ Pool Initialized with Price. Waiting for propagation...");

                // Wait for propagation (ensure slot0 returns valid price)
                const WAIT_STEPS = 10;
                for (let j = 0; j < WAIT_STEPS; j++) {
                    await new Promise(r => setTimeout(r, 2000));
                    try {
                        const s0 = await poolContract.slot0();
                        if (s0.sqrtPriceX96 > 0n) {
                            logger.info("✅ Pool Initialization verified on-chain.");
                            return;
                        }
                    } catch (e) {
                        logger.warn(`Waiting for init propagation... (${e.code || e.message})`);
                    }
                }

                throw new Error("Pool initialization transaction confirmed, but state not propagated (timeout).");

            } catch (error) {
                logger.warn(`Pool init failed (Attempt ${i + 1}): ${error.message}`);

                // Double check concurrent init
                if (i === MAX_RETRIES - 1) {
                    try {
                        const slot0 = await poolContract.slot0();
                        if (slot0.sqrtPriceX96 > 0n) return;
                    } catch (e) { /* ignore */ }
                    throw error;
                }
            }
        }
    }

    /**
     * Adds initial liquidity to the pool (Full Range).
     * @param {string} tokenAddress 
     * @param {string} amountToken (e.g. "300000")
     * @param {string} amountETH (e.g. "0.01")
     * @param {number} fee 
     */
    async addLiquidity(tokenAddress, amountToken, amountETH, fee = 3000) {
        logger.info(`Adding Liquidity: ${amountToken} Tokens + ${amountETH} ETH`);

        const token0 = tokenAddress.toLowerCase() < this.wethAddr.toLowerCase() ? tokenAddress : this.wethAddr;
        const token1 = tokenAddress.toLowerCase() < this.wethAddr.toLowerCase() ? this.wethAddr : tokenAddress;

        // 0. Check if pool already has REAL liquidity (to prevent double-add on resumption)
        try {
            const poolAddress = await this.factoryContract.getPool(token0, token1, fee);
            if (poolAddress !== ethers.ZeroAddress) {
                const poolContract = new ethers.Contract(poolAddress, ['function liquidity() external view returns (uint128)'], this.provider);
                const currentLiquidity = await poolContract.liquidity();
                if (currentLiquidity > 0n) {
                    logger.warn(`⚠️ ON-CHAIN GUARD: Pool at ${poolAddress} already has liquidity (${currentLiquidity.toString()}). Skipping addition.`);
                    return "ALREADY_EXISTING_LIQUIDITY";
                }
            }
        } catch (liquidityError) {
            logger.warn(`Could not verify existing liquidity (ignoring): ${liquidityError.message}`);
        }

        const tokenContract = new ethers.Contract(tokenAddress, [
            "function approve(address spender, uint256 amount) external returns (bool)",
            "function allowance(address owner, address spender) external view returns (uint256)",
            "function decimals() external view returns (uint8)"
        ], this.signer);

        // 1. Approve Position Manager
        const decimals = await tokenContract.decimals();
        const amountTokenWei = ethers.parseUnits(amountToken, decimals);
        const amountETHWei = ethers.parseEther(amountETH);

        logger.info("Approving PositionManager to spend tokens...");
        const txApprove = await tokenContract.approve(this.config.positionManager, amountTokenWei);
        await txApprove.wait();

        // 2. Sort tokens
        // (token0 and token1 are already defined above)
        const amount0Desired = token0 === tokenAddress ? amountTokenWei : amountETHWei;
        const amount1Desired = token1 === tokenAddress ? amountTokenWei : amountETHWei;

        // 3. Define Full Range (Tick Min to Tick Max)
        // Uniswap V3 "Full Range" is tick -887220 to 887220 (must be divisible by tickSpacing)
        // For fee 3000 (0.3%), tickSpacing is 60.
        const tickSpacing = 60;
        const minTick = -887272; // Approximate min usable
        const maxTick = 887272; // Approximate max usable

        const tickLower = nearestUsableTick(minTick, tickSpacing);
        const tickUpper = nearestUsableTick(maxTick, tickSpacing);

        const params = {
            token0: token0,
            token1: token1,
            fee: fee,
            tickLower: tickLower,
            tickUpper: tickUpper,
            amount0Desired: amount0Desired,
            amount1Desired: amount1Desired,
            amount0Min: 0, // In production, calculate slippage properly
            amount1Min: 0,
            recipient: await this.signer.getAddress(),
            deadline: Math.floor(Date.now() / 1000) + 60 * 10
        };

        logger.info("Minting Liquidity Position...");

        const MAX_MINT_RETRIES = 3;
        for (let attempt = 1; attempt <= MAX_MINT_RETRIES; attempt++) {
            try {
                const feeData = await this.provider.getFeeData();
                const baseGasPrice = feeData.gasPrice || ethers.parseUnits('0.1', 'gwei');
                // Start at 100% of current gas, boost by 50% on each retry
                const multiplier = BigInt(100 + (attempt - 1) * 50);
                const gasPrice = (baseGasPrice * multiplier) / 100n;

                logger.info(`Mint attempt ${attempt}/${MAX_MINT_RETRIES} | gasPrice: ${ethers.formatUnits(gasPrice, 'gwei')} gwei`);

                const tx = await this.pmContract.mint(params, { value: amountETHWei, gasPrice });
                const receipt = await tx.wait();
                logger.info("✅ Liquidity Added! Position Minted.");
                return receipt.hash;

            } catch (error) {
                const isGasError = error.message && (
                    error.message.includes('replacement transaction underpriced') ||
                    error.message.includes('transaction underpriced') ||
                    error.message.includes('maxFeePerGas')
                );
                if (isGasError && attempt < MAX_MINT_RETRIES) {
                    logger.warn(`⚠️ Gas rejected on attempt ${attempt}. Retrying with higher gas...`);
                    await new Promise(r => setTimeout(r, 3000));
                    continue;
                }
                logger.error(`Failed to mint liquidity after ${attempt} attempt(s): ${error.message}`);
                throw error;
            }
        }
    }
}

module.exports = LiquidityManager;
