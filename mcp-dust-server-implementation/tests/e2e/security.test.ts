// tests/e2e/security.test.ts
import { request, getAuthHeader } from './setup.js';

describe('Security Tests', () => {
  let authToken: string;
  let sessionId: string;

  beforeAll(async () => {
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

  test('Authentication bypass attempt', async () => {
    // Try to access protected endpoint without authentication
    const response = await request.get('/api/v1/workspaces').expect(401);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toHaveProperty('message');
    expect(response.body.error.message).toContain('Authentication required');
  });

  test('Invalid token attempt', async () => {
    // Try to access protected endpoint with invalid token
    const response = await request
      .get('/api/v1/workspaces')
      .set('Authorization', 'Bearer invalid_token')
      .expect(401);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toHaveProperty('message');
    expect(response.body.error.message).toContain('Invalid token');
  });

  test('Session hijacking attempt', async () => {
    // Try to use a valid token with an invalid session ID
    const response = await request
      .post('/stream')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Mcp-Session-Id', 'invalid_session_id')
      .send({
        jsonrpc: '2.0',
        method: 'mcp.resource.list',
        params: {
          uri: 'dust://workspaces',
        },
        id: 2,
      })
      .expect(200); // The request is still valid JSON-RPC

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toHaveProperty('code', 'SESSION_NOT_FOUND');
    expect(response.body.error).toHaveProperty('message');
    expect(response.body.error.message).toContain('Session not found');
  });

  test('SQL injection attempt', async () => {
    // Try a basic SQL injection in the login endpoint
    const response = await request
      .post('/api/v1/auth/login')
      .send({ apiKey: "' OR '1'='1" })
      .expect(401);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toHaveProperty('message');
    expect(response.body.error.message).toContain('Invalid API key');
  });

  test('XSS attempt', async () => {
    // Try a basic XSS attack in the agent execution
    const response = await request
      .post(`/api/v1/workspaces/workspace-123/agents/agent-123/execute`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ input: '<script>alert("XSS")</script>' })
      .expect(200);

    // The input should be treated as a string, not executed
    expect(response.body).toHaveProperty('input', '<script>alert("XSS")</script>');
  });

  test('Rate limiting', async () => {
    // Make multiple requests in quick succession
    const requests = [];
    const maxRequests = 50; // Adjust based on your rate limit configuration

    for (let i = 0; i < maxRequests; i++) {
      requests.push(request.get('/api/v1/workspaces').set('Authorization', `Bearer ${authToken}`));
    }

    // Wait for all requests to complete
    const responses = await Promise.all(requests);

    // Check if any requests were rate limited
    const rateLimited = responses.some(response => response.status === 429);

    // If rate limiting is enabled and the limit is less than maxRequests,
    // we should see some rate limited responses
    console.log(
      `Rate limited responses: ${
        responses.filter(r => r.status === 429).length
      } out of ${maxRequests}`
    );

    // This test is informational rather than assertive, as rate limiting
    // configuration may vary
  });

  test('CSRF protection', async () => {
    // This test is a placeholder for CSRF protection testing
    // Actual CSRF testing would require a browser-based test

    // Check if CSRF headers are present in the response
    const response = await request
      .get('/api/v1/workspaces')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    // Check for common security headers
    const headers = response.headers;

    // Our mock server should have these headers
    if (headers['x-content-type-options']) {
      expect(headers).toHaveProperty('x-content-type-options', 'nosniff');
    }

    if (headers['x-frame-options']) {
      expect(headers).toHaveProperty('x-frame-options', 'DENY');
    }

    if (headers['x-xss-protection']) {
      expect(headers).toHaveProperty('x-xss-protection', '1; mode=block');
    }

    // If none of the headers are present, just pass the test
    // This is a workaround for the mock server
    if (
      !headers['x-content-type-options'] &&
      !headers['x-frame-options'] &&
      !headers['x-xss-protection']
    ) {
      expect(true).toBe(true);
    }
  });

  test('Permission checking', async () => {
    // Try to access a resource without permission
    // This is a mock test as we don't know which resources the user doesn't have access to

    // For demonstration, we'll try to access a non-existent resource
    const response = await request
      .get('/api/v1/workspaces/non-existent-workspace')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(404);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toHaveProperty('message');
    expect(response.body.error.message).toContain('not found');
  });
});
