# ClawPrice API - Architecture Blueprint

**Version:** 1.0  
**Status:** Final  
**Date:** 2026-02-21  
**Author:** ARCHITECT Agent (VFrame Methodology)

---

## Executive Summary

This document defines the **production-ready system architecture** for the ClawPrice API. The architecture is designed to meet the functional and non-functional requirements specified in the Designer specification while providing clear implementation guidance for the Coder agent.

**Key Architectural Decisions:**
- **Framework:** Express.js for lightweight, API-only service
- **Cache:** Redis for distributed caching and horizontal scaling
- **Deployment:** Docker containers with health checks and auto-restart
- **Error Handling:** Circuit breaker with exponential backoff
- **Monitoring:** Structured logging + Prometheus metrics
- **Testing:** Unit + integration tests with mocked x402

---

## 1. System Architecture Overview

### 1.1 High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Client Layer                               │
│                     (AI Agents / Applications)                       │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            │ HTTPS POST /price
                            │ (x402 payment headers)
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       Load Balancer (Optional)                       │
│                    (Nginx / HAProxy / Cloud LB)                      │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            │ Load-balanced traffic
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     API Server Instances (N)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │
│  │  Instance 1 │  │  Instance 2 │  │  Instance N │  (Horizontal)   │
│  │   Express   │  │   Express   │  │   Express   │   Scaling        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                  │
└─────────┼────────────────┼────────────────┼─────────────────────────┘
          │                │                │
          │                │                │
┌─────────▼────────────────▼────────────────▼─────────────────────────┐
│                     Shared Services Layer                            │
│  ┌──────────────────┐              ┌──────────────────┐            │
│  │   Redis Cache    │              │  Prometheus      │            │
│  │  (Price Data)    │              │  (Metrics)       │            │
│  └──────────────────┘              └──────────────────┘            │
└─────────────────────────────────────────────────────────────────────┘
                            │
                            │ HTTPS GET (if cache miss)
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     External Dependency                               │
│                      Zapper API                                      │
│                   (Token Pricing Data)                               │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 Component Responsibilities

| Component | Responsibility | Key Technologies |
|-----------|----------------|------------------|
| **API Server** | Handle incoming requests, x402 verification, cache logic, Zapper integration | Express.js, TypeScript, @x402/express, @x402/evm |
| **Redis Cache** | Store token pricing data with TTL, support distributed caching | Redis, node-redis (ioredis) |
| **Load Balancer** | Distribute traffic across API instances, health checks | Nginx (optional for MVP) |
| **Prometheus** | Collect and expose metrics for monitoring | prom-client |
| **Zapper API Client** | Fetch token pricing data from external API | axios or node-fetch |

---

## 2. Technology Stack

### 2.1 Framework & Runtime

**Choice: Express.js**

**Rationale:**
- Single endpoint (POST /price) - simple API-only use case
- No static files, SSR, or websockets required
- Lightweight, minimal overhead (~50ms cold start not needed)
- Mature ecosystem, battle-tested for production APIs
- Easy to containerize and deploy
- Clear request/response model fits x402 middleware pattern

**Alternatives Considered & Rejected:**
- **Next.js:** Overkill for API-only service; brings unnecessary complexity (routing, SSR, static generation)
- **Fastify:** Faster but smaller ecosystem; Express is more widely adopted
- **Hapi:** Too opinionated; unnecessary complexity for single endpoint

**Tech Stack:**
```
Runtime: Node.js 18.x (LTS)
Language: TypeScript 5.x
Framework: Express.js 4.x
Package Manager: npm
```

### 2.2 Caching Layer

**Choice: Redis**

**Rationale:**
- **Horizontal Scaling:** Critical requirement for multi-instance deployments
- **TTL Support:** Built-in expiration (60s TTL)
- **Persistence:** Optional persistence for cache warmup after restart
- **Performance:** Sub-millisecond read/write operations
- **Ecosystem:** Widely adopted, well-documented, easy to deploy
- **Future-Proof:** Supports pub/sub, streams, and advanced patterns if needed

**Cache Key Design:**
```
Format: "price:{chainId}:{address}"
Example: "price:8453:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
TTL: 60 seconds
```

**Cache Value Schema (JSON):**
```json
{
  "price": 1.00,
  "marketCap": 1234567890.12,
  "volume": 9876543.21,
  "priceChange24h": 0.5,
  "cachedAt": "2026-02-21T04:58:00.000Z"
}
```

**Alternatives Considered & Rejected:**
- **In-Memory (Node.js Map):** Cannot be shared across instances; breaks horizontal scaling
- **Memcached:** No persistence; limited data structures; Redis is more feature-complete
- **Distributed Cache (Cloudflare KV):** Adds cloud provider lock-in; Redis is more portable

**Tech Stack:**
```
Cache: Redis 7.x
Client Library: ioredis 5.x (Promise-based, reliable)
Deployment: Docker container (docker-compose for MVP)
```

### 2.3 x402 Payment Integration

**Choice: Inline Middleware**

