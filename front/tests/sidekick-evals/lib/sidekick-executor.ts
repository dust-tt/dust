import { getLLM } from "@app/lib/api/llm";
import type { Authenticator } from "@app/lib/auth";
import { getModelConfigByModelId } from "@app/lib/llms/model_configurations";
import { MAX_TOOL_CALL_ROUNDS } from "@app/tests/sidekick-evals/lib/config";
import { getMockToolResponse } from "@app/tests/sidekick-evals/lib/mock-responses";
import {
  isTestCaseWithConversation,
  type MockAgentState,
  type SidekickConfig,
  type SidekickExecutionResult,
  type TestCase,
  type ToolCall,
} from "@app/tests/sidekick-evals/lib/types";
import type {
  AgentContentItemType,
  AgentErrorContentType,
} from "@app/types/assistant/agent_message_content";
import type { ModelMessageTypeMultiActionsWithoutContentFragment } from "@app/types/assistant/generation";

export async function executeSidekick(
  auth: Authenticator,
  config: SidekickConfig,
  testCase: TestCase,
  agentState: MockAgentState
): Promise<SidekickExecutionResult> {
  const llm = await getLLM(auth, {
    modelId: config.model.modelId,
    temperature: config.model.temperature ?? null,
    reasoningEffort: config.model.reasoningEffort ?? null,
    bypassFeatureFlag: true,
  });

  if (!llm) {
    throw new Error("Failed to initialize LLM for sidekick execution");
  }

  // Build initial messages from either a single user message or a conversation history.
  const messages: ModelMessageTypeMultiActionsWithoutContentFragment[] = [];

  if (isTestCaseWithConversation(testCase)) {
    for (const msg of testCase.conversation) {
      if (msg.role === "user") {
        messages.push({
          role: "user",
          name: "User",
          content: [{ type: "text", text: msg.content }],
        });
      } else {
        messages.push({
          role: "assistant",
          name: "assistant",
          content: msg.content,
          contents: [{ type: "text_content", value: msg.content }],
        });
      }
    }
  } else {
    messages.push({
      role: "user",
      name: "User",
      content: [{ type: "text", text: testCase.userMessage }],
    });
  }

  const allToolCalls: ToolCall[] = [];
  let responseText = "";
  let totalModelTimeMs = 0;

  let streamStart = Date.now();
  let events = llm.stream({
    conversation: { messages },
    prompt: config.instructions,
    specifications: config.tools,
  });

  for (let round = 0; round < MAX_TOOL_CALL_ROUNDS; round++) {
    const currentRoundToolCalls: Array<{
      toolCall: ToolCall;
      id: string;
      thoughtSignature?: string;
    }> = [];
    const reasoningContents: Exclude<
      AgentContentItemType,
      AgentErrorContentType
    >[] = [];
    responseText = "";

    for await (const event of events) {
      switch (event.type) {
        case "text_delta":
          responseText += event.content.delta;
          break;
        case "text_generated":
          responseText = event.content.text;
          break;
        case "reasoning_generated":
          reasoningContents.push({
            type: "reasoning",
            value: {
              reasoning: event.content.text,
              metadata: JSON.stringify(event.metadata),
              tokens: 0,
              provider:
                getModelConfigByModelId(config.model.modelId)?.providerId ??
                "noop",
            },
          });
          break;
        case "tool_call":
          currentRoundToolCalls.push({
            toolCall: {
              name: event.content.name,
              arguments: event.content.arguments,
            },
            id: event.content.id,
            thoughtSignature: event.metadata.thoughtSignature,
          });
          break;
        case "error":
          throw new Error(`Sidekick LLM error: ${event.content.message}`);
      }
    }

    totalModelTimeMs += Date.now() - streamStart;

    // No more tool calls - we have the final response
    if (currentRoundToolCalls.length === 0) {
      break;
    }

    allToolCalls.push(...currentRoundToolCalls.map((tc) => tc.toolCall));

    // Build a single assistant message with reasoning + all function calls
    const functionCalls = currentRoundToolCalls.map((tc) => ({
      id: tc.id,
      name: tc.toolCall.name,
      arguments: JSON.stringify(tc.toolCall.arguments),
      metadata: tc.thoughtSignature
        ? { thoughtSignature: tc.thoughtSignature }
        : undefined,
    }));

    const contents: Exclude<AgentContentItemType, AgentErrorContentType>[] = [
      ...reasoningContents,
      ...functionCalls.map((fc) => ({
        type: "function_call" as const,
        value: fc,
      })),
    ];

    messages.push({
      role: "assistant" as const,
      function_calls: functionCalls,
      contents,
    });

    // Add function response messages
    for (const tc of currentRoundToolCalls) {
      messages.push({
        role: "function" as const,
        name: tc.toolCall.name,
        function_call_id: tc.id,
        content: getMockToolResponse(
          tc.toolCall.name,
          agentState,
          tc.toolCall.arguments
        ),
      });
    }

    // Continue conversation with tool results
    streamStart = Date.now();
    events = llm.stream({
      conversation: { messages },
      prompt: config.instructions,
      specifications: config.tools,
    });
  }

  return {
    responseText,
    toolCalls: allToolCalls,
    modelTimeMs: totalModelTimeMs,
  };
}
