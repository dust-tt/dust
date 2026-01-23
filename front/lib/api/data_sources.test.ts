import { vi } from "vitest";

import { CoreAPI, Ok } from "@app/types";

// Mock distributed lock to avoid Redis dependency
vi.mock("@app/lib/lock", () => ({
  executeWithLock: vi.fn(async (_lockName, fn) => {
    // Simply execute the function without locking in tests
    return fn();
  }),
}));

// Mock config to avoid requiring environment variables
vi.mock("@app/lib/api/config", () => ({
  default: {
    getCoreAPIConfig: () => ({
      url: "http://localhost:3001",
      logger: console,
    }),
  },
}));

// Mock CoreAPI methods to avoid requiring the Core service
vi.spyOn(CoreAPI.prototype, "createProject").mockImplementation(async () => {
  return new Ok({
    project: {
      project_id: Math.floor(Math.random() * 1000000),
    },
  });
});

vi.spyOn(CoreAPI.prototype, "createDataSource").mockImplementation(
  async ({ name }) => {
    return new Ok({
      data_source: {
        created: Date.now(),
        data_source_id: `mock-datasource-${Math.random().toString(36).substring(7)}`,
        data_source_internal_id: `internal-${Math.random().toString(36).substring(7)}`,
        name,
        config: {
          embedder_config: {
            embedder: {
              provider_id: "openai",
              model_id: "text-embedding-ada-002",
              splitter_id: "base_v0",
              max_chunk_size: 512,
            },
          },
          qdrant_config: {
            cluster: "cluster-0",
            shadow_write_cluster: null,
          },
        },
      },
    });
  }
);