**Rationale:**
- Single endpoint, simple validation flow
- No need for separate microservice (adds complexity, latency)
- x402 middleware sits directly in Express request pipeline
- Easy to test and debug in monolithic service
- Payment verification is fast (< 50ms), no performance bottleneck

**Payment Flow Architecture:**

```
Request → x402 Validation → Route Handler → Response
         (middleware)       (cache/Zapper)
         
1. Parse x402 headers (X-x402-Signature, X-x402-Payment-Id, X-x402-Chain)
2. Verify transaction on Base chain (chainId: 8453)
3. Verify payment amount ≥ $0.003 USDC
4. Verify payment address matches collection address
5. Verify transaction not already used (deduplication)
6. If invalid: return 402 Payment Required
7. If valid: proceed to route handler
```

**Deduplication Strategy:**
- Store used transaction IDs in Redis with 5-minute TTL
- Key: `"used_tx:{txId}"` where txId is derived from payment signature
- Prevents double-spending within time window

**Tech Stack:**
```
x402 SDK: @x402/express, @x402/core, @x402/evm
Provider: ethers.js (for Base RPC)
RPC: Public Base RPC or Infura/Alchemy endpoint
```

### 2.4 External API Client

**Choice: axios with Timeout & Retry**

**Rationale:**
- Promise-based API (async/await friendly)
- Built-in timeout support
- Request/response interceptors for logging
- Widely used, battle-tested
- Good TypeScript support

**Zapper API Integration:**
- Base URL: `https://api.zapper.fi/v2` (exact endpoint TBD by Coder)
- Timeout: 3 seconds
- Retry: Exponential backoff (100ms, 200ms, 400ms)
- Max retries: 3

**Tech Stack:**
```
HTTP Client: axios 1.x
Retry: axios-retry (or custom implementation)
Timeout: 3000ms
```

### 2.5 Error Handling

**Choice: Circuit Breaker with Exponential Backoff**

**Rationale:**
- Protects against cascading failures when Zapper API is down
- Prevents repeated calls to failing service
- Graceful degradation using stale cache data
- Industry-standard pattern for resilience

**Circuit Breaker Logic:**

```
State Machine:
CLOSED → OPEN → HALF-OPEN → CLOSED

CLOSED (Normal):
- Requests pass through to Zapper API
- Count consecutive failures
- Threshold: 5 failures → OPEN

OPEN (Failing):
- All requests fail fast (skip Zapper)
- Return cached data if available
- After 60 seconds → HALF-OPEN

HALF-OPEN (Testing):
- Allow 1 request to test Zapper
- If success → CLOSED
- If failure → OPEN
```

**Exponential Backoff (for retries):**
```
Retry 1: Wait 100ms
Retry 2: Wait 200ms
Retry 3: Wait 400ms
Max retries: 3
Total wait: 700ms
```

**Error Response Standardization:**
```json
{
  "error": {
    "code": "TOKEN_NOT_FOUND",
    "message": "Token address not found on specified chain",
    "details": "Address: 0x1234...5678 on Base"
  }
}
```

**Error Categories:**
| Category | HTTP Status | Recovery |
|----------|-------------|----------|
| Client Error (invalid input) | 400 | No retry |
| Payment Error (402) | 402 | Client must retry with new payment |
| Not Found (404) | 404 | No retry |
| Rate Limited (429) | 429 | Exponential backoff |
| Server Error (500+) | 500 | Circuit breaker + retry |

**Tech Stack:**
```
Circuit Breaker: opossum or custom implementation
Error Handler: Express error middleware
Logging: Winston or pino (structured logging)
```

### 2.6 Monitoring & Observability

**Choice: Structured Logging + Prometheus Metrics**

**Logging Requirements:**
- **Structured JSON logs** for machine parsing
- **Log Levels:** error, warn, info, debug
- **Request Logging:** Method, path, status, duration, x402 verification status
- **Error Logging:** Stack traces, correlation IDs, request context
- **Cache Logging:** Hit/miss, fetch time, TTL expiry

**Key Metrics to Track:**

| Metric | Type | Labels | Purpose |
|--------|------|--------|---------|
| http_requests_total | Counter | method, path, status | Request volume |
| http_request_duration_seconds | Histogram | method, path | Latency |
| cache_hits_total | Counter | - | Cache efficiency |
| cache_misses_total | Counter | - | Cache efficiency |
| x402_verifications_total | Counter | success, failed | Payment verification |
| zapper_api_requests_total | Counter | success, failed, circuit_breaker | External API health |
| zapper_api_duration_seconds | Histogram | - | External API latency |

**Health Check Endpoint:**
```
GET /health
Response: {"status": "ok", "cache": "connected", "zapper": "connected"}
```

**Tech Stack:**
```
Logging: pino 8.x (fast JSON logger)
Metrics: prom-client 15.x (Prometheus client)
Visualization: Grafana (optional, manual setup)
Log Aggregation: Loki or CloudWatch (optional, manual setup)
```

### 2.7 Deployment Strategy

**Choice: Docker Containers**

