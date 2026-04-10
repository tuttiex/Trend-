const TelegramBot = require('node-telegram-bot-api');
const { exec } = require('child_process');
const util = require('util');
const axios = require('axios');
const path = require('path');
const { ethers } = require('ethers');
const GroqClient = require('./groqClient');
const TelegramContextService = require('./telegramContextService');
const logger = require('../utils/logger');
require('dotenv').config();

const execPromise = util.promisify(exec);

class TelegramBotService {
  constructor() {
    this.token = process.env.TRENDY_THEBOT_ACCESS_TOKEN;
    this.authorizedChatId = process.env.USER_CHAT_ID;

    if (!this.token || !this.authorizedChatId) {
      console.error('Missing TELEGRAM_BOT_TOKEN or USER_CHAT_ID in .env');
      process.exit(1);
    }

    // Initialize AI client and context service
    this.groq = new GroqClient();
    this.contextService = new TelegramContextService();
    this.conversationHistory = {};
    this.maxHistoryLength = 10;
    this.lastContextUpdate = null;
    this.cachedContext = null;
    this.contextCacheDuration = 30000; // 30 seconds

    this.bot = new TelegramBot(this.token, { polling: true });
    this.setupCommands();
    this.setupErrorHandling();

    console.log('Telegram Bot Service started with AI capabilities');
    this.notify('🤖 Telegram Bot with AI assistant is now monitoring the Trends Agent');
  }

  /**
   * Get cached context or fetch fresh data
   */
  async getAgentContext() {
    const now = Date.now();
    if (this.cachedContext && (now - this.lastContextUpdate) < this.contextCacheDuration) {
      return this.cachedContext;
    }

    this.cachedContext = await this.contextService.getFullContext();
    this.lastContextUpdate = now;
    return this.cachedContext;
  }

  setupErrorHandling() {
    this.bot.on('polling_error', (error) => {
      console.error('Telegram polling error:', error);
    });

    this.bot.on('error', (error) => {
      console.error('Telegram bot error:', error);
    });
  }

  isAuthorized(chatId) {
    return chatId.toString() === this.authorizedChatId.toString();
  }

