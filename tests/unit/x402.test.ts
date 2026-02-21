/**
 * Unit tests for X402Service
 */

import { ethers } from 'ethers';
import { X402Service } from '../../src/services/x402';
import { CacheService } from '../../src/services/cache';

// Mock CacheService
jest.mock('../../src/services/cache', () => {
  return {
    CacheService: jest.fn().mockImplementation(() => ({
      sismember: jest.fn().mockResolvedValue(false),
      sadd: jest.fn().mockResolvedValue(true),
      quit: jest.fn().mockResolvedValue(undefined),
      checkHealth: jest.fn().mockResolvedValue('connected'),
    })),
  };
});

describe('X402Service', () => {
  let x402Service: X402Service;
  let mockProvider: any;
  let cacheService: CacheService;

  const mockCollectionAddress = '0x1234567890123456789012345678901234567890';

  beforeEach(() => {
    // Set required environment variable
    process.env.X402_COLLECTION_ADDRESS = mockCollectionAddress;

    // Create mock provider
    mockProvider = {
      getTransaction: jest.fn(),
      getTransactionReceipt: jest.fn(),
    };

    // Mock ethers.JsonRpcProvider
    jest.spyOn(ethers, 'JsonRpcProvider').mockImplementation(() => mockProvider);

    // Mock ethers.parseUnits
    jest.spyOn(ethers, 'parseUnits').mockReturnValue(BigInt(3000000)); // $0.003 USDC with 6 decimals

    // Create X402Service instance
    cacheService = new CacheService();
    x402Service = new X402Service(cacheService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('verifyPayment', () => {
    const validSignature = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
    const paymentId = 'payment-123';
    const chain = 'base';

    it('should verify valid payment successfully', async () => {
      const mockTx = {
        hash: '0xtx1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        to: mockCollectionAddress,
        value: BigInt(3000000), // $0.003 USDC
      };

      const mockReceipt = {
        status: 1, // Success
      };

      mockProvider.getTransaction.mockResolvedValue(mockTx);
      mockProvider.getTransactionReceipt.mockResolvedValue(mockReceipt);

      const result = await x402Service.verifyPayment(validSignature, paymentId, chain);

      expect(result.valid).toBe(true);
      expect(result.txId).toBe(mockTx.hash);
      expect(result.amount).toBe(mockTx.value);
      expect(mockProvider.getTransaction).toHaveBeenCalledWith(validSignature);
      expect(mockProvider.getTransactionReceipt).toHaveBeenCalledWith(mockTx.hash);
    });

    it('should reject invalid chain', async () => {
      const result = await x402Service.verifyPayment(validSignature, paymentId, 'ethereum');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid chain');
    });

    it('should reject when transaction not found', async () => {
      mockProvider.getTransaction.mockResolvedValue(null);

      const result = await x402Service.verifyPayment(validSignature, paymentId, chain);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Transaction not found');
    });

    it('should reject failed transaction', async () => {
      const mockTx = {
        hash: '0xtx1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        to: mockCollectionAddress,
        value: BigInt(3000000),
      };

      const mockReceipt = {
        status: 0, // Failed
      };

      mockProvider.getTransaction.mockResolvedValue(mockTx);
      mockProvider.getTransactionReceipt.mockResolvedValue(mockReceipt);

      const result = await x402Service.verifyPayment(validSignature, paymentId, chain);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Transaction failed or not confirmed');
    });

    it('should reject when receipt not found', async () => {
      const mockTx = {
        hash: '0xtx1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        to: mockCollectionAddress,
        value: BigInt(3000000),
      };

      mockProvider.getTransaction.mockResolvedValue(mockTx);
      mockProvider.getTransactionReceipt.mockResolvedValue(null);

      const result = await x402Service.verifyPayment(validSignature, paymentId, chain);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Transaction failed or not confirmed');
    });

    it('should reject incorrect recipient', async () => {
      const mockTx = {
        hash: '0xtx1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        to: '0x0000000000000000000000000000000000000000000', // Wrong address
        value: BigInt(3000000),
      };

      const mockReceipt = {
        status: 1,
      };

      mockProvider.getTransaction.mockResolvedValue(mockTx);
      mockProvider.getTransactionReceipt.mockResolvedValue(mockReceipt);

      const result = await x402Service.verifyPayment(validSignature, paymentId, chain);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid payment recipient');
    });

    it('should reject insufficient payment amount', async () => {
      const mockTx = {
        hash: '0xtx1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        to: mockCollectionAddress,
        value: BigInt(2000000), // Only $0.002 USDC, below required
      };

      const mockReceipt = {
        status: 1,
      };

      mockProvider.getTransaction.mockResolvedValue(mockTx);
      mockProvider.getTransactionReceipt.mockResolvedValue(mockReceipt);

      const result = await x402Service.verifyPayment(validSignature, paymentId, chain);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Insufficient payment amount');
    });

    it('should reject duplicate transaction', async () => {
      const mockTx = {
        hash: '0xtx1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        to: mockCollectionAddress,
        value: BigInt(3000000),
      };

      const mockReceipt = {
        status: 1,
      };

      mockProvider.getTransaction.mockResolvedValue(mockTx);
      mockProvider.getTransactionReceipt.mockResolvedValue(mockReceipt);

      // Mock cache to return true (already used)
      (cacheService as any).sismember.mockResolvedValueOnce(true);

      const result = await x402Service.verifyPayment(validSignature, paymentId, chain);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Payment transaction already used');
    });

    it('should add transaction to used set after verification', async () => {
      const mockTx = {
        hash: '0xtx1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        to: mockCollectionAddress,
        value: BigInt(3000000),
      };

      const mockReceipt = {
        status: 1,
      };

      mockProvider.getTransaction.mockResolvedValue(mockTx);
      mockProvider.getTransactionReceipt.mockResolvedValue(mockReceipt);

      await x402Service.verifyPayment(validSignature, paymentId, chain);

      expect((cacheService as any).sadd).toHaveBeenCalled();
    });

    it('should handle provider errors', async () => {
      mockProvider.getTransaction.mockRejectedValue(new Error('Network error'));

      const result = await x402Service.verifyPayment(validSignature, paymentId, chain);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Payment verification failed');
    });
  });

  describe('helper methods', () => {
    it('should return provider', () => {
      const provider = x402Service.getProvider();
      expect(provider).toBeDefined();
      expect(provider).toBe(mockProvider);
    });

    it('should return collection address', () => {
      const address = x402Service.getCollectionAddress();
      expect(address).toBe(mockCollectionAddress);
    });
  });
});
