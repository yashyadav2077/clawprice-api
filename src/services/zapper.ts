/**
 * Zapper API client with retry and circuit breaker
 */

import axios, { AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';
import { CONSTANTS } from '../utils/constants';
import logger from '../utils/logger';
import { CircuitBreaker } from './circuitBreaker';
import { zapperApiRequestCounter, zapperApiDuration } from '../utils/metrics';
import { ZapperApiResponse, PriceData } from '../types';

export class ZapperService {
  private client: AxiosInstance;
  private circuitBreaker: CircuitBreaker;
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.ZAPPER_API_KEY || '';
    this.baseUrl = process.env.ZAPPER_API_URL || 'https://api.zapper.fi/v2';
    
    if (!this.apiKey) {
      logger.warn('ZAPPER_API_KEY not set, API calls may fail');
    }

    // Create axios instance
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: CONSTANTS.ZAPPER_API_TIMEOUT_MS,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    // Configure retry with exponential backoff
    axiosRetry(this.client, {
      retries: CONSTANTS.ZAPPER_API_MAX_RETRIES,
      retryDelay: (retryCount) => {
        const delay = CONSTANTS.ZAPPER_RETRY_DELAYS[Math.min(retryCount - 1, CONSTANTS.ZAPPER_RETRY_DELAYS.length - 1)];
        logger.info({ retryCount, delay }, 'Retrying Zapper API request');
        return delay;
      },
      retryCondition: (error) => {
        // Retry on network errors, 5xx, and 429 (rate limit)
        if (!error.response) {
          return true; // Network error
        }
        const status = error.response.status;
        return status >= 500 || status === 429;
      },
      onRetry: (retryCount, error, requestConfig) => {
        logger.warn({ 
          retryCount, 
          url: requestConfig.url,
          status: error.response?.status 
        }, 'Zapper API retry');
      },
    });

    // Initialize circuit breaker
    this.circuitBreaker = new CircuitBreaker('zapper_api');
  }

  /**
   * Fetch token price from Zapper API
   */
  async fetchPrice(chainId: number, address: string): Promise<PriceData> {
    const startTime = Date.now();

    try {
      const data = await this.circuitBreaker.execute(async () => {
        // Zapper API endpoint for token price
        // Note: Actual endpoint may need adjustment based on Zapper API documentation
        const response = await this.client.get<ZapperApiResponse>('/price', {
          params: {
            addresses: [address],
            networks: [chainId],
          },
        });

        return response.data;
      });

      // Record success metrics
      const duration = (Date.now() - startTime) / 1000;
      zapperApiRequestCounter.labels({ status: 'success' }).inc();
      zapperApiDuration.observe(duration);

      // Parse Zapper API response to standard format
      const priceData = this.parseZapperResponse(data);
      
      logger.info({ 
        chainId, 
        address, 
        price: priceData.price 
      }, 'Fetched price from Zapper API');

      return priceData;
    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      
      if (this.circuitBreaker.getState() === 'OPEN') {
        zapperApiRequestCounter.labels({ status: 'circuit_breaker' }).inc();
        logger.error({ chainId, address, error: 'Circuit breaker is open' }, 'Zapper API unavailable');
        throw new Error('Service temporarily unavailable');
      } else {
        zapperApiRequestCounter.labels({ status: 'failed' }).inc();
        zapperApiDuration.observe(duration);
        logger.error({ chainId, address, error }, 'Zapper API request failed');
        throw error;
      }
    }
  }

  /**
   * Parse Zapper API response to standard PriceData format
   */
  private parseZapperResponse(data: ZapperApiResponse): PriceData {
    // Zapper API response structure may vary - adjust based on actual API
    // This is a generic parser that can be updated once API endpoint is confirmed
    
    if (!data.price) {
      throw new Error('Price data not found in Zapper API response');
    }

    return {
      price: data.price,
      marketCap: data.marketCap || 0,
      volume: data.volume || 0,
      priceChange24h: data.priceChange24h || 0,
    };
  }

  /**
   * Get circuit breaker state (for health check)
   */
  getCircuitBreakerState(): 'CLOSED' | 'OPEN' | 'HALF_OPEN' {
    return this.circuitBreaker.getState();
  }

  /**
   * Check if Zapper API is available
   */
  async checkHealth(): Promise<'connected' | 'disconnected'> {
    if (this.circuitBreaker.getState() === 'OPEN') {
      return 'disconnected';
    }
    return 'connected';
  }

  /**
   * Reset circuit breaker (for testing or manual recovery)
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
  }

  /**
   * Get circuit breaker instance (for testing)
   */
  getCircuitBreaker(): CircuitBreaker {
    return this.circuitBreaker;
  }
}

export default ZapperService;
