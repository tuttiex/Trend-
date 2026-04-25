#!/usr/bin/env node
/**
 * Safe script to fix missing pool_address values in the database
 * Extracts DEX addresses from PM2 logs and updates SQLite records
 * 
 * SAFETY FEATURES:
 * 1. Creates database backup before any changes
 * 2. Dry-run mode (preview changes without applying)
 * 3. Only updates records where pool_address IS NULL
 * 4. Validates addresses are valid Ethereum addresses
 * 5. Logs all changes for audit trail
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Load .env file first
require('dotenv').config();

const sqlite3 = require('sqlite3').verbose();
const { ethers } = require('ethers');

// Configuration
const LOG_LINES_TO_SCAN = 5000; // How many log lines to scan
const BACKUP_DIR = '/home/ubuntu/trends-agent/backups';

// Resolve database path (same logic as StateManager)
let DB_PATH;
if (process.env.DATABASE_URL) {
    // Remove leading ./ and join with cwd
    const dbPath = process.env.DATABASE_URL.replace(/^\.\//, '');
    DB_PATH = path.join(process.cwd(), dbPath);
} else {
    DB_PATH = '/home/ubuntu/trends-agent/data/trends.db';
}

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');
const LOG_FILE_ARG = args.find(arg => arg.startsWith('--log-file='))?.split('=')[1];
const USE_PM2 = args.includes('--pm2');

console.log('🔧 Pool Address Fix Script');
console.log('==========================');
console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE (will update database)'}`);
console.log(`Working directory: ${process.cwd()}`);
console.log(`DATABASE_URL env: ${process.env.DATABASE_URL || '(not set)'}`);
console.log(`Resolved DB path: ${DB_PATH}`);
console.log('');

/**
 * Step 1: Create database backup
 */
function createBackup() {
    if (DRY_RUN) {
        console.log('📋 Dry run - skipping backup creation');
        return null;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `trends-backup-${timestamp}.db`);
    
    // Ensure backup directory exists
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    console.log('💾 Creating database backup...');
    
    try {
        fs.copyFileSync(DB_PATH, backupPath);
        console.log(`✅ Backup created: ${backupPath}`);
        return backupPath;
    } catch (error) {
        console.error('❌ Failed to create backup:', error.message);
        console.error('Aborting for safety!');
        process.exit(1);
    }
}

/**
 * Step 2: Extract DEX addresses from database events and logs
 */
