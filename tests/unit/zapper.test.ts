/**
 * Unit tests for ZapperService
 */

import axios from 'axios';
import axiosRetry from 'axios-retry';
import { ZapperService } from '../../src/services/zapper';

// Mock axios-retry
jest.mock('axios-retry');

describe('ZapperService', () => {
  let zapperService: ZapperService;
  let mockAxiosInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock axios instance
    mockAxiosInstance = {
      get: jest.fn(),
      defaults: {
        timeout: 3000,
      },
    };

    // Mock axios.create to return our mock instance
    jest.spyOn(axios, 'create').mockReturnValue(mockAxiosInstance as any);

    // Set required environment variable
    process.env.ZAPPER_API_KEY = 'test-api-key';
    process.env.ZAPPER_API_URL = 'https://api.zapper.fi/v2';

    // Create service
    zapperService = new ZapperService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create axios instance with correct config', () => {
      expect(axios.create).toHaveBeenCalledWith({
        baseURL: 'https://api.zapper.fi/v2',
        timeout: 3000,
        headers: {
          'Authorization': 'Bearer test-api-key',
          'Content-Type': 'application/json',
        },
      });
    });

    it('should configure axios-retry', () => {
      expect(axiosRetry).toHaveBeenCalledWith(mockAxiosInstance, expect.any(Object));
    });
  });

  describe('fetchPrice', () => {
    const chainId = 8453;
    const address = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';

    beforeEach(() => {
      // Mock successful response
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          price: 1.5,
          marketCap: 1000000,
          volume: 50000,
          priceChange24h: 2.5,
        },
      });
    });

    it('should fetch price successfully', async () => {
      const result = await zapperService.fetchPrice(chainId, address);

      expect(result).toEqual({
        price: 1.5,
        marketCap: 1000000,
        volume: 50000,
        priceChange24h: 2.5,
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/price', {
        params: {
          addresses: [address],
          networks: [chainId],
        },
      });
    });

    it('should handle API with different response structure', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          price: 2.0,
          // marketCap missing
          volume: 100000,
          // priceChange24h missing
        },
      });

      const result = await zapperService.fetchPrice(chainId, address);

      expect(result).toEqual({
        price: 2.0,
        marketCap: 0,
        volume: 100000,
        priceChange24h: 0,
      });
    });

    it('should throw error when price not in response', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          marketCap: 1000000,
          // price missing
        },
      });

      await expect(zapperService.fetchPrice(chainId, address)).rejects.toThrow('Price data not found');
    });

    it('should handle network errors', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Network error'));

      await expect(zapperService.fetchPrice(chainId, address)).rejects.toThrow('Network error');
    });

    it('should handle HTTP errors', async () => {
      // Reset circuit breaker to CLOSED for this test
      const circuitBreaker = (zapperService as any).circuitBreaker;
      circuitBreaker.state = 'CLOSED';
      circuitBreaker.failureCount = 0;

      const httpError = {
        response: {
          status: 404,
          data: { message: 'Not found' },
        },
      };
      const error = new Error('HTTP 404');
      (error as any).response = httpError.response;
      mockAxiosInstance.get.mockRejectedValue(error);

      await expect(zapperService.fetchPrice(chainId, address)).rejects.toThrow();
    });

    it('should handle rate limiting (429)', async () => {
      // Reset circuit breaker to CLOSED for this test
      const circuitBreaker = (zapperService as any).circuitBreaker;
      circuitBreaker.state = 'CLOSED';
      circuitBreaker.failureCount = 0;

      // Mock rate limit response
      const rateLimitError = {
        response: {
          status: 429,
        },
      };
      const error = new Error('HTTP 429');
      (error as any).response = rateLimitError.response;
      mockAxiosInstance.get.mockRejectedValue(error);

      await expect(zapperService.fetchPrice(chainId, address)).rejects.toThrow();
    });
  });

  describe('circuit breaker integration', () => {
    const chainId = 8453;
    const address = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';

    it('should open circuit breaker after threshold failures', async () => {
      // Mock 5 consecutive failures
      mockAxiosInstance.get.mockRejectedValue(new Error('API error'));

      for (let i = 0; i < 5; i++) {
        try {
          await zapperService.fetchPrice(chainId, address);
        } catch (error) {
          // Expected to fail
        }
      }

      // Circuit breaker should be OPEN
      const state = zapperService.getCircuitBreakerState();
      expect(state).toBe('OPEN');
    });

    it('should throw service unavailable error when circuit open', async () => {
      // Open the circuit breaker
      const circuitBreaker = (zapperService as any).circuitBreaker;
      circuitBreaker.state = 'OPEN';

      await expect(zapperService.fetchPrice(chainId, address)).rejects.toThrow('Service temporarily unavailable');
    });

    it('should allow requests when circuit is closed', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          price: 1.0,
          marketCap: 1000000,
          volume: 50000,
          priceChange24h: 0,
        },
      });

      const result = await zapperService.fetchPrice(chainId, address);

      expect(result).toEqual({
        price: 1.0,
        marketCap: 1000000,
        volume: 50000,
        priceChange24h: 0,
      });
    });
  });

  describe('checkHealth', () => {
    it('should return connected when circuit is closed', () => {
      const circuitBreaker = (zapperService as any).circuitBreaker;
      circuitBreaker.state = 'CLOSED';

      return zapperService.checkHealth().then(status => {
        expect(status).toBe('connected');
      });
    });

    it('should return disconnected when circuit is open', async () => {
      const circuitBreaker = (zapperService as any).circuitBreaker;
      circuitBreaker.state = 'OPEN';

      const status = await zapperService.checkHealth();
      expect(status).toBe('disconnected');
    });
  });

  describe('getCircuitBreakerState', () => {
    it('should return current circuit breaker state', () => {
      const state = zapperService.getCircuitBreakerState();
      expect(['CLOSED', 'OPEN', 'HALF_OPEN']).toContain(state);
    });
  });

  describe('resetCircuitBreaker', () => {
    it('should reset circuit breaker', () => {
      const circuitBreaker = (zapperService as any).circuitBreaker;
      circuitBreaker.state = 'OPEN';
      circuitBreaker.failureCount = 10;

      zapperService.resetCircuitBreaker();

      expect(circuitBreaker.state).toBe('CLOSED');
      expect(circuitBreaker.failureCount).toBe(0);
    });
  });

  describe('getCircuitBreaker', () => {
    it('should return circuit breaker instance', () => {
      const cb = zapperService.getCircuitBreaker();
      expect(cb).toBeDefined();
      expect(cb).toBe((zapperService as any).circuitBreaker);
    });
  });
});
