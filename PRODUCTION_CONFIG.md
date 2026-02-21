# ClawPrice API - Production Configuration

**Date:** 2026-02-21 06:10 AM
**Status:** Ready for Production Deployment

---

## Collection Wallet Address

**X402_COLLECTION_ADDRESS:** `0x2C2D831454BD9edDc97103E3C5091Ec2a9cF32e8`
**Network:** Base Mainnet (Chain ID: 8453)
**Currency:** USDC (Contract: 0x833589fCD6eDb6E08f4c7C32D4f71b54bDA02913)

---

## Environment Variables

### Required for Production

```bash
# Application
PORT=3000
NODE_ENV=production
LOG_LEVEL=info

# x402 Payment Configuration
X402_COLLECTION_ADDRESS=0x2C2D831454BD9edDc97103E3C5091Ec2a9cF32e8
BASE_RPC_URL=https://mainnet.base.org

# Zapper API Configuration
ZAPPER_API_KEY=your_api_key_here
ZAPPER_API_URL=https://api.zapper.fi/v2

# Redis Configuration
REDIS_URL=redis://your-redis-host:6379
```

---

## Payment Flow

### How AI Agents Pay for API Access

1. **Agent sends request:**
   ```json
   POST /price
   {
     "chainId": 8453,
     "address": "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
   }
   ```

2. **With x402 headers:**
   ```
   X-x402-Signature: <transaction_signature>
   X-x402-Payment-Id: <payment_id>
   X-x402-Chain: base
   ```

3. **API verifies payment:**
   - Check transaction on Base mainnet
   - Verify amount ≥ $0.003 USDC
   - Verify recipient = `0x2C2D831454BD9edDc97103E3C5091Ec2a9cF32e8`
   - Check transaction not already used

4. **If valid:** Return price data
5. **If invalid:** Return 402 Payment Required

---

## USDC Contract on Base

**Contract Address:** `0x833589fCD6eDb6E08f4c7C32D4f71b54bDA02913`
**Decimals:** 6
**Symbol:** USDC

**Minimum Payment:** $0.003 USDC = 3000000 (with 6 decimals)

---

## Revenue Model

**Price Per Call:** $0.003 USDC
**Revenue Per Call (Net):** $0.0019 USDC (after Zapper API costs)
**Profit Margin:** ~63%

**Monthly Targets:**
- Conservative (100 agents): $90/month
- Target (1,000 agents): $900/month
- Scale (10,000 agents): $9,000/month

---

## Quick Start

### Local Development
```bash
# Copy environment template
cp .env.example .env

# Edit .env with your values
nano .env

# Start server
npm run dev
```

### Production Deployment
```bash
# Set environment variables
export X402_COLLECTION_ADDRESS=0x2C2D831454BD9edDc97103E3C5091Ec2a9cF32e8
export BASE_RPC_URL=https://mainnet.base.org
export ZAPPER_API_KEY=your_key_here
export REDIS_URL=redis://your-redis-host:6379

# Build and start
npm run build
npm start
```

### Docker Deployment
```bash
# Build Docker image
docker build -f docker/Dockerfile -t clawprice-api .

# Run container
docker run -d \
  -p 3000:3000 \
  -e X402_COLLECTION_ADDRESS=0x2C2D831454BD9edDc97103E3C5091Ec2a9cF32e8 \
  -e BASE_RPC_URL=https://mainnet.base.org \
  -e ZAPPER_API_KEY=your_key_here \
  -e REDIS_URL=redis://your-redis-host:6379 \
  --name clawprice-api \
  clawprice-api
```

---

## Monitoring

### Health Check
```bash
curl http://your-api-url.com/health
```

Expected response:
```json
{
  "status": "ok",
  "cache": "connected",
  "zapper": "connected",
  "timestamp": "2026-02-21T00:00:00.000Z"
}
```

### Prometheus Metrics
```bash
curl http://your-api-url.com/metrics
```

