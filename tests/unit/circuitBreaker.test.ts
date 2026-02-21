/**
 * Unit tests for CircuitBreaker
 */

import { CircuitBreaker } from '../../src/services/circuitBreaker';
import { resetMetrics } from '../../src/utils/metrics';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker('test-service', {
      failureThreshold: 3,
      timeoutMs: 1000,
      halfOpenMaxCalls: 2,
    });
    resetMetrics();
  });

  afterEach(() => {
    circuitBreaker.reset();
  });

  describe('initial state', () => {
    it('should start in CLOSED state', () => {
      expect(circuitBreaker.getState()).toBe('CLOSED');
    });

    it('should have zero failures', () => {
      expect(circuitBreaker.getFailureCount()).toBe(0);
    });
  });

  describe('successful execution', () => {
    it('should execute function successfully', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await circuitBreaker.execute(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should remain in CLOSED state after success', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      await circuitBreaker.execute(fn);

      expect(circuitBreaker.getState()).toBe('CLOSED');
    });

    it('should reset failure count after success', async () => {
      const failFn = jest.fn().mockRejectedValue(new Error('fail'));
      
      // Fail twice
      for (let i = 0; i < 2; i++) {
        try {
          await circuitBreaker.execute(failFn);
        } catch (error) {
          // Expected
        }
      }

      expect(circuitBreaker.getFailureCount()).toBe(2);

      // Succeed
      const successFn = jest.fn().mockResolvedValue('success');
      await circuitBreaker.execute(successFn);

      expect(circuitBreaker.getFailureCount()).toBe(0);
    });
  });

  describe('failure handling', () => {
    it('should throw error when function fails', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      await expect(circuitBreaker.execute(fn)).rejects.toThrow('fail');
    });

    it('should increment failure count on failure', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      for (let i = 0; i < 2; i++) {
        try {
          await circuitBreaker.execute(fn);
        } catch (error) {
          // Expected
        }
      }

      expect(circuitBreaker.getFailureCount()).toBe(2);
    });

    it('should not transition to OPEN until threshold is reached', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      for (let i = 0; i < 2; i++) {
        try {
          await circuitBreaker.execute(fn);
        } catch (error) {
          // Expected
        }
      }

      expect(circuitBreaker.getState()).toBe('CLOSED');
    });

    it('should transition to OPEN after threshold failures', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(fn);
        } catch (error) {
          // Expected
        }
      }

      expect(circuitBreaker.getState()).toBe('OPEN');
    });
  });

  describe('OPEN state behavior', () => {
    it('should reject immediately when OPEN', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(fn);
        } catch (error) {
          // Expected
        }
      }

      expect(circuitBreaker.getState()).toBe('OPEN');

      // Try to execute while OPEN
      await expect(circuitBreaker.execute(fn)).rejects.toThrow('Circuit breaker is OPEN');
      expect(fn).toHaveBeenCalledTimes(3); // Not called again
    });

    it('should transition to HALF_OPEN after timeout', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(fn);
        } catch (error) {
          // Expected
        }
      }

      expect(circuitBreaker.getState()).toBe('OPEN');

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Next call should transition to HALF_OPEN
      try {
        await circuitBreaker.execute(fn);
      } catch (error) {
        // Expected
      }

      expect(circuitBreaker.getState()).toBe('HALF_OPEN');
    });
  });

  describe('HALF_OPEN state behavior', () => {
    beforeEach(async () => {
      const failFn = jest.fn().mockRejectedValue(new Error('fail'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failFn);
        } catch (error) {
          // Expected
        }
      }

      // Wait for timeout and transition to HALF_OPEN
      await new Promise(resolve => setTimeout(resolve, 1100));
      try {
        await circuitBreaker.execute(failFn);
      } catch (error) {
        // Expected
      }
    });

    it('should transition to CLOSED on success', async () => {
      expect(circuitBreaker.getState()).toBe('HALF_OPEN');

      const successFn = jest.fn().mockResolvedValue('success');
      await circuitBreaker.execute(successFn);

      expect(circuitBreaker.getState()).toBe('CLOSED');
    });

    it('should transition back to OPEN on failure', async () => {
      expect(circuitBreaker.getState()).toBe('HALF_OPEN');

      const failFn = jest.fn().mockRejectedValue(new Error('fail'));
      try {
        await circuitBreaker.execute(failFn);
      } catch (error) {
        // Expected
      }

      expect(circuitBreaker.getState()).toBe('OPEN');
    });
  });

  describe('reset', () => {
    it('should reset to CLOSED state', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(fn);
        } catch (error) {
          // Expected
        }
      }

      expect(circuitBreaker.getState()).toBe('OPEN');

      circuitBreaker.reset();

      expect(circuitBreaker.getState()).toBe('CLOSED');
      expect(circuitBreaker.getFailureCount()).toBe(0);
    });
  });

  describe('async function execution', () => {
    it('should handle async functions', async () => {
      const fn = jest.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'async-result';
      });

      const result = await circuitBreaker.execute(fn);

      expect(result).toBe('async-result');
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });
});
