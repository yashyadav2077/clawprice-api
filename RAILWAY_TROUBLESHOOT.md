# ClawPrice API - Railway Troubleshooting Guide

**Date:** 2026-02-21 06:30 AM
**Status:** Deployment Live - Critical Errors

---

## 📊 Current Status

**Public URL:** `https://clawprice-api-production.up.railway.app`

**Test Results:**
| Endpoint | Result | Status |
|----------|--------|--------|
| GET / | Varnish 503 (cache miss) | ❌ Server not responding |
| GET /health | 502 "Application failed to respond" | ❌ Application error |
| GET /metrics | 502 "Application failed to respond" | ❌ Application error |
| POST /price | 502 "Application failed to respond" | ❌ Application error |

**Diagnosis:** Application is deployed but crashing on startup or failing to handle requests properly.

---

## 🔍 Root Cause Analysis

### Most Likely Issue: Redis Connection

**What We Saw Locally:**
```javascript
{"level":"error","time":"2026-02-21T00:31:24.201Z","msg":"Redis client error"}
{"level":"warn","time":"2026-02-21T00:31:24.202Z","msg":"Redis client connection closed"}
```

**On Railway:**
- Railway provides Redis automatically via environment variables
- If we manually set `REDIS_URL`, it conflicts
- Application tries to connect to wrong Redis instance
- Fails repeatedly and eventually crashes

### Secondary Issue: Environment Variable Validation

**In x402.ts, line 21:**
```typescript
if (!this.collectionAddress || this.collectionAddress === '0x0000000000000000000000000000000000000000') {
  throw new Error('X402_COLLECTION_ADDRESS environment variable is required');
}
```

**If `X402_COLLECTION_ADDRESS` is:**
- Empty string
- Not set in Railway
- Containing whitespace

**Fix:** Ensure it's set exactly to: `0x2C2D831454BD9edDc97103E3C5091Ec2a9cF32e8`

---

## 🔧 TROUBLESHOOTING STEPS

### Step 1: Check Railway Logs (CRITICAL)

**Do This Now:**
1. Open: https://railway.app/
2. Click on: `clawprice-api` project
3. Click: **"Builds & Deployments"** tab
4. Click on most recent deployment
5. Click: **"Logs"** tab

**Look For These Errors:**

**Error 1: Missing Environment Variable**
```
Error: X402_COLLECTION_ADDRESS environment variable is required
```
**Cause:** `X402_COLLECTION_ADDRESS` not set in Railway Variables

