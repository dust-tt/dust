import type { LLM } from "@app/lib/api/llm/llm";
import { createLLMTraceId } from "@app/lib/api/llm/traces/buffer";
import {
  AgentMessageContentParser,
  getDelimitersConfiguration,
} from "@app/lib/llms/agent_message_content_parser";
import { getOutputFromLLMStream } from "@app/temporal/agent_loop/lib/get_output_from_llm";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { getTestStreamEndpoint } from "@app/tests/utils/models";
import { Ok } from "@app/types/shared/result";
import { assert, describe, expect, it, vi } from "vitest";

vi.mock("@temporalio/activity", () => ({
  CancelledFailure: class CancelledFailure extends Error {},
  heartbeat: vi.fn(),
  sleep: vi.fn(),
}));

describe("getOutputFromLLMStream", () => {
  it("retries a successful stream with no content or actions", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const agent = await AgentConfigurationFactory.createTestAgent(auth, {
      model: {
        providerId: "google_ai_studio",
        modelId: "gemini-3.5-flash",
      },
    });
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [new Date()],
    });
    const [[userMessage], [agentMessage]] = conversation.content;
    assert(userMessage?.type === "user_message");
    assert(agentMessage?.type === "agent_message");
    const { model: agentModel, ...agentConfiguration } = agent;
    const endpoint = getTestStreamEndpoint(agentModel.modelId);
    const contentParser = new AgentMessageContentParser(
      agentConfiguration,
      agentMessage.sId,
      getDelimitersConfiguration({ endpoint, ...agentModel })
    );
    const metadata = {
      clientId: "google_ai_studio",
      inferenceProvider: "agent-platform",
      inferenceRegion: "global",
      modelId: "gemini-3.5-flash",
    } as const;
    const llm = {
      async *stream() {
        yield {
          type: "success",
          aggregated: [],
          metadata,
        } as const;
      },
      getResponseFormat: () => null,
      getTraceId: () => createLLMTraceId("test"),
    } satisfies Pick<LLM, "getResponseFormat" | "getTraceId" | "stream">;
    const flushParserTokens = vi.fn(async () => {});

    const result = await getOutputFromLLMStream(auth, {
      modelConversationRes: new Ok({
        modelConversation: { messages: [] },
        tokensUsed: 0,
      }),
      conversation,
      toolSearchEnabled: false,
      disableToolUse: false,
      cacheDiagnosticsEnabled: false,
      userMessage,
      specifications: [],
      flushParserTokens,
      contentParser,
      step: 1,
      agentConfiguration,
      agentMessage,
      model: endpoint.modelConfig,
      activityTimeoutDeadlineMs: Date.now() + 10_000,
      publishAgentError: vi.fn(async () => {}),
      prompt: [],
      llm,
      updateResourceAndPublishEvent: vi.fn(async () => {}),
    });

    assert(result.isErr());
    expect(result.error).toEqual({
      type: "shouldRetryMessage",
      content: {
        type: "unknown_error",
        message: "The model returned an empty response.",
        isRetryable: true,
      },
    });
    expect(flushParserTokens).toHaveBeenCalledOnce();
  });
});
