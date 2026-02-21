/**
 * x402 payment verification middleware
 */

import { Request, Response, NextFunction } from 'express';
import { CONSTANTS } from '../utils/constants';
import { X402Service } from '../services/x402';
import { x402VerificationCounter } from '../utils/metrics';
import logger from '../utils/logger';

declare module 'express-serve-static-core' {
  interface Request {
    x402Verified?: boolean;
    x402TxId?: string;
  }
}

export function createX402Middleware(x402Service: X402Service) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const signature = req.headers[CONSTANTS.X402_SIGNATURE_HEADER.toLowerCase()] as string;
    const paymentId = req.headers[CONSTANTS.X402_PAYMENT_ID_HEADER.toLowerCase()] as string;
    const chain = req.headers[CONSTANTS.X402_CHAIN_HEADER.toLowerCase()] as string;

    // Check for required headers
    if (!signature || !paymentId || !chain) {
      x402VerificationCounter.labels({ status: 'failed' }).inc();
      logger.warn({ 
        hasSignature: !!signature, 
        hasPaymentId: !!paymentId, 
        hasChain: !!chain 
      }, 'x402 verification failed: missing headers');
      
      res.status(CONSTANTS.HTTP_STATUS.PAYMENT_REQUIRED).json({
        error: {
          code: CONSTANTS.ERROR_CODES.PAYMENT_REQUIRED,
          message: 'Payment verification failed',
          details: 'Missing required x402 headers: X-x402-Signature, X-x402-Payment-Id, X-x402-Chain',
        },
      });
      return;
    }

    // Verify payment
    const result = await x402Service.verifyPayment(signature, paymentId, chain);

    if (!result.valid) {
      x402VerificationCounter.labels({ status: 'failed' }).inc();
      logger.warn({ 
        paymentId, 
        chain, 
        error: result.error 
      }, 'x402 verification failed');
      
      res.status(CONSTANTS.HTTP_STATUS.PAYMENT_REQUIRED).json({
        error: {
          code: CONSTANTS.ERROR_CODES.PAYMENT_INVALID,
          message: 'Payment verification failed',
          details: result.error || 'Invalid payment',
        },
      });
      return;
    }

    // Payment verified successfully
    x402VerificationCounter.labels({ status: 'success' }).inc();
    req.x402Verified = true;
    req.x402TxId = result.txId;

    logger.info({ 
      paymentId, 
      txId: result.txId,
      amount: result.amount?.toString() 
    }, 'x402 payment verified');

    next();
  };
}

export default createX402Middleware;
