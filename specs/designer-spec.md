# ClawPrice API - Design Specification

**Version:** 1.0  
**Status:** Draft  
**Date:** 2026-02-21  
**Author:** DESIGNER Agent (VFrame Methodology)

---

## Executive Summary

**WHAT we're building:** A crypto price aggregator API that provides token pricing data to AI agents via micropayments. The API proxies requests to Zapper's API, enforces payment through the x402 payment protocol, and returns standardized pricing information.

**WHY it matters:** AI agents increasingly need reliable access to real-time crypto market data for trading, analytics, and decision-making. While free APIs exist, they often have rate limits, reliability issues, or lack guaranteed availability. ClawPrice provides a paid, reliable alternative with guaranteed uptime and predictable latency, funded through micropayments that make the service sustainable.

---

## 1. Problem Statement & Value Proposition

### 1.1 The Problem

AI agents requiring crypto price data face several challenges:

1. **Rate Limiting:** Free APIs (CoinGecko, CoinMarketCap, Zapper) impose strict rate limits that prevent high-frequency queries
2. **Unreliability:** Free tiers have no SLAs or guaranteed uptime
3. **Integration Complexity:** Different APIs have different response formats, requiring agents to maintain multiple integrations
4. **Economic Sustainability:** Free services may shut down or change terms unpredictably

### 1.2 The Solution

ClawPrice provides:

- **Reliable Access:** Guaranteed uptime with 99.5% availability target
- **Predictable Latency:** Sub-500ms response time for cached data
- **Unified Format:** Consistent response schema regardless of underlying data source
- **Sustainable Economics:** Micropayment model ensures long-term viability

### 1.3 Target Users

**Primary Target:** AI agents that require:
- Real-time crypto price data for trading decisions
- Token metrics for portfolio management
- Market data for analytics and reporting
- Reliable data sources for DeFi interactions

**Secondary Target:** Applications built on top of AI agents that can proxy through ClawPrice

### 1.4 Assumptions & Constraints

**Assumption: $0.003 USDC per call is competitive**
- **Challenge:** Free alternatives exist. Why would agents pay?
- **Justification:** Value lies in guaranteed availability, predictable latency, and elimination of rate limits. High-frequency agents (100+ calls/day) will hit free API limits. The $0.003 cost is negligible for most use cases compared to downtime or rate-limited failures.
- **Risk:** If adoption is low, pricing may need adjustment. Recommend A/B testing with a free tier.

**Assumption: 100-1000 AI agents is realistic**
- **Challenge:** This assumes significant market demand for paid crypto price APIs.
- **Justification:** Growing AI agent ecosystem (AutoGPT, BabyAGI derivatives) needs reliable data sources. Market research should validate this before full rollout.
- **Risk:** Actual adoption may be lower. Recommend phased launch starting with pilot users.

**Assumption: 60-second cache TTL is acceptable**
- **Challenge:** Crypto markets can move significantly in 60 seconds. Cached data may be stale.
- **Justification:** This is a trade-off for cost efficiency. Most use cases (portfolio snapshots, general analytics) don't need sub-second precision. For high-frequency trading, consider a "real-time" tier with shorter TTL at higher cost.
- **Risk:** Users requiring fresher data may churn. Recommend offering tiered pricing with different TTL options.

---

## 2. Functional Requirements

### 2.1 API Endpoint

#### POST /price

**Purpose:** Retrieve pricing data for a specific token on a specific blockchain.

**Authentication Required:** Yes (via x402 payment protocol)

**Request Headers:**
- `Content-Type: application/json`
- `X-x402-Signature: <signature>` (required for payment verification)
- `X-x402-Payment-Id: <payment-id>` (required for payment verification)
- `X-x402-Chain: base` (identifies payment chain)

**Request Body:**
```json
{
  "chainId": 8453,
  "address": "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
}
```

**Request Parameters:**
- `chainId` (number, required): Blockchain identifier (e.g., 8453 for Base)
- `address` (string, required): Contract address of the token

**Validation Rules:**
- `chainId` must be a positive integer
- `address` must be a valid Ethereum address (0x followed by 40 hex characters)
- Both fields are required; missing fields return 400 Bad Request

**Success Response (200 OK):**
```json
{
  "price": 1.00,
  "marketCap": 1234567890.12,
  "volume": 9876543.21,
  "priceChange24h": 0.5
}
```

**Response Fields:**
- `price` (number): Current price in USD
- `marketCap` (number): Market capitalization in USD
- `volume` (number): 24-hour trading volume in USD
- `priceChange24h` (number): Price change percentage over 24 hours

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 400 | INVALID_CHAIN_ID | chainId is missing, invalid, or unsupported |
| 400 | INVALID_ADDRESS | address is missing or has invalid format |
| 402 | PAYMENT_REQUIRED | Payment not received or verification failed |
| 404 | TOKEN_NOT_FOUND | Token address not found on specified chain |
| 503 | SERVICE_UNAVAILABLE | Zapper API is down or unreachable |

