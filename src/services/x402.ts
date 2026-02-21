/**
 * x402 payment verification service
 */

import { ethers } from 'ethers';
import { CONSTANTS } from '../utils/constants';
import logger from '../utils/logger';
import { CacheService } from './cache';

export class X402Service {
  private provider: ethers.Provider;
  private collectionAddress: string;
  private cacheService: CacheService;

  constructor(cacheService: CacheService) {
    const rpcUrl = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    
    this.collectionAddress = process.env.X402_COLLECTION_ADDRESS || '';
    if (!this.collectionAddress || this.collectionAddress === '0x0000000000000000000000000000000000000000') {
      throw new Error('X402_COLLECTION_ADDRESS environment variable is required');
    }
    
    this.cacheService = cacheService;
  }

  /**
   * Verify x402 payment from request headers
   */
  async verifyPayment(signature: string, paymentId: string, chain: string): Promise<{
    valid: boolean;
    txId?: string;
    amount?: bigint;
    error?: string;
  }> {
    try {
      // Validate chain
      if (chain.toLowerCase() !== 'base') {
        logger.warn({ chain }, 'Invalid chain for x402 payment');
        return {
          valid: false,
          error: 'Invalid chain. Only Base network is supported.',
        };
      }

      // Parse signature to get transaction
      const tx = await this.provider.getTransaction(signature);
      if (!tx) {
        return {
          valid: false,
          error: 'Transaction not found',
        };
      }

      const txId = tx.hash;

      // Check for duplicate payment
      const usedTxKey = CONSTANTS.CACHE_KEY_USED_TX(txId);
      const isDuplicate = await this.cacheService.sismember(usedTxKey, txId);
      if (isDuplicate) {
        logger.warn({ txId }, 'Duplicate payment detected');
        return {
          valid: false,
          error: 'Payment transaction already used',
        };
      }

      // Verify transaction is confirmed
      const receipt = await this.provider.getTransactionReceipt(txId);
      if (!receipt || receipt.status === 0) {
        return {
          valid: false,
          error: 'Transaction failed or not confirmed',
        };
      }

      // Verify recipient
      if (tx.to?.toLowerCase() !== this.collectionAddress.toLowerCase()) {
        logger.warn({ 
          txTo: tx.to, 
          expected: this.collectionAddress 
        }, 'Payment recipient mismatch');
        return {
          valid: false,
          error: 'Invalid payment recipient',
        };
      }

      // Verify payment amount
      const minPayment = ethers.parseUnits(
        CONSTANTS.PRICE_PER_CALL_USDC.toString(),
        CONSTANTS.USDC_DECIMALS
      );
      
      if (tx.value < minPayment) {
        logger.warn({ 
          amount: tx.value.toString(), 
          minPayment: minPayment.toString() 
        }, 'Insufficient payment amount');
        return {
          valid: false,
          error: `Insufficient payment amount. Minimum: ${CONSTANTS.PRICE_PER_CALL_USDC} USDC`,
        };
      }

      // Mark transaction as used
      await this.cacheService.sadd(
        usedTxKey,
        txId,
        CONSTANTS.CACHED_TX_TTL_SECONDS
      );

      logger.info({ 
        txId, 
        amount: tx.value.toString() 
      }, 'x402 payment verified successfully');

      return {
        valid: true,
        txId,
        amount: tx.value,
      };
    } catch (error) {
      logger.error({ error, signature, paymentId }, 'x402 verification error');
      return {
        valid: false,
        error: 'Payment verification failed',
      };
    }
  }

  /**
   * Get provider (for testing)
   */
  getProvider(): ethers.Provider {
    return this.provider;
  }

  /**
   * Get collection address (for testing)
   */
  getCollectionAddress(): string {
    return this.collectionAddress;
  }
}

export default X402Service;
