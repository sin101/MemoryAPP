const fs = require('fs');

class Logger {
  constructor(path) {
    this.path = path;
  }
  _write(level, msg) {
    const line = `[${new Date().toISOString()}] ${level}: ${msg}\n`;
    fs.appendFile(this.path, line, () => {});
  }
  info(msg) {
    this._write('INFO', msg);
  }
  error(msg) {
    this._write('ERROR', msg);
  }
}

module.exports = Logger;