async function extractPoolAddresses() {
    console.log('📜 Extracting DEX addresses from database events and logs...');
    
    const results = new Map(); // tokenAddress -> { dexAddress, symbol, timestamp }
    
    // First, try to get from database events table (most reliable)
    console.log('  Checking events table in database...');
    try {
        const eventsFromDb = await new Promise((resolve, reject) => {
            const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY, (err) => {
                if (err) {
                    reject(new Error(`Cannot open database: ${err.message}`));
                    return;
                }
            });
            
            // Query events table for TOKEN_DEPLOYED events with poolAddress in details JSON
            const query = `
                SELECT 
                    event_type,
                    details,
                    timestamp
                FROM events 
                WHERE event_type = 'TOKEN_DEPLOYED'
                ORDER BY timestamp DESC
            `;
            
            db.all(query, [], (err, rows) => {
                db.close();
                if (err) {
                    reject(new Error(`Query failed: ${err.message}`));
                } else {
                    resolve(rows);
                }
            });
        });
        
        console.log(`  Found ${eventsFromDb.length} TOKEN_DEPLOYED events`);
        
        for (const row of eventsFromDb) {
            try {
                const details = JSON.parse(row.details);
                if (details.tokenAddress && details.poolAddress) {
                    const tokenAddress = details.tokenAddress.toLowerCase();
                    results.set(tokenAddress, {
                        dexAddress: details.poolAddress,
                        symbol: details.topic || 'UNKNOWN',
                        source: 'database-events',
                        timestamp: row.timestamp
                    });
                }
            } catch (parseError) {
                // Skip invalid JSON
            }
        }
        
        console.log(`  ✅ Extracted ${results.size} addresses from events table`);
    } catch (error) {
        console.warn(`  Could not query events table: ${error.message}`);
    }
    
    // Also try to get from logs as backup
    try {
        let logContent = '';
        
        // Option 1: Use specified log file
        if (LOG_FILE_ARG) {
            console.log(`  Reading from specified log file: ${LOG_FILE_ARG}`);
            try {
                if (fs.existsSync(LOG_FILE_ARG)) {
                    logContent = fs.readFileSync(LOG_FILE_ARG, 'utf-8');
                    const lines = logContent.split('\n');
                    logContent = lines.slice(-LOG_LINES_TO_SCAN).join('\n');
                } else {
                    console.warn(`  Specified log file not found: ${LOG_FILE_ARG}`);
                }
            } catch (readError) {
                console.warn(`  Could not read log file: ${readError.message}`);
            }
        }
        
        // Option 2: Try PM2 logs
        if (!logContent && USE_PM2) {
            try {
                console.log('  Trying to read PM2 logs...');
                logContent = execSync(
                    `pm2 logs trends-agent --lines ${LOG_LINES_TO_SCAN} --nostream`,
                    { encoding: 'utf-8', timeout: 30000, maxBuffer: 50 * 1024 * 1024 }
                );
            } catch (e) {
                console.warn(`  PM2 logs failed: ${e.message}`);
            }
        }
        
        // Option 3: Try common log file locations
        if (!logContent) {
            const possibleLogPaths = [
                '/home/ubuntu/trends-agent/trendy-thebot-logs/trends-agent-out.log',
                '/home/ubuntu/trends-agent/logs/trends-agent-out.log',
                '/home/ubuntu/.pm2/logs/trends-agent-out.log',
                path.join(process.cwd(), 'logs', 'trends-agent-out.log'),
                path.join(process.cwd(), 'trendy-thebot-logs', 'trends-agent-out.log'),
                path.join(process.cwd(), 'trends-agent-out.log'),
            ];
            
            for (const logPath of possibleLogPaths) {
                try {
                    if (fs.existsSync(logPath)) {
                        console.log(`  Found log file: ${logPath}`);
                        logContent = fs.readFileSync(logPath, 'utf-8');
                        const lines = logContent.split('\n');
                        logContent = lines.slice(-LOG_LINES_TO_SCAN).join('\n');
                        break;
                    }
                } catch (e) {
                    // Continue to next path
                }
            }
        }
        
        if (!logContent) {
            console.warn('  No log file found. Searched locations:');
            console.warn('    - ./trendy-thebot-logs/trends-agent-out.log');
            console.warn('    - ./logs/trends-agent-out.log');
            console.warn('    - ~/.pm2/logs/trends-agent-out.log');
            console.warn('    Use --log-file=/path/to/log to specify location');
        }

        if (!logContent || logContent.trim() === '') {
            console.warn('⚠️ No log content found');
            return results;
        }

        const lines = logContent.split('\n');
        
        // Patterns to match
        // Pattern 1: "BondingCurveDEX Deployed at: 0x..."
        // Pattern 2: "DEX: 0x..." (from tweets)
        // Pattern 3: token deployment followed by DEX in context
        
        let currentToken = null;
        let currentSymbol = null;
        
        for (const line of lines) {
            // Extract token deployment info
            const tokenMatch = line.match(/Token Deployed at:\s*(0x[a-fA-F0-9]{40})/i);
            if (tokenMatch) {
                currentToken = tokenMatch[1].toLowerCase();
                // Try to extract symbol from nearby context
                const symbolMatch = line.match(/Deployed.*\$(\w+)|symbol.*:\s*(\w+)/i);
                currentSymbol = symbolMatch ? (symbolMatch[1] || symbolMatch[2]) : 'UNKNOWN';
            }
            
            // Extract DEX address
            const dexMatch = line.match(/BondingCurveDEX Deployed at:\s*(0x[a-fA-F0-9]{40})/i);
            if (dexMatch && currentToken) {
                const dexAddress = dexMatch[1];
                results.set(currentToken, {
                    dexAddress,
                    symbol: currentSymbol,
                    source: 'log'
                });
                if (VERBOSE) {
                    console.log(`  Found: ${currentSymbol} -> ${dexAddress}`);
                }
                currentToken = null; // Reset for next deployment
                currentSymbol = null;
            }
            
            // Alternative pattern from tweets: "DEX: 0x..."
            const dexAltMatch = line.match(/DEX:\s*(0x[a-fA-F0-9]{40})/i);
            if (dexAltMatch && currentToken) {
                const dexAddress = dexAltMatch[1];
                if (!results.has(currentToken)) {
                    results.set(currentToken, {
                        dexAddress,
                        symbol: currentSymbol,
                        source: 'tweet'
                    });
                }
            }
        }
        
        console.log(`✅ Extracted ${results.size} DEX addresses from logs`);
        return results;
        
    } catch (error) {
        console.error('❌ Error reading logs:', error.message);
        return results;
    }
}

