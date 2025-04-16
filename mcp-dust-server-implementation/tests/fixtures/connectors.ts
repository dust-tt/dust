// tests/fixtures/connectors.ts

/**
 * Test connector fixtures
 */
export const connectors = [
  {
    id: 'connector-1',
    name: 'Connector 1',
    type: 'github',
    workspaceId: 'workspace-1',
    createdAt: '2023-01-01T00:00:00.000Z',
    updatedAt: '2023-01-01T00:00:00.000Z',
  },
  {
    id: 'connector-2',
    name: 'Connector 2',
    type: 'slack',
    workspaceId: 'workspace-1',
    createdAt: '2023-01-02T00:00:00.000Z',
    updatedAt: '2023-01-02T00:00:00.000Z',
  },
  {
    id: 'connector-3',
    name: 'Connector 3',
    type: 'notion',
    workspaceId: 'workspace-2',
    createdAt: '2023-01-03T00:00:00.000Z',
    updatedAt: '2023-01-03T00:00:00.000Z',
  },
];

/**
 * Test connector sync fixtures
 */
export const connectorSyncs = [
  {
    id: 'sync-1',
    connectorId: 'connector-1',
    workspaceId: 'workspace-1',
    status: 'completed',
    startedAt: '2023-01-01T00:00:00.000Z',
    completedAt: '2023-01-01T00:01:00.000Z',
    documentsAdded: 10,
    documentsUpdated: 5,
    documentsRemoved: 2,
  },
  {
    id: 'sync-2',
    connectorId: 'connector-1',
    workspaceId: 'workspace-1',
    status: 'failed',
    startedAt: '2023-01-02T00:00:00.000Z',
    completedAt: '2023-01-02T00:01:00.000Z',
    error: 'Test error',
  },
  {
    id: 'sync-3',
    connectorId: 'connector-2',
    workspaceId: 'workspace-1',
    status: 'running',
    startedAt: '2023-01-03T00:00:00.000Z',
  },
];
