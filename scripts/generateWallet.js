const { ethers } = require('ethers');
const fs = require('fs');

async function main() {
    const wallet = ethers.Wallet.createRandom();

    console.log('\n=== NEW AGENT WALLET GENERATED ===');
    console.log('Address:     ', wallet.address);
    console.log('Private Key: ', wallet.privateKey);
}
main().catch(console.error);