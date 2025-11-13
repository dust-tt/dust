import { vi } from "vitest";

import type { MistralModelFamily } from "@app/lib/api/llm/clients/mistral/types";
import {
  getMistralModelFamilyFromModelId,
  MISTRAL_WHITELISTED_MODEL_IDS,
} from "@app/lib/api/llm/clients/mistral/types";
import { TEST_CONVERSATIONS } from "@app/lib/api/llm/tests/conversations";
import { LLMClientTestSuite } from "@app/lib/api/llm/tests/LLMClientTestSuite";
import type {
  ConfigParams,
  TestConfig,
  TestConversation,
} from "@app/lib/api/llm/tests/types";
import type { ModelIdType } from "@app/types/assistant/models/types";

const MISTRAL_MODEL_FAMILY_TO_TEST_CONFIGS: Record<
  MistralModelFamily,
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

// Inject Dust managed Mistral credentials for testing
vi.mock("@app/types", async (importOriginal) => {
  const actual = await importOriginal();

  return {
    // @ts-expect-error actual is unknown
    ...actual,
    dustManagedCredentials: vi.fn(() => ({
      MISTRAL_API_KEY: process.env.VITE_DUST_MANAGED_MISTRAL_API_KEY ?? "",
    })),
  };
});

class MistralTestSuite extends LLMClientTestSuite {
  protected provider = "mistral" as const;
  protected models = MISTRAL_WHITELISTED_MODEL_IDS;

  protected getTestConfig(modelId: ModelIdType): TestConfig[] {
    const family = getMistralModelFamilyFromModelId(modelId);
    return MISTRAL_MODEL_FAMILY_TO_TEST_CONFIGS[family].map((configParams) => ({
      ...configParams,
      modelId,
      provider: this.provider,
    }));
  }

  protected getSupportedConversations(
    modelId: ModelIdType
  ): TestConversation[] {
    if (modelId === "codestral-latest") {
      return TEST_CONVERSATIONS.filter(
        (conversation) => conversation.id !== "image-description"
      );
    }

    return TEST_CONVERSATIONS;
  }
}

new MistralTestSuite().generateTests();
