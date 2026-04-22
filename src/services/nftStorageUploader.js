const { NFTStorage, File } = require('nft.storage');
const logger = require('../utils/logger');

class NftStorageUploader {
    constructor() {
        const apiKey = process.env.NFT_STORAGE_API_KEY;
        if (!apiKey) {
            logger.warn('NFTStorageUploader: NFT_STORAGE_API_KEY is missing!');
            this.client = null;
            return;
        }
        this.client = new NFTStorage({ token: apiKey });
    }

    async uploadImage(buffer, symbol) {
        if (!this.client) {
            throw new Error("NFT.Storage not initialized. Check NFT_STORAGE_API_KEY in .env");
        }
        
        try {
            logger.info(`☁️ Uploading logo to NFT.Storage for ${symbol}...`);
            
            // Validate buffer
            if (!buffer || buffer.length === 0) {
                throw new Error("Invalid image buffer: empty or undefined");
            }
            logger.info(`   Buffer size: ${buffer.length} bytes`);
            
            // Create File object from buffer
            const file = new File([buffer], `logo_${symbol}.png`, { 
                type: 'image/png' 
            });
            
            // Upload to NFT.Storage (stores on IPFS + Filecoin)
            const cid = await this.client.storeBlob(file);
            
            logger.info(`✅ Image uploaded to NFT.Storage. CID: ${cid}`);
            return cid;  // Returns IPFS CID like "QmXyz..."
            
        } catch (error) {
            const errorStr = typeof error === 'object' 
                ? JSON.stringify(error, Object.getOwnPropertyNames(error)) 
                : String(error);
            logger.error(`❌ NFT.Storage Image Upload Failed: ${errorStr}`);
            throw new Error(`NFT.Storage upload failed: ${errorStr}`);
        }
    }

    async uploadMetadata(metadata) {
        if (!this.client) {
            throw new Error("NFT.Storage not initialized. Check NFT_STORAGE_API_KEY in .env");
        }
        
        try {
            logger.info("☁️ Uploading metadata JSON to NFT.Storage...");
            
            // Convert metadata to Blob
            const blob = new Blob([JSON.stringify(metadata)], { 
                type: 'application/json' 
            });
            
            // Upload to NFT.Storage
            const cid = await this.client.storeBlob(blob);
            
            logger.info(`✅ Metadata uploaded to NFT.Storage. CID: ${cid}`);
            return cid;  // Returns IPFS CID like "QmXyz..."
            
        } catch (error) {
            const errorStr = typeof error === 'object' 
                ? JSON.stringify(error, Object.getOwnPropertyNames(error)) 
                : String(error);
            logger.error(`❌ NFT.Storage Metadata Upload Failed: ${errorStr}`);
            throw new Error(`NFT.Storage upload failed: ${errorStr}`);
        }
    }
}

module.exports = new NftStorageUploader();
