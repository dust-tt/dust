import { vi } from "vitest";

import type { XaiModelFamily } from "@app/lib/api/llm/clients/xai/types";
import {
  getXaiModelFamilyFromModelId,
  XAI_WHITELISTED_MODEL_IDS,
} from "@app/lib/api/llm/clients/xai/types";
import { TEST_CONVERSATIONS } from "@app/lib/api/llm/tests/conversations";
import { LLMClientTestSuite } from "@app/lib/api/llm/tests/LLMClientTestSuite";
import type {
  ConfigParams,
  TestConfig,
  TestConversation,
} from "@app/lib/api/llm/tests/types";
import type { ModelIdType } from "@app/types/assistant/models/types";

const XAI_MODEL_FAMILY_TO_TEST_CONFIGS: Record<XaiModelFamily, ConfigParams[]> =
  {
    reasoning: [
      { reasoningEffort: "none" },
      { reasoningEffort: "light" },
      { reasoningEffort: "medium" },
      { reasoningEffort: "high" },
    ],
    "non-reasoning": [{ temperature: 1 }, { temperature: 0.25 }],
    "no-vision": [{ temperature: 1 }, { temperature: 0.25 }],
  };

// Mock the openai module to inject dangerouslyAllowBrowser: true in the client
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
    default: OpenAIWithBrowserSupport,
    OpenAI: OpenAIWithBrowserSupport,
  };
});

// Inject Dust managed XAI credentials for testing
vi.mock("@app/types", async (importOriginal) => {
  const actual = await importOriginal();

  return {
    // @ts-expect-error actual is unknown
    ...actual,
    dustManagedCredentials: vi.fn(() => ({
      XAI_API_KEY: process.env.VITE_DUST_MANAGED_XAI_API_KEY ?? "",
    })),
  };
});

/**
 * XAI LLM Client Test Suite.
 *
 * This is run conditionnally if the VITE_RUN_LLM_TESTS environment variable is set to "true".
 *
 * Run it with:
 * ```
 * VITE_RUN_LLM_TESTS=true NODE_ENV=test VITE_DUST_MANAGED_XAI_API_KEY=$DUST_MANAGED_XAI_API_KEY npm run test -- __test__/xai.test.ts
 * ```
 */
class XaiTestSuite extends LLMClientTestSuite {
  protected provider = "xai" as const;
  protected models = XAI_WHITELISTED_MODEL_IDS;

  protected getTestConfig(modelId: ModelIdType): TestConfig[] {
    const family = getXaiModelFamilyFromModelId(modelId);
    return XAI_MODEL_FAMILY_TO_TEST_CONFIGS[family].map((configParams) => ({
      ...configParams,
      modelId,
      provider: this.provider,
    }));
  }

  protected getSupportedConversations(
    modelId: ModelIdType
  ): TestConversation[] {
    const family = getXaiModelFamilyFromModelId(modelId);

    // Filter out image conversations for "no-vision" family
    if (family === "no-vision") {
      return TEST_CONVERSATIONS.filter(
        (conversation) => conversation.id !== "image-description"
      );
    }

    return TEST_CONVERSATIONS;
  }
}

new XaiTestSuite().generateTests();
