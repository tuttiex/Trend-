const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function initDb() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    });

    try {
        console.log('Connecting to database...');
        const schemaPath = path.join(__dirname, '../migrations/001_initial_schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');

        console.log('Executing migration...');
        await pool.query(schema);
        console.log('✅ Database initialized successfully.');
    } catch (error) {
        console.error('❌ Failed to initialize database:', error.message);
    } finally {
        await pool.end();
    }
}

initDb();
