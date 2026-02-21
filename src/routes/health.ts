/**
 * Health check route - GET /health
 */

import { Router, Request, Response } from 'express';
import { ZapperService } from '../services/zapper';
import { HealthCheckResponse } from '../types';

export function createHealthRouter(
  cacheService: any, // Made optional
  zapperService: ZapperService
): Router {
  const router = Router();

  /**
   * GET /health - Health check endpoint
   */
  router.get('/', async (_: Request, res: Response): Promise<void> => {
    // Check cache (if service provided)
    let cacheStatus = 'disconnected';
    if (cacheService && typeof cacheService.checkHealth === 'function') {
      try {
        cacheStatus = await cacheService.checkHealth();
      } catch (error) {
        cacheStatus = 'disconnected';
      }
    }

    // Check Zapper (if service provided)
    let zapperStatus = 'disconnected';
    if (zapperService && typeof zapperService.checkHealth === 'function') {
      try {
        zapperStatus = await zapperService.checkHealth();
      } catch (error) {
        zapperStatus = 'disconnected';
      }
    }

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
