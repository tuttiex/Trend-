const { ethers } = require("ethers");
const fs = require("fs");

// Path to NPM artifact
const npmPath = "node_modules/@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json";

try {
    const artifact = JSON.parse(fs.readFileSync(npmPath, "utf8"));
    console.log("Checking errors in ABI...");

    // Calculate selectors for all errors
    // Since "LOK" is not a valid hex selector, maybe it's the text from a require/revert with reason string?
    // "execution reverted: LOK" usually means require(condition, "LOK");

    // But let's check ABI errors just in case
    artifact.abi.forEach(item => {
        if (item.type === 'error') {
            console.log(`Error: ${item.name}`);
        }
    });

} catch (e) {
    console.error("Failed to read artifact:", e.message);
}
