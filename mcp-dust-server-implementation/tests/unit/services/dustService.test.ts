// tests/unit/services/dustService.test.ts
import { DustService } from '../../../src/services/dustService';
import nock from 'nock';
import { workspaces } from '../../fixtures/workspaces';
import { agents, agentRuns } from '../../fixtures/agents';
import { knowledgeBases, searchResults } from '../../fixtures/knowledgeBases';
import { connectors } from '../../fixtures/connectors';

describe('DustService', () => {
  let dustService: DustService;
  const baseUrl = 'https://dust-api.example.com';
  const apiKey = 'test-api-key';
  const workspaceId = 'workspace-1';
  const agentId = 'agent-1';

  beforeAll(() => {
    // Mock environment variables
    process.env.DUST_API_URL = baseUrl;
    process.env.DUST_API_KEY = apiKey;
    process.env.DUST_WORKSPACE_ID = workspaceId;
    process.env.DUST_AGENT_ID = agentId;

    // Disable real HTTP requests
    nock.disableNetConnect();
  });

  afterAll(() => {
    // Clean up
    nock.cleanAll();
    nock.enableNetConnect();
  });

  beforeEach(() => {
    // Create a new DustService instance for each test
    dustService = new DustService({
      apiKey,
      workspaceId,
      agentId,
      baseUrl,
    });
  });

  afterEach(() => {
    // Ensure all nock interceptors have been used
    expect(nock.isDone()).toBe(true);
  });

  describe('validateApiKey', () => {
    it('should return true for a valid API key', async () => {
      // Mock the API response
      nock(baseUrl)
        .get('/api/v1/workspaces')
        .reply(200, { workspaces: [] });

      const isValid = await dustService.validateApiKey();
      expect(isValid).toBe(true);
    });

    it('should return false for an invalid API key', async () => {
      // Mock the API response
      nock(baseUrl)
        .get('/api/v1/workspaces')
        .reply(401, { error: 'Invalid API key' });

      const isValid = await dustService.validateApiKey();
      expect(isValid).toBe(false);
    });
  });

  describe('getWorkspaces', () => {
    it('should return a list of workspaces', async () => {
      // Mock the API response
      nock(baseUrl)
        .get('/api/v1/workspaces')
        .reply(200, { workspaces });

      const result = await dustService.getWorkspaces();
      expect(result).toEqual(workspaces);
    });

    it('should handle API errors', async () => {
      // Mock the API response
      nock(baseUrl)
        .get('/api/v1/workspaces')
        .reply(500, { error: 'Internal server error' });

      await expect(dustService.getWorkspaces()).rejects.toThrow();
    });
  });

  describe('getWorkspace', () => {
    it('should return a workspace by ID', async () => {
      const workspace = workspaces[0];
      
      // Mock the API response
      nock(baseUrl)
        .get(`/api/v1/workspaces/${workspace.id}`)
        .reply(200, { workspace });

      const result = await dustService.getWorkspace(workspace.id);
      expect(result).toEqual(workspace);
    });

    it('should handle API errors', async () => {
      // Mock the API response
      nock(baseUrl)
        .get('/api/v1/workspaces/invalid-id')
        .reply(404, { error: 'Workspace not found' });

      await expect(dustService.getWorkspace('invalid-id')).rejects.toThrow();
    });
  });

  describe('getAgents', () => {
    it('should return a list of agents for a workspace', async () => {
      const workspaceAgents = agents.filter(agent => agent.workspaceId === workspaceId);
      
      // Mock the API response
      nock(baseUrl)
        .get(`/api/v1/workspaces/${workspaceId}/agents`)
        .reply(200, { agents: workspaceAgents });

      const result = await dustService.getAgents(workspaceId);
      expect(result).toEqual(workspaceAgents);
    });

    it('should handle API errors', async () => {
      // Mock the API response
      nock(baseUrl)
        .get('/api/v1/workspaces/invalid-id/agents')
        .reply(404, { error: 'Workspace not found' });

      await expect(dustService.getAgents('invalid-id')).rejects.toThrow();
    });
  });

  describe('getAgent', () => {
    it('should return an agent by ID', async () => {
      const agent = agents.find(a => a.id === agentId && a.workspaceId === workspaceId);
      
      // Mock the API response
      nock(baseUrl)
        .get(`/api/v1/workspaces/${workspaceId}/agents/${agentId}`)
        .reply(200, { agent });

      const result = await dustService.getAgent(workspaceId, agentId);
      expect(result).toEqual(agent);
    });

    it('should handle API errors', async () => {
      // Mock the API response
      nock(baseUrl)
        .get(`/api/v1/workspaces/${workspaceId}/agents/invalid-id`)
        .reply(404, { error: 'Agent not found' });

      await expect(dustService.getAgent(workspaceId, 'invalid-id')).rejects.toThrow();
    });
  });

  describe('executeAgent', () => {
    it('should execute an agent and return the run', async () => {
      const input = 'Test input';
      const run = agentRuns[0];
      
      // Mock the API response
      nock(baseUrl)
        .post(`/api/v1/workspaces/${workspaceId}/agents/${agentId}/execute`, { input })
        .reply(200, { run });

      const result = await dustService.executeAgent(workspaceId, agentId, input);
      expect(result).toEqual(run);
    });

    it('should handle API errors', async () => {
      const input = 'Test input';
      
      // Mock the API response
      nock(baseUrl)
        .post(`/api/v1/workspaces/${workspaceId}/agents/invalid-id/execute`, { input })
        .reply(404, { error: 'Agent not found' });

      await expect(dustService.executeAgent(workspaceId, 'invalid-id', input)).rejects.toThrow();
    });
  });

  describe('getKnowledgeBases', () => {
    it('should return a list of knowledge bases for a workspace', async () => {
      const workspaceKnowledgeBases = knowledgeBases.filter(kb => kb.workspaceId === workspaceId);
      
      // Mock the API response
      nock(baseUrl)
        .get(`/api/v1/workspaces/${workspaceId}/knowledge-bases`)
        .reply(200, { knowledgeBases: workspaceKnowledgeBases });

      const result = await dustService.getKnowledgeBases(workspaceId);
      expect(result).toEqual(workspaceKnowledgeBases);
    });

    it('should handle API errors', async () => {
      // Mock the API response
      nock(baseUrl)
        .get('/api/v1/workspaces/invalid-id/knowledge-bases')
        .reply(404, { error: 'Workspace not found' });

      await expect(dustService.getKnowledgeBases('invalid-id')).rejects.toThrow();
    });
  });

  describe('searchKnowledgeBase', () => {
    it('should search a knowledge base and return results', async () => {
      const knowledgeBaseId = 'kb-1';
      const query = 'test query';
      const searchResult = searchResults[0];
      
      // Mock the API response
      nock(baseUrl)
        .post(`/api/v1/workspaces/${workspaceId}/knowledge-bases/${knowledgeBaseId}/search`, { query })
        .reply(200, { searchResult });

      const result = await dustService.searchKnowledgeBase(workspaceId, knowledgeBaseId, query);
      expect(result).toEqual(searchResult);
    });

    it('should handle API errors', async () => {
      const query = 'test query';
      
      // Mock the API response
      nock(baseUrl)
        .post(`/api/v1/workspaces/${workspaceId}/knowledge-bases/invalid-id/search`, { query })
        .reply(404, { error: 'Knowledge base not found' });

      await expect(dustService.searchKnowledgeBase(workspaceId, 'invalid-id', query)).rejects.toThrow();
    });
  });

  describe('getConnectors', () => {
    it('should return a list of connectors for a workspace', async () => {
      const workspaceConnectors = connectors.filter(connector => connector.workspaceId === workspaceId);
      
      // Mock the API response
      nock(baseUrl)
        .get(`/api/v1/workspaces/${workspaceId}/connectors`)
        .reply(200, { connectors: workspaceConnectors });

      const result = await dustService.getConnectors(workspaceId);
      expect(result).toEqual(workspaceConnectors);
    });

    it('should handle API errors', async () => {
      // Mock the API response
      nock(baseUrl)
        .get('/api/v1/workspaces/invalid-id/connectors')
        .reply(404, { error: 'Workspace not found' });

      await expect(dustService.getConnectors('invalid-id')).rejects.toThrow();
    });
  });
});
