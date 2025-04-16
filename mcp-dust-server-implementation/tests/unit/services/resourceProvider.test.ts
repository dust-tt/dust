// tests/unit/services/resourceProvider.test.ts
import { ResourceProvider } from '../../../src/services/resourceProvider';
import { DustService } from '../../../src/services/dustService';
import { PermissionProxy } from '../../../src/services/permissionProxy';
import { mock } from 'jest-mock-extended';
import { workspaces } from '../../fixtures/workspaces';
import { agents } from '../../fixtures/agents';
import { knowledgeBases } from '../../fixtures/knowledgeBases';
import { connectors } from '../../fixtures/connectors';

describe('ResourceProvider', () => {
  let resourceProvider: ResourceProvider;
  let mockDustService: DustService;
  let mockPermissionProxy: PermissionProxy;

  beforeEach(() => {
    // Create mock services
    mockDustService = mock<DustService>();
    mockPermissionProxy = mock<PermissionProxy>();
    
    // Mock the DustService methods
    mockDustService.getWorkspaces.mockResolvedValue(workspaces);
    mockDustService.getWorkspace.mockImplementation(async (workspaceId) => {
      const workspace = workspaces.find(w => w.id === workspaceId);
      if (!workspace) {
        throw new Error(`Workspace not found: ${workspaceId}`);
      }
      return workspace;
    });
    
    mockDustService.getAgents.mockImplementation(async (workspaceId) => {
      return agents.filter(a => a.workspaceId === workspaceId);
    });
    
    mockDustService.getAgent.mockImplementation(async (workspaceId, agentId) => {
      const agent = agents.find(a => a.id === agentId && a.workspaceId === workspaceId);
      if (!agent) {
        throw new Error(`Agent not found: ${workspaceId}/${agentId}`);
      }
      return agent;
    });
    
    mockDustService.getKnowledgeBases.mockImplementation(async (workspaceId) => {
      return knowledgeBases.filter(kb => kb.workspaceId === workspaceId);
    });
    
    mockDustService.getKnowledgeBase.mockImplementation(async (workspaceId, knowledgeBaseId) => {
      const kb = knowledgeBases.find(kb => kb.id === knowledgeBaseId && kb.workspaceId === workspaceId);
      if (!kb) {
        throw new Error(`Knowledge base not found: ${workspaceId}/${knowledgeBaseId}`);
      }
      return kb;
    });
    
    mockDustService.getConnectors.mockImplementation(async (workspaceId) => {
      return connectors.filter(c => c.workspaceId === workspaceId);
    });
    
    mockDustService.getConnector.mockImplementation(async (workspaceId, connectorId) => {
      const connector = connectors.find(c => c.id === connectorId && c.workspaceId === workspaceId);
      if (!connector) {
        throw new Error(`Connector not found: ${workspaceId}/${connectorId}`);
      }
      return connector;
    });
    
    // Mock the PermissionProxy methods
    mockPermissionProxy.checkWorkspacePermission.mockResolvedValue(true);
    mockPermissionProxy.checkAgentPermission.mockResolvedValue(true);
    mockPermissionProxy.checkKnowledgeBasePermission.mockResolvedValue(true);
    mockPermissionProxy.checkConnectorPermission.mockResolvedValue(true);
    
    // Create a new ResourceProvider instance
    resourceProvider = new ResourceProvider(mockDustService, mockPermissionProxy);
  });

  describe('constructor', () => {
    it('should create a new ResourceProvider instance with the provided services', () => {
      expect(resourceProvider).toBeDefined();
    });
  });

  describe('getResource', () => {
    it('should return the root resource', async () => {
      // Get the resource
      const resource = await resourceProvider.getResource('dust://', 'test-user-id');
      
      // Verify the resource
      expect(resource).toBeDefined();
      expect(resource).toHaveProperty('content');
      expect(resource.content).toHaveProperty('name', 'Dust API');
      expect(resource.content).toHaveProperty('resources');
      expect(resource.content.resources).toContain('dust://workspaces');
    });

    it('should return the workspaces resource', async () => {
      // Get the resource
      const resource = await resourceProvider.getResource('dust://workspaces', 'test-user-id');
      
      // Verify the resource
      expect(resource).toBeDefined();
      expect(resource).toHaveProperty('content');
      expect(resource.content).toHaveProperty('workspaces');
      expect(resource.content.workspaces).toHaveLength(workspaces.length);
      expect(resource.content.workspaces[0]).toHaveProperty('id', workspaces[0].id);
      expect(resource.content.workspaces[0]).toHaveProperty('name', workspaces[0].name);
    });

    it('should return a workspace resource', async () => {
      // Get the resource
      const resource = await resourceProvider.getResource(`dust://workspaces/${workspaces[0].id}`, 'test-user-id');
      
      // Verify the resource
      expect(resource).toBeDefined();
      expect(resource).toHaveProperty('content');
      expect(resource.content).toHaveProperty('id', workspaces[0].id);
      expect(resource.content).toHaveProperty('name', workspaces[0].name);
      expect(resource.content).toHaveProperty('description', workspaces[0].description);
    });

    it('should return the agents resource', async () => {
      // Get the resource
      const resource = await resourceProvider.getResource(`dust://workspaces/${workspaces[0].id}/agents`, 'test-user-id');
      
      // Verify the resource
      expect(resource).toBeDefined();
      expect(resource).toHaveProperty('content');
      expect(resource.content).toHaveProperty('agents');
      
      const workspaceAgents = agents.filter(a => a.workspaceId === workspaces[0].id);
      expect(resource.content.agents).toHaveLength(workspaceAgents.length);
      expect(resource.content.agents[0]).toHaveProperty('id', workspaceAgents[0].id);
      expect(resource.content.agents[0]).toHaveProperty('name', workspaceAgents[0].name);
    });

    it('should return an agent resource', async () => {
      // Get a workspace agent
      const agent = agents.find(a => a.workspaceId === workspaces[0].id);
      
      // Get the resource
      const resource = await resourceProvider.getResource(`dust://workspaces/${workspaces[0].id}/agents/${agent.id}`, 'test-user-id');
      
      // Verify the resource
      expect(resource).toBeDefined();
      expect(resource).toHaveProperty('content');
      expect(resource.content).toHaveProperty('id', agent.id);
      expect(resource.content).toHaveProperty('name', agent.name);
      expect(resource.content).toHaveProperty('description', agent.description);
      expect(resource.content).toHaveProperty('workspaceId', workspaces[0].id);
    });

    it('should throw an error for an invalid URI', async () => {
      // Get the resource
      await expect(resourceProvider.getResource('invalid-uri', 'test-user-id')).rejects.toThrow();
    });

    it('should throw an error for a non-existent resource', async () => {
      // Get the resource
      await expect(resourceProvider.getResource('dust://workspaces/non-existent', 'test-user-id')).rejects.toThrow();
    });

    it('should throw an error if the user does not have permission', async () => {
      // Mock the PermissionProxy.checkWorkspacePermission method
      mockPermissionProxy.checkWorkspacePermission.mockResolvedValue(false);
      
      // Get the resource
      await expect(resourceProvider.getResource(`dust://workspaces/${workspaces[0].id}`, 'test-user-id')).rejects.toThrow();
    });
  });

  describe('listResources', () => {
    it('should list workspaces', async () => {
      // List resources
      const resources = await resourceProvider.listResources('dust://workspaces', 'test-user-id');
      
      // Verify the resources
      expect(resources).toBeDefined();
      expect(resources).toHaveProperty('items');
      expect(resources.items).toHaveLength(workspaces.length);
      expect(resources.items[0]).toHaveProperty('uri', `dust://workspaces/${workspaces[0].id}`);
      expect(resources.items[0]).toHaveProperty('name', workspaces[0].name);
      expect(resources.items[0]).toHaveProperty('description', workspaces[0].description);
    });

    it('should list agents in a workspace', async () => {
      // List resources
      const resources = await resourceProvider.listResources(`dust://workspaces/${workspaces[0].id}/agents`, 'test-user-id');
      
      // Verify the resources
      expect(resources).toBeDefined();
      expect(resources).toHaveProperty('items');
      
      const workspaceAgents = agents.filter(a => a.workspaceId === workspaces[0].id);
      expect(resources.items).toHaveLength(workspaceAgents.length);
      expect(resources.items[0]).toHaveProperty('uri', `dust://workspaces/${workspaces[0].id}/agents/${workspaceAgents[0].id}`);
      expect(resources.items[0]).toHaveProperty('name', workspaceAgents[0].name);
      expect(resources.items[0]).toHaveProperty('description', workspaceAgents[0].description);
    });

    it('should throw an error for an invalid URI', async () => {
      // List resources
      await expect(resourceProvider.listResources('invalid-uri', 'test-user-id')).rejects.toThrow();
    });

    it('should throw an error for a non-existent resource', async () => {
      // List resources
      await expect(resourceProvider.listResources('dust://workspaces/non-existent/agents', 'test-user-id')).rejects.toThrow();
    });

    it('should throw an error if the user does not have permission', async () => {
      // Mock the PermissionProxy.checkWorkspacePermission method
      mockPermissionProxy.checkWorkspacePermission.mockResolvedValue(false);
      
      // List resources
      await expect(resourceProvider.listResources(`dust://workspaces/${workspaces[0].id}/agents`, 'test-user-id')).rejects.toThrow();
    });
  });

  describe('parseUri', () => {
    it('should parse a root URI', () => {
      // Parse the URI
      const result = resourceProvider.parseUri('dust://');
      
      // Verify the result
      expect(result).toBeDefined();
      expect(result).toHaveProperty('type', 'root');
      expect(result).toHaveProperty('params', {});
    });

    it('should parse a workspaces URI', () => {
      // Parse the URI
      const result = resourceProvider.parseUri('dust://workspaces');
      
      // Verify the result
      expect(result).toBeDefined();
      expect(result).toHaveProperty('type', 'workspaces');
      expect(result).toHaveProperty('params', {});
    });

    it('should parse a workspace URI', () => {
      // Parse the URI
      const result = resourceProvider.parseUri('dust://workspaces/workspace-1');
      
      // Verify the result
      expect(result).toBeDefined();
      expect(result).toHaveProperty('type', 'workspace');
      expect(result).toHaveProperty('params', { workspaceId: 'workspace-1' });
    });

    it('should parse an agents URI', () => {
      // Parse the URI
      const result = resourceProvider.parseUri('dust://workspaces/workspace-1/agents');
      
      // Verify the result
      expect(result).toBeDefined();
      expect(result).toHaveProperty('type', 'agents');
      expect(result).toHaveProperty('params', { workspaceId: 'workspace-1' });
    });

    it('should parse an agent URI', () => {
      // Parse the URI
      const result = resourceProvider.parseUri('dust://workspaces/workspace-1/agents/agent-1');
      
      // Verify the result
      expect(result).toBeDefined();
      expect(result).toHaveProperty('type', 'agent');
      expect(result).toHaveProperty('params', { workspaceId: 'workspace-1', agentId: 'agent-1' });
    });

    it('should throw an error for an invalid URI', () => {
      // Parse the URI
      expect(() => resourceProvider.parseUri('invalid-uri')).toThrow();
    });
  });
});
