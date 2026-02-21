/**
 * Input validation utilities
 */

import { PriceRequest } from '../types';
import { CONSTANTS } from './constants';
import logger from './logger';

export interface ValidationError {
  code: string;
  message: string;
  details?: string;
}

/**
 * Validate Ethereum address format
 */
export function isValidAddress(address: string): boolean {
  return CONSTANTS.ADDRESS_REGEX.test(address);
}

/**
 * Validate chain ID
 */
export function isValidChainId(chainId: number): boolean {
  return Number.isInteger(chainId) && chainId > 0 && chainId <= 2147483647;
}

/**
 * Validate price request
 */
export function validatePriceRequest(data: any): { valid: boolean; error?: ValidationError } {
  // Check if data exists
  if (!data || typeof data !== 'object') {
    const error: ValidationError = {
      code: CONSTANTS.ERROR_CODES.INTERNAL_ERROR,
      message: 'Invalid request body',
      details: 'Request body must be a valid JSON object',
    };
    return { valid: false, error };
  }

  // Validate chainId
  if (!('chainId' in data)) {
    const error: ValidationError = {
      code: CONSTANTS.ERROR_CODES.INVALID_CHAIN_ID,
      message: 'chainId is required',
      details: 'chainId must be a positive integer',
    };
    return { valid: false, error };
  }

  if (!isValidChainId(data.chainId)) {
    const error: ValidationError = {
      code: CONSTANTS.ERROR_CODES.INVALID_CHAIN_ID,
      message: 'Invalid chainId',
      details: `chainId must be a positive integer (received: ${data.chainId})`,
    };
    return { valid: false, error };
  }

  // Validate address
  if (!('address' in data)) {
    const error: ValidationError = {
      code: CONSTANTS.ERROR_CODES.INVALID_ADDRESS,
      message: 'address is required',
      details: 'address must be a valid Ethereum address',
    };
    return { valid: false, error };
  }

  if (typeof data.address !== 'string' || !isValidAddress(data.address)) {
    const error: ValidationError = {
      code: CONSTANTS.ERROR_CODES.INVALID_ADDRESS,
      message: 'Invalid address',
      details: `address must be a valid Ethereum address (received: ${data.address})`,
    };
    return { valid: false, error };
  }

  // Additional fields should be ignored (strict validation)
  const validFields = ['chainId', 'address'];
  const extraFields = Object.keys(data).filter(key => !validFields.includes(key));

  if (extraFields.length > 0) {
    logger.warn({ extraFields }, 'Request contains extra fields, ignoring');
  }

  return { valid: true };
}

/**
 * Create a typed PriceRequest from validated data
 */
export function createPriceRequest(data: any): PriceRequest {
  return {
    chainId: Number(data.chainId),
    address: data.address.toLowerCase(),
  };
}
