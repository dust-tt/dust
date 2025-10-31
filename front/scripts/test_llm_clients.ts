import { assertNever } from "@dust-tt/sparkle";

import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { getLLM } from "@app/lib/api/llm";
import {
  ANTHROPIC_WHITELISTED_NON_REASONING_MODEL_IDS,
  ANTHROPIC_WHITELISTED_REASONING_MODEL_IDS,
} from "@app/lib/api/llm/clients/anthropic/types";
import type { LLMParameters } from "@app/lib/api/llm/types/options";
import { Authenticator } from "@app/lib/auth";
import type {
  ModelIdType,
  ModelProviderIdType,
  ReasoningEffort,
} from "@app/types";
import type {
  ModelConversationTypeMultiActions,
  ModelMessageTypeMultiActionsWithoutContentFragment,
} from "@app/types/assistant/generation";

const SYSTEM_PROMPT = "You are a helpful assistant.";

type TestConfig = LLMParameters & { provider: ModelProviderIdType };

type ResponseChecker =
  | {
      type: "text_contains";
      substring: string;
    }
  | {
      type: "has_tool_call";
      toolName: string;
      expectedArguments: string;
    }
  | null;

interface TestConversation {
  name: string;
  systemPrompt: string;
  conversationActions: ModelConversationTypeMultiActions[];
  /** Array of response checkers aligned with the conversation actions */
  expectedInResponses: ResponseChecker[];
  specifications?: AgentActionSpecification[];
}

/**
 * Creates a mock Authenticator for testing purposes.
 * This is a minimal mock that bypasses actual authentication.
 */
function createMockAuthenticator(): Authenticator {
  return new Authenticator({
    workspace: null,
    user: null,
    role: "none",
    groups: [],
    subscription: null,
  });
}

const REASONING_PARAMETER_CONFIGS: {
  temperature: number;
  reasoningEffort: ReasoningEffort;
}[] = [
  {
    temperature: 0.5,
    reasoningEffort: "none",
  },
  {
    temperature: 1,
    reasoningEffort: "light",
  },
  {
    temperature: 0.5,
    reasoningEffort: "medium",
  },
  {
    temperature: 1,
    reasoningEffort: "high",
  },
];

function generateAnthropicThinkingTestConfigs(
  modelId: ModelIdType
): TestConfig[] {
  return REASONING_PARAMETER_CONFIGS.map((params) => ({
    provider: "anthropic",
    modelId: modelId,
    ...params,
  }));
}

const NON_REASONING_PARAMETER_CONFIGS: {
  temperature: number;
}[] = [
  {
    temperature: 0.5,
  },
  {
    temperature: 1,
  },
];

function generateAnthropicNotThinkingTestConfigs(
  modelId: ModelIdType
): TestConfig[] {
  return NON_REASONING_PARAMETER_CONFIGS.map((params) => ({
    provider: "anthropic",
    modelId: modelId,
    ...params,
  }));
}

const TEST_CONFIGS: TestConfig[] = [
  ...ANTHROPIC_WHITELISTED_REASONING_MODEL_IDS.flatMap(
    generateAnthropicThinkingTestConfigs
  ),
  ...ANTHROPIC_WHITELISTED_NON_REASONING_MODEL_IDS.flatMap(
    generateAnthropicNotThinkingTestConfigs
  ),
];

function userMessage(text: string): ModelConversationTypeMultiActions {
  return {
    messages: [
      {
        role: "user",
        name: "User",
        content: [
          {
            type: "text",
            text: text,
          },
        ],
      },
    ],
  };
}

function userMessageWithImage(
  text: string,
  imageUrl: string
): ModelConversationTypeMultiActions {
  return {
    messages: [
      {
        role: "user",
        name: "User",
        content: [
          {
            type: "text",
            text: text,
          },
          {
            type: "image_url",
            image_url: {
              url: imageUrl,
            },
          },
        ],
      },
    ],
  };
}

