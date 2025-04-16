// tests/unit/services/tokenService.test.ts
import { TokenService } from '../../../src/services/tokenService';
import jwt from 'jsonwebtoken';

describe('TokenService', () => {
  const secretKey = 'test-secret-key';
  let tokenService: TokenService;

  beforeEach(() => {
    tokenService = new TokenService(secretKey);
  });

  describe('constructor', () => {
    it('should create a new TokenService instance with the provided secret key', () => {
      expect(tokenService).toBeDefined();
    });

    it('should use the environment variable if no secret key is provided', () => {
      // Save the original environment variable
      const originalSecretKey = process.env.SECURITY_SECRET_KEY;
      
      // Set the environment variable
      process.env.SECURITY_SECRET_KEY = 'env-secret-key';
      
      // Create a new TokenService instance
      const envTokenService = new TokenService();
      
      // Create a token
      const payload = { userId: 'test-user-id' };
      const token = envTokenService.createToken(payload);
      
      // Verify the token
      const decoded = jwt.verify(token, 'env-secret-key') as Record<string, any>;
      expect(decoded.userId).toBe(payload.userId);
      
      // Restore the original environment variable
      process.env.SECURITY_SECRET_KEY = originalSecretKey;
    });
  });

  describe('createToken', () => {
    it('should create a JWT token with the provided payload', () => {
      // Create a payload
      const payload = {
        userId: 'test-user-id',
        username: 'test-user',
        email: 'test@example.com',
        workspaceId: 'test-workspace-id',
        permissions: ['read:workspaces', 'read:agents'],
      };
      
      // Create a token
      const token = tokenService.createToken(payload);
      
      // Verify the token
      const decoded = jwt.verify(token, secretKey) as Record<string, any>;
      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.username).toBe(payload.username);
      expect(decoded.email).toBe(payload.email);
      expect(decoded.workspaceId).toBe(payload.workspaceId);
      expect(decoded.permissions).toEqual(payload.permissions);
    });

    it('should include expiration time in the token', () => {
      // Create a payload
      const payload = { userId: 'test-user-id' };
      
      // Create a token
      const token = tokenService.createToken(payload);
      
      // Verify the token
      const decoded = jwt.verify(token, secretKey) as Record<string, any>;
      expect(decoded.exp).toBeDefined();
      expect(decoded.iat).toBeDefined();
      
      // Check that the expiration time is in the future
      const now = Math.floor(Date.now() / 1000);
      expect(decoded.exp).toBeGreaterThan(now);
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid token and return the payload', () => {
      // Create a payload
      const payload = { userId: 'test-user-id' };
      
      // Create a token
      const token = tokenService.createToken(payload);
      
      // Verify the token
      const result = tokenService.verifyToken(token);
      expect(result).toBeDefined();
      expect(result.userId).toBe(payload.userId);
    });

    it('should throw an error for an invalid token', () => {
      // Create an invalid token
      const invalidToken = 'invalid-token';
      
      // Verify the token
      expect(() => {
        tokenService.verifyToken(invalidToken);
      }).toThrow();
    });

    it('should throw an error for an expired token', () => {
      // Create a payload
      const payload = { userId: 'test-user-id' };
      
      // Create a token with a short expiration time
      const token = jwt.sign(payload, secretKey, { expiresIn: 1 });
      
      // Wait for the token to expire
      jest.advanceTimersByTime(2000);
      
      // Verify the token
      expect(() => {
        tokenService.verifyToken(token);
      }).toThrow();
    });
  });

  describe('refreshToken', () => {
    it('should refresh a valid token and return a new token', () => {
      // Create a payload
      const payload = { userId: 'test-user-id' };
      
      // Create a token
      const token = tokenService.createToken(payload);
      
      // Refresh the token
      const newToken = tokenService.refreshToken(token);
      
      // Verify the new token
      const decoded = jwt.verify(newToken, secretKey) as Record<string, any>;
      expect(decoded.userId).toBe(payload.userId);
      
      // Check that the new token is different from the original
      expect(newToken).not.toBe(token);
    });

    it('should throw an error for an invalid token', () => {
      // Create an invalid token
      const invalidToken = 'invalid-token';
      
      // Refresh the token
      expect(() => {
        tokenService.refreshToken(invalidToken);
      }).toThrow();
    });

    it('should throw an error for an expired token', () => {
      // Create a payload
      const payload = { userId: 'test-user-id' };
      
      // Create a token with a short expiration time
      const token = jwt.sign(payload, secretKey, { expiresIn: 1 });
      
      // Wait for the token to expire
      jest.advanceTimersByTime(2000);
      
      // Refresh the token
      expect(() => {
        tokenService.refreshToken(token);
      }).toThrow();
    });
  });
});
