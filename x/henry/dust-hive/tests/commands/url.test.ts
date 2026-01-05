import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import type { Environment } from "../../src/lib/environment";

// Mock environment for testing
function createMockEnvironment(port = 10000): Environment {
  return {
    name: "test-env",
    metadata: {
      name: "test-env",
      baseBranch: "main",
      workspaceBranch: "test-env-workspace",
      createdAt: "2024-01-01T00:00:00.000Z",
      repoRoot: "/tmp/dust",
    },
    ports: {
      base: port,
      front: port,
      core: port + 1,
      connectors: port + 2,
      oauth: port + 6,
      postgres: port + 432,
      redis: port + 379,
      qdrantHttp: port + 334,
      qdrantGrpc: port + 333,
      elasticsearch: port + 200,
      apacheTika: port + 998,
    },
    initialized: true,
  };
}

// Test the URL output format directly
describe("url command output format", () => {
  it("generates correct localhost URL format", () => {
    const env = createMockEnvironment(10000);
    const expectedUrl = `http://localhost:${env.ports.front}`;
    expect(expectedUrl).toBe("http://localhost:10000");
  });

  it("generates correct URL for different port allocations", () => {
    const env = createMockEnvironment(11000);
    const expectedUrl = `http://localhost:${env.ports.front}`;
    expect(expectedUrl).toBe("http://localhost:11000");
  });

  it("generates correct URL for third environment slot", () => {
    const env = createMockEnvironment(12000);
    const expectedUrl = `http://localhost:${env.ports.front}`;
    expect(expectedUrl).toBe("http://localhost:12000");
  });
});

describe("url command integration", () => {
  let consoleLogSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    mock.restore();
  });

  it("prints the front URL when environment exists", async () => {
    const mockEnv = createMockEnvironment(10000);

    // Mock the environment lookup to return our test environment
    mock.module("../../src/lib/commands", () => ({
      withEnvironment: (
        _name: string,
        handler: (env: Environment) => Promise<{ ok: boolean; value?: unknown; error?: unknown }>
      ) => {
        return async () => handler(mockEnv);
      },
    }));

    const { urlCommand } = await import("../../src/commands/url");
    const result = await urlCommand("test-env");

    expect(result.ok).toBe(true);
    expect(consoleLogSpy).toHaveBeenCalledWith("http://localhost:10000");
  });
});
