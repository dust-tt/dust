import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/egress/server", () => ({
  untrustedFetch: vi.fn(),
}));

import { untrustedFetch } from "@app/lib/egress/server";
import { evaluateGenericHttpHook } from "@app/lib/inference_hook/providers/generic_http";

const mockedFetch = vi.mocked(untrustedFetch);

function mockJsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Awaited<ReturnType<typeof untrustedFetch>>;
}

describe("evaluateGenericHttpHook", () => {
  beforeEach(() => {
    mockedFetch.mockReset();
  });

  it("accepts a flat ALLOW response", async () => {
    mockedFetch.mockResolvedValue(
      mockJsonResponse({ action: "ALLOW", reason: "ok" })
    );

    const result = await evaluateGenericHttpHook({
      endpoint: "https://hooks.example.com/v1/evaluate",
      apiKey: "secret",
      messages: [{ role: "user", content: "hi" }],
      phase: "input",
      timeoutMs: 1000,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ action: "ALLOW", reason: "ok" });
    }
    expect(mockedFetch).toHaveBeenCalledWith(
      "https://hooks.example.com/v1/evaluate",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer secret",
        }),
      })
    );
  });

  it("accepts Datadog-shaped nested responses", async () => {
    mockedFetch.mockResolvedValue(
      mockJsonResponse({
        data: { attributes: { action: "DENY", reason: "bad" } },
      })
    );

    const result = await evaluateGenericHttpHook({
      endpoint: "https://hooks.example.com/v1/evaluate",
      apiKey: "secret",
      messages: [{ role: "user", content: "hi" }],
      phase: "output",
      timeoutMs: 500,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.action).toBe("DENY");
    }
  });
});