**Rationale:**
- **Consistency:** Same environment across dev, staging, production
- **Portability:** Easy to deploy anywhere (VPS, cloud, Kubernetes)
- **Horizontal Scaling:** Can spin up multiple instances behind load balancer
- **Health Checks:** Docker supports healthcheck for auto-restart
- **Cost-Effective:** No serverless cold starts, predictable performance
- **Future-Proof:** Easy to migrate to Kubernetes if needed

**Deployment Architecture (MVP):**
```
Single VPS (DigitalOcean, AWS EC2, etc.)
├── Docker Compose (orchestration)
│   ├── clawprice-api (container)
│   ├── redis (container)
│   └── prometheus (optional, container)
└── Nginx (reverse proxy, SSL termination)
```

**Deployment Architecture (Production - Optional):**
```
Cloud Provider (Render, Railway, or Kubernetes)
├── Managed Redis (ElastiCache, Redis Cloud)
├── Container Registry (Docker Hub, ECR)
├── Auto-scaling API instances (2-4 containers)
└── Load balancer (Cloud LB, AWS ALB)
```

**Health Check Configuration:**
```
Docker Healthcheck:
- Endpoint: GET /health
- Interval: 30 seconds
- Timeout: 5 seconds
- Retries: 3
- Start period: 40 seconds
```

**Environment Variables:**
```
PORT=3000
REDIS_URL=redis://localhost:6379
ZAPPER_API_KEY=xxx
X402_COLLECTION_ADDRESS=0x...
BASE_RPC_URL=https://mainnet.base.org
LOG_LEVEL=info
NODE_ENV=production
```

**Tech Stack:**
```
Containerization: Docker 20.x
Orchestration: Docker Compose 2.x (MVP)
Reverse Proxy: Nginx (SSL termination)
SSL: Let's Encrypt (certbot)
CI/CD: GitHub Actions (manual setup)
```

### 2.8 Testing Strategy

**Choice: Unit + Integration Tests with Mocks**

**Unit Tests:**
- Test individual functions in isolation
- Mock external dependencies (Zapper API, x402 verification, Redis)
- Fast execution (< 5 seconds for full suite)
- Coverage target: ≥ 80%

**Integration Tests:**
- Test full request flow (POST /price → response)
- Mock x402 verification (use test wallet/signature)
- Use in-memory Redis (or test Redis instance)
- Test cache behavior (hit, miss, TTL)
- Test error handling (circuit breaker, retries)

**Test Scenarios:**

| Test Category | Test Cases |
|---------------|------------|
| Input Validation | Missing chainId, invalid address, negative chainId |
| Payment Verification | Valid payment, invalid signature, insufficient payment, double-spend |
| Cache Behavior | Cache miss → fetch, cache hit → return fast, TTL expiry |
| Zapper Integration | Success response, not found, timeout, rate limit, server error |
| Circuit Breaker | Consecutive failures → OPEN, recovery → HALF-OPEN → CLOSED |
| Error Responses | All error codes with correct format |
| Edge Cases | Very large chainId, malformed JSON, concurrent requests |

**Test Tools:**
```
Unit Test Framework: Jest 29.x or Vitest
HTTP Testing: Supertest (Express integration testing)
Mock Library: nock (HTTP mocking), sinon (function stubbing)
Redis Mock: ioredis-mock or test Redis container
Coverage: c8 or nyc (Istanbul)
```

---

## 3. Data Flow

### 3.1 Request Flow (Happy Path)

```
Client                        API Server                    Redis              Zapper
  │                              │                            │                  │
  │ POST /price                  │                            │                  │
  │ (x402 headers)              │                            │                  │
  ├─────────────────────────────►│                            │                  │
  │                              │                            │                  │
  │                              │ Validate request body       │                  │
  │                              ├────────────────────────────►│                  │
  │                              │ Verify x402 payment        │                  │
  │                              │ (check used_tx set)        │                  │
  │                              │                            │                  │
  │                              │ Cache check: GET price:{chainId}:{address}   │
  │                              ├────────────────────────────►│                  │
  │                              │                            │                  │
  │                              │         MISS               │                  │
  │                              │◄────────────────────────────┤                  │
  │                              │                            │                  │
  │                              │ GET token price            │                  │
  │                              ├─────────────────────────────────────────────►│
  │                              │                            │                  │
  │                              │ 200 OK (price data)       │                  │
  │                              │◄─────────────────────────────────────────────┤
  │                              │                            │                  │
  │                              │ Cache set: price:{chainId}:{address} (60s TTL)
  │                              ├────────────────────────────►│                  │
  │                              │                            │                  │
  │ 200 OK (price data)          │                            │                  │
  │◄─────────────────────────────┤                            │                  │
```

### 3.2 Request Flow (Cache Hit)

