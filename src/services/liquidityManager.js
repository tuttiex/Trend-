const { ethers } = require("ethers");
const { nearestUsableTick } = require("@uniswap/v3-sdk");
const IUniswapV3Factory = require("@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Factory.sol/IUniswapV3Factory.json");
const INonfungiblePositionManager = require("@uniswap/v3-periphery/artifacts/contracts/interfaces/INonfungiblePositionManager.sol/INonfungiblePositionManager.json");
const logger = require('../utils/logger');
require('dotenv').config();

// Base Sepolia Addresses (Official Defaults for Development)
const BASE_SEPOLIA = {
    factory: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24',
    positionManager: '0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2',
    swapRouter: '0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4',
    WETH: '0x4200000000000000000000000000000000000006'
};

// Base Mainnet Addresses (For Production)
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

// FIX #6: Maps every valid Uniswap V3 fee tier to its required tick spacing.
// The original code hardcoded 60, which is only correct for fee=3000 (0.3%).
// fee=500 (0.05%) → spacing 10 | fee=3000 (0.3%) → spacing 60 | fee=10000 (1%) → spacing 200
const FEE_TO_TICK_SPACING = { 500: 10, 3000: 60, 10000: 200 };

// FIX #4: Maximum time to wait for a transaction to be mined before throwing.
// Prevents tx.wait() from hanging indefinitely on congested networks, which
// was silently defeating the retry logic (the loop never retried).
const TX_TIMEOUT_MS = 120_000; // 2 minutes

// Slippage tolerance: set to 0n to never revert on price movement (original behaviour).
// Change to e.g. 100n for 1% protection if desired.
const SLIPPAGE_BPS = 0n;

class LiquidityManager {
    constructor(provider, signer) {
        this.provider = provider;
        this.signer = signer;
        this.config = BASE_SEPOLIA; // default until init() detects network
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

        // GROUP B FIX #2: Store the *resolved* position manager address so that
        // token approvals in addLiquidity() always target the same contract that
        // pmContract points to. Previously, approve() used this.config.positionManager
        // (the hardcoded default), which diverges from pmContract when UNISWAP_PM
        // env var is set — causing "insufficient allowance" reverts on every mint.
        this._pmAddr = pmAddr;

        this.factoryContract = new ethers.Contract(factoryAddr, IUniswapV3Factory.abi, this.signer);
        this.pmContract = new ethers.Contract(pmAddr, INonfungiblePositionManager.abi, this.signer);
        return this;
    }

    // ─── Private Helpers ──────────────────────────────────────────────────────

    /**
     * FIX #7: Throws a clear error if init() was never called.
     * Previously, skipping init() produced a cryptic "cannot read property of undefined".
     */
    _requireInit() {
        if (!this.factoryContract || !this.pmContract) {
            throw new Error('LiquidityManager not initialized. Call await init() before using this instance.');
        }
    }

    /**
     * FIX #4: Wraps tx.wait() in a Promise.race against a timeout.
     * Without this, a stuck transaction blocks the retry loop forever.
     * @param {ethers.TransactionResponse} tx
     * @param {number} timeoutMs
     */
    async _waitWithTimeout(tx, timeoutMs = TX_TIMEOUT_MS) {
        return Promise.race([
            tx.wait(),
            new Promise((_, reject) =>
                setTimeout(
                    () => reject(new Error(`Transaction timed out after ${timeoutMs / 1000}s. Hash: ${tx.hash}`)),
                    timeoutMs
                )
            )
        ]);
    }

    /**
     * FIX #3 (part 1): Integer square root via Newton's method — fully BigInt-safe.
     * The original code used Math.sqrt() with Number(2n**96n), which silently loses
     * precision because 2^96 exceeds JavaScript's 53-bit float mantissa.
     * @param {bigint} value
     * @returns {bigint}
     */
    _bigIntSqrt(value) {
        if (value < 0n) throw new Error('Cannot compute sqrt of a negative BigInt');
        if (value < 2n) return value;
        let x = value;
        let y = (x + 1n) / 2n;
        while (y < x) {
            x = y;
            y = (x + value / x) / 2n;
        }
        return x;
    }

