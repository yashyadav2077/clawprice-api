/**
 * Circuit Breaker implementation for external service resilience
 */

import { CircuitBreakerState, CircuitBreakerConfig } from '../types';
import { CONSTANTS } from '../utils/constants';
import logger from '../utils/logger';
import { circuitBreakerState, circuitBreakerFailures } from '../utils/metrics';

export class CircuitBreaker {
  private state: CircuitBreakerState = 'CLOSED';
  private failureCount = 0;
  private halfOpenCalls = 0;
  private lastFailureTime: number = 0;
  private config: CircuitBreakerConfig;

  constructor(
    private serviceName: string,
    config?: Partial<CircuitBreakerConfig>
  ) {
    this.config = {
      failureThreshold: config?.failureThreshold ?? CONSTANTS.CIRCUIT_BREAKER_FAILURE_THRESHOLD,
      timeoutMs: config?.timeoutMs ?? CONSTANTS.CIRCUIT_BREAKER_TIMEOUT_MS,
      halfOpenMaxCalls: config?.halfOpenMaxCalls ?? CONSTANTS.CIRCUIT_BREAKER_HALF_OPEN_MAX_CALLS,
    };
    
    // Initialize metric
    this.updateMetrics();
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (this.shouldAttemptReset()) {
        this.transitionToHalfOpen();
      } else {
        circuitBreakerFailures.labels({ service: this.serviceName }).inc();
        throw new Error(`Circuit breaker is OPEN for ${this.serviceName}`);
      }
    }

    // Track calls in HALF_OPEN state
    if (this.state === 'HALF_OPEN') {
      this.halfOpenCalls++;
      if (this.halfOpenCalls > this.config.halfOpenMaxCalls) {
        circuitBreakerFailures.labels({ service: this.serviceName }).inc();
        throw new Error(`Circuit breaker is OPEN for ${this.serviceName}`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Check if enough time has passed to attempt reset
   */
  private shouldAttemptReset(): boolean {
    const now = Date.now();
    return now - this.lastFailureTime >= this.config.timeoutMs;
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.failureCount = 0;
    this.halfOpenCalls = 0;

    if (this.state === 'HALF_OPEN') {
      this.transitionToClosed();
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      this.transitionToOpen();
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.transitionToOpen();
    }
  }

  /**
   * Transition to OPEN state
   */
  private transitionToOpen(): void {
    const previousState = this.state;
    this.state = 'OPEN';
    this.halfOpenCalls = 0;
    this.updateMetrics();
    logger.warn(
      { service: this.serviceName, previousState, failureCount: this.failureCount },
      'Circuit breaker transitioned to OPEN'
    );
  }

  /**
   * Transition to CLOSED state
   */
  private transitionToClosed(): void {
    const previousState = this.state;
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.halfOpenCalls = 0;
    this.updateMetrics();
    logger.info(
      { service: this.serviceName, previousState },
      'Circuit breaker transitioned to CLOSED'
    );
  }

  /**
   * Transition to HALF_OPEN state
   */
  private transitionToHalfOpen(): void {
    const previousState = this.state;
    this.state = 'HALF_OPEN';
    this.halfOpenCalls = 0;
    this.updateMetrics();
    logger.info(
      { service: this.serviceName, previousState },
      'Circuit breaker transitioned to HALF_OPEN'
    );
  }

  /**
   * Update Prometheus metrics
   */
  private updateMetrics(): void {
    const stateValue = this.state === 'CLOSED' ? 0 : this.state === 'OPEN' ? 1 : 2;
    circuitBreakerState.set({ service: this.serviceName }, stateValue);
  }

  /**
   * Get current state
   */
  getState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * Get failure count
   */
  getFailureCount(): number {
    return this.failureCount;
  }

  /**
   * Reset circuit breaker to CLOSED state
   */
  reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.halfOpenCalls = 0;
    this.lastFailureTime = 0;
    this.updateMetrics();
    logger.info({ service: this.serviceName }, 'Circuit breaker manually reset');
  }
}
