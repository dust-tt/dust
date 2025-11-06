import { vi } from "vitest";

import type { FireworksModelFamily } from "@app/lib/api/llm/clients/fireworks/types";
import {
  FIREWORKS_MODEL_FAMILY_CONFIGS,
  getFireworksModelFamilyFromModelId,
} from "@app/lib/api/llm/clients/fireworks/types";
import {
  TEST_CONVERSATIONS,
  TEST_STRUCTURED_OUTPUT_CONVERSATIONS,
} from "@app/lib/api/llm/tests/conversations";
import { LLMClientTestSuite } from "@app/lib/api/llm/tests/LLMClientTestSuite";
import { TEST_STRUCTURED_OUTPUT_KEYS } from "@app/lib/api/llm/tests/schemas";
import type {
  ConfigParams,
  TestConfig,
  TestConversation,
} from "@app/lib/api/llm/tests/types";
import type { ModelIdType } from "@app/types/assistant/models/types";

const FIREWORKS_MODEL_FAMILY_TO_TEST_CONFIGS: Record<
  FireworksModelFamily,
  ConfigParams[]
> = {
  kimi: [
    { temperature: 0.25 },
    { temperature: 1 },
    ...TEST_STRUCTURED_OUTPUT_KEYS.map((testStructuredOutputKey) => ({
      testStructuredOutputKey,
    })),
  ],
};

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
    // @ts-expect-error actual is unknown.
    ...actual,
    default: OpenAIWithBrowserSupport,
    OpenAI: OpenAIWithBrowserSupport,
  };
});

// Inject Dust managed Fireworks credentials for testing.
vi.mock("@app/types", async (importOriginal) => {
  const actual = await importOriginal();

  return {
    // @ts-expect-error actual is unknown.
    ...actual,
    dustManagedCredentials: vi.fn(() => ({
      FIREWORKS_API_KEY: process.env.VITE_DUST_MANAGED_FIREWORKS_API_KEY ?? "",
    })),
  };
});

/**
 * Fireworks LLM Client Test Suite.
 *
 * This is run conditionnally if the VITE_RUN_LLM_TESTS environment variable is set to "true".
 *
 * Run it with:
 * ```
 * VITE_RUN_LLM_TESTS=true NODE_ENV=test VITE_DUST_MANAGED_FIREWORKS_API_KEY=$DUST_MANAGED_FIREWORKS_API_KEY npm run test -- __test__/fireworks.test.ts
 * ```
 */
class FireworksTestSuite extends LLMClientTestSuite {
  protected provider = "fireworks" as const;
  protected models = Object.values(FIREWORKS_MODEL_FAMILY_CONFIGS).flatMap(
    (config) => config.modelIds
  );

  protected getTestConfig(modelId: ModelIdType): TestConfig[] {
    const family = getFireworksModelFamilyFromModelId(modelId);
    return FIREWORKS_MODEL_FAMILY_TO_TEST_CONFIGS[family].map(
      (configParams) => ({
        ...configParams,
        modelId,
        provider: this.provider,
      })
    );
  }

  protected getSupportedConversations(
    _modelId: ModelIdType,
    config: TestConfig
  ): TestConversation[] {
    if (config.testStructuredOutputKey) {
      // Only use specific conversation for structured output config
      return TEST_STRUCTURED_OUTPUT_CONVERSATIONS.filter(
        (conversation) => conversation.id === config.testStructuredOutputKey
      );
    }

    // All Fireworks models don't support vision, so filter out image conversations
    return TEST_CONVERSATIONS.filter(
      (conversation) => conversation.id !== "image-description"
    );
  }
}

new FireworksTestSuite().generateTests();
