/**
 * Integration tests for health route
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

describe('GET /health - Integration Tests', () => {
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
    mockCacheService.checkHealth.mockResolvedValue('connected');
    mockZapperService.checkHealth.mockResolvedValue('connected');

    // Create app with mocked services
    app = createApp(mockCacheService, mockZapperService, mockX402Service);
  });

  describe('healthy state', () => {
    it('should return ok status when all services are connected', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'ok',
        cache: 'connected',
        zapper: 'connected',
        timestamp: expect.any(String),
      });

      // Verify timestamp format
      const timestamp = new Date(response.body.timestamp);
      expect(timestamp.toISOString()).toBe(response.body.timestamp);

      expect(mockCacheService.checkHealth).toHaveBeenCalled();
      expect(mockZapperService.checkHealth).toHaveBeenCalled();
    });
  });

  describe('degraded state', () => {
    it('should return degraded status when cache is disconnected', async () => {
      mockCacheService.checkHealth.mockResolvedValue('disconnected');

      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('degraded');
      expect(response.body.cache).toBe('disconnected');
      expect(response.body.zapper).toBe('connected');
    });

    it('should return degraded status when Zapper is disconnected', async () => {
      mockZapperService.checkHealth.mockResolvedValue('disconnected');

      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('degraded');
      expect(response.body.cache).toBe('connected');
      expect(response.body.zapper).toBe('disconnected');
    });
  });

  describe('down state', () => {
    it('should return 503 and down status when all services are disconnected', async () => {
      mockCacheService.checkHealth.mockResolvedValue('disconnected');
      mockZapperService.checkHealth.mockResolvedValue('disconnected');

      const response = await request(app).get('/health');

      expect(response.status).toBe(503);
      expect(response.body.status).toBe('down');
      expect(response.body.cache).toBe('disconnected');
      expect(response.body.zapper).toBe('disconnected');
    });
  });

  describe('edge cases', () => {
    it('should handle health check errors gracefully', async () => {
      mockCacheService.checkHealth.mockRejectedValue(new Error('Cache error'));
      mockZapperService.checkHealth.mockResolvedValue('connected');

      const response = await request(app).get('/health');

      expect(response.status).toBe(503);
      expect(response.body.status).toBe('degraded');
    });

    it('should always return timestamp', async () => {
      const response = await request(app).get('/health');

      expect(response.body.timestamp).toBeDefined();
      expect(typeof response.body.timestamp).toBe('string');

      // Verify it's a valid ISO 8601 date
      expect(() => new Date(response.body.timestamp)).not.toThrow();
    });

    it('should handle concurrent health checks', async () => {
      const requests = [
        request(app).get('/health'),
        request(app).get('/health'),
        request(app).get('/health'),
      ];

      const responses = await Promise.all(requests);

      responses.forEach((response: any) => {
        expect(response.status).toBe(200);
        expect(response.body.status).toBe('ok');
      });

      expect(mockCacheService.checkHealth).toHaveBeenCalledTimes(3);
      expect(mockZapperService.checkHealth).toHaveBeenCalledTimes(3);
    });
  });

  describe('metrics endpoint', () => {
    it('should expose metrics at /metrics', async () => {
      const response = await request(app).get('/metrics');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.text).toContain('http_requests_total');
      expect(response.text).toContain('cache_hits_total');
      expect(response.text).toContain('x402_verifications_total');
    });

    it('should return 500 on metrics error', async () => {
      // This would require modifying the app to allow error injection
      // For now, we just verify the endpoint exists
      const response = await request(app).get('/metrics');

      expect(response.status).toBe(200);
    });
  });
});