    /**
     * FIX #3 (part 2): Converts a decimal price string (e.g. "0.000000004") to
     * a scaled BigInt with 18 decimal places, avoiding float parsing entirely.
     * @param {string} decStr - Decimal string (e.g. from toFixed(18))
     * @param {bigint} decimals - Number of decimal places to scale to
     * @returns {bigint}
     */
    _parseDecimalToBigInt(decStr, decimals = 18n) {
        const [intStr = '0', fracStr = ''] = decStr.split('.');
        const padded = fracStr.padEnd(Number(decimals), '0').slice(0, Number(decimals));
        return BigInt(intStr) * (10n ** decimals) + BigInt(padded || '0');
    }

    // ─── Public Methods ───────────────────────────────────────────────────────

    /**
     * Creates a Uniswap V3 pool for the given token and WETH if it doesn't exist.
     * @param {string} tokenAddress
     * @param {number} fee - Fee tier: 500 | 3000 | 10000
     * @returns {Promise<string>} poolAddress
     */
    async getOrCreatePool(tokenAddress, fee = 3000) {
        this._requireInit(); // FIX #7

        // FIX #6: Validate fee tier before any on-chain call
        if (!FEE_TO_TICK_SPACING[fee]) {
            throw new Error(`Unsupported fee tier: ${fee}. Valid values are: 500, 3000, 10000.`);
        }

        logger.info(`Checking pool for token: ${tokenAddress} / WETH (Fee: ${fee})`);

        // Token0 must be < Token1 address for correct Uniswap pool ordering
        const [token0, token1] = tokenAddress.toLowerCase() < this.wethAddr.toLowerCase()
            ? [tokenAddress, this.wethAddr]
            : [this.wethAddr, tokenAddress];

        let poolAddress;
        try {
            poolAddress = await this.factoryContract.getPool(token0, token1, fee);
        } catch (error) {
            logger.error(`Failed to get pool address: ${error.message}`);
            throw error;
        }

        if (poolAddress === ethers.ZeroAddress) {
            logger.info("Pool does not exist. Creating new pool...");

            const MAX_RETRIES = 3;
            for (let i = 0; i < MAX_RETRIES; i++) {
                try {
                    // Re-check before creating in case of concurrent execution
                    const existingPool = await this.factoryContract.getPool(token0, token1, fee);
                    if (existingPool !== ethers.ZeroAddress) {
                        logger.info(`Pool found (race condition check) at: ${existingPool}`);
                        return existingPool;
                    }

                    logger.info(`Attempt ${i + 1}/${MAX_RETRIES} to create pool...`);
                    const tx = await this.factoryContract.createPool(token0, token1, fee);
                    await this._waitWithTimeout(tx); // FIX #4: timeout-wrapped

                    // FIX #8: After tx.wait() confirms, the pool address is available
                    // immediately from the factory — no need for a 10-iteration polling loop.
                    // A 3-step fallback handles the rare RPC indexing lag.
                    logger.info(`Pool creation tx confirmed. Fetching pool address...`);
                    let newPoolAddress = await this.factoryContract.getPool(token0, token1, fee);
                    if (newPoolAddress !== ethers.ZeroAddress) {
                        logger.info(`✅ Pool created at: ${newPoolAddress}`);
                        return newPoolAddress;
                    }

                    for (let j = 0; j < 3; j++) {
                        await new Promise(r => setTimeout(r, 2000));
                        newPoolAddress = await this.factoryContract.getPool(token0, token1, fee);
                        if (newPoolAddress !== ethers.ZeroAddress) {
                            logger.info(`✅ Pool address confirmed (fallback ${j + 1}/3): ${newPoolAddress}`);
                            return newPoolAddress;
                        }
                        logger.warn(`Pool not yet indexed by RPC... (${j + 1}/3)`);
                    }

                    throw new Error("Pool created but address could not be fetched (RPC indexing timeout).");

                } catch (error) {
                    logger.warn(`Failed to create pool (Attempt ${i + 1}/${MAX_RETRIES}): ${error.message}`);

                    if (i === MAX_RETRIES - 1) {
                        // Last-ditch check — another instance may have created it
                        const finalCheck = await this.factoryContract.getPool(token0, token1, fee);
                        if (finalCheck !== ethers.ZeroAddress) return finalCheck;
                        throw error;
                    }

                    await new Promise(r => setTimeout(r, 2000));
                }
            }

            // GROUP B FIX #1: Defensive throw — if the retry loop exits without
            // a return or throw (e.g. a future logic change), this ensures the
            // function never silently returns undefined.
            // Previously: poolAddress = undefined was passed to initializePool
            // and addLiquidity, and saved as null to the DB without any error.
            throw new Error('getOrCreatePool: all retry attempts exhausted. Pool could not be created or confirmed.');
        } else {
            logger.info(`Pool already exists at: ${poolAddress}`);
            return poolAddress;
        }
    }

