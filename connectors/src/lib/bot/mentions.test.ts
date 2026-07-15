import type {
  AvailableModelType,
  LightAgentConfigurationType,
} from "@dust-tt/client";
import { describe, expect, it } from "vitest";

import { processMentions, processMessageForMention } from "./mentions";

function makeAgentConfiguration({
  name,
  sId,
}: {
  name: string;
  sId: string;
}): LightAgentConfigurationType {
  return {
    id: 1,
    versionCreatedAt: null,
    sId,
    version: 1,
    versionAuthorId: null,
    instructions: null,
    model: {
      providerId: "openai",
      modelId: "gpt-4-turbo",
      temperature: 0.7,
    },
    status: "active",
    scope: "published",
    userFavorite: false,
    name,
    description: "",
    pictureUrl: "",
    maxStepsPerRun: 8,
    templateId: null,
  };
}

const activeAgentConfigurations = [
  makeAgentConfiguration({ name: "SupportAgent", sId: "support" }),
  makeAgentConfiguration({ name: "BillingAgent", sId: "billing" }),
  makeAgentConfiguration({ name: "gpt5.5", sId: "gpt-5-5" }),
  makeAgentConfiguration({ name: "test.", sId: "test-dot" }),
];

describe("processMentions", () => {
  it("matches =mentions exactly while ignoring case", () => {
    const result = processMentions({
      message: "=supportagent help me",
      activeAgentConfigurations,
      mentionCandidate: "=supportagent",
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value).toEqual({
      mention: {
        agentId: "support",
        agentName: "SupportAgent",
      },
      processedMessage: "help me",
    });
  });

  it("matches exact =mentions with dots in the agent name", () => {
    const result = processMentions({
      message: "=gpt5.5 help me",
      activeAgentConfigurations,
      mentionCandidate: "=gpt5.5",
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value).toEqual({
      mention: {
        agentId: "gpt-5-5",
        agentName: "gpt5.5",
      },
      processedMessage: "help me",
    });
  });

  it("matches exact =mentions ending with a dot", () => {
    const result = processMentions({
      message: "=test. help me",
      activeAgentConfigurations,
      mentionCandidate: "=test.",
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value).toEqual({
      mention: {
        agentId: "test-dot",
        agentName: "test.",
      },
      processedMessage: "help me",
    });
  });

  it("does not fuzzy-match =mentions", () => {
    const result = processMentions({
      message: "=support help me",
      activeAgentConfigurations,
      mentionCandidate: "=support",
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("Expected exact mention lookup to fail.");
    }
    expect(result.error.message).toBe(
      "Agent =support is not available to you. Check the name or ask your workspace administrator for access."
    );
  });

  const availableModels: AvailableModelType[] = [
    {
      providerId: "openai",
      modelId: "gpt-5.6-luna",
      displayName: "GPT-5.6 Luna",
      supportedReasoningEfforts: ["light", "medium", "high"],
      defaultReasoningEffort: "medium",
    },
    {
      providerId: "anthropic",
      modelId: "claude-sonnet-4-6",
      displayName: "Claude Sonnet 4.6",
      supportedReasoningEfforts: ["none", "light", "medium", "high"],
      defaultReasoningEffort: "light",
    },
  ];

  it("matches a model id with a reasoning effort suffix", () => {
    const result = processMentions({
      message: "+gpt-5.6-luna-high what is the capital of France?",
      activeAgentConfigurations,
      mentionCandidate: "+gpt-5.6-luna-high",
      availableModels,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value).toEqual({
      mention: undefined,
      modelSelection: {
        providerId: "openai",
        modelId: "gpt-5.6-luna",
        reasoningEffort: "high",
      },
      processedMessage: "what is the capital of France?",
    });
  });

  it("matches a bare model id with the model's default reasoning effort", () => {
    const result = processMentions({
      message: "+gpt-5.6-luna what is the capital of France?",
      activeAgentConfigurations,
      mentionCandidate: "+gpt-5.6-luna",
      availableModels,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value.modelSelection).toEqual({
      providerId: "openai",
      modelId: "gpt-5.6-luna",
      reasoningEffort: "medium",
    });
  });

  it("matches model mentions ignoring case and with the = prefix", () => {
    const result = processMentions({
      message: "=Claude-Sonnet-4-6-none help me",
      activeAgentConfigurations,
      mentionCandidate: "=Claude-Sonnet-4-6-none",
      availableModels,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value).toEqual({
      mention: undefined,
      modelSelection: {
        providerId: "anthropic",
        modelId: "claude-sonnet-4-6",
        reasoningEffort: "none",
      },
      processedMessage: "help me",
    });
  });

  it("does not match a model with an unsupported reasoning effort suffix", () => {
    const result = processMentions({
      message: "+gpt-5.6-luna-none help me",
      activeAgentConfigurations,
      mentionCandidate: "+gpt-5.6-luna-none",
      availableModels,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    // Falls back to fuzzy agent matching.
    expect(result.value.modelSelection).toBeUndefined();
    expect(result.value.mention).toBeDefined();
  });

  it("prioritizes an exact agent name match over a model match", () => {
    const result = processMentions({
      message: "+gpt-5.6-luna help me",
      activeAgentConfigurations: [
        ...activeAgentConfigurations,
        makeAgentConfiguration({ name: "gpt-5.6-luna", sId: "luna-agent" }),
      ],
      mentionCandidate: "+gpt-5.6-luna",
      availableModels,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value.modelSelection).toBeUndefined();
    expect(result.value.mention).toEqual({
      agentId: "luna-agent",
      agentName: "gpt-5.6-luna",
    });
  });

  it("falls back to fuzzy agent matching when no models are available", () => {
    const result = processMentions({
      message: "+gpt-5.6-luna-high help me",
      activeAgentConfigurations,
      mentionCandidate: "+gpt-5.6-luna-high",
      availableModels: [],
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value.modelSelection).toBeUndefined();
    expect(result.value.mention).toBeDefined();
  });

  it("keeps fuzzy matching for +mentions and ~mentions", () => {
    const plusResult = processMentions({
      message: "+support help me",
      activeAgentConfigurations,
      mentionCandidate: "+support",
    });
    const tildeResult = processMentions({
      message: "~billing help me",
      activeAgentConfigurations,
      mentionCandidate: "~billing",
    });

    expect(plusResult.isOk()).toBe(true);
    if (plusResult.isErr()) {
      throw plusResult.error;
    }
    expect(plusResult.value.mention).toEqual({
      agentId: "support",
      agentName: "SupportAgent",
    });
    expect(tildeResult.isOk()).toBe(true);
    if (tildeResult.isErr()) {
      throw tildeResult.error;
    }
    expect(tildeResult.value.mention).toEqual({
      agentId: "billing",
      agentName: "BillingAgent",
    });
  });
});

describe("processMessageForMention", () => {
  it("detects =mentions through the shared mention pattern", () => {
    const result = processMessageForMention({
      message: "=supportagent help me",
      activeAgentConfigurations,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value).toEqual({
      mention: {
        agentId: "support",
        agentName: "SupportAgent",
      },
      processedMessage: "help me",
    });
  });

  it("detects =mentions with dots through the shared mention pattern", () => {
    const result = processMessageForMention({
      message: "=gpt5.5 help me",
      activeAgentConfigurations,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value).toEqual({
      mention: {
        agentId: "gpt-5-5",
        agentName: "gpt5.5",
      },
      processedMessage: "help me",
    });
  });

  it("detects =mentions ending with a dot through the shared mention pattern", () => {
    const result = processMessageForMention({
      message: "=test. help me",
      activeAgentConfigurations,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value).toEqual({
      mention: {
        agentId: "test-dot",
        agentName: "test.",
      },
      processedMessage: "help me",
    });
  });
});
