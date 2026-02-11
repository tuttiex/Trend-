const hre = require("hardhat");

async function main() {
    console.log("--- Checking Contract Existence ---");
    const address = "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24"; // The Factory address I found
    console.log("Checking address:", address);

    // Get Chain ID
    const network = await hre.ethers.provider.getNetwork();
    console.log("Connected to Chain ID:", network.chainId);

    // Get Code
    const code = await hre.ethers.provider.getCode(address);
    console.log("Code Length:", code.length);
    if (code === '0x') {
        console.log("❌ NO CODE at this address on this chain.");
    } else {
        console.log("✅ Code found! It's a contract.");
    }
}

main().catch(console.error);
