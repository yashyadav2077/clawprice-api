/**
 * Prometheus metrics configuration and tracking
 */

import promClient from 'prom-client';

// Enable default metrics (Node.js runtime metrics)
promClient.collectDefaultMetrics();

// Create a custom registry for application-specific metrics
const register = new promClient.Registry();

// HTTP Request Counter
export const httpRequestCounter = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status_code'],
  registers: [register],
});

// HTTP Request Duration Histogram
export const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

// Cache Hit Counter
export const cacheHitCounter = new promClient.Counter({
  name: 'cache_hits_total',
  help: 'Total number of cache hits',
  registers: [register],
});

// Cache Miss Counter
export const cacheMissCounter = new promClient.Counter({
  name: 'cache_misses_total',
  help: 'Total number of cache misses',
  registers: [register],
});

// x402 Verification Counter
export const x402VerificationCounter = new promClient.Counter({
  name: 'x402_verifications_total',
  help: 'Total number of x402 payment verifications',
  labelNames: ['status'], // 'success' or 'failed'
  registers: [register],
});

// Zapper API Request Counter
export const zapperApiRequestCounter = new promClient.Counter({
  name: 'zapper_api_requests_total',
  help: 'Total number of Zapper API requests',
  labelNames: ['status'], // 'success', 'failed', 'circuit_breaker'
  registers: [register],
});

// Zapper API Duration Histogram
export const zapperApiDuration = new promClient.Histogram({
  name: 'zapper_api_duration_seconds',
  help: 'Zapper API request duration in seconds',
  buckets: [0.1, 0.2, 0.5, 1, 2, 5],
  registers: [register],
});

// Circuit Breaker State Gauge
export const circuitBreakerState = new promClient.Gauge({
  name: 'circuit_breaker_state',
  help: 'Circuit breaker current state (0=CLOSED, 1=OPEN, 2=HALF_OPEN)',
  labelNames: ['service'],
  registers: [register],
});

// Circuit Breaker Failure Counter
export const circuitBreakerFailures = new promClient.Counter({
  name: 'circuit_breaker_failures_total',
  help: 'Total number of circuit breaker failures',
  labelNames: ['service'],
  registers: [register],
});

/**
 * Get metrics in Prometheus format
 */
export function getMetrics(): Promise<string> {
  return register.metrics();
}

/**
 * Reset all metrics (useful for testing)
 */
export function resetMetrics(): void {
  register.resetMetrics();
}

export default {
  httpRequestCounter,
  httpRequestDuration,
  cacheHitCounter,
  cacheMissCounter,
  x402VerificationCounter,
  zapperApiRequestCounter,
  zapperApiDuration,
  circuitBreakerState,
  circuitBreakerFailures,
  getMetrics,
  resetMetrics,
  register,
};
