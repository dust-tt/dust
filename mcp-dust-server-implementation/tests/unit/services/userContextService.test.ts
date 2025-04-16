// tests/unit/services/userContextService.test.ts
import { UserContextService } from '../../../src/services/userContextService';
import { DustService } from '../../../src/services/dustService';
import { mock } from 'jest-mock-extended';
import { users } from '../../fixtures/users';

describe('UserContextService', () => {
  let userContextService: UserContextService;
  let mockDustService: DustService;

  beforeEach(() => {
    // Create a mock DustService
    mockDustService = mock<DustService>();
    
    // Create a new UserContextService instance
    userContextService = new UserContextService(mockDustService);
  });

  describe('constructor', () => {
    it('should create a new UserContextService instance with the provided DustService', () => {
      expect(userContextService).toBeDefined();
    });
  });

  describe('getUserContext', () => {
    it('should return user context for a valid API key', async () => {
      // Mock the DustService.validateApiKey method
      mockDustService.validateApiKey.mockResolvedValue(true);
      
      // Mock the environment variables
      process.env.DUST_USERNAME = 'test-user';
      process.env.DUST_EMAIL = 'test@example.com';
      process.env.DUST_FULL_NAME = 'Test User';
      process.env.DUST_WORKSPACE_ID = 'test-workspace-id';
      
      // Get user context
      const userContext = await userContextService.getUserContext('test-api-key');
      
      // Verify the user context
      expect(userContext).toBeDefined();
      expect(userContext.username).toBe('test-user');
      expect(userContext.email).toBe('test@example.com');
      expect(userContext.fullName).toBe('Test User');
      expect(userContext.workspaceId).toBe('test-workspace-id');
      expect(userContext.permissions).toBeDefined();
      expect(userContext.permissions.length).toBeGreaterThan(0);
    });

    it('should throw an error for an invalid API key', async () => {
      // Mock the DustService.validateApiKey method
      mockDustService.validateApiKey.mockResolvedValue(false);
      
      // Get user context
      await expect(userContextService.getUserContext('invalid-api-key')).rejects.toThrow();
    });
  });

  describe('hasPermission', () => {
    it('should return true if the user has the permission', async () => {
      // Mock the getUserContext method
      jest.spyOn(userContextService, 'getUserContext').mockResolvedValue({
        id: 'test-user-id',
        username: 'test-user',
        email: 'test@example.com',
        fullName: 'Test User',
        workspaceId: 'test-workspace-id',
        permissions: ['read:workspaces', 'read:agents'],
      });
      
      // Check permission
      const hasPermission = await userContextService.hasPermission('test-user-id', 'read:workspaces');
      
      // Verify the result
      expect(hasPermission).toBe(true);
    });

    it('should return false if the user does not have the permission', async () => {
      // Mock the getUserContext method
      jest.spyOn(userContextService, 'getUserContext').mockResolvedValue({
        id: 'test-user-id',
        username: 'test-user',
        email: 'test@example.com',
        fullName: 'Test User',
        workspaceId: 'test-workspace-id',
        permissions: ['read:workspaces'],
      });
      
      // Check permission
      const hasPermission = await userContextService.hasPermission('test-user-id', 'write:workspaces');
      
      // Verify the result
      expect(hasPermission).toBe(false);
    });
  });

  describe('hasResourcePermission', () => {
    it('should return true if the user has permission for the resource', async () => {
      // Mock the getUserContext method
      jest.spyOn(userContextService, 'getUserContext').mockResolvedValue(users[0]);
      
      // Check resource permission
      const hasPermission = await userContextService.hasResourcePermission(
        'user-1',
        'workspace',
        'workspace-1',
        'read'
      );
      
      // Verify the result
      expect(hasPermission).toBe(true);
    });

    it('should return false if the user does not have permission for the resource', async () => {
      // Mock the getUserContext method
      jest.spyOn(userContextService, 'getUserContext').mockResolvedValue(users[1]);
      
      // Check resource permission
      const hasPermission = await userContextService.hasResourcePermission(
        'user-2',
        'workspace',
        'workspace-1',
        'write'
      );
      
      // Verify the result
      expect(hasPermission).toBe(false);
    });

    it('should return false if the resource does not exist', async () => {
      // Mock the getUserContext method
      jest.spyOn(userContextService, 'getUserContext').mockResolvedValue(users[0]);
      
      // Check resource permission
      const hasPermission = await userContextService.hasResourcePermission(
        'user-1',
        'workspace',
        'non-existent',
        'read'
      );
      
      // Verify the result
      expect(hasPermission).toBe(false);
    });
  });

  describe('getUserPermissions', () => {
    it('should return the user permissions', async () => {
      // Mock the getUserContext method
      jest.spyOn(userContextService, 'getUserContext').mockResolvedValue(users[0]);
      
      // Get user permissions
      const permissions = await userContextService.getUserPermissions('user-1');
      
      // Verify the permissions
      expect(permissions).toBeDefined();
      expect(permissions).toEqual(users[0].permissions);
    });

    it('should throw an error if the user does not exist', async () => {
      // Mock the getUserContext method
      jest.spyOn(userContextService, 'getUserContext').mockRejectedValue(new Error('User not found'));
      
      // Get user permissions
      await expect(userContextService.getUserPermissions('non-existent')).rejects.toThrow();
    });
  });
});
