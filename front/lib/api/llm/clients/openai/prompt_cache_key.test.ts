import { OpenAIResponsesLLM } from "@app/lib/api/llm/clients/openai";
import type { LLMStreamParameters } from "@app/lib/api/llm/types/options";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { GPT_5_6_LUNA_MODEL_ID } from "@app/types/assistant/models/openai";
import { describe, expect, it, vi } from "vitest";

const kit = vi.hoisted(() => {
  const requests: Array<{ prompt_cache_key?: string }> = [];
  const emptyStream = () => (async function* () {})();

  class MockOpenAI {
    responses = {
      create: (request: { prompt_cache_key?: string }) => {
        requests.push(request);
        return emptyStream();
      },
    };
  }

  return { MockOpenAI, requests };
});

vi.mock("openai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("openai")>();
  return { ...actual, OpenAI: kit.MockOpenAI };
});

function streamParameters(conversationId: string): LLMStreamParameters {
  return {
    conversation: {
      messages: [
        {
          role: "user",
          name: "User",
          content: [{ type: "text", text: conversationId }],
        },
      ],
    },
    prompt: "You are a helpful assistant.",
    specifications: [],
  };
}

describe("OpenAI prompt cache key", () => {
  it("reuses the key across conversations for the same workspace and agent", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const agent =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const firstConversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [],
    });
    const secondConversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [],
    });
    const llm = new OpenAIResponsesLLM(authenticator, {
      credentials: { OPENAI_API_KEY: "test-openai-key" },
      modelId: GPT_5_6_LUNA_MODEL_ID,
      bypassFeatureFlag: true,
    });
    const metadata = {
      workspaceId: workspace.sId,
      agentConfigurationId: agent.sId,
    };

    expect(firstConversation.sId).not.toBe(secondConversation.sId);

    for await (const _ of llm.stream(
      streamParameters(firstConversation.sId),
      metadata
    )) {
      // Drain the mocked stream.
    }
    for await (const _ of llm.stream(
      streamParameters(secondConversation.sId),
      metadata
    )) {
      // Drain the mocked stream.
    }

    const expectedKey = `${workspace.sId}:${agent.sId}`;
    expect(kit.requests.map((request) => request.prompt_cache_key)).toEqual([
      expectedKey,
      expectedKey,
    ]);
  });
});
