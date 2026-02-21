/**
 * Express app configuration
 */

import express, { Application } from 'express';
import { CacheService } from './services/cache';
import { ZapperService } from './services/zapper';
import { X402Service } from './services/x402';
import { createX402Middleware } from './middleware/x402';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { createPriceRouter } from './routes/price';
import { createHealthRouter } from './routes/health';
import { getMetrics } from './utils/metrics';
import { CONSTANTS } from './utils/constants';

export function createApp(
  cacheService: CacheService | null,
  zapperService: ZapperService,
  x402Service: X402Service
): Application {
  const app = express();

  // Body parser with size limit
  app.use(express.json({ limit: CONSTANTS.MAX_REQUEST_SIZE }));

  // Request logger middleware
  app.use(requestLogger);

  // Health check route (no x402 required)
  const healthRouter = createHealthRouter(cacheService, zapperService);
  app.use('/health', healthRouter);

  // Metrics endpoint (no x402 required)
  app.get('/metrics', async (_, res) => {
    try {
      res.set('Content-Type', 'text/plain');
      res.send(await getMetrics());
    } catch (error) {
      res.status(500).send('Error generating metrics');
    }
  });

  // x402 middleware for protected routes
  const x402Middleware = createX402Middleware(x402Service);

  // Price route (protected by x402)
  const priceRouter = createPriceRouter(cacheService, zapperService);
  app.use('/price', x402Middleware, priceRouter);

  // 404 handler
  app.use(notFoundHandler);

  // Global error handler
  app.use(errorHandler);

  return app;
}

export default createApp;
