import { getLLM } from "@app/lib/api/llm";
import type { Authenticator } from "@app/lib/auth";
import { MAX_TOOL_CALL_ROUNDS } from "@app/tests/copilot-evals/lib/config";
import { getMockToolResponse } from "@app/tests/copilot-evals/lib/mock-responses";
import type {
  CopilotConfig,
  CopilotExecutionResult,
  MockAgentState,
  ToolCall,
} from "@app/tests/copilot-evals/lib/types";
import type { ModelMessageTypeMultiActionsWithoutContentFragment } from "@app/types/assistant/generation";

export async function executeCopilot(
  auth: Authenticator,
  config: CopilotConfig,
  userMessage: string,
  agentState: MockAgentState
): Promise<CopilotExecutionResult> {
  const llm = await getLLM(auth, {
    modelId: config.model.modelId,
    temperature: config.model.temperature ?? null,
    reasoningEffort: config.model.reasoningEffort ?? null,
    bypassFeatureFlag: true,
  });

  if (!llm) {
    throw new Error("Failed to initialize LLM for copilot execution");
  }

  const messages: ModelMessageTypeMultiActionsWithoutContentFragment[] = [
    {
      role: "user",
      name: "User",
      content: [{ type: "text", text: userMessage }],
    },
  ];

  const allToolCalls: ToolCall[] = [];
  let responseText = "";

  let events = llm.stream({
    conversation: { messages },
    prompt: config.instructions,
    specifications: config.tools,
  });

  for (let round = 0; round < MAX_TOOL_CALL_ROUNDS; round++) {
    const currentRoundToolCalls: ToolCall[] = [];
    responseText = "";

    for await (const event of events) {
      switch (event.type) {
        case "text_delta":
          responseText += event.content.delta;
          break;
        case "text_generated":
          responseText = event.content.text;
          break;
        case "tool_call":
          currentRoundToolCalls.push({
            name: event.content.name,
            arguments: event.content.arguments,
          });
          break;
        case "error":
          throw new Error(`Copilot LLM error: ${event.content.message}`);
      }
    }

    // No more tool calls - we have the final response
    if (currentRoundToolCalls.length === 0) {
      break;
    }

    allToolCalls.push(...currentRoundToolCalls);

    // Build messages with tool calls and simulated responses
    for (let idx = 0; idx < currentRoundToolCalls.length; idx++) {
      const tc = currentRoundToolCalls[idx];
      const callId = (
        allToolCalls.length -
        currentRoundToolCalls.length +
        idx +
        1
      )
        .toString()
        .padStart(9, "0");

      const functionCall = {
        id: callId,
        name: tc.name,
        arguments: JSON.stringify(tc.arguments),
      };

      messages.push({
        role: "assistant" as const,
        function_calls: [functionCall],
        contents: [{ type: "function_call" as const, value: functionCall }],
      });

      messages.push({
        role: "function" as const,
        name: tc.name,
        function_call_id: callId,
        content: getMockToolResponse(tc.name, agentState),
      });
    }

    // Continue conversation with tool results
    events = llm.stream({
      conversation: { messages },
      prompt: config.instructions,
      specifications: config.tools,
    });
  }

  return { responseText, toolCalls: allToolCalls };
}
