import { beforeEach, describe, expect, it, vi } from "vitest";

const getLangfuseClientMock = vi.hoisted(() => vi.fn());

vi.mock("@app/lib/api/langfuse_client", () => ({
  getLangfuseClient: getLangfuseClientMock,
}));

import { fetchLangfuseTraceByDustTraceId } from "./langfuse";

const auth = {
  getNonNullableWorkspace: () => ({ sId: "workspace-1" }),
};

describe("fetchLangfuseTraceByDustTraceId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when Langfuse is disabled", async () => {
    getLangfuseClientMock.mockReturnValue(null);

    const result = await fetchLangfuseTraceByDustTraceId(auth, {
      dustTraceId: "llm_trace_1",
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBeNull();
    }
  });

  it("does not expose a trace from another workspace", async () => {
    const getTraceMock = vi.fn();
    getLangfuseClientMock.mockReturnValue({
      api: {
        trace: {
          get: getTraceMock,
          list: vi.fn().mockResolvedValue({
            data: [{ id: "langfuse-trace-1", userId: "workspace-2" }],
          }),
        },
      },
    });

    const result = await fetchLangfuseTraceByDustTraceId(auth, {
      dustTraceId: "llm_trace_1",
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBeNull();
    }
    expect(getTraceMock).not.toHaveBeenCalled();
  });

  it("returns normalized provider input, output, usage, cost, and timing", async () => {
    const listTraceMock = vi.fn().mockResolvedValue({
      data: [{ id: "langfuse-trace-1", userId: "workspace-1" }],
    });
    getLangfuseClientMock.mockReturnValue({
      api: {
        trace: {
          get: vi.fn().mockResolvedValue({
            id: "langfuse-trace-1",
            input: { prompt: "system prompt" },
            latency: 1.25,
            metadata: { dustTraceId: "llm_trace_1" },
            name: "Agent conversation",
            observations: [
              {
                costDetails: { total: 0.012 },
                endTime: "2026-07-13T10:00:01.250Z",
                id: "generation-1",
                input: [{ role: "user", content: "Hello" }],
                latency: 1.25,
                level: "DEFAULT",
                metadata: { tools: ["search"] },
                model: "claude-sonnet-4-5",
                name: "llm-completion",
                output: { content: "Hi" },
                startTime: "2026-07-13T10:00:00.000Z",
                statusMessage: null,
                timeToFirstToken: 0.2,
                type: "GENERATION",
                usageDetails: { input: 120, output: 12 },
              },
            ],
            output: { content: "Hi" },
            tags: ["agent_conversation"],
            timestamp: "2026-07-13T10:00:00.000Z",
            totalCost: 0.012,
          }),
          list: listTraceMock,
        },
      },
    });

    const result = await fetchLangfuseTraceByDustTraceId(auth, {
      dustTraceId: "llm_trace_1",
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toMatchObject({
        id: "langfuse-trace-1",
        latencySeconds: 1.25,
        observations: [
          {
            costDetails: { total: 0.012 },
            input: [{ role: "user", content: "Hello" }],
            output: { content: "Hi" },
            timeToFirstTokenSeconds: 0.2,
            usageDetails: { input: 120, output: 12 },
          },
        ],
        totalCostUsd: 0.012,
      });
    }
    expect(listTraceMock).toHaveBeenCalledWith({
      filter: JSON.stringify([
        {
          type: "stringObject",
          column: "metadata",
          key: "dustTraceId",
          operator: "=",
          value: "llm_trace_1",
        },
      ]),
      limit: 1,
    });
  });
});