  setupCommands() {
    // Help command
    this.bot.onText(/\/help/, (msg) => {
      if (!this.isAuthorized(msg.chat.id)) return;
      
      const helpText = `
🤖 *Trends Agent Bot Commands*

*Monitoring:*
/status - Show PM2 status of all services
/quickstatus - Quick system overview (fast, no AI)
/logs agent [n] - Last N lines of agent logs (default: 20)
/logs backend [n] - Last N lines of backend logs
/logs bot [n] - Last N lines of bot logs
/tokens - List tokens deployed today
/balance - Check agent ETH balance

*AI Assistant:*
_Send any message_ - Ask the AI about agent activity, trends, tokens
/clear - Clear conversation history

*Info:*
/help - Show this help message
      `;
      this.bot.sendMessage(msg.chat.id, helpText, { parse_mode: 'Markdown' });
    });

    // Status command
    this.bot.onText(/\/status/, async (msg) => {
      if (!this.isAuthorized(msg.chat.id)) return;
      
      try {
        const { stdout } = await execPromise('pm2 status');
        this.bot.sendMessage(msg.chat.id, '```\n' + stdout.slice(0, 4000) + '\n```', { parse_mode: 'Markdown' });
      } catch (error) {
        this.bot.sendMessage(msg.chat.id, '❌ Error getting status: ' + error.message);
      }
    });

    // Logs command
    this.bot.onText(/\/logs (agent|backend|bot)( (\d+))?/, async (msg, match) => {
      if (!this.isAuthorized(msg.chat.id)) return;
      
      const service = match[1];
      const lines = match[3] || 20;
      let command;

      switch(service) {
        case 'agent':
          command = `pm2 logs trends-agent --lines ${lines} --nostream`;
          break;
        case 'backend':
          command = `pm2 logs trends-website-backend --lines ${lines} --nostream`;
          break;
        case 'bot':
          command = `pm2 logs telegram-bot --lines ${lines} --nostream`;
          break;
        default:
          return this.bot.sendMessage(msg.chat.id, '❌ Unknown service. Use: agent, backend, or bot');
      }

      try {
        const { stdout } = await execPromise(command);
        const truncated = stdout.slice(-4000); // Telegram limit is ~4096 chars
        this.bot.sendMessage(msg.chat.id, `📋 *Last ${lines} lines of ${service}:*\n\`\`\`\n${truncated}\n\`\`\``, { parse_mode: 'Markdown' });
      } catch (error) {
        this.bot.sendMessage(msg.chat.id, '❌ Error getting logs: ' + error.message);
      }
    });

    // Tokens command - Query backend API
    this.bot.onText(/\/tokens/, async (msg) => {
      if (!this.isAuthorized(msg.chat.id)) return;
      
      try {
        const response = await axios.get('http://localhost:5001/api/public/tokens');
        const tokens = response.data;
        
        // Filter today's tokens
        const today = new Date().toDateString();
        const todayTokens = tokens.filter(t => new Date(t.timestamp).toDateString() === today);

        if (todayTokens.length === 0) {
          this.bot.sendMessage(msg.chat.id, '📊 *Tokens Today: 0*\n\nNo tokens deployed yet today.');
          return;
        }

        const tokenList = todayTokens.map(t => 
          `• *${t.token_symbol}*\n  Topic: ${t.trend_topic}\n  Address: \`${t.token_address}\``
        ).join('\n\n');

        const message = `📊 *Tokens Today: ${todayTokens.length}*\n\n${tokenList}`;
        this.bot.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' });
      } catch (error) {
        this.bot.sendMessage(msg.chat.id, '❌ Error fetching tokens: ' + error.message);
      }
    });

    // Balance command
    this.bot.onText(/\/balance/, async (msg) => {
      if (!this.isAuthorized(msg.chat.id)) return;

      try {
        // Get agent address from environment or use a default query method
        const agentAddress = process.env.AGENT_ADDRESS || process.env.WALLET_ADDRESS;

        if (!agentAddress) {
          this.bot.sendMessage(msg.chat.id, '❌ Agent address not configured. Set AGENT_ADDRESS in .env');
          return;
        }

        // Connect to Base Sepolia and get balance
        const provider = new ethers.JsonRpcProvider(
          process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org'
        );

        const balance = await provider.getBalance(agentAddress);
        const ethBalance = ethers.formatEther(balance);

        // Get network info
        const network = await provider.getNetwork();
        const networkName = network.name === 'base-sepolia' ? 'Base Sepolia' : network.name;

        const message = `💰 *Agent Balance*\n\n` +
          `*Address:* \`${agentAddress}\`\n` +
          `*Balance:* ${parseFloat(ethBalance).toFixed(6)} ETH\n` +
          `*Network:* ${networkName}\n\n` +
          `*View on Explorer:*\n` +
          `[Base Sepolia Explorer](https://sepolia.basescan.org/address/${agentAddress})`;

        this.bot.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown', disable_web_page_preview: true });
      } catch (error) {
        this.bot.sendMessage(msg.chat.id, '❌ Error getting balance: ' + error.message);
      }
    });

    // Quick status command
    this.bot.onText(/\/quickstatus/, async (msg) => {
      if (!this.isAuthorized(msg.chat.id)) return;

      try {
        this.bot.sendChatAction(msg.chat.id, 'typing');
        const context = await this.getAgentContext();

        const tokenCount = Array.isArray(context.tokens) ? context.tokens.length : 0;
        const balanceStr = context.balance && !context.balance.error
          ? `${context.balance.eth} ETH`
          : 'Unknown';

        const summary = `📊 *Quick Status*

*Agent:* ${context.pm2}
*Balance:* ${balanceStr}
*Tokens (24h):* ${tokenCount}
*Expansions (24h):* ${Array.isArray(context.momentum) ? context.momentum.length : 0}

_Send any message for AI insights, or use /help for commands._`;

        this.bot.sendMessage(msg.chat.id, summary, { parse_mode: 'Markdown' });
      } catch (error) {
        this.bot.sendMessage(msg.chat.id, '❌ Error getting status: ' + error.message);
      }
    });

    // Clear conversation history
    this.bot.onText(/\/clear/, async (msg) => {
      if (!this.isAuthorized(msg.chat.id)) return;

      this.conversationHistory[msg.chat.id] = [];
      this.cachedContext = null;
      this.lastContextUpdate = null;
      this.bot.sendMessage(msg.chat.id, '🧹 Conversation history and cache cleared.');
    });

    // AI Chat - handle natural language queries
    this.bot.on('message', async (msg) => {
      if (!this.isAuthorized(msg.chat.id)) return;
      if (msg.text && msg.text.startsWith('/')) return; // Skip commands
      if (!msg.text || msg.text.length === 0) return; // Skip empty messages

      try {
        this.bot.sendChatAction(msg.chat.id, 'typing');

        // Gather context from all data sources
        const context = await this.getAgentContext();
        const contextString = this.contextService.formatContextForLLM(context);

        // Build system prompt with context
        const systemPrompt = `You are the Trends Agent AI assistant. You have real-time access to the agent's systems and data.

CURRENT SYSTEM CONTEXT:
${contextString}

INSTRUCTIONS:
- Answer questions based on the context provided above
- Be specific: use token names, addresses, balances, and timestamps from the context
- If you don't have information to answer a question, say so clearly
- For general crypto questions not related to the agent, you can answer with general knowledge
- Keep responses concise but informative
- Use markdown formatting for clarity`;

        // Get conversation history for this chat
        if (!this.conversationHistory[msg.chat.id]) {
          this.conversationHistory[msg.chat.id] = [];
        }
        const history = this.conversationHistory[msg.chat.id];

        // Build messages array
        const messages = [
          { role: 'system', content: systemPrompt },
          ...history,
          { role: 'user', content: msg.text }
        ];

        // Query LLM
        const response = await this.groq.chatCompletion(messages, {
          temperature: 0.7,
          maxTokens: 800
        });

        // Send response
        this.bot.sendMessage(msg.chat.id, response, {
          parse_mode: 'Markdown',
          reply_to_message_id: msg.message_id
        });

        // Update history
        history.push(
          { role: 'user', content: msg.text },
          { role: 'assistant', content: response }
        );

        // Trim history if too long
        if (history.length > this.maxHistoryLength * 2) {
          this.conversationHistory[msg.chat.id] = history.slice(-this.maxHistoryLength * 2);
        }

      } catch (error) {
        logger.error('AI chat error:', error);
        this.bot.sendMessage(msg.chat.id, '❌ Sorry, I had trouble processing that. Try again or use /help for commands.');
      }
    });
  }

  // Public method for sending notifications
  notify(message, options = {}) {
    this.bot.sendMessage(this.authorizedChatId, message, { 
      parse_mode: 'Markdown',
      ...options 
    });
  }
}

// Start the bot if this file is run directly
if (require.main === module) {
  const bot = new TelegramBotService();
}

module.exports = TelegramBotService;
