const fs = require('fs');
const path = require('path');

class Logger {
  constructor(options = {}) {
    this.logDir = options.logDir || path.join(__dirname, '..', 'logs');
    this.logFile = path.join(this.logDir, options.filename || 'app.log');
    this.enabled = options.enabled ?? false;
    this._ensureLogDir();
  }

  _ensureLogDir() {
    try {
      fs.mkdirSync(this.logDir, { recursive: true });
    } catch (err) {
      // ignore errors creating log directory
    }
  }

  setEnabled(enabled) {
    this.enabled = !!enabled;
  }

  log(message) {
    if (!this.enabled) {
      return;
    }
    const line = `[${new Date().toISOString()}] ${message}\n`;
    fs.appendFile(this.logFile, line, err => {
      if (err) {
        console.error('Failed to write log:', err);
      }
    });
  }

  async exportLogs(targetPath) {
    await fs.promises.copyFile(this.logFile, targetPath);
    return targetPath;
  }
}

const logger = new Logger({
  enabled: process.env.ENABLE_LOGS === 'true'
});

module.exports = logger;
module.exports.Logger = Logger;
