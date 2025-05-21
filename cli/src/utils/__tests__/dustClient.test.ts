import type { AgentConfigurationType } from "@dust-tt/types";
import { DustAPI } from "@dust-tt/client";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import envPaths from "env-paths";

// Import the module to be tested
import {
  fetchAndCacheAgentConfigurations,
  // Exporting these for direct testing if needed, though primarily tested via fetchAndCacheAgentConfigurations
  // loadAgentConfigurationsFromCache,
  // saveAgentConfigurationsToCache,
} from "../dustClient";

// --- Mocks ---

// Mock env-paths
jest.mock("env-paths", () => {
  const mockCachePath = path.join("/tmp", "test-dust-cli-cache");
  return jest.fn(() => ({
    cache: mockCachePath,
  }));
});

const MOCK_CACHE_PATH = envPaths("dust-cli", { suffix: "" }).cache;
const MOCK_CACHE_FILE_PATH = path.join(
  MOCK_CACHE_PATH,
  "agent_configurations.json"
);

// In-memory store for our mock file system
let mockFileSystem: Record<string, string> = {};
let mockSystemError: Error | null = null; // To simulate fs errors

jest.mock("fs", () => ({
  ...jest.requireActual("fs"),
  existsSync: jest.fn((filePath) => mockFileSystem[filePath as string] !== undefined),
  // We'll use fs/promises for async operations, but if sync readFile is used elsewhere:
  readFileSync: jest.fn((filePath) => {
    if (mockSystemError) throw mockSystemError;
    if (mockFileSystem[filePath as string] === undefined) throw new Error("File not found");
    return mockFileSystem[filePath as string];
  }),
}));

jest.mock("fs/promises", () => ({
  ...jest.requireActual("fs/promises"),
  readFile: jest.fn(async (filePath, encoding) => {
    if (mockSystemError) throw mockSystemError;
    if (mockFileSystem[filePath as string] === undefined) {
      const error: NodeJS.ErrnoException = new Error("File not found");
      error.code = "ENOENT";
      throw error;
    }
    return mockFileSystem[filePath as string];
  }),
  writeFile: jest.fn(async (filePath, data) => {
    if (mockSystemError) throw mockSystemError;
    mockFileSystem[filePath as string] = data as string;
  }),
  unlink: jest.fn(async (filePath) => {
    if (mockSystemError) throw mockSystemError;
    delete mockFileSystem[filePath as string];
  }),
  mkdir: jest.fn(async (dirPath, options) => {
    if (mockSystemError) throw mockSystemError;
    // For simplicity, we don't need to simulate directory structure in mockFileSystem for these tests
    // but we acknowledge it was called.
  }),
}));

// Mock @dust-tt/client
jest.mock("@dust-tt/client", () => ({
  DustAPI: jest.fn().mockImplementation(() => ({
    getAgentConfigurations: jest.fn(),
  })),
}));

// Helper function to create mock agent configurations
const createMockAgentConfigs = (count: number): AgentConfigurationType[] => {
  return Array.from({ length: count }, (_, i) => ({
    sId: `sId${i}`,
    name: `Agent ${i}`,
    description: `Description ${i}`,
    scope: "workspace",
    generation: {
      id: `genId${i}`,
      prompt: `Prompt ${i}`,
      model: { providerId: "openai", modelId: "gpt-4" },
      temperature: 0.7,
    },
    action: null,
    version: 0,
    status: "active",
  }));
};

const mockDustAPIInstance = new DustAPI({ url: "mock" }, { apiKey: "mock", workspaceId: "mock" }) as jest.Mocked<DustAPI>;

