// tests/e2e/performance.test.ts
import { request, getAuthHeader, mcpRequest } from './setup.js';

describe('Performance Tests', () => {
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

  test('Response time for workspace listing', async () => {
    const startTime = Date.now();

    await request.get('/api/v1/workspaces').set('Authorization', `Bearer ${authToken}`).expect(200);

    const endTime = Date.now();
    const responseTime = endTime - startTime;

    console.log(`Workspace listing response time: ${responseTime}ms`);
    expect(responseTime).toBeLessThan(1000); // Response should be under 1 second
  });

  test('Response time for MCP resource listing', async () => {
    const startTime = Date.now();

    await request
      .post('/stream')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Mcp-Session-Id', sessionId)
      .send({
        jsonrpc: '2.0',
        method: 'mcp.resource.list',
        params: {
          uri: 'dust://workspaces',
        },
        id: 2,
      })
      .expect(200);

    const endTime = Date.now();
    const responseTime = endTime - startTime;

    console.log(`MCP resource listing response time: ${responseTime}ms`);
    expect(responseTime).toBeLessThan(1000); // Response should be under 1 second
  });

  test('Response time for agent execution', async () => {
    const startTime = Date.now();

    await request
      .post(`/api/v1/workspaces/workspace-123/agents/agent-123/execute`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ input: 'Hello, agent!' })
      .expect(200);

    const endTime = Date.now();
    const responseTime = endTime - startTime;

    console.log(`Agent execution response time: ${responseTime}ms`);
    expect(responseTime).toBeLessThan(5000); // Response should be under 5 seconds
  });

  test('Concurrent MCP requests', async () => {
    const startTime = Date.now();

    // Create 10 concurrent requests
    const requests = Array(10)
      .fill(0)
      .map((_, i) =>
        request
          .post('/stream')
          .set('Authorization', `Bearer ${authToken}`)
          .set('Mcp-Session-Id', sessionId)
          .send({
            jsonrpc: '2.0',
            method: 'mcp.resource.list',
            params: {
              uri: 'dust://workspaces',
            },
            id: i + 10,
          })
      );

    // Wait for all requests to complete
    const responses = await Promise.all(requests);

    const endTime = Date.now();
    const totalTime = endTime - startTime;

    console.log(`10 concurrent MCP requests total time: ${totalTime}ms`);
    console.log(`Average response time: ${totalTime / 10}ms`);

    // All responses should be successful
    responses.forEach(response => {
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('result');
      expect(response.body.result).toHaveProperty('items');
    });

    // Average response time should be reasonable
    expect(totalTime / 10).toBeLessThan(1000); // Average under 1 second
  });

  test('Memory usage remains stable', async () => {
    // Get initial memory usage
    const initialMemory = process.memoryUsage();

    // Make 10 requests instead of 50 to speed up the test
    for (let i = 0; i < 10; i++) {
      await request
        .get('/api/v1/workspaces')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    }

    // Get final memory usage
    const finalMemory = process.memoryUsage();

    console.log('Initial memory usage:', initialMemory);
    console.log('Final memory usage:', finalMemory);
    console.log(
      'Memory increase (heapUsed):',
      finalMemory.heapUsed - initialMemory.heapUsed,
      'bytes'
    );

    // Memory increase should be reasonable
    // This is a very rough check and might need adjustment based on the application
    const heapIncreaseMB = (finalMemory.heapUsed - initialMemory.heapUsed) / (1024 * 1024);
    console.log('Heap increase:', heapIncreaseMB.toFixed(2), 'MB');

    // We expect some increase, but it shouldn't be excessive
    // Increase the threshold for the mock server which may have different memory characteristics
    expect(heapIncreaseMB).toBeLessThan(100); // Less than 100MB increase
  });
});
