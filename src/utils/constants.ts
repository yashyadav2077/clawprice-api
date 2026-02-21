/**
 * Application constants
 */

export const CONSTANTS = {
  // Cache Configuration
  CACHE_TTL_SECONDS: 60,
  CACHED_TX_TTL_SECONDS: 300,
  
  // x402 Payment Configuration
  PRICE_PER_CALL_USDC: 0.003,
  BASE_CHAIN_ID: 8453,
  USDC_DECIMALS: 6,
  
  // Circuit Breaker Configuration
  CIRCUIT_BREAKER_FAILURE_THRESHOLD: 5,
  CIRCUIT_BREAKER_TIMEOUT_MS: 60000,
  CIRCUIT_BREAKER_HALF_OPEN_MAX_CALLS: 1,
  
  // Zapper API Configuration
  ZAPPER_API_TIMEOUT_MS: 3000,
  ZAPPER_API_MAX_RETRIES: 3,
  ZAPPER_RETRY_DELAYS: [100, 200, 400], // Exponential backoff in ms
  
  // Server Configuration
  DEFAULT_PORT: 3000,
  MAX_REQUEST_SIZE: '1kb',
  
  // x402 Headers
  X402_SIGNATURE_HEADER: 'X-x402-Signature',
  X402_PAYMENT_ID_HEADER: 'X-x402-Payment-Id',
  X402_CHAIN_HEADER: 'X-x402-Chain',
  
  // Cache Key Patterns
  CACHE_KEY_PRICE: (chainId: number, address: string) => `price:${chainId}:${address}`,
  CACHE_KEY_USED_TX: (txId: string) => `used_tx:${txId}`,
  
  // Error Codes
  ERROR_CODES: {
    INVALID_ADDRESS: 'INVALID_ADDRESS',
    INVALID_CHAIN_ID: 'INVALID_CHAIN_ID',
    PAYMENT_REQUIRED: 'PAYMENT_REQUIRED',
    PAYMENT_INVALID: 'PAYMENT_INVALID',
    PAYMENT_INSUFFICIENT: 'PAYMENT_INSUFFICIENT',
    PAYMENT_DUPLICATE: 'PAYMENT_DUPLICATE',
    TOKEN_NOT_FOUND: 'TOKEN_NOT_FOUND',
    SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
    INTERNAL_ERROR: 'INTERNAL_ERROR'
  } as const,
  
  // HTTP Status Codes
  HTTP_STATUS: {
    OK: 200,
    BAD_REQUEST: 400,
    PAYMENT_REQUIRED: 402,
    NOT_FOUND: 404,
    TOO_MANY_REQUESTS: 429,
    INTERNAL_SERVER_ERROR: 500,
    SERVICE_UNAVAILABLE: 503
  } as const,
  
  // Validation Patterns
  ADDRESS_REGEX: /^0x[a-fA-F0-9]{40}$/,
  
  // Application Metadata
  APP_NAME: 'ClawPrice API',
  APP_VERSION: '1.0.0'
} as const;
