// @vitest-environment node

import assert from "node:assert";
import { MistralCodestralEuropeMistralStream } from "@app/lib/model_constructors/stream/endpoints/mistral_codestral_eu_mistral";
import { MistralMistralLargeEuropeMistralStream } from "@app/lib/model_constructors/stream/endpoints/mistral_mistral_large_eu_mistral";
import { MistralMistralMedium35EuropeMistralStream } from "@app/lib/model_constructors/stream/endpoints/mistral_mistral_medium_3_5_eu_mistral";
import { MistralMistralSmallEuropeMistralStream } from "@app/lib/model_constructors/stream/endpoints/mistral_mistral_small_eu_mistral";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("MistralStream", () => {
  it("disables SDK retries so the agent loop owns retry attempts", () => {
    const endpoint = new MistralMistralLargeEuropeMistralStream({
      MISTRAL_API_KEY: "test",
    });

    expect(
      Reflect.get(Reflect.get(endpoint, "client"), "_options")
    ).toMatchObject({
      retryConfig: { strategy: "none" },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(
    [
      MistralMistralLargeEuropeMistralStream,
      MistralMistralMedium35EuropeMistralStream,
      MistralMistralSmallEuropeMistralStream,
      MistralCodestralEuropeMistralStream,
    ].map((Endpoint) => ({ name: Endpoint.name, Endpoint }))
  )("$name sends requests to the EU regional host", async ({ Endpoint }) => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(null, { status: 500 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const endpoint = new Endpoint({ MISTRAL_API_KEY: "test" });

    await expect(async () => {
      for await (const _ of endpoint.streamRaw({
        model: Endpoint.model,
        messages: [{ role: "user", content: "hi" }],
      })) {
        // Drain.
      }
    }).rejects.toThrow();

    const [request] = fetchMock.mock.calls[0] ?? [];
    assert(request instanceof Request, "Mistral SDK sent no Request");
    expect(new URL(request.url).host).toBe("api.eu.mistral.ai");
  });
});