```
Client                        API Server                    Redis
  │                              │                            │
  │ POST /price                  │                            │
  │ (x402 headers)              │                            │
  ├─────────────────────────────►│                            │
  │                              │                            │
  │                              │ Verify x402 payment        │
  │                              │                            │
  │                              │ Cache check                │
  │                              ├────────────────────────────►│
  │                              │                            │
  │                              │         HIT (< 1ms)         │
  │                              │◄────────────────────────────┤
  │                              │                            │
  │ 200 OK (cached data)         │                            │
  │◄─────────────────────────────┤                            │
```

### 3.3 Request Flow (Payment Failed)

```
Client                        API Server
  │                              │
  │ POST /price                  │
  │ (x402 headers)              │
  ├─────────────────────────────►│
  │                              │
  │                              │ Verify x402 payment
  │                              │ ✗ Invalid signature
  │                              │
  │ 402 Payment Required          │
  │◄─────────────────────────────┤
```

### 3.4 Request Flow (Circuit Breaker Open)

```
Client                        API Server                    Redis              Zapper
  │                              │                            │                  │
  │ POST /price                  │                            │                  │
  ├─────────────────────────────►│                            │                  │
  │                              │                            │                  │
  │                              │ Cache check (MISS)         │                  │
  │                              ├────────────────────────────►│                  │
  │                              │                            │                  │
  │                              │ Circuit Breaker: OPEN      │                  │
  │                              │ (skip Zapper API call)      │                  │
  │                              │                            │                  │
  │                              │ Return expired cache (if available)           │
  │                              │ or 503 Service Unavailable                   │
  │                              │                            │                  │
  │ 503 Service Unavailable      │                            │                  │
  │◄─────────────────────────────┤                            │                  │
```

---

## 4. Security Architecture

### 4.1 Payment Security

**x402 Verification Flow:**
1. Extract headers: `X-x402-Signature`, `X-x402-Payment-Id`, `X-x402-Chain`
2. Verify chain is Base (chainId: 8453)
3. Fetch transaction from Base RPC
4. Verify:
   - Transaction signature is valid
   - Amount ≥ $0.003 USDC
   - Recipient = ClawPrice collection address
   - Transaction not expired (within 5 minutes)
   - Transaction not already used (check Redis set `used_tx`)
5. If valid: add txId to `used_tx` set (TTL: 5 min), proceed

**Payment Collection Address:**
- Must be derived from a secure private key
- Never stored in code; use environment variable
- Consider using multi-sig wallet for production

### 4.2 Input Validation

**Validation Rules:**
- `chainId`: Must be positive integer, max 2147483647 (int32)
- `address`: Must match regex `^0x[a-fA-F0-9]{40}$`
- Both fields required
- Reject malformed JSON (Content-Type: application/json)

**Sanitization:**
- No HTML/Markdown injection risk (JSON-only API)
- No SQL injection (no database)
- No XSS (JSON responses, no HTML rendering)

### 4.3 Rate Limiting & DoS Protection

**Payment-Based Rate Limiting:**
- No explicit rate limit (payment enforces natural limiting)
- Each call costs $0.003, preventing unlimited abuse
- Circuit breaker prevents cascading failures

**Additional Protections:**
- Timeout on Zapper API calls (3s)
- Request size limit (max 1KB)
- Connection limit per IP (optional, Nginx layer)

### 4.4 Logging Privacy

**What to Log:**
- Request timestamp, method, path, status code, duration
- Error messages (no stack traces in production)
- Cache hit/miss metrics
- x402 verification success/failure (no payment amounts or addresses)

**What NOT to Log:**
- Payment amounts
- User wallet addresses
- Transaction IDs (use hash instead)
- Raw request bodies (except for error debugging)

---

## 5. Project Structure

### 5.1 Directory Layout

```
clawprice-api/
├── src/
│   ├── index.ts                 # Express app entry point
│   ├── app.ts                   # Express app configuration
│   ├── routes/
│   │   └── price.ts             # POST /price endpoint
│   ├── middleware/
│   │   ├── x402.ts              # x402 payment verification
│   │   ├── errorHandler.ts       # Global error handler
│   │   └── requestLogger.ts     # Request logging middleware
│   ├── services/
│   │   ├── cache.ts             # Redis cache operations
│   │   ├── zapper.ts            # Zapper API client
│   │   ├── x402.ts              # x402 verification logic
│   │   └── circuitBreaker.ts    # Circuit breaker implementation
│   ├── utils/
│   │   ├── logger.ts            # Structured logger
│   │   ├── metrics.ts           # Prometheus metrics
│   │   ├── validator.ts         # Input validation
│   │   └── constants.ts         # Constants (TTL, prices, etc.)
│   └── types/
│       └── index.ts             # TypeScript type definitions
├── tests/
│   ├── unit/                    # Unit tests
│   │   ├── cache.test.ts
│   │   ├── validator.test.ts
│   │   └── circuitBreaker.test.ts
│   └── integration/             # Integration tests
│       ├── price.test.ts
│       └── cache.test.ts
├── docker/
│   ├── Dockerfile               # Production Docker image
│   ├── Dockerfile.dev           # Development Docker image
│   └── docker-compose.yml       # Local dev orchestration
├── prometheus/
│   └── prometheus.yml           # Prometheus configuration
├── .env.example                 # Environment variables template
├── package.json
├── tsconfig.json
├── jest.config.js
└── README.md
```

