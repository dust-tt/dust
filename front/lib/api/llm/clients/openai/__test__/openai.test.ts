import { vi } from "vitest";

import type { OpenAIModelFamily } from "@app/lib/api/llm/clients/openai/types";
import {
  getOpenAIModelFamilyFromModelId,
  OPENAI_WHITELISTED_MODEL_IDS,
} from "@app/lib/api/llm/clients/openai/types";
import { TEST_CONVERSATIONS } from "@app/lib/api/llm/tests/conversations";
import { LLMClientTestSuite } from "@app/lib/api/llm/tests/LLMClientTestSuite";
import type {
  ConfigParams,
  TestConfig,
  TestConversation,
} from "@app/lib/api/llm/tests/types";
import type { ModelIdType } from "@app/types/assistant/models/types";

const OPENAI_MODEL_FAMILY_TO_TEST_CONFIGS: Record<
  OpenAIModelFamily,
  ConfigParams[]
> = {
  o3: [
    { reasoningEffort: "none" },
    { reasoningEffort: "light" },
    { reasoningEffort: "medium" },
    { reasoningEffort: "high" },
  ],
  reasoning: [
    { reasoningEffort: "none" },
    { reasoningEffort: "light", temperature: 0 },
    { reasoningEffort: "medium", temperature: 1 },
    { reasoningEffort: "high" },
  ],
  "non-reasoning": [{ temperature: 1 }, { temperature: 0 }],
};

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
    })),
  };
});

class OpenAiTestSuite extends LLMClientTestSuite {
  protected provider = "openai" as const;
  protected models = OPENAI_WHITELISTED_MODEL_IDS;

  protected getTestConfig(modelId: ModelIdType): TestConfig[] {
    const family = getOpenAIModelFamilyFromModelId(modelId);
    return OPENAI_MODEL_FAMILY_TO_TEST_CONFIGS[family].map((configParams) => ({
      ...configParams,
      modelId,
      provider: this.provider,
    }));
  }

  protected getSupportedConversations(
    _modelId: ModelIdType
  ): TestConversation[] {
    // Run all conversations for all OpenAI models
    return TEST_CONVERSATIONS;
  }
}

new OpenAiTestSuite().generateTests();