**Error 2: Redis Connection Failure**
```
Redis client error
Redis client connection closed
```
**Cause:** `REDIS_URL` manually set (conflicts with Railway's automatic Redis)

**Error 3: Application Crash**
```
Uncaught exception: ...
```
**Cause:** Unhandled error in application code

### Step 2: Fix Railway Environment Variables

**In Railway Dashboard → `clawprice-api` → Variables, add/update:**

```bash
# REQUIRED - These MUST be set
NODE_ENV=production
PORT=3000

# x402 Payment Configuration
X402_COLLECTION_ADDRESS=0x2C2D831454BD9eDc97103E3C5091Ec2a9cF32e8
BASE_RPC_URL=https://mainnet.base.org

# Zapper API Configuration
ZAPPER_API_KEY=52039e1c-REDACTED-PUT-YOUR-FULL-KEY-HERE
ZAPPER_API_URL=https://api.zapper.fi/v2

# Cache Configuration
CACHE_TTL_SECONDS=60
CACHED_TX_TTL_SECONDS=300

# Circuit Breaker Configuration
CIRCUIT_BREAKER_FAILURE_THRESHOLD=5
CIRCUIT_BREAKER_TIMEOUT_MS=60000

# Logging
LOG_LEVEL=info

# DO NOT SET THESE (Railway provides automatically)
# REDIS_URL=redis://...  <-- REMOVE THIS IF SET
# REDIS_PASSWORD=...      <-- REMOVE THIS IF SET
# REDIS_PUBLIC_URL=...   <-- REMOVE THIS IF SET
# REDIS_USER=...         <-- REMOVE THIS IF SET
# REDISHOST=...         <-- REMOVE THIS IF SET
# REDISPORT=...         <-- REMOVE THIS IF SET
# RAILWAY_TCP_*       <-- REMOVE THESE IF SET
```

**CRITICAL:** Remove any `REDIS_*` or `RAILWAY_*` variables that you manually added. Railway provides these automatically.

### Step 3: Trigger Re-Deployment

**In Railway Dashboard:**
1. Go to: `clawprice-api` → Settings
2. Make a small change (add a space or add a new variable)
3. Click: **"Redeploy"** button
4. Wait 2-3 minutes for deployment to complete

### Step 4: Test Again

```bash
# Test root
curl -I https://clawprice-api-production.up.railway.app/

# Test health
curl https://clawprice-api-production.up.railway.app/health

# Test health with jq
curl https://clawprice-api-production.up.railway.app/health | jq

# Test price endpoint (with invalid x402)
curl -X POST https://clawprice-api-production.up.railway.app/price \
  -H "Content-Type: application/json" \
  -H "X-x402-Signature: 0xtest" \
  -H "X-x402-Payment-Id: test" \
  -H "X-x402-Chain: base" \
  -d '{"chainId": 8453, "address": "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"}'
```

**Expected Results:**
- Root: 200 OK (or Varnish 503/404 for cache)
- Health: 200 OK with JSON response
- Price: 402 Payment Invalid (correct error response)

---

## 🐛 Common Issues & Solutions

### Issue 1: "Application failed to respond" (502)

**Cause:** Application crashed before handling request

**Fix:**
1. Check Railway logs for startup errors
2. Look for uncaught exceptions
3. Ensure all required environment variables are set
4. Try adding `NODE_ENV=production` if not set

### Issue 2: "status: degraded", "cache": "disconnected"

**Cause:** Redis not connecting properly

**Fix:**
1. Remove any manually set `REDIS_URL` variable
2. Let Railway provide Redis automatically
3. Re-deploy application
4. Check logs for Redis connection errors

### Issue 3: Health Check Failing

**Cause:** Health check endpoint throwing error

**Fix:**
1. Check `src/routes/health.ts` for error handling issues
2. Ensure `checkHealth()` method doesn't throw
3. Verify Zapper service doesn't throw on health check
4. Add try-catch around health check logic

### Issue 4: Zapper API Key Invalid

**Cause:** Zapper API key is truncated or wrong format

**Fix:**
1. Verify full Zapper API key is set: `ZAPPER_API_KEY=52039e1c-REDACTED-PUT-YOUR-FULL-KEY-HERE`
2. Check it starts with `zp_` (Zapper API key format)
3. Re-generate key if needed at: https://zapper.fi/api-keys

---

## 🎯 Next Actions

### Immediate (Do Now)

1. **Check Railway Logs** (2 minutes)
   - Look for startup errors
   - Look for Redis connection errors
   - Look for environment variable errors

2. **Fix Environment Variables** (5 minutes)
   - Add missing variables
   - Remove conflicting Redis variables
   - Re-deploy application

3. **Test Endpoints** (2 minutes)
   - Test health endpoint
   - Test price endpoint
   - Verify proper error responses

### If Issues Persist

1. **Check Source Code**
   - Review `src/index.ts` for startup errors
   - Review `src/services/cache.ts` for Redis initialization
   - Review `src/services/x402.ts` for environment variable validation

2. **Enable Debug Logging**
   - Set `LOG_LEVEL=debug` in Railway
   - Re-deploy and check detailed logs

3. **Roll Back Changes**
   - If recently modified code, consider rolling back
   - Compare with working local version
   - Identify what change broke deployment

---

## 📊 Success Criteria

**Deployment is successful when:**
- [x] GET /health returns 200 OK with status: "ok" or "degraded"
- [x] GET /metrics returns Prometheus metrics (200 OK)
- [x] POST /price with invalid x402 returns 402 Payment Invalid
- [x] POST /price with valid x402 returns 200 OK with price data
- [x] Railway logs show no startup errors
- [x] Railway logs show successful Redis connection

---

## 🚀 Deployment Timeline

**Current Status:** 🟡 Degraded (Root path responds, endpoints fail)
**Expected Timeline:**
- Fix environment variables: 5 minutes
- Re-deploy: 2 minutes
- Testing: 2 minutes
- **Total: 10-15 minutes to fully operational**

**After Successful Deployment:**
- API is live and responding correctly
- Ready to submit to ClawMart marketplace
- Ready to start earning USDC from AI agents

---

## 💰 Revenue Model (Reminder)

**Once Operational:**
- Price: $0.003 USDC/call
- Your profit: $0.0019 USDC/call (63% margin)
- Monthly target: $900 @ 1,000 agents × 10 calls/day
- Scale target: $9,000/month @ 10,000 agents × 10 calls/day

---

## 📞 Support

**If you're still stuck after following these steps:**

1. **Screenshot Railway logs** and share with me
2. **Screenshot Railway variables** (with sensitive values blurred)
3. **Tell me exact error messages** you see in logs
4. **Describe what you changed** recently in Railway dashboard

---

**Deployment Status: CRITICAL - Fix needed before API can be used**

*Public URL: https://clawprice-api-production.up.railway.app*
*Current State: Server responding, application crashing*
*Root Cause: Likely Redis connection or environment variable issue*
*Fix Time: 10-15 minutes once issue is identified*
