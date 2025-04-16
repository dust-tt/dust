// tests/integration/api/workspaces.test.ts
import request from 'supertest';
import { app, httpServer } from '../../../src/server';
import { createMockDustService } from '../../mocks/mockDustService';
import { createTestToken } from '../../utils/test-utils';
import { workspaces } from '../../fixtures/workspaces';

// Mock the DustService
jest.mock('../../../src/services/dustService', () => {
  return {
    DustService: jest.fn().mockImplementation(() => createMockDustService()),
  };
});

describe('Workspace API Endpoints', () => {
  let server: any;
  let token: string;

  beforeAll(async () => {
    // Start the server
    server = httpServer.listen(0);
    
    // Create a test token
    token = createTestToken();
  });

  afterAll(async () => {
    // Close the server
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });

  describe('GET /api/v1/workspaces', () => {
    it('should return a list of workspaces', async () => {
      const response = await request(app)
        .get('/api/v1/workspaces')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('workspaces');
      expect(Array.isArray(response.body.workspaces)).toBe(true);
      expect(response.body.workspaces.length).toBeGreaterThan(0);
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/v1/workspaces');

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/v1/workspaces/:workspaceId', () => {
    it('should return a workspace by ID', async () => {
      const workspaceId = workspaces[0].id;
      
      const response = await request(app)
        .get(`/api/v1/workspaces/${workspaceId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id', workspaceId);
      expect(response.body).toHaveProperty('name');
      expect(response.body).toHaveProperty('description');
    });

    it('should return 404 for non-existent workspace', async () => {
      const response = await request(app)
        .get('/api/v1/workspaces/non-existent')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
    });

    it('should return 401 without authentication', async () => {
      const workspaceId = workspaces[0].id;
      
      const response = await request(app)
        .get(`/api/v1/workspaces/${workspaceId}`);

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/v1/workspaces/:workspaceId/agents', () => {
    it('should return a list of agents for a workspace', async () => {
      const workspaceId = workspaces[0].id;
      
      const response = await request(app)
        .get(`/api/v1/workspaces/${workspaceId}/agents`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('agents');
      expect(Array.isArray(response.body.agents)).toBe(true);
      expect(response.body.agents.length).toBeGreaterThan(0);
    });

    it('should return 404 for non-existent workspace', async () => {
      const response = await request(app)
        .get('/api/v1/workspaces/non-existent/agents')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
    });

    it('should return 401 without authentication', async () => {
      const workspaceId = workspaces[0].id;
      
      const response = await request(app)
        .get(`/api/v1/workspaces/${workspaceId}/agents`);

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/v1/workspaces/:workspaceId/knowledge-bases', () => {
    it('should return a list of knowledge bases for a workspace', async () => {
      const workspaceId = workspaces[0].id;
      
      const response = await request(app)
        .get(`/api/v1/workspaces/${workspaceId}/knowledge-bases`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('knowledgeBases');
      expect(Array.isArray(response.body.knowledgeBases)).toBe(true);
      expect(response.body.knowledgeBases.length).toBeGreaterThan(0);
    });

    it('should return 404 for non-existent workspace', async () => {
      const response = await request(app)
        .get('/api/v1/workspaces/non-existent/knowledge-bases')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
    });

    it('should return 401 without authentication', async () => {
      const workspaceId = workspaces[0].id;
      
      const response = await request(app)
        .get(`/api/v1/workspaces/${workspaceId}/knowledge-bases`);

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/v1/workspaces/:workspaceId/connectors', () => {
    it('should return a list of connectors for a workspace', async () => {
      const workspaceId = workspaces[0].id;
      
      const response = await request(app)
        .get(`/api/v1/workspaces/${workspaceId}/connectors`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('connectors');
      expect(Array.isArray(response.body.connectors)).toBe(true);
      expect(response.body.connectors.length).toBeGreaterThan(0);
    });

    it('should return 404 for non-existent workspace', async () => {
      const response = await request(app)
        .get('/api/v1/workspaces/non-existent/connectors')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
    });

    it('should return 401 without authentication', async () => {
      const workspaceId = workspaces[0].id;
      
      const response = await request(app)
        .get(`/api/v1/workspaces/${workspaceId}/connectors`);

      expect(response.status).toBe(401);
    });
  });
});
