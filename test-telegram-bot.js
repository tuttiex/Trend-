/**
 * Test script for Telegram Bot
 * Run this to verify your bot is working before deploying
 */

require('dotenv').config();
const TelegramBotService = require('./src/services/telegramBot');

console.log('Testing Telegram Bot Service...');
console.log('Bot Token exists:', !!process.env.TRENDY_THEBOT_ACCESS_TOKEN);
console.log('Chat ID exists:', !!process.env.USER_CHAT_ID);

// This will start the bot and send a test message
try {
  const bot = new TelegramBotService();
  
  // Send test notifications
  setTimeout(() => {
    console.log('Sending test notifications...');
    
    // Test notification methods
    const TelegramNotifier = require('./src/services/telegramNotifier');
    const notifier = new TelegramNotifier(bot);
    
    notifier.info('This is a test message from your Trends Agent!');
    
    notifier.tokenDeployed({
      symbol: 'TEST',
      name: 'Test Token',
      trendTopic: 'Test Topic',
      tokenAddress: '0x1234567890abcdef',
      poolAddress: '0xfedcba0987654321'
    });
    
    console.log('Test messages sent! Check your Telegram.');
    console.log('Press Ctrl+C to stop the test bot.');
  }, 2000);
  
} catch (error) {
  console.error('Failed to start bot:', error.message);
  process.exit(1);
}
