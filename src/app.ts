/**
 * Express app configuration
 */

import express, { Application } from 'express';
import { CacheService } from './services/cache';
import { ZapperService } from './services/zapper';
import { X402Service } from './services/x402';
import { createX402Middleware } from './middleware/x402';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';
import { createPriceRouter } from './routes/price';
import { createHealthRouter } from './routes/health';
import { getMetrics } from './utils/metrics';
import { CONSTANTS } from './utils/constants';

export interface AppConfig {
  cacheService?: CacheService;
  zapperService: ZapperService;
  x402Service: X402Service;
}

export function createApp(
  cacheService: CacheService | null = null,
  zapperService: ZapperService | null = null,
  x402Service: X402Service | null = null
): Application {
  const app = express();

  // Body parser with size limit
  app.use(express.json({ limit: CONSTANTS.MAX_REQUEST_SIZE }));

  // Request logger middleware
  app.use(requestLogger);

  // Metrics middleware
  const metricsService = {
    getMiddleware: () => async (req: any, res: any, next: any) => {
      // Request counting middleware
      next();
    }
  };

  app.use(metricsService.getMiddleware());

  // Health check route
  const healthRouter = createHealthRouter(cacheService, zapperService);
  app.use('/health', healthRouter);

  // Price route (requires x402)
  if (x402Service) {
    const x402Middleware = createX402Middleware(x402Service);
    const priceRouter = createPriceRouter(cacheService, zapperService);
    app.use('/price', x402Middleware, priceRouter);
  }

  // Metrics endpoint
  app.get('/metrics', async (req: any, res: any) => {
    try {
      res.set('Content-Type', 'text/plain');
      res.send(await getMetrics());
    } catch (error) {
      res.status(500).send('Error generating metrics');
    }
  });

  // Error handling
  app.use(errorHandler);

  // 404 handler
  app.use((req: any, res: any) => {
    res.status(404).json({
      error: {
        code: CONSTANTS.ERROR_CODES.NOT_FOUND,
        message: 'Route not found',
        details: `Route ${req.method} ${req.path} not found`,
      },
    });
  });

  return app;
}
