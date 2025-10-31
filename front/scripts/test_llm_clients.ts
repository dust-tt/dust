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

type ResponseChecker = {
  type: "text_contains";
  substring: string;
} | null;

interface TestConversation {
  name: string;
  systemPrompt: string;
  conversationActions: ModelConversationTypeMultiActions[];
  /** Array of response checkers aligned with the conversation actions */
  expectedInResponses: ResponseChecker[];
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

function containsTextChecker(substring: string): ResponseChecker {
  return {
    type: "text_contains",
    substring,
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
        specifications: [],
      });

      if (eventStreamResult.isErr()) {
        throw eventStreamResult.error;
      }

      const events = eventStreamResult.value;

      let responseFromDeltas = "";
      let fullResponse = "";
      let reasoningFromDeltas = "";
      let fullReasoning = "";
      let outputTokens = null;

      // Collect all events
      for await (const event of events) {
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
            // Do not include thinking at the moment as we don't have the correct signature for it
            // TODO(llm_router): fix this when we have the correct signature
            break;
          case "token_usage":
            outputTokens = event.content.outputTokens;
            break;
          case "error":
            throw new Error(`LLM Error: ${event.content.message}`);
        }
      }

      if (fullResponse !== responseFromDeltas) {
        console.log(
          `   ⚠️ Mismatch between response from deltas and full response.\nDeltas: "${responseFromDeltas}"\nFull: "${fullResponse}"`
        );
      }

      if (
        config.reasoningEffort &&
        config.reasoningEffort !== "none" &&
        fullReasoning === ""
      ) {
        console.log(`   ⚠️ Expected reasoning but none was generated.`);
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