**Error Response Format:**
```json
{
  "error": {
    "code": "INVALID_CHAIN_ID",
    "message": "chainId must be a positive integer",
    "details": "Received: 'abc'"
  }
}
```

### 2.2 Payment Flow (x402 Protocol)

**Protocol Version:** x402 v1.0

**Payment Chain:** Base mainnet (chainId: 8453)

**Payment Currency:** USDC

**Cost Per Call:** $0.003 USDC

**Payment Flow:**
1. Client makes POST request to /price with x402 payment headers
2. Server verifies payment signature using @x402/evm
3. If payment is valid and amount >= $0.003 USDC, proceed to fetch data
4. If payment is invalid or missing, return 402 Payment Required
5. Return pricing data with success response

**Payment Verification Requirements:**
- Verify transaction signature on Base chain
- Verify payment amount is at least $0.003 USDC
- Verify payment is directed to the ClawPrice collection address
- Verify transaction is not already used (prevent double-spend)
- Time window: payments must be verified within 5 minutes of transaction

### 2.3 Caching Strategy

**Cache Type:** In-memory (Redis or similar in production)

**TTL (Time To Live):** 60 seconds

**Cache Key Format:** `{chainId}:{address}`

**Cache Invalidation:**
- Automatic expiration after TTL
- Manual invalidation if price change > 5% within TTL period
- Manual invalidation if Zapper API returns stale data indicator

**Cache Behavior:**
- If cached data exists and is valid (not expired), return cached data
- If cache miss or expired, fetch from Zapper API, update cache, return data
- Cache should be shared across all API instances for consistency

---

## 3. Non-Functional Requirements

### 3.1 Performance

| Metric | Target | Measurement |
|--------|--------|-------------|
| Response Time (cached) | < 50ms | p95 latency |
| Response Time (uncached) | < 500ms | p95 latency |
| Success Rate | ≥ 99.5% | Over 30-day rolling window |
| Concurrent Users | 1000 | Simultaneous connections |

### 3.2 Availability

| Metric | Target | Notes |
|--------|--------|-------|
| Uptime | 99.5% monthly | Excluding scheduled maintenance |
| Maintenance Window | 4 hours/month | Scheduled, announced 24h in advance |
| Recovery Time | < 5 minutes | Time to restore service after failure |

### 3.3 Scalability

- **Horizontal Scaling:** Support multiple API instances behind a load balancer
- **Rate Limiting:** No explicit rate limit (payment enforces natural limiting)
- **Cache Scaling:** Distributed cache for multi-instance deployments
- **Zapper API Throttling:** Implement queue/backoff to respect Zapper limits

### 3.4 Security

- **Payment Security:** All payments verified via x402 cryptographic signatures
- **Input Validation:** All inputs validated before processing
- **Rate Limiting Abuse:** Prevent DoS through payment requirement
- **Data Privacy:** No PII collected; no logging of payment addresses beyond transaction ID

### 3.5 Reliability

- **Graceful Degradation:** If cache fails, fall back to direct API calls
- **Circuit Breaker:** If Zapper API fails repeatedly, return cached data if available
- **Retry Logic:** Automatic retry with exponential backoff for transient failures
- **Monitoring:** Real-time metrics for success rate, latency, cache hit rate

### 3.6 Accuracy

| Metric | Target | Notes |
|--------|--------|-------|
| Price Accuracy | ±0.01% vs Zapper | Cached data may be up to 60s stale |
| Data Freshness | ≤ 60s | Maximum age of cached data |
| Volume Accuracy | ±1% vs Zapper | Aggregated data may vary slightly |

---

## 4. Business Requirements

### 4.1 Pricing Model

**Standard Pricing:**
- $0.003 USDC per API call
- No subscription tiers
- No minimum commitments
- No free tier (per initial design)

**Pricing Rationale:**
- At 1000 calls/day × $0.003 = $3/day cost per agent
- At 30 calls/day × $0.003 = $0.09/day cost per agent
- Revenue target: $270/month at 1000 calls/day average
- Low friction: No signup required, pay-per-use

**Potential Future Tiers (for consideration):**
- **Real-Time Tier:** $0.01 USDC/call, 10s TTL, for high-frequency trading
- **Bulk Tier:** Subscription model for high-volume users (>10k calls/month)
- **Free Tier:** 100 calls/day per address, with rate limits

### 4.2 Revenue Goals

