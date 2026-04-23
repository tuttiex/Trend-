const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const logger = require('../utils/logger');

class R2Uploader {
    constructor() {
        const accountId = process.env.R2_ACCOUNT_ID;
        const accessKeyId = process.env.R2_ACCESS_KEY_ID;
        const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
        const bucketName = process.env.R2_BUCKET_NAME;
        
        if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
            logger.warn('R2Uploader: Missing R2 credentials in .env');
            this.initialized = false;
            return;
        }
        
        // R2 uses S3-compatible API
        this.client = new S3Client({
            region: 'auto',
            endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
            credentials: {
                accessKeyId,
                secretAccessKey
            }
        });
        
        this.bucketName = bucketName;
        this.publicUrl = process.env.R2_PUBLIC_URL || `https://${accountId}.r2.cloudflarestorage.com/${bucketName}`;
        this.initialized = true;
    }

    async uploadImage(buffer, symbol) {
        if (!this.initialized) {
            throw new Error("R2 not initialized. Check R2 credentials in .env");
        }
        
        try {
            logger.info(`☁️ Uploading logo to R2 for ${symbol}...`);
            
            // Validate buffer
            if (!buffer || buffer.length === 0) {
                throw new Error("Invalid image buffer: empty or undefined");
            }
            logger.info(`   Buffer size: ${buffer.length} bytes`);
            
            const key = `logos/${symbol}_${Date.now()}.png`;
            
            const command = new PutObjectCommand({
                Bucket: this.bucketName,
                Key: key,
                Body: buffer,
                ContentType: 'image/png',
                Metadata: {
                    symbol: symbol,
                    timestamp: Date.now().toString()
                }
            });
            
            await this.client.send(command);
            
            const publicUrl = `${this.publicUrl}/${key}`;
            logger.info(`✅ Image uploaded to R2. URL: ${publicUrl}`);
            return publicUrl;
            
        } catch (error) {
            const errorStr = typeof error === 'object' 
                ? JSON.stringify(error, Object.getOwnPropertyNames(error)) 
                : String(error);
            logger.error(`❌ R2 Image Upload Failed: ${errorStr}`);
            throw new Error(`R2 upload failed: ${errorStr}`);
        }
    }

    async uploadMetadata(metadata) {
        if (!this.initialized) {
            throw new Error("R2 not initialized. Check R2 credentials in .env");
        }
        
        try {
            logger.info("☁️ Uploading metadata JSON to R2...");
            
            const key = `metadata/${metadata.symbol}_${Date.now()}.json`;
            const jsonBuffer = Buffer.from(JSON.stringify(metadata, null, 2));
            
            const command = new PutObjectCommand({
                Bucket: this.bucketName,
                Key: key,
                Body: jsonBuffer,
                ContentType: 'application/json'
            });
            
            await this.client.send(command);
            
            const publicUrl = `${this.publicUrl}/${key}`;
            logger.info(`✅ Metadata uploaded to R2. URL: ${publicUrl}`);
            return publicUrl;
            
        } catch (error) {
            const errorStr = typeof error === 'object' 
                ? JSON.stringify(error, Object.getOwnPropertyNames(error)) 
                : String(error);
            logger.error(`❌ R2 Metadata Upload Failed: ${errorStr}`);
            throw new Error(`R2 upload failed: ${errorStr}`);
        }
    }
}

module.exports = new R2Uploader();