function userToolCall(
  toolName: string,
  toolOutput: string
): ModelConversationTypeMultiActions {
  return {
    messages: [
      {
        role: "function",
        name: toolName,
        function_call_id: "1",
        content: toolOutput,
      },
    ],
  };
}

function containsTextChecker(substring: string): ResponseChecker {
  return {
    type: "text_contains",
    substring,
  };
}

function hasToolCall(
  toolName: string,
  expectedArguments: string
): ResponseChecker {
  return {
    type: "has_tool_call",
    toolName,
    expectedArguments,
  };
}

const TEST_CONVERSATIONS: TestConversation[] = [
  {
    name: "Simple Math",
    systemPrompt: SYSTEM_PROMPT,
    conversationActions: [
      userMessage("Be concise. What is 2+2? Just give the number."),
    ],
    expectedInResponses: [containsTextChecker("4")],
  },
  {
    name: "Yes/No Question",
    systemPrompt: SYSTEM_PROMPT,
    conversationActions: [
      userMessage("Answer only yes or no. Is Paris the capital of France?"),
    ],
    expectedInResponses: [containsTextChecker("yes")],
  },
  {
    name: "2 steps conversation",
    systemPrompt: SYSTEM_PROMPT,
    conversationActions: [
      userMessage("Be very brief. Hello my name is Stan ! How are you?"),
      userMessage("What is my name ?"),
    ],
    expectedInResponses: [null, containsTextChecker("Stan")],
  },
  {
    name: "Tool usage required",
    systemPrompt: SYSTEM_PROMPT,
    conversationActions: [
      userMessage("What is the id of Stan?"),
      userToolCall("GetUserId", "88888"),
    ],
    expectedInResponses: [
      hasToolCall("GetUserId", "Stan"),
      containsTextChecker("88888"),
    ],
    specifications: [
      {
        name: "GetUserId",
        description: "Get the user ID given the user's name.",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "The name of the user.",
            },
          },
          required: ["name"],
        },
      },
    ],
  },
  {
    name: "Image description",
    systemPrompt: SYSTEM_PROMPT,
    conversationActions: [
      userMessageWithImage(
        "Describe this image.",
        "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/481px-Cat03.jpg"
      ),
    ],
    expectedInResponses: [containsTextChecker("cat")],
  },
];

