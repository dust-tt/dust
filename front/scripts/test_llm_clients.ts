import { assertNever } from "@dust-tt/sparkle";

import { AnthropicLLM } from "@app/lib/api/llm/clients/anthropic";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import type { ModelIdType, ReasoningEffort } from "@app/types";
import type { ModelConversationTypeMultiActions } from "@app/types/assistant/generation";
import {
  CLAUDE_3_5_HAIKU_20241022_MODEL_ID,
  CLAUDE_4_5_HAIKU_20251001_MODEL_ID,
  CLAUDE_4_5_SONNET_20250929_MODEL_ID,
} from "@app/types/assistant/models/anthropic";

interface TestConfig {
  provider: "anthropic";
  modelId: ModelIdType;
  temperature?: number;
  reasoningEffort?: ReasoningEffort;
}

interface TestConversation {
  name: string;
  systemPrompt: string;
  userMessage: string;
  expectedInResponse?: string;
}

function generateAnthropicThinkingTestConfigs(
  modelId: ModelIdType
): TestConfig[] {
  return [
    {
      provider: "anthropic",
      modelId: modelId,
      temperature: 0.5,
      reasoningEffort: "none",
    },
    {
      provider: "anthropic",
      modelId: modelId,
      temperature: 1,
      reasoningEffort: "light",
    },
    {
      provider: "anthropic",
      modelId: modelId,
      temperature: 0.5,
      reasoningEffort: "medium",
    },
    {
      provider: "anthropic",
      modelId: modelId,
      temperature: 1,
      reasoningEffort: "high",
    },
  ];
}

function generateAnthropicNotThinkingTestConfigs(
  modelId: ModelIdType
): TestConfig[] {
  return [
    {
      provider: "anthropic",
      modelId: modelId,
      temperature: 0.5,
    },
    {
      provider: "anthropic",
      modelId: modelId,
      temperature: 1,
    },
  ];
}

const ANTHROPIC_NOT_THINKING_MODELS = [CLAUDE_3_5_HAIKU_20241022_MODEL_ID];

const ANTHROPIC_THINKING_MODELS = [
  CLAUDE_4_5_HAIKU_20251001_MODEL_ID,
  CLAUDE_4_5_SONNET_20250929_MODEL_ID,
];

const TEST_CONFIGS: TestConfig[] = [
  ...ANTHROPIC_THINKING_MODELS.flatMap(generateAnthropicThinkingTestConfigs),
  ...ANTHROPIC_NOT_THINKING_MODELS.flatMap(
    generateAnthropicNotThinkingTestConfigs
  ),
];

const TEST_CONVERSATIONS: TestConversation[] = [
  {
    name: "Simple Math",
    systemPrompt: "You are a helpful assistant. Be concise.",
    userMessage: "What is 2*2? Just give the number.",
    expectedInResponse: "4",
  },
  {
    name: "Hello World",
    systemPrompt: "You are a helpful assistant. Be very brief.",
    userMessage: "Say hello",
    expectedInResponse: "hello",
  },
  {
    name: "Yes/No Question",
    systemPrompt: "You are a helpful assistant. Answer only yes or no.",
    userMessage: "Is Paris the capital of France?",
    expectedInResponse: "yes",
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
    let llm;
    switch (config.provider) {
      case "anthropic":
        llm = new AnthropicLLM({
          modelId: config.modelId as any,
          temperature: config.temperature,
          reasoningEffort: config.reasoningEffort,
        });
        break;
      default:
        assertNever(config.provider);
    }

    // Prepare the conversation
    const modelConversation: ModelConversationTypeMultiActions = {
      messages: [
        {
          role: "user" as const,
          name: "User",
          content: [
            {
              type: "text" as const,
              text: conversation.userMessage,
            },
          ],
        },
      ],
    };

    // Call the LLM
    const events = llm.stream({
      conversation: modelConversation,
      prompt: conversation.systemPrompt,
      specifications: [],
    });

    let responseFromDeltas = "";
    let fullResponse = "";
    let reasoningFromDeltas = "";
    let fullReasoning = "";
    let outputTokens = null;

    // Collect all events
    for await (const event of events as AsyncGenerator<LLMEvent>) {
      switch (event.type) {
        case "text_delta":
          responseFromDeltas += event.content.delta;
          break;
        case "text_generated":
          fullResponse = event.content.text;
          break;
        case "reasoning_delta":
          reasoningFromDeltas += event.content.delta;
          break;
        case "reasoning_generated":
          fullReasoning = event.content.text;
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

    // Check if expected response is present
    if (conversation.expectedInResponse) {
      if (
        !responseFromDeltas
          .toLowerCase()
          .includes(conversation.expectedInResponse.toLowerCase())
      ) {
        console.log(
          `   ⚠️ Expected "${conversation.expectedInResponse}" not found in response`
        );
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