    /**
     * Initializes the pool with a starting sqrtPriceX96.
     * @param {string} tokenAddress
     * @param {string} poolAddress
     * @param {string} initialPrice - Price as a decimal string (e.g. "0.000000000004")
     */
    async initializePool(tokenAddress, poolAddress, initialPrice) {
        this._requireInit(); // FIX #7

        logger.info(`Initializing pool at ${poolAddress} with price: ${initialPrice} ETH`);

        const isToken0 = tokenAddress.toLowerCase() < this.wethAddr.toLowerCase();

        // FIX #3: BigInt-safe sqrtPriceX96 calculation.
        // The original code used: Math.sqrt(price) * Number(2n**96n)
        // This loses precision because 2^96 ≈ 7.9×10^28 exceeds JS float's 53-bit mantissa.
        //
        // Correct formula: sqrtPriceX96 = floor( sqrt(price) × 2^96 )
        //   = floor( sqrt(price × 2^192) )          [move 2^96 inside the sqrt]
        //   = floor( sqrt(priceNumerator × 2^192 / priceDenominator) )
        //
        // We represent price as priceScaled / 10^18 (fixed-point with 18 decimals),
        // so the calculation becomes: floor( sqrt(priceScaled × 2^192 / 10^18) )
        const Q96 = 2n ** 96n;
        const PRECISION = 10n ** 18n;

        // Convert the decimal price string (output of toFixed(18)) to a scaled BigInt
        const priceScaled = this._parseDecimalToBigInt(initialPrice);

        let sqrtPriceX96;
        if (isToken0) {
            // token is token0, WETH is token1
            // price (WETH/token) = priceScaled / PRECISION
            // sqrtPriceX96 = sqrt(priceScaled × Q96² / PRECISION)
            sqrtPriceX96 = this._bigIntSqrt((priceScaled * Q96 * Q96) / PRECISION);
        } else {
            // WETH is token0, token is token1
            // price (token/WETH) = PRECISION / priceScaled  (inverted)
            // sqrtPriceX96 = sqrt(PRECISION × Q96² / priceScaled)
            sqrtPriceX96 = this._bigIntSqrt((PRECISION * Q96 * Q96) / priceScaled);
        }

        logger.info(`Calculated sqrtPriceX96: ${sqrtPriceX96.toString()} (BigInt-safe)`);

        const poolContract = new ethers.Contract(poolAddress, [
            'function initialize(uint160 sqrtPriceX96) external',
            'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)'
        ], this.signer);

        const MAX_RETRIES = 3;
        for (let i = 0; i < MAX_RETRIES; i++) {
            try {
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
                    logger.warn(`Slot0 check failed (likely indexing lag): ${e.code || e.message}`);
                }

                if (isInitialized) return;

                logger.info(`Initializing pool with sqrtPriceX96...`);
                const tx = await poolContract.initialize(sqrtPriceX96);
                await this._waitWithTimeout(tx); // FIX #4: timeout-wrapped
                logger.info("✅ Pool initialized. Waiting for on-chain propagation...");

                // Confirm slot0 now reflects the new price
                const WAIT_STEPS = 10;
                for (let j = 0; j < WAIT_STEPS; j++) {
                    await new Promise(r => setTimeout(r, 2000));
                    try {
                        const s0 = await poolContract.slot0();
                        if (s0.sqrtPriceX96 > 0n) {
                            logger.info("✅ Pool initialization verified on-chain.");
                            return;
                        }
                    } catch (e) {
                        logger.warn(`Waiting for init propagation... (${e.code || e.message})`);
                    }
                }

                throw new Error("Pool initialization tx confirmed but state not propagated (timeout).");

            } catch (error) {
                logger.warn(`Pool init attempt ${i + 1} failed: ${error.message}`);

                if (i === MAX_RETRIES - 1) {
                    // Final check — another call may have initialized concurrently
                    try {
                        const slot0 = await poolContract.slot0();
                        if (slot0.sqrtPriceX96 > 0n) return;
                    } catch (e) { /* ignore — throw original below */ }
                    throw error;
                }
            }
        }
    }

    /**
     * Adds initial full-range liquidity to the pool.
     * @param {string} tokenAddress
     * @param {string} amountToken - Token amount as a string (e.g. "100000000")
     * @param {string} amountETH   - ETH amount as a string (e.g. "0.0004")
     * @param {number} fee         - Fee tier: 500 | 3000 | 10000
     */
    async addLiquidity(tokenAddress, amountToken, amountETH, fee = 10000) {
        this._requireInit(); // FIX #7

        // FIX #6: Resolve tick spacing from fee tier (was hardcoded to 60 for 0.3% only)
        const tickSpacing = FEE_TO_TICK_SPACING[fee];
        if (!tickSpacing) {
            throw new Error(`Unsupported fee tier: ${fee}. Valid values are: 500, 3000, 10000.`);
        }

        logger.info(`Adding Liquidity: ${amountToken} Tokens + ${amountETH} ETH (fee: ${fee})`);

        const token0 = tokenAddress.toLowerCase() < this.wethAddr.toLowerCase() ? tokenAddress : this.wethAddr;
        const token1 = tokenAddress.toLowerCase() < this.wethAddr.toLowerCase() ? this.wethAddr : tokenAddress;

        // FIX #5: Pre-flight check — verify pool is initialized BEFORE spending gas on approve.
        // If pool.slot0().sqrtPriceX96 == 0, the mint will revert on-chain with a confusing error.
        // This gives a clear, early diagnostic and saves the wasted approve gas.
        try {
            const poolCheckAddr = await this.factoryContract.getPool(token0, token1, fee);
            if (poolCheckAddr !== ethers.ZeroAddress) {
                const checkContract = new ethers.Contract(poolCheckAddr, [
                    'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool)'
                ], this.provider);
                const slot0 = await checkContract.slot0();
                if (slot0.sqrtPriceX96 === 0n) {
                    throw new Error(
                        `Pool at ${poolCheckAddr} exists but has not been initialized. ` +
                        `Call initializePool() before addLiquidity().`
                    );
                }
                logger.info(`Pre-flight check passed. Pool sqrtPrice: ${slot0.sqrtPriceX96.toString()}`);
            }
        } catch (preCheckErr) {
            // Re-throw the "not initialized" error — it's actionable and should not be swallowed
            if (preCheckErr.message.includes('not been initialized')) throw preCheckErr;
            // Other errors (e.g. RPC blip) are non-fatal — log and continue
            logger.warn(`Pre-flight slot0 check failed (non-fatal): ${preCheckErr.message}`);
        }

        // 0. Guard: skip if pool already has liquidity (prevents double-add on script resumption)
        try {
            const poolAddress = await this.factoryContract.getPool(token0, token1, fee);
            if (poolAddress !== ethers.ZeroAddress) {
                const poolContract = new ethers.Contract(
                    poolAddress,
                    ['function liquidity() external view returns (uint128)'],
                    this.provider
                );
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

        // 1. Approve Position Manager to spend tokens
        const decimals = await tokenContract.decimals();
        const amountTokenWei = ethers.parseUnits(amountToken, decimals);
        const amountETHWei = ethers.parseEther(amountETH);

        logger.info("Approving PositionManager to spend tokens...");
        // GROUP B FIX #2: Use this._pmAddr (set during init()) instead of
        // this.config.positionManager. If UNISWAP_PM env var overrides the address,
        // pmContract already points to the override — approval must target the same address.
        const txApprove = await tokenContract.approve(this._pmAddr, ethers.MaxUint256);
        await this._waitWithTimeout(txApprove); // FIX #4: timeout-wrapped

        // 2. Sort token amounts by pool ordering
        const amount0Desired = token0 === tokenAddress ? amountTokenWei : amountETHWei;
        const amount1Desired = token1 === tokenAddress ? amountTokenWei : amountETHWei;

        // Slippage mins: both set to 0 — mint succeeds regardless of price movement.
        // To enable slippage protection, set SLIPPAGE_BPS above to e.g. 100n (1%).
        const amount0Min = SLIPPAGE_BPS === 0n ? 0n : (amount0Desired * (10000n - SLIPPAGE_BPS)) / 10000n;
        const amount1Min = SLIPPAGE_BPS === 0n ? 0n : (amount1Desired * (10000n - SLIPPAGE_BPS)) / 10000n;

        // 3. Define full-range ticks using the correct spacing for this fee tier (FIX #6)
        const minTick = -887272;
        const maxTick = 887272;
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
            amount0Min: amount0Min,
            amount1Min: amount1Min,
            recipient: await this.signer.getAddress(),
            deadline: Math.floor(Date.now() / 1000) + 60 * 10
        };

        logger.info("Minting Liquidity Position...");

        const MAX_MINT_RETRIES = 3;
        for (let attempt = 1; attempt <= MAX_MINT_RETRIES; attempt++) {
            try {
                // FIX #2: Fetch fresh nonce inside the loop on EVERY attempt.
                // Original fetched nonce once before the loop — if attempt 1 mines (even
                // if it reverts), the nonce is consumed. Reusing it causes "nonce too low".
                const freshNonce = await this.signer.getNonce('pending');
                logger.info(`Nonce fetched for attempt ${attempt}: ${freshNonce}`);

                const feeData = await this.provider.getFeeData();
                const baseGasPrice = feeData.gasPrice || ethers.parseUnits('0.1', 'gwei');
                // Increase gas by 50% on each retry to help replacement transactions get picked up
                const multiplier = BigInt(100 + (attempt - 1) * 50);
                const gasPrice = (baseGasPrice * multiplier) / 100n;

                logger.info(`Mint attempt ${attempt}/${MAX_MINT_RETRIES} | gasPrice: ${ethers.formatUnits(gasPrice, 'gwei')} gwei | nonce: ${freshNonce}`);

                // Add 10,000 wei buffer (~$0.00000003) to msg.value to cover Uniswap's geometric rounding.
                // This prevents the contract from silently rejecting the native ETH and trying to pull WETH instead.
                const msgValueWithBuffer = amountETHWei + 10000n;
                const tx = await this.pmContract.mint(params, { value: msgValueWithBuffer, gasPrice, nonce: freshNonce });
                const receipt = await this._waitWithTimeout(tx); // FIX #4: timeout-wrapped
                logger.info("✅ Liquidity Added! Position Minted.");
                return receipt.hash;

            } catch (error) {
                const isRetryableError = error.message && (
                    error.message.includes('replacement transaction underpriced') ||
                    error.message.includes('transaction underpriced') ||
                    error.message.includes('maxFeePerGas') ||
                    error.message.includes('nonce too low')
                );
                if (isRetryableError && attempt < MAX_MINT_RETRIES) {
                    logger.warn(`⚠️ Tx rejected on attempt ${attempt} (Gas/Nonce issue). Retrying...`);
                    await new Promise(r => setTimeout(r, 3000));
                    continue;
                }
                logger.error(`Failed to mint liquidity after ${attempt} attempt(s): ${error.message}`);
                throw error;
            }
        }
    }

    /**
     * Injects additional inflationary supply into the pool as paired liquidity (Option A).
     * Calculates the required ETH to match the tokens at the current price and deepens the pool.
     */
    async injectSupplyToPool(tokenAddress, amountToken, fee = 10000) {
        this._requireInit();
        const tickSpacing = FEE_TO_TICK_SPACING[fee];
        if (!tickSpacing) throw new Error(`Unsupported fee: ${fee}`);

        const token0 = tokenAddress.toLowerCase() < this.wethAddr.toLowerCase() ? tokenAddress : this.wethAddr;
        const token1 = tokenAddress.toLowerCase() < this.wethAddr.toLowerCase() ? this.wethAddr : tokenAddress;
        
        const poolAddress = await this.factoryContract.getPool(token0, token1, fee);
        if (poolAddress === ethers.ZeroAddress) throw new Error("Pool does not exist");

        const poolContract = new ethers.Contract(poolAddress, ['function slot0() external view returns (uint160, int24, uint16, uint16, uint16, uint8, bool)'], this.provider);
        const slot0 = await poolContract.slot0();
        const currentTick = slot0[1];
        const sqPrice = BigInt(slot0[0]);

        const tokenContract = new ethers.Contract(tokenAddress, [
            "function approve(address spender, uint256 amount) external returns (bool)",
            "function decimals() external view returns (uint8)"
        ], this.signer);
        
        const decimals = await tokenContract.decimals();
        const amountTokenWei = ethers.parseUnits(amountToken.toString(), decimals);

        await tokenContract.approve(this._pmAddr, ethers.MaxUint256);

        const tickLower = nearestUsableTick(-887272, tickSpacing);
        const tickUpper = nearestUsableTick(887272, tickSpacing);

        const Q192 = 2n ** 192n;
        let amount0Desired, amount1Desired;

        if (tokenAddress === token0) {
            // Token0 is TrendToken. We need WETH (Token1).
            amount0Desired = amountTokenWei;
            amount1Desired = (amountTokenWei * sqPrice * sqPrice) / Q192;
        } else {
            // Token1 is TrendToken. We need WETH (Token0).
            amount1Desired = amountTokenWei;
            amount0Desired = (amountTokenWei * Q192) / (sqPrice * sqPrice);
        }

        const params = {
            token0: token0,
            token1: token1,
            fee: fee,
            tickLower: tickLower,
            tickUpper: tickUpper,
            amount0Desired,
            amount1Desired,
            amount0Min: 0n,
            amount1Min: 0n,
            recipient: await this.signer.getAddress(),
            deadline: Math.floor(Date.now() / 1000) + 60 * 10
        };

        const ethRequired = tokenAddress === token0 ? amount1Desired : amount0Desired;
        const msgValueWithBuffer = ethRequired + 10000n; // Buffer for geometric rounding in V3

        logger.info(`Injecting paired liquidity: ${amountToken} Tokens + ${ethers.formatEther(ethRequired)} ETH`);
        const tx = await this.pmContract.mint(params, { value: msgValueWithBuffer });
        const receipt = await this._waitWithTimeout(tx);
        return receipt.hash;
    }
}

module.exports = LiquidityManager;