### 5.2 Key Modules & Responsibilities

| Module | Responsibility | Exports |
|--------|----------------|---------|
| `src/index.ts` | Start Express server, init Redis, register routes | Server app |
| `src/app.ts` | Configure Express (middleware, routes) | Express app |
| `src/routes/price.ts` | POST /price endpoint handler | Router |
| `src/middleware/x402.ts` | x402 payment verification | Middleware function |
| `src/services/cache.ts` | Redis cache operations (get, set, check) | CacheService class |
| `src/services/zapper.ts` | Zapper API client with retry & circuit breaker | ZapperService class |
| `src/services/x402.ts` | x402 verification logic (transaction fetch, validation) | X402Service class |
| `src/services/circuitBreaker.ts` | Circuit breaker state machine | CircuitBreaker class |
| `src/utils/logger.ts` | Structured JSON logger | Logger instance |
| `src/utils/metrics.ts` | Prometheus metrics registration | Metrics object |
| `src/utils/validator.ts` | Input validation (chainId, address) | validateRequest() |
| `src/utils/constants.ts` | Constants (TTL=60s, PRICE_USDC=0.003, etc.) | Constants |

---

## 6. API Specification

### 6.1 Endpoint: POST /price

**Request:**
```http
POST /price HTTP/1.1
Host: api.clawprice.com
Content-Type: application/json
X-x402-Signature: <signature>
X-x402-Payment-Id: <payment-id>
X-x402-Chain: base

{
  "chainId": 8453,
  "address": "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
}
```

**Success Response (200 OK):**
```json
{
  "price": 1.00,
  "marketCap": 1234567890.12,
  "volume": 9876543.21,
  "priceChange24h": 0.5
}
```

**Error Response (400 Bad Request):**
```json
{
  "error": {
    "code": "INVALID_ADDRESS",
    "message": "address must be a valid Ethereum address",
    "details": "Received: 'invalid'"
  }
}
```

**Error Response (402 Payment Required):**
```json
{
  "error": {
    "code": "PAYMENT_REQUIRED",
    "message": "Payment verification failed",
    "details": "Invalid x402 signature"
  }
}
```

**Error Response (503 Service Unavailable):**
```json
{
  "error": {
    "code": "SERVICE_UNAVAILABLE",
    "message": "Zapper API is unreachable",
    "details": "Circuit breaker is open"
  }
}
```

### 6.2 Health Check: GET /health

**Success Response (200 OK):**
```json
{
  "status": "ok",
  "cache": "connected",
  "zapper": "connected",
  "timestamp": "2026-02-21T04:58:00.000Z"
}
```

---

## 7. Implementation Task List

### 7.1 Phase 1: Foundation (Dependencies & Setup)

**Task 1.1: Initialize Project**
- [ ] Initialize Node.js project (`npm init`)
- [ ] Install TypeScript, ts-node, types
- [ ] Configure `tsconfig.json`
- [ ] Install Express.js and types
- [ ] Install Jest, Supertest, ts-jest for testing
- [ ] Create basic project structure (src/, tests/)

**Task 1.2: Install Core Dependencies**
- [ ] Install `@x402/express`, `@x402/core`, `@x402/evm`
- [ ] Install `ethers` (for Base RPC)
- [ ] Install `axios` and `axios-retry`
- [ ] Install `ioredis` (Redis client)
- [ ] Install `prom-client` (Prometheus metrics)
- [ ] Install `pino` (structured logging)

**Task 1.3: Configure Docker**
- [ ] Create `docker/Dockerfile` (production)
- [ ] Create `docker/Dockerfile.dev` (development)
- [ ] Create `docker/docker-compose.yml` (Redis, API, Prometheus)
- [ ] Test local development environment with docker-compose

**Task 1.4: Configure Environment Variables**
- [ ] Create `.env.example` with all required variables
- [ ] Load environment variables using `dotenv`
- [ ] Validate required environment variables on startup

---

### 7.2 Phase 2: Core Services

**Task 2.1: Implement Logger (src/utils/logger.ts)**
- [ ] Configure pino for structured JSON logging
- [ ] Define log levels (error, warn, info, debug)
- [ ] Add request ID correlation middleware
- [ ] Write unit tests for logger

**Task 2.2: Implement Metrics (src/utils/metrics.ts)**
- [ ] Initialize prom-client registry
- [ ] Define HTTP metrics (requests, duration, status codes)
- [ ] Define cache metrics (hits, misses)
- [ ] Define x402 metrics (verifications, failures)
- [ ] Define Zapper API metrics (requests, failures, latency)
- [ ] Create `/metrics` endpoint for Prometheus scraping

**Task 2.3: Implement Constants (src/utils/constants.ts)**
- [ ] Define TTL (60 seconds)
- [ ] Define price per call ($0.003 USDC)
- [ ] Define Base chain ID (8453)
- [ ] Define USDC contract address on Base
- [ ] Define circuit breaker thresholds (5 failures, 60s timeout)

