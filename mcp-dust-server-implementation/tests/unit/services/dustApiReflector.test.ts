// tests/unit/services/dustApiReflector.test.ts
import { DustApiReflector } from '../../../src/services/dustApiReflector';
import { DustService } from '../../../src/services/dustService';
import { MCPServer } from '../../../src/types/server';
import { mock } from 'jest-mock-extended';
import { workspaces } from '../../fixtures/workspaces';
import { agents } from '../../fixtures/agents';
import { knowledgeBases } from '../../fixtures/knowledgeBases';
import { connectors } from '../../fixtures/connectors';

describe('DustApiReflector', () => {
  let dustApiReflector: DustApiReflector;
  let mockDustService: DustService;
  let mockMCPServer: MCPServer;

  beforeEach(() => {
    // Create mock services
    mockDustService = mock<DustService>();
    mockMCPServer = mock<MCPServer>();
    
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
    
    // Create a new DustApiReflector instance
    dustApiReflector = new DustApiReflector(mockDustService, mockMCPServer);
  });

  describe('constructor', () => {
    it('should create a new DustApiReflector instance with the provided services', () => {
      expect(dustApiReflector).toBeDefined();
    });
  });

  describe('reflect', () => {
    it('should register resource templates and tools with the MCP server', async () => {
      // Reflect the API
      await dustApiReflector.reflect();
      
      // Verify resource templates were registered
      expect(mockMCPServer.addResourceTemplate).toHaveBeenCalled();
      
      // Verify tools were registered
      expect(mockMCPServer.addTool).toHaveBeenCalled();
    });
  });

  describe('registerResourceTemplates', () => {
    it('should register resource templates for workspaces, agents, knowledge bases, and connectors', async () => {
      // Register resource templates
      await dustApiReflector.registerResourceTemplates();
      
      // Verify resource templates were registered
      expect(mockMCPServer.addResourceTemplate).toHaveBeenCalledTimes(5);
      
      // Verify the root resource template was registered
      expect(mockMCPServer.addResourceTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          uriTemplate: 'dust://',
          name: 'Dust API',
        })
      );
      
      // Verify the workspaces resource template was registered
      expect(mockMCPServer.addResourceTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          uriTemplate: 'dust://workspaces',
          name: 'Workspaces',
        })
      );
      
      // Verify the workspace resource template was registered
      expect(mockMCPServer.addResourceTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          uriTemplate: 'dust://workspaces/{workspaceId}',
          name: 'Workspace',
        })
      );
      
      // Verify the agents resource template was registered
      expect(mockMCPServer.addResourceTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          uriTemplate: 'dust://workspaces/{workspaceId}/agents',
          name: 'Agents',
        })
      );
      
      // Verify the agent resource template was registered
      expect(mockMCPServer.addResourceTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          uriTemplate: 'dust://workspaces/{workspaceId}/agents/{agentId}',
          name: 'Agent',
        })
      );
    });
  });

  describe('registerTools', () => {
    it('should register tools for agent execution, knowledge base search, and connector sync', async () => {
      // Register tools
      await dustApiReflector.registerTools();
      
      // Verify tools were registered
      expect(mockMCPServer.addTool).toHaveBeenCalledTimes(3);
      
      // Verify the agent execution tool was registered
      expect(mockMCPServer.addTool).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'dust/agent/execute',
          description: expect.any(String),
        })
      );
      
      // Verify the knowledge base search tool was registered
      expect(mockMCPServer.addTool).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'dust/knowledge/search',
          description: expect.any(String),
        })
      );
      
      // Verify the connector sync tool was registered
      expect(mockMCPServer.addTool).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'dust/connector/sync',
          description: expect.any(String),
        })
      );
    });
  });

  describe('resource templates', () => {
    it('should load the root resource', async () => {
      // Register resource templates
      await dustApiReflector.registerResourceTemplates();
      
      // Get the root resource template
      const rootTemplate = mockMCPServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'dust://'
      )[0];
      
      // Load the resource
      const result = await rootTemplate.load({}, { userId: 'test-user-id' });
      
      // Verify the result
      expect(result).toBeDefined();
      expect(result).toHaveProperty('text');
      
      // Parse the result
      const content = JSON.parse(result.text);
      expect(content).toHaveProperty('name', 'Dust API');
      expect(content).toHaveProperty('version');
      expect(content).toHaveProperty('resources');
      expect(content.resources).toContain('dust://workspaces');
    });

    it('should load the workspaces resource', async () => {
      // Register resource templates
      await dustApiReflector.registerResourceTemplates();
      
      // Get the workspaces resource template
      const workspacesTemplate = mockMCPServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'dust://workspaces'
      )[0];
      
      // Load the resource
      const result = await workspacesTemplate.load({}, { userId: 'test-user-id' });
      
      // Verify the result
      expect(result).toBeDefined();
      expect(result).toHaveProperty('text');
      
      // Parse the result
      const content = JSON.parse(result.text);
      expect(content).toHaveProperty('workspaces');
      expect(content.workspaces).toHaveLength(workspaces.length);
      expect(content.workspaces[0]).toHaveProperty('id', workspaces[0].id);
      expect(content.workspaces[0]).toHaveProperty('name', workspaces[0].name);
    });

    it('should load a workspace resource', async () => {
      // Register resource templates
      await dustApiReflector.registerResourceTemplates();
      
      // Get the workspace resource template
      const workspaceTemplate = mockMCPServer.addResourceTemplate.mock.calls.find(
        call => call[0].uriTemplate === 'dust://workspaces/{workspaceId}'
      )[0];
      
      // Load the resource
      const result = await workspaceTemplate.load({ workspaceId: workspaces[0].id }, { userId: 'test-user-id' });
      
      // Verify the result
      expect(result).toBeDefined();
      expect(result).toHaveProperty('text');
      
      // Parse the result
      const content = JSON.parse(result.text);
      expect(content).toHaveProperty('id', workspaces[0].id);
      expect(content).toHaveProperty('name', workspaces[0].name);
      expect(content).toHaveProperty('description', workspaces[0].description);
    });
  });

  describe('tools', () => {
    it('should execute the agent tool', async () => {
      // Mock the DustService.executeAgent method
      mockDustService.executeAgent.mockResolvedValue({
        id: 'run-1',
        agentId: 'agent-1',
        workspaceId: 'workspace-1',
        status: 'completed',
        input: 'Test input',
        output: 'Test output',
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:01:00.000Z',
        completedAt: '2023-01-01T00:01:00.000Z',
      });
      
      // Register tools
      await dustApiReflector.registerTools();
      
      // Get the agent execution tool
      const agentTool = mockMCPServer.addTool.mock.calls.find(
        call => call[0].name === 'dust/agent/execute'
      )[0];
      
      // Execute the tool
      const result = await agentTool.execute({
        workspaceId: 'workspace-1',
        agentId: 'agent-1',
        input: 'Test input',
      }, {
        userId: 'test-user-id',
        sessionId: 'test-session-id',
      });
      
      // Verify the result
      expect(result).toBeDefined();
      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');
      
      // Parse the result
      const content = JSON.parse(result.content[0].text);
      expect(content).toHaveProperty('id', 'run-1');
      expect(content).toHaveProperty('agentId', 'agent-1');
      expect(content).toHaveProperty('workspaceId', 'workspace-1');
      expect(content).toHaveProperty('status', 'completed');
      expect(content).toHaveProperty('input', 'Test input');
      expect(content).toHaveProperty('output', 'Test output');
    });

    it('should execute the knowledge base search tool', async () => {
      // Mock the DustService.searchKnowledgeBase method
      mockDustService.searchKnowledgeBase.mockResolvedValue({
        id: 'search-1',
        knowledgeBaseId: 'kb-1',
        workspaceId: 'workspace-1',
        query: 'Test query',
        results: [
          {
            id: 'doc-1',
            title: 'Document 1',
            content: 'This is document 1 content',
            score: 0.95,
          },
        ],
        createdAt: '2023-01-01T00:00:00.000Z',
      });
      
      // Register tools
      await dustApiReflector.registerTools();
      
      // Get the knowledge base search tool
      const searchTool = mockMCPServer.addTool.mock.calls.find(
        call => call[0].name === 'dust/knowledge/search'
      )[0];
      
      // Execute the tool
      const result = await searchTool.execute({
        workspaceId: 'workspace-1',
        knowledgeBaseId: 'kb-1',
        query: 'Test query',
      }, {
        userId: 'test-user-id',
        sessionId: 'test-session-id',
      });
      
      // Verify the result
      expect(result).toBeDefined();
      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');
      
      // Parse the result
      const content = JSON.parse(result.content[0].text);
      expect(content).toHaveProperty('id', 'search-1');
      expect(content).toHaveProperty('knowledgeBaseId', 'kb-1');
      expect(content).toHaveProperty('workspaceId', 'workspace-1');
      expect(content).toHaveProperty('query', 'Test query');
      expect(content).toHaveProperty('results');
      expect(content.results).toHaveLength(1);
      expect(content.results[0]).toHaveProperty('id', 'doc-1');
      expect(content.results[0]).toHaveProperty('title', 'Document 1');
    });
  });
});
