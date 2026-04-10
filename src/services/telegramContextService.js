const { exec } = require('child_process');
const util = require('util');
const { ethers } = require('ethers');
const axios = require('axios');
const StateManager = require('./stateManager');
const logger = require('../utils/logger');

const execPromise = util.promisify(exec);

/**
 * Service to gather real-time context from all agent data sources
 * for the Telegram bot's AI assistant
 */
class TelegramContextService {
  constructor() {
    this.stateManager = new StateManager();
    this.connected = false;
  }

  async ensureConnected() {
    if (!this.connected) {
      await this.stateManager.connect();
      this.connected = true;
    }
  }

  /**
   * Gather full context from all data sources
   */
  async getFullContext() {
    try {
      await this.ensureConnected();

      const [
        recentTokens,
        pm2Status,
        recentLogs,
        ethBalance,
        backendTokens,
        momentumActivity
      ] = await Promise.allSettled([
        this.getRecentTokens(),
        this.getPM2Status(),
        this.getRecentLogs(),
        this.getETHBalance(),
        this.getBackendTokens(),
        this.getMomentumActivity()
      ]);

      return {
        tokens: recentTokens.status === 'fulfilled' ? recentTokens.value : [],
        pm2: pm2Status.status === 'fulfilled' ? pm2Status.value : 'Unknown',
        logs: recentLogs.status === 'fulfilled' ? recentLogs.value : [],
        balance: ethBalance.status === 'fulfilled' ? ethBalance.value : { error: 'Could not fetch' },
        backend: backendTokens.status === 'fulfilled' ? backendTokens.value : [],
        momentum: momentumActivity.status === 'fulfilled' ? momentumActivity.value : []
      };
    } catch (error) {
      logger.error('Error gathering context:', error);
      return {
        tokens: [],
        pm2: 'Error',
        logs: [],
        balance: { error: 'Context service error' },
        backend: [],
        momentum: []
      };
    }
  }