**Task 2.4: Implement Input Validator (src/utils/validator.ts)**
- [ ] Implement `validateRequest(chainId, address)` function
- [ ] Validate chainId (positive integer)
- [ ] Validate address (Ethereum address format: 0x + 40 hex chars)
- [ ] Return error object if validation fails
- [ ] Write unit tests for valid and invalid inputs

**Task 2.5: Implement Cache Service (src/services/cache.ts)**
- [ ] Create CacheService class
- [ ] Connect to Redis (handle connection errors)
- [ ] Implement `get(key)` method (returns null if not found)
- [ ] Implement `set(key, value, ttl)` method
- [ ] Implement `exists(key)` method
- [ ] Add connection health check
- [ ] Write unit tests with Redis mock

**Task 2.6: Implement Zapper Service (src/services/zapper.ts)**
- [ ] Create ZapperService class
- [ ] Implement `fetchPrice(chainId, address)` method
- [ ] Configure axios with 3s timeout
- [ ] Implement exponential backoff retry (100ms, 200ms, 400ms, max 3 retries)
- [ ] Implement circuit breaker integration (call via circuitBreaker.execute())
- [ ] Parse Zapper API response to standard format
- [ ] Write unit tests with mocked axios responses

**Task 2.7: Implement Circuit Breaker (src/services/circuitBreaker.ts)**
- [ ] Create CircuitBreaker class
- [ ] Implement state machine (CLOSED, OPEN, HALF_OPEN)
- [ ] Implement failure counting (threshold: 5 failures)
- [ ] Implement timeout logic (OPEN → HALF_OPEN after 60s)
- [ ] Implement execute() method (async, wraps function)
- [ ] Add metrics for state transitions
- [ ] Write unit tests for state transitions

**Task 2.8: Implement x402 Service (src/services/x402.ts)**
- [ ] Create X402Service class
- [ ] Implement `verifyPayment(signature, paymentId, chain)` method
- [ ] Connect to Base RPC using ethers
- [ ] Fetch transaction from blockchain
- [ ] Verify transaction signature
- [ ] Verify payment amount ≥ $0.003 USDC
- [ ] Verify recipient address matches collection address
- [ ] Check for duplicate transactions (use Redis `used_tx` set)
- [ ] Add txId to `used_tx` set with 5-minute TTL
- [ ] Write unit tests with mocked ethers provider

---

### 7.3 Phase 3: Middleware & Routes

**Task 3.1: Implement x402 Middleware (src/middleware/x402.ts)**
- [ ] Create Express middleware function
- [ ] Extract x402 headers (`X-x402-Signature`, `X-x402-Payment-Id`, `X-x402-Chain`)
- [ ] Call X402Service.verifyPayment()
- [ ] If verification fails: return 402 Payment Required
- [ ] If verification succeeds: call `next()`
- [ ] Log verification success/failure metrics
- [ ] Write unit tests for valid and invalid payments

**Task 3.2: Implement Request Logger Middleware (src/middleware/requestLogger.ts)**
- [ ] Create Express middleware
- [ ] Log request method, path, headers (sanitized)
- [ ] Add request ID to response time tracking
- [ ] Log response status, duration
- [ ] Log x402 verification status

**Task 3.3: Implement Error Handler Middleware (src/middleware/errorHandler.ts)**
- [ ] Create Express error middleware (4 arguments)
- [ ] Handle known errors (validation, x402, Zapper)
- [ ] Format error responses with standard structure
- [ ] Log errors with stack traces (debug only)
- [ ] Don't leak sensitive information in production

**Task 3.4: Implement Price Route (src/routes/price.ts)**
- [ ] Create Express router
- [ ] Define POST /price route with x402 middleware
- [ ] Validate request body (chainId, address)
- [ ] Check cache for existing price data
- [ ] If cache hit: return cached data
- [ ] If cache miss: fetch from ZapperService
- [ ] Update cache with new data (60s TTL)
- [ ] Return standard price response
- [ ] Handle all error cases (400, 402, 404, 503)
- [ ] Write integration tests (mock x402, Redis, Zapper)

**Task 3.5: Implement Health Check Route (src/routes/health.ts)**
- [ ] Create GET /health route
- [ ] Check Redis connection status
- [ ] Check Zapper API status (via circuit breaker state)
- [ ] Return health status JSON
- [ ] Write unit tests

---

### 7.4 Phase 4: Application Setup

**Task 4.1: Configure Express App (src/app.ts)**
- [ ] Initialize Express app
- [ ] Configure JSON body parser (limit: 1KB)
- [ ] Register request logger middleware
- [ ] Register x402 middleware for /price route
- [ ] Register error handler middleware
- [ ] Register health check route
- [ ] Register price route
- [ ] Register metrics route (/metrics)
- [ ] Configure CORS (restrict origins if needed)