async function runTest(
  config: TestConfig,
  conversation: TestConversation
): Promise<void> {
  console.log(
    `- Testing ${config.provider} - ${config.modelId} - T=${config.temperature} - R=${config.reasoningEffort} - ${conversation.name}`
  );

  try {
    const mockAuth = createMockAuthenticator();
    const llm = await getLLM(mockAuth, {
      modelId: config.modelId,
      temperature: config.temperature,
      reasoningEffort: config.reasoningEffort,
      bypassFeatureFlag: true,
    });
    if (llm === null) {
      throw new Error("LLM instance is null");
    }

    const conversationHistory: ModelMessageTypeMultiActionsWithoutContentFragment[] =
      [];

    // Call the LLM
    for (const actionIndex in conversation.conversationActions) {
      const conversationAction = conversation.conversationActions[actionIndex];
      const expectedInResponse = conversation.expectedInResponses[actionIndex];

      conversationHistory.push(...conversationAction.messages);

      const eventStreamResult = llm.stream({
        conversation: { messages: conversationHistory },
        prompt: conversation.systemPrompt,
        specifications: conversation.specifications ?? [],
      });

      if (eventStreamResult.isErr()) {
        throw eventStreamResult.error;
      }

      let responseFromDeltas = "";
      let fullResponse = "";
      let reasoningFromDeltas = "";
      let fullReasoning = "";
      let outputTokens = null;
      const toolCalls: { name: string; arguments: string }[] = [];
      let toolCallId = 1;

      // Collect all events
      for await (const event of eventStreamResult.value) {
        switch (event.type) {
          case "text_delta":
            responseFromDeltas += event.content.delta;
            break;
          case "text_generated":
            fullResponse = event.content.text;
            conversationHistory.push({
              role: "assistant",
              name: "Assistant",
              contents: [{ type: "text_content", value: event.content.text }],
            });
            break;
          case "reasoning_delta":
            reasoningFromDeltas += event.content.delta;
            break;
          case "reasoning_generated":
            fullReasoning = event.content.text;
            const signature = event.metadata.signature ?? "";
            conversationHistory.push({
              role: "assistant",
              name: "Assistant",
              contents: [
                {
                  type: "reasoning",
                  value: {
                    reasoning: event.content.text,
                    metadata: JSON.stringify({ signature: signature }),
                    tokens: 12,
                    provider: config.provider,
                  },
                },
              ],
            });
            break;
          case "token_usage":
            outputTokens = event.content.outputTokens;
            break;
          case "error":
            throw new Error(`LLM Error: ${event.content.message}`);
          case "tool_call":
            toolCalls.push({
              name: event.content.name,
              arguments: event.content.arguments,
            });
            conversationHistory.push({
              role: "assistant",
              name: "Assistant",
              contents: [
                {
                  type: "function_call",
                  value: {
                    id: `${toolCallId++}`,
                    name: event.content.name,
                    arguments: event.content.arguments,
                  },
                },
              ],
            });
            break;
        }
      }

      if (fullResponse !== responseFromDeltas) {
        console.log(
          `   ⚠️ Mismatch between response from deltas and full response.\nDeltas: "${responseFromDeltas}"\nFull: "${fullResponse}"`
        );
      }

      if (fullReasoning !== reasoningFromDeltas) {
        console.log(
          `   ⚠️ Mismatch between reasoning from deltas and full reasoning.\nDeltas: "${reasoningFromDeltas}"\nFull: "${fullReasoning}"`
        );
      }

      if (outputTokens === null) {
        console.log(`   ⚠️ No token usage event received`);
      }

      if (expectedInResponse !== null) {
        switch (expectedInResponse.type) {
          case "text_contains":
            const substring = expectedInResponse.substring;
            if (
              !responseFromDeltas
                .toLowerCase()
                .includes(substring.toLowerCase())
            ) {
              throw new Error(
                `Expected response to contain "${substring}", but it was not found.\nFull response: "${responseFromDeltas}"`
              );
            }
            break;
          case "has_tool_call":
            const { toolName, expectedArguments } = expectedInResponse;
            const matchingToolCall = toolCalls.find(
              (tc) =>
                tc.name === toolName && tc.arguments.includes(expectedArguments)
            );
            if (!matchingToolCall) {
              throw new Error(
                `Expected tool call "${toolName}" with arguments containing "${expectedArguments}", but it was not found.\nTool calls made: ${JSON.stringify(
                  toolCalls
                )}`
              );
            }
            break;
          default:
            assertNever(expectedInResponse);
        }
      }
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error}`);
    throw error;
  }
}

async function main() {
  console.log("=== Starting LLM Client Tests ===\n");
  console.log(`Testing ${TEST_CONFIGS.length} config(s)`);
  console.log(`Testing ${TEST_CONVERSATIONS.length} conversation(s)`);
  console.log(
    `Total tests: ${TEST_CONFIGS.length * TEST_CONVERSATIONS.length}\n`
  );

  let passed = 0;
  let failed = 0;

  for (const config of TEST_CONFIGS) {
    for (const conversation of TEST_CONVERSATIONS) {
      try {
        await runTest(config, conversation);
        passed++;
      } catch (error) {
        failed++;
        console.error(`Test failed with error:`, error);
      }
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`📈 Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }
}

main()
  .then(() => {
    console.log("\n✨ All tests completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Test suite failed:", error);
    process.exit(1);
  });
