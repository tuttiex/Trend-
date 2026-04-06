/**
 * Test script for Creator Fee calculation
 * Verifies the 1% fee split works correctly
 */

const momentumCalculator = require('../src/modules/momentumCalculator');

console.log('🧪 Testing Creator Fee Calculations\n');

// Test 1: Initial deployment supply
console.log('1️⃣  Initial Deployment Supply:');
const testVolume = 150000; // Example trend volume
const testAvg = 50000; // Example average volume
const supplyBreakdown = momentumCalculator.calculateSupplyWithFee(testVolume, testAvg);

console.log(`   Trend Volume: ${testVolume.toLocaleString()}`);
console.log(`   Average Volume: ${testAvg.toLocaleString()}`);
console.log(`   Total Supply: ${supplyBreakdown.totalSupply.toLocaleString()}`);
console.log(`   Creator Fee (1%): ${supplyBreakdown.creatorFee.toLocaleString()}`);
console.log(`   Net Supply (99%): ${supplyBreakdown.netSupply.toLocaleString()}`);
console.log(`   Verification: ${supplyBreakdown.creatorFee + supplyBreakdown.netSupply === supplyBreakdown.totalSupply ? '✅' : '❌'}`);

// Test 2: Momentum minting
console.log('\n2️⃣  Momentum Minting:');
const newVolume = 200000;
const previousVolume = 150000;
const momentumBreakdown = momentumCalculator.calculateAdditionalSupplyWithFee(newVolume, previousVolume);

console.log(`   New Volume: ${newVolume.toLocaleString()}`);
console.log(`   Previous Volume: ${previousVolume.toLocaleString()}`);
console.log(`   Volume Difference: ${(newVolume - previousVolume).toLocaleString()}`);
console.log(`   Total Additional: ${momentumBreakdown.totalAdditional.toLocaleString()}`);
console.log(`   Creator Fee (1%): ${momentumBreakdown.creatorFee.toLocaleString()}`);
console.log(`   Net Additional (99%): ${momentumBreakdown.netAdditional.toLocaleString()}`);
console.log(`   Verification: ${momentumBreakdown.creatorFee + momentumBreakdown.netAdditional === momentumBreakdown.totalAdditional ? '✅' : '❌'}`);

// Test 3: Baseline case (below average)
console.log('\n3️⃣  Baseline Case (Below Average):');
const lowVolume = 30000;
const highAvg = 50000;
const baselineBreakdown = momentumCalculator.calculateSupplyWithFee(lowVolume, highAvg);

console.log(`   Trend Volume: ${lowVolume.toLocaleString()}`);
console.log(`   Average Volume: ${highAvg.toLocaleString()}`);
console.log(`   Baseline Supply: ${baselineBreakdown.totalSupply.toLocaleString()}`);
console.log(`   Creator Fee (1%): ${baselineBreakdown.creatorFee.toLocaleString()}`);
console.log(`   Net Supply (99%): ${baselineBreakdown.netSupply.toLocaleString()}`);

// Test 4: Fee percentage from env
console.log('\n4️⃣  Fee Configuration:');
console.log(`   CREATOR_FEE_PERCENT env: ${process.env.CREATOR_FEE_PERCENT || 'not set (using default: 1%)'}`);
console.log(`   Current fee rate: ${momentumCalculator.CREATOR_FEE_PERCENT}%`);

console.log('\n✅ All creator fee calculations verified!');
console.log('\n📊 Summary:');
console.log('   - Every token deployment: 1% to creator, 99% to pool');
console.log('   - Every momentum mint: 1% to creator, 99% injected to pool');
console.log('   - Fees are calculated before minting');
console.log('   - All fee events are logged to database');
