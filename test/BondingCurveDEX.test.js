const { expect } = require("chai");
const { ethers } = require("hardhat");
const utils = require("./utils");

describe("BondingCurveDEX", function () {
    let token, dex;
    let owner, trader;
    const ONE_ETH = ethers.parseEther("1");
    const ONE_MILLION = ethers.parseUnits("1000000", 18);

    beforeEach(async function () {
        [owner, trader] = await ethers.getSigners();
        
        const AgentControlledToken = await ethers.getContractFactory("AgentControlledToken");
        token = await AgentControlledToken.deploy(
            "Test Token",
            "TEST",
            "Testing",
            "TestNet",
            ONE_MILLION,
            70
        );
        await token.waitForDeployment();
        
        const dexAddress = await token.dexContract();
        const BondingCurveDEX = await ethers.getContractFactory("BondingCurveDEX");
        dex = BondingCurveDEX.attach(dexAddress);

        // Accept ownership of DEX (two-step process)
        await dex.acceptOwnership();
        
        // Seed initial liquidity
        await utils.seedLiquidity(token, dex, owner, "500000", "1");
    });

    describe("Liquidity Management", function () {
        it("Should add liquidity and update reserves", async function () {
            const tokenAmount = ethers.parseUnits("10000", 18);
            const ethAmount = ethers.parseEther("0.01");
            
            await token.approve(await dex.getAddress(), tokenAmount);
            
            await expect(dex.addLiquidity(tokenAmount, { value: ethAmount }))
                .to.emit(dex, "LiquidityAdded");

            const pool = await utils.getPoolState(dex);
            expect(parseFloat(pool.tokenReserve)).to.be.greaterThan(500000);
            expect(parseFloat(pool.ethReserve)).to.be.greaterThan(1);
        });

        it("Should remove liquidity partially", async function () {
            const removeTokens = ethers.parseUnits("1000", 18);
            const removeEth = ethers.parseEther("0.002");
            
            const balanceBefore = await ethers.provider.getBalance(owner.address);
            
            await dex.removeLiquidity(removeTokens, removeEth);
            
            const pool = await utils.getPoolState(dex);
            expect(parseFloat(pool.tokenReserve)).to.be.lessThan(500000);
            expect(parseFloat(pool.ethReserve)).to.be.lessThan(1);
        });

        it("Should prevent removing more than reserves", async function () {
            await expect(
                dex.removeLiquidity(ethers.parseUnits("1000000", 18), ethers.parseEther("10"))
            ).to.be.revertedWith("Insufficient token reserve");
        });

        it("Should prevent non-owner from adding liquidity", async function () {
            await expect(
                dex.connect(trader).addLiquidity(ethers.parseUnits("1000", 18), { value: ethers.parseEther("0.01") })
            ).to.be.revertedWithCustomError(dex, "OwnableUnauthorizedAccount");
        });
    });

    describe("Trading - Buy Tokens", function () {
        it("Should buy tokens with ETH", async function () {
            const ethIn = ethers.parseEther("0.01");
            const minTokensOut = 0;
            
            const poolBefore = await utils.getPoolState(dex);
            const balanceBefore = await token.balanceOf(trader.address);
            
            await expect(dex.connect(trader).buyTokens(minTokensOut, { value: ethIn }))
                .to.emit(dex, "TokensPurchased");

            const balanceAfter = await token.balanceOf(trader.address);
            expect(balanceAfter).to.be.gt(balanceBefore);
        });

        it("Should calculate correct fee (0.7%)", async function () {
            const ethIn = ethers.parseEther("1");
            const expectedFee = (ethIn * BigInt(70)) / BigInt(10000); // 0.007 ETH
            
            const poolBefore = await utils.getPoolState(dex);
            
            await dex.connect(trader).buyTokens(0, { value: ethIn });
            
            const poolAfter = await utils.getPoolState(dex);
            const feesCollected = parseFloat(poolAfter.totalFeesCollected) - parseFloat(poolBefore.totalFeesCollected);
            
            expect(feesCollected).to.be.closeTo(0.007, 0.0001);
        });

        it("Should respect slippage protection", async function () {
            const ethIn = ethers.parseEther("0.01");
            const minTokensOut = ethers.parseUnits("1000000", 18); // Impossibly high
            
            await expect(
                dex.connect(trader).buyTokens(minTokensOut, { value: ethIn })
            ).to.be.revertedWith("Slippage exceeded");
        });

        it("Should reject zero ETH purchase", async function () {
            await expect(
                dex.connect(trader).buyTokens(0, { value: 0 })
            ).to.be.revertedWith("Must send ETH");
        });

        it("Should prevent buying when no liquidity", async function () {
            // Drain the pool first
            await dex.removeLiquidity(
                await token.balanceOf(await dex.getAddress()),
                await ethers.provider.getBalance(await dex.getAddress()) - ethers.parseEther("0.01") // Keep some for gas
            );
            
            await expect(
                dex.connect(trader).buyTokens(0, { value: ethers.parseEther("0.01") })
            ).to.be.revertedWith("No liquidity");
        });
    });

    describe("Trading - Sell Tokens", function () {
        beforeEach(async function () {
            // Give trader some tokens to sell
            await token.transfer(trader.address, ethers.parseUnits("10000", 18));
            await token.connect(trader).approve(await dex.getAddress(), ethers.parseUnits("10000", 18));
        });

        it("Should sell tokens for ETH", async function () {
            const tokensIn = ethers.parseUnits("1000", 18);
            const minEthOut = 0;
            
            const balanceBefore = await ethers.provider.getBalance(trader.address);
            
            await expect(dex.connect(trader).sellTokens(tokensIn, minEthOut))
                .to.emit(dex, "TokensSold");

            const balanceAfter = await ethers.provider.getBalance(trader.address);
            expect(balanceAfter).to.be.gt(balanceBefore);
        });

        it("Should respect slippage protection on sell", async function () {
            const tokensIn = ethers.parseUnits("1000", 18);
            const minEthOut = ethers.parseEther("100"); // Impossibly high
            
            await expect(
                dex.connect(trader).sellTokens(tokensIn, minEthOut)
            ).to.be.revertedWith("Slippage exceeded");
        });

        it("Should reject zero token sell", async function () {
            await expect(
                dex.connect(trader).sellTokens(0, 0)
            ).to.be.revertedWith("Must sell some tokens");
        });
    });

    describe("Price Discovery", function () {
        it("Should increase price after buys", async function () {
            const priceBefore = await dex.getPrice();
            
            await dex.connect(trader).buyTokens(0, { value: ethers.parseEther("0.1") });
            
            const priceAfter = await dex.getPrice();
            expect(priceAfter).to.be.gt(priceBefore);
        });

        it("Should decrease price after sells", async function () {
            // Give trader tokens
            await token.transfer(trader.address, ethers.parseUnits("10000", 18));
            await token.connect(trader).approve(await dex.getAddress(), ethers.parseUnits("10000", 18));
            
            // First buy to increase price
            await dex.connect(trader).buyTokens(0, { value: ethers.parseEther("0.1") });
            const priceBefore = await dex.getPrice();
            
            // Sell tokens back
            await dex.connect(trader).sellTokens(ethers.parseUnits("500", 18), 0);
            
            const priceAfter = await dex.getPrice();
            expect(priceAfter).to.be.lt(priceBefore);
        });

        it("Should return consistent price from getPoolInfo", async function () {
            const directPrice = await dex.getPrice();
            const poolInfo = await dex.getPoolInfo();
            
            expect(poolInfo.price).to.equal(directPrice);
        });
    });

    describe("Fee Withdrawal", function () {
        beforeEach(async function () {
            // Generate some fees via trades
            await dex.connect(trader).buyTokens(0, { value: ethers.parseEther("1") });
        });

        it("Should withdraw fees to recipient", async function () {
            const poolBefore = await utils.getPoolState(dex);
            expect(parseFloat(poolBefore.totalFeesCollected)).to.be.gt(0);
            
            const recipient = trader.address;
            const balanceBefore = await ethers.provider.getBalance(recipient);
            
            await dex.withdrawFees(recipient);
            
            const balanceAfter = await ethers.provider.getBalance(recipient);
            expect(balanceAfter).to.be.gt(balanceBefore);
            
            const poolAfter = await utils.getPoolState(dex);
            expect(poolAfter.totalFeesCollected).to.equal("0.0");
        });

        it("Should reject zero address recipient", async function () {
            await expect(
                dex.withdrawFees(ethers.ZeroAddress)
            ).to.be.revertedWith("Zero address recipient");
        });

        it("Should reject withdrawal when no fees", async function () {
            // First withdraw all fees
            await dex.withdrawFees(owner.address);
            
            // Try again
            await expect(
                dex.withdrawFees(owner.address)
            ).to.be.revertedWith("No fees to withdraw");
        });

        it("Should reject non-owner withdrawal", async function () {
            await expect(
                dex.connect(trader).withdrawFees(trader.address)
            ).to.be.revertedWithCustomError(dex, "OwnableUnauthorizedAccount");
        });
    });

    describe("Fee Change Timelock", function () {
        it("Should schedule fee change with 48h timelock", async function () {
            const newFee = 100; // 1%
            
            await expect(dex.scheduleSwapFee(newFee))
                .to.emit(dex, "SwapFeeScheduled");

            expect(await dex.pendingFeeBps()).to.equal(newFee);
        });

        it("Should apply fee after timelock expires", async function () {
            await dex.scheduleSwapFee(100);
            
            await utils.advanceTime(48 * 60 * 60 + 1);
            
            await expect(dex.applySwapFee())
                .to.emit(dex, "SwapFeeUpdated")
                .withArgs(100);

            expect(await dex.swapFeeBps()).to.equal(100);
        });

        it("Should reject applying before timelock", async function () {
            await dex.scheduleSwapFee(100);
            
            await expect(dex.applySwapFee())
                .to.be.revertedWith("Timelock not expired");
        });

        it("Should cancel pending fee change", async function () {
            await dex.scheduleSwapFee(100);
            
            await expect(dex.cancelSwapFee())
                .to.emit(dex, "SwapFeeCancelled")
                .withArgs(100);

            expect(await dex.pendingFeeBps()).to.equal(0);
        });
    });

    describe("View Functions", function () {
        it("Should preview tokens out accurately", async function () {
            const ethIn = ethers.parseEther("0.01");
            const [tokensOut, fee] = await dex.getTokensOut(ethIn);
            
            expect(tokensOut).to.be.gt(0);
            expect(fee).to.be.gt(0);
            
            // Verify with actual purchase
            const balanceBefore = await token.balanceOf(trader.address);
            await dex.connect(trader).buyTokens(0, { value: ethIn });
            const balanceAfter = await token.balanceOf(trader.address);
            
            const actualTokens = balanceAfter - balanceBefore;
            expect(actualTokens).to.be.closeTo(tokensOut, tokensOut / BigInt(1000)); // Within 0.1%
        });

        it("Should preview ETH out accurately", async function () {
            // Give trader tokens
            await token.transfer(trader.address, ethers.parseUnits("10000", 18));
            await token.connect(trader).approve(await dex.getAddress(), ethers.parseUnits("10000", 18));
            
            const tokensIn = ethers.parseUnits("1000", 18);
            const [ethOut, fee] = await dex.getEthOut(tokensIn);
            
            expect(ethOut).to.be.gt(0);
        });

        it("Should handle zero liquidity gracefully", async function () {
            // Check empty pool queries don't revert
            const emptyDex = await (await ethers.getContractFactory("BondingCurveDEX")).deploy(
                await token.getAddress(),
                70
            );
            
            expect(await emptyDex.getPrice()).to.equal(0);
            expect((await emptyDex.getTokensOut(ethers.parseEther("1")))[0]).to.equal(0);
            expect((await emptyDex.getEthOut(ethers.parseUnits("1000", 18)))[0]).to.equal(0);
        });
    });

    describe("Math Invariants", function () {
        it("Should maintain k after trades", async function () {
            const poolBefore = await utils.getPoolState(dex);
            
            // Buy
            await dex.connect(trader).buyTokens(0, { value: ethers.parseEther("0.1") });
            
            const poolAfter = await utils.getPoolState(dex);
            const kBefore = parseFloat(poolBefore.k);
            const kAfter = parseFloat(poolAfter.k);
            
            // K should be close (may have slight decrease due to -1 rounding)
            expect(kAfter).to.be.closeTo(kBefore, kBefore * 0.001);
        });

        it("Should accumulate fees separately from reserves", async function () {
            const ethBefore = await ethers.provider.getBalance(await dex.getAddress());
            
            await dex.connect(trader).buyTokens(0, { value: ethers.parseEther("1") });
            
            const ethAfter = await ethers.provider.getBalance(await dex.getAddress());
            const pool = await utils.getPoolState(dex);
            
            // Contract balance = ethReserve + fees
            const expectedBalance = ethers.parseEther(pool.ethReserve) + ethers.parseEther(pool.totalFeesCollected);
            expect(ethAfter).to.be.closeTo(expectedBalance, ethers.parseEther("0.0001"));
        });
    });
});
