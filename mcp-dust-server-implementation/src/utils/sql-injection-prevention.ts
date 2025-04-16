// src/utils/sql-injection-prevention.ts
import { logger } from './logger';
import { APIError, ErrorSeverity } from '../middleware/error-middleware';

/**
 * SQL injection prevention utility
 */
export class SQLInjectionPrevention {
  /**
   * SQL injection patterns to detect
   */
  private static readonly SQL_INJECTION_PATTERNS = [
    /(\s|^)(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE)(\s|$)/i,
    /(\s|^)(UNION|JOIN|WHERE|HAVING|GROUP BY|ORDER BY)(\s|$)/i,
    /(\s|^)(AND|OR)(\s+)(\d+|'[^']*'|[a-zA-Z_][a-zA-Z0-9_]*)(\s*)=/i,
    /(\s|^)(--|\#)/,
    /(\s|^)(\/\*|\*\/)/,
    /;(\s*)$/,
    /(\s|^)1(\s*)=(\s*)1/i,
    /(\s|^)1(\s*)=(\s*)2/i,
    /(\s|^)SLEEP\(/i,
    /(\s|^)BENCHMARK\(/i,
    /(\s|^)WAITFOR(\s+)DELAY/i,
    /(\s|^)INFORMATION_SCHEMA/i,
    /(\s|^)CHAR\(/i,
    /(\s|^)EXEC(\s*)XP_/i,
    /(\s|^)DECLARE(\s+)@/i,
    /(\s|^)CAST\(/i,
    /(\s|^)CONVERT\(/i,
  ];
  
  /**
   * Check if a string contains SQL injection patterns
   * @param value String to check
   * @returns Whether the string contains SQL injection patterns
   */
  public static containsSQLInjection(value: string): boolean {
    if (!value || typeof value !== 'string') {
      return false;
    }
    
    return this.SQL_INJECTION_PATTERNS.some(pattern => pattern.test(value));
  }
  
  /**
   * Sanitize a string to prevent SQL injection
   * @param value String to sanitize
   * @returns Sanitized string
   */
  public static sanitize(value: string): string {
    if (!value || typeof value !== 'string') {
      return value;
    }
    
    // Replace single quotes with two single quotes
    return value.replace(/'/g, "''");
  }
  
  /**
   * Validate a string to prevent SQL injection
   * @param value String to validate
   * @param fieldName Field name for error message
   * @throws {APIError} If the string contains SQL injection patterns
   */
  public static validate(value: string, fieldName: string = 'input'): void {
    if (this.containsSQLInjection(value)) {
      logger.warn(`Potential SQL injection detected in ${fieldName}`, {
        value: value.substring(0, 100), // Log only the first 100 characters
      });
      
      throw new APIError(
        `Invalid characters in ${fieldName}`,
        400,
        'INVALID_INPUT',
        ErrorSeverity.MEDIUM,
        { field: fieldName }
      );
    }
  }
  
  /**
   * Validate an object to prevent SQL injection
   * @param obj Object to validate
   * @param prefix Prefix for field names in error messages
   * @throws {APIError} If any string in the object contains SQL injection patterns
   */
  public static validateObject(obj: Record<string, any>, prefix: string = ''): void {
    if (!obj || typeof obj !== 'object') {
      return;
    }
    
    for (const [key, value] of Object.entries(obj)) {
      const fieldName = prefix ? `${prefix}.${key}` : key;
      
      if (typeof value === 'string') {
        this.validate(value, fieldName);
      } else if (typeof value === 'object' && value !== null) {
        this.validateObject(value, fieldName);
      }
    }
  }
}
