import type { LightAgentConfigurationType } from "@dust-tt/client";
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
});
