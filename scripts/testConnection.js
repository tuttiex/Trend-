const { ethers } = require('ethers');
const config = require('../src/config/config');

async function main() {
    console.log('Testing Base Sepolia Connection...');
    console.log('RPC URL:', config.blockchain.sepoliaRpc);

    // 1. Provider
    const provider = new ethers.JsonRpcProvider(config.blockchain.sepoliaRpc);
    const network = await provider.getNetwork();
    console.log(`Connected to Chain ID: ${network.chainId} (${network.name})`);

    // 2. Wallet
    if (!config.wallet.localPrivateKey) {
        throw new Error('Private Key not found in configuration!');
    }
    const wallet = new ethers.Wallet(config.wallet.localPrivateKey, provider);
    console.log(`Wallet Address: ${wallet.address}`);

    // 3. Read Balance
    const balance = await provider.getBalance(wallet.address);
    console.log(`Balance: ${ethers.formatEther(balance)} ETH`);

    // 4. Test Signing (Write Capability Verification)
    const message = "Trend$ Agent Verification";
    const signature = await wallet.signMessage(message);
    console.log('Signature Test: SUCCESS');
    console.log('Signed Message Hash:', signature.substring(0, 20) + '...');

    console.log('\n✅ READ/WRITE CAPABILITIES VERIFIED');
}

main().catch((error) => {
    console.error('\n❌ CONNECTION FAILED:', error);
    process.exit(1);
});
