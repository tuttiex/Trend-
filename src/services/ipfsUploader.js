const pinataSDK = require('@pinata/sdk');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

class IpfsUploader {
    constructor() {
        if (!process.env.PINATA_API_KEY || !process.env.PINATA_SECRET_KEY) {
            logger.warn("IpfsUploader: Pinata keys are missing from .env. IPFS functions will be disabled.");
            this.pinata = null;
            return;
        }
        this.pinata = new pinataSDK(process.env.PINATA_API_KEY, process.env.PINATA_SECRET_KEY);
    }

    async uploadImage(buffer, symbol) {
        if (!this.pinata) throw new Error("Pinata not initialized. Check .env keys.");
        try {
            logger.info(`☁️ Uploading logo to IPFS for ${symbol}...`);
            
            // Validate buffer
            if (!buffer || buffer.length === 0) {
                throw new Error("Invalid image buffer: empty or undefined");
            }
            logger.info(`   Buffer size: ${buffer.length} bytes`);

            const stream = Readable.from(buffer);
            const options = {
                pinataMetadata: {
                    name: `logo_${symbol}.png`,
                },
                pinataOptions: {
                    cidVersion: 0
                }
            };

            const result = await this.pinata.pinFileToIPFS(stream, options);
            logger.info(`✅ Image uploaded. CID: ${result.IpfsHash}`);
            return result.IpfsHash;
        } catch (error) {
            const errorDetails = {
                message: error?.message,
                code: error?.code,
                status: error?.response?.status,
                statusText: error?.response?.statusText,
                data: error?.response?.data,
                fullError: error?.toString?.()
            };
            logger.error(`❌ IPFS Image Upload Failed: ${JSON.stringify(errorDetails)}`);
            throw new Error(`IPFS upload failed: ${error?.message || error?.toString?.() || 'Unknown error'}`);
        }
    }

    async uploadMetadata(metadata) {
        try {
            logger.info("☁️ Uploading metadata JSON to IPFS...");

            const options = {
                pinataMetadata: {
                    name: `metadata_${metadata.symbol}.json`,
                },
                pinataOptions: {
                    cidVersion: 0
                }
            };

            const result = await this.pinata.pinJSONToIPFS(metadata, options);
            logger.info(`✅ Metadata uploaded. CID: ${result.IpfsHash}`);
            return result.IpfsHash;
        } catch (error) {
            const errorDetails = {
                message: error?.message,
                code: error?.code,
                status: error?.response?.status,
                statusText: error?.response?.statusText,
                data: error?.response?.data,
                fullError: error?.toString?.()
            };
            logger.error(`❌ IPFS Metadata Upload Failed: ${JSON.stringify(errorDetails)}`);
            throw new Error(`IPFS upload failed: ${error?.message || error?.toString?.() || 'Unknown error'}`);
        }
    }
}

module.exports = new IpfsUploader();