**Task 4.2: Initialize Server (src/index.ts)**
- [ ] Import Express app from `app.ts`
- [ ] Connect to Redis (handle connection errors)
- [ ] Start HTTP server (read PORT from env, default 3000)
- [ ] Log startup message with version and port
- [ ] Handle graceful shutdown (SIGTERM, SIGINT)
- [ ] Close Redis connection on shutdown

---

### 7.5 Phase 5: Testing

**Task 5.1: Unit Tests**
- [ ] Write unit tests for validator (valid/invalid inputs)
- [ ] Write unit tests for cache (get, set, TTL)
- [ ] Write unit tests for circuit breaker (state transitions)
- [ ] Write unit tests for x402 service (mock ethers, valid/invalid tx)
- [ ] Write unit tests for Zapper service (mock axios, retry logic)

**Task 5.2: Integration Tests**
- [ ] Write integration test for POST /price (happy path)
- [ ] Write integration test for cache hit
- [ ] Write integration test for cache miss → Zapper fetch
- [ ] Write integration test for payment failure (402)
- [ ] Write integration test for invalid input (400)
- [ ] Write integration test for Zapper failure (503, circuit breaker)

**Task 5.3: Test Coverage**
- [ ] Configure coverage reporting (c8 or nyc)
- [ ] Ensure ≥ 80% code coverage
- [ ] Add coverage check to CI pipeline

---

### 7.6 Phase 6: Documentation

**Task 6.1: API Reference Documentation**
- [ ] Write Quick Start Guide (prerequisites, payment setup, example request)
- [ ] Document POST /price endpoint (request/response examples, error codes)
- [ ] Document authentication & payment flow
- [ ] Document caching behavior (TTL, cache key format)
- [ ] Add code examples (JavaScript, Python, cURL)

**Task 6.2: Integration Guide**
- [ ] Write x402 integration guide (SDK setup, wallet funding)
- [ ] Document error handling best practices (retry logic, circuit breaker)
- [ ] Document cache considerations (client-side caching, TTL)

**Task 6.3: README.md**
- [ ] Write project overview
- [ ] Add installation instructions
- [ ] Add local development setup (docker-compose)
- [ ] Add environment variables reference
- [ ] Add running tests instructions
- [ ] Add deployment instructions

---

### 7.7 Phase 7: Deployment & Monitoring

**Task 7.1: Dockerize Application**
- [ ] Build production Docker image
- [ ] Test Docker image locally
- [ ] Push to container registry (Docker Hub, GitHub Packages)

