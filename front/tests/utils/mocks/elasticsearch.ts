import { vi } from "vitest";

// Mock Elasticsearch to prevent real Elasticsearch calls in tests
export const mockElasticsearch = () => {
  vi.mock("@app/lib/api/elasticsearch", async (importOriginal) => {
    const actual = (await importOriginal()) as Record<string, unknown>;
    return {
      ...actual,
      searchAnalytics: vi.fn(),
      withEs: vi.fn(async (fn: any) => {
        const mockClient = {
          search: vi.fn().mockResolvedValue({
            hits: { hits: [], total: { value: 0 } },
          }),
        };
        return fn(mockClient);
      }),
    };
  });
};
