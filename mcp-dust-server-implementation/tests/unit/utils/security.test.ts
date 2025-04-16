// tests/unit/utils/security.test.ts
import { Security } from '../../../src/utils/security';
import jwt from 'jsonwebtoken';

describe('Security', () => {
  describe('generateRandomToken', () => {
    it('should generate a random token with default length', () => {
      const token = Security.generateRandomToken();
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBe(64); // 32 bytes = 64 hex characters
    });

    it('should generate a random token with specified length', () => {
      const token = Security.generateRandomToken(16);
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBe(32); // 16 bytes = 32 hex characters
    });

    it('should generate different tokens on each call', () => {
      const token1 = Security.generateRandomToken();
      const token2 = Security.generateRandomToken();
      expect(token1).not.toBe(token2);
    });
  });

  describe('hashString', () => {
    it('should hash a string', () => {
      const hash = Security.hashString('test');
      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64); // SHA-256 produces a 64-character hex string
    });

    it('should produce the same hash for the same input', () => {
      const hash1 = Security.hashString('test');
      const hash2 = Security.hashString('test');
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = Security.hashString('test1');
      const hash2 = Security.hashString('test2');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('generateJwtToken and verifyJwtToken', () => {
    // Mock the config
    const originalSecretKey = process.env.SECURITY_SECRET_KEY;
    beforeAll(() => {
      process.env.SECURITY_SECRET_KEY = 'test-secret-key';
    });
    afterAll(() => {
      process.env.SECURITY_SECRET_KEY = originalSecretKey;
    });

    it('should generate and verify a JWT token', () => {
      const payload = { userId: 'test-user-id', username: 'test-user' };
      const token = Security.generateJwtToken(payload);
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      
      const decodedPayload = Security.verifyJwtToken(token);
      
      expect(decodedPayload).toBeDefined();
      expect(decodedPayload.userId).toBe(payload.userId);
      expect(decodedPayload.username).toBe(payload.username);
    });

    it('should throw an error for an invalid token', () => {
      expect(() => {
        Security.verifyJwtToken('invalid-token');
      }).toThrow();
    });

    it('should throw an error for an expired token', () => {
      // Create a token that expires immediately
      const payload = { userId: 'test-user-id', username: 'test-user' };
      const token = jwt.sign(payload, 'test-secret-key', { expiresIn: 0 });
      
      // Wait for the token to expire
      jest.advanceTimersByTime(1000);
      
      expect(() => {
        Security.verifyJwtToken(token);
      }).toThrow();
    });
  });

  describe('sanitizeString', () => {
    it('should sanitize a string with HTML characters', () => {
      const sanitized = Security.sanitizeString('<script>alert("XSS")</script>');
      expect(sanitized).toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;&#x2F;script&gt;');
    });

    it('should not modify a string without HTML characters', () => {
      const sanitized = Security.sanitizeString('Hello, world!');
      expect(sanitized).toBe('Hello, world!');
    });
  });

  describe('validateApiKeyFormat', () => {
    it('should validate a valid API key format', () => {
      const isValid = Security.validateApiKeyFormat('abcdef1234567890abcdef1234567890abcdef12');
      expect(isValid).toBe(true);
    });

    it('should reject an API key that is too short', () => {
      const isValid = Security.validateApiKeyFormat('abcdef1234567890');
      expect(isValid).toBe(false);
    });

    it('should reject an API key that is too long', () => {
      const isValid = Security.validateApiKeyFormat('a'.repeat(65));
      expect(isValid).toBe(false);
    });

    it('should reject an API key with invalid characters', () => {
      const isValid = Security.validateApiKeyFormat('abcdef1234567890abcdef1234567890abcdef12$');
      expect(isValid).toBe(false);
    });
  });

  describe('maskSensitiveData', () => {
    it('should mask sensitive data in an object', () => {
      const data = {
        username: 'test-user',
        password: 'test-password',
        apiKey: 'test-api-key',
        token: 'test-token',
        secret: 'test-secret',
        other: 'other-data',
      };
      
      const masked = Security.maskSensitiveData(data);
      
      expect(masked.username).toBe('test-user');
      expect(masked.password).toBe('[REDACTED]');
      expect(masked.apiKey).toBe('[REDACTED]');
      expect(masked.token).toBe('[REDACTED]');
      expect(masked.secret).toBe('[REDACTED]');
      expect(masked.other).toBe('other-data');
    });

    it('should not modify the original object', () => {
      const data = {
        username: 'test-user',
        password: 'test-password',
      };
      
      Security.maskSensitiveData(data);
      
      expect(data.username).toBe('test-user');
      expect(data.password).toBe('test-password');
    });

    it('should mask custom sensitive fields', () => {
      const data = {
        username: 'test-user',
        customSecret: 'test-secret',
      };
      
      const masked = Security.maskSensitiveData(data, ['customSecret']);
      
      expect(masked.username).toBe('test-user');
      expect(masked.customSecret).toBe('[REDACTED]');
    });
  });

  describe('generateSecurePassword', () => {
    it('should generate a secure password with default length', () => {
      const password = Security.generateSecurePassword();
      expect(password).toBeDefined();
      expect(typeof password).toBe('string');
      expect(password.length).toBe(16);
    });

    it('should generate a secure password with specified length', () => {
      const password = Security.generateSecurePassword(20);
      expect(password).toBeDefined();
      expect(typeof password).toBe('string');
      expect(password.length).toBe(20);
    });

    it('should generate different passwords on each call', () => {
      const password1 = Security.generateSecurePassword();
      const password2 = Security.generateSecurePassword();
      expect(password1).not.toBe(password2);
    });

    it('should include at least one character from each character class', () => {
      const password = Security.generateSecurePassword();
      expect(password).toMatch(/[a-z]/); // lowercase
      expect(password).toMatch(/[A-Z]/); // uppercase
      expect(password).toMatch(/[0-9]/); // digit
      expect(password).toMatch(/[^a-zA-Z0-9]/); // special
    });
  });

  describe('constantTimeCompare', () => {
    it('should return true for equal strings', () => {
      const result = Security.constantTimeCompare('test', 'test');
      expect(result).toBe(true);
    });

    it('should return false for strings of different lengths', () => {
      const result = Security.constantTimeCompare('test', 'test1');
      expect(result).toBe(false);
    });

    it('should return false for different strings of the same length', () => {
      const result = Security.constantTimeCompare('test', 'tast');
      expect(result).toBe(false);
    });
  });
});
