/**
 * Telegram Notifier Service
 * 
 * Provides methods for sending notifications to Telegram
 * when important events occur in the Trend Agent.
 */

class TelegramNotifier {
  constructor(botService) {
    this.bot = botService;
    this.notificationCount = {
      tokens: 0,
      errors: 0,
      warnings: 0
    };
    this.lastDailySummary = null;
  }

  /**
   * Send notification when a token is successfully deployed
   * @param {Object} token - Token deployment data
   */
  tokenDeployed(token) {
    this.notificationCount.tokens++;
    
    const message = `🚀 *Token Deployed Successfully!*\n\n` +
      `*Symbol:* ${token.symbol}\n` +
      `*Name:* ${token.name}\n` +
      `*Topic:* ${token.trendTopic || 'N/A'}\n\n` +
      `*Token Address:*\n\`${token.tokenAddress}\`\n\n` +
      `*DEX Address:*\n\`${token.poolAddress || token.dexAddress}\`\n\n` +
      `*View on Explorer:*\n` +
      `[Base Sepolia Explorer](https://sepolia.basescan.org/address/${token.tokenAddress})\n\n` +
      `*Timestamp:* ${new Date().toLocaleString()}`;

    this.bot.notify(message, { disable_web_page_preview: true });
  }

  /**
   * Send notification when deployment fails
   * @param {string} context - What was being attempted
   * @param {Error} error - Error object
   * @param {Object} extraData - Additional context
   */
  error(context, error, extraData = {}) {
    this.notificationCount.errors++;
    
    let message = `❌ *Error: ${context}*\n\n` +
      `*Message:* ${error.message}\n`;
    
    if (error.stack) {
      message += `\n*Stack:*\n\`\`\`${error.stack.slice(0, 500)}\`\`\``;
    }

    if (extraData && Object.keys(extraData).length > 0) {
      message += `\n*Additional Info:*\n\`\`\`${JSON.stringify(extraData, null, 2).slice(0, 500)}\`\`\``;
    }

    this.bot.notify(message);
  }

  /**
   * Send warning notification (non-critical issues)
   * @param {string} context - Warning context
   * @param {string} message - Warning message
   */
  warning(context, message) {
    this.notificationCount.warnings++;
    
    const fullMessage = `⚠️ *Warning: ${context}*\n\n${message}`;
    this.bot.notify(fullMessage);
  }

  /**
   * Send daily summary of agent activity
   * @param {Object} stats - Daily statistics
   */
  dailySummary(stats) {
    const today = new Date().toDateString();
    
    // Prevent duplicate summaries
    if (this.lastDailySummary === today) {
      return;
    }
    this.lastDailySummary = today;

    const message = `📊 *Daily Summary - ${today}*\n\n` +
      `*Tokens Deployed:* ${stats.tokensDeployed || this.notificationCount.tokens}\n` +
      `*Errors:* ${stats.errors || this.notificationCount.errors}\n` +
      `*Warnings:* ${stats.warnings || this.notificationCount.warnings}\n` +
      `*Gas Spent:* ${stats.gasSpent || 'N/A'} ETH\n\n` +
      `*System Health:* ${stats.errors === 0 ? '✅ Healthy' : '⚠️ Issues Detected'}`;

    this.bot.notify(message);
    
    // Reset counters for next day
    this.resetCounters();
  }

  /**
   * Notify about low ETH balance
   * @param {string} balance - Current balance
   * @param {string} threshold - Warning threshold
   */
  lowBalance(balance, threshold) {
    const message = `⚠️ *Low ETH Balance Warning*\n\n` +
      `Current Balance: ${balance} ETH\n` +
      `Warning Threshold: ${threshold} ETH\n\n` +
      `Please add more test ETH to the agent wallet.`;

    this.bot.notify(message);
  }

  /**
   * Notify about API rate limits
   * @param {string} apiName - Name of the API (Twitter, Groq, etc.)
   * @param {string} details - Rate limit details
   */
  rateLimitWarning(apiName, details) {
    const message = `⚠️ *API Rate Limit: ${apiName}*\n\n${details}`;
    this.bot.notify(message);
  }

  /**
   * Notify about webhook delivery
   * @param {boolean} success - Whether delivery succeeded
   * @param {Object} token - Token data
   * @param {string} error - Error message if failed
   */
  webhookDelivered(success, token, error = null) {
    if (success) {
      const message = `✅ *Webhook Delivered*\n\n` +
        `Token ${token.symbol} successfully pushed to backend.`;
      this.bot.notify(message);
    } else {
      const message = `❌ *Webhook Failed*\n\n` +
        `Token: ${token.symbol}\n` +
        `Error: ${error}`;
      this.bot.notify(message);
    }
  }