/**
 * Step 3: Get database records that need fixing
 */
async function getDatabaseRecords() {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY, (err) => {
            if (err) {
                reject(new Error(`Cannot open database: ${err.message}`));
                return;
            }
        });

        const query = `
            SELECT 
                token_address, 
                token_symbol, 
                pool_address,
                trend_topic,
                region,
                timestamp
            FROM deployments 
            WHERE pool_address IS NULL 
               OR pool_address = ''
            ORDER BY timestamp DESC
        `;

        db.all(query, [], (err, rows) => {
            db.close();
            if (err) {
                reject(new Error(`Query failed: ${err.message}`));
            } else {
                resolve(rows);
            }
        });
    });
}

/**
 * Step 4: Validate Ethereum address
 */
function isValidAddress(address) {
    if (!address || typeof address !== 'string') return false;
    try {
        return ethers.isAddress(address);
    } catch {
        return false;
    }
}

/**
 * Step 5: Preview and apply fixes
 */
async function applyFixes(extractedData, dbRecords) {
    console.log('\n📊 Analysis Results');
    console.log('===================');
    
    if (dbRecords.length === 0) {
        console.log('✅ No records need fixing - all deployments have pool_address');
        return { fixes: [], unmatched: [] };
    }
    
    console.log(`Records needing fix: ${dbRecords.length}`);
    console.log(`DEX addresses found in logs: ${extractedData.size}`);
    console.log('');
    
    const fixes = [];
    const unmatched = [];
    
    for (const record of dbRecords) {
        const tokenAddress = record.token_address?.toLowerCase();
        const symbol = record.token_symbol;
        
        if (!tokenAddress) {
            unmatched.push({ ...record, reason: 'No token_address' });
            continue;
        }
        
        const extracted = extractedData.get(tokenAddress);
        
        if (extracted && isValidAddress(extracted.dexAddress)) {
            fixes.push({
                token_address: tokenAddress,
                token_symbol: symbol,
                trend_topic: record.trend_topic,
                current_pool_address: record.pool_address,
                new_pool_address: extracted.dexAddress,
                source: extracted.source
            });
        } else {
            unmatched.push({
                ...record,
                reason: extracted ? 'Invalid address format' : 'Not found in logs'
            });
        }
    }
    
    // Display preview
    console.log(`\n🔍 Fixes to apply: ${fixes.length}`);
    console.log(`❌ Cannot fix: ${unmatched.length}`);
    console.log('');
    
    if (fixes.length > 0) {
        console.log('Proposed fixes:');
        console.log('-'.repeat(80));
        for (const fix of fixes) {
            console.log(`  ${fix.token_symbol || 'UNKNOWN'}:`);
            console.log(`    Token:  ${fix.token_address}`);
            console.log(`    DEX:    ${fix.new_pool_address}`);
            console.log(`    Source: ${fix.source}`);
            console.log('');
        }
    }
    
    if (unmatched.length > 0 && VERBOSE) {
        console.log('\nUnmatched records (cannot fix):');
        console.log('-'.repeat(80));
        for (const u of unmatched.slice(0, 10)) {
            console.log(`  ${u.token_symbol || 'UNKNOWN'}: ${u.reason}`);
        }
        if (unmatched.length > 10) {
            console.log(`  ... and ${unmatched.length - 10} more`);
        }
    }
    
    // Apply fixes if not dry run
    if (!DRY_RUN && fixes.length > 0) {
        console.log('\n⚡ Applying fixes to database...');
        
        const db = await new Promise((resolve, reject) => {
            const database = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE, (err) => {
                if (err) {
                    reject(new Error(`Cannot open database for writing: ${err.message}`));
                } else {
                    resolve(database);
                }
            });
        });
        
        let successCount = 0;
        let failCount = 0;
        
        // Process updates sequentially to avoid race conditions
        for (const fix of fixes) {
            try {
                const result = await new Promise((resolve, reject) => {
                    db.run(
                        `UPDATE deployments 
                         SET pool_address = ? 
                         WHERE token_address = ? 
                           AND (pool_address IS NULL OR pool_address = '')`,
                        [fix.new_pool_address, fix.token_address],
                        function(err) {
                            if (err) {
                                reject(err);
                            } else {
                                resolve({ changes: this.changes });
                            }
                        }
                    );
                });
                
                if (result.changes > 0) {
                    console.log(`  ✅ Updated ${fix.token_symbol}: ${fix.new_pool_address}`);
                    successCount++;
                } else {
                    console.log(`  ⚠️ No changes for ${fix.token_symbol} (may already be fixed)`);
                }
            } catch (error) {
                console.error(`  ❌ Failed to update ${fix.token_symbol}: ${error.message}`);
                failCount++;
            }
        }
        
        // Close database
        await new Promise((resolve, reject) => {
            db.close((err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        console.log('\n📈 Results:');
        console.log(`  Successful updates: ${successCount}`);
        console.log(`  Failed updates: ${failCount}`);
    } else if (DRY_RUN && fixes.length > 0) {
        console.log('\n📋 DRY RUN - No changes made');
        console.log('Run without --dry-run to apply these fixes');
    }
    
    return { fixes, unmatched };
}

/**
 * Main execution
 */
async function main() {
    try {
        // Validate database exists
        if (!fs.existsSync(DB_PATH)) {
            console.error(`❌ Database not found: ${DB_PATH}`);
            process.exit(1);
        }
        
        // Step 1: Backup
        const backupPath = createBackup();
        
        // Step 2: Extract pool addresses from events table and logs
        const extractedData = await extractPoolAddresses();
        
        if (extractedData.size === 0) {
            console.warn('\n⚠️ No DEX addresses found in database events or logs');
            console.log('Possible reasons:');
            console.log('  - Logs have rotated (check pm2 log rotation)');
            console.log('  - Agent not running or no deployments yet');
            console.log('  - Log format has changed');
        }
        
        // Step 3: Get database records
        const dbRecords = await getDatabaseRecords();
        
        // Step 4: Apply fixes
        const { fixes, unmatched } = await applyFixes(extractedData, dbRecords);
        
        // Summary
        console.log('\n🏁 Summary');
        console.log('=========');
        console.log(`Total records checked: ${dbRecords.length}`);
        console.log(`Can be fixed: ${fixes.length}`);
        console.log(`Cannot be fixed: ${unmatched.length}`);
        
        if (backupPath) {
            console.log(`\n💾 Backup saved to: ${backupPath}`);
            console.log('To restore: cp ' + backupPath + ' ' + DB_PATH);
        }
        
        console.log('\n✨ Done!');
        
    } catch (error) {
        console.error('\n❌ Fatal error:', error.message);
        if (VERBOSE) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

// Run main
main();