| Phase | Target | Revenue/Month |
|-------|--------|---------------|
| Phase 1 (Pilot) | 50 agents | $135 |
| Phase 2 (Beta) | 200 agents | $540 |
| Phase 3 (Launch) | 500 agents | $1,350 |
| Phase 4 (Scale) | 1000 agents | $2,700 |

**Note:** Current revenue goal of $270/month assumes 100 calls/day average. This may be conservative; actual usage may vary.

### 4.3 Cost Structure

**Costs to Consider:**
- Zapper API costs (if applicable beyond free tier)
- Infrastructure (compute, cache, storage)
- Payment transaction fees (gas on Base)
- Development and maintenance
- Support and documentation

**Breakeven Analysis:**
- If infrastructure costs = $100/month
- Breakeven at ~1,111 calls/day ($0.003 × 1,111 = $3.33/day)
- Or ~37 agents at 30 calls/day each

### 4.4 Trust Score Target

**Goal:** 70/100 on ClawMart directory

**Factors Influencing Trust Score:**
- Uptime reliability (99.5% target)
- Response latency consistency
- Error rate and error message clarity
- Documentation quality
- Community reputation and support

---

## 5. Technology Stack Constraints

### 5.1 Runtime Environment

- **Node.js:** Version 18.x or higher
- **TypeScript:** Recommended for type safety (not mandated but encouraged)
- **Package Manager:** npm or yarn (Architect's choice)

### 5.2 Framework

**Development/Production:**
- **Primary:** Express.js (lightweight, well-established)
- **Alternative:** Next.js (if serverless deployment needed)

**Middleware Required:**
- @x402/express - Payment verification middleware
- @x402/core - x402 protocol core library
- @x402/evm - Ethereum-compatible chain support (Base)

### 5.3 Blockchain Environment

- **Network:** Base mainnet
- **Chain ID:** 8453
- **Payment Currency:** USDC (0x833589fcd6edb6e08f4c7c32d4f71b54bda02913)
- **Payment Collection Address:** [TO BE DETERMINED - Infrastructure setup]

### 5.4 External Dependencies

**Primary Data Source:**
- **Zapper API:** https://api.zapper.fi (specific endpoint to be determined)

**Infrastructure:**
- **Cache:** In-memory for MVP, Redis for production
- **Logging:** Structured logging (format TBD)
- **Monitoring:** Metrics collection (system TBD)

---

## 6. Documentation Requirements

### 6.1 API Reference Documentation

**Required Sections:**
1. Quick Start Guide
   - Prerequisites (Base wallet with USDC)
   - How to make a payment
   - Example curl request
2. Authentication & Payment
   - x402 protocol overview
   - How to sign transactions
   - Payment verification flow
3. Endpoint Specification
   - POST /price details
   - Request/response examples
   - Error code reference
4. Code Examples
   - JavaScript/TypeScript
   - Python
   - cURL
5. Rate Limits & Quotas
   - No explicit rate limits
   - Payment-based limiting explained

### 6.2 Integration Guide

**Target Audience:** AI agent developers

**Required Sections:**
1. Architecture Overview
   - How the API works
   - Payment flow diagram
2. x402 Integration
   - Installing x402 SDKs
   - Setting up payment wallet
   - Making authenticated requests
3. Error Handling
   - Best practices
   - Retry logic
   - Fallback strategies
4. Caching Considerations
   - How to cache client-side
   - When to bypass cache

### 6.3 Pricing Page

**Required Sections:**
1. Cost Structure
   - $0.003 USDC per call explanation
   - Example cost scenarios
2. Value Proposition
   - Why pay vs use free APIs?
   - Reliability guarantees
3. Payment Setup
   - How to fund wallet
   - How much to pre-load
4. FAQ
   - Common questions about payments

### 6.4 Support Resources

**Required:**
- GitHub repository link
- Issue tracker for bug reports
- Documentation site URL (when available)
- Contact email for support (when available)

---

## 7. Quality Criteria

### 7.1 Success Metrics

**Technical Metrics:**
- Success Rate: ≥ 99.5% over 30-day window
- Average Latency: < 200ms (p95: < 500ms)
- Cache Hit Rate: ≥ 80% (indicating effective caching)
- Error Rate: ≤ 0.5% (excluding 402 payment errors)

**Business Metrics:**
- Active Agents: 100+ within 3 months of launch
- Daily Calls: 1,000+ within 3 months of launch
- Revenue: $270+ monthly by month 6
- Trust Score: 70/100 on ClawMart within 90 days

**User Experience Metrics:**
- Time to First Successful Call: < 5 minutes for new users
- Documentation Clarity: No more than 2 support tickets/day for "how to use"
- Payment Success Rate: ≥ 95% (payments verified successfully)

### 7.2 Acceptance Criteria

**For MVP Launch:**
- [ ] POST /price endpoint returns valid data for test tokens
- [ ] x402 payment verification works correctly
- [ ] Caching reduces Zapper API calls by ≥ 70%
- [ ] All error codes documented and tested
- [ ] API reference documentation complete
- [ ] Integration guide with code examples
- [ ] Uptime monitoring in place
- [ ] At least 5 test agents successfully using the API

---

## 8. Open Questions & Risks

### 8.1 Open Questions

1. **Zapper API Costs:** What are Zapper's API pricing and rate limits? This affects business model viability.
2. **Payment Collection Address:** Who controls the Base wallet for collecting payments? Where are funds held?
3. **Legal Compliance:** Are there regulatory considerations for operating a paid crypto API service?
4. **Multi-Chain Support:** Should we support other chains beyond Base for payment? (Spec says Base only)
5. **Cache Backend:** Redis vs. in-memory for production? Performance vs. complexity trade-off.

### 8.2 Risks

**High Priority:**
- **Low Adoption:** If agents prefer free APIs despite reliability issues, revenue goals may not be met.
- **Zapper API Changes:** If Zapper changes pricing or deprecates endpoints, business model breaks.
- **Payment Friction:** x402 is new protocol; users may find it difficult to integrate.

**Medium Priority:**
- **Cache Staleness:** 60s TTL may be too long for some use cases; users may churn.
- **Infrastructure Costs:** If traffic spikes, costs may exceed revenue.
- **Competitive Pressure:** Similar services may launch with better pricing/features.

**Mitigation Strategies:**
- Launch with pilot users to validate demand before full investment
- Monitor Zapper API terms closely; have backup data source if needed
- Provide excellent documentation and examples to reduce integration friction
- Consider tiered pricing with different TTL options
- Implement auto-scaling and cost monitoring

### 8.3 Dependencies

**Critical Dependencies:**
- Zapper API availability and pricing
- x402 protocol stability and documentation
- Base network stability and USDC availability

**External Factors:**
- Crypto market conditions (affects demand)
- AI agent ecosystem growth
- Regulatory environment for crypto services

---

## 9. Success Definition

**ClawPrice API is successful when:**

1. **Technical:** The API achieves 99.5% uptime, sub-500ms latency, and 80%+ cache hit rate
2. **Business:** 100+ active AI agents are using the API within 3 months
3. **Economic:** Revenue exceeds infrastructure costs, achieving positive unit economics
4. **Quality:** Trust score of 70/100 on ClawMart directory
5. **User Satisfaction:** Low support ticket volume, positive community feedback

**What "Better" Means:**

Compared to free alternatives, ClawPrice is "better" because:
- **Reliability:** Guaranteed uptime vs. best-effort free tiers
- **Consistency:** Predictable latency vs. variable free API response times
- **Sustainability:** Paid model ensures long-term availability vs. potential shutdowns
- **Support:** Dedicated support channel vs. community-only support
- **Integration:** Single, well-documented API vs. managing multiple sources

---

## 10. Handoff to Architect

This specification defines WHAT the system does and WHY it matters. The Architect should use this document to design:

1. **System Architecture:** How components interact (API server, cache, Zapper integration)
2. **Data Flow:** How requests move through the system
3. **Deployment Strategy:** How to host and scale the service
4. **Technology Choices:** Specific tools and libraries (within constraints)
5. **Security Design:** How to implement secure payment verification
6. **Monitoring & Observability:** How to track metrics and detect issues

The Architect should NOT deviate from:
- Single endpoint (POST /price)
- x402 payment requirement
- $0.003 USDC pricing
- 60-second cache TTL
- Base mainnet for payments

The Architect MAY propose:
- Specific cache implementation (Redis, Memcached, etc.)
- Deployment approach (container, serverless, VM)
- Monitoring tools (Prometheus, Datadog, etc.)
- CI/CD pipeline design
- Testing strategy

---

## Appendix A: Terminology

- **x402:** A payment protocol for API monetization using blockchain-based micropayments
- **Base:** Ethereum Layer 2 network by Coinbase
- **USDC:** USD Coin, a stablecoin pegged 1:1 to the US Dollar
- **Zapper API:** DeFi aggregation platform providing token prices and balances
- **TTL:** Time To Live, the duration data remains valid in cache
- **p95 latency:** 95th percentile latency, meaning 95% of requests are faster than this value

## Appendix B: References

- x402 Protocol: [Documentation URL TBD]
- Zapper API: https://docs.zapper.fi/
- Base Network: https://base.org/
- ClawMart Directory: [URL TBD]

---

**END OF SPECIFICATION**
