/**
 * Integration tests for price route
 */

import request from 'supertest';
import { createApp } from '../../src/app';
import { CacheService } from '../../src/services/cache';
import { ZapperService } from '../../src/services/zapper';
import { X402Service } from '../../src/services/x402';

// Mock services
jest.mock('../../src/services/cache');
jest.mock('../../src/services/zapper');
jest.mock('../../src/services/x402');

describe('POST /price - Integration Tests', () => {
  let app: any;
  let mockCacheService: jest.Mocked<CacheService>;
  let mockZapperService: jest.Mocked<ZapperService>;
  let mockX402Service: jest.Mocked<X402Service>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mocked services
    mockCacheService = new CacheService() as jest.Mocked<CacheService>;
    mockZapperService = new ZapperService() as jest.Mocked<ZapperService>;
    mockX402Service = new X402Service(mockCacheService) as jest.Mocked<X402Service>;

    // Setup default mocks
    mockCacheService.get.mockResolvedValue(null);
    mockCacheService.set.mockResolvedValue(true);
    mockCacheService.checkHealth.mockResolvedValue('connected');
    
    mockZapperService.fetchPrice.mockResolvedValue({
      price: 1.5,
      marketCap: 1000000,
      volume: 50000,
      priceChange24h: 2.5,
    });
    mockZapperService.checkHealth.mockResolvedValue('connected');

    mockX402Service.verifyPayment.mockResolvedValue({
      valid: true,
      txId: '0xtx123',
      amount: BigInt(3000000),
    });

    // Create app with mocked services
    app = createApp(mockCacheService, mockZapperService, mockX402Service);
  });

  describe('happy path', () => {
    it('should return price data on valid request', async () => {
      const response = await request(app)
        .post('/price')
        .set('X-x402-Signature', '0xsig123')
        .set('X-x402-Payment-Id', 'payment-123')
        .set('X-x402-Chain', 'base')
        .send({
          chainId: 8453,
          address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        price: 1.5,
        marketCap: 1000000,
        volume: 50000,
        priceChange24h: 2.5,
      });

      expect(mockX402Service.verifyPayment).toHaveBeenCalledWith(
        '0xsig123',
        'payment-123',
        'base'
      );
      expect(mockCacheService.get).toHaveBeenCalled();
      expect(mockZapperService.fetchPrice).toHaveBeenCalledWith(8453, '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913');
      expect(mockCacheService.set).toHaveBeenCalled();
    });

    it('should return cached data when available', async () => {
      mockCacheService.get.mockResolvedValue({
        price: 1.0,
        marketCap: 2000000,
        volume: 75000,
        priceChange24h: 1.5,
      });

      const response = await request(app)
        .post('/price')
        .set('X-x402-Signature', '0xsig123')
        .set('X-x402-Payment-Id', 'payment-123')
        .set('X-x402-Chain', 'base')
        .send({
          chainId: 8453,
          address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        price: 1.0,
        marketCap: 2000000,
        volume: 75000,
        priceChange24h: 1.5,
      });

      expect(mockZapperService.fetchPrice).not.toHaveBeenCalled();
    });

    it('should handle uppercase address', async () => {
      const response = await request(app)
        .post('/price')
        .set('X-x402-Signature', '0xsig123')
        .set('X-x402-Payment-Id', 'payment-123')
        .set('X-x402-Chain', 'base')
        .send({
          chainId: 8453,
          address: '0x833589FCD6EDB6E08F4C7C32D4F71B54BDA02913',
        });

      expect(response.status).toBe(200);
      expect(mockZapperService.fetchPrice).toHaveBeenCalledWith(8453, '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913');
    });
  });

  describe('x402 payment verification', () => {
    it('should return 402 when x402 headers missing', async () => {
      const response = await request(app)
        .post('/price')
        .send({
          chainId: 8453,
          address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
        });

      expect(response.status).toBe(402);
      expect(response.body.error.code).toBe('PAYMENT_REQUIRED');
      expect(response.body.error.message).toContain('Payment verification failed');
    });

    it('should return 402 when payment verification fails', async () => {
      mockX402Service.verifyPayment.mockResolvedValue({
        valid: false,
        error: 'Payment verification failed',
      });

      const response = await request(app)
        .post('/price')
        .set('X-x402-Signature', '0xsig123')
        .set('X-x402-Payment-Id', 'payment-123')
        .set('X-x402-Chain', 'base')
        .send({
          chainId: 8453,
          address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
        });

      expect(response.status).toBe(402);
      expect(response.body.error.code).toBe('PAYMENT_INVALID');
      expect(response.body.error.message).toContain('Payment verification failed');
    });

    it('should return 402 when chain is invalid', async () => {
      mockX402Service.verifyPayment.mockResolvedValue({
        valid: false,
        error: 'Invalid chain. Only Base network is supported.',
      });

      const response = await request(app)
        .post('/price')
        .set('X-x402-Signature', '0xsig123')
        .set('X-x402-Payment-Id', 'payment-123')
        .set('X-x402-Chain', 'ethereum')
        .send({
          chainId: 8453,
          address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
        });

      expect(response.status).toBe(402);
    });
  });

  describe('input validation', () => {
    it('should return 400 when chainId is missing', async () => {
      const response = await request(app)
        .post('/price')
        .set('X-x402-Signature', '0xsig123')
        .set('X-x402-Payment-Id', 'payment-123')
        .set('X-x402-Chain', 'base')
        .send({
          address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_CHAIN_ID');
    });

    it('should return 400 when chainId is invalid', async () => {
      const response = await request(app)
        .post('/price')
        .set('X-x402-Signature', '0xsig123')
        .set('X-x402-Payment-Id', 'payment-123')
        .set('X-x402-Chain', 'base')
        .send({
          chainId: -1,
          address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_CHAIN_ID');
    });

    it('should return 400 when address is missing', async () => {
      const response = await request(app)
        .post('/price')
        .set('X-x402-Signature', '0xsig123')
        .set('X-x402-Payment-Id', 'payment-123')
        .set('X-x402-Chain', 'base')
        .send({
          chainId: 8453,
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_ADDRESS');
    });

    it('should return 400 when address is invalid', async () => {
      const response = await request(app)
        .post('/price')
        .set('X-x402-Signature', '0xsig123')
        .set('X-x402-Payment-Id', 'payment-123')
        .set('X-x402-Chain', 'base')
        .send({
          chainId: 8453,
          address: 'invalid-address',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_ADDRESS');
    });

    it('should return 400 when request body is invalid JSON', async () => {
      const response = await request(app)
        .post('/price')
        .set('X-x402-Signature', '0xsig123')
        .set('X-x402-Payment-Id', 'payment-123')
        .set('X-x402-Chain', 'base')
        .set('Content-Type', 'application/json')
        .send('invalid json');

      expect(response.status).toBe(400);
    });
  });

  describe('Zapper API errors', () => {
    it('should return 503 when Zapper API is unavailable (circuit breaker)', async () => {
      mockZapperService.fetchPrice.mockRejectedValue(new Error('Service temporarily unavailable'));

      const response = await request(app)
        .post('/price')
        .set('X-x402-Signature', '0xsig123')
        .set('X-x402-Payment-Id', 'payment-123')
        .set('X-x402-Chain', 'base')
        .send({
          chainId: 8453,
          address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
        });

      expect(response.status).toBe(503);
      expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
    });

    it('should return 404 when token not found', async () => {
      mockZapperService.fetchPrice.mockRejectedValue(new Error('Price data not found'));

      const response = await request(app)
        .post('/price')
        .set('X-x402-Signature', '0xsig123')
        .set('X-x402-Payment-Id', 'payment-123')
        .set('X-x402-Chain', 'base')
        .send({
          chainId: 8453,
          address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
        });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('TOKEN_NOT_FOUND');
    });
  });

  describe('edge cases', () => {
    it('should handle extra fields in request body', async () => {
      const response = await request(app)
        .post('/price')
        .set('X-x402-Signature', '0xsig123')
        .set('X-x402-Payment-Id', 'payment-123')
        .set('X-x402-Chain', 'base')
        .send({
          chainId: 8453,
          address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
          extraField: 'ignored',
        });

      expect(response.status).toBe(200);
    });

    it('should handle max int32 chainId', async () => {
      const response = await request(app)
        .post('/price')
        .set('X-x402-Signature', '0xsig123')
        .set('X-x402-Payment-Id', 'payment-123')
        .set('X-x402-Chain', 'base')
        .send({
          chainId: 2147483647,
          address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
        });

      expect(response.status).toBe(200);
    });
  });
});