// --- Test Suite Setup ---
describe("dustClient Caching Logic", () => {
  beforeEach(() => {
    // Reset mocks and mock file system before each test
    jest.clearAllMocks();
    mockFileSystem = {};
    mockSystemError = null;
    (envPaths as jest.Mock).mockReturnValue({ cache: MOCK_CACHE_PATH });

    // Ensure that getDustClient in the actual module will return our mocked DustAPI instance
    // This requires modifying getDustClient or how it's used, or deeper mocking.
    // For now, we assume fetchAndCacheAgentConfigurations will use the globally mocked DustAPI.
    // If getDustClient is more complex, this might need adjustment.
    // The current dustClient.ts creates a new DustAPI instance internally.
    // We'll rely on the jest.mock above to ensure any new DustAPI() gets the mocked constructor.
  });

  // --- loadAgentConfigurationsFromCache Tests (implicitly tested via fetchAndCacheAgentConfigurations) ---
  // While we can test these directly, the primary interface is fetchAndCacheAgentConfigurations.
  // We will ensure its behavior covers the scenarios for loadAgentConfigurationsFromCache.

  describe("fetchAndCacheAgentConfigurations", () => {
    const sampleAgents = createMockAgentConfigs(2);

    // Scenario Group: useCache = true
    describe("when useCache is true", () => {
      it("should return cached data and not call API if valid cache exists", async () => {
        const cachedData = {
          timestamp: Date.now(),
          configurations: sampleAgents,
        };
        mockFileSystem[MOCK_CACHE_FILE_PATH] = JSON.stringify(cachedData);

        const result = await fetchAndCacheAgentConfigurations(true);

        expect(result).toEqual(sampleAgents);
        expect(fsp.readFile).toHaveBeenCalledWith(MOCK_CACHE_FILE_PATH, "utf-8");
        expect(mockDustAPIInstance.getAgentConfigurations).not.toHaveBeenCalled();
      });

      it("should call API, save, and return data if cache is stale", async () => {
        const staleCacheData = {
          timestamp: Date.now() - 2 * 24 * 60 * 60 * 1000, // 2 days old
          configurations: createMockAgentConfigs(1), // Different from fresh data
        };
        mockFileSystem[MOCK_CACHE_FILE_PATH] = JSON.stringify(staleCacheData);
        (mockDustAPIInstance.getAgentConfigurations as jest.Mock).mockResolvedValue({
          isOk: () => true,
          isErr: () => false,
          value: sampleAgents,
        });
        
        const result = await fetchAndCacheAgentConfigurations(true);

        expect(fsp.readFile).toHaveBeenCalledWith(MOCK_CACHE_FILE_PATH, "utf-8");
        expect(fsp.unlink).toHaveBeenCalledWith(MOCK_CACHE_FILE_PATH); // Stale cache deleted
        expect(mockDustAPIInstance.getAgentConfigurations).toHaveBeenCalledTimes(1);
        expect(fsp.writeFile).toHaveBeenCalledWith(
          MOCK_CACHE_FILE_PATH,
          JSON.stringify({ timestamp: expect.any(Number), configurations: sampleAgents }, null, 2)
        );
        expect(result).toEqual(sampleAgents);
      });

      it("should call API, save, and return data if cache file does not exist", async () => {
        (mockDustAPIInstance.getAgentConfigurations as jest.Mock).mockResolvedValue({
          isOk: () => true,
          isErr: () => false,
          value: sampleAgents,
        });

        const result = await fetchAndCacheAgentConfigurations(true);

        expect(fs.existsSync(MOCK_CACHE_FILE_PATH)).toBe(false); // Initially
        expect(fsp.readFile).toHaveBeenCalledWith(MOCK_CACHE_FILE_PATH, "utf-8"); // Attempted read
        expect(mockDustAPIInstance.getAgentConfigurations).toHaveBeenCalledTimes(1);
        expect(fsp.writeFile).toHaveBeenCalledWith(
          MOCK_CACHE_FILE_PATH,
          JSON.stringify({ timestamp: expect.any(Number), configurations: sampleAgents }, null, 2)
        );
        expect(result).toEqual(sampleAgents);
      });

      it("should call API, save, and return data if cache is invalid JSON, and delete invalid cache", async () => {
        mockFileSystem[MOCK_CACHE_FILE_PATH] = "invalid json";
        (mockDustAPIInstance.getAgentConfigurations as jest.Mock).mockResolvedValue({
          isOk: () => true,
          isErr: () => false,
          value: sampleAgents,
        });

        const result = await fetchAndCacheAgentConfigurations(true);

        expect(fsp.readFile).toHaveBeenCalledWith(MOCK_CACHE_FILE_PATH, "utf-8");
        expect(fsp.unlink).toHaveBeenCalledWith(MOCK_CACHE_FILE_PATH); // Invalid cache deleted
        expect(mockDustAPIInstance.getAgentConfigurations).toHaveBeenCalledTimes(1);
        expect(fsp.writeFile).toHaveBeenCalled();
        expect(result).toEqual(sampleAgents);
      });
      
      it("should call API, save, and return data if cache has missing timestamp, and delete invalid cache", async () => {
        const invalidCacheData = {
          configurations: sampleAgents, // Missing timestamp
        };
        mockFileSystem[MOCK_CACHE_FILE_PATH] = JSON.stringify(invalidCacheData);
         (mockDustAPIInstance.getAgentConfigurations as jest.Mock).mockResolvedValue({
          isOk: () => true,
          isErr: () => false,
          value: sampleAgents,
        });

        const result = await fetchAndCacheAgentConfigurations(true);
        expect(fsp.unlink).toHaveBeenCalledWith(MOCK_CACHE_FILE_PATH);
        expect(mockDustAPIInstance.getAgentConfigurations).toHaveBeenCalledTimes(1);
        expect(fsp.writeFile).toHaveBeenCalled();
        expect(result).toEqual(sampleAgents);
      });
    });

    // Scenario Group: useCache = false
    describe("when useCache is false", () => {
      it("should always call API, save, and return data, even if valid cache exists", async () => {
        const cachedData = {
          timestamp: Date.now(),
          configurations: createMockAgentConfigs(1), // Different from fresh
        };
        mockFileSystem[MOCK_CACHE_FILE_PATH] = JSON.stringify(cachedData);
        (mockDustAPIInstance.getAgentConfigurations as jest.Mock).mockResolvedValue({
          isOk: () => true,
          isErr: () => false,
          value: sampleAgents, // Fresh data
        });

        const result = await fetchAndCacheAgentConfigurations(false);

        expect(fsp.readFile).not.toHaveBeenCalled(); // Should not even attempt to read cache
        expect(mockDustAPIInstance.getAgentConfigurations).toHaveBeenCalledTimes(1);
        expect(fsp.writeFile).toHaveBeenCalledWith(
          MOCK_CACHE_FILE_PATH,
          JSON.stringify({ timestamp: expect.any(Number), configurations: sampleAgents }, null, 2)
        );
        expect(result).toEqual(sampleAgents);
      });

      it("should create cache directory if it does not exist when saving", async () => {
        // Ensure cache dir does not "exist" for the mkdir check by clearing mockFS for this path
        // However, our current fs.existsSync mock only checks files.
        // The mkdir call is fire-and-forget in the actual code if it already exists.
        // We'll check that mkdir was called.

        (mockDustAPIInstance.getAgentConfigurations as jest.Mock).mockResolvedValue({
          isOk: () => true,
          isErr: () => false,
          value: sampleAgents,
        });

        // Simulate directory not existing for the fs.existsSync check inside saveAgentConfigurationsToCache
        // This is a bit tricky as our mockFS is simple. We'll rely on mkdir being called.
        (fs.existsSync as jest.Mock).mockImplementation((pathArg) => {
          if (pathArg === MOCK_CACHE_DIR) return false; // Simulate cache dir not existing
          return mockFileSystem[pathArg as string] !== undefined; // For files
        });
        
        await fetchAndCacheAgentConfigurations(false);

        expect(fsp.mkdir).toHaveBeenCalledWith(MOCK_CACHE_PATH, { recursive: true });
        expect(fsp.writeFile).toHaveBeenCalled(); // Ensure save still happens
      });
    });

    // Scenario Group: API Fetch Fails
    describe("when API fetch fails", () => {
      it("should return null and not update cache", async () => {
        (mockDustAPIInstance.getAgentConfigurations as jest.Mock).mockResolvedValue({
          isOk: () => false,
          isErr: () => true,
          error: { type: "internal_server_error", message: "API Error" },
        });

        const result = await fetchAndCacheAgentConfigurations(true); // useCache true, but cache is empty

        expect(result).toBeNull();
        expect(mockDustAPIInstance.getAgentConfigurations).toHaveBeenCalledTimes(1);
        expect(fsp.writeFile).not.toHaveBeenCalled(); // Cache should not be updated with error
      });

       it("should return null if API client itself throws", async () => {
        (mockDustAPIInstance.getAgentConfigurations as jest.Mock).mockRejectedValue(new Error("Network Error"));

        const result = await fetchAndCacheAgentConfigurations(false);

        expect(result).toBeNull();
        expect(fsp.writeFile).not.toHaveBeenCalled();
      });
    });
    
    // Test specific scenarios for loadAgentConfigurationsFromCache and saveAgentConfigurationsToCache
    // These are indirectly tested by fetchAndCacheAgentConfigurations, but direct tests can be useful for precision.
    // To do this, we'd need to export them from dustClient.ts or use a more complex setup.
    // For now, the coverage through fetchAndCacheAgentConfigurations is good.
    // Example for direct testing (if exported):
    // describe("loadAgentConfigurationsFromCache direct", () => { ... })
    // describe("saveAgentConfigurationsToCache direct", () => { ... })
  });
});

// Placeholder for App.tsx tests - will be in a separate file
// describe("App.tsx Caching Integration", () => {
//   it("should do something", () => {
//     // Test App.tsx behavior
//   });
// });
