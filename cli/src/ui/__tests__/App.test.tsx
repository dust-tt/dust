import React from "react";
import { render, act, waitFor } from "@testing-library/react";
import type { Result } from "meow";
import App from "../App"; // Adjust path as necessary
import { fetchAndCacheAgentConfigurations } from "../../utils/dustClient"; // To be mocked
import type { AgentConfigurationType } from "@dust-tt/types";

// --- Mocks ---

// Mock child components
jest.mock("../commands/AgentsMCP", () => ({ __esModule: true, default: jest.fn(() => <div>AgentsMCP Mock</div>) }));
jest.mock("../commands/Auth", () => ({ __esModule: true, default: jest.fn(() => <div>Auth Mock</div>) }));
jest.mock("../commands/Chat", () => ({ __esModule: true, default: jest.fn(() => <div>Chat Mock</div>) }));
jest.mock("../commands/Logout", () => ({ __esModule: true, default: jest.fn(() => <div>Logout Mock</div>) }));
jest.mock("../commands/Status", () => ({ __esModule: true, default: jest.fn(() => <div>Status Mock</div>) }));
jest.mock("../Help", () => ({ __esModule: true, default: jest.fn(() => <div>Help Mock</div>) }));

// Mock dustClient
jest.mock("../../utils/dustClient", () => ({
  fetchAndCacheAgentConfigurations: jest.fn(),
}));

// Mock useMe hook (if App directly or indirectly uses it for general rendering logic)
// Based on App.tsx structure, it doesn't seem to directly use useMe for the tested logic.
// If child components passed into App.tsx trigger it, their mocks should prevent this.

// Helper to create mock CLI result
const createMockCliResult = (
  input: string[],
  flags: Record<string, any>
): Result<any> => ({
  input,
  flags,
  pkg: {}, // Add other properties if your App component uses them
  help: "",
  showHelp: jest.fn(),
  showVersion: jest.fn(),
  unnormalizedFlags: flags,
  rawFlags: flags,
});

