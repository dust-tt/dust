// src/utils/password-policy.ts
import { logger } from './logger';
import { APIError, ErrorSeverity } from '../middleware/error-middleware';

/**
 * Password policy options
 */
export interface PasswordPolicyOptions {
  /**
   * Minimum password length
   */
  minLength?: number;
  
  /**
   * Maximum password length
   */
  maxLength?: number;
  
  /**
   * Whether to require lowercase letters
   */
  requireLowercase?: boolean;
  
  /**
   * Whether to require uppercase letters
   */
  requireUppercase?: boolean;
  
  /**
   * Whether to require numbers
   */
  requireNumbers?: boolean;
  
  /**
   * Whether to require special characters
   */
  requireSpecial?: boolean;
  
  /**
   * Whether to disallow common passwords
   */
  disallowCommonPasswords?: boolean;
  
  /**
   * Whether to disallow personal information
   */
  disallowPersonalInfo?: boolean;
  
  /**
   * Maximum number of repeated characters
   */
  maxRepeatedChars?: number;
  
  /**
   * Maximum number of sequential characters
   */
  maxSequentialChars?: number;
}

/**
 * Password policy validation result
 */
export interface PasswordValidationResult {
  /**
   * Whether the password is valid
   */
  valid: boolean;
  
  /**
   * Validation errors
   */
  errors: string[];
  
  /**
   * Password strength score (0-100)
   */
  strength: number;
}

/**
 * Common passwords to disallow
 */
const COMMON_PASSWORDS = [
  'password', '123456', '12345678', 'qwerty', 'admin',
  'welcome', 'password123', 'abc123', 'letmein', 'monkey',
  'football', 'iloveyou', 'starwars', 'dragon', 'master',
  'hello', 'freedom', 'whatever', 'qazwsx', 'trustno1',
  'sunshine', 'princess', 'baseball', 'access', 'superman',
];

/**
 * Password policy utility
 */
export class PasswordPolicy {
  private options: PasswordPolicyOptions;
  
  /**
   * Create a new PasswordPolicy
   * @param options Password policy options
   */
  constructor(options: PasswordPolicyOptions = {}) {
    this.options = {
      minLength: 12,
      maxLength: 128,
      requireLowercase: true,
      requireUppercase: true,
      requireNumbers: true,
      requireSpecial: true,
      disallowCommonPasswords: true,
      disallowPersonalInfo: true,
      maxRepeatedChars: 3,
      maxSequentialChars: 3,
      ...options,
    };
  }
  
  /**
   * Validate a password against the policy
   * @param password Password to validate
   * @param personalInfo Personal information to check against
   * @returns Validation result
   */
  public validate(password: string, personalInfo: string[] = []): PasswordValidationResult {
    const errors: string[] = [];
    
    // Check password length
    if (password.length < this.options.minLength!) {
      errors.push(`Password must be at least ${this.options.minLength} characters long`);
    }
    
    if (password.length > this.options.maxLength!) {
      errors.push(`Password must be at most ${this.options.maxLength} characters long`);
    }
    
    // Check character requirements
    if (this.options.requireLowercase && !/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    
    if (this.options.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    
    if (this.options.requireNumbers && !/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    
    if (this.options.requireSpecial && !/[^a-zA-Z0-9]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }
    
    // Check for repeated characters
    if (this.options.maxRepeatedChars) {
      const repeatedCharsRegex = new RegExp(`(.)\\1{${this.options.maxRepeatedChars},}`);
      if (repeatedCharsRegex.test(password)) {
        errors.push(`Password must not contain more than ${this.options.maxRepeatedChars} repeated characters`);
      }
    }
    
    // Check for sequential characters
    if (this.options.maxSequentialChars) {
      const sequences = [
        'abcdefghijklmnopqrstuvwxyz',
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        '0123456789',
        'qwertyuiop',
        'asdfghjkl',
        'zxcvbnm',
        'QWERTYUIOP',
        'ASDFGHJKL',
        'ZXCVBNM',
      ];
      
      for (const sequence of sequences) {
        for (let i = 0; i <= sequence.length - this.options.maxSequentialChars - 1; i++) {
          const seq = sequence.substring(i, i + this.options.maxSequentialChars + 1);
          if (password.includes(seq)) {
            errors.push(`Password must not contain sequential characters like "${seq}"`);
            break;
          }
        }
      }
    }
    
    // Check for common passwords
    if (this.options.disallowCommonPasswords) {
      const lowercasePassword = password.toLowerCase();
      for (const commonPassword of COMMON_PASSWORDS) {
        if (lowercasePassword === commonPassword || lowercasePassword.includes(commonPassword)) {
          errors.push('Password must not be a common password or contain common passwords');
          break;
        }
      }
    }
    
    // Check for personal information
    if (this.options.disallowPersonalInfo && personalInfo.length > 0) {
      const lowercasePassword = password.toLowerCase();
      for (const info of personalInfo) {
        const lowercaseInfo = info.toLowerCase();
        if (lowercaseInfo.length >= 4 && lowercasePassword.includes(lowercaseInfo)) {
          errors.push('Password must not contain personal information');
          break;
        }
      }
    }
    
    // Calculate password strength
    const strength = this.calculateStrength(password);
    
    return {
      valid: errors.length === 0,
      errors,
      strength,
    };
  }
  
  /**
   * Calculate password strength score (0-100)
   * @param password Password to calculate strength for
   * @returns Strength score
   */
  private calculateStrength(password: string): number {
    let score = 0;
    
    // Length score (up to 40 points)
    score += Math.min(40, password.length * 2);
    
    // Character variety score (up to 40 points)
    const hasLowercase = /[a-z]/.test(password);
    const hasUppercase = /[A-Z]/.test(password);
    const hasNumbers = /[0-9]/.test(password);
    const hasSpecial = /[^a-zA-Z0-9]/.test(password);
    
    score += hasLowercase ? 10 : 0;
    score += hasUppercase ? 10 : 0;
    score += hasNumbers ? 10 : 0;
    score += hasSpecial ? 10 : 0;
    
    // Complexity score (up to 20 points)
    const uniqueChars = new Set(password).size;
    score += Math.min(20, uniqueChars);
    
    return score;
  }
  
  /**
   * Validate a password and throw an error if invalid
   * @param password Password to validate
   * @param personalInfo Personal information to check against
   * @throws {APIError} If the password is invalid
   */
  public validateAndThrow(password: string, personalInfo: string[] = []): void {
    const result = this.validate(password, personalInfo);
    
    if (!result.valid) {
      throw new APIError(
        'Password does not meet the requirements',
        400,
        'INVALID_PASSWORD',
        ErrorSeverity.LOW,
        { errors: result.errors }
      );
    }
  }
}