  /**
   * Notify about scheduler status
   * @param {string} status - 'started', 'stopped', 'error'
   * @param {string} details - Additional details
   */
  schedulerStatus(status, details = '') {
    const icons = {
      started: '🟢',
      stopped: '🔴',
      error: '❌'
    };

    const message = `${icons[status] || 'ℹ️'} *Scheduler ${status.toUpperCase()}*\n\n${details}`;
    this.bot.notify(message);
  }

  /**
   * Send a generic info message
   * @param {string} message - Message to send
   */
  info(message) {
    this.bot.notify(`ℹ️ *Info*\n\n${message}`);
  }

  /**
   * Send notification when creator fee is minted
   * @param {Object} token - Token data
   * @param {string} feeAmount - Fee amount in tokens
   * @param {string} txHash - Transaction hash
   */
  creatorFeeMinted(token, feeAmount, txHash) {
    const message = `💰 *Creator Fee Minted*\n\n` +
      `*Token:* ${token.symbol}\n` +
      `*Amount:* ${feeAmount} ${token.symbol}\n` +
      `*Fee Percent:* ${token.feePercent || '1'}%\n\n` +
      `*Transaction:*\n` +
      `[View on Explorer](https://sepolia.basescan.org/tx/${txHash})\n\n` +
      `*Timestamp:* ${new Date().toLocaleString()}`;

    this.bot.notify(message, { disable_web_page_preview: true });
  }

  /**
   * Send notification when liquidity is added to a pool
   * @param {Object} token - Token data
   * @param {string} ethAmount - ETH amount added
   * @param {string} tokenAmount - Token amount added
   * @param {boolean} isInitial - Whether this is initial liquidity or additional
   * @param {string} txHash - Transaction hash
   */
  liquidityAdded(token, ethAmount, tokenAmount, isInitial, txHash) {
    const type = isInitial ? '🌊 Initial Liquidity Added' : '➕ Additional Liquidity Added';
    const message = `${type}\n\n` +
      `*Token:* ${token.symbol}\n\n` +
      `*Added to Pool:*\n` +
      `• ${ethAmount} ETH\n` +
      `• ${tokenAmount} ${token.symbol}\n\n` +
      `*Pool Address:*\n` +
      `\`${token.poolAddress}\`\n\n` +
      `*Transaction:*\n` +
      `[View on Explorer](https://sepolia.basescan.org/tx/${txHash})`;

    this.bot.notify(message, { disable_web_page_preview: true });
  }

  /**
   * Send notification when supply is expanded via momentum minting
   * @param {Object} token - Token data with symbol, poolAddress
   * @param {number} volumeIncrease - Volume difference that triggered expansion
   * @param {number} totalMinted - Total new tokens minted
   * @param {number} toPool - Tokens sent to liquidity pool (99%)
   * @param {number} creatorFee - Creator fee amount (1%)
   * @param {string} txHash - Transaction hash
   */
  supplyExpanded(token, volumeIncrease, totalMinted, toPool, creatorFee, txHash) {
    const message = `📈 *Supply Expanded - ${token.symbol}*\n\n` +
      `*Momentum Detected:* +${volumeIncrease} Volume\n` +
      `*New Tokens Minted:* ${totalMinted} tokens\n` +
      `*To Pool:* ${toPool} tokens (99%)\n` +
      `*Creator Fee:* ${creatorFee} tokens (1%)\n\n` +
      `*Transaction:*\n` +
      `[View on Explorer](https://sepolia.basescan.org/tx/${txHash})\n\n` +
      `*Timestamp:* ${new Date().toLocaleString()}`;

    this.bot.notify(message, { disable_web_page_preview: true });
  }

  /**
   * Send notification when liquidity is injected to pool
   * @param {Object} token - Token data with symbol, poolAddress
   * @param {number} tokensAdded - Tokens added to pool
   * @param {string} ethPaired - ETH amount paired
   * @param {string} txHash - Transaction hash
   */
  liquidityInjected(token, tokensAdded, ethPaired, txHash) {
    const message = `💧 *Liquidity Injected - ${token.symbol}*\n\n` +
      `*Tokens Added:* ${tokensAdded} ${token.symbol}\n` +
      `*ETH Paired:* ${ethPaired} ETH\n` +
      `*Pool Address:*\n` +
      `\`${token.poolAddress}\`\n\n` +
      `*Transaction:*\n` +
      `[View on Explorer](https://sepolia.basescan.org/tx/${txHash})`;

    this.bot.notify(message, { disable_web_page_preview: true });
  }

  /**
   * Reset notification counters
   */
  resetCounters() {
    this.notificationCount = {
      tokens: 0,
      errors: 0,
      warnings: 0
    };
  }

  /**
   * Get current notification counts
   */
  getStats() {
    return { ...this.notificationCount };
  }
}

module.exports = TelegramNotifier;
