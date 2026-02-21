/**
 * Health check route - GET /health
 */

import { Router, Request, Response } from 'express';
import { CacheService } from '../services/cache';
import { ZapperService } from '../services/zapper';
import { HealthCheckResponse } from '../types';

export function createHealthRouter(
  cacheService: CacheService,
  zapperService: ZapperService
): Router {
  const router = Router();

  /**
   * GET /health - Health check endpoint
   */
  router.get('/', async (_: Request, res: Response): Promise<void> => {
    const cacheStatus = await cacheService.checkHealth();
    const zapperStatus = await zapperService.checkHealth();

    // Determine overall status
    let overallStatus: HealthCheckResponse['status'] = 'ok';
    if (cacheStatus === 'disconnected' && zapperStatus === 'disconnected') {
      overallStatus = 'down';
    } else if (cacheStatus === 'disconnected' || zapperStatus === 'disconnected') {
      overallStatus = 'degraded';
    }

    const response: HealthCheckResponse = {
      status: overallStatus,
      cache: cacheStatus,
      zapper: zapperStatus,
      timestamp: new Date().toISOString(),
    };

    const statusCode = overallStatus === 'down' ? 503 : 200;
    res.status(statusCode).json(response);
  });

  return router;
}

export default createHealthRouter;
