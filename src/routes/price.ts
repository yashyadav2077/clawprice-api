/**
 * Price route - POST /price
 */

import { Router, Request, Response, NextFunction } from 'express';
import { validatePriceRequest, createPriceRequest } from '../utils/validator';
import { CONSTANTS } from '../utils/constants';
import { CacheService } from '../services/cache';
import { ZapperService } from '../services/zapper';
import { cacheHitCounter, cacheMissCounter } from '../utils/metrics';
import { PriceRequest, PriceResponse, PriceData } from '../types';
import { AppError } from '../middleware/errorHandler';

export function createPriceRouter(
  cacheService: CacheService,
  zapperService: ZapperService
): Router {
  const router = Router();

  /**
   * POST /price - Get token price
   */
  router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Validate request body
      const validation = validatePriceRequest(req.body);
      if (!validation.valid) {
        throw new AppError(
          validation.error!.code,
          CONSTANTS.HTTP_STATUS.BAD_REQUEST,
          validation.error!.message,
          validation.error!.details
        );
      }

      const request: PriceRequest = createPriceRequest(req.body);
      const cacheKey = CONSTANTS.CACHE_KEY_PRICE(request.chainId, request.address);

      // Try to get from cache
      const cachedData = await cacheService.get<PriceData>(cacheKey);
      
      if (cachedData) {
        cacheHitCounter.inc();
        (req as any).log?.info({ chainId: request.chainId, address: request.address }, 'Cache hit');
        
        const response: PriceResponse = {
          price: cachedData.price,
          marketCap: cachedData.marketCap,
          volume: cachedData.volume,
          priceChange24h: cachedData.priceChange24h,
        };
        
        res.json(response);
        return;
      }

      // Cache miss - fetch from Zapper
      cacheMissCounter.inc();
      (req as any).log?.info({ chainId: request.chainId, address: request.address }, 'Cache miss, fetching from Zapper');

      try {
        const priceData = await zapperService.fetchPrice(request.chainId, request.address);

        // Store in cache
        await cacheService.set(cacheKey, priceData, CONSTANTS.CACHE_TTL_SECONDS);

        const response: PriceResponse = {
          price: priceData.price,
          marketCap: priceData.marketCap,
          volume: priceData.volume,
          priceChange24h: priceData.priceChange24h,
        };

        res.json(response);
      } catch (error) {
        // If Zapper fails, check if we have expired cache data to return
        if (cachedData) {
          (req as any).log?.warn('Zapper API failed, returning expired cache data');
          
          const response: PriceResponse = {
            price: (cachedData as any).price || 0,
            marketCap: (cachedData as any).marketCap || 0,
            volume: (cachedData as any).volume || 0,
            priceChange24h: (cachedData as any).priceChange24h || 0,
          };
          
          res.json(response);
          return;
        }

        // No cache available, propagate error
        throw error;
      }
    } catch (error) {
      // Handle specific errors
      if (error instanceof Error) {
        if (error.message.includes('Service temporarily unavailable')) {
          throw new AppError(
            CONSTANTS.ERROR_CODES.SERVICE_UNAVAILABLE,
            CONSTANTS.HTTP_STATUS.SERVICE_UNAVAILABLE,
            'Service temporarily unavailable',
            'Zapper API is unreachable'
          );
        }
        if (error.message.includes('Price data not found')) {
          throw new AppError(
            CONSTANTS.ERROR_CODES.TOKEN_NOT_FOUND,
            CONSTANTS.HTTP_STATUS.NOT_FOUND,
            'Token not found',
            `Token address not found on chain ${req.body.chainId}`
          );
        }
      }
      next(error);
    }
  });

  return router;
}

export default createPriceRouter;
