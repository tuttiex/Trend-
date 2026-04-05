/**
 * AWS Deployment Verification Script
 * Run this on your AWS server to verify all changes are in place
 */

require('dotenv').config();

console.log('🔍 AWS Deployment Verification\n');

// Check environment variables
const checks = [
    { name: 'GROQ_API_KEY', required: true },
    { name: 'SILICONFLOW_API_KEY', required: true },
    { name: 'GROQ_MODEL', required: false, default: 'llama-3.3-70b-versatile' },
    { name: 'DATABASE_URL', required: true },
    { name: 'AGENT_WALLET_PRIVATE_KEY', required: true },
    { name: 'BASE_MAINNET_RPC', required: true }
];

let allGood = true;

console.log('1️⃣  Environment Variables:');
for (const check of checks) {
    const value = process.env[check.name];
    if (check.required && !value) {
        console.log(`   ❌ ${check.name}: MISSING (required)`);
        allGood = false;
    } else if (!check.required && !value) {
        console.log(`   ⚠️  ${check.name}: not set (will use default: ${check.default})`);
    } else {
        const masked = value.length > 10 ? value.substring(0, 8) + '...' : '***';
        console.log(`   ✅ ${check.name}: ${masked}`);
    }
}

console.log('\n2️⃣  Testing Groq API...');
async function testGroq() {
    try {
        const GroqClient = require('../src/services/groqClient');
        const groq = new GroqClient();
        
        const response = await groq.quickPrompt('Say "Groq is ready"', null, {
            model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
            maxTokens: 20
        });
        
        if (response.toLowerCase().includes('ready')) {
            console.log('   ✅ Groq API working');
            return true;
        } else {
            console.log('   ⚠️  Groq API responded but unexpected:', response);
            return true; // Still works
        }
    } catch (error) {
        console.log(`   ❌ Groq API error: ${error.message}`);
        return false;
    }
}

console.log('\n3️⃣  Testing File Structure...');
const fs = require('fs');
const path = require('path');

const requiredFiles = [
    'src/services/groqClient.js',
    'src/modules/planner.js',
    'src/utils/contentModerator.js',
    'src/services/imageGenerator.js'
];

for (const file of requiredFiles) {
    if (fs.existsSync(path.join(process.cwd(), file))) {
        console.log(`   ✅ ${file}`);
    } else {
        console.log(`   ❌ ${file}: MISSING`);
        allGood = false;
    }
}

console.log('\n4️⃣  Checking Database...');
const sqlite3 = require('sqlite3').verbose();
const dbPath = process.env.DATABASE_URL?.replace('./', '');

if (!dbPath) {
    console.log('   ❌ DATABASE_URL not set');
    allGood = false;
} else {
    const fullPath = path.join(process.cwd(), dbPath);
    if (fs.existsSync(fullPath)) {
        console.log(`   ✅ Database file exists: ${dbPath}`);
        
        // Check if new tables exist
        const db = new sqlite3.Database(fullPath);
        db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='events'", (err, row) => {
            if (row) {
                console.log('   ✅ events table exists');
            } else {
                console.log('   ⚠️  events table will be created on first run');
            }
        });
        db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='token_metrics'", (err, row) => {
            if (row) {
                console.log('   ✅ token_metrics table exists');
            } else {
                console.log('   ⚠️  token_metrics table will be created on first run');
            }
            db.close();
        });
    } else {
        console.log(`   ⚠️  Database will be created on first run: ${dbPath}`);
    }
}

// Run async tests
(async () => {
    const groqOk = await testGroq();
    
    console.log('\n📋 Summary:');
    if (allGood && groqOk) {
        console.log('   ✅ All checks passed! Ready for deployment.');
        console.log('\n🚀 To start the agent:');
        console.log('   npm start');
        console.log('   or');
        console.log('   node src/index.js');
    } else {
        console.log('   ❌ Some checks failed. Fix issues before deploying.');
        process.exit(1);
    }
})();
