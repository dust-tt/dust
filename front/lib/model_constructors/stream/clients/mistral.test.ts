// @vitest-environment node

import { MistralMistralLargeEuropeMistralStream } from "@app/lib/model_constructors/stream/endpoints/mistral_mistral_large_eu_mistral";
import { describe, expect, it } from "vitest";

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
});
