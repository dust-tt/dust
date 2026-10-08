// @vitest-environment node

import { AnthropicClaudeSonnetFiveGlobalEdgeeStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_sonnet_five_global_edgee";
import { CLAUDE_SONNET_5 } from "@app/lib/model_constructors/types/models";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("EdgeeAnthropicStream", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is identified as Sonnet 5 served globally by the edgee host", () => {
    expect(AnthropicClaudeSonnetFiveGlobalEdgeeStream.id).toBe(
      "anthropic/claude-sonnet-5/global/edgee"
    );
  });

  it("calls the Edgee gateway with the caller's Edgee key, without SDK retries", () => {
    const endpoint = new AnthropicClaudeSonnetFiveGlobalEdgeeStream({
      EDGEE_API_KEY: "sk-edgee-user",
      ANTHROPIC_API_KEY: "sk-ant-dust",
    });

    expect(Reflect.get(endpoint, "client")).toMatchObject({
      baseURL: "https://edgee.io",
      apiKey: "sk-edgee-user",
      maxRetries: 0,
    });
  });

  it("never falls back to an Anthropic key when no Edgee key is provided", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-from-env");

    const endpoint = new AnthropicClaudeSonnetFiveGlobalEdgeeStream({
      ANTHROPIC_API_KEY: "sk-ant-dust",
    });

    expect(Reflect.get(endpoint, "client")).toMatchObject({ apiKey: null });
  });

  it("names the model with Edgee's provider prefix", () => {
    const endpoint = new AnthropicClaudeSonnetFiveGlobalEdgeeStream({
      EDGEE_API_KEY: "sk-edgee-user",
    });

    expect(endpoint.modelToHostModel(CLAUDE_SONNET_5)).toBe(
      "anthropic/claude-sonnet-5"
    );
  });
});
