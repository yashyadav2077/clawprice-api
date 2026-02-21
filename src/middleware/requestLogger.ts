/**
 * Request logging middleware
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';
import { httpRequestCounter, httpRequestDuration } from '../utils/metrics';

declare module 'express-serve-static-core' {
  interface Request {
    id?: string;
    startTime?: number;
  }
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  // Generate unique request ID
  req.id = req.id || uuidv4();
  req.startTime = Date.now();

  // Log request start
  const childLogger = logger.child({
    requestId: req.id,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  // Attach logger to request
  (req as any).log = childLogger;

  // Log headers (sanitized)
  const sanitizedHeaders = {
    'content-type': req.get('content-type'),
    'x-x402-signature': req.get('x-x402-signature') ? '[REDACTED]' : undefined,
    'x-x402-payment-id': req.get('x-x402-payment-id'),
    'x-x402-chain': req.get('x-x402-chain'),
  };

  childLogger.info({ headers: sanitizedHeaders }, 'Request received');

  // Log response
  res.on('finish', () => {
    const duration = Date.now() - (req.startTime || 0);
    
    childLogger.info({
      statusCode: res.statusCode,
      duration,
      x402Verified: req.x402Verified,
    }, 'Request completed');

    // Record metrics
    httpRequestCounter.labels({
      method: req.method,
      path: req.path,
      status_code: res.statusCode.toString(),
    }).inc();

    httpRequestDuration.labels({
      method: req.method,
      path: req.path,
    }).observe(duration / 1000);
  });

  next();
}

export default requestLogger;