**Task 7.2: Configure Production Environment**
- [ ] Set up production server (VPS or cloud)
- [ ] Configure Redis (managed or self-hosted)
- [ ] Configure environment variables (production .env)
- [ ] Set up Nginx reverse proxy with SSL (Let's Encrypt)

**Task 7.3: Deploy to Production**
- [ ] Deploy API server container
- [ ] Deploy Redis container (or connect to managed)
- [ ] Configure health checks (Docker healthcheck)
- [ ] Test production deployment

**Task 7.4: Set Up Monitoring**
- [ ] Configure Prometheus to scrape /metrics endpoint
- [ ] Set up Grafana dashboards (optional)
- [ ] Configure log aggregation (Loki, CloudWatch, or manual)
- [ ] Set up alerts for high error rate, low uptime, circuit breaker open

**Task 7.5: CI/CD Pipeline (Optional)**
- [ ] Configure GitHub Actions for automated testing
- [ ] Add linting (ESLint)
- [ ] Add type checking (tsc --noEmit)
- [ ] Add test execution on PR
- [ ] Add Docker build on main branch merge

---

## 8. Open Questions for Coder

1. **Zapper API Endpoint:** What is the exact Zapper API endpoint and response format? The Architect designed the integration pattern, but the Coder needs to determine the specific URL and data mapping.

2. **x402 SDK Documentation:** The Architect assumes @x402/express and @x402/evm provide the necessary verification functions. If the SDK differs from expected, the Coder may need to adapt the implementation.

3. **Base RPC Provider:** The Architect specified Base mainnet (chainId: 8453). The Coder needs to choose an RPC provider (public base.org, Infura, Alchemy) and configure it.

4. **Payment Collection Address:** The Architect expects an environment variable `X402_COLLECTION_ADDRESS`. The Coder needs to generate or provide this address (or document where to set it).

5. **Deployment Platform:** The Architect provided Docker containerization. The Coder needs to choose the actual deployment platform (DigitalOcean, AWS, Render, Railway, etc.) and document the deployment steps.

---

## 9. Success Criteria

The architecture is successful when:

**Technical:**
- [ ] All architectural decisions are implemented as specified
- [ ] Unit tests pass with ≥ 80% coverage
- [ ] Integration tests cover all happy path and error scenarios
- [ ] Response time < 50ms for cached requests
- [ ] Response time < 500ms for uncached requests
- [ ] Cache hit rate ≥ 80% under normal load
- [ ] Circuit breaker opens after 5 consecutive Zapper failures
- [ ] x402 payment verification works correctly
- [ ] Docker containers start and run successfully

**Deployment:**
- [ ] Application can be deployed using Docker
- [ ] Health check endpoint returns correct status
- [ ] Prometheus metrics are exposed at /metrics
- [ ] Logs are structured and machine-readable
- [ ] Application can be horizontally scaled (multiple instances)

**Documentation:**
- [ ] API reference is complete with examples
- [ ] Integration guide explains x402 payment flow
- [ ] README provides clear setup instructions
- [ ] All code has TypeScript type definitions

---

## 10. Handoff to Coder

This blueprint provides a complete technical specification for implementing the ClawPrice API. The Coder should:

1. **Follow the task list in Section 7** - Tasks are prioritized by dependencies
2. **Adhere to the project structure in Section 5** - Maintain consistent organization
3. **Implement exactly as specified** - Do not deviate from architectural decisions without approval
4. **Write tests for all components** - Aim for ≥ 80% coverage
5. **Document integration details** - Capture Zapper API endpoint, RPC provider, etc.

**What to Implement:**
- Express.js API server with single POST /price endpoint
- x402 payment verification middleware
- Redis caching with 60-second TTL
- Zapper API client with retry and circuit breaker
- Prometheus metrics and structured logging
- Docker containerization

**What NOT to Implement:**
- No additional endpoints beyond POST /price and GET /health
- No database (Redis is the only data store)
- No subscription tiers (pay-per-use only)
- No websockets or real-time features
- No authentication beyond x402

**Deliverables:**
1. Working API server (deployed via Docker)
2. Unit and integration tests (passing, ≥ 80% coverage)
3. API reference documentation
4. Integration guide for AI agent developers
5. README with setup instructions

---

## Appendix A: Architecture Decision Record (ADR)

### ADR-001: Framework Choice (Express.js)

**Status:** Accepted  
**Date:** 2026-02-21  
**Context:** Designer specified "Express.js or Next.js" for API server  
**Decision:** Use Express.js  
**Rationale:**
- Single endpoint use case, no SSR/static files
- Lightweight, minimal overhead
- Mature ecosystem, well-documented
- Easy to containerize and deploy
- Simpler than Next.js for API-only service

**Consequences:**
- Fast startup time, low memory footprint
- No built-in SSR/static generation (not needed)
- Requires manual middleware setup (acceptable)

### ADR-002: Cache Implementation (Redis)

**Status:** Accepted  
**Date:** 2026-02-21  
**Context:** Need distributed caching for horizontal scaling  
**Decision:** Use Redis  
**Rationale:**
- Shared cache across multiple API instances
- Built-in TTL support (60s)
- Sub-millisecond performance
- Widely adopted, easy to deploy
- Future-proof (supports pub/sub, persistence)

**Consequences:**
- Requires Redis deployment (Docker or managed)
- Adds infrastructure complexity (acceptable)
- Enables horizontal scaling

### ADR-003: x402 Integration (Inline Middleware)

**Status:** Accepted  
**Date:** 2026-02-21  
**Context:** Need to verify payments for API access  
**Decision:** Use inline x402 middleware in Express pipeline  
**Rationale:**
- Single endpoint, simple validation flow
- No need for separate microservice (adds latency, complexity)
- Payment verification is fast (< 50ms)
- Easy to test and debug in monolithic service

**Consequences:**
- Payment logic tightly coupled to API server (acceptable for MVP)
- No additional service to deploy and maintain
- Clear request-response model

### ADR-004: Error Handling (Circuit Breaker + Exponential Backoff)

**Status:** Accepted  
**Date:** 2026-02-21  
**Context:** Need resilience against Zapper API failures  
**Decision:** Implement circuit breaker with exponential backoff  
**Rationale:**
- Protects against cascading failures
- Prevents repeated calls to failing service
- Graceful degradation using stale cache data
- Industry-standard pattern for external service integration

**Consequences:**
- May serve stale data when Zapper is down (acceptable trade-off)
- Requires state management for circuit breaker
- Reduces load on Zapper API during outages

### ADR-005: Deployment (Docker Containers)

**Status:** Accepted  
**Date:** 2026-02-21  
**Context:** Need production-ready deployment strategy  
**Decision:** Use Docker containers  
**Rationale:**
- Consistent environment across dev/staging/prod
- Portable (can deploy anywhere)
- Supports horizontal scaling
- Built-in health checks and auto-restart
- No serverless cold starts

**Consequences:**
- Requires container orchestration (docker-compose for MVP)
- No automatic scaling (manual or Kubernetes in future)
- Predictable performance and costs

---

## Appendix B: References

- **Designer Specification:** `/home/yash/.openclaw/workspace/projects/clawprice-api/specs/designer-spec.md`
- **x402 Protocol:** [Documentation URL TBD]
- **Zapper API:** https://docs.zapper.fi/
- **Base Network:** https://base.org/
- **Express.js:** https://expressjs.com/
- **Redis:** https://redis.io/
- **Prometheus:** https://prometheus.io/
- **Docker:** https://www.docker.com/

---

**END OF ARCHITECTURE BLUEPRINT**
