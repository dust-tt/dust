import { getModelConfigByModelId } from "@app/lib/llms/model_configurations";
import {
  MAX_TOOL_CALL_ROUNDS,
  VERBOSE,
} from "@app/tests/conversational-building-evals/lib/config";
import {
  isExploratoryToolName,
  runTool,
} from "@app/tests/conversational-building-evals/lib/tool-runner";
import type {
  BuildingAgentConfig,
  ExecutionResult,
  SeededScenario,
  TestCase,
  ToolCall,
} from "@app/tests/conversational-building-evals/lib/types";
import { isTestCaseWithConversation } from "@app/tests/conversational-building-evals/lib/types";
import { getEvalStreamLLM } from "@app/tests/utils/eval_llm";
import type {
  AgentContentItemType,
  AgentErrorContentType,
} from "@app/types/assistant/agent_message_content";
import type { ModelMessageTypeMultiActionsWithoutContentFragment } from "@app/types/assistant/generation";
import { assertNever } from "@app/types/shared/utils/assert_never";

function buildInitialMessages(
  config: BuildingAgentConfig,
  testCase: TestCase
): ModelMessageTypeMultiActionsWithoutContentFragment[] {
  const messages: ModelMessageTypeMultiActionsWithoutContentFragment[] = [
    // The skill is already enabled: production injects its instructions as a system-named user
    // message ahead of the conversation.
    {
      role: "user",
      name: "system",
      content: [{ type: "text", text: config.skillInstructionsMessage }],
    },
  ];

  if (isTestCaseWithConversation(testCase)) {
    for (const msg of testCase.conversation) {
      switch (msg.role) {
        case "user":
          messages.push({
            role: "user",
            name: "User",
            content: [{ type: "text", text: msg.content }],
          });
          break;
        case "assistant":
          messages.push({
            role: "assistant",
            name: "assistant",
            content: msg.content,
            contents: [{ type: "text_content", value: msg.content }],
          });
          break;
        default:
          assertNever(msg.role);
      }
    }
  } else {
    messages.push({
      role: "user",
      name: "User",
      content: [{ type: "text", text: testCase.userMessage }],
    });
  }

  return messages;
}

/**
 * Runs the agent on the scenario. Every tool call, exploratory or terminal, runs for real against
 * the scenario's seeded workspace so the agent gets to write its closing message; the run ends
 * when a round produces no tool call.
 */
export async function executeBuildingAgent(
  scenario: SeededScenario,
  config: BuildingAgentConfig,
  testCase: TestCase
): Promise<ExecutionResult> {
  const llm = await getEvalStreamLLM(scenario.auth, {
    modelId: config.model.modelId,
    temperature: config.model.temperature ?? undefined,
    reasoningEffort: config.model.reasoningEffort ?? undefined,
  });

  const messages = buildInitialMessages(config, testCase);

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
          throw new Error(`Agent LLM error: ${event.content.message}`);
      }
    }

    totalModelTimeMs += Date.now() - streamStart;

    if (currentRoundToolCalls.length === 0) {
      completed = true;
      break;
    }

    allToolCalls.push(...currentRoundToolCalls.map((tc) => tc.toolCall));

    const functionCalls = currentRoundToolCalls.map((tc) => ({
      id: tc.id,
      name: tc.toolCall.name,
      arguments: JSON.stringify(tc.toolCall.arguments),
      metadata: tc.thoughtSignature
        ? { thoughtSignature: tc.thoughtSignature }
        : undefined,
    }));

    messages.push({
      role: "assistant" as const,
      function_calls: functionCalls,
      contents: [
        ...reasoningContents,
        ...functionCalls.map((fc) => ({
          type: "function_call" as const,
          value: fc,
        })),
      ],
    });

    for (const tc of currentRoundToolCalls) {
      const output = await runTool(
        scenario,
        tc.toolCall.name,
        tc.toolCall.arguments
      );
      if (VERBOSE) {
        console.log(
          `[${testCase.scenarioId}] ${tc.toolCall.name}(${JSON.stringify(tc.toolCall.arguments)}) -> ${output}`
        );
      }
      messages.push({
        role: "function" as const,
        name: tc.toolCall.name,
        function_call_id: tc.id,
        content: output,
      });
    }

    streamStart = Date.now();
    events = llm.stream({
      conversation: { messages },
      prompt: config.instructions,
      specifications: config.tools,
    });
  }

  // Without this the run looks like a normal answer that happens to be empty, and the judge
  // scores a response the agent never got to write.
  if (!completed) {
    throw new Error(
      `Agent did not finish within ${MAX_TOOL_CALL_ROUNDS} tool call rounds. ` +
        `Tools called: [${allToolCalls.map((tc) => tc.name).join(", ")}]`
    );
  }

  const finalToolCall =
    [...allToolCalls].reverse().find((tc) => !isExploratoryToolName(tc.name)) ??
    null;

  return {
    responseText,
    toolCalls: allToolCalls,
    finalToolCall,
    modelTimeMs: totalModelTimeMs,
  };
}
