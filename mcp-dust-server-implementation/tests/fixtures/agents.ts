// tests/fixtures/agents.ts

/**
 * Test agent fixtures
 */
export const agents = [
  {
    id: 'agent-1',
    name: 'Agent 1',
    description: 'Test agent 1',
    workspaceId: 'workspace-1',
    createdAt: '2023-01-01T00:00:00.000Z',
    updatedAt: '2023-01-01T00:00:00.000Z',
  },
  {
    id: 'agent-2',
    name: 'Agent 2',
    description: 'Test agent 2',
    workspaceId: 'workspace-1',
    createdAt: '2023-01-02T00:00:00.000Z',
    updatedAt: '2023-01-02T00:00:00.000Z',
  },
  {
    id: 'agent-3',
    name: 'Agent 3',
    description: 'Test agent 3',
    workspaceId: 'workspace-2',
    createdAt: '2023-01-03T00:00:00.000Z',
    updatedAt: '2023-01-03T00:00:00.000Z',
  },
];

/**
 * Test agent run fixtures
 */
export const agentRuns = [
  {
    id: 'run-1',
    agentId: 'agent-1',
    workspaceId: 'workspace-1',
    status: 'completed',
    input: 'Test input 1',
    output: 'Test output 1',
    createdAt: '2023-01-01T00:00:00.000Z',
    updatedAt: '2023-01-01T00:01:00.000Z',
    completedAt: '2023-01-01T00:01:00.000Z',
  },
  {
    id: 'run-2',
    agentId: 'agent-1',
    workspaceId: 'workspace-1',
    status: 'failed',
    input: 'Test input 2',
    error: 'Test error',
    createdAt: '2023-01-02T00:00:00.000Z',
    updatedAt: '2023-01-02T00:01:00.000Z',
    completedAt: '2023-01-02T00:01:00.000Z',
  },
  {
    id: 'run-3',
    agentId: 'agent-2',
    workspaceId: 'workspace-1',
    status: 'running',
    input: 'Test input 3',
    createdAt: '2023-01-03T00:00:00.000Z',
    updatedAt: '2023-01-03T00:01:00.000Z',
  },
];
