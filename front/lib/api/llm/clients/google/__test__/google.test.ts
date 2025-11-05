import { vi } from "vitest";

import type { GoogleModelFamily } from "@app/lib/api/llm/clients/google/types";
import {
  getGoogleModelFamilyFromModelId,
  GOOGLE_AI_STUDIO_WHITELISTED_MODEL_IDS,
} from "@app/lib/api/llm/clients/google/types";
import { TEST_CONVERSATIONS } from "@app/lib/api/llm/tests/conversations";
import { LLMClientTestSuite } from "@app/lib/api/llm/tests/LLMClientTestSuite";
import type {
  ConfigParams,
  TestConfig,
  TestConversation,
} from "@app/lib/api/llm/tests/types";
import type { ModelIdType } from "@app/types/assistant/models/types";

const GOOGLE_MODEL_FAMILY_TO_TEST_CONFIGS: Record<
  GoogleModelFamily,
  ConfigParams[]
> = {
  reasoning: [
    { reasoningEffort: "none" },
    { reasoningEffort: "light", temperature: 0 },
    { reasoningEffort: "medium", temperature: 1 },
    { reasoningEffort: "high" },
  ],
  "non-reasoning": [{ temperature: 1 }, { temperature: 0 }],
};

// Inject Dust managed Google AI Studio credentials for testing
vi.mock("@app/types", async (importOriginal) => {
  const actual = await importOriginal();

  return {
    // @ts-expect-error actual is unknown
    ...actual,
    dustManagedCredentials: vi.fn(() => ({
      GOOGLE_AI_STUDIO_API_KEY:
        process.env.VITE_DUST_MANAGED_GOOGLE_AI_STUDIO_API_KEY ?? "",
    })),
  };
});

class GoogleTestSuite extends LLMClientTestSuite {
  protected provider = "google_ai_studio" as const;
  protected models = GOOGLE_AI_STUDIO_WHITELISTED_MODEL_IDS;

  protected getTestConfig(modelId: ModelIdType): TestConfig[] {
    const family = getGoogleModelFamilyFromModelId(modelId);
    return GOOGLE_MODEL_FAMILY_TO_TEST_CONFIGS[family].map((configParams) => ({
      ...configParams,
      modelId,
      provider: this.provider,
    }));
  }

  protected getSupportedConversations(
    _modelId: ModelIdType
  ): TestConversation[] {
    // Run all conversations for all Google models
    return TEST_CONVERSATIONS;
  }
}

new GoogleTestSuite().generateTests();
