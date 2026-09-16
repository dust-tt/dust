import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/egress/server", () => ({
  untrustedFetch: vi.fn(),
}));

import { untrustedFetch } from "@app/lib/egress/server";
import { evaluateDatadogAiGuard } from "@app/lib/inference_hook/providers/datadog_ai_guard";

const mockedFetch = vi.mocked(untrustedFetch);

describe("evaluateDatadogAiGuard", () => {
  beforeEach(() => {
    mockedFetch.mockReset();
  });

  it("returns ALLOW action from a valid response", async () => {
    mockedFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            attributes: { action: "ALLOW", reason: "ok" },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const result = await evaluateDatadogAiGuard({
      endpoint: "https://api.datadoghq.com/api/v2/ai-guard/evaluate",
      apiKey: "api",
      appKey: "app",
      messages: [{ role: "user", content: "hello" }],
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ action: "ALLOW", reason: "ok" });
    }
    expect(mockedFetch).toHaveBeenCalledWith(
      "https://api.datadoghq.com/api/v2/ai-guard/evaluate",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "DD-API-KEY": "api",
          "DD-APPLICATION-KEY": "app",
        }),
      })
    );
  });

  it("returns Err on non-2xx", async () => {
    mockedFetch.mockResolvedValue(new Response("nope", { status: 403 }));

    const result = await evaluateDatadogAiGuard({
      endpoint: "https://api.datadoghq.com/api/v2/ai-guard/evaluate",
      apiKey: "api",
      appKey: "app",
      messages: [{ role: "user", content: "hello" }],
    });

    expect(result.isErr()).toBe(true);
  });

  it("returns Err on invalid payload shape", async () => {
    mockedFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ data: { attributes: { action: "MAYBE" } } }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

    const result = await evaluateDatadogAiGuard({
      endpoint: "https://api.datadoghq.com/api/v2/ai-guard/evaluate",
      apiKey: "api",
      appKey: "app",
      messages: [{ role: "user", content: "hello" }],
    });

    expect(result.isErr()).toBe(true);
  });
});
