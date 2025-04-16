// src/services/tokenService.ts
import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'crypto';
import { logger } from '../utils/logger';

/**
 * Token data
 */
export interface TokenData {
  userId: string;
  username: string;
  email: string;
  workspaceId?: string;
  permissions?: string[];
  expiresAt: number;
}

/**
 * Token service for secure token storage and transmission
 */
export class TokenService {
  private secretKey: Buffer;
  private algorithm: string;
  private tokenTTL: number;
  
  /**
   * Create a new TokenService
   * @param secretKey Secret key for token encryption (default: random 32 bytes)
   * @param algorithm Encryption algorithm (default: aes-256-gcm)
   * @param tokenTTL Token TTL in milliseconds (default: 24 hours)
   */
  constructor(
    secretKey?: string,
    algorithm: string = 'aes-256-gcm',
    tokenTTL: number = 24 * 60 * 60 * 1000
  ) {
    // If no secret key is provided, generate a random one
    // In a production environment, this should be a persistent secret key
    if (!secretKey) {
      this.secretKey = randomBytes(32);
    } else {
      // Use SHA-256 to derive a 32-byte key from the provided secret key
      this.secretKey = createHash('sha256').update(secretKey).digest();
    }
    
    this.algorithm = algorithm;
    this.tokenTTL = tokenTTL;
    
    logger.info('TokenService initialized');
  }
  
  /**
   * Create a token
   * @param data Token data
   * @returns Encrypted token
   */
  createToken(data: Omit<TokenData, 'expiresAt'>): string {
    try {
      // Add expiration time to token data
      const tokenData: TokenData = {
        ...data,
        expiresAt: Date.now() + this.tokenTTL,
      };
      
      // Convert token data to JSON
      const tokenDataJson = JSON.stringify(tokenData);
      
      // Generate initialization vector
      const iv = randomBytes(16);
      
      // Create cipher
      const cipher = createCipheriv(this.algorithm, this.secretKey, iv);
      
      // Encrypt token data
      let encryptedData = cipher.update(tokenDataJson, 'utf8', 'base64');
      encryptedData += cipher.final('base64');
      
      // Get authentication tag
      const authTag = cipher.getAuthTag();
      
      // Combine IV, encrypted data, and authentication tag
      const token = Buffer.concat([
        iv,
        authTag,
        Buffer.from(encryptedData, 'base64'),
      ]).toString('base64');
      
      logger.debug(`Created token for ${data.username} (${data.email})`);
      
      return token;
    } catch (error) {
      logger.error(`Error creating token: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Verify a token
   * @param token Encrypted token
   * @returns Token data
   */
  verifyToken(token: string): TokenData | null {
    try {
      // Decode token
      const tokenBuffer = Buffer.from(token, 'base64');
      
      // Extract IV, authentication tag, and encrypted data
      const iv = tokenBuffer.slice(0, 16);
      const authTag = tokenBuffer.slice(16, 32);
      const encryptedData = tokenBuffer.slice(32).toString('base64');
      
      // Create decipher
      const decipher = createDecipheriv(this.algorithm, this.secretKey, iv);
      
      // Set authentication tag
      decipher.setAuthTag(authTag);
      
      // Decrypt token data
      let decryptedData = decipher.update(encryptedData, 'base64', 'utf8');
      decryptedData += decipher.final('utf8');
      
      // Parse token data
      const tokenData: TokenData = JSON.parse(decryptedData);
      
      // Check if token is expired
      if (tokenData.expiresAt < Date.now()) {
        logger.debug(`Token expired for ${tokenData.username} (${tokenData.email})`);
        return null;
      }
      
      logger.debug(`Verified token for ${tokenData.username} (${tokenData.email})`);
      
      return tokenData;
    } catch (error) {
      logger.error(`Error verifying token: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Refresh a token
   * @param token Encrypted token
   * @returns New encrypted token
   */
  refreshToken(token: string): string | null {
    try {
      // Verify token
      const tokenData = this.verifyToken(token);
      
      // If token is invalid, return null
      if (!tokenData) {
        return null;
      }
      
      // Create new token
      return this.createToken({
        userId: tokenData.userId,
        username: tokenData.username,
        email: tokenData.email,
        workspaceId: tokenData.workspaceId,
        permissions: tokenData.permissions,
      });
    } catch (error) {
      logger.error(`Error refreshing token: ${error.message}`);
      return null;
    }
  }
}