Key metrics to monitor:
- `http_requests_total` - Total API requests
- `http_request_duration_seconds` - Request latency
- `cache_hits_total` - Cache hit rate
- `cache_misses_total` - Cache miss rate
- `x402_verifications_total` - Payment verification attempts
- `zapper_api_requests_total` - Zapper API calls

---

## Testing Your API

### 1. Health Check
```bash
curl http://localhost:3000/health
```

### 2. Test Price Endpoint (without x402 - should fail)
```bash
curl -X POST http://localhost:3000/price \
  -H "Content-Type: application/json" \
  -d '{
    "chainId": 8453,
    "address": "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
  }'
```

Expected: 402 Payment Required

### 3. Test Price Endpoint (with valid x402 payment)
**Note:** This requires a real Base mainnet transaction

Once you have sent USDC to your wallet, create a transaction and test with:
```bash
curl -X POST http://localhost:3000/price \
  -H "Content-Type: application/json" \
  -H "X-x402-Signature: <your_transaction_signature>" \
  -H "X-x402-Payment-Id: <payment_id>" \
  -H "X-x402-Chain: base" \
  -d '{
    "chainId": 8453,
    "address": "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
  }'
```

---

## Security Considerations

### Private Key Security
- **NEVER** commit private keys to git
- **NEVER** include private keys in .env files in commits
- Use environment variables in production
- Use secrets management on your platform

### Payment Security
- x402 middleware validates every payment
- Duplicate transaction prevention via Redis
- Payment amount verification (minimum $0.003 USDC)
- Recipient address verification

### Rate Limiting
- Payment-based natural rate limiting
- Circuit breaker protects against cascading failures
- Retry with exponential backoff for Zapper API

---

## Troubleshooting

### Server won't start
```bash
# Check if port is in use
lsof -i :3000

# Check environment variables
cat .env

# Check logs
docker logs clawprice-api
```

### x402 payments failing
```bash
# Verify wallet address
echo $X402_COLLECTION_ADDRESS

# Check Base network connection
curl https://mainnet.base.org

# Verify USDC balance
# Use Base explorer: https://basescan.org/address/0x2C2D831454BD9edDc97103E3C5091Ec2a9cF32e8
```

### Redis connection issues
```bash
# Test Redis connection
redis-cli -h your-redis-host -p 6379 ping

# Check Redis logs
docker logs clawprice-redis
```

---

## Deployment Platforms

### Render
```bash
# 1. Connect GitHub repository
# 2. Add environment variables in Render dashboard
# 3. Deploy on push
```

### Railway
```bash
# 1. New project from GitHub
# 2. Add environment variables
# 3. Deploy automatically
```

### DigitalOcean
```bash
# 1. Create droplet
# 2. SSH into droplet
# 3. Clone repository
# 4. Install dependencies
# 5. Configure environment variables
# 6. Start with Docker or systemd
```

---

## Next Steps

1. **Generate EVM private key** (for signing x402 transactions if needed)
2. **Fund wallet with USDC** on Base mainnet
3. **Obtain Zapper API key** at https://zapper.fi/
4. **Choose deployment platform** (Render recommended)
5. **Deploy application** with all environment variables
6. **Test deployed API** with real x402 payments
7. **Submit to ClawMart** marketplace
8. **Monitor metrics** and optimize

---

## Documentation Links

- **API Documentation:** README.md
- **Deployment Guide:** DEPLOYMENT_SUMMARY.md
- **Test Results:** 100_PERCENT_STATUS.md
- **Live Testing:** LIVE_TEST_REPORT.md
- **Architecture:** blueprints/architect-blueprint.md

---

**Ready to deploy and start earning USDC from AI agents!**

*Collection Address: 0x2C2D831454BD9edDc97103E3C5091Ec2a9cF32e8*
*Network: Base Mainnet (Chain ID: 8453)*
*Currency: USDC*
*Price: $0.003 USDC per call*
