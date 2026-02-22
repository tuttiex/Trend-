const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

const dbPath = process.env.DATABASE_URL.replace('./', '');
const db = new sqlite3.Database(path.join(process.cwd(), dbPath));

db.serialize(() => {
    db.run("ALTER TABLE deployments ADD COLUMN metadata_cid TEXT;", (err) => {
        if (err) {
            if (err.message.includes('duplicate column name')) {
                console.log('Column already exists.');
            } else {
                console.error('Error adding column:', err.message);
            }
        } else {
            console.log('✅ Successfully added metadata_cid column to deployments table.');
        }
    });

    // Also fix the CREATE TABLE statement in stateManager.js just in case
    console.log('Please ensure stateManager.js CREATE TABLE includes metadata_cid');
});

db.close();
