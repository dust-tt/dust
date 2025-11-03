import { assertNever } from "@dust-tt/sparkle";

import { getLLM } from "@app/lib/api/llm";
import {
  ANTHROPIC_WHITELISTED_NON_REASONING_MODEL_IDS,
  ANTHROPIC_WHITELISTED_REASONING_MODEL_IDS,
} from "@app/lib/api/llm/clients/anthropic/types";
import {
  GOOGLE_AI_STUDIO_WHITELISTED_NON_REASONING_MODEL_IDS,
  GOOGLE_AI_STUDIO_WHITELISTED_REASONING_MODEL_IDS,
} from "@app/lib/api/llm/clients/google/types";
import {
  MISTRAL_GENERIC_WHITELISTED_MODEL_IDS,
  MISTRAL_WHITELISTED_MODEL_IDS_WITHOUT_IMAGE_SUPPORT,
} from "@app/lib/api/llm/clients/mistral/types";
import { Authenticator } from "@app/lib/auth";
import { makeScript } from "@app/scripts/helpers";
import type {
  ResponseChecker,
  TestConfig,
  TestConversation,
} from "@app/scripts/llm_router/types";
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

function generateThinkingTestConfigs(
  provider: ModelProviderIdType,
  modelId: ModelIdType
): TestConfig[] {
  return REASONING_PARAMETER_CONFIGS.map((params) => ({
    provider: provider,
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

function generateNotThinkingTestConfigs(
  provider: ModelProviderIdType,
  modelId: ModelIdType
): TestConfig[] {
  return NON_REASONING_PARAMETER_CONFIGS.map((params) => ({
    provider: provider,
    modelId: modelId,
    ...params,
  }));
}

const TEST_CONFIGS: TestConfig[] = [
  // Anthropic
  ...ANTHROPIC_WHITELISTED_REASONING_MODEL_IDS.flatMap((modelId) =>
    generateThinkingTestConfigs("anthropic", modelId)
  ),
  ...ANTHROPIC_WHITELISTED_NON_REASONING_MODEL_IDS.flatMap((modelId) =>
    generateNotThinkingTestConfigs("anthropic", modelId)
  ),

  // Google AI Studio
  ...GOOGLE_AI_STUDIO_WHITELISTED_NON_REASONING_MODEL_IDS.flatMap((modelId) =>
    generateNotThinkingTestConfigs("google_ai_studio", modelId)
  ),
  ...GOOGLE_AI_STUDIO_WHITELISTED_REASONING_MODEL_IDS.flatMap((modelId) =>
    generateThinkingTestConfigs("google_ai_studio", modelId)
  ),

  // Mistral
  ...MISTRAL_GENERIC_WHITELISTED_MODEL_IDS.flatMap((modelId) =>
    generateNotThinkingTestConfigs("mistral", modelId)
  ),
  ...MISTRAL_WHITELISTED_MODEL_IDS_WITHOUT_IMAGE_SUPPORT.flatMap((modelId) =>
    generateNotThinkingTestConfigs("mistral", modelId)
  ).map((config) => ({
    ...config,
    support: {
      imageInputs: false,
    },
  })),
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
        function_call_id: "000000001",
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
    id: "simple-math",
    name: "Simple Math",
    systemPrompt: SYSTEM_PROMPT,
    conversationActions: [
      userMessage("Be concise. What is 2+2? Just give the number."),
    ],
    expectedInResponses: [containsTextChecker("4")],
  },
  {
    id: "yes-no-question",
    name: "Yes/No Question",
    systemPrompt: SYSTEM_PROMPT,
    conversationActions: [
      userMessage("Answer only yes or no. Is Paris the capital of France?"),
    ],
    expectedInResponses: [containsTextChecker("yes")],
  },
  {
    id: "multi-step-conversation",
    name: "2 steps conversation",
    systemPrompt: SYSTEM_PROMPT,
    conversationActions: [
      userMessage("Be very brief. Hello my name is Stan ! How are you?"),
      userMessage("What is my name ?"),
    ],
    expectedInResponses: [null, containsTextChecker("Stan")],
  },
  {
    id: "tool-usage",
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
    id: "image-description",
    name: "Image description",
    systemPrompt: SYSTEM_PROMPT,
    conversationActions: [
      userMessageWithImage(
        "Describe this image.",
        "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/481px-Cat03.jpg"
      ),
    ],
    expectedInResponses: [containsTextChecker("cat")],
    skipConfig: (config: TestConfig) => {
      const supportImagesInput = config.support?.imageInputs ?? true;
      return !supportImagesInput;
    },
  },
];

/**
 * Runs a test for the LLM client.
 *
 * To run all the tests:
 * ```bash
 * npx tsx scripts/test_llm_clients.ts --execute
 * ```
 *
 * To run a single test conversation for a single provider (for each model):
 * ```bash
 * npx tsx scripts/test_llm_clients.ts --conversationIds simple-math --providers openai --execute
 * ```
 *
 * @param config The test configuration.
 * @param conversation The conversation to test.
 * @param execute Whether to execute the test.
 * @returns A promise that resolves when the test is complete.
 */
async function runTest(
  config: TestConfig,
  conversation: TestConversation,
  execute: boolean
): Promise<void> {
  const skipped = conversation.skipConfig
    ? conversation.skipConfig(config)
    : false;
  console.log(
    `- Testing ${config.provider} - ${config.modelId} - T=${config.temperature} - R=${config.reasoningEffort} - ${conversation.name}${skipped ? " [skipped]" : ""}`
  );

  if (!execute || skipped) {
    return;
  }

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
      let outputTokens: number | null = null;
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
                    // mistral only support ids of size 9
                    id: toolCallId.toString().padStart(9, "0"),
                    name: event.content.name,
                    arguments: event.content.arguments,
                  },
                },
              ],
            });
            toolCallId++;
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

      if (outputTokens === null || outputTokens === 0) {
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

makeScript(
  {
    providers: {
      type: "array",
      coerce: (arr) => arr.map(String),
      demandOption: false,
      default: [],
      description:
        "List of providers to test (e.g., anthropic, openai). If not specified, all providers will be tested.",
    },
    conversationIds: {
      type: "array",
      coerce: (arr) => arr.map(String),
      demandOption: false,
      default: [],
      description:
        "List of conversation IDs to test (e.g., simple-math, tool-usage). If not specified, all conversations will be tested.",
    },
  },
  async ({ providers, conversationIds, execute }) => {
    console.log("=== Starting LLM Client Tests ===\n");

    // Filter test configs by provider
    const filteredConfigs =
      providers.length > 0
        ? TEST_CONFIGS.filter((config) => providers.includes(config.provider))
        : TEST_CONFIGS;

    // Filter conversations by ID
    const filteredConversations =
      conversationIds.length > 0
        ? TEST_CONVERSATIONS.filter((conv) => conversationIds.includes(conv.id))
        : TEST_CONVERSATIONS;

    if (filteredConfigs.length === 0) {
      console.error(
        `No test configurations found for providers: ${providers.join(", ")}`
      );
      process.exit(1);
    }

    if (filteredConversations.length === 0) {
      console.error(
        `No conversations found with IDs: ${conversationIds.join(", ")}`
      );
      process.exit(1);
    }

    console.log(`Testing ${filteredConfigs.length} config(s)`);
    console.log(`Testing ${filteredConversations.length} conversation(s)`);
    console.log(
      `Total tests: ${filteredConfigs.length * filteredConversations.length}\n`
    );

    if (providers.length > 0) {
      console.log(`Filtering by providers: ${providers.join(", ")}`);
    }
    if (conversationIds.length > 0) {
      console.log(
        `Filtering by conversation IDs: ${conversationIds.join(", ")}`
      );
    }

    let passed = 0;
    let failed = 0;

    for (const config of filteredConfigs) {
      for (const conversation of filteredConversations) {
        try {
          await runTest(config, conversation, execute);
          passed++;
        } catch (error) {
          failed++;
          console.error(`Test failed with error:`, error);
        }
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log("=".repeat(60));

    if (failed > 0) {
      process.exit(1);
    } else {
      console.log("\nAll tests completed successfully!");
    }
  }
);
