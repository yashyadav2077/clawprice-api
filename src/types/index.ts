/**
 * Type definitions for ClawPrice API
 */

export interface PriceRequest {
  chainId: number;
  address: string;
}

export interface PriceData {
  price: number;
  marketCap: number;
  volume: number;
  priceChange24h: number;
  cachedAt?: string;
}

export interface PriceResponse {
  price: number;
  marketCap: number;
  volume: number;
  priceChange24h: number;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: string;
  };
}

export interface CacheValue extends PriceData {
  cachedAt: string;
}

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  timeoutMs: number;
  halfOpenMaxCalls: number;
}

export interface X402PaymentVerification {
  signature: string;
  paymentId: string;
  chain: string;
  txId?: string;
}

export interface X402VerificationResult {
  valid: boolean;
  txId?: string;
  amount?: bigint;
  error?: string;
}

export interface ZapperApiResponse {
  price?: number;
  marketCap?: number;
  volume?: number;
  priceChange24h?: number;
  // Additional fields may be added based on actual API response
}

export interface HealthCheckResponse {
  status: 'ok' | 'degraded' | 'down';
  cache: 'connected' | 'disconnected';
  zapper: 'connected' | 'disconnected';
  timestamp: string;
}

export interface MetricsConfig {
  enabled: boolean;
  port?: number;
  path?: string;
}

export interface LogContext {
  requestId?: string;
  userId?: string;
  endpoint?: string;
  method?: string;
  statusCode?: number;
  duration?: number;
  [key: string]: any;
}
