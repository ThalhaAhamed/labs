import pino from 'pino';

/**
 * Shared, readable console logger.
 * Uses pino-pretty in all environments since this is a CLI-style example app,
 * not a service shipping JSON logs to a collector.
 */
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss',
      ignore: 'pid,hostname',
      singleLine: true,
    },
  },
});

export default logger;
