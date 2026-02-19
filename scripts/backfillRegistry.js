const hre = require("hardhat");
const tokenRegistryService = require('../src/services/tokenRegistryService');
const logger = require('../src/utils/logger');

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    console.log("Backfilling SIMI Token Metadata...");

    // CID for the SIMI token logo we generated earlier
    const simiCid = "QmX942ZxF67kkJV9d6mL5YccWjUgSgob7gYMK4wzPcJyVx";
    const simiAddress = "0xC9223CbF287EB6Baf7aCF7e9ABC20A14800f6c04";

    try {
        await tokenRegistryService.registerTokenMetadata(simiAddress, simiCid, deployer);
        console.log("✅ SIMI Token backfilled successfully.");
    } catch (error) {
        console.error("❌ Backfill failed:", error.message);
    }
}

main().catch(console.error);
