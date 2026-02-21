# ClawPrice API

Token pricing service with x402 payment verification.

## Overview

ClawPrice API provides token pricing data with pay-per-use access via x402 protocol. Features include:

- **x402 Payment Verification**: Secure pay-per-call access ($0.003 USDC per request)
- **Redis Caching**: 60-second TTL for optimal performance
- **Circuit Breaker**: Resilience against external API failures
- **Prometheus Metrics**: Full observability
- **Docker Deployment**: Containerized for easy deployment

## Quick Start

### Prerequisites

- Node.js 18+
- Docker & Docker Compose (for local development)
- A wallet with USDC on Base network for testing payments

### Installation

1. Clone the repository and navigate to the project:
```bash
cd /home/yash/.openclaw/workspace/projects/clawprice-api
```

2. Install dependencies:
```bash
npm install
```

3. Copy environment variables:
```bash
cp .env.example .env
```

4. Edit `.env` and set your `X402_COLLECTION_ADDRESS` and `ZAPPER_API_KEY`.

### Local Development with Docker

Start all services:
```bash
cd docker
docker-compose up
```

The API will be available at `http://localhost:3000`.

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:watch

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration
```

### Building

```bash
npm run build
```

## API Reference

### POST /price

Get token price data.

**Authentication**: Requires x402 payment headers

**Request Headers**:
- `X-x402-Signature`: Transaction signature
- `X-x402-Payment-Id`: Payment ID
- `X-x402-Chain`: Network (must be "base")

**Request Body**:
```json
{
  "chainId": 8453,
  "address": "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
}
```

**Success Response (200)**:
```json
{
  "price": 1.00,
  "marketCap": 1234567890.12,
  "volume": 9876543.21,
  "priceChange24h": 0.5
}
```

**Error Response (402)**:
```json
{
  "error": {
    "code": "PAYMENT_REQUIRED",
    "message": "Payment verification failed",
    "details": "Invalid x402 signature"
  }
}
```

### GET /health

Health check endpoint.

**Response (200)**:
```json
{
  "status": "ok",
  "cache": "connected",
  "zapper": "connected",
  "timestamp": "2026-02-21T05:00:00.000Z"
}
```

### GET /metrics

Prometheus metrics endpoint (text format).

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3000 |
| `NODE_ENV` | Environment | development |
| `REDIS_URL` | Redis connection string | redis://localhost:6379 |
| `X402_COLLECTION_ADDRESS` | Payment collection address | Required |
| `BASE_RPC_URL` | Base network RPC | https://mainnet.base.org |
| `ZAPPER_API_KEY` | Zapper API key | Required |
| `ZAPPER_API_URL` | Zapper API URL | https://api.zapper.fi/v2 |
| `LOG_LEVEL` | Logging level | info |

## x402 Payment Flow

1. Client sends $0.003 USDC to collection address on Base network
2. Client includes transaction signature in `X-x402-Signature` header
3. Server verifies transaction on blockchain
4. If valid, request proceeds and returns price data
5. Transaction ID is stored to prevent double-spending

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_ADDRESS` | 400 | Invalid Ethereum address |
| `INVALID_CHAIN_ID` | 400 | Invalid chain ID |
| `PAYMENT_REQUIRED` | 402 | Missing or invalid x402 payment |
| `TOKEN_NOT_FOUND` | 404 | Token not found on specified chain |
| `SERVICE_UNAVAILABLE` | 503 | Zapper API is unreachable |

## Deployment

### Using Docker

Build production image:
```bash
docker build -f docker/Dockerfile -t clawprice-api .
```

Run with Docker Compose:
```bash
docker-compose -f docker/docker-compose.yml up -d
```

### Manual Deployment

1. Build the application:
```bash
npm run build
```

2. Set environment variables on your server.

3. Start the server:
```bash
npm start
```

## Architecture

- **Framework**: Express.js
- **Language**: TypeScript
- **Cache**: Redis
- **Metrics**: Prometheus
- **Logging**: Pino (structured JSON)

For detailed architecture documentation, see `blueprints/architect-blueprint.md`.

## License

MIT
