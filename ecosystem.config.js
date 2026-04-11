module.exports = {
  apps: [
    {
      name: 'trends-agent',
      script: './src/index.js',
      cwd: '/home/ubuntu/trends-agent',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production'
      },
      log_file: '/home/ubuntu/trends-agent/trendy-thebot-logs/trends-agent.log',
      out_file: '/home/ubuntu/trends-agent/trendy-thebot-logs/trends-agent-out.log',
      error_file: '/home/ubuntu/trends-agent/trendy-thebot-logs/trends-agent-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
    // Telegram bot runs inside trends-agent process (integrated)
  ]
};
