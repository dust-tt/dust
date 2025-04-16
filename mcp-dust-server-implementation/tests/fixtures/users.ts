// tests/fixtures/users.ts

/**
 * Test user fixtures
 */
export const users = [
  {
    id: 'user-1',
    username: 'user1',
    email: 'user1@example.com',
    fullName: 'User One',
    workspaceId: 'workspace-1',
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
  },
  {
    id: 'user-2',
    username: 'user2',
    email: 'user2@example.com',
    fullName: 'User Two',
    workspaceId: 'workspace-1',
    permissions: [
      'read:workspaces',
      'read:agents',
      'execute:agents',
      'read:knowledge-bases',
      'read:connectors',
    ],
  },
  {
    id: 'user-3',
    username: 'user3',
    email: 'user3@example.com',
    fullName: 'User Three',
    workspaceId: 'workspace-2',
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
  },
];
