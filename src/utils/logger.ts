/**
 * Structured JSON logger using Pino
 */

import pino from 'pino';
import { LogContext } from '../types';

const logLevel = process.env.LOG_LEVEL || 'info';

const pinoConfig: pino.LoggerOptions = {
  level: logLevel,
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  serializers: {
    error: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
};

const logger = pino(pinoConfig);

/**
 * Create a child logger with additional context
 */
export function createLogger(context: LogContext = {}): pino.Logger {
  return logger.child(context);
}

/**
 * Create a logger with request context
 */
export function createRequestLogger(requestId: string, additionalContext: LogContext = {}): pino.Logger {
  return logger.child({
    requestId,
    ...additionalContext
  });
}

export default logger;
