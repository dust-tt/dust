// tests/e2e/setup.ts
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import supertest from 'supertest';
import { createMockServer } from './mock-server.js';

// Load environment variables from .env.e2e file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const e2eEnvPath = path.resolve(__dirname, '../../.env.e2e');

dotenv.config({ path: e2eEnvPath });

// Set test environment variables
process.env.NODE_ENV = 'test';

// Global variables
let mockServer: any;
let request: supertest.SuperTest<supertest.Test>;
let authToken: string;
let sessionId: string;

// Setup before all tests
beforeAll(async () => {
  // Generate a random port between 5002 and 6000
  const port = Math.floor(Math.random() * 998) + 5002;
  console.log(`Starting mock server on port ${port}`);

  // Start the mock server
  mockServer = createMockServer(port);
  request = supertest(mockServer.app);

  // Get authentication token
  const loginResponse = await request
    .post('/api/v1/auth/login')
    .send({ apiKey: 'test_api_key' })
    .expect(200);

  authToken = loginResponse.body.token;

  // Create MCP session
  const sessionResponse = await request
    .post('/stream')
    .set('Authorization', `Bearer ${authToken}`)
    .send({
      jsonrpc: '2.0',
      method: 'mcp.session.create',
      params: {},
      id: 1,
    })
    .expect(200);

  sessionId = sessionResponse.body.result.sessionId;
});

// Cleanup after all tests
afterAll(async () => {
  // Close the server
  if (mockServer) {
    mockServer.close();
  }
});

// Export variables and utilities for tests
export { request, authToken, sessionId };

// Helper functions
export const getAuthHeader = () => ({ Authorization: `Bearer ${authToken}` });
export const getMcpHeaders = () => ({
  Authorization: `Bearer ${authToken}`,
  'Mcp-Session-Id': sessionId,
  'Content-Type': 'application/json',
});

// MCP request helper
export const mcpRequest = async (method: string, params: any, id: number = 1) => {
  return request.post('/stream').set(getMcpHeaders()).send({
    jsonrpc: '2.0',
    method,
    params,
    id,
  });
};
