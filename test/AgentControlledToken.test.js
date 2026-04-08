const { expect } = require("chai");
const { ethers } = require("hardhat");
const utils = require("./utils");

describe("AgentControlledToken", function () {
    let token, dex;
    let owner, addr1, addr2;
    const ONE_ETH = ethers.parseEther("1");
    const ONE_MILLION = ethers.parseUnits("1000000", 18);

    beforeEach(async function () {
        [owner, addr1, addr2] = await ethers.getSigners();
        
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
    });

    describe("Deployment", function () {
        it("Should set correct token metadata", async function () {
            expect(await token.name()).to.equal("Test Token");
            expect(await token.symbol()).to.equal("TEST");
            expect(await token.trendTopic()).to.equal("Testing");
            expect(await token.trendRegion()).to.equal("TestNet");
        });

        it("Should mint initial supply to deployer", async function () {
            const balance = await token.balanceOf(owner.address);
            expect(balance).to.equal(ONE_MILLION);
        });

        it("Should deploy DEX and link it", async function () {
            const dexAddress = await token.dexContract();
            expect(dexAddress).to.not.equal(ethers.ZeroAddress);
            expect(await dex.token()).to.equal(await token.getAddress());
        });

        it("Should reject empty name", async function () {
            const AgentControlledToken = await ethers.getContractFactory("AgentControlledToken");
            await expect(
                AgentControlledToken.deploy("", "TEST", "Topic", "Region", ONE_MILLION, 70)
            ).to.be.revertedWith("Name cannot be empty");
        });

        it("Should reject name > 50 bytes", async function () {
            const AgentControlledToken = await ethers.getContractFactory("AgentControlledToken");
            const longName = "a".repeat(51);
            await expect(
                AgentControlledToken.deploy(longName, "TEST", "Topic", "Region", ONE_MILLION, 70)
            ).to.be.revertedWith("Name exceeds 50 bytes");
        });

        it("Should reject empty symbol", async function () {
            const AgentControlledToken = await ethers.getContractFactory("AgentControlledToken");
            await expect(
                AgentControlledToken.deploy("Name", "", "Topic", "Region", ONE_MILLION, 70)
            ).to.be.revertedWith("Symbol cannot be empty");
        });

        it("Should reject symbol > 15 bytes", async function () {
            const AgentControlledToken = await ethers.getContractFactory("AgentControlledToken");
            const longSymbol = "a".repeat(16);
            await expect(
                AgentControlledToken.deploy("Name", longSymbol, "Topic", "Region", ONE_MILLION, 70)
            ).to.be.revertedWith("Symbol exceeds 15 bytes");
        });
    });

    describe("Ownership (Ownable)", function () {
        it("Should set owner correctly", async function () {
            expect(await token.owner()).to.equal(owner.address);
        });

        it("Should allow direct ownership transfer", async function () {
            await token.transferOwnership(addr1.address);
            expect(await token.owner()).to.equal(addr1.address);
        });

        it("Should prevent non-owner from transferring", async function () {
            await expect(
                token.connect(addr1).transferOwnership(addr2.address)
            ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
        });
    });

    describe("Minting", function () {
        it("Should mint to recipient via agentMint", async function () {
            const mintAmount = ethers.parseUnits("1000", 18);
            
            await expect(token.agentMint(mintAmount, addr1.address))
                .to.emit(token, "AgentMinted")
                .withArgs(addr1.address, mintAmount, mintAmount);

            expect(await token.balanceOf(addr1.address)).to.equal(mintAmount);
            expect(await token.totalAgentMinted()).to.equal(mintAmount);
        });

        it("Should reject zero amount mint", async function () {
            await expect(
                token.agentMint(0, addr1.address)
            ).to.be.revertedWith("Amount must be greater than zero");
        });

        it("Should reject zero address recipient", async function () {
            await expect(
                token.agentMint(ONE_ETH, ethers.ZeroAddress)
            ).to.be.revertedWith("Zero address recipient");
        });

        it("Should reject mint from non-owner", async function () {
            await expect(
                token.connect(addr1).agentMint(ONE_ETH, addr1.address)
            ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
        });

        it("Should accumulate totalAgentMinted", async function () {
            await token.agentMint(ethers.parseUnits("1000", 18), addr1.address);
            await token.agentMint(ethers.parseUnits("2000", 18), addr2.address);
            
            expect(await token.totalAgentMinted()).to.equal(ethers.parseUnits("3000", 18));
        });
    });

    describe("DEX Migration", function () {
        let newDexAddress;

        beforeEach(async function () {
            // Deploy a dummy DEX for migration target
            const BondingCurveDEX = await ethers.getContractFactory("BondingCurveDEX");
            const newDex = await BondingCurveDEX.deploy(await token.getAddress(), 70);
            await newDex.waitForDeployment();
            newDexAddress = await newDex.getAddress();
        });

        it("Should schedule migration with 48h timelock", async function () {
            const tx = await token.scheduleDexMigration(newDexAddress);
            
            await expect(tx)
                .to.emit(token, "DexMigrationScheduled")
                .withArgs(newDexAddress, await getTimestamp(tx) + 48 * 60 * 60);

            expect(await token.pendingDexContract()).to.equal(newDexAddress);
        });

        it("Should apply migration after timelock expires", async function () {
            await token.scheduleDexMigration(newDexAddress);
            
            // Advance 48 hours
            await utils.advanceTime(48 * 60 * 60 + 1);
            
            await expect(token.applyDexMigration())
                .to.emit(token, "DexContractUpdated")
                .withArgs(newDexAddress);

            expect(await token.dexContract()).to.equal(newDexAddress);
            expect(await token.pendingDexContract()).to.equal(ethers.ZeroAddress);
            expect(await token.dexMigrationTimestamp()).to.equal(0);
        });

        it("Should reject applying before timelock expires", async function () {
            await token.scheduleDexMigration(newDexAddress);
            
            await expect(token.applyDexMigration())
                .to.be.revertedWith("Timelock not expired");
        });

        it("Should cancel pending migration", async function () {
            await token.scheduleDexMigration(newDexAddress);
            
            await expect(token.cancelDexMigration())
                .to.emit(token, "DexMigrationCancelled")
                .withArgs(newDexAddress);

            expect(await token.pendingDexContract()).to.equal(ethers.ZeroAddress);
            expect(await token.dexMigrationTimestamp()).to.equal(0);
        });

        it("Should reject scheduling if migration already pending", async function () {
            await token.scheduleDexMigration(newDexAddress);
            
            await expect(
                token.scheduleDexMigration(newDexAddress)
            ).to.be.revertedWith("Migration already pending");
        });

        it("Should reject zero address migration", async function () {
            await expect(
                token.scheduleDexMigration(ethers.ZeroAddress)
            ).to.be.revertedWith("Invalid DEX address");
        });
    });

    describe("View Functions", function () {
        beforeEach(async function () {
            // Seed some liquidity to DEX for getDexInfo tests
            await utils.seedLiquidity(token, dex, owner, "500000", "0.1");
        });

        it("Should return correct token info", async function () {
            const info = await token.getTokenInfo();
            expect(info[0]).to.equal("Testing"); // _topic
            expect(info[1]).to.equal("TestNet"); // _region
            expect(info[2]).to.equal(owner.address); // _deployer
            expect(info[3]).to.equal(await token.dexContract()); // _dex
        });

        it("Should return correct DEX info", async function () {
            const info = await token.getDexInfo();
            expect(info[0]).to.equal(await dex.getAddress()); // dexContract
            expect(info[1]).to.be.gt(0); // tokenReserve
            expect(info[2]).to.be.gt(0); // ethReserve
        });
    });
});

// Helper function
async function getTimestamp(tx) {
    const receipt = await tx.wait();
    const block = await ethers.provider.getBlock(receipt.blockNumber);
    return block.timestamp;
}
