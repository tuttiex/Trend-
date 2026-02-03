require('dotenv').config();

const requiredEnvVars = [
    'BASE_SEPOLIA_RPC',
    'DATABASE_URL'
];

// Warn but don't fail for keys that might be missing in dev/test (e.g. AWS)
const optionalEnvVars = [
    'BASE_MAINNET_RPC',
    'TWITTER_API_KEY',
    'AWS_REGION'
];

// Simple validation
const missingVars = requiredEnvVars.filter(key => !process.env[key]);
if (missingVars.length > 0) {
    console.warn(`WARNING: Missing required environment variables: ${missingVars.join(', ')}`);
}

module.exports = {
    blockchain: {
        mainnetRpc: process.env.BASE_MAINNET_RPC,
        sepoliaRpc: process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org',
        chainId: parseInt(process.env.CHAIN_ID || '84532'), // Default to Sepolia
    },
    wallet: {
        // In production, this is fetched from Secret Manager, not .env
        localPrivateKey: process.env.AGENT_WALLET_PRIVATE_KEY
    },
    twitter: {
        apiKey: process.env.TWITTER_API_KEY,
        apiSecret: process.env.TWITTER_API_SECRET,
        accessToken: process.env.TWITTER_ACCESS_TOKEN,
        accessSecret: process.env.TWITTER_ACCESS_SECRET,
        bearerToken: process.env.TWITTER_BEARER_TOKEN
    },
    database: {
        url: process.env.DATABASE_URL
    },
    security: {
        awsRegion: process.env.AWS_REGION || 'us-east-1',
        secretName: process.env.SECRET_NAME
    },
    budget: {
        maxGas: parseFloat(process.env.MAX_GAS_PER_DEPLOYMENT || '0.005'),
        maxLiquidity: parseFloat(process.env.MAX_LIQUIDITY_PER_TOKEN || '0.015'),
        maxDailySpend: parseFloat(process.env.MAX_DAILY_SPEND || '0.04')
    }
};
