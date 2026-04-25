const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

const dbPath = process.env.DATABASE_URL?.replace(/^\.\//, '');
const DB_PATH = dbPath ? path.join(process.cwd(), dbPath) : '/home/ubuntu/trends-agent/database.sqlite';

console.log('Checking database:', DB_PATH);

const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);

db.all("SELECT event_type, COUNT(*) as count FROM events GROUP BY event_type", [], (err, rows) => {
    if (err) {
        console.error('Error:', err.message);
        db.close();
        return;
    }
    
    console.log('\nEvents by type:');
    rows.forEach(r => console.log('  ' + r.event_type + ': ' + r.count));
    
    // Check for TOKEN_DEPLOYED specifically
    db.all("SELECT * FROM events WHERE event_type = 'TOKEN_DEPLOYED' LIMIT 3", [], (err2, rows2) => {
        if (err2) {
            console.error('Error:', err2.message);
        } else {
            console.log('\nSample TOKEN_DEPLOYED events:');
            rows2.forEach((r, i) => {
                console.log(`\nEvent ${i + 1}:`);
                console.log('  Timestamp:', r.timestamp);
                try {
                    const details = JSON.parse(r.details);
                    console.log('  Token:', details.tokenAddress);
                    console.log('  Pool:', details.poolAddress);
                    console.log('  Topic:', details.topic);
                } catch (e) {
                    console.log('  Details (raw):', r.details);
                }
            });
        }
        db.close();
    });
});

setTimeout(() => process.exit(0), 5000);
