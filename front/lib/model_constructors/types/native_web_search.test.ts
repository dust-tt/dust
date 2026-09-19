import {
  AGENT_PLATFORM_HOST,
  ANTHROPIC_HOST,
  FIREWORKS_HOST,
  GOOGLE_AI_STUDIO_HOST,
  MISTRAL_HOST,
  NOOP_HOST,
  OPENAI_RESPONSES_HOST,
  XAI_HOST,
} from "@app/lib/model_constructors/types/hosts";
import { isNativeWebSearchEnabled } from "@app/lib/model_constructors/types/native_web_search";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import { describe, expect, it } from "vitest";

const enabled: WhitelistableFeature[] = ["provider_native_web_search"];

describe("isNativeWebSearchEnabled", () => {
  it("is true for the hosts whose API exposes a web search server tool", () => {
    for (const host of [ANTHROPIC_HOST, OPENAI_RESPONSES_HOST]) {
      expect(isNativeWebSearchEnabled({ host, featureFlags: enabled })).toBe(
        true
      );
    }
  });

  // The guarantee that the flag is a no-op everywhere else. Vertex
  // (agent-platform) is excluded on purpose despite sharing Anthropic's provider
  // id and input converter.
  it("is false for every other host even with the flag on", () => {
    for (const host of [
      AGENT_PLATFORM_HOST,
      GOOGLE_AI_STUDIO_HOST,
      MISTRAL_HOST,
      FIREWORKS_HOST,
      XAI_HOST,
      NOOP_HOST,
    ]) {
      expect(isNativeWebSearchEnabled({ host, featureFlags: enabled })).toBe(
        false
      );
    }
  });

  it("is false without the flag", () => {
    expect(
      isNativeWebSearchEnabled({ host: ANTHROPIC_HOST, featureFlags: [] })
    ).toBe(false);
  });
});
