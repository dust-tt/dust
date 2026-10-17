import { describe, expect, it } from "vitest";

import {
  parseSlackLeadingPlusTokens,
  stripSlackPlusTokensFromMessage,
} from "./slack_plus_tokens";

describe("parseSlackLeadingPlusTokens", () => {
  it("parses a model id alone", () => {
    const result = parseSlackLeadingPlusTokens(
      "+claude-opus-5-5 what is the capital of France?"
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value.agentMentionCandidate).toBeNull();
    expect(result.value.modelSelection).toEqual({
      providerId: "anthropic",
      modelId: "claude-opus-5-5",
    });
    expect(result.value.matchedTokens).toEqual(["+claude-opus-5-5"]);
  });

  it("parses a model id with reasoning effort", () => {
    const result = parseSlackLeadingPlusTokens(
      "+claude-opus-5-5/high please reason carefully"
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value.modelSelection).toEqual({
      providerId: "anthropic",
      modelId: "claude-opus-5-5",
      reasoningEffort: "high",
    });
  });

  it("parses an agent then a model with effort", () => {
    const result = parseSlackLeadingPlusTokens(
      "+myagent +claude-opus-5-5/high hello"
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value.agentMentionCandidate).toBe("+myagent");
    expect(result.value.modelSelection).toEqual({
      providerId: "anthropic",
      modelId: "claude-opus-5-5",
      reasoningEffort: "high",
    });
    expect(result.value.matchedTokens).toEqual([
      "+myagent",
      "+claude-opus-5-5/high",
    ]);
  });

  it("parses a model then an agent in either order", () => {
    const result = parseSlackLeadingPlusTokens("+gemini-4-argon +support help");

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value.agentMentionCandidate).toBe("+support");
    expect(result.value.modelSelection).toEqual({
      providerId: "google_ai_studio",
      modelId: "gemini-4-argon",
    });
  });

  it("keeps =mentions as exact agent candidates even when the name is a model id", () => {
    const result = parseSlackLeadingPlusTokens(
      "=gpt-5 override the model path"
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value.agentMentionCandidate).toBe("=gpt-5");
    expect(result.value.modelSelection).toBeUndefined();
  });

  it("treats +gpt-5 as a model selection", () => {
    const result = parseSlackLeadingPlusTokens("+gpt-5 hello");

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value.agentMentionCandidate).toBeNull();
    expect(result.value.modelSelection).toEqual({
      providerId: "openai",
      modelId: "gpt-5",
    });
  });

  it("parses fireworks model ids that contain slashes", () => {
    const result = parseSlackLeadingPlusTokens(
      "+accounts/fireworks/models/kimi-k3/high go"
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value.modelSelection).toEqual({
      providerId: "fireworks",
      modelId: "accounts/fireworks/models/kimi-k3",
      reasoningEffort: "high",
    });
  });

  it("rejects two agent mentions", () => {
    const result = parseSlackLeadingPlusTokens("+support +billing help");

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("Expected multiple agents to fail.");
    }
    expect(result.error.code).toBe("multiple_agents");
  });

  it("rejects two model selections", () => {
    const result = parseSlackLeadingPlusTokens(
      "+claude-opus-5-5 +gpt-5.5 help"
    );

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("Expected multiple models to fail.");
    }
    expect(result.error.code).toBe("multiple_models");
  });

  it("rejects unknown model ids with an effort suffix", () => {
    const result = parseSlackLeadingPlusTokens("+not-a-real-model/high help");

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("Expected unknown model to fail.");
    }
    expect(result.error.code).toBe("unknown_model");
    expect(result.error.token).toBe("+not-a-real-model/high");
  });

  it("leaves ordinary agent mentions unchanged", () => {
    const result = parseSlackLeadingPlusTokens("+support help me");

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value).toEqual({
      agentMentionCandidate: "+support",
      modelSelection: undefined,
      matchedTokens: ["+support"],
    });
  });
});

describe("stripSlackPlusTokensFromMessage", () => {
  it("removes matched tokens from the message", () => {
    expect(
      stripSlackPlusTokensFromMessage(
        "+myagent +claude-opus-5-5/high please help",
        ["+myagent", "+claude-opus-5-5/high"]
      )
    ).toBe("please help");
  });
});