  /**
   * Get recent token deployments (last 24 hours)
   */
  async getRecentTokens() {
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const tokens = await this.stateManager.db.all(
        `SELECT token_symbol, topic, token_address, created_at, region, pool_address 
         FROM deployments 
         WHERE created_at > ? 
         ORDER BY created_at DESC 
         LIMIT 10`,
        [oneDayAgo]
      );

      return tokens.map(t => ({
        symbol: t.token_symbol,
        topic: t.topic,
        address: t.token_address,
        poolAddress: t.pool_address,
        time: new Date(t.created_at).toLocaleString(),
        region: t.region
      }));
    } catch (error) {
      logger.error('Error fetching recent tokens:', error);
      return [];
    }
  }

  /**
   * Get PM2 process status
   */
  async getPM2Status() {
    try {
      const { stdout } = await execPromise('pm2 status trends-agent --no-color 2>/dev/null || echo "PM2 not available"');
      
      if (stdout.includes('online')) {
        // Extract status line
        const lines = stdout.split('\n');
        const statusLine = lines.find(l => l.includes('trends-agent') && l.includes('online'));
        if (statusLine) {
          const parts = statusLine.trim().split(/\s+/);
          const uptime = parts.find(p => p.includes('m') || p.includes('h') || p.includes('d')) || 'Unknown';
          return `Online (uptime: ${uptime})`;
        }
        return 'Online';
      } else if (stdout.includes('stopped')) {
        return 'Stopped';
      } else {
        return 'Unknown';
      }
    } catch (error) {
      return 'PM2 not available';
    }
  }

  /**
   * Get recent log entries with key events
   */
  async getRecentLogs() {
    try {
      const { stdout } = await execPromise('tail -100 /home/ubuntu/trends-agent/trendy-thebot-logs/trends-agent.log 2>/dev/null || echo "No logs available"');
      
      const lines = stdout.split('\n').filter(l => l.trim());
      
      // Filter for important events
      const importantLines = lines.filter(l => 
        l.includes('Token Deployed') ||
        l.includes('Supply Expanded') ||
        l.includes('Liquidity Injected') ||
        l.includes('Error') ||
        l.includes('error') ||
        l.includes('deployed successfully') ||
        l.includes('Momentum surge') ||
        l.includes('minting') ||
        l.includes('Agent active')
      ).slice(-10);

      return importantLines.length > 0 ? importantLines : ['No significant events in recent logs'];
    } catch (error) {
      return ['Unable to read logs'];
    }
  }

  /**
   * Get ETH balance from blockchain
   */
  async getETHBalance() {
    try {
      const agentAddress = process.env.AGENT_ADDRESS || process.env.WALLET_ADDRESS;
      if (!agentAddress) {
        return { error: 'Agent address not configured' };
      }

      const provider = new ethers.JsonRpcProvider(
        process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org'
      );

      const balance = await provider.getBalance(agentAddress);
      const ethBalance = ethers.formatEther(balance);
      
      const network = await provider.getNetwork();
      const networkName = network.name === 'base-sepolia' ? 'Base Sepolia' : network.name || 'Base Sepolia';

      return {
        address: agentAddress,
        eth: parseFloat(ethBalance).toFixed(6),
        network: networkName,
        rawBalance: ethBalance
      };
    } catch (error) {
      logger.error('Error fetching ETH balance:', error);
      return { error: 'Could not fetch balance from blockchain' };
    }
  }

  /**
   * Get tokens from backend API
   */
  async getBackendTokens() {
    try {
      const response = await axios.get('http://localhost:5001/api/public/tokens', {
        timeout: 5000
      });
      
      if (Array.isArray(response.data)) {
        return response.data.slice(0, 10).map(t => ({
          symbol: t.token_symbol,
          topic: t.trend_topic,
          address: t.token_address,
          timestamp: t.timestamp,
          trendTopic: t.trend_topic
        }));
      }
      return [];
    } catch (error) {
      logger.warn('Backend API not accessible:', error.message);
      return [];
    }
  }

  /**
   * Get recent momentum/expansion activity
   */
  async getMomentumActivity() {
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const events = await this.stateManager.db.all(
        `SELECT event_type, topic, region, timestamp, details 
         FROM events 
         WHERE event_type IN ('MOMENTUM_MINT', 'LIQUIDITY_INJECTED', 'CREATOR_FEE_COLLECTED_MOMENTUM')
         AND timestamp > ? 
         ORDER BY timestamp DESC 
         LIMIT 10`,
        [oneDayAgo]
      );

      return events.map(e => ({
        type: e.event_type,
        topic: e.topic,
        region: e.region,
        time: new Date(e.timestamp).toLocaleString(),
        details: e.details ? JSON.parse(e.details) : null
      }));
    } catch (error) {
      logger.error('Error fetching momentum activity:', error);
      return [];
    }
  }

  /**
   * Format context as string for LLM prompt
   */
  formatContextForLLM(context) {
    const { tokens, pm2, logs, balance, backend, momentum } = context;
    
    let output = '';
    
    // System Status
    output += '=== AGENT STATUS ===\n';
    output += `Process Status: ${pm2}\n`;
    if (balance && !balance.error) {
      output += `Wallet: ${balance.address}\n`;
      output += `Balance: ${balance.eth} ETH on ${balance.network}\n`;
    } else {
      output += `Balance: ${balance?.error || 'Unknown'}\n`;
    }
    output += '\n';
    
    // Recent Tokens
    output += '=== TOKENS DEPLOYED (24h) ===\n';
    if (tokens && tokens.length > 0) {
      tokens.forEach((t, i) => {
        output += `${i + 1}. ${t.symbol} (${t.topic})\n`;
        output += `   Region: ${t.region}, Time: ${t.time}\n`;
        output += `   Address: ${t.address?.slice(0, 12)}...\n`;
      });
    } else {
      output += 'No tokens deployed in the last 24 hours.\n';
    }
    output += '\n';
    
    // Momentum Activity
    if (momentum && momentum.length > 0) {
      output += '=== SUPPLY EXPANSIONS (24h) ===\n';
      momentum.slice(0, 5).forEach(m => {
        output += `- ${m.topic}: ${m.type} at ${m.time}\n`;
      });
      output += '\n';
    }
    
    // Recent Log Activity
    output += '=== RECENT ACTIVITY ===\n';
    if (logs && logs.length > 0) {
      logs.slice(-5).forEach(l => {
        // Clean up log line
        const cleanLine = l.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z\s+\[\w+\]\s*/, '');
        output += `- ${cleanLine.substring(0, 80)}\n`;
      });
    } else {
      output += 'No recent activity recorded.\n';
    }
    
    return output;
  }
}

module.exports = TelegramContextService;
