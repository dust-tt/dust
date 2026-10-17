import { describe, expect, it } from "vitest";

import {
  canonicalizeKnownModelLLMId,
  getProviderIdForKnownModelId,
  isKnownModelLLMId,
} from "./model_ids";

describe("model_ids", () => {
  it("canonicalizes known model ids case-insensitively", () => {
    expect(canonicalizeKnownModelLLMId("Claude-Opus-5-5")).toBe(
      "claude-opus-5-5"
    );
    expect(isKnownModelLLMId("gpt-5.5")).toBe(true);
    expect(isKnownModelLLMId("not-a-model")).toBe(false);
  });

  it("maps known model ids to providers", () => {
    expect(getProviderIdForKnownModelId("claude-opus-5-5")).toBe("anthropic");
    expect(getProviderIdForKnownModelId("gpt-5")).toBe("openai");
    expect(getProviderIdForKnownModelId("gemini-4-argon")).toBe(
      "google_ai_studio"
    );
    expect(
      getProviderIdForKnownModelId("accounts/fireworks/models/kimi-k3")
    ).toBe("fireworks");
    expect(getProviderIdForKnownModelId("auto_complex")).toBe("auto_complex");
    expect(getProviderIdForKnownModelId("not-a-model")).toBeNull();
  });
});
