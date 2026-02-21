/**
 * Redis cache service
 */

import Redis from 'ioredis';
import { CONSTANTS } from '../utils/constants';
import logger from '../utils/logger';

export class CacheService {
  private client: Redis | null = null;
  private isConnected = false;

  constructor(redisUrl?: string) {
    const url = redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';
    this.client = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this.setupEventHandlers();
  }

  /**
   * Set up Redis client event handlers
   */
  private setupEventHandlers(): void {
    if (!this.client) return;

    this.client.on('connect', () => {
      this.isConnected = true;
      logger.info('Redis client connected');
    });

    this.client.on('ready', () => {
      this.isConnected = true;
      logger.info('Redis client ready');
    });

    this.client.on('error', (err) => {
      this.isConnected = false;
      logger.error({ error: err.message }, 'Redis client error');
    });

    this.client.on('close', () => {
      this.isConnected = false;
      logger.warn('Redis client connection closed');
    });

    this.client.on('reconnecting', () => {
      this.isConnected = false;
      logger.info('Redis client reconnecting');
    });
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      if (!this.client || !this.isConnected) {
        logger.warn({ key }, 'Cache get failed: Redis not connected');
        return null;
      }

      const value = await this.client.get(key);
      if (!value) {
        return null;
      }

      try {
        return JSON.parse(value) as T;
      } catch (error) {
        logger.error({ key, error: 'Failed to parse cache value' }, 'Cache parse error');
        return null;
      }
    } catch (error) {
      logger.error({ key, error }, 'Cache get error');
      return null;
    }
  }

  /**
   * Set value in cache with TTL
   */
  async set(key: string, value: any, ttlSeconds?: number): Promise<boolean> {
    try {
      if (!this.client || !this.isConnected) {
        logger.warn({ key }, 'Cache set failed: Redis not connected');
        return false;
      }

      const serialized = JSON.stringify(value);
      const ttl = ttlSeconds ?? CONSTANTS.CACHE_TTL_SECONDS;

      await this.client.set(key, serialized, 'EX', ttl);
      return true;
    } catch (error) {
      logger.error({ key, error }, 'Cache set error');
      return false;
    }
  }

  /**
   * Check if key exists in cache
   */
  async exists(key: string): Promise<boolean> {
    try {
      if (!this.client || !this.isConnected) {
        return false;
      }

      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error({ key, error }, 'Cache exists error');
      return false;
    }
  }

  /**
   * Add value to a set (for deduplication)
   */
  async sadd(key: string, member: string, ttlSeconds?: number): Promise<boolean> {
    try {
      if (!this.client || !this.isConnected) {
        return false;
      }

      await this.client.sadd(key, member);
      
      // Set TTL on first add
      if (ttlSeconds) {
        const ttl = await this.client.ttl(key);
        if (ttl === -1 || ttl === -2) {
          await this.client.expire(key, ttlSeconds);
        }
      }
      
      return true;
    } catch (error) {
      logger.error({ key, member, error }, 'Cache sadd error');
      return false;
    }
  }

  /**
   * Check if member exists in set
   */
  async sismember(key: string, member: string): Promise<boolean> {
    try {
      if (!this.client || !this.isConnected) {
        return false;
      }

      const result = await this.client.sismember(key, member);
      return result === 1;
    } catch (error) {
      logger.error({ key, member, error }, 'Cache sismember error');
      return false;
    }
  }

  /**
   * Delete key from cache
   */
  async del(key: string): Promise<boolean> {
    try {
      if (!this.client || !this.isConnected) {
        return false;
      }

      const result = await this.client.del(key);
      return result > 0;
    } catch (error) {
      logger.error({ key, error }, 'Cache del error');
      return false;
    }
  }

  /**
   * Check if Redis is connected
   */
  isReady(): boolean {
    return this.isConnected;
  }

  /**
   * Get Redis connection status for health check
   */
  async checkHealth(): Promise<'connected' | 'disconnected'> {
    try {
      if (!this.client || !this.isConnected) {
        return 'disconnected';
      }

      await this.client.ping();
      return 'connected';
    } catch (error) {
      return 'disconnected';
    }
  }

  /**
   * Close Redis connection
   */
  async quit(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.isConnected = false;
      logger.info('Redis client disconnected');
    }
  }

  /**
   * Get underlying Redis client (for advanced use cases)
   */
  getClient(): Redis | null {
    return this.client;
  }
}

export default CacheService;
