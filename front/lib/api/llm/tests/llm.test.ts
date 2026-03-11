import type { ConversationId } from "@app/lib/api/llm/tests/conversations";
import {
  ALL_CONVERSATION_IDS,
  isConversationId,
  runConversation,
  TEST_CONVERSATIONS,
  TEST_STRUCTURED_OUTPUT_CONVERSATIONS,
  TEST_VISION_CONVERSATIONS,
} from "@app/lib/api/llm/tests/conversations";
import { MODELS } from "@app/lib/api/llm/tests/models";
import type {
  RunnabletestConversation as RunnableTestConversation,
  TestConfig,
  TestConversation,
} from "@app/lib/api/llm/tests/types";
import { getSupportedModelConfig } from "@app/lib/llms/model_configurations";
import { isModelProviderId } from "@app/types/assistant/models/providers";
import type {
  ModelIdType,
  ModelProviderIdType,
} from "@app/types/assistant/models/types";
import assert from "assert";
import clone from "lodash/clone";
import { describe, it, vi } from "vitest";

const TIMEOUT_MS = 60 * 1000; // 60 seconds

// Mock the openai module to inject dangerouslyAllowBrowser: true
vi.mock("openai", async (importOriginal) => {
  const actual = await importOriginal();
  // @ts-expect-error actual is unknown
  const OriginalOpenAI = actual.OpenAI;

  class OpenAIWithBrowserSupport extends OriginalOpenAI {
    constructor(config: ConstructorParameters<typeof OriginalOpenAI>[0]) {
      super({
        ...config,
        dangerouslyAllowBrowser: true,
      });
    }
  }

  return {
    // @ts-expect-error actual is unknown
    ...actual,
    OpenAI: OpenAIWithBrowserSupport,
  };
});

// Mock the @anthropic-ai/sdk module to inject dangerouslyAllowBrowser: true
vi.mock("@anthropic-ai/sdk", async (importOriginal) => {
  const actual = await importOriginal();
  // @ts-expect-error actual is unknown
  const OriginalAnthropic = actual.default;

  class AnthropicWithBrowserSupport extends OriginalAnthropic {
    constructor(config: ConstructorParameters<typeof OriginalAnthropic>[0]) {
      super({
        ...config,
        dangerouslyAllowBrowser: true,
      });
    }
  }

  return {
    // @ts-expect-error actual is unknown
    ...actual,
    default: AnthropicWithBrowserSupport,
  };
});

// Read configuration from environment variables (set in vite.config.js)
const FILTER_CONVERSATION_IDS: ConversationId[] = process.env
  .FILTER_CONVERSATION_IDS
  ? process.env.FILTER_CONVERSATION_IDS.split(",").map((id) => {
      if (!isConversationId(id)) {
        throw new Error(
          `Invalid conversation ID in FILTER_CONVERSATION_IDS: ${id}, Ids are ${JSON.stringify(ALL_CONVERSATION_IDS)}`
        );
      }
      return id;
    })
  : [];
const RUN_ALL_MODEL_TESTS = process.env.RUN_ALL_MODEL_TESTS === "true";

function getSupportedConversations({
  modelId,
  providerId,
}: {
  modelId: ModelIdType;
  providerId: ModelProviderIdType;
}): TestConversation[] {
  const conversationsToTest: TestConversation[] = clone(TEST_CONVERSATIONS);
  const modelConfig = getSupportedModelConfig({
    modelId,
    providerId,
  });
  assert(modelConfig, `Model config not found for ${providerId} / ${modelId}`);

  if (modelConfig.supportsVision) {
    conversationsToTest.push(...TEST_VISION_CONVERSATIONS);
  }
  if (modelConfig.supportsResponseFormat) {
    conversationsToTest.push(...TEST_STRUCTURED_OUTPUT_CONVERSATIONS);
  }

  if (FILTER_CONVERSATION_IDS.length > 0) {
    return conversationsToTest.filter((conversation) =>
      FILTER_CONVERSATION_IDS.some((id) => id === conversation.id)
    );
  }
  return conversationsToTest;
}

function getConversationsToRun({
  modelId,
  providerId,
}: {
  modelId: ModelIdType;
  providerId: ModelProviderIdType;
}): RunnableTestConversation[] {
  const conversationsToTest = getSupportedConversations({
    modelId,
    providerId,
  });

  return conversationsToTest.map((conversation) => ({
    name: conversation.name,
    configs: conversation.configs ?? [{}],
    run: async (config: TestConfig) => {
      await runConversation(conversation, config);
    },
  }));
}

const modelsToTest = Object.entries(MODELS)
  .filter(([, config]) => config.runTest || RUN_ALL_MODEL_TESTS)
  .map(([modelId, config]) => ({
    modelId,
    ...config,
  }));

/**
 * LLM Integration Tests
 *
 * To run these tests from the front directory:
 *
 * 1. Skip tests (default):
 *    npx vitest --config lib/api/llm/tests/vite.config.js lib/api/llm/tests/llm.test.ts --run
 *
 * 2. Run tests (requires API keys):
 *    RUN_LLM_TEST=true npx vitest --config lib/api/llm/tests/vite.config.js lib/api/llm/tests/llm.test.ts --run
 *
 * Some additional env variables can be set to filter the tests:
 * - FILTER_CONVERSATION_IDS: Comma-separated list of conversation IDs to run (e.g., "simple-math,image-description")
 * - RUN_ALL_MODEL_TESTS: Set to "true" to run tests for all models, regardless of their individual runTest settings.
 */
describe.skipIf(
  process.env.RUN_LLM_TEST !== "true" || modelsToTest.length === 0
)("LLM Integration Tests", () => {
  describe.each(modelsToTest)("$providerId / $modelId", ({
    modelId,
    providerId,
  }) => {
    if (!isModelProviderId(providerId)) {
      throw new Error(`Invalid providerId: ${providerId}`);
    }
    describe.concurrent.each(
      getConversationsToRun({
        modelId: modelId as ModelIdType,
        providerId,
      })
    )("should handle: $name", (conversation) => {
      it.concurrent.each(conversation.configs)(
        "temperature: $temperature, reasoningEffort: $reasoningEffort, testStructuredOutputKey: $testStructuredOutputKey",
        async (config) => {
          await conversation.run({
            modelId: modelId as ModelIdType,
            provider: providerId,
            ...config,
          });
        },
        TIMEOUT_MS
      );
    });
  });
});
