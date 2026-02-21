/**
 * ClawPrice API - Main entry point
 */

import dotenv from 'dotenv';
import { createApp } from './app';
import { CacheService } from './services/cache';
import { ZapperService } from './services/zapper';
import { X402Service } from './services/x402';
import logger from './utils/logger';
import { CONSTANTS } from './utils/constants';

// Load environment variables
dotenv.config();

const PORT = parseInt(process.env.PORT || CONSTANTS.DEFAULT_PORT.toString(), 10);

async function startServer() {
  try {
    logger.info({
      app: CONSTANTS.APP_NAME,
      version: CONSTANTS.APP_VERSION,
      environment: process.env.NODE_ENV || 'development',
    }, 'Starting ClawPrice API');

    // Check for Redis configuration
    const useRedis = !!process.env.REDIS_URL && process.env.REDIS_URL.trim() !== '';
    
    let cacheService: CacheService | null = null;
    if (useRedis) {
      logger.info('Initializing Redis cache service...');
      cacheService = new CacheService();
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          resolve();
        }, 100); // Small delay for connection
      });
    } else {
      logger.warn('REDIS_URL not set - running in degraded mode without cache');
      cacheService = null;
    }

    // Initialize Zapper service
    logger.info('Initializing Zapper API service...');
    const zapperService = new ZapperService();

    // Initialize x402 service
    logger.info('Initializing x402 payment service...');
    const x402Service = new X402Service(cacheService);

    // Create Express app
    const app = createApp(cacheService, zapperService, x402Service);

    // Start HTTP server
    const server = app.listen(PORT, () => {
      logger.info({
        port: PORT,
        environment: process.env.NODE_ENV || 'development',
      }, 'Server started successfully');
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Received shutdown signal');

      server.close(async (err) => {
        if (err) {
          logger.error({ error: err.message }, 'Error closing HTTP server');
          process.exit(1);
        }

        logger.info('HTTP server closed');

        // Close Redis connection
        if (cacheService) {
          await cacheService.quit();
          logger.info('Redis connection closed');
        }

        process.exit(0);
      });
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    return { app, server };
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Failed to start server');
    process.exit(1);
  }
}

startServer();
