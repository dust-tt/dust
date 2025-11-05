import { vi } from "vitest";

import type { AnthropicModelFamily } from "@app/lib/api/llm/clients/anthropic/types";
import {
  ANTHROPIC_WHITELISTED_MODEL_IDS,
  getAnthropicModelFamilyFromModelId,
} from "@app/lib/api/llm/clients/anthropic/types";
import { TEST_CONVERSATIONS } from "@app/lib/api/llm/tests/conversations";
import { LLMClientTestSuite } from "@app/lib/api/llm/tests/LLMClientTestSuite";
import type {
  ConfigParams,
  TestConfig,
  TestConversation,
} from "@app/lib/api/llm/tests/types";
import type { ModelIdType } from "@app/types/assistant/models/types";

const ANTHROPIC_MODEL_FAMILY_TO_TEST_CONFIGS: Record<
  AnthropicModelFamily,
  ConfigParams[]
> = {
  reasoning: [
    { reasoningEffort: "none" },
    { reasoningEffort: "light" },
    { reasoningEffort: "medium" },
    { reasoningEffort: "high" },
  ],
  "non-reasoning": [{ temperature: 1 }, { temperature: 0.25 }],
};

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

// Inject Dust managed Anthropic credentials for testing
vi.mock("@app/types", async (importOriginal) => {
  const actual = await importOriginal();

  return {
    // @ts-expect-error actual is unknown
    ...actual,
    dustManagedCredentials: vi.fn(() => ({
      ANTHROPIC_API_KEY: process.env.VITE_DUST_MANAGED_ANTHROPIC_API_KEY ?? "",
    })),
  };
});

/**
 * Anthropic LLM Client Test Suite.
 *
 * This is run conditionnally if the VITE_RUN_LLM_TESTS environment variable is set to "true".
 *
 * Run it with:
 * ```
 * VITE_RUN_LLM_TESTS=true NODE_ENV=test VITE_DUST_MANAGED_OPENAI_API_KEY=$DUST_MANAGED_OPENAI_API_KEY npm run test -- __test__/openai.test.ts
 * ```
 */
class AnthropicTestSuite extends LLMClientTestSuite {
  protected provider = "anthropic" as const;
  protected models = ANTHROPIC_WHITELISTED_MODEL_IDS;

  protected getTestConfig(modelId: ModelIdType): TestConfig[] {
    const family = getAnthropicModelFamilyFromModelId(modelId);
    return ANTHROPIC_MODEL_FAMILY_TO_TEST_CONFIGS[family].map(
      (configParams) => ({
        ...configParams,
        modelId,
        provider: this.provider,
      })
    );
  }

  protected getSupportedConversations(
    _modelId: ModelIdType
  ): TestConversation[] {
    return TEST_CONVERSATIONS;
  }
}

new AnthropicTestSuite().generateTests();
