/**
 * Global error handler middleware
 */

import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';
import { CONSTANTS } from '../utils/constants';
import { ErrorResponse } from '../types';

export class AppError extends Error {
  constructor(
    public code: string,
    public statusCode: number,
    public message: string,
    public details?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = req.id || 'unknown';

  // Determine error details
  let code: string = CONSTANTS.ERROR_CODES.INTERNAL_ERROR;
  let statusCode: number = CONSTANTS.HTTP_STATUS.INTERNAL_SERVER_ERROR;
  let message = 'Internal server error';
  let details = undefined;

  if (err instanceof AppError) {
    code = err.code;
    statusCode = err.statusCode;
    message = err.message;
    details = err.details;
  } else if (err.name === 'ValidationError') {
    code = CONSTANTS.ERROR_CODES.INVALID_ADDRESS;
    statusCode = CONSTANTS.HTTP_STATUS.BAD_REQUEST;
    message = 'Validation error';
    details = err.message;
  }

  // Log error
  const errorLogger = logger.child({ requestId });
  if (statusCode >= 500) {
    errorLogger.error({ 
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    }, 'Server error');
  } else {
    errorLogger.warn({ error: err.message }, 'Client error');
  }

  // Send error response
  const errorResponse: ErrorResponse = {
    error: {
      code,
      message,
      details: process.env.NODE_ENV === 'development' ? details : undefined,
    },
  };

  res.status(statusCode).json(errorResponse);
}

/**
 * Handle 404 Not Found
 */
export function notFoundHandler(req: Request, res: Response): void {
  const errorResponse: ErrorResponse = {
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found',
      details: `Cannot ${req.method} ${req.path}`,
    },
  };

  res.status(CONSTANTS.HTTP_STATUS.NOT_FOUND).json(errorResponse);
}

export default errorHandler;
