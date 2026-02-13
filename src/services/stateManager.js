const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const logger = require('../utils/logger');
require('dotenv').config();

class StateManager {
    constructor() {
        const dbPath = process.env.DATABASE_URL.replace('./', '');
        this.db = new sqlite3.Database(path.join(process.cwd(), dbPath));
    }

    async connect() {
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                this.db.run(`CREATE TABLE IF NOT EXISTS deployments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    execution_id TEXT,
                    token_address TEXT,
                    token_name TEXT,
                    token_symbol TEXT,
                    pool_address TEXT,
                    tx_hash TEXT,
                    trend_topic TEXT,
                    region TEXT,
                    initial_eth TEXT,
                    initial_tokens TEXT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                )`, (err) => err ? reject(err) : resolve());

                this.db.run(`CREATE TABLE IF NOT EXISTS trends (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    topic TEXT,
                    region TEXT,
                    volume TEXT,
                    confidence TEXT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                )`);
            });
            logger.info('StateManager: Connected to SQLite.');
        });
    }

    async saveDeployment(data) {
        const query = `INSERT INTO deployments (execution_id, token_address, token_name, token_symbol, pool_address, tx_hash, trend_topic, region, initial_eth, initial_tokens) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        const values = [data.executionId, data.tokenAddress, data.topic + " Token", data.symbol, data.poolAddress, data.txHash, data.topic, data.region, data.initialLiquidityETH, data.initialLiquidityTokens];
        return new Promise((resolve, reject) => {
            this.db.run(query, values, function (err) {
                if (err) return reject(err);
                logger.info(`StateManager: Saved deployment ${data.tokenAddress}`);
                resolve(this.lastID);
            });
        });
    }

    async logTrend(trend) {
        const query = `INSERT INTO trends (topic, region, volume, confidence) VALUES (?, ?, ?, ?)`;
        const values = [trend.topic, trend.region, trend.tweet_volume, trend.confidence];
        this.db.run(query, values);
    }

    async close() {
        this.db.close();
    }
}

module.exports = StateManager;