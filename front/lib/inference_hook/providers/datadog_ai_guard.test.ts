import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/egress/server", () => ({
  untrustedFetch: vi.fn(),
}));

import { untrustedFetch } from "@app/lib/egress/server";
import { evaluateDatadogAiGuard } from "@app/lib/inference_hook/providers/datadog_ai_guard";

const mockedFetch = vi.mocked(untrustedFetch);

function mockJsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Awaited<ReturnType<typeof untrustedFetch>>;
}

describe("evaluateDatadogAiGuard", () => {
  beforeEach(() => {
    mockedFetch.mockReset();
  });

  it("returns ALLOW action from a valid response", async () => {
    mockedFetch.mockResolvedValue(
      mockJsonResponse({
        data: {
          attributes: { action: "ALLOW", reason: "ok" },
        },
      })
    );

    const result = await evaluateDatadogAiGuard({
      endpoint: "https://api.datadoghq.com/api/v2/ai-guard/evaluate",
      apiKey: "api",
      appKey: "app",
      messages: [{ role: "user", content: "hello" }],
      timeoutMs: 1000,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ action: "ALLOW", reason: "ok" });
    }
    expect(mockedFetch).toHaveBeenCalledWith(
      "https://api.datadoghq.com/api/v2/ai-guard/evaluate",
      expect.objectContaining({
        method: "POST",
        signal: expect.any(AbortSignal),
        headers: expect.objectContaining({
          "DD-API-KEY": "api",
          "DD-APPLICATION-KEY": "app",
        }),
      })
    );
  });

  it("returns Err on non-2xx", async () => {
    mockedFetch.mockResolvedValue(mockJsonResponse("nope", 403));

    const result = await evaluateDatadogAiGuard({
      endpoint: "https://api.datadoghq.com/api/v2/ai-guard/evaluate",
      apiKey: "api",
      appKey: "app",
      messages: [{ role: "user", content: "hello" }],
      timeoutMs: 500,
    });

    expect(result.isErr()).toBe(true);
  });

  it("returns Err on invalid payload shape", async () => {
    mockedFetch.mockResolvedValue(
      mockJsonResponse({ data: { attributes: { action: "MAYBE" } } })
    );

    const result = await evaluateDatadogAiGuard({
      endpoint: "https://api.datadoghq.com/api/v2/ai-guard/evaluate",
      apiKey: "api",
      appKey: "app",
      messages: [{ role: "user", content: "hello" }],
      timeoutMs: 1000,
    });

    expect(result.isErr()).toBe(true);
  });

  it("returns Err when the request times out", async () => {
    mockedFetch.mockRejectedValue(
      new DOMException("The operation was aborted.", "TimeoutError")
    );

    const result = await evaluateDatadogAiGuard({
      endpoint: "https://api.datadoghq.com/api/v2/ai-guard/evaluate",
      apiKey: "api",
      appKey: "app",
      messages: [{ role: "user", content: "hello" }],
      timeoutMs: 1,
    });

    expect(result.isErr()).toBe(true);
  });
});
