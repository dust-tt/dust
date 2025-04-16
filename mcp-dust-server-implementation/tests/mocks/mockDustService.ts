// tests/mocks/mockDustService.ts
import { DustService } from '../../src/services/dustService';
import { mock } from 'jest-mock-extended';

/**
 * Create a mock DustService
 * @returns Mock DustService
 */
export function createMockDustService() {
  const mockDustService = mock<DustService>();

  // Mock validateApiKey
  mockDustService.validateApiKey.mockResolvedValue(true);

  // Mock getWorkspaces
  mockDustService.getWorkspaces.mockResolvedValue([
    {
      id: 'workspace-1',
      name: 'Workspace 1',
      description: 'Test workspace 1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'workspace-2',
      name: 'Workspace 2',
      description: 'Test workspace 2',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ]);

  // Mock getWorkspace
  mockDustService.getWorkspace.mockImplementation(async (workspaceId) => {
    if (workspaceId === 'workspace-1' || workspaceId === 'workspace-2') {
      return {
        id: workspaceId,
        name: `Workspace ${workspaceId === 'workspace-1' ? '1' : '2'}`,
        description: `Test workspace ${workspaceId === 'workspace-1' ? '1' : '2'}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    throw new Error(`Workspace not found: ${workspaceId}`);
  });

  // Mock getAgents
  mockDustService.getAgents.mockImplementation(async (workspaceId) => {
    if (workspaceId === 'workspace-1' || workspaceId === 'workspace-2') {
      return [
        {
          id: 'agent-1',
          name: 'Agent 1',
          description: 'Test agent 1',
          workspaceId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'agent-2',
          name: 'Agent 2',
          description: 'Test agent 2',
          workspaceId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
    }
    throw new Error(`Workspace not found: ${workspaceId}`);
  });

  // Mock getAgent
  mockDustService.getAgent.mockImplementation(async (workspaceId, agentId) => {
    if ((workspaceId === 'workspace-1' || workspaceId === 'workspace-2') &&
        (agentId === 'agent-1' || agentId === 'agent-2')) {
      return {
        id: agentId,
        name: `Agent ${agentId === 'agent-1' ? '1' : '2'}`,
        description: `Test agent ${agentId === 'agent-1' ? '1' : '2'}`,
        workspaceId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    throw new Error(`Agent not found: ${workspaceId}/${agentId}`);
  });

  // Mock executeAgent
  mockDustService.executeAgent.mockImplementation(async (workspaceId, agentId, input) => {
    if ((workspaceId === 'workspace-1' || workspaceId === 'workspace-2') &&
        (agentId === 'agent-1' || agentId === 'agent-2')) {
      return {
        id: 'run-1',
        agentId,
        workspaceId,
        status: 'completed',
        input,
        output: `Response to: ${input}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };
    }
    throw new Error(`Agent not found: ${workspaceId}/${agentId}`);
  });

  // Mock getKnowledgeBases
  mockDustService.getKnowledgeBases.mockImplementation(async (workspaceId) => {
    if (workspaceId === 'workspace-1' || workspaceId === 'workspace-2') {
      return [
        {
          id: 'kb-1',
          name: 'Knowledge Base 1',
          description: 'Test knowledge base 1',
          workspaceId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'kb-2',
          name: 'Knowledge Base 2',
          description: 'Test knowledge base 2',
          workspaceId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
    }
    throw new Error(`Workspace not found: ${workspaceId}`);
  });

  // Mock getKnowledgeBase
  mockDustService.getKnowledgeBase.mockImplementation(async (workspaceId, knowledgeBaseId) => {
    if ((workspaceId === 'workspace-1' || workspaceId === 'workspace-2') &&
        (knowledgeBaseId === 'kb-1' || knowledgeBaseId === 'kb-2')) {
      return {
        id: knowledgeBaseId,
        name: `Knowledge Base ${knowledgeBaseId === 'kb-1' ? '1' : '2'}`,
        description: `Test knowledge base ${knowledgeBaseId === 'kb-1' ? '1' : '2'}`,
        workspaceId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    throw new Error(`Knowledge base not found: ${workspaceId}/${knowledgeBaseId}`);
  });

  // Mock searchKnowledgeBase
  mockDustService.searchKnowledgeBase.mockImplementation(async (workspaceId, knowledgeBaseId, query) => {
    if ((workspaceId === 'workspace-1' || workspaceId === 'workspace-2') &&
        (knowledgeBaseId === 'kb-1' || knowledgeBaseId === 'kb-2')) {
      return {
        id: 'search-1',
        knowledgeBaseId,
        workspaceId,
        query,
        results: [
          {
            id: 'doc-1',
            title: 'Document 1',
            content: 'This is document 1 content',
            score: 0.95,
          },
          {
            id: 'doc-2',
            title: 'Document 2',
            content: 'This is document 2 content',
            score: 0.85,
          },
        ],
        createdAt: new Date().toISOString(),
      };
    }
    throw new Error(`Knowledge base not found: ${workspaceId}/${knowledgeBaseId}`);
  });

  // Mock getConnectors
  mockDustService.getConnectors.mockImplementation(async (workspaceId) => {
    if (workspaceId === 'workspace-1' || workspaceId === 'workspace-2') {
      return [
        {
          id: 'connector-1',
          name: 'Connector 1',
          type: 'github',
          workspaceId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'connector-2',
          name: 'Connector 2',
          type: 'slack',
          workspaceId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
    }
    throw new Error(`Workspace not found: ${workspaceId}`);
  });

  // Mock getConnector
  mockDustService.getConnector.mockImplementation(async (workspaceId, connectorId) => {
    if ((workspaceId === 'workspace-1' || workspaceId === 'workspace-2') &&
        (connectorId === 'connector-1' || connectorId === 'connector-2')) {
      return {
        id: connectorId,
        name: `Connector ${connectorId === 'connector-1' ? '1' : '2'}`,
        type: connectorId === 'connector-1' ? 'github' : 'slack',
        workspaceId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    throw new Error(`Connector not found: ${workspaceId}/${connectorId}`);
  });

  return mockDustService;
}
