const { spawn } = require('child_process');
const logger = require('./utils/logger');

logger.info('Starting OpenClaw Gateway via wrapper...');

const gateway = spawn('openclaw', ['gateway'], {
    shell: true,
    stdio: 'inherit'
});

gateway.on('error', (err) => {
    logger.error('Failed to start OpenClaw Gateway:', err);
});

gateway.on('exit', (code) => {
    logger.info(`OpenClaw Gateway exited with code ${code}`);
    process.exit(code);
});
