const hre = require("hardhat");
const logger = require("../utils/logger");
const ipfsUploader = require("./ipfsUploader");

class TokenRegistryService {
    constructor() {
        this.registryAddress = process.env.METADATA_REGISTRY_ADDRESS;
        if (!this.registryAddress) {
            logger.warn("TokenRegistryService: METADATA_REGISTRY_ADDRESS not found in .env");
        }
    }

    async registerTokenMetadata(tokenAddress, metadataCid, signer) {
        try {
            logger.info(`📜 Registering metadata CID ${metadataCid} for token ${tokenAddress}...`);

            const MetadataRegistry = await hre.ethers.getContractAt("MetadataRegistry", this.registryAddress, signer);

            const tx = await MetadataRegistry.setTokenMetadata(tokenAddress, metadataCid);
            await tx.wait();

            logger.info(`✅ Token Metadata registered on-chain. Tx: ${tx.hash}`);
            return tx.hash;
        } catch (error) {
            logger.error(`❌ Metadata Registration Failed: ${error.message}`);
            throw error;
        }
    }

    async getMetadata(tokenAddress) {
        try {
            const MetadataRegistry = await hre.ethers.getContractAt("MetadataRegistry", this.registryAddress);
            const cid = await MetadataRegistry.getTokenMetadata(tokenAddress);
            return (cid && cid.length > 0) ? cid : null;
        } catch (error) {
            // Handle BAD_DATA or 0x gracefully for tokens not in registry
            logger.warn(`TokenRegistryService: No metadata for ${tokenAddress}`);
            return null;
        }
    }
}

module.exports = new TokenRegistryService();
