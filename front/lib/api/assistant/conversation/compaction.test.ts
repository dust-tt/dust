import { compactConversation } from "@app/lib/api/assistant/conversation/compaction";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { ModelIdType } from "@app/types/assistant/models/types";
import { describe, expect, it, vi } from "vitest";

const CUSTOM_MODEL_ID = vi.hoisted(() => "custom-model-for-compaction-test");

vi.mock("@app/types/assistant/models/custom_models.generated", () => ({
  CUSTOM_MODELS: [],
  CUSTOM_MODEL_CONFIGS: [],
  CUSTOM_MODEL_IDS: [CUSTOM_MODEL_ID],
}));

describe("compactConversation", () => {
  it("rejects a custom model for a workspace without the custom model flag", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [],
    });

    const res = await compactConversation(authenticator, {
      conversation,
      // Unsafe cast: custom ids only enter `ModelIdType` through the generated file.
      model: {
        providerId: "anthropic",
        modelId: CUSTOM_MODEL_ID as ModelIdType,
      },
    });

    expect(res.isErr() && res.error.status_code).toBe(400);
  });
});
