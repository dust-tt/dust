// src/utils/security.ts
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from './logger';
import { APIError, ErrorSeverity } from '../middleware/error-middleware';

/**
 * Security utility functions
 */
export class Security {
  /**
   * Generate a random token
   * @param length Token length
   * @returns Random token
   */
  public static generateRandomToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }
  
  /**
   * Hash a string using SHA-256
   * @param value String to hash
   * @returns Hashed string
   */
  public static hashString(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }
  
  /**
   * Generate a JWT token
   * @param payload Token payload
   * @param expiresIn Token expiration time in seconds
   * @returns JWT token
   */
  public static generateJwtToken(payload: Record<string, any>, expiresIn: number = config.security.tokenExpiration): string {
    try {
      return jwt.sign(payload, config.security.secretKey, { expiresIn });
    } catch (error) {
      logger.error(`Error generating JWT token: ${error.message}`);
      throw new APIError(
        'Failed to generate authentication token',
        500,
        'TOKEN_GENERATION_ERROR',
        ErrorSeverity.HIGH
      );
    }
  }
  
  /**
   * Verify a JWT token
   * @param token JWT token
   * @returns Token payload
   */
  public static verifyJwtToken(token: string): Record<string, any> {
    try {
      return jwt.verify(token, config.security.secretKey) as Record<string, any>;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new APIError(
          'Authentication token expired',
          401,
          'TOKEN_EXPIRED',
          ErrorSeverity.LOW
        );
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new APIError(
          'Invalid authentication token',
          401,
          'INVALID_TOKEN',
          ErrorSeverity.MEDIUM
        );
      } else {
        logger.error(`Error verifying JWT token: ${error.message}`);
        throw new APIError(
          'Failed to verify authentication token',
          500,
          'TOKEN_VERIFICATION_ERROR',
          ErrorSeverity.HIGH
        );
      }
    }
  }
  
  /**
   * Sanitize a string to prevent XSS attacks
   * @param value String to sanitize
   * @returns Sanitized string
   */
  public static sanitizeString(value: string): string {
    return value
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }
  
  /**
   * Validate an API key format
   * @param apiKey API key to validate
   * @returns Whether the API key is valid
   */
  public static validateApiKeyFormat(apiKey: string): boolean {
    // Check if the API key is a valid format (alphanumeric, 32-64 characters)
    return /^[a-zA-Z0-9_-]{32,64}$/.test(apiKey);
  }
  
  /**
   * Mask sensitive data in logs
   * @param data Data to mask
   * @param sensitiveFields Fields to mask
   * @returns Masked data
   */
  public static maskSensitiveData(data: Record<string, any>, sensitiveFields: string[] = ['password', 'token', 'apiKey', 'secret']): Record<string, any> {
    const maskedData = { ...data };
    
    for (const field of sensitiveFields) {
      if (maskedData[field]) {
        maskedData[field] = '[REDACTED]';
      }
    }
    
    return maskedData;
  }
  
  /**
   * Generate a secure random password
   * @param length Password length
   * @returns Secure random password
   */
  public static generateSecurePassword(length: number = 16): string {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+~`|}{[]:;?><,./-=';
    let password = '';
    
    // Ensure at least one character from each character class
    password += charset.charAt(Math.floor(Math.random() * 26)); // lowercase
    password += charset.charAt(26 + Math.floor(Math.random() * 26)); // uppercase
    password += charset.charAt(52 + Math.floor(Math.random() * 10)); // digit
    password += charset.charAt(62 + Math.floor(Math.random() * (charset.length - 62))); // special
    
    // Fill the rest of the password
    for (let i = 4; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    
    // Shuffle the password
    return password.split('').sort(() => 0.5 - Math.random()).join('');
  }
  
  /**
   * Compare strings in constant time to prevent timing attacks
   * @param a First string
   * @param b Second string
   * @returns Whether the strings are equal
   */
  public static constantTimeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    
    return result === 0;
  }
}
