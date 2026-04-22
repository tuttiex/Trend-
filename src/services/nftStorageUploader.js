const axios = require('axios');
const FormData = require('form-data');
const logger = require('../utils/logger');

class NftStorageUploader {
    constructor() {
        // New NFT.Storage API uses Bearer token (full key like "f80c66eb.91e3229...")
        this.apiKey = process.env.NFT_STORAGE_API_KEY;
        
        if (!this.apiKey) {
            logger.warn('NFTStorageUploader: NFT_STORAGE_API_KEY is missing!');
            this.initialized = false;
            return;
        }
        this.initialized = true;
    }

    async uploadImage(buffer, symbol) {
        if (!this.initialized) {
            throw new Error("NFT.Storage not initialized. Check NFT_STORAGE_API_KEY in .env");
        }
        
        try {
            logger.info(`☁️ Uploading logo to NFT.Storage for ${symbol}...`);
            
            // Validate buffer
            if (!buffer || buffer.length === 0) {
                throw new Error("Invalid image buffer: empty or undefined");
            }
            logger.info(`   Buffer size: ${buffer.length} bytes`);
            
            // Create multipart form data
            const formData = new FormData();
            formData.append('file', buffer, {
                filename: `logo_${symbol}.png`,
                contentType: 'image/png'
            });
            
            // Upload to NFT.Storage REST API
            const response = await axios.post('https://api.nft.storage/upload', formData, {
                headers: {
                    ...formData.getHeaders(),
                    'Authorization': `Bearer ${this.apiKey}`
                },
                maxBodyLength: Infinity,
                maxContentLength: Infinity
            });
            
            const cid = response.data.value.cid;
            logger.info(`✅ Image uploaded to NFT.Storage. CID: ${cid}`);
            return cid;  // Returns IPFS CID like "QmXyz..."
            
        } catch (error) {
            const errorStr = error.response?.data?.error?.message || 
                            (typeof error === 'object' 
                                ? JSON.stringify(error, Object.getOwnPropertyNames(error)) 
                                : String(error));
            logger.error(`❌ NFT.Storage Image Upload Failed: ${errorStr}`);
            throw new Error(`NFT.Storage upload failed: ${errorStr}`);
        }
    }

    async uploadMetadata(metadata) {
        if (!this.initialized) {
            throw new Error("NFT.Storage not initialized. Check NFT_STORAGE_API_KEY in .env");
        }
        
        try {
            logger.info("☁️ Uploading metadata JSON to NFT.Storage...");
            
            // Convert metadata to buffer
            const buffer = Buffer.from(JSON.stringify(metadata));
            
            // Create multipart form data
            const formData = new FormData();
            formData.append('file', buffer, {
                filename: `${metadata.symbol}_metadata.json`,
                contentType: 'application/json'
            });
            
            // Upload to NFT.Storage REST API
            const response = await axios.post('https://api.nft.storage/upload', formData, {
                headers: {
                    ...formData.getHeaders(),
                    'Authorization': `Bearer ${this.apiKey}`
                },
                maxBodyLength: Infinity,
                maxContentLength: Infinity
            });
            
            const cid = response.data.value.cid;
            logger.info(`✅ Metadata uploaded to NFT.Storage. CID: ${cid}`);
            return cid;  // Returns IPFS CID like "QmXyz..."
            
        } catch (error) {
            const errorStr = error.response?.data?.error?.message || 
                            (typeof error === 'object' 
                                ? JSON.stringify(error, Object.getOwnPropertyNames(error)) 
                                : String(error));
            logger.error(`❌ NFT.Storage Metadata Upload Failed: ${errorStr}`);
            throw new Error(`NFT.Storage upload failed: ${errorStr}`);
        }
    }
}

module.exports = new NftStorageUploader();
