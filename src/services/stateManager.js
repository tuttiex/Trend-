const { Pool } = require('pg');
const logger = require('../utils/logger');
require('dotenv').config();

class StateManager {
    constructor() {
        this.pool = new Pool({
            connectionString: process.env.DATABASE_URL,
        });
    }

    async connect() {
        try {
            await this.pool.query('SELECT NOW()');
            logger.info('StateManager: Connected to PostgreSQL.');
        } catch (error) {
            logger.error(`StateManager: Failed to connect to PostgreSQL: ${error.message}`);
            throw error;
        }
    }

    async saveDeployment(data) {
        const query = `
      INSERT INTO deployments (
        execution_id, token_address, token_name, token_symbol, 
        pool_address, tx_hash, trend_topic, region, 
        initial_eth, initial_tokens
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `;
        const values = [
            data.executionId, data.tokenAddress, data.topic + " Token", data.symbol,
            data.poolAddress, data.txHash, data.topic, data.region,
            data.initialLiquidityETH, data.initialLiquidityTokens
        ];

        try {
            const res = await this.pool.query(query, values);
            logger.info(`StateManager: Saved deployment ${data.tokenAddress} with internal ID ${res.rows[0].id}`);
            return res.rows[0].id;
        } catch (error) {
            logger.error(`StateManager: Failed to save deployment: ${error.message}`);
            throw error;
        }
    }

    async logTrend(trend) {
        const query = `
      INSERT INTO trends (topic, region, volume, confidence)
      VALUES ($1, $2, $3, $4)
    `;
        const values = [trend.topic, trend.region, trend.tweet_volume, trend.confidence];

        try {
            await this.pool.query(query, values);
        } catch (error) {
            logger.error(`StateManager: Failed to log trend: ${error.message}`);
        }
    }

    async close() {
        await this.pool.end();
    }
}

module.exports = StateManager;