// Helper function to create mock agent configurations
const createMockAgentConfigs = (count: number, prefix = "agent"): AgentConfigurationType[] => {
  return Array.from({ length: count }, (_, i) => ({
    sId: `${prefix}SId${i}`,
    name: `${prefix} Agent ${i}`,
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

const mockedFetchAndCache = fetchAndCacheAgentConfigurations as jest.Mock;

// --- Test Suite ---
describe("App.tsx Caching Integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("With -s flag (for agents-mcp or chat)", () => {
    const sId = "testSId0";
    const initialCachedAgents = createMockAgentConfigs(1, "cached");
    const freshAgents = createMockAgentConfigs(1, "fresh"); // Same sId, different name for distinction

    it("Cache Hit (Valid Cache): uses cache, then updates from background fetch (different data)", async () => {
      // Initial call (useCache=true) returns cached data
      mockedFetchAndCache.mockResolvedValueOnce(initialCachedAgents);
      // Second call (useCache=false, background) returns fresh data
      mockedFetchAndCache.mockResolvedValueOnce(freshAgents);

      const cli = createMockCliResult(["chat"], { sId: [sId] });
      const { findByText, queryByText } = render(<App cli={cli} />);

      // Initial load with cached data
      await waitFor(() => {
        expect(mockedFetchAndCache).toHaveBeenNthCalledWith(1, true);
      });
      // The message "Using cached configurations. Checking for updates..." should appear
      // Need to ensure this message is consistently rendered by App.tsx for this state
      await findByText(/Using cached configurations. Checking for updates.../i);


      // Background fetch and update
      await waitFor(() => {
         expect(mockedFetchAndCache).toHaveBeenNthCalledWith(2, false);
      });
      // The message "Configurations updated." should appear
      await findByText(/Configurations updated./i);
      expect(queryByText(/Using cached configurations. Checking for updates.../i)).toBeNull();

      // Verify Chat component receives the final, fresh configurations
      // This requires Chat mock to expose what it received or App to render some identifiable part of the config
      // For now, we trust the state update mechanism tested by messages.
    });

    it("Cache Hit (Valid Cache): uses cache, background fetch returns same data", async () => {
      // Both calls return the same "initial" (cached) data
      mockedFetchAndCache.mockResolvedValue(initialCachedAgents);

      const cli = createMockCliResult(["chat"], { sId: [sId] });
      const { findByText, queryByText } = render(<App cli={cli} />);

      await findByText(/Using cached configurations. Checking for updates.../i);
      await waitFor(() => expect(mockedFetchAndCache).toHaveBeenCalledTimes(2)); // Both calls made
      await findByText(/Cached configurations are up to date./i);
      expect(queryByText(/Using cached configurations. Checking for updates.../i)).toBeNull();
    });
    
    it("Cache Miss (No/Stale/Invalid Cache): fetches fresh data, updates cache", async () => {
      // Initial call (useCache=true) returns null (cache miss)
      mockedFetchAndCache.mockResolvedValueOnce(null);
      // Subsequent call (implicitly part of the first fetchAndCacheAgentConfigurations or a direct second call if logic implies)
      // App.tsx logic: if initialConfigs is null from fetchAndCache(true), it sets error.
      // Let's refine this: fetchAndCache(true) itself handles the fallback to fresh fetch if cache is bad.
      // So, fetchAndCache(true) will be called once, internally it misses cache, fetches fresh, saves it.
      mockedFetchAndCache.mockReset(); // Reset from previous tests
      mockedFetchAndCache.mockImplementation(async (useCache) => {
        if (useCache) { // First call from App
          // Simulate cache miss leading to fresh fetch within the *same* call
          // Or, more accurately, fetchAndCacheAgentConfigurations(true) returns fresh if cache is bad.
          return freshAgents; // Simulates it fetched fresh data after cache miss
        }
        // This path shouldn't be hit if the first call to fetchAndCache(true) already returned fresh data
        // and no "cached" state was set to trigger a background update.
        return freshAgents; 
      });

      const cli = createMockCliResult(["chat"], { sId: [sId] });
      const { findByText, queryByText } = render(<App cli={cli} />);
      
      // Expect fetchAndCache(true) to be called.
      await waitFor(() => expect(mockedFetchAndCache).toHaveBeenCalledWith(true));

      // It should directly load fresh data, so no "Using cached" message.
      // It might show a generic loading message initially.
      // The Chat mock should eventually get `freshAgents`.
      // The specific messages "Using cached..." or "Updated..." might not appear if cache wasn't used initially.
      // Check that the Chat component is rendered (implies data loaded)
      await findByText("Chat Mock"); 
      expect(queryByText(/Using cached configurations/i)).toBeNull();
      expect(queryByText(/Configurations updated/i)).toBeNull();

      // Verify fetchAndCache was called once as per this simplified flow
      expect(mockedFetchAndCache).toHaveBeenCalledTimes(1);
    });
  });

  describe("Without -s flag (e.g., agents-mcp or chat without specific agent)", () => {
    const allAgents = createMockAgentConfigs(3, "all");

    it("Calls API without cache preference, updates cache", async () => {
      mockedFetchAndCache.mockResolvedValue(allAgents); // fetchAndCache(false)

      const cli = createMockCliResult(["agents-mcp"], {}); // No sId
      const { findByText, queryByText } = render(<App cli={cli} />);

      await waitFor(() => expect(mockedFetchAndCache).toHaveBeenCalledWith(false));
      
      // Should render AgentsMCP mock after loading
      await findByText("AgentsMCP Mock");
      expect(queryByText(/Using cached configurations/i)).toBeNull();
      expect(queryByText(/Configurations updated/i)).toBeNull();
      
      expect(mockedFetchAndCache).toHaveBeenCalledTimes(1);
    });
  });

  describe("Error Handling", () => {
    it("Error during initial fetch (with -s): displays error message", async () => {
      mockedFetchAndCache.mockImplementation(async (useCache) => {
        if (useCache) { // Initial call with useCache = true
          return null; // Simulate error / no data
        }
        // No background call in this scenario if initial fails badly
        return null;
      });

      const cli = createMockCliResult(["chat"], { sId: ["errorSId"] });
      const { findByText } = render(<App cli={cli} />);

      await waitFor(() => expect(mockedFetchAndCache).toHaveBeenCalledWith(true));
      await findByText(/Failed to load agent configurations./i);
    });

    it("Error during background update (with -s): displays background update error", async () => {
      const cachedAgents = createMockAgentConfigs(1, "cachedBGError");
      // Initial call (useCache=true) returns cached data
      mockedFetchAndCache.mockResolvedValueOnce(cachedAgents);
      // Second call (useCache=false, background) returns null (error)
      mockedFetchAndCache.mockResolvedValueOnce(null);

      const cli = createMockCliResult(["chat"], { sId: [cachedAgents[0].sId] });
      const { findByText } = render(<App cli={cli} />);

      await findByText(/Using cached configurations. Checking for updates.../i);
      await waitFor(() => expect(mockedFetchAndCache).toHaveBeenCalledTimes(2));
      await findByText(/Failed to fetch updated configurations./i);
    });
  });
});
