// tests/mocks/mockUserContextService.ts
import { UserContextService } from '../../src/services/userContextService';
import { mock } from 'jest-mock-extended';

/**
 * Create a mock UserContextService
 * @returns Mock UserContextService
 */
export function createMockUserContextService() {
  const mockUserContextService = mock<UserContextService>();

  // Mock getUserContext
  mockUserContextService.getUserContext.mockResolvedValue({
    id: 'test-user-id',
    username: 'test-user',
    email: 'test@example.com',
    fullName: 'Test User',
    workspaceId: 'test-workspace-id',
    permissions: [
      'read:workspaces',
      'write:workspaces',
      'read:agents',
      'write:agents',
      'execute:agents',
      'read:knowledge-bases',
      'write:knowledge-bases',
      'read:connectors',
      'write:connectors',
    ],
  });

  // Mock hasPermission
  mockUserContextService.hasPermission.mockImplementation(async (userId, permission) => {
    // Default permissions for test user
    const permissions = [
      'read:workspaces',
      'write:workspaces',
      'read:agents',
      'write:agents',
      'execute:agents',
      'read:knowledge-bases',
      'write:knowledge-bases',
      'read:connectors',
      'write:connectors',
    ];

    return permissions.includes(permission);
  });

  // Mock hasResourcePermission
  mockUserContextService.hasResourcePermission.mockImplementation(async (userId, resourceType, resourceId, permission) => {
    // Default permissions for test resources
    const resourcePermissions: Record<string, Record<string, string[]>> = {
      'workspace': {
        'workspace-1': ['read', 'write'],
        'workspace-2': ['read'],
      },
      'agent': {
        'agent-1': ['read', 'write', 'execute'],
        'agent-2': ['read'],
      },
      'knowledge-base': {
        'kb-1': ['read', 'write'],
        'kb-2': ['read'],
      },
      'connector': {
        'connector-1': ['read', 'write'],
        'connector-2': ['read'],
      },
    };

    if (resourceType in resourcePermissions && resourceId in resourcePermissions[resourceType]) {
      return resourcePermissions[resourceType][resourceId].includes(permission);
    }

    return false;
  });

  return mockUserContextService;
}
