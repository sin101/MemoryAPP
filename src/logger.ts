import pino from 'pino';

export function createLogger(path?: string) {
  const destination = path ? pino.destination(path) : undefined;
  return pino({ level: process.env.LOG_LEVEL || 'info' }, destination);
}
