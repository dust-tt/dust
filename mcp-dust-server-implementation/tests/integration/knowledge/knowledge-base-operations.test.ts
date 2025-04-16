// tests/integration/knowledge/knowledge-base-operations.test.ts
import request from 'supertest';
import { app, httpServer } from '../../../src/server';
import { createMockDustService } from '../../mocks/mockDustService';
import { createTestToken } from '../../utils/test-utils';
import { workspaces } from '../../fixtures/workspaces';
import { knowledgeBases, documents, searchResults } from '../../fixtures/knowledgeBases';

// Mock the DustService
jest.mock('../../../src/services/dustService', () => {
  return {
    DustService: jest.fn().mockImplementation(() => createMockDustService()),
  };
});

describe('Knowledge Base Operations Integration Tests', () => {
  let server: any;
  let token: string;
  let sessionId: string;

  beforeAll(async () => {
    // Start the server
    server = httpServer.listen(0);
    
    // Create a test token
    token = createTestToken();
    
    // Create a session
    const sessionResponse = await request(app)
      .post('/stream')
      .set('Authorization', `Bearer ${token}`)
      .send({
        jsonrpc: '2.0',
        method: 'mcp.session.create',
        params: {},
        id: 1,
      });
    
    sessionId = sessionResponse.body.result.sessionId;
  });

  afterAll(async () => {
    // Close the server
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });

  describe('REST API Knowledge Base Operations', () => {
    it('should get a specific knowledge base by ID', async () => {
      // Get a workspace ID and knowledge base ID
      const workspaceId = workspaces[0].id;
      const kb = knowledgeBases.find(kb => kb.workspaceId === workspaceId);
      
      // Make a request to get the knowledge base
      const response = await request(app)
        .get(`/api/v1/workspaces/${workspaceId}/knowledge-bases/${kb.id}`)
        .set('Authorization', `Bearer ${token}`);

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id', kb.id);
      expect(response.body).toHaveProperty('name', kb.name);
      expect(response.body).toHaveProperty('description', kb.description);
      expect(response.body).toHaveProperty('workspaceId', workspaceId);
      expect(response.body).toHaveProperty('createdAt');
      expect(response.body).toHaveProperty('updatedAt');
    });

    it('should return 404 for a non-existent knowledge base', async () => {
      // Get a workspace ID
      const workspaceId = workspaces[0].id;
      
      // Make a request to get a non-existent knowledge base
      const response = await request(app)
        .get(`/api/v1/workspaces/${workspaceId}/knowledge-bases/non-existent`)
        .set('Authorization', `Bearer ${token}`);

      // Verify the response
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'NOT_FOUND');
    });

    it('should search a knowledge base', async () => {
      // Get a workspace ID and knowledge base ID
      const workspaceId = workspaces[0].id;
      const kb = knowledgeBases.find(kb => kb.workspaceId === workspaceId);
      
      // Make a request to search the knowledge base
      const response = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/knowledge-bases/${kb.id}/search`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          query: 'Test query',
        });

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('knowledgeBaseId', kb.id);
      expect(response.body).toHaveProperty('workspaceId', workspaceId);
      expect(response.body).toHaveProperty('query', 'Test query');
      expect(response.body).toHaveProperty('results');
      expect(Array.isArray(response.body.results)).toBe(true);
      expect(response.body.results.length).toBeGreaterThan(0);
      
      // Verify the result data
      const result = response.body.results[0];
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('score');
    });

    it('should get documents in a knowledge base', async () => {
      // Get a workspace ID and knowledge base ID
      const workspaceId = workspaces[0].id;
      const kb = knowledgeBases.find(kb => kb.workspaceId === workspaceId);
      
      // Make a request to get documents
      const response = await request(app)
        .get(`/api/v1/workspaces/${workspaceId}/knowledge-bases/${kb.id}/documents`)
        .set('Authorization', `Bearer ${token}`);

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('documents');
      expect(Array.isArray(response.body.documents)).toBe(true);
      
      // Get the expected documents for this knowledge base
      const kbDocuments = documents.filter(doc => doc.knowledgeBaseId === kb.id && doc.workspaceId === workspaceId);
      expect(response.body.documents.length).toBe(kbDocuments.length);
      
      // Verify the document data
      const document = response.body.documents[0];
      expect(document).toHaveProperty('id');
      expect(document).toHaveProperty('title');
      expect(document).toHaveProperty('content');
      expect(document).toHaveProperty('knowledgeBaseId', kb.id);
      expect(document).toHaveProperty('workspaceId', workspaceId);
      expect(document).toHaveProperty('createdAt');
      expect(document).toHaveProperty('updatedAt');
    });

    it('should get a specific document by ID', async () => {
      // Get a workspace ID, knowledge base ID, and document ID
      const workspaceId = workspaces[0].id;
      const kb = knowledgeBases.find(kb => kb.workspaceId === workspaceId);
      const doc = documents.find(doc => doc.knowledgeBaseId === kb.id && doc.workspaceId === workspaceId);
      
      // Make a request to get the document
      const response = await request(app)
        .get(`/api/v1/workspaces/${workspaceId}/knowledge-bases/${kb.id}/documents/${doc.id}`)
        .set('Authorization', `Bearer ${token}`);

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id', doc.id);
      expect(response.body).toHaveProperty('title', doc.title);
      expect(response.body).toHaveProperty('content', doc.content);
      expect(response.body).toHaveProperty('knowledgeBaseId', kb.id);
      expect(response.body).toHaveProperty('workspaceId', workspaceId);
      expect(response.body).toHaveProperty('createdAt');
      expect(response.body).toHaveProperty('updatedAt');
    });
  });

  describe('MCP Knowledge Base Operations', () => {
    it('should load a knowledge base via MCP', async () => {
      // Get a workspace ID and knowledge base ID
      const workspaceId = workspaces[0].id;
      const kb = knowledgeBases.find(kb => kb.workspaceId === workspaceId);
      
      // Make a request to load the knowledge base
      const response = await request(app)
        .post('/stream')
        .set('Authorization', `Bearer ${token}`)
        .set('Mcp-Session-Id', sessionId)
        .send({
          jsonrpc: '2.0',
          method: 'mcp.resource.load',
          params: {
            uri: `dust://workspaces/${workspaceId}/knowledge-bases/${kb.id}`,
          },
          id: 2,
        });

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('jsonrpc', '2.0');
      expect(response.body).toHaveProperty('id', 2);
      expect(response.body).toHaveProperty('result');
      expect(response.body.result).toHaveProperty('content');
      expect(response.body.result).toHaveProperty('mimeType', 'application/json');
      
      // Parse the content
      const content = JSON.parse(response.body.result.content.text);
      expect(content).toHaveProperty('id', kb.id);
      expect(content).toHaveProperty('name', kb.name);
      expect(content).toHaveProperty('description', kb.description);
      expect(content).toHaveProperty('workspaceId', workspaceId);
    });

    it('should search a knowledge base via MCP tool', async () => {
      // Get a workspace ID and knowledge base ID
      const workspaceId = workspaces[0].id;
      const kb = knowledgeBases.find(kb => kb.workspaceId === workspaceId);
      
      // Make a request to search the knowledge base
      const response = await request(app)
        .post('/stream')
        .set('Authorization', `Bearer ${token}`)
        .set('Mcp-Session-Id', sessionId)
        .send({
          jsonrpc: '2.0',
          method: 'mcp.tool.execute',
          params: {
            name: 'dust/knowledge/search',
            parameters: {
              workspaceId,
              knowledgeBaseId: kb.id,
              query: 'Test query via MCP',
            },
          },
          id: 3,
        });

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('jsonrpc', '2.0');
      expect(response.body).toHaveProperty('id', 3);
      expect(response.body).toHaveProperty('result');
      expect(response.body.result).toHaveProperty('content');
      expect(Array.isArray(response.body.result.content)).toBe(true);
      expect(response.body.result.content.length).toBeGreaterThan(0);
      
      // Verify the content
      const content = response.body.result.content[0];
      expect(content).toHaveProperty('type', 'text');
      expect(content).toHaveProperty('text');
      
      // Parse the text as JSON
      const parsedText = JSON.parse(content.text);
      expect(parsedText).toHaveProperty('id');
      expect(parsedText).toHaveProperty('knowledgeBaseId', kb.id);
      expect(parsedText).toHaveProperty('workspaceId', workspaceId);
      expect(parsedText).toHaveProperty('query', 'Test query via MCP');
      expect(parsedText).toHaveProperty('results');
      expect(Array.isArray(parsedText.results)).toBe(true);
      expect(parsedText.results.length).toBeGreaterThan(0);
    });

    it('should describe the knowledge base search tool', async () => {
      // Make a request to describe the tool
      const response = await request(app)
        .post('/stream')
        .set('Authorization', `Bearer ${token}`)
        .set('Mcp-Session-Id', sessionId)
        .send({
          jsonrpc: '2.0',
          method: 'mcp.tool.describe',
          params: {
            name: 'dust/knowledge/search',
          },
          id: 4,
        });

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('jsonrpc', '2.0');
      expect(response.body).toHaveProperty('id', 4);
      expect(response.body).toHaveProperty('result');
      expect(response.body.result).toHaveProperty('name', 'dust/knowledge/search');
      expect(response.body.result).toHaveProperty('description');
      expect(response.body.result).toHaveProperty('parameters');
      
      // Verify the parameters
      const parameters = response.body.result.parameters;
      expect(parameters).toHaveProperty('type', 'object');
      expect(parameters).toHaveProperty('properties');
      expect(parameters.properties).toHaveProperty('workspaceId');
      expect(parameters.properties).toHaveProperty('knowledgeBaseId');
      expect(parameters.properties).toHaveProperty('query');
      expect(parameters).toHaveProperty('required');
      expect(parameters.required).toContain('workspaceId');
      expect(parameters.required).toContain('knowledgeBaseId');
      expect(parameters.required).toContain('query');
    });

    it('should reject knowledge base search with invalid parameters', async () => {
      // Make a request to search the knowledge base with invalid parameters
      const response = await request(app)
        .post('/stream')
        .set('Authorization', `Bearer ${token}`)
        .set('Mcp-Session-Id', sessionId)
        .send({
          jsonrpc: '2.0',
          method: 'mcp.tool.execute',
          params: {
            name: 'dust/knowledge/search',
            parameters: {
              // Missing required parameters
              workspaceId: workspaces[0].id,
              // Missing knowledgeBaseId
              query: 'Test query',
            },
          },
          id: 5,
        });

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('jsonrpc', '2.0');
      expect(response.body).toHaveProperty('id', 5);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
    });
  });
});
