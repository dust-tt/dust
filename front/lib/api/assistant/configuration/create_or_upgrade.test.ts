import { createOrUpgradeAgentConfiguration } from "@app/lib/api/assistant/configuration/create_or_upgrade";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { AgentConfigurationAssistantPayload } from "@app/types/api/agent_configuration";
import type { ModelIdType } from "@app/types/assistant/models/types";
import { describe, expect, it, vi } from "vitest";

const CUSTOM_MODEL_ID = vi.hoisted(() => "custom-model-for-agent-save-test");

vi.mock("@app/types/assistant/models/custom_models.generated", async () => {
  const { GEMINI_3_8_FLASH_MODEL_CONFIG } = await vi.importActual<
    typeof import("@app/types/assistant/models/google_ai_studio")
  >("@app/types/assistant/models/google_ai_studio");

  return {
    CUSTOM_MODELS: [],
    CUSTOM_MODEL_CONFIGS: [
      {
        ...GEMINI_3_8_FLASH_MODEL_CONFIG,
        modelId: CUSTOM_MODEL_ID,
        availableIfOneOf: { featureFlag: "custom_model_feature" },
      },
    ],
    CUSTOM_MODEL_IDS: [CUSTOM_MODEL_ID],
  };
});

function agentBody(modelId: ModelIdType): AgentConfigurationAssistantPayload {
  return {
    name: "custom-model-save-test",
    description: "Agent save test.",
    instructions: "Be helpful.",
    pictureUrl: "https://dust.tt/static/systemavatar/dust_avatar_full.png",
    status: "active",
    scope: "hidden",
    model: {
      providerId: "google_ai_studio",
      modelId,
      temperature: 0.7,
      reasoningEffort: "medium",
    },
    actions: [],
    skills: [],
    tags: [],
    editors: [],
  };
}

describe("createOrUpgradeAgentConfiguration", () => {
  it("rejects a custom model, even for a workspace with its flag", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    await FeatureFlagFactory.basic(authenticator, "custom_model_feature");

    const res = await createOrUpgradeAgentConfiguration({
      auth: authenticator,
      // Unsafe cast: custom ids only enter `ModelIdType` through the generated file.
      assistant: agentBody(CUSTOM_MODEL_ID as ModelIdType),
    });

    expect(res.isErr()).toBe(true);
  });

  it("saves an agent on a static model", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });

    const res = await createOrUpgradeAgentConfiguration({
      auth: authenticator,
      assistant: agentBody("gemini-3.8-flash"),
    });

    expect(res.isOk()).toBe(true);
  });
});
