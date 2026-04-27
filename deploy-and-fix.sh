#!/bin/bash
# Script to deploy fixes and update database

cd ~/trends-agent

# 1. Update the database with missing pool addresses
sqlite3 database.sqlite <<EOF
UPDATE deployments 
SET token_symbol = 'FRM', pool_address = '0x4Cd1A83148836485cCA78E7d529dc3F1281Ca567', tx_hash = 'recovered' 
WHERE trend_topic = 'FRAME';

UPDATE deployments 
SET token_symbol = 'CRVL', pool_address = '0x7f15Eb2b238D15133870bF2091ac263BE2f6c3c9', tx_hash = 'recovered' 
WHERE trend_topic = 'Carville';

UPDATE deployments 
SET token_symbol = 'BLRD', pool_address = '0x0154125D424ce5bBaFF49836f57dcEdD420C0D1e', tx_hash = 'recovered' 
WHERE trend_topic = 'Blord';

UPDATE deployments 
SET token_symbol = 'GDMN', pool_address = '0x1467ad96E1618EA4bF59B0421D7E1200CA625a9a', tx_hash = 'recovered' 
WHERE trend_topic = 'Good Monday';

UPDATE deployments 
SET token_symbol = 'ATK', pool_address = '0xd11d6de08d2ae936676e258E6b323edDbAAD9551', tx_hash = 'recovered' 
WHERE trend_topic = 'Atiku';
EOF

echo "✅ Database updated"

# 2. Pull latest code (if using git) or copy files
# For now, we'll create the files directly

# 3. Restart the agent
pm2 restart trends-agent

echo "✅ Agent restarted with fixes"

# 4. Trigger webhook manually for deployed tokens
if [ ! -z "$WEBHOOK_URL" ]; then
    for token in 'FRAME:FRM:0x7AF5f020fe9428673991D7F9Bf4Ae33fAa910f95:0x4Cd1A83148836485cCA78E7d529dc3F1281Ca567' \
                 'Carville:CRVL:0xC8AEBDB33E93D9853f4Ce1836802c3bCB589C0Bd:0x7f15Eb2b238D15133870bF2091ac263BE2f6c3c9' \
                 'Blord:BLRD:0xfCaE4862C645C20515373a59660dc824157dD52C:0x0154125D424ce5bBaFF49836f57dcEdD420C0D1e' \
                 'Good Monday:GDMN:0x6DdbA49034D0d35b0Cc3C1cC29A844C22362A8E2:0x1467ad96E1618EA4bF59B0421D7E1200CA625a9a' \
                 'Atiku:ATK:0xa9848B66Cc89704Ef9333B842d03220E2F569a76:0xd11d6de08d2ae936676e258E6b323edDbAAD9551'; do
        IFS=':' read -r topic symbol tokenAddr poolAddr <<< "$token"
        curl -s -X POST "$WEBHOOK_URL" \
            -H "Content-Type: application/json" \
            -H "X-Source: $WEBHOOK_SECRET" \
            -d "{\"event\":\"TOKEN_DEPLOYED\",\"timestamp\":\"$(date -Iseconds)\",\"data\":{\"topic\":\"$topic\",\"symbol\":\"$symbol\",\"region\":\"United States\",\"tokenAddress\":\"$tokenAddr\",\"poolAddress\":\"$poolAddr\",\"chainId\":84532}}"
        echo "✅ Webhook sent for $topic"
    done
else
    echo "⚠️ WEBHOOK_URL not set, skipping webhook notifications"
fi

echo "✅ All done!"
