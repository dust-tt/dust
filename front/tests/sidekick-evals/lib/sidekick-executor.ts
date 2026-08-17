import { UserQuestionSchema } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { getModelConfigByModelId } from "@app/lib/llms/model_configurations";
import { MAX_TOOL_CALL_ROUNDS } from "@app/tests/sidekick-evals/lib/config";
import { getMockToolResponse } from "@app/tests/sidekick-evals/lib/mock-responses";
import type {
  MockAgentState,
  SidekickConfig,
  SidekickExecutionResult,
  TestCase,
  ToolCall,
} from "@app/tests/sidekick-evals/lib/types";
import { isTestCaseWithConversation } from "@app/tests/sidekick-evals/lib/types";
import { getEvalStreamLLM } from "@app/tests/utils/eval_llm";
import type {
  AgentContentItemType,
  AgentErrorContentType,
} from "@app/types/assistant/agent_message_content";
import type { ModelMessageTypeMultiActionsWithoutContentFragment } from "@app/types/assistant/generation";

// Prior exchange prepended to every scenario that is not explicitly testing
// first-message behaviour. Two prompt rules make this necessary:
// - Step 1 requires `get_agent_config` on every message except the first, which
//   is what the scenarios' `expectedToolCalls` assert.
// - <user_confirmation_before_heavy_work> makes the sidekick stop and ask before
//   heavy work such as a full instruction rewrite. The scenarios are judged on
//   the suggestions themselves, so the user grants that permission up front.
const SEEDED_USER_OPENING =
  "I want to work on this agent. Go ahead and make the changes directly — you " +
  "don't need to ask me to confirm before doing the work.";
const SEEDED_ASSISTANT_REPLY =
  "Understood — I'll make the changes directly. What would you like to change?";

const SEEDED_OPENING_EXCHANGE: ModelMessageTypeMultiActionsWithoutContentFragment[] =
  [
    {
      role: "user",
      name: "User",
      content: [{ type: "text", text: SEEDED_USER_OPENING }],
    },
    {
      role: "assistant",
      name: "assistant",
      content: SEEDED_ASSISTANT_REPLY,
      contents: [{ type: "text_content", value: SEEDED_ASSISTANT_REPLY }],
    },
  ];

// Renders an `ask_user_question` call the way the user would see it, so a turn
// that ends on a question is judged on the question rather than on empty text.
function formatUserQuestion(toolCall: ToolCall): string {
  const parsed = UserQuestionSchema.safeParse(toolCall.arguments);
  if (!parsed.success) {
    return `[asked the user: ${JSON.stringify(toolCall.arguments)}]`;
  }

  const { question, options } = parsed.data;
  const lines = [question];
  for (const option of options) {
    lines.push(
      `- ${option.label}${option.description ? `: ${option.description}` : ""}`
    );
  }

  return lines.join("\n");
}

export async function executeSidekick(
  auth: Authenticator,
  config: SidekickConfig,
  testCase: TestCase,
  agentState: MockAgentState
): Promise<SidekickExecutionResult> {
  const llm = await getEvalStreamLLM(auth, {
    modelId: config.model.modelId,
    temperature: config.model.temperature ?? undefined,
    reasoningEffort: config.model.reasoningEffort ?? undefined,
  });

  // Build initial messages from either a single user message or a conversation history.
  const messages: ModelMessageTypeMultiActionsWithoutContentFragment[] = [];

  if (!testCase.isFirstMessage) {
    messages.push(...SEEDED_OPENING_EXCHANGE);
  }

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

  let completed = false;

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
      completed = true;
      break;
    }

    allToolCalls.push(...currentRoundToolCalls.map((tc) => tc.toolCall));

    const userQuestion = currentRoundToolCalls.find(
      (tc) => tc.toolCall.name === "ask_user_question"
    );
    if (testCase.stopOnUserQuestion && userQuestion) {
      // The question is the sidekick's actual output here. Without this the
      // judge is handed an empty response and marks the turn down for it, even
      // though asking is exactly what the scenario is testing.
      responseText = [responseText, formatUserQuestion(userQuestion.toolCall)]
        .filter((part) => part.length > 0)
        .join("\n\n");
      completed = true;
      break;
    }

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

  // Without this the run looks like a normal answer that happens to be empty,
  // and the judge scores a response the sidekick never got to write.
  if (!completed) {
    throw new Error(
      `Sidekick did not finish within ${MAX_TOOL_CALL_ROUNDS} tool call rounds. ` +
        `Tools called: [${allToolCalls.map((tc) => tc.name).join(", ")}]`
    );
  }

  return {
    responseText,
    toolCalls: allToolCalls,
    modelTimeMs: totalModelTimeMs,
  };
}
