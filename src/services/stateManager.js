const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const logger = require('../utils/logger');
require('dotenv').config();

class StateManager {
    constructor() {
        const dbPath = process.env.DATABASE_URL.replace('./', '');
        this.db = new sqlite3.Database(path.join(process.cwd(), dbPath), (err) => {
            if (err) {
                logger.error(`StateManager initialization failed: ${err.message}`);
            }
        });
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
                    token_uri TEXT,
                    logo_uri TEXT,
                    pool_address TEXT,
                    metadata_cid TEXT,
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

                this.db.run(`CREATE TABLE IF NOT EXISTS trend_snapshots (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    region TEXT,
                    trend_name TEXT,
                    volume INTEGER,
                    confidence REAL,
                    snapshot_json TEXT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                )`, (err) => err ? reject(err) : resolve());
            });
            logger.info('StateManager: Connected to SQLite.');
        });
    }

    async saveDeployment(data) {
        const query = `INSERT INTO deployments (execution_id, token_address, token_name, token_symbol, token_uri, logo_uri, pool_address, tx_hash, trend_topic, region, initial_eth, initial_tokens) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        const values = [data.executionId, data.tokenAddress, data.topic + " Token", data.symbol, data.tokenURI, data.logoURI, data.poolAddress, data.txHash, data.topic, data.region, data.initialLiquidityETH, data.initialLiquidityTokens];
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

    async saveTrendSnapshot(data) {
        const query = `INSERT INTO trend_snapshots (region, trend_name, volume, confidence, snapshot_json) VALUES (?, ?, ?, ?, ?)`;
        const values = [
            data.region,
            data.topic || "Unknown",
            data.volume || 0,
            data.confidence || 0,
            JSON.stringify(data.topTrends || [])
        ];
        return new Promise((resolve, reject) => {
            this.db.run(query, values, function (err) {
                if (err) {
                    logger.error(`StateManager: Failed to save snapshot: ${err.message}`);
                    return reject(err);
                }
                logger.info(`StateManager: Saved trend snapshot for ${data.region} (${data.topic})`);
                resolve(this.lastID);
            });
        });
    }

    async hasDeployedToday(region) {
        // Normalize region for comparison (handle US vs United States)
        const isUS = region.toLowerCase() === 'us' || region.toLowerCase() === 'united states';
        const regionQuery = isUS ? "('US', 'United States')" : `('${region}')`;

        const query = `
            SELECT COUNT(*) as count 
            FROM deployments 
            WHERE (region IN ${regionQuery})
            AND timestamp >= date('now', 'start of day')
        `;

        return new Promise((resolve, reject) => {
            this.db.get(query, [], (err, row) => {
                if (err) return reject(err);
                resolve(row.count > 0);
            });
        });
    }

    async hasCompletedDeploymentToday(region) {
        const isUS = region.toLowerCase() === 'us' || region.toLowerCase() === 'united states';
        const regionQuery = isUS ? "('US', 'United States')" : `('${region}')`;

        const query = `
            SELECT COUNT(*) as count 
            FROM deployments 
            WHERE (region IN ${regionQuery})
            AND tx_hash IS NOT NULL
            AND timestamp >= date('now', 'start of day')
        `;

        return new Promise((resolve, reject) => {
            this.db.get(query, [], (err, row) => {
                if (err) return reject(err);
                resolve(row.count > 0);
            });
        });
    }

    async getDeploymentByTopic(topic, region) {
        const isUS = region.toLowerCase() === 'us' || region.toLowerCase() === 'united states';
        const regionQuery = isUS ? "('US', 'United States')" : `('${region}')`;

        const query = `
            SELECT * FROM deployments 
            WHERE (trend_topic = ?) 
            AND (region IN ${regionQuery})
            AND timestamp >= date('now', 'start of day')
            ORDER BY id DESC LIMIT 1
        `;

        return new Promise((resolve, reject) => {
            this.db.get(query, [topic], (err, row) => {
                if (err) return reject(err);
                resolve(row);
            });
        });
    }

    async updateDeployment(tokenAddress, data) {
        // Build dynamic update query
        const keys = Object.keys(data);
        const setClause = keys.map(k => `${k} = ?`).join(', ');
        const values = [...Object.values(data), tokenAddress];

        const query = `UPDATE deployments SET ${setClause} WHERE token_address = ?`;

        return new Promise((resolve, reject) => {
            this.db.run(query, values, function (err) {
                if (err) return reject(err);
                logger.info(`StateManager: Updated deployment ${tokenAddress}`);
                resolve(this.changes);
            });
        });
    }

    async updateDeploymentByTopic(topic, region, data) {
        const isUS = region.toLowerCase() === 'us' || region.toLowerCase() === 'united states';
        const regionQuery = isUS ? "('US', 'United States')" : `('${region}')`;

        // Filter valid data to update (remove null/undefined)
        const entries = Object.entries(data).filter(([k, v]) => v !== undefined);
        const setClause = entries.map(([k, v]) => `${k} = ?`).join(', ');
        const values = [...entries.map(([k, v]) => v), topic];

        const query = `
            UPDATE deployments 
            SET ${setClause} 
            WHERE trend_topic = ? 
            AND region IN ${regionQuery}
            AND timestamp >= date('now', 'start of day')
        `;

        return new Promise((resolve, reject) => {
            this.db.run(query, values, function (err) {
                if (err) return reject(err);
                logger.info(`StateManager: Updated deployment for topic "${topic}"`);
                resolve(this.changes);
            });
        });
    }

    async getAllDeployments() {
        const query = `SELECT * FROM deployments WHERE pool_address IS NOT NULL ORDER BY timestamp DESC`;
        return new Promise((resolve, reject) => {
            this.db.all(query, [], (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });
    }

    async close() {
        this.db.close();
    }
}

module.exports = StateManager;