// tests/unit/services/permissionProxy.test.ts
import { PermissionProxy } from '../../../src/services/permissionProxy';
import { DustService } from '../../../src/services/dustService';
import { UserContextService } from '../../../src/services/userContextService';
import { mock } from 'jest-mock-extended';
import { users } from '../../fixtures/users';

describe('PermissionProxy', () => {
  let permissionProxy: PermissionProxy;
  let mockDustService: DustService;
  let mockUserContextService: UserContextService;

  beforeEach(() => {
    // Create mock services
    mockDustService = mock<DustService>();
    mockUserContextService = mock<UserContextService>();
    
    // Create a new PermissionProxy instance
    permissionProxy = new PermissionProxy(mockDustService, mockUserContextService);
  });

  describe('constructor', () => {
    it('should create a new PermissionProxy instance with the provided services', () => {
      expect(permissionProxy).toBeDefined();
    });
  });

  describe('checkPermission', () => {
    it('should return true if the user has the permission', async () => {
      // Mock the UserContextService.hasPermission method
      mockUserContextService.hasPermission.mockResolvedValue(true);
      
      // Check permission
      const hasPermission = await permissionProxy.checkPermission('test-user-id', 'read:workspaces');
      
      // Verify the result
      expect(hasPermission).toBe(true);
      expect(mockUserContextService.hasPermission).toHaveBeenCalledWith('test-user-id', 'read:workspaces');
    });

    it('should return false if the user does not have the permission', async () => {
      // Mock the UserContextService.hasPermission method
      mockUserContextService.hasPermission.mockResolvedValue(false);
      
      // Check permission
      const hasPermission = await permissionProxy.checkPermission('test-user-id', 'write:workspaces');
      
      // Verify the result
      expect(hasPermission).toBe(false);
      expect(mockUserContextService.hasPermission).toHaveBeenCalledWith('test-user-id', 'write:workspaces');
    });

    it('should cache permission check results', async () => {
      // Mock the UserContextService.hasPermission method
      mockUserContextService.hasPermission.mockResolvedValue(true);
      
      // Check permission twice
      await permissionProxy.checkPermission('test-user-id', 'read:workspaces');
      await permissionProxy.checkPermission('test-user-id', 'read:workspaces');
      
      // Verify the UserContextService.hasPermission method was called only once
      expect(mockUserContextService.hasPermission).toHaveBeenCalledTimes(1);
    });
  });

  describe('checkResourcePermission', () => {
    it('should return true if the user has permission for the resource', async () => {
      // Mock the UserContextService.hasResourcePermission method
      mockUserContextService.hasResourcePermission.mockResolvedValue(true);
      
      // Check resource permission
      const hasPermission = await permissionProxy.checkResourcePermission(
        'test-user-id',
        'workspace',
        'test-workspace-id',
        'read'
      );
      
      // Verify the result
      expect(hasPermission).toBe(true);
      expect(mockUserContextService.hasResourcePermission).toHaveBeenCalledWith(
        'test-user-id',
        'workspace',
        'test-workspace-id',
        'read'
      );
    });

    it('should return false if the user does not have permission for the resource', async () => {
      // Mock the UserContextService.hasResourcePermission method
      mockUserContextService.hasResourcePermission.mockResolvedValue(false);
      
      // Check resource permission
      const hasPermission = await permissionProxy.checkResourcePermission(
        'test-user-id',
        'workspace',
        'test-workspace-id',
        'write'
      );
      
      // Verify the result
      expect(hasPermission).toBe(false);
      expect(mockUserContextService.hasResourcePermission).toHaveBeenCalledWith(
        'test-user-id',
        'workspace',
        'test-workspace-id',
        'write'
      );
    });

    it('should cache resource permission check results', async () => {
      // Mock the UserContextService.hasResourcePermission method
      mockUserContextService.hasResourcePermission.mockResolvedValue(true);
      
      // Check resource permission twice
      await permissionProxy.checkResourcePermission('test-user-id', 'workspace', 'test-workspace-id', 'read');
      await permissionProxy.checkResourcePermission('test-user-id', 'workspace', 'test-workspace-id', 'read');
      
      // Verify the UserContextService.hasResourcePermission method was called only once
      expect(mockUserContextService.hasResourcePermission).toHaveBeenCalledTimes(1);
    });
  });

  describe('checkWorkspacePermission', () => {
    it('should return true if the user has permission for the workspace', async () => {
      // Mock the checkResourcePermission method
      jest.spyOn(permissionProxy, 'checkResourcePermission').mockResolvedValue(true);
      
      // Check workspace permission
      const hasPermission = await permissionProxy.checkWorkspacePermission(
        'test-user-id',
        'test-workspace-id',
        'read'
      );
      
      // Verify the result
      expect(hasPermission).toBe(true);
      expect(permissionProxy.checkResourcePermission).toHaveBeenCalledWith(
        'test-user-id',
        'workspace',
        'test-workspace-id',
        'read'
      );
    });

    it('should return false if the user does not have permission for the workspace', async () => {
      // Mock the checkResourcePermission method
      jest.spyOn(permissionProxy, 'checkResourcePermission').mockResolvedValue(false);
      
      // Check workspace permission
      const hasPermission = await permissionProxy.checkWorkspacePermission(
        'test-user-id',
        'test-workspace-id',
        'write'
      );
      
      // Verify the result
      expect(hasPermission).toBe(false);
      expect(permissionProxy.checkResourcePermission).toHaveBeenCalledWith(
        'test-user-id',
        'workspace',
        'test-workspace-id',
        'write'
      );
    });
  });

  describe('checkAgentPermission', () => {
    it('should return true if the user has permission for the agent', async () => {
      // Mock the checkResourcePermission method
      jest.spyOn(permissionProxy, 'checkResourcePermission').mockResolvedValue(true);
      
      // Check agent permission
      const hasPermission = await permissionProxy.checkAgentPermission(
        'test-user-id',
        'test-workspace-id',
        'test-agent-id',
        'read'
      );
      
      // Verify the result
      expect(hasPermission).toBe(true);
      expect(permissionProxy.checkResourcePermission).toHaveBeenCalledWith(
        'test-user-id',
        'agent',
        'test-agent-id',
        'read'
      );
    });

    it('should return false if the user does not have permission for the agent', async () => {
      // Mock the checkResourcePermission method
      jest.spyOn(permissionProxy, 'checkResourcePermission').mockResolvedValue(false);
      
      // Check agent permission
      const hasPermission = await permissionProxy.checkAgentPermission(
        'test-user-id',
        'test-workspace-id',
        'test-agent-id',
        'write'
      );
      
      // Verify the result
      expect(hasPermission).toBe(false);
      expect(permissionProxy.checkResourcePermission).toHaveBeenCalledWith(
        'test-user-id',
        'agent',
        'test-agent-id',
        'write'
      );
    });
  });

  describe('checkKnowledgeBasePermission', () => {
    it('should return true if the user has permission for the knowledge base', async () => {
      // Mock the checkResourcePermission method
      jest.spyOn(permissionProxy, 'checkResourcePermission').mockResolvedValue(true);
      
      // Check knowledge base permission
      const hasPermission = await permissionProxy.checkKnowledgeBasePermission(
        'test-user-id',
        'test-workspace-id',
        'test-kb-id',
        'read'
      );
      
      // Verify the result
      expect(hasPermission).toBe(true);
      expect(permissionProxy.checkResourcePermission).toHaveBeenCalledWith(
        'test-user-id',
        'knowledge-base',
        'test-kb-id',
        'read'
      );
    });

    it('should return false if the user does not have permission for the knowledge base', async () => {
      // Mock the checkResourcePermission method
      jest.spyOn(permissionProxy, 'checkResourcePermission').mockResolvedValue(false);
      
      // Check knowledge base permission
      const hasPermission = await permissionProxy.checkKnowledgeBasePermission(
        'test-user-id',
        'test-workspace-id',
        'test-kb-id',
        'write'
      );
      
      // Verify the result
      expect(hasPermission).toBe(false);
      expect(permissionProxy.checkResourcePermission).toHaveBeenCalledWith(
        'test-user-id',
        'knowledge-base',
        'test-kb-id',
        'write'
      );
    });
  });

  describe('checkConnectorPermission', () => {
    it('should return true if the user has permission for the connector', async () => {
      // Mock the checkResourcePermission method
      jest.spyOn(permissionProxy, 'checkResourcePermission').mockResolvedValue(true);
      
      // Check connector permission
      const hasPermission = await permissionProxy.checkConnectorPermission(
        'test-user-id',
        'test-workspace-id',
        'test-connector-id',
        'read'
      );
      
      // Verify the result
      expect(hasPermission).toBe(true);
      expect(permissionProxy.checkResourcePermission).toHaveBeenCalledWith(
        'test-user-id',
        'connector',
        'test-connector-id',
        'read'
      );
    });

    it('should return false if the user does not have permission for the connector', async () => {
      // Mock the checkResourcePermission method
      jest.spyOn(permissionProxy, 'checkResourcePermission').mockResolvedValue(false);
      
      // Check connector permission
      const hasPermission = await permissionProxy.checkConnectorPermission(
        'test-user-id',
        'test-workspace-id',
        'test-connector-id',
        'write'
      );
      
      // Verify the result
      expect(hasPermission).toBe(false);
      expect(permissionProxy.checkResourcePermission).toHaveBeenCalledWith(
        'test-user-id',
        'connector',
        'test-connector-id',
        'write'
      );
    });
  });
});
