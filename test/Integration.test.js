const { expect } = require("chai");
const { ethers } = require("hardhat");
const utils = require("./utils");

describe("BondingCurve Integration", function () {
    let token, dex;
    let owner, trader1, trader2;
    const ONE_MILLION = ethers.parseUnits("1000000", 18);

    beforeEach(async function () {
        [owner, trader1, trader2] = await ethers.getSigners();
        
        // Deploy full system
        ({ token, dex } = await utils.deployFullSystem(owner, {
            name: "Trend Token",
            symbol: "TREND",
            topic: "AI Trends",
            region: "Global",
            initialSupply: ONE_MILLION,
            swapFeeBps: 70
        }));

    });

    describe("Full Token Lifecycle", function () {
        it("Should complete deployment → seed → trade → expand → withdraw flow", async function () {
            // 1. Seed initial liquidity
            console.log("1. Seeding initial liquidity...");
            const { tokenWei, ethWei } = await utils.seedLiquidity(
                token, dex, owner, "500000", "1"
            );
            
            const poolAfterSeed = await utils.getPoolState(dex);
            expect(parseFloat(poolAfterSeed.tokenReserve)).to.equal(500000);
            expect(parseFloat(poolAfterSeed.ethReserve)).to.equal(1);
            console.log("   ✓ Liquidity seeded:", poolAfterSeed.tokenReserve, "tokens +", poolAfterSeed.ethReserve, "ETH");

            // 2. Simulate trading activity
            console.log("2. Simulating trades...");
            
            // Trader1 buys
            await dex.connect(trader1).buyTokens(0, { value: ethers.parseEther("0.1") });
            const trader1Balance = await token.balanceOf(trader1.address);
            expect(trader1Balance).to.be.gt(0);
            console.log("   ✓ Trader1 bought", ethers.formatUnits(trader1Balance, 18), "tokens");

            // Trader2 buys
            await dex.connect(trader2).buyTokens(0, { value: ethers.parseEther("0.05") });
            const trader2Balance = await token.balanceOf(trader2.address);
            expect(trader2Balance).to.be.gt(0);
            console.log("   ✓ Trader2 bought", ethers.formatUnits(trader2Balance, 18), "tokens");

            // Price should have increased
            const priceAfterBuys = await dex.getPrice();
            expect(priceAfterBuys).to.be.gt(0);
            console.log("   ✓ Price after buys:", ethers.formatUnits(priceAfterBuys, 18), "ETH/token");

            // 3. AI expands supply (mimics TokenExpansionService)
            console.log("3. AI expanding supply...");
            const mintAmount = ethers.parseUnits("10000", 18);
            const expandEth = ethers.parseEther("0.02");
            
            // agentMint to owner
            await token.agentMint(mintAmount, owner.address);
            console.log("   ✓ Minted", ethers.formatUnits(mintAmount, 18), "tokens to owner");
            
            // Approve and add liquidity
            await token.approve(await dex.getAddress(), mintAmount);
            await dex.addLiquidity(mintAmount, { value: expandEth });
            console.log("   ✓ Added liquidity with new tokens");

            // 4. More trading
            console.log("4. More trading activity...");
            
            // Trader1 sells some
            const sellAmount = trader1Balance / BigInt(4);
            await token.connect(trader1).approve(await dex.getAddress(), sellAmount);
            await dex.connect(trader1).sellTokens(sellAmount, 0);
            console.log("   ✓ Trader1 sold", ethers.formatUnits(sellAmount, 18), "tokens");

            // 5. Withdraw fees
            console.log("5. Withdrawing fees...");
            const poolBeforeWithdraw = await utils.getPoolState(dex);
            const feesBefore = parseFloat(poolBeforeWithdraw.totalFeesCollected);
            expect(feesBefore).to.be.gt(0);
            console.log("   ✓ Fees accumulated:", feesBefore, "ETH");

            const ownerBalanceBefore = await ethers.provider.getBalance(owner.address);
            await dex.withdrawFees(owner.address);
            const ownerBalanceAfter = await ethers.provider.getBalance(owner.address);
            
            expect(ownerBalanceAfter).to.be.gt(ownerBalanceBefore);
            console.log("   ✓ Fees withdrawn to owner");

            // Verify fees zeroed
            const poolAfterWithdraw = await utils.getPoolState(dex);
            expect(parseFloat(poolAfterWithdraw.totalFeesCollected)).to.equal(0);

            console.log("\n✅ Full lifecycle complete!");
        });
    });

    describe("Expansion Service Simulation", function () {
        it("Should simulate TokenExpansionService.expandSupply()", async function () {
            // Seed initial liquidity
            await utils.seedLiquidity(token, dex, owner, "400000", "0.5");

            // Record state before
            const totalMintedBefore = await token.totalAgentMinted();
            const poolBefore = await utils.getPoolState(dex);

            // Simulate: agentMint + addLiquidity
            const expandAmount = ethers.parseUnits("5000", 18);
            const ethToAdd = ethers.parseEther("0.01");

            // Step 1: Mint
            await token.agentMint(expandAmount, owner.address);
            
            // Step 2: Approve
            await token.approve(await dex.getAddress(), expandAmount);
            
            // Step 3: Add liquidity
            await dex.addLiquidity(expandAmount, { value: ethToAdd });

            // Verify state after
            const totalMintedAfter = await token.totalAgentMinted();
            const poolAfter = await utils.getPoolState(dex);

            // Checks
            expect(totalMintedAfter - totalMintedBefore).to.equal(expandAmount);
            expect(parseFloat(poolAfter.tokenReserve)).to.be.gt(parseFloat(poolBefore.tokenReserve));
            expect(parseFloat(poolAfter.ethReserve)).to.be.gt(parseFloat(poolBefore.ethReserve));
            
            console.log("Expansion successful:");
            console.log("  Minted:", ethers.formatUnits(expandAmount, 18), "tokens");
            console.log("  Added liquidity:", ethers.formatUnits(expandAmount, 18), "tokens +", ethers.formatEther(ethToAdd), "ETH");
        });

        it("Should simulate daily fee withdrawal", async function () {
            // Setup
            await utils.seedLiquidity(token, dex, owner, "300000", "0.3");
            
            // Generate some trades
            await dex.connect(trader1).buyTokens(0, { value: ethers.parseEther("0.2") });
            await dex.connect(trader2).buyTokens(0, { value: ethers.parseEther("0.1") });

            // Check fees
            const pool = await utils.getPoolState(dex);
            const feesCollected = parseFloat(pool.totalFeesCollected);
            console.log("Fees available:", feesCollected, "ETH");

            // Simulate daily check (threshold = 0.01 ETH)
            const minThreshold = 0.01;
            if (feesCollected >= minThreshold) {
                const aiWallet = owner.address; // Simulating AI wallet
                const balanceBefore = await ethers.provider.getBalance(aiWallet);
                
                await dex.withdrawFees(aiWallet);
                
                const balanceAfter = await ethers.provider.getBalance(aiWallet);
                const withdrawn = parseFloat(ethers.formatEther(balanceAfter - balanceBefore));
                
                console.log("Withdrawn:", withdrawn, "ETH to AI wallet");
                expect(withdrawn).to.be.closeTo(feesCollected, 0.001);
            } else {
                console.log("Below threshold, skipping withdrawal");
            }
        });
    });

    describe("Price Discovery & Bonding Curve", function () {
        beforeEach(async function () {
            await utils.seedLiquidity(token, dex, owner, "100000", "0.1");
        });

        it("Should demonstrate bonding curve price appreciation", async function () {
            const prices = [];
            const volumes = ["0.01", "0.02", "0.05", "0.1", "0.2"];

            for (const volume of volumes) {
                const priceBefore = await dex.getPrice();
                
                await dex.connect(trader1).buyTokens(0, { 
                    value: ethers.parseEther(volume) 
                });
                
                const priceAfter = await dex.getPrice();
                prices.push({
                    volume,
                    priceBefore: ethers.formatUnits(priceBefore, 18),
                    priceAfter: ethers.formatUnits(priceAfter, 18)
                });
            }

            console.log("Price progression:");
            prices.forEach(p => {
                console.log(`  ${p.volume} ETH buy: ${p.priceBefore} → ${p.priceAfter} ETH/token`);
            });

            // Verify price increased with each buy
            for (let i = 1; i < prices.length; i++) {
                expect(parseFloat(prices[i].priceAfter)).to.be.gt(parseFloat(prices[i-1].priceAfter));
            }
        });

        it("Should maintain trading after significant expansion", async function () {
            // Initial trade
            await dex.connect(trader1).buyTokens(0, { value: ethers.parseEther("0.05") });
            const tokensBought = await token.balanceOf(trader1.address);
            
            // Large expansion (2x the liquidity)
            const expandAmount = ethers.parseUnits("100000", 18);
            await token.agentMint(expandAmount, owner.address);
            await token.approve(await dex.getAddress(), expandAmount);
            await dex.addLiquidity(expandAmount, { value: ethers.parseEther("0.1") });

            // Should still be able to trade
            await dex.connect(trader2).buyTokens(0, { value: ethers.parseEther("0.03") });
            const tokensBought2 = await token.balanceOf(trader2.address);
            expect(tokensBought2).to.be.gt(0);

            // Trader1 can still sell
            const sellAmount = tokensBought / BigInt(2);
            await token.connect(trader1).approve(await dex.getAddress(), sellAmount);
            const ethBefore = await ethers.provider.getBalance(trader1.address);
            await dex.connect(trader1).sellTokens(sellAmount, 0);
            const ethAfter = await ethers.provider.getBalance(trader1.address);
            expect(ethAfter).to.be.gt(ethBefore);

            console.log("Trading functional after 2x expansion");
        });
    });

    describe("Edge Cases & Stress Tests", function () {
        beforeEach(async function () {
            await utils.seedLiquidity(token, dex, owner, "1000000", "1");
        });

        it("Should handle many small trades", async function () {
            const numTrades = 20;
            const ethPerTrade = ethers.parseEther("0.001");

            for (let i = 0; i < numTrades; i++) {
                await dex.connect(trader1).buyTokens(0, { value: ethPerTrade });
            }

            const pool = await utils.getPoolState(dex);
            console.log(`After ${numTrades} trades:`, pool.tokenReserve, "tokens,", pool.ethReserve, "ETH");
            console.log("Fees collected:", pool.totalFeesCollected, "ETH");

            expect(parseFloat(pool.totalFeesCollected)).to.be.gt(0);
        });

        it("Should handle rapid expansion cycles", async function () {
            for (let i = 0; i < 5; i++) {
                // Mint and add liquidity
                const amount = ethers.parseUnits("10000", 18);
                await token.agentMint(amount, owner.address);
                await token.approve(await dex.getAddress(), amount);
                await dex.addLiquidity(amount, { value: ethers.parseEther("0.01") });
                
                // Some trading
                await dex.connect(trader1).buyTokens(0, { value: ethers.parseEther("0.005") });
            }

            const pool = await utils.getPoolState(dex);
            const totalMinted = await token.totalAgentMinted();
            
            console.log("After 5 expansion cycles:");
            console.log("  Total agent minted:", ethers.formatUnits(totalMinted, 18), "tokens");
            console.log("  Pool reserves:", pool.tokenReserve, "tokens +", pool.ethReserve, "ETH");
        });

        it("Should handle ownership transfer during operation", async function () {
            // Transfer ownership to new address (simulating agent handover)
            await token.transferOwnership(trader1.address);
            await dex.transferOwnership(trader1.address);

            // New owner can operate
            await token.connect(trader1).agentMint(ethers.parseUnits("1000", 18), trader1.address);
            await token.connect(trader1).approve(await dex.getAddress(), ethers.parseUnits("1000", 18));
            await dex.connect(trader1).addLiquidity(ethers.parseUnits("1000", 18), { value: ethers.parseEther("0.01") });

            expect(await token.owner()).to.equal(trader1.address);
            expect(await dex.owner()).to.equal(trader1.address);
        });
    });

    describe("K Invariant Verification", function () {
        it("Should maintain k relationship through full cycle", async function () {
            await utils.seedLiquidity(token, dex, owner, "200000", "0.5");
            
            const kValues = [];
            
            // Record k at each step
            const recordK = async (label) => {
                const pool = await utils.getPoolState(dex);
                kValues.push({ label, k: pool.k });
            };

            await recordK("Initial");
            
            // Buy
            await dex.connect(trader1).buyTokens(0, { value: ethers.parseEther("0.1") });
            await recordK("After buy");
            
            // Another buy
            await dex.connect(trader2).buyTokens(0, { value: ethers.parseEther("0.05") });
            await recordK("After second buy");
            
            // Give trader1 tokens and sell
            await token.transfer(trader1.address, ethers.parseUnits("5000", 18));
            await token.connect(trader1).approve(await dex.getAddress(), ethers.parseUnits("5000", 18));
            await dex.connect(trader1).sellTokens(ethers.parseUnits("2000", 18), 0);
            await recordK("After sell");
            
            // Expansion
            const mintAmount = ethers.parseUnits("5000", 18);
            await token.agentMint(mintAmount, owner.address);
            await token.approve(await dex.getAddress(), mintAmount);
            await dex.addLiquidity(mintAmount, { value: ethers.parseEther("0.02") });
            await recordK("After expansion");

            console.log("K values through cycle:");
            kValues.forEach(v => console.log(`  ${v.label}: ${v.k}`));

            // K should generally not increase significantly (may decrease slightly due to rounding)
            const initialK = parseFloat(kValues[0].k);
            for (let i = 1; i < kValues.length; i++) {
                const currentK = parseFloat(kValues[i].k);
                // K should never increase beyond initial (invariant)
                expect(currentK).to.be.lte(initialK * 1.001); // Allow 0.1% tolerance
            }
        });
    });
});
