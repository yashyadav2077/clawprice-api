/**
 * Unit tests for validator
 */

import { validatePriceRequest, isValidAddress, isValidChainId } from '../../src/utils/validator';
import { CONSTANTS } from '../../src/utils/constants';

describe('Validator', () => {
  describe('isValidAddress', () => {
    it('should accept valid Ethereum addresses', () => {
      expect(isValidAddress('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913')).toBe(true);
      expect(isValidAddress('0x0000000000000000000000000000000000000000')).toBe(true);
      expect(isValidAddress('0xABCDEF1234567890abcdef1234567890ABCDEF01')).toBe(true);
      expect(isValidAddress('0xabcdef1234567890abcdef1234567890abcdef01')).toBe(true);
    });

    it('should reject invalid addresses', () => {
      expect(isValidAddress('invalid')).toBe(false);
      expect(isValidAddress('0x123')).toBe(false);
      expect(isValidAddress('0x' + 'a'.repeat(41))).toBe(false); // Too long
      expect(isValidAddress('0x' + 'a'.repeat(39))).toBe(false); // Too short
      expect(isValidAddress('1234567890abcdef1234567890abcdef123456')).toBe(false); // Missing 0x
      expect(isValidAddress('')).toBe(false);
    });
  });

  describe('isValidChainId', () => {
    it('should accept valid chain IDs', () => {
      expect(isValidChainId(1)).toBe(true); // Ethereum
      expect(isValidChainId(8453)).toBe(true); // Base
      expect(isValidChainId(137)).toBe(true); // Polygon
      expect(isValidChainId(2147483647)).toBe(true); // Max int32
    });

    it('should reject invalid chain IDs', () => {
      expect(isValidChainId(0)).toBe(false);
      expect(isValidChainId(-1)).toBe(false);
      expect(isValidChainId(-100)).toBe(false);
      expect(isValidChainId(2147483648)).toBe(false); // Exceeds int32
    });
  });

  describe('validatePriceRequest', () => {
    it('should accept valid requests', () => {
      const validRequest = {
        chainId: 8453,
        address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
      };

      const result = validatePriceRequest(validRequest);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject missing chainId', () => {
      const request = {
        address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
      };

      const result = validatePriceRequest(request);
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe(CONSTANTS.ERROR_CODES.INVALID_CHAIN_ID);
      expect(result.error?.message).toContain('chainId is required');
    });

    it('should reject invalid chainId', () => {
      const request = {
        chainId: -1,
        address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
      };

      const result = validatePriceRequest(request);
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe(CONSTANTS.ERROR_CODES.INVALID_CHAIN_ID);
    });

    it('should reject missing address', () => {
      const request = {
        chainId: 8453,
      };

      const result = validatePriceRequest(request);
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe(CONSTANTS.ERROR_CODES.INVALID_ADDRESS);
      expect(result.error?.message).toContain('address is required');
    });

    it('should reject invalid address', () => {
      const request = {
        chainId: 8453,
        address: 'invalid',
      };

      const result = validatePriceRequest(request);
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe(CONSTANTS.ERROR_CODES.INVALID_ADDRESS);
    });

    it('should reject null or undefined request', () => {
      expect(validatePriceRequest(null).valid).toBe(false);
      expect(validatePriceRequest(undefined).valid).toBe(false);
      expect(validatePriceRequest('').valid).toBe(false);
    });

    it('should handle non-object requests', () => {
      expect(validatePriceRequest(123).valid).toBe(false);
      expect(validatePriceRequest('string').valid).toBe(false);
      expect(validatePriceRequest([]).valid).toBe(false);
    });

    it('should handle extra fields gracefully', () => {
      const request = {
        chainId: 8453,
        address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
        extraField: 'ignored',
        anotherExtra: 123,
      };

      const result = validatePriceRequest(request);
      expect(result.valid).toBe(true);
    });
  });
});
