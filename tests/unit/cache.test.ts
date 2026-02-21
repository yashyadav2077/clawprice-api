/**
 * Unit tests for CacheService
 */

import { CacheService } from '../../src/services/cache';

// Mock ioredis
jest.mock('ioredis', () => {
  const mockRedis = {
    get: jest.fn(),
    set: jest.fn(),
    exists: jest.fn(),
    sadd: jest.fn(),
    sismember: jest.fn(),
    del: jest.fn(),
    expire: jest.fn(),
    ttl: jest.fn(),
    ping: jest.fn(),
    quit: jest.fn(),
    on: jest.fn(),
  };

  return {
    __esModule: true,
    default: jest.fn(() => mockRedis),
  };
});

describe('CacheService', () => {
  let cacheService: CacheService;
  let mockRedis: any;

  beforeEach(() => {
    // Get the mock instance
    const RedisMock = require('ioredis').default;
    mockRedis = new RedisMock();
    
    // Reset all mocks
    jest.clearAllMocks();
    
    // Create cache service instance
    cacheService = new CacheService('redis://localhost:6379');
    
    // Simulate connection
    cacheService['isConnected'] = true;
  });

  afterEach(async () => {
    await cacheService.quit();
  });

  describe('get', () => {
    it('should retrieve and parse cached value', async () => {
      const mockData = {
        price: 1.5,
        marketCap: 1000000,
        volume: 50000,
        priceChange24h: 2.5,
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(mockData));

      const result = await cacheService.get('test-key');

      expect(result).toEqual(mockData);
      expect(mockRedis.get).toHaveBeenCalledWith('test-key');
    });

    it('should return null when key does not exist', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await cacheService.get('nonexistent-key');

      expect(result).toBeNull();
    });

    it('should return null on connection error', async () => {
      cacheService['isConnected'] = false;

      const result = await cacheService.get('test-key');

      expect(result).toBeNull();
      expect(mockRedis.get).not.toHaveBeenCalled();
    });

    it('should return null on Redis error', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis error'));

      const result = await cacheService.get('test-key');

      expect(result).toBeNull();
    });

    it('should return null on JSON parse error', async () => {
      mockRedis.get.mockResolvedValue('invalid-json');

      const result = await cacheService.get('test-key');

      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should set value with TTL', async () => {
      const mockData = { price: 1.5 };
      mockRedis.set.mockResolvedValue('OK');

      const result = await cacheService.set('test-key', mockData, 60);

      expect(result).toBe(true);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'test-key',
        JSON.stringify(mockData),
        'EX',
        60
      );
    });

    it('should set value with default TTL', async () => {
      const mockData = { price: 1.5 };
      mockRedis.set.mockResolvedValue('OK');

      const result = await cacheService.set('test-key', mockData);

      expect(result).toBe(true);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'test-key',
        JSON.stringify(mockData),
        'EX',
        60
      );
    });

    it('should return false on connection error', async () => {
      cacheService['isConnected'] = false;

      const result = await cacheService.set('test-key', { price: 1.5 });

      expect(result).toBe(false);
      expect(mockRedis.set).not.toHaveBeenCalled();
    });

    it('should return false on Redis error', async () => {
      mockRedis.set.mockRejectedValue(new Error('Redis error'));

      const result = await cacheService.set('test-key', { price: 1.5 });

      expect(result).toBe(false);
    });
  });

  describe('exists', () => {
    it('should return true when key exists', async () => {
      mockRedis.exists.mockResolvedValue(1);

      const result = await cacheService.exists('test-key');

      expect(result).toBe(true);
    });

    it('should return false when key does not exist', async () => {
      mockRedis.exists.mockResolvedValue(0);

      const result = await cacheService.exists('test-key');

      expect(result).toBe(false);
    });

    it('should return false on connection error', async () => {
      cacheService['isConnected'] = false;

      const result = await cacheService.exists('test-key');

      expect(result).toBe(false);
    });
  });

  describe('sadd and sismember', () => {
    describe('sadd', () => {
      it('should add member to set with TTL', async () => {
        mockRedis.sadd.mockResolvedValue(1);
        mockRedis.ttl.mockResolvedValue(-2); // Key doesn't exist
        mockRedis.expire.mockResolvedValue(1);

        const result = await cacheService.sadd('set-key', 'member-1', 300);

        expect(result).toBe(true);
        expect(mockRedis.sadd).toHaveBeenCalledWith('set-key', 'member-1');
        expect(mockRedis.expire).toHaveBeenCalledWith('set-key', 300);
      });

      it('should not set TTL if key already exists', async () => {
        mockRedis.sadd.mockResolvedValue(1);
        mockRedis.ttl.mockResolvedValue(100); // Key exists with TTL

        const result = await cacheService.sadd('set-key', 'member-1', 300);

        expect(result).toBe(true);
        expect(mockRedis.expire).not.toHaveBeenCalled();
      });

      it('should return false on error', async () => {
        mockRedis.sadd.mockRejectedValue(new Error('Redis error'));

        const result = await cacheService.sadd('set-key', 'member-1');

        expect(result).toBe(false);
      });
    });

    describe('sismember', () => {
      it('should return true when member exists in set', async () => {
        mockRedis.sismember.mockResolvedValue(1);

        const result = await cacheService.sismember('set-key', 'member-1');

        expect(result).toBe(true);
        expect(mockRedis.sismember).toHaveBeenCalledWith('set-key', 'member-1');
      });

      it('should return false when member does not exist', async () => {
        mockRedis.sismember.mockResolvedValue(0);

        const result = await cacheService.sismember('set-key', 'member-1');

        expect(result).toBe(false);
      });

      it('should return false on connection error', async () => {
        cacheService['isConnected'] = false;

        const result = await cacheService.sismember('set-key', 'member-1');

        expect(result).toBe(false);
      });
    });
  });

  describe('del', () => {
    it('should delete key and return true', async () => {
      mockRedis.del.mockResolvedValue(1);

      const result = await cacheService.del('test-key');

      expect(result).toBe(true);
      expect(mockRedis.del).toHaveBeenCalledWith('test-key');
    });

    it('should return false when key does not exist', async () => {
      mockRedis.del.mockResolvedValue(0);

      const result = await cacheService.del('test-key');

      expect(result).toBe(false);
    });

    it('should return false on connection error', async () => {
      cacheService['isConnected'] = false;

      const result = await cacheService.del('test-key');

      expect(result).toBe(false);
    });
  });

  describe('checkHealth', () => {
    it('should return connected when ping succeeds', async () => {
      mockRedis.ping.mockResolvedValue('PONG');

      const result = await cacheService.checkHealth();

      expect(result).toBe('connected');
    });

    it('should return disconnected when ping fails', async () => {
      mockRedis.ping.mockRejectedValue(new Error('Redis error'));

      const result = await cacheService.checkHealth();

      expect(result).toBe('disconnected');
    });

    it('should return disconnected when not connected', async () => {
      cacheService['isConnected'] = false;

      const result = await cacheService.checkHealth();

      expect(result).toBe('disconnected');
    });
  });

  describe('isReady', () => {
    it('should return true when connected', () => {
      cacheService['isConnected'] = true;
      expect(cacheService.isReady()).toBe(true);
    });

    it('should return false when not connected', () => {
      cacheService['isConnected'] = false;
      expect(cacheService.isReady()).toBe(false);
    });
  });

  describe('quit', () => {
    it('should close Redis connection', async () => {
      mockRedis.quit.mockResolvedValue('OK');

      await cacheService.quit();

      expect(mockRedis.quit).toHaveBeenCalled();
      expect(cacheService.isReady()).toBe(false);
    });
  });

  describe('getClient', () => {
    it('should return Redis client', () => {
      const client = cacheService.getClient();

      expect(client).toBe(mockRedis);
    });
  });
});
