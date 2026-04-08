// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title BondingCurveDEX
 * @notice A permissioned AMM where only the agent can provide liquidity.
 *         Uses constant product formula (x * y = k) for price discovery.
 *         All trading fees go to the agent/owner.
 */
contract BondingCurveDEX is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // Token being traded
    IERC20 public immutable token;
    
    // Reserves
    uint256 public tokenReserve;
    uint256 public ethReserve;
    
    // Constant product (k = x * y) - using 256-bit to avoid overflow
    uint256 public k;
    
    /**
     * @notice Safely multiply two numbers for k calculation (overflow protection)
     * @param x First number
     * @param y Second number  
     * @return result The product, reverts on overflow
     */
    function _safeMul(uint256 x, uint256 y) internal pure returns (uint256) {
        // Check for overflow - reverts if reserves are unreasonably large
        if (x == 0 || y == 0) return 0;
        if (x > type(uint256).max / y) {
            revert("k calculation overflow");
        }
        return x * y;
    }
    
    // Swap fee in basis points (default 0.7% = 70)
    uint256 public swapFeeBps;
    
    // Total fees collected
    uint256 public totalFeesCollected;
    
    // Fee change timelock (C-1) - 48 hours
    uint256 public pendingFeeBps;
    uint256 public feeChangeTimestamp;
    uint256 public constant FEE_CHANGE_DELAY = 48 hours;
    
    // Events
    event LiquidityAdded(uint256 tokenAmount, uint256 ethAmount, uint256 newK);
    event LiquidityRemoved(uint256 tokenAmount, uint256 ethAmount);
    event TokensPurchased(address indexed buyer, uint256 ethIn, uint256 tokensOut, uint256 fee);
    event TokensSold(address indexed seller, uint256 tokensIn, uint256 ethOut, uint256 fee);
    event SwapFeeScheduled(uint256 pendingFeeBps, uint256 effectiveTimestamp);
    event SwapFeeUpdated(uint256 newFeeBps);
    event SwapFeeCancelled(uint256 cancelledFeeBps);
    event FeesWithdrawn(uint256 amount);
    event EthInjected(uint256 amount);

    /**
     * @notice Initialize the DEX with the token address
     * @param _token Address of the TrendToken
     * @param _swapFeeBps Swap fee in basis points (e.g., 200 = 2%)
     */
    constructor(address _token, uint256 _swapFeeBps) Ownable(msg.sender) {
        require(_token != address(0), "Invalid token address");
        require(_swapFeeBps <= 1000, "Fee cannot exceed 10%"); // Max 10%
        
        token = IERC20(_token);
        swapFeeBps = _swapFeeBps;
    }

    /**
     * @notice Add liquidity to the pool. Only callable by owner (agent).
     * @param tokenAmount Amount of tokens to add
     */
    function addLiquidity(uint256 tokenAmount) external payable onlyOwner nonReentrant {
        require(tokenAmount > 0, "Token amount must be greater than 0");
        require(msg.value > 0, "ETH amount must be greater than 0");
        
        // Transfer tokens from owner to contract
        token.safeTransferFrom(msg.sender, address(this), tokenAmount);
        
        // Update reserves
        tokenReserve += tokenAmount;
        ethReserve += msg.value;
        
        // Update constant product
        k = _safeMul(tokenReserve, ethReserve);
        
        emit LiquidityAdded(tokenAmount, msg.value, k);
    }

    /**
     * @notice Remove liquidity from the pool. Only callable by owner (agent).
     * @param tokenAmount Amount of tokens to remove
     * @param ethAmount Amount of ETH to remove
     */
    function removeLiquidity(uint256 tokenAmount, uint256 ethAmount) external onlyOwner nonReentrant {
        require(tokenAmount <= tokenReserve, "Insufficient token reserve");
        // FIX M-1: Prevent underflow - ensure fees don't exceed balance
        require(totalFeesCollected <= address(this).balance, "Fee accounting error");
        require(ethAmount <= ethReserve, "Insufficient ETH reserve");
        require(ethAmount <= address(this).balance - totalFeesCollected, "Would withdraw fee ETH");
        
        // Update reserves
        tokenReserve -= tokenAmount;
        ethReserve -= ethAmount;
        
        // Update constant product
        if (tokenReserve > 0 && ethReserve > 0) {
            k = _safeMul(tokenReserve, ethReserve);
        } else {
            k = 0;
            // Note: Owner should call withdrawFees before fully draining pool
        }
        
        // Transfer tokens and ETH to owner
        token.safeTransfer(msg.sender, tokenAmount);
        (bool success, ) = msg.sender.call{value: ethAmount}("");
        require(success, "ETH transfer failed");
        
        emit LiquidityRemoved(tokenAmount, ethAmount);
    }

    /**
     * @notice Buy tokens with ETH
     * @param minTokensOut Minimum tokens to receive (slippage protection)
     * @return tokensOut Amount of tokens purchased
     */
    function buyTokens(uint256 minTokensOut) external payable nonReentrant returns (uint256 tokensOut) {
        require(msg.value > 0, "Must send ETH");
        require(tokenReserve > 0 && ethReserve > 0, "No liquidity");
        
        // Calculate fee
        uint256 fee = (msg.value * swapFeeBps) / 10000;
        
        // Model B: Only add post-fee ETH to reserves (fees stay separate)
        uint256 ethInAfterFee = msg.value - fee;
        uint256 newEthReserve = ethReserve + ethInAfterFee;
        uint256 newTokenReserve = k / newEthReserve;
        // FIX L-2: Off-by-one fix - ensure tokensOut > 0
        require(tokenReserve > newTokenReserve + 1, "Swap too small");
        // FIX H-1: -1 favors pool, prevents k decay from rounding
        tokensOut = tokenReserve - newTokenReserve - 1;
        
        // FIX M-4: All validation before state mutation
        require(tokensOut >= minTokensOut, "Slippage exceeded");
        
        // Now safe to mutate state
        totalFeesCollected += fee;
        
        // Update reserves - only post-fee amounts affect k
        ethReserve = newEthReserve;
        tokenReserve = newTokenReserve;
        k = _safeMul(tokenReserve, ethReserve);
        
        // Transfer tokens to buyer
        token.safeTransfer(msg.sender, tokensOut);
        
        emit TokensPurchased(msg.sender, msg.value, tokensOut, fee);
        
        return tokensOut;
    }

    /**
     * @notice Sell tokens for ETH
     * @param tokenAmount Amount of tokens to sell
     * @param minEthOut Minimum ETH to receive (slippage protection)
     * @return ethOut Amount of ETH received
     */
    function sellTokens(uint256 tokenAmount, uint256 minEthOut) external nonReentrant returns (uint256 ethOut) {
        require(tokenAmount > 0, "Must sell some tokens");
        require(tokenReserve > 0 && ethReserve > 0, "No liquidity");
        
        // FIX M-1: Compute and validate BEFORE any external calls
        uint256 newTokenReserve = tokenReserve + tokenAmount;
        uint256 newEthReserve = k / newTokenReserve;
        // FIX L-4: Off-by-one fix - ensure grossEthOut > 0
        require(ethReserve > newEthReserve + 1, "Swap too small");
        uint256 grossEthOut = ethReserve - newEthReserve - 1;
        
        // Calculate and deduct fee
        uint256 fee = (grossEthOut * swapFeeBps) / 10000;
        ethOut = grossEthOut - fee;
        
        // FIX M-4 & M-2: All validation before state mutation and ETH transfer
        require(ethOut >= minEthOut, "Slippage exceeded");
        // FIX M-3: Add underflow guard before subtraction
        require(address(this).balance >= totalFeesCollected, "Fee accounting error");
        require(ethOut <= address(this).balance - totalFeesCollected, "Insufficient liquid ETH");
        
        // THEN external call: take tokens in (after all validation)
        token.safeTransferFrom(msg.sender, address(this), tokenAmount);
        
        // Now safe to mutate state
        totalFeesCollected += fee;
        
        // Model B: Only update reserves with net amounts (fees stay separate)
        ethReserve = newEthReserve;
        tokenReserve = newTokenReserve;
        k = _safeMul(tokenReserve, ethReserve);
        
        // FIX M-2: Final balance check just before ETH transfer
        require(address(this).balance >= ethOut, "Insufficient contract balance");
        
        // Transfer ETH to seller
        (bool success, ) = msg.sender.call{value: ethOut}("");
        require(success, "ETH transfer failed");
        
        emit TokensSold(msg.sender, tokenAmount, ethOut, fee);
        
        return ethOut;
    }

    /**
     * @notice Get current token price in ETH (1 token = ? ETH)
     * @return price Price in wei per token
     */
    function getPrice() public view returns (uint256) {
        // FIX L-1: Clear zero ambiguity
        if (tokenReserve == 0 || ethReserve == 0) return 0;
        return (ethReserve * 1e18) / tokenReserve;
    }

    /**
     * @notice Calculate how many tokens you get for a specific ETH amount
     * @param ethAmount Amount of ETH to spend
     * @return tokensOut Expected token amount
     * @return fee Fee amount
     */
    function getTokensOut(uint256 ethAmount) external view returns (uint256 tokensOut, uint256 fee) {
        if (tokenReserve == 0 || ethReserve == 0) return (0, 0);
        
        // FIX L-3: Guard against overflow
        if (ethAmount > type(uint256).max - ethReserve) return (0, 0);
        fee = (ethAmount * swapFeeBps) / 10000;
        uint256 ethInAfterFee = ethAmount - fee;
        
        uint256 newEthReserve = ethReserve + ethInAfterFee;
        uint256 newTokenReserve = k / newEthReserve;
        // FIX L-2: Match buyTokens guard exactly
        if (newTokenReserve + 1 >= tokenReserve) return (0, fee);
        // FIX H-1/L-2: Match buyTokens logic with dust protection
        tokensOut = tokenReserve - newTokenReserve - 1;
        
        return (tokensOut, fee);
    }

    /**
     * @notice Calculate how much ETH you get for a specific token amount
     * @param tokenAmount Amount of tokens to sell
     * @return ethOut Expected ETH amount
     * @return fee Fee amount
     */
    function getEthOut(uint256 tokenAmount) external view returns (uint256 ethOut, uint256 fee) {
        if (tokenReserve == 0 || ethReserve == 0) return (0, 0);
        
        // FIX L-3: Guard against overflow
        if (tokenAmount > type(uint256).max - tokenReserve) return (0, 0);
        uint256 newTokenReserve = tokenReserve + tokenAmount;
        uint256 newEthReserve = k / newTokenReserve;
        // FIX L-1: Tighten guard to match sellTokens semantics
        if (newEthReserve + 1 >= ethReserve) return (0, 0);
        // FIX H-1/L-2: Match sellTokens logic with dust protection
        uint256 grossEthOut = ethReserve - newEthReserve - 1;
        
        fee = (grossEthOut * swapFeeBps) / 10000;
        ethOut = grossEthOut - fee;
        
        return (ethOut, fee);
    }

    /**
     * @notice Schedule a fee change with timelock (H-2/M-2)
     * @param newFeeBps New fee in basis points
     */
    function scheduleSwapFee(uint256 newFeeBps) external onlyOwner {
        require(newFeeBps <= 1000, "Fee cannot exceed 10%");
        require(feeChangeTimestamp == 0, "Fee change already pending");
        
        pendingFeeBps = newFeeBps;
        feeChangeTimestamp = block.timestamp + FEE_CHANGE_DELAY;
        emit SwapFeeScheduled(newFeeBps, feeChangeTimestamp);
    }

    /**
     * @notice Apply the scheduled fee change after timelock expires (C-1)
     */
    function applySwapFee() external onlyOwner {
        require(feeChangeTimestamp != 0, "No pending fee change");
        require(block.timestamp >= feeChangeTimestamp, "Timelock not expired");
        
        swapFeeBps = pendingFeeBps;
        feeChangeTimestamp = 0;
        pendingFeeBps = 0;
        
        emit SwapFeeUpdated(swapFeeBps);
    }

    /**
     * @notice Cancel a pending fee change (C-1)
     */
    function cancelSwapFee() external onlyOwner {
        require(feeChangeTimestamp != 0, "No pending fee change");
        
        uint256 cancelled = pendingFeeBps;
        feeChangeTimestamp = 0;
        pendingFeeBps = 0;
        
        emit SwapFeeCancelled(cancelled);
    }

    /**
     * @notice Withdraw accumulated fees to a recipient
     * @param recipient Address to receive the fees
     */
    function withdrawFees(address payable recipient) external onlyOwner nonReentrant {
        require(recipient != address(0), "Zero address recipient");
        
        uint256 amount = totalFeesCollected;
        require(amount > 0, "No fees to withdraw");
        // Model B: Fees are separate from reserves, just check contract balance
        require(address(this).balance >= ethReserve + amount, "Insufficient fee balance");
        
        totalFeesCollected = 0;
        // Model B: Don't touch ethReserve or k - fees were never in reserves
        
        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Fee withdrawal failed");
        
        emit FeesWithdrawn(amount);
    }

    /**
     * @notice Emergency function to recover stuck tokens
     * @param tokenAddress Token to recover
     * @param amount Amount to recover
     */
    function recoverTokens(address tokenAddress, uint256 amount) external onlyOwner {
        require(tokenAddress != address(token), "Cannot recover primary token");
        // FIX L-1: Add zero amount guard
        require(amount > 0, "Amount must be > 0");
        IERC20(tokenAddress).safeTransfer(owner(), amount);
    }

    /**
     * @notice Get pool info
     */
    function getPoolInfo() external view returns (
        uint256 _tokenReserve,
        uint256 _ethReserve,
        uint256 _k,
        uint256 _swapFeeBps,
        uint256 _totalFeesCollected,
        uint256 _price
    ) {
        return (
            tokenReserve,
            ethReserve,
            k,
            swapFeeBps,
            totalFeesCollected,
            getPrice()
        );
    }

    /**
     * @notice Inject ETH into reserves without buying tokens. Only callable by owner.
     * @dev Use this instead of direct ETH transfers to avoid receive() issues
     */
    function injectEth() external payable onlyOwner nonReentrant {
        require(msg.value > 0, "Must send ETH");
        
        ethReserve += msg.value;
        if (tokenReserve > 0) {
            k = _safeMul(tokenReserve, ethReserve);
        }
        
        emit EthInjected(msg.value);
    }
}
