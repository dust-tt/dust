import { vi } from "vitest";

import type {
  ModelConfig,
  OpenAIModelFamily,
  OpenAIWhitelistedModelId,
} from "@app/lib/api/llm/clients/openai/types";
import { OPENAI_MODEL_FAMILY_CONFIGS } from "@app/lib/api/llm/clients/openai/types";
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

const OPENAI_MODEL_FAMILY_TO_TEST_CONFIGS: Record<
  OpenAIModelFamily,
  ConfigParams[]
> = {
  o3: [
    { reasoningEffort: "medium" },
    { reasoningEffort: "high" },
    ...TEST_STRUCTURED_OUTPUT_KEYS.map((testStructuredOutputKey) => ({
      testStructuredOutputKey,
    })),
  ],
  "o3-no-vision": [{ reasoningEffort: "medium" }, { reasoningEffort: "high" }],
  reasoning: [
    { reasoningEffort: "medium", temperature: 1 },
    { reasoningEffort: "high" },
  ],
  "gpt-5": [
    { reasoningEffort: "none" },
    { reasoningEffort: "light", temperature: 0 },
    { reasoningEffort: "medium", temperature: 1 },
    { reasoningEffort: "high" },
  ],
  "gpt-5.1": [
    { reasoningEffort: "none" },
    { reasoningEffort: "light", temperature: 0 },
    { reasoningEffort: "medium", temperature: 1 },
    { reasoningEffort: "high" },
  ],
  "non-reasoning": [{ temperature: 1 }, { temperature: 0 }],
  "no-vision": [{ temperature: 1 }, { temperature: 0 }],
};

const NO_VISION_FAMILIES: OpenAIModelFamily[] = ["no-vision", "o3-no-vision"];

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

// Inject Dust managed OpenAI credentials for testing
vi.mock("@app/types", async (importOriginal) => {
  const actual = await importOriginal();

  return {
    // @ts-expect-error actual is unknown
    ...actual,
    dustManagedCredentials: vi.fn(() => ({
      OPENAI_API_KEY: process.env.VITE_DUST_MANAGED_OPENAI_API_KEY ?? "",
      OPENAI_BASE_URL: "https://api.openai.com/v1",
      DUST_REGION: "us-central1",
    })),
  };
});

// Inject Region
vi.mock("@app/lib/api/regions/config", async (importOriginal) => {
  const actual = await importOriginal();

  return {
    // @ts-expect-error actual is unknown
    ...actual,
    config: {
      // @ts-expect-error importOriginal does not preserve types
      ...actual.config,
      getCurrentRegion: vi.fn(() => ({
        DUST_REGION: "us-central1",
      })),
    },
  };
});

function getOpenAIModelFamilyFromModelId(
  modelId: OpenAIWhitelistedModelId
): OpenAIModelFamily {
  const family = Object.entries(OPENAI_MODEL_FAMILY_CONFIGS).find(
    ([_family, config]: [string, ModelConfig]) =>
      config.modelIds.includes(modelId)
  )?.[0];
  if (!family) {
    throw new Error(
      `Model ID ${modelId} does not belong to any OpenAI model family`
    );
  }
  return family as OpenAIModelFamily;
}

/**
 * Open AI LLM Client Test Suite.
 *
 * This is run conditionnally if the VITE_RUN_LLM_TESTS environment variable is set to "true".
 *
 * Run it with:
 * ```
 * VITE_RUN_LLM_TESTS=true NODE_ENV=test VITE_DUST_MANAGED_OPENAI_API_KEY=$DUST_MANAGED_OPENAI_API_KEY npm run test -- __test__/openai.test.ts
 * ```
 */
class OpenAiTestSuite extends LLMClientTestSuite {
  protected provider = "openai" as const;
  // The models to test
  protected models = [];

  protected getTestConfig(modelId: OpenAIWhitelistedModelId): TestConfig[] {
    const family = getOpenAIModelFamilyFromModelId(modelId);

    return OPENAI_MODEL_FAMILY_TO_TEST_CONFIGS[family].map((configParams) => ({
      ...configParams,
      modelId,
      provider: this.provider,
    }));
  }

  protected getSupportedConversations(
    _modelId: OpenAIWhitelistedModelId,
    config: TestConfig
  ): TestConversation[] {
    const family = getOpenAIModelFamilyFromModelId(_modelId);
    if (NO_VISION_FAMILIES.includes(family)) {
      // Filter out conversations that require vision capabilities
      return TEST_CONVERSATIONS.filter(
        (conversation) => conversation.id !== "image-description"
      );
    }

    if (config.testStructuredOutputKey) {
      // Only use specific conversation for structured output config
      return TEST_STRUCTURED_OUTPUT_CONVERSATIONS.filter(
        (conversation) => conversation.id === config.testStructuredOutputKey
      );
    }

    return TEST_CONVERSATIONS;
  }
}

new OpenAiTestSuite().generateTests();
