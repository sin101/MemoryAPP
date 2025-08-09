import fs from 'fs';

class Logger {
  path: string;

  constructor(path: string) {
    this.path = path;
  }

  _write(level: string, msg: string) {
    const line = `[${new Date().toISOString()}] ${level}: ${msg}\n`;
    fs.appendFile(this.path, line, () => {});
  }

  info(msg: string) {
    this._write('INFO', msg);
  }

  error(msg: string) {
    this._write('ERROR', msg);
  }
}

export default Logger;
